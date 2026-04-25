#!/usr/bin/env node

/**
 * MCP Server for Sicoob — Brazil's largest cooperative bank network.
 *
 * Sicoob (Sistema de Cooperativas de Crédito do Brasil) is consistently
 * top-4 in Pix volume nationwide. This server exposes the three product
 * families published on developers.sicoob.com.br:
 *
 *   Pix       — immediate cob, due-date cobv, DICT key management
 *   Cobrança  — boleto lifecycle (create, query, cancel)
 *   SPB       — account balance / cash management
 *
 * Tools (13):
 *   get_oauth_token        — mint/return a cached OAuth bearer (exposed for inspection)
 *   create_pix_cob         — create an immediate Pix charge (cob) + QR
 *   get_pix_cob            — retrieve an immediate Pix charge by txid
 *   list_pix_cob           — list immediate Pix charges within a date range
 *   create_pix_cobv        — create a Pix charge with due date (cobv)
 *   get_pix_cobv           — retrieve a due-date Pix charge
 *   lookup_dict_key        — resolve a DICT key (CPF, CNPJ, email, phone, EVP) to account data
 *   register_dict_key      — register a DICT key on a Sicoob account
 *   delete_dict_key        — delete a DICT key
 *   create_boleto          — issue a boleto via Sicoob Cobrança
 *   get_boleto             — retrieve a boleto by id / nosso_numero
 *   cancel_boleto          — cancel (baixa) an outstanding boleto
 *   get_account_balance    — query the merchant account balance
 *
 * Authentication
 *   OAuth 2.0 client_credentials + mandatory mTLS. BACEN requires mTLS for
 *   Pix v2, and Sicoob's Developers Portal enforces it across product families.
 *   This server loads the client cert + key from disk (paths via env) and
 *   routes all HTTPS requests through a Node https.Agent that presents them.
 *
 * Version: 0.1.0-alpha.1
 *   Sicoob's developers.sicoob.com.br is gated by cooperative onboarding —
 *   full OpenAPI specs are only visible to onboarded merchants. Endpoint paths
 *   below are best-guess based on (a) BACEN Pix v2 standard paths,
 *   (b) Sicoob public documentation snippets, and (c) conventions shared
 *   with peers (Itaú, Bradesco, BB). Every path that has not been
 *   byte-verified is marked TODO(verify). Consumers should treat 0.1.x as
 *   alpha and pin to exact versions.
 *
 * Environment
 *   SICOOB_CLIENT_ID      OAuth client id
 *   SICOOB_CLIENT_SECRET  OAuth client secret
 *   SICOOB_CERT_PATH      path to mTLS client cert (.crt/.pem)
 *   SICOOB_KEY_PATH       path to mTLS private key (.key/.pem)
 *   SICOOB_ENV            "sandbox" | "production" (default: sandbox)
 *
 * Docs: https://developers.sicoob.com.br
 */

import { readFileSync } from "node:fs";
import { Agent as HttpsAgent } from "node:https";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.SICOOB_CLIENT_ID || "";
const CLIENT_SECRET = process.env.SICOOB_CLIENT_SECRET || "";
const CERT_PATH = process.env.SICOOB_CERT_PATH || "";
const KEY_PATH = process.env.SICOOB_KEY_PATH || "";
const SICOOB_ENV = (process.env.SICOOB_ENV || "sandbox").toLowerCase();

// TODO(verify): sandbox base URL. Sicoob publishes a separate sandbox host
// to onboarded cooperatives; the exact subdomain is contract-gated. The
// production hostname commonly seen in Sicoob's public materials is
// api.sicoob.com.br; sandbox.sicoob.com.br is a reasonable guess.
const BASE_URL = SICOOB_ENV === "production"
  ? "https://api.sicoob.com.br"
  : "https://sandbox.sicoob.com.br";

