#!/usr/bin/env node

/**
 * MCP Server for Banco do Brasil — Brazil's top public bank.
 *
 * BB exposes one of the broadest bank API surfaces in the country, covering
 * Pix, Cobranças (boleto), Conta-Corrente, Open Finance, and Arrecadação
 * via the Developer Portal at developers.bb.com.br.
 *
 * Tools (13):
 *   create_pix_cob         — create immediate Pix charge (cob) with QR
 *   get_pix_cob            — retrieve an immediate Pix charge by txid
 *   list_pix_cob           — list immediate Pix charges by date range
 *   create_pix_devolucao   — refund (devolução) a received Pix
 *   get_pix_devolucao      — retrieve a devolução by id
 *   resolve_dict_key       — resolve a DICT key to account data
 *   register_dict_key      — register a DICT key on a BB account
 *   delete_dict_key        — delete a DICT key owned by the merchant
 *   register_boleto        — issue a boleto via BB Cobranças
 *   get_boleto             — retrieve a boleto by nosso_numero
 *   cancel_boleto          — cancel (baixa) an outstanding boleto
 *   get_account_balance    — Conta-Corrente balance
 *   get_statement          — Conta-Corrente statement / transactions
 *
 * Authentication
 *   OAuth 2.0 client_credentials + mandatory mTLS in production. BACEN
 *   requires mTLS for Pix v2; BB enforces it in production across product
 *   families. Sandbox typically accepts TLS-only — cert/key envs are
 *   therefore optional but recommended.
 *
 *   Additionally, BB requires a developer-app-key (`gw-dev-app-key`)
 *   query param on every API call for traffic accounting.
 *
 * Version: 0.1.0-alpha.1
 *   developers.bb.com.br is contract-gated — full OpenAPI specs are visible
 *   only to onboarded merchants. Pix paths follow BACEN Pix v2 standard.
 *   Boleto / Conta-Corrente paths are best-guesses based on BB public docs
 *   and conventions shared with peers (Itaú, Santander, Bradesco). Every
 *   unverified path is marked TODO(verify). Treat 0.1.x as alpha and pin
 *   to exact versions.
 *
 * Environment
 *   BB_CLIENT_ID            OAuth client id
 *   BB_CLIENT_SECRET        OAuth client secret
 *   BB_DEVELOPER_APP_KEY    gw-dev-app-key query param
 *   BB_CERT_PATH            path to mTLS client cert (production)
 *   BB_KEY_PATH             path to mTLS private key (production)
 *   BB_ENV                  "sandbox" | "production" (default: sandbox)
 *
 * Docs: https://developers.bb.com.br
 */

import { readFileSync } from "node:fs";
import { Agent as HttpsAgent } from "node:https";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.BB_CLIENT_ID || "";
const CLIENT_SECRET = process.env.BB_CLIENT_SECRET || "";
const DEVELOPER_APP_KEY = process.env.BB_DEVELOPER_APP_KEY || "";
const CERT_PATH = process.env.BB_CERT_PATH || "";
const KEY_PATH = process.env.BB_KEY_PATH || "";
const BB_ENV = (process.env.BB_ENV || "sandbox").toLowerCase();
const IS_PROD = BB_ENV === "production";

// TODO(verify): production base hostnames. BB documents distinct hosts per
// product family (api.bb.com.br for some, api-pix.bb.com.br for Pix). The
// sandbox subdomain is api.sandbox.bb.com.br for most products.
const BASE_URL = IS_PROD ? "https://api.bb.com.br" : "https://api.sandbox.bb.com.br";
const OAUTH_URL = IS_PROD
  ? "https://oauth.bb.com.br/oauth/token"
  : "https://oauth.sandbox.bb.com.br/oauth/token";

