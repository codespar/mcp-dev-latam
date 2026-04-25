#!/usr/bin/env node

/**
 * MCP Server for C6 Bank — top Brazilian digital bank, JPMorgan-backed.
 *
 * C6 ranks among the largest Brazilian digital banks by retail account base
 * and has expanded aggressively into SMB and corporate banking. This server
 * exposes the core Developer Portal product families:
 *
 *   Pix         — immediate charges (cob), due-date charges (cobv), DICT
 *   Cobrança    — boleto lifecycle (create, query, cancel)
 *   Conta       — account balance + statement
 *
 * Tools (14):
 *   get_oauth_token       — mint/return a cached OAuth bearer (exposed for inspection)
 *   create_pix_cob        — create a Pix immediate charge (cob) with QR
 *   get_pix_cob           — retrieve a Pix immediate charge by txid
 *   list_pix_cob          — list Pix immediate charges by date range
 *   create_pix_cobv       — create a Pix charge with due date (cobv)
 *   get_pix_cobv          — retrieve a Pix due-date charge by txid
 *   resolve_dict_key      — resolve a DICT key (CPF, CNPJ, email, phone, EVP)
 *   register_pix_key      — register a DICT key on a C6 account
 *   delete_pix_key        — delete a DICT key owned by the merchant
 *   create_boleto         — issue a boleto
 *   get_boleto            — retrieve a boleto by id / nosso_numero
 *   cancel_boleto         — cancel (baixa) a boleto
 *   get_account_balance   — current account balance snapshot
 *   get_statement         — account statement transactions
 *
 * Authentication
 *   OAuth 2.0 client_credentials + mandatory mTLS. BACEN requires mTLS for
 *   Pix v2, and C6's Developer Portal enforces it across product families.
 *   This server loads the client cert + key from disk (paths via env) and
 *   routes all HTTPS requests through a Node https.Agent that presents them.
 *
 * Version: 0.1.0-alpha.1
 *   developers.c6bank.com.br is contract-gated — full OpenAPI specs are only
 *   visible to onboarded merchants. Endpoint paths below are best-guess based
 *   on (a) BACEN Pix v2 standard paths, (b) C6 public marketing pages, and
 *   (c) conventions shared with peers (Itaú, Santander, Bradesco).
 *   Every path that has not been byte-verified is marked TODO(verify).
 *   Consumers should treat 0.1.x as alpha and pin to exact versions.
 *
 * Environment
 *   C6_CLIENT_ID        OAuth client id
 *   C6_CLIENT_SECRET    OAuth client secret
 *   C6_CERT_PATH        path to mTLS client cert (.crt/.pem)
 *   C6_KEY_PATH         path to mTLS private key (.key/.pem)
 *   C6_ENV              "sandbox" | "production" (default: sandbox)
 *
 * Docs: https://developers.c6bank.com.br
 */

import { readFileSync } from "node:fs";
import { Agent as HttpsAgent } from "node:https";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.C6_CLIENT_ID || "";
const CLIENT_SECRET = process.env.C6_CLIENT_SECRET || "";
const CERT_PATH = process.env.C6_CERT_PATH || "";
const KEY_PATH = process.env.C6_KEY_PATH || "";
const C6_ENV = (process.env.C6_ENV || "sandbox").toLowerCase();

// TODO(verify): sandbox + production base URLs. C6 publishes a separate
// sandbox subdomain to onboarded merchants; the exact host is contract-gated.
const BASE_URL = C6_ENV === "production"
  ? "https://baas.c6bank.com.br"
  : "https://baas-sandbox.c6bank.com.br";