// Lazy-load the mTLS agent so `--help` / schema introspection doesn't crash
// when certs are missing. Banking ops that actually hit the wire will fail
// loudly with a clear message if certs are unset.
let mtlsAgent: HttpsAgent | null = null;
function getMtlsAgent(): HttpsAgent {
  if (mtlsAgent) return mtlsAgent;
  if (!CERT_PATH || !KEY_PATH) {
    throw new Error(
      "Sicoob mTLS certificates are required. Set SICOOB_CERT_PATH and SICOOB_KEY_PATH " +
      "to the client cert and private-key files issued by Sicoob's Developers Portal."
    );
  }
  mtlsAgent = new HttpsAgent({
    cert: readFileSync(CERT_PATH),
    key: readFileSync(KEY_PATH),
    keepAlive: true,
  });
  return mtlsAgent;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }
  // TODO(verify): token path. Sicoob commonly exposes /auth/oauth/v2/token
  // for client_credentials. Basic auth header is accepted in sandbox.
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetchWithMtls(`${BASE_URL}/auth/oauth/v2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Sicoob OAuth ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

// Node's global fetch honours a Dispatcher via the `dispatcher` option, but
// the ergonomic cross-runtime path is to pass an https.Agent through the
// undocumented `agent` field. On Node 20+ with undici this is ignored, so we
// fall back to node:https manually when mTLS is required.
async function fetchWithMtls(
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string }
): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<unknown> }> {
  const agent = getMtlsAgent();
  const { request } = await import("node:https");
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = request(
      {
        agent,
        method: init.method,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: init.headers ?? {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text: async () => buf.toString("utf8"),
            json: async () => JSON.parse(buf.toString("utf8")),
          });
        });
      }
    );
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

async function sicoobRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetchWithMtls(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "client_id": CLIENT_ID,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Sicoob API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-sicoob", version: "0.1.0-alpha.2" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_oauth_token",
      description: "Mint or return a cached OAuth2 client_credentials bearer token for the Sicoob Developers Portal. Exposed so agents can inspect token freshness; normal tool calls obtain tokens implicitly.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_pix_cob",
      description: "Create an immediate Pix charge (cob) with QR code. Returns the txid, copy-paste EMV payload, and location URL.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Amount in BRL major units, e.g. '99.90'" },
          payer: {
            type: "object",
            description: "Payer identification (optional for cob)",
            properties: {
              document: { type: "string", description: "CPF or CNPJ digits only" },
              name: { type: "string" },
            },
          },
          expires_in: { type: "number", description: "QR lifetime in seconds (default 3600)" },
          description: { type: "string", description: "Payer-visible description (solicitacaoPagador)" },
          additional_info: { type: "array", description: "Optional free-text key/value info shown to the payer", items: { type: "object" } },
          txid: { type: "string", description: "Optional merchant-supplied txid (26-35 alphanumeric chars). Omit to have Sicoob assign one." },
        },
        required: ["amount"],
      },
    },
    {
      name: "get_pix_cob",
      description: "Retrieve an immediate Pix charge by its txid.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Pix charge txid (26-35 alphanumeric chars)" },
        },
        required: ["txid"],
      },
    },
    {
      name: "list_pix_cob",
      description: "List immediate Pix charges (cob) registered by the merchant within a date range. Paginated per BACEN Pix v2.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date-time ISO-8601 (inicio)" },
          to: { type: "string", description: "End date-time ISO-8601 (fim)" },
          status: { type: "string", description: "Optional status filter: ATIVA | CONCLUIDA | REMOVIDA_PELO_USUARIO_RECEBEDOR | REMOVIDA_PELO_PSP" },
          cpf: { type: "string", description: "Optional payer CPF filter (digits only)" },
          cnpj: { type: "string", description: "Optional payer CNPJ filter (digits only)" },
          page: { type: "number", description: "Page number (paginacao.paginaAtual)" },
          page_size: { type: "number", description: "Items per page (paginacao.itensPorPagina)" },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "create_pix_cobv",
      description: "Create a Pix charge with due date (cobv) — boleto-like Pix payable on or after a due date with optional fine/interest/discount. Returns txid, copy-paste EMV payload, and location URL.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Original amount in BRL major units, e.g. '250.00'" },
          due_date: { type: "string", description: "Due date ISO-8601 (YYYY-MM-DD)" },
          validity_after_due_days: { type: "number", description: "Days after due date the Pix remains payable (default 30)" },
          payer: {
            type: "object",
            description: "Payer identification (required for cobv)",
            properties: {
              document: { type: "string", description: "CPF or CNPJ digits only" },
              name: { type: "string" },
              address: {
                type: "object",
                properties: {
                  street: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string", description: "2-letter UF code" },
                  postal_code: { type: "string", description: "CEP digits only" },
                },
              },
            },
            required: ["document", "name"],
          },
          description: { type: "string", description: "Payer-visible description" },
          fine: { type: "object", description: "Multa after due date: { percentage?, amount? }" },
          interest: { type: "object", description: "Juros (daily) after due date: { percentage?, amount? }" },
          discount: { type: "object", description: "Desconto up to due date: { percentage?, amount? }" },
          txid: { type: "string", description: "Optional merchant-supplied txid (26-35 alphanumeric chars)" },
        },
        required: ["amount", "due_date", "payer"],
      },
    },
    {
      name: "get_pix_cobv",
      description: "Retrieve a due-date Pix charge (cobv) by its txid.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Pix charge txid" },
        },
        required: ["txid"],
      },
    },
    {
      name: "lookup_dict_key",
      description: "Resolve a DICT key (CPF, CNPJ, email, phone, EVP) to the owner's account data before sending a Pix. Subject to BCB rate limits per consenting payer.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "DICT key — CPF, CNPJ, email, phone (+55...), or EVP UUID" },
          payer_document: { type: "string", description: "Cooperative member / end-payer CPF/CNPJ for BCB audit logging" },
        },
        required: ["key"],
      },
    },
    {
      name: "register_dict_key",
      description: "Register a DICT key (CPF, CNPJ, email, phone, or EVP) on a Sicoob account owned by the cooperative member. Subject to BCB validation flows (e.g. email/SMS confirmation for email/phone keys).",
      inputSchema: {
        type: "object",
        properties: {
          key_type: { type: "string", description: "DICT key type: CPF | CNPJ | EMAIL | PHONE | EVP" },
          key: { type: "string", description: "The key value. Omit for EVP (Sicoob generates the UUID)." },
          account: {
            type: "object",
            description: "Account to bind the key to",
            properties: {
              branch: { type: "string", description: "Agência" },
              account: { type: "string", description: "Conta" },
              account_type: { type: "string", description: "CACC (checking) | SVGS (savings) | SLRY (payroll) | TRAN (payment account)" },
            },
            required: ["branch", "account", "account_type"],
          },
        },
        required: ["key_type", "account"],
      },
    },
    {
      name: "delete_dict_key",
      description: "Delete a DICT key owned by the cooperative member. Irreversible — the key becomes available for re-registration by any PSP after BCB lockout window.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "DICT key value to delete" },
        },
        required: ["key"],
      },
    },
    {
      name: "create_boleto",
      description: "Issue a boleto via Sicoob Cobrança. Returns nosso_numero, linha_digitável, barcode, and PDF URL.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Amount in BRL major units, e.g. '150.00'" },
          due_date: { type: "string", description: "Due date ISO-8601 (YYYY-MM-DD)" },
          payer: {
            type: "object",
            description: "Payer (sacado) data",
            properties: {
              name: { type: "string" },
              document: { type: "string", description: "CPF or CNPJ digits only" },
              address: {
                type: "object",
                properties: {
                  street: { type: "string" },
                  number: { type: "string" },
                  complement: { type: "string" },
                  district: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string", description: "2-letter UF code" },
                  postal_code: { type: "string", description: "CEP digits only" },
                },
              },
            },
            required: ["name", "document"],
          },
          our_number: { type: "string", description: "Nosso_numero. Omit to have Sicoob assign one." },
          contract_number: { type: "string", description: "Sicoob cobrança contract number (numeroContrato) issued at onboarding" },
          instructions: { type: "array", description: "Free-text instructions printed on the boleto", items: { type: "string" } },
          fine: { type: "object", description: "Multa (fine after due date): { percentage?, amount?, days_after_due? }" },
          interest: { type: "object", description: "Juros (daily interest after due date): { percentage?, amount? }" },
        },
        required: ["amount", "due_date", "payer"],
      },
    },
    {
      name: "get_boleto",
      description: "Retrieve a boleto by its Sicoob identifier (id or nosso_numero).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Boleto id or nosso_numero" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_boleto",
      description: "Cancel (baixa) an outstanding boleto before payment.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Boleto id or nosso_numero" },
          reason: { type: "string", description: "Cancellation reason code or free text" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_account_balance",
      description: "Query the merchant cooperative account balance via Sicoob SPB. Returns available, blocked, and overdraft (limite) figures.",
      inputSchema: {
        type: "object",
        properties: {
          account: { type: "string", description: "Agência-conta identifier of the cooperative member account" },
        },
        required: ["account"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "get_oauth_token": {
        const token = await getAccessToken();
        return { content: [{ type: "text", text: JSON.stringify({ access_token: token, expires_at: tokenCache?.expiresAt }, null, 2) }] };
      }
      case "create_pix_cob": {
        // TODO(verify): path. BACEN Pix v2 standard is PUT /cob/{txid} for
        // merchant-supplied txid, POST /cob for psp-assigned. Sicoob commonly
        // namespaces under /pix/api/v2.
        if (a.txid) {
          const txid = encodeURIComponent(String(a.txid));
          return { content: [{ type: "text", text: JSON.stringify(await sicoobRequest("PUT", `/pix/api/v2/cob/${txid}`, a), null, 2) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(await sicoobRequest("POST", "/pix/api/v2/cob", a), null, 2) }] };
      }
      case "get_pix_cob": {
        const txid = encodeURIComponent(String(a.txid ?? ""));
        // TODO(verify): path. BACEN standard GET /cob/{txid}.
        return { content: [{ type: "text", text: JSON.stringify(await sicoobRequest("GET", `/pix/api/v2/cob/${txid}`), null, 2) }] };
      }
      case "list_pix_cob": {
        const params = new URLSearchParams();
        if (a.from !== undefined) params.set("inicio", String(a.from));
        if (a.to !== undefined) params.set("fim", String(a.to));
        if (a.status !== undefined) params.set("status", String(a.status));
        if (a.cpf !== undefined) params.set("cpf", String(a.cpf));
        if (a.cnpj !== undefined) params.set("cnpj", String(a.cnpj));
        if (a.page !== undefined) params.set("paginacao.paginaAtual", String(a.page));
        if (a.page_size !== undefined) params.set("paginacao.itensPorPagina", String(a.page_size));
        // TODO(verify): path. BACEN Pix v2 standard is GET /cob.
        return { content: [{ type: "text", text: JSON.stringify(await sicoobRequest("GET", `/pix/api/v2/cob?${params}`), null, 2) }] };
      }
      case "create_pix_cobv": {
        // TODO(verify): path. BACEN standard PUT /cobv/{txid} for due-date charges.
        if (a.txid) {
          const txid = encodeURIComponent(String(a.txid));
          return { content: [{ type: "text", text: JSON.stringify(await sicoobRequest("PUT", `/pix/api/v2/cobv/${txid}`, a), null, 2) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(await sicoobRequest("POST", "/pix/api/v2/cobv", a), null, 2) }] };
      }
      case "get_pix_cobv": {
        const txid = encodeURIComponent(String(a.txid ?? ""));
        // TODO(verify): path. BACEN standard GET /cobv/{txid}.
        return { content: [{ type: "text", text: JSON.stringify(await sicoobRequest("GET", `/pix/api/v2/cobv/${txid}`), null, 2) }] };
      }
      case "lookup_dict_key": {
        const key = encodeURIComponent(String(a.key ?? ""));
        const qs = a.payer_document ? `?payerDocument=${encodeURIComponent(String(a.payer_document))}` : "";
        // TODO(verify): path. BACEN Pix v2 DICT lookup is GET /dict/{key}.
        return { content: [{ type: "text", text: JSON.stringify(await sicoobRequest("GET", `/pix/api/v2/dict/${key}${qs}`), null, 2) }] };
      }
      case "register_dict_key": {
        // TODO(verify): path. BACEN Pix v2 DICT registration is POST /dict.
        // Sicoob may additionally require an ownership-proof body for email/phone keys.
        return { content: [{ type: "text", text: JSON.stringify(await sicoobRequest("POST", "/pix/api/v2/dict", a), null, 2) }] };
      }
      case "delete_dict_key": {
        const key = encodeURIComponent(String(a.key ?? ""));
        // TODO(verify): path. BACEN standard is DELETE /dict/{key}.
        return { content: [{ type: "text", text: JSON.stringify(await sicoobRequest("DELETE", `/pix/api/v2/dict/${key}`), null, 2) }] };
      }
      case "create_boleto": {
        // TODO(verify): path. Sicoob Cobrança v3 is documented as
        // /cobranca-bancaria/v3/boletos for onboarded cooperatives.
        return { content: [{ type: "text", text: JSON.stringify(await sicoobRequest("POST", "/cobranca-bancaria/v3/boletos", a), null, 2) }] };
      }
      case "get_boleto": {
        const id = encodeURIComponent(String(a.id ?? ""));
        // TODO(verify): path. Sicoob Cobrança commonly /cobranca-bancaria/v3/boletos/{id}.
        return { content: [{ type: "text", text: JSON.stringify(await sicoobRequest("GET", `/cobranca-bancaria/v3/boletos/${id}`), null, 2) }] };
      }
      case "cancel_boleto": {
        const id = encodeURIComponent(String(a.id ?? ""));
        // TODO(verify): path. DELETE /cobranca-bancaria/v3/boletos/{id} or PATCH with situacao=BAIXADO.
        return { content: [{ type: "text", text: JSON.stringify(await sicoobRequest("DELETE", `/cobranca-bancaria/v3/boletos/${id}`), null, 2) }] };
      }
      case "get_account_balance": {
        const account = encodeURIComponent(String(a.account ?? ""));
        // TODO(verify): path. Sicoob SPB balance endpoint commonly
        // /conta-corrente/v2/contas/{account}/saldo.
        return { content: [{ type: "text", text: JSON.stringify(await sicoobRequest("GET", `/conta-corrente/v2/contas/${account}/saldo`), null, 2) }] };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (process.argv.includes("--http") || process.env.MCP_HTTP === "true") {
    const { default: express } = await import("express");
    const { randomUUID } = await import("node:crypto");
    const app = express();
    app.use(express.json());
    const transports = new Map<string, StreamableHTTPServerTransport>();
    app.get("/health", (_req: unknown, res: { json: (body: unknown) => unknown }) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: { headers: Record<string, string | string[] | undefined>; body: unknown }, res: { status: (code: number) => { json: (body: unknown) => unknown } }) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req as never, res as never, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-sicoob", version: "0.1.0-alpha.2" }, { capabilities: { tools: {} } });
        (server as unknown as { _requestHandlers: Map<unknown, unknown> })._requestHandlers.forEach((v, k) => (s as unknown as { _requestHandlers: Map<unknown, unknown> })._requestHandlers.set(k, v));
        (server as unknown as { _notificationHandlers?: Map<unknown, unknown> })._notificationHandlers?.forEach((v, k) => (s as unknown as { _notificationHandlers: Map<unknown, unknown> })._notificationHandlers.set(k, v));
        await s.connect(t);
        await t.handleRequest(req as never, res as never, req.body); return;
      }
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
    });
    app.get("/mcp", async (req: { headers: Record<string, string | string[] | undefined> }, res: { status: (code: number) => { send: (body: string) => unknown } }) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req as never, res as never); else res.status(400).send("Invalid session"); });
    app.delete("/mcp", async (req: { headers: Record<string, string | string[] | undefined> }, res: { status: (code: number) => { send: (body: string) => unknown } }) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req as never, res as never); else res.status(400).send("Invalid session"); });
    const port = Number(process.env.MCP_PORT) || 3000;
    app.listen(port, () => { console.error(`MCP HTTP server on http://localhost:${port}/mcp`); });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch(console.error);