// Lazy-load the mTLS agent so `--help` / schema introspection doesn't crash
// when certs are missing. mTLS is required by BACEN in production but BB
// sandbox typically accepts TLS-only.
let mtlsAgent: HttpsAgent | null = null;
function getMtlsAgent(): HttpsAgent | null {
  if (mtlsAgent) return mtlsAgent;
  if (!CERT_PATH || !KEY_PATH) {
    if (IS_PROD) {
      throw new Error(
        "BB mTLS certificates are required in production. Set BB_CERT_PATH and BB_KEY_PATH " +
          "to the client cert and private-key files issued by developers.bb.com.br."
      );
    }
    return null; // sandbox: fall back to system TLS
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
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetchWithMtls(OAUTH_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    // TODO(verify): scope. BB scopes are product-specific (cob.write,
    // cob.read, pix.write, pix.read, dict.read, etc.). The sandbox
    // commonly accepts a blank/all scope for client_credentials.
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`BB OAuth ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

// Node's global fetch does not honour an https.Agent for mTLS; we drop down
// to node:https manually so the client cert is presented on every call.
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
        ...(agent ? { agent } : {}),
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

function appendAppKey(path: string): string {
  if (!DEVELOPER_APP_KEY) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}gw-dev-app-key=${encodeURIComponent(DEVELOPER_APP_KEY)}`;
}

async function bbRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const fullPath = appendAppKey(path);
  const res = await fetchWithMtls(`${BASE_URL}${fullPath}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`BB API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-banco-do-brasil", version: "0.1.0-alpha.2" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_pix_cob",
      description:
        "Create an immediate Pix charge (cob) with QR code. Returns txid, EMV copy-paste payload, and location URL. BACEN Pix v2 standard.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Amount in BRL major units, e.g. '99.90'" },
          payer: {
            type: "object",
            description: "Payer identification (CPF/CNPJ + name)",
            properties: {
              document: { type: "string", description: "CPF or CNPJ digits only" },
              name: { type: "string" },
            },
          },
          expires_in: { type: "number", description: "QR lifetime in seconds (default 3600)" },
          description: { type: "string", description: "Payer-visible description (solicitacaoPagador)" },
          dict_key: { type: "string", description: "Recebedor DICT key — must be a key owned by the merchant" },
          txid: { type: "string", description: "Optional merchant-supplied txid (26-35 alphanumeric). Omit to have BCB assign one." },
        },
        required: ["amount", "dict_key"],
      },
    },
    {
      name: "get_pix_cob",
      description: "Retrieve an immediate Pix charge by its txid.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "BACEN txid (26-35 alphanumeric)" },
        },
        required: ["txid"],
      },
    },
    {
      name: "list_pix_cob",
      description: "List immediate Pix charges (cob) by date range. Paginated per BACEN Pix v2.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date-time ISO-8601 (inicio)" },
          to: { type: "string", description: "End date-time ISO-8601 (fim)" },
          status: { type: "string", description: "Status filter: ATIVA | CONCLUIDA | REMOVIDA_PELO_USUARIO_RECEBEDOR | REMOVIDA_PELO_PSP" },
          page: { type: "number", description: "paginacao.paginaAtual" },
          page_size: { type: "number", description: "paginacao.itensPorPagina" },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "create_pix_devolucao",
      description:
        "Refund (devolução) a previously received Pix. Must reference the original endToEndId and a merchant-side refund id.",
      inputSchema: {
        type: "object",
        properties: {
          end_to_end_id: { type: "string", description: "Original Pix endToEndId" },
          refund_id: { type: "string", description: "Merchant-side refund id (id da devolução, alphanumeric up to 35)" },
          amount: { type: "string", description: "Refund amount in BRL major units. Omit for full refund." },
          reason: { type: "string", description: "Free-text reason (descricao)" },
        },
        required: ["end_to_end_id", "refund_id"],
      },
    },
    {
      name: "get_pix_devolucao",
      description: "Retrieve a Pix devolução by its endToEndId + refund id.",
      inputSchema: {
        type: "object",
        properties: {
          end_to_end_id: { type: "string", description: "Original Pix endToEndId" },
          refund_id: { type: "string", description: "Merchant-side refund id" },
        },
        required: ["end_to_end_id", "refund_id"],
      },
    },
    {
      name: "resolve_dict_key",
      description:
        "Resolve a DICT key (CPF, CNPJ, email, phone, EVP) to the owner's account data before sending a Pix. Subject to BCB rate limits per consenting payer.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "DICT key — CPF, CNPJ, email, phone (+55...), or EVP UUID" },
          payer_document: { type: "string", description: "End-payer CPF/CNPJ for BCB audit logging" },
        },
        required: ["key"],
      },
    },
    {
      name: "register_dict_key",
      description:
        "Register a DICT key on a BB account owned by the merchant. Some key types (email/phone) require BCB confirmation flows.",
      inputSchema: {
        type: "object",
        properties: {
          key_type: { type: "string", description: "DICT key type: CPF | CNPJ | EMAIL | PHONE | EVP" },
          key: { type: "string", description: "Key value. Omit for EVP (BCB generates UUID)." },
          account: {
            type: "object",
            properties: {
              branch: { type: "string", description: "Agência" },
              account: { type: "string", description: "Conta" },
              account_type: { type: "string", description: "CACC | SVGS | SLRY | TRAN" },
            },
            required: ["branch", "account", "account_type"],
          },
        },
        required: ["key_type", "account"],
      },
    },
    {
      name: "delete_dict_key",
      description:
        "Delete a DICT key owned by the merchant. Irreversible — key becomes available for re-registration after BCB lockout window.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "DICT key value to delete" },
        },
        required: ["key"],
      },
    },
    {
      name: "register_boleto",
      description: "Issue a boleto via BB Cobranças. Returns nosso_numero, linha digitável, barcode, and PDF URL.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Amount in BRL major units, e.g. '150.00'" },
          due_date: { type: "string", description: "Due date ISO-8601 (YYYY-MM-DD)" },
          convenio: { type: "string", description: "BB convênio (numeroConvenio) registered for the merchant" },
          payer: {
            type: "object",
            properties: {
              name: { type: "string" },
              document: { type: "string", description: "CPF or CNPJ digits only" },
              address: {
                type: "object",
                properties: {
                  street: { type: "string" },
                  number: { type: "string" },
                  district: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string", description: "2-letter UF code" },
                  postal_code: { type: "string", description: "CEP digits only" },
                },
              },
            },
            required: ["name", "document"],
          },
          our_number: { type: "string", description: "Nosso_numero. Omit to have BB assign one." },
          fine: { type: "object", description: "Multa: { percentage?, amount?, days_after_due? }" },
          interest: { type: "object", description: "Juros: { percentage?, amount? }" },
          discount: { type: "object", description: "Desconto: { percentage?, amount?, until? }" },
        },
        required: ["amount", "due_date", "convenio", "payer"],
      },
    },
    {
      name: "get_boleto",
      description: "Retrieve a boleto by nosso_numero.",
      inputSchema: {
        type: "object",
        properties: {
          nosso_numero: { type: "string", description: "BB nosso_numero" },
          convenio: { type: "string", description: "BB convênio" },
        },
        required: ["nosso_numero", "convenio"],
      },
    },
    {
      name: "cancel_boleto",
      description: "Cancel (baixa) an outstanding boleto before payment.",
      inputSchema: {
        type: "object",
        properties: {
          nosso_numero: { type: "string", description: "BB nosso_numero" },
          convenio: { type: "string", description: "BB convênio" },
          reason: { type: "string", description: "Cancellation reason code or free text" },
        },
        required: ["nosso_numero", "convenio"],
      },
    },
    {
      name: "get_account_balance",
      description: "Retrieve the current balance of a BB conta-corrente (checking) account.",
      inputSchema: {
        type: "object",
        properties: {
          branch: { type: "string", description: "Agência (4 digits)" },
          account: { type: "string", description: "Conta (digits, no DV)" },
          account_dv: { type: "string", description: "Conta DV (1 digit)" },
        },
        required: ["branch", "account"],
      },
    },
    {
      name: "get_statement",
      description: "Retrieve account statement transactions for a BB conta-corrente over a date range. Paginated.",
      inputSchema: {
        type: "object",
        properties: {
          branch: { type: "string", description: "Agência" },
          account: { type: "string", description: "Conta" },
          from: { type: "string", description: "Start date ISO-8601 (YYYY-MM-DD)" },
          to: { type: "string", description: "End date ISO-8601 (YYYY-MM-DD)" },
          page: { type: "number", description: "Page number (1-indexed)" },
          page_size: { type: "number", description: "Items per page (default 50)" },
        },
        required: ["branch", "account", "from", "to"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "create_pix_cob": {
        // TODO(verify): path. BACEN Pix v2 standard is PUT /pix/v2/cob/{txid}
        // when txid is supplied, POST /pix/v2/cob otherwise. BB hosts Pix
        // under api-pix.bb.com.br in production with /pix/v2 prefix.
        const txid = a.txid ? `/${encodeURIComponent(String(a.txid))}` : "";
        const method = a.txid ? "PUT" : "POST";
        return {
          content: [
            { type: "text", text: JSON.stringify(await bbRequest(method, `/pix/v2/cob${txid}`, a), null, 2) },
          ],
        };
      }
      case "get_pix_cob": {
        const txid = encodeURIComponent(String(a.txid ?? ""));
        return {
          content: [
            { type: "text", text: JSON.stringify(await bbRequest("GET", `/pix/v2/cob/${txid}`), null, 2) },
          ],
        };
      }
      case "list_pix_cob": {
        const params = new URLSearchParams();
        if (a.from !== undefined) params.set("inicio", String(a.from));
        if (a.to !== undefined) params.set("fim", String(a.to));
        if (a.status !== undefined) params.set("status", String(a.status));
        if (a.page !== undefined) params.set("paginacao.paginaAtual", String(a.page));
        if (a.page_size !== undefined) params.set("paginacao.itensPorPagina", String(a.page_size));
        return {
          content: [
            { type: "text", text: JSON.stringify(await bbRequest("GET", `/pix/v2/cob?${params}`), null, 2) },
          ],
        };
      }
      case "create_pix_devolucao": {
        const e2e = encodeURIComponent(String(a.end_to_end_id ?? ""));
        const rid = encodeURIComponent(String(a.refund_id ?? ""));
        const body: Record<string, unknown> = {};
        if (a.amount !== undefined) body.valor = a.amount;
        if (a.reason !== undefined) body.descricao = a.reason;
        // TODO(verify): path. BACEN standard PUT /pix/v2/pix/{e2e}/devolucao/{id}.
        return {
          content: [
            { type: "text", text: JSON.stringify(await bbRequest("PUT", `/pix/v2/pix/${e2e}/devolucao/${rid}`, body), null, 2) },
          ],
        };
      }
      case "get_pix_devolucao": {
        const e2e = encodeURIComponent(String(a.end_to_end_id ?? ""));
        const rid = encodeURIComponent(String(a.refund_id ?? ""));
        return {
          content: [
            { type: "text", text: JSON.stringify(await bbRequest("GET", `/pix/v2/pix/${e2e}/devolucao/${rid}`), null, 2) },
          ],
        };
      }
      case "resolve_dict_key": {
        const key = encodeURIComponent(String(a.key ?? ""));
        const qs = a.payer_document ? `&payerDocument=${encodeURIComponent(String(a.payer_document))}` : "";
        // TODO(verify): path. BACEN DICT consulta is GET /dict/v2/keys/{key}; BB
        // may also expose it under /pix/v2/dict for client convenience.
        return {
          content: [
            { type: "text", text: JSON.stringify(await bbRequest("GET", `/dict/v2/keys/${key}${qs ? `?${qs.slice(1)}` : ""}`), null, 2) },
          ],
        };
      }
      case "register_dict_key": {
        // TODO(verify): path. BACEN DICT registration is POST /dict/v2/keys
        // with a chaveEntries body; BB may add a confirmação flow for email/phone.
        return {
          content: [
            { type: "text", text: JSON.stringify(await bbRequest("POST", "/dict/v2/keys", a), null, 2) },
          ],
        };
      }
      case "delete_dict_key": {
        const key = encodeURIComponent(String(a.key ?? ""));
        // TODO(verify): path. BACEN DICT delete is DELETE /dict/v2/keys/{key}.
        return {
          content: [
            { type: "text", text: JSON.stringify(await bbRequest("DELETE", `/dict/v2/keys/${key}`), null, 2) },
          ],
        };
      }
      case "register_boleto": {
        // TODO(verify): path. BB Cobranças v2 registration is commonly
        // POST /cobrancas/v2/boletos with numeroConvenio carried in the body.
        return {
          content: [
            { type: "text", text: JSON.stringify(await bbRequest("POST", "/cobrancas/v2/boletos", a), null, 2) },
          ],
        };
      }
      case "get_boleto": {
        const nn = encodeURIComponent(String(a.nosso_numero ?? ""));
        const conv = encodeURIComponent(String(a.convenio ?? ""));
        // TODO(verify): path. BB exposes detail at GET /cobrancas/v2/boletos/{nosso_numero}?numeroConvenio=...
        return {
          content: [
            { type: "text", text: JSON.stringify(await bbRequest("GET", `/cobrancas/v2/boletos/${nn}?numeroConvenio=${conv}`), null, 2) },
          ],
        };
      }
      case "cancel_boleto": {
        const nn = encodeURIComponent(String(a.nosso_numero ?? ""));
        const conv = encodeURIComponent(String(a.convenio ?? ""));
        const body: Record<string, unknown> = { numeroConvenio: a.convenio };
        if (a.reason !== undefined) body.motivoBaixa = a.reason;
        // TODO(verify): path. BB baixa is POST /cobrancas/v2/boletos/{nn}/baixar.
        return {
          content: [
            { type: "text", text: JSON.stringify(await bbRequest("POST", `/cobrancas/v2/boletos/${nn}/baixar?numeroConvenio=${conv}`, body), null, 2) },
          ],
        };
      }
      case "get_account_balance": {
        const branch = encodeURIComponent(String(a.branch ?? ""));
        const account = encodeURIComponent(String(a.account ?? ""));
        const dv = a.account_dv ? `&digitoConta=${encodeURIComponent(String(a.account_dv))}` : "";
        // TODO(verify): path. BB Conta-Corrente saldo: GET /conta-corrente/v1/saldo?agencia=&conta=
        return {
          content: [
            { type: "text", text: JSON.stringify(await bbRequest("GET", `/conta-corrente/v1/saldo?agencia=${branch}&conta=${account}${dv}`), null, 2) },
          ],
        };
      }
      case "get_statement": {
        const params = new URLSearchParams();
        params.set("agencia", String(a.branch ?? ""));
        params.set("conta", String(a.account ?? ""));
        params.set("dataInicio", String(a.from ?? ""));
        params.set("dataFim", String(a.to ?? ""));
        if (a.page !== undefined) params.set("pagina", String(a.page));
        if (a.page_size !== undefined) params.set("tamanhoPagina", String(a.page_size));
        // TODO(verify): path. BB extrato: GET /conta-corrente/v1/extrato.
        return {
          content: [
            { type: "text", text: JSON.stringify(await bbRequest("GET", `/conta-corrente/v1/extrato?${params}`), null, 2) },
          ],
        };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
