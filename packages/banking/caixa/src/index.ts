#!/usr/bin/env node

/**
 * MCP Server for Caixa Econômica Federal — Brazil's largest state-owned bank.
 *
 * Caixa is a distinct segment from the private tier-1 banks (Itaú, Bradesco,
 * Santander, BB). It operates federal social programs (PIS/PASEP, FGTS, Bolsa
 * Família / Auxílio Brasil), runs the national lottery (Loterias Caixa), and
 * is the preferred bank for merchants that value state-bank credibility or
 * serve beneficiaries of federal transfer programs. For the API surface that
 * matters to merchants — Pix + boleto (Cobrança / SICOB) + extrato — Caixa
 * follows the BACEN Pix v2 standard shared by every tier-1 bank.
 *
 * Tools (10):
 *   get_oauth_token   — mint/return a cached OAuth bearer (exposed for inspection)
 *   send_pix          — initiate an outbound Pix payment
 *   create_pix_qr     — create a dynamic Pix charge + QR (cob / cobv)
 *   get_pix           — retrieve a Pix by endToEndId
 *   resolve_dict_key  — resolve a DICT key (CPF, CNPJ, email, phone, EVP) to account data
 *   refund_pix        — refund / devolução of a received Pix
 *   create_boleto     — issue a boleto via Caixa Cobrança (SICOB)
 *   get_boleto        — retrieve a boleto by id / nosso_numero
 *   cancel_boleto     — cancel (baixa) a boleto
 *   get_statement     — account statement transactions
 *
 * Authentication
 *   OAuth 2.0 client_credentials + mandatory mTLS. BACEN requires mTLS for
 *   Pix v2, and Caixa's Developer Portal enforces it across product families.
 *   This server loads the client cert + key from disk (paths via env) and
 *   routes all HTTPS requests through a Node https.Agent that presents them.
 *
 * Version: 0.1.0-alpha.1
 *   developers.caixa is contract-gated and Caixa's onboarding is additionally
 *   bureaucratic (state-owned — vendor registration + credenciamento required
 *   on top of the commercial merchant contract). Full OpenAPI specs are only
 *   visible to onboarded merchants. Endpoint paths below are best-guess based
 *   on (a) BACEN Pix v2 standard paths, (b) Caixa's public SICOB / Cobrança
 *   integration guides, and (c) conventions shared with peers (Itaú, Bradesco,
 *   BB). Every path that has not been byte-verified is marked TODO(verify).
 *   Consumers should treat 0.1.x as alpha and pin to exact versions.
 *
 * Environment
 *   CAIXA_CLIENT_ID      OAuth client id
 *   CAIXA_CLIENT_SECRET  OAuth client secret
 *   CAIXA_CERT_PATH      path to mTLS client cert (.crt/.pem)
 *   CAIXA_KEY_PATH       path to mTLS private key (.key/.pem)
 *   CAIXA_ENV            "sandbox" | "production" (default: sandbox)
 *
 * Docs: https://developers.caixa
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

const CLIENT_ID = process.env.CAIXA_CLIENT_ID || "";
const CLIENT_SECRET = process.env.CAIXA_CLIENT_SECRET || "";
const CERT_PATH = process.env.CAIXA_CERT_PATH || "";
const KEY_PATH = process.env.CAIXA_KEY_PATH || "";
const CAIXA_ENV = (process.env.CAIXA_ENV || "sandbox").toLowerCase();

// TODO(verify): Caixa publishes distinct sandbox/prod hosts to onboarded
// merchants. Public references point to api.caixa.gov.br for production;
// the homologação host is commonly prefixed with `hom-` or provisioned per
// merchant under the same apex. Exact host + basePath are contract-gated —
// override via forked build if your portal provisioning differs.
const BASE_URL = CAIXA_ENV === "production"
  ? "https://api.caixa.gov.br"
  : "https://apihom.caixa.gov.br";

// Lazy-load the mTLS agent so `--help` / schema introspection doesn't crash
// when certs are missing. Banking ops that actually hit the wire will fail
// loudly with a clear message if certs are unset.
let mtlsAgent: HttpsAgent | null = null;
function getMtlsAgent(): HttpsAgent {
  if (mtlsAgent) return mtlsAgent;
  if (!CERT_PATH || !KEY_PATH) {
    throw new Error(
      "Caixa mTLS certificates are required. Set CAIXA_CERT_PATH and CAIXA_KEY_PATH " +
      "to the client cert and private-key files issued by Caixa's Developer Portal."
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
  // TODO(verify): token path. Caixa commonly exposes /oauth2/token or
  // /auth/v1/token; Basic auth is accepted for client_credentials in sandbox.
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetchWithMtls(`${BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Caixa OAuth ${res.status}: ${await res.text()}`);
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

async function caixaRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetchWithMtls(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "x-caixa-correlationID": `mcp-${Date.now()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Caixa API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-caixa", version: "0.1.0-alpha.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_oauth_token",
      description: "Mint or return a cached OAuth2 client_credentials bearer token for the Caixa Developer Portal. Exposed so agents can inspect token freshness; normal tool calls obtain tokens implicitly.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "send_pix",
      description: "Initiate an outbound Pix payment from the merchant's Caixa account. Amount in BRL major units (e.g. '10.50').",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Amount in BRL major units with two decimals, e.g. '10.50'" },
          payer_account: { type: "string", description: "Merchant account to debit (agência-conta)" },
          payee: {
            type: "object",
            description: "Payee identification — either a DICT key or explicit bank account",
            properties: {
              dict_key: { type: "string", description: "CPF, CNPJ, email, phone (+55...), or EVP (UUID)" },
              name: { type: "string" },
              document: { type: "string", description: "CPF or CNPJ, digits only" },
              bank_ispb: { type: "string", description: "8-digit ISPB of payee's bank" },
              branch: { type: "string" },
              account: { type: "string" },
            },
          },
          description: { type: "string", description: "Free-text description shown on the statement (max 140 chars)" },
          idempotency_key: { type: "string", description: "Merchant-side idempotency key (UUID recommended)" },
        },
        required: ["amount", "payer_account", "payee", "idempotency_key"],
      },
    },
    {
      name: "create_pix_qr",
      description: "Create a dynamic Pix charge with QR code (cob). Returns the txid, copy-paste EMV payload, and location URL.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Amount in BRL major units, e.g. '99.90'" },
          payer: {
            type: "object",
            description: "Payer identification (required by BCB for cobv / common for cob)",
            properties: {
              document: { type: "string", description: "CPF or CNPJ digits only" },
              name: { type: "string" },
            },
          },
          expires_in: { type: "number", description: "QR lifetime in seconds (default 3600)" },
          description: { type: "string", description: "Payer-visible description" },
          additional_info: { type: "array", description: "Optional free-text key/value info shown to the payer" },
        },
        required: ["amount"],
      },
    },
    {
      name: "get_pix",
      description: "Retrieve a Pix transaction by its BCB endToEndId (E<ispb><yyyymmddhhmm><sequence>).",
      inputSchema: {
        type: "object",
        properties: {
          end_to_end_id: { type: "string", description: "BCB endToEndId" },
        },
        required: ["end_to_end_id"],
      },
    },
    {
      name: "resolve_dict_key",
      description: "Resolve a DICT key (CPF, CNPJ, email, phone, EVP) to the owner's account data before sending a Pix. Subject to BCB rate limits per consenting payer.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "DICT key — CPF, CNPJ, email, phone (+55...), or EVP UUID" },
          payer_document: { type: "string", description: "Merchant / end-payer CPF/CNPJ for BCB audit logging" },
        },
        required: ["key"],
      },
    },
    {
      name: "refund_pix",
      description: "Refund (devolução) a previously received Pix. Must reference the original endToEndId and a merchant-side refund id.",
      inputSchema: {
        type: "object",
        properties: {
          end_to_end_id: { type: "string", description: "Original Pix endToEndId to refund" },
          refund_id: { type: "string", description: "Merchant-side refund identifier (alphanumeric up to 35 chars)" },
          amount: { type: "string", description: "Refund amount in BRL major units. Omit for full refund." },
          reason: { type: "string", description: "Free-text reason (stored by BCB for audit)" },
        },
        required: ["end_to_end_id", "refund_id"],
      },
    },
    {
      name: "create_boleto",
      description: "Issue a boleto via Caixa Cobrança (SICOB). Returns nosso_numero, linha_digitável, barcode, and PDF URL.",
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
          our_number: { type: "string", description: "Nosso_numero. Omit to have Caixa/SICOB assign one." },
          instructions: { type: "array", description: "Free-text instructions printed on the boleto", items: { type: "string" } },
          fine: { type: "object", description: "Multa (fine after due date): { percentage?, amount?, days_after_due? }" },
          interest: { type: "object", description: "Juros (daily interest after due date): { percentage?, amount? }" },
        },
        required: ["amount", "due_date", "payer"],
      },
    },
    {
      name: "get_boleto",
      description: "Retrieve a boleto by its Caixa identifier (id or nosso_numero).",
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
      name: "get_statement",
      description: "Retrieve account statement transactions for a given period. Paginated.",
      inputSchema: {
        type: "object",
        properties: {
          account: { type: "string", description: "Agência-conta identifier of the merchant account" },
          from: { type: "string", description: "Start date ISO-8601 (YYYY-MM-DD)" },
          to: { type: "string", description: "End date ISO-8601 (YYYY-MM-DD)" },
          page: { type: "number", description: "Page number (1-indexed)" },
          page_size: { type: "number", description: "Items per page (default 50)" },
        },
        required: ["account", "from", "to"],
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
      case "send_pix": {
        // TODO(verify): path. BACEN Pix v2 standard is POST /pix/v2/pix, but
        // Caixa's send-pix surface may sit under /pix_payments/v1.
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("POST", "/pix_payments/v1", a), null, 2) }] };
      }
      case "create_pix_qr": {
        // TODO(verify): path. Likely /cobrancas/v2/cobrancas or BACEN /cob.
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("POST", "/cobrancas/v2/cobrancas", a), null, 2) }] };
      }
      case "get_pix": {
        const id = encodeURIComponent(String(a.end_to_end_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("GET", `/pix/v2/pix/${id}`), null, 2) }] };
      }
      case "resolve_dict_key": {
        const key = encodeURIComponent(String(a.key ?? ""));
        const qs = a.payer_document ? `?payerDocument=${encodeURIComponent(String(a.payer_document))}` : "";
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("GET", `/pix/v2/dict/${key}${qs}`), null, 2) }] };
      }
      case "refund_pix": {
        const e2e = encodeURIComponent(String(a.end_to_end_id ?? ""));
        const rid = encodeURIComponent(String(a.refund_id ?? ""));
        const body: Record<string, unknown> = {};
        if (a.amount !== undefined) body.valor = a.amount;
        if (a.reason !== undefined) body.descricao = a.reason;
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("PUT", `/pix/v2/pix/${e2e}/devolucao/${rid}`, body), null, 2) }] };
      }
      case "create_boleto": {
        // TODO(verify): path. Caixa's SICOB/Cobrança v2 is commonly
        // /cobranca/v2/boletos for onboarded merchants; legacy SIGCB paths
        // may still apply to older contracts.
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("POST", "/cobranca/v2/boletos", a), null, 2) }] };
      }
      case "get_boleto": {
        const id = encodeURIComponent(String(a.id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("GET", `/cobranca/v2/boletos/${id}`), null, 2) }] };
      }
      case "cancel_boleto": {
        const id = encodeURIComponent(String(a.id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("DELETE", `/cobranca/v2/boletos/${id}`), null, 2) }] };
      }
      case "get_statement": {
        const account = encodeURIComponent(String(a.account ?? ""));
        const params = new URLSearchParams();
        params.set("dataInicio", String(a.from ?? ""));
        params.set("dataFim", String(a.to ?? ""));
        if (a.page !== undefined) params.set("pagina", String(a.page));
        if (a.page_size !== undefined) params.set("tamanhoPagina", String(a.page_size));
        // TODO(verify): path. Commonly /extrato/v1/contas/{account}/transacoes.
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("GET", `/extrato/v1/contas/${account}/transacoes?${params}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-caixa", version: "0.1.0-alpha.1" }, { capabilities: { tools: {} } });
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