// Lazy-load the mTLS agent so `--help` / schema introspection doesn't crash
// when certs are missing. Banking ops that actually hit the wire will fail
// loudly with a clear message if certs are unset.
let mtlsAgent: HttpsAgent | null = null;
function getMtlsAgent(): HttpsAgent {
  if (mtlsAgent) return mtlsAgent;
  if (!CERT_PATH || !KEY_PATH) {
    throw new Error(
      "C6 mTLS certificates are required. Set C6_CERT_PATH and C6_KEY_PATH " +
      "to the client cert and private-key files issued by C6's Developer Portal."
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
  // TODO(verify): token path. C6 commonly exposes /auth/oauth2/v1/token under
  // the BaaS portal; client-assertion JWT is preferred for high-trust flows
  // but Basic auth is accepted for client_credentials in sandbox.
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetchWithMtls(`${BASE_URL}/auth/oauth2/v1/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`C6 OAuth ${res.status}: ${await res.text()}`);
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

async function c6Request(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetchWithMtls(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "x-c6-correlation-id": `mcp-${Date.now()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`C6 API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-c6", version: "0.1.0-alpha.2" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_oauth_token",
      description: "Mint or return a cached OAuth2 client_credentials bearer token for the C6 Developer Portal. Exposed so agents can inspect token freshness; normal tool calls obtain tokens implicitly.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_pix_cob",
      description: "Create a Pix immediate charge (cob) with QR code. Returns the txid, copy-paste EMV payload, and location URL per BACEN Pix v2.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Amount in BRL major units, e.g. '99.90'" },
          payer: {
            type: "object",
            description: "Payer identification (optional for cob, required for cobv)",
            properties: {
              document: { type: "string", description: "CPF or CNPJ digits only" },
              name: { type: "string" },
            },
          },
          expires_in: { type: "number", description: "QR lifetime in seconds (default 3600)" },
          description: { type: "string", description: "Payer-visible description (solicitacaoPagador)" },
          additional_info: { type: "array", description: "Optional infoAdicionais — array of { nome, valor }" },
          txid: { type: "string", description: "Optional merchant-side txid (26-35 alphanumeric chars). Omit to let C6 assign." },
        },
        required: ["amount"],
      },
    },
    {
      name: "get_pix_cob",
      description: "Retrieve a Pix immediate charge (cob) by its txid.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "BACEN Pix txid" },
        },
        required: ["txid"],
      },
    },
    {
      name: "list_pix_cob",
      description: "List Pix immediate charges (cob) registered by the merchant within a date range. Paginated per BACEN Pix v2.",
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
      description: "Create a Pix charge with due date (cobv) — used for boleto-like Pix where the payer can pay at or after a due date with optional fine/interest. Returns txid, copy-paste EMV payload, and location URL.",
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
          txid: { type: "string", description: "Optional merchant-side txid. Omit to let C6 assign." },
        },
        required: ["amount", "due_date", "payer"],
      },
    },
    {
      name: "get_pix_cobv",
      description: "Retrieve a Pix due-date charge (cobv) by its txid.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "BACEN Pix txid" },
        },
        required: ["txid"],
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
      name: "register_pix_key",
      description: "Register a DICT key (CPF, CNPJ, email, phone, or EVP) on a C6 account owned by the merchant. Subject to BCB validation flows (e.g. email/SMS confirmation for email/phone keys).",
      inputSchema: {
        type: "object",
        properties: {
          key_type: { type: "string", description: "DICT key type: CPF | CNPJ | EMAIL | PHONE | EVP" },
          key: { type: "string", description: "The key value. Omit for EVP (C6 generates the UUID)." },
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
      name: "delete_pix_key",
      description: "Delete a DICT key owned by the merchant. Irreversible — the key becomes available for re-registration by any PSP after the BCB lockout window.",
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
      description: "Issue a boleto via C6 Cobrança. Returns nosso_numero, linha_digitável, barcode, and PDF URL.",
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
          our_number: { type: "string", description: "Nosso_numero. Omit to have C6 assign one." },
          instructions: { type: "array", description: "Free-text instructions printed on the boleto", items: { type: "string" } },
          fine: { type: "object", description: "Multa (fine after due date): { percentage?, amount?, days_after_due? }" },
          interest: { type: "object", description: "Juros (daily interest after due date): { percentage?, amount? }" },
        },
        required: ["amount", "due_date", "payer"],
      },
    },
    {
      name: "get_boleto",
      description: "Retrieve a boleto by its C6 identifier (id or nosso_numero).",
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
      description: "Retrieve the current balance snapshot for a merchant account.",
      inputSchema: {
        type: "object",
        properties: {
          account: { type: "string", description: "Agência-conta identifier of the merchant account" },
        },
        required: ["account"],
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
      case "create_pix_cob": {
        // TODO(verify): path. BACEN Pix v2 standard is PUT /pix/v2/cob/{txid}
        // when merchant-supplied txid, POST /pix/v2/cob otherwise. C6 may
        // expose under /baas/pix/v1/cob.
        if (a.txid !== undefined) {
          const tx = encodeURIComponent(String(a.txid));
          return { content: [{ type: "text", text: JSON.stringify(await c6Request("PUT", `/pix/v2/cob/${tx}`, a), null, 2) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(await c6Request("POST", "/pix/v2/cob", a), null, 2) }] };
      }
      case "get_pix_cob": {
        const tx = encodeURIComponent(String(a.txid ?? ""));
        // TODO(verify): path. BACEN standard: GET /pix/v2/cob/{txid}.
        return { content: [{ type: "text", text: JSON.stringify(await c6Request("GET", `/pix/v2/cob/${tx}`), null, 2) }] };
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
        // TODO(verify): path. BACEN Pix v2 standard is GET /pix/v2/cob.
        return { content: [{ type: "text", text: JSON.stringify(await c6Request("GET", `/pix/v2/cob?${params}`), null, 2) }] };
      }
      case "create_pix_cobv": {
        // TODO(verify): path. BACEN Pix v2 standard is PUT /pix/v2/cobv/{txid}
        // when merchant-supplied txid, POST /pix/v2/cobv otherwise.
        if (a.txid !== undefined) {
          const tx = encodeURIComponent(String(a.txid));
          return { content: [{ type: "text", text: JSON.stringify(await c6Request("PUT", `/pix/v2/cobv/${tx}`, a), null, 2) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(await c6Request("POST", "/pix/v2/cobv", a), null, 2) }] };
      }
      case "get_pix_cobv": {
        const tx = encodeURIComponent(String(a.txid ?? ""));
        // TODO(verify): path. BACEN standard: GET /pix/v2/cobv/{txid}.
        return { content: [{ type: "text", text: JSON.stringify(await c6Request("GET", `/pix/v2/cobv/${tx}`), null, 2) }] };
      }
      case "resolve_dict_key": {
        const key = encodeURIComponent(String(a.key ?? ""));
        const qs = a.payer_document ? `?payerDocument=${encodeURIComponent(String(a.payer_document))}` : "";
        // TODO(verify): path. BACEN DICT lookup: GET /pix/v2/dict/{key}.
        return { content: [{ type: "text", text: JSON.stringify(await c6Request("GET", `/pix/v2/dict/${key}${qs}`), null, 2) }] };
      }
      case "register_pix_key": {
        // TODO(verify): path. BACEN Pix v2 DICT maintenance is POST /pix/v2/dict
        // for registration. C6 may additionally require an ownership proof body.
        return { content: [{ type: "text", text: JSON.stringify(await c6Request("POST", "/pix/v2/dict", a), null, 2) }] };
      }
      case "delete_pix_key": {
        const key = encodeURIComponent(String(a.key ?? ""));
        // TODO(verify): path. BACEN standard is DELETE /pix/v2/dict/{key}.
        return { content: [{ type: "text", text: JSON.stringify(await c6Request("DELETE", `/pix/v2/dict/${key}`), null, 2) }] };
      }
      case "create_boleto": {
        // TODO(verify): path. C6 Cobrança v1 likely sits under /cobranca/v1/boletos for onboarded merchants.
        return { content: [{ type: "text", text: JSON.stringify(await c6Request("POST", "/cobranca/v1/boletos", a), null, 2) }] };
      }
      case "get_boleto": {
        const id = encodeURIComponent(String(a.id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await c6Request("GET", `/cobranca/v1/boletos/${id}`), null, 2) }] };
      }
      case "cancel_boleto": {
        const id = encodeURIComponent(String(a.id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await c6Request("DELETE", `/cobranca/v1/boletos/${id}`), null, 2) }] };
      }
      case "get_account_balance": {
        const account = encodeURIComponent(String(a.account ?? ""));
        // TODO(verify): path. C6 BaaS account balance commonly /conta/v1/contas/{account}/saldo.
        return { content: [{ type: "text", text: JSON.stringify(await c6Request("GET", `/conta/v1/contas/${account}/saldo`), null, 2) }] };
      }
      case "get_statement": {
        const account = encodeURIComponent(String(a.account ?? ""));
        const params = new URLSearchParams();
        params.set("dataInicio", String(a.from ?? ""));
        params.set("dataFim", String(a.to ?? ""));
        if (a.page !== undefined) params.set("pagina", String(a.page));
        if (a.page_size !== undefined) params.set("tamanhoPagina", String(a.page_size));
        // TODO(verify): path. Commonly /conta/v1/contas/{account}/extrato.
        return { content: [{ type: "text", text: JSON.stringify(await c6Request("GET", `/conta/v1/contas/${account}/extrato?${params}`), null, 2) }] };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
