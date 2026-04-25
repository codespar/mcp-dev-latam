#!/usr/bin/env node

/**
 * MCP Server for Bradesco — Brazil's 2nd largest private bank (after Itaú).
 *
 * Merchants with meaningful Pix, boleto, and cash-management volume integrate
 * directly with Bradesco instead of going through a PSP. This server exposes
 * the four Developer Portal product families that every tier-1 BR bank ships:
 *
 *   Pix          — send, receive, QR, DICT lookup/register/delete, refund, cobv
 *   Cobrança     — boleto lifecycle (create, query, list, cancel, PDF)
 *   Arrecadação  — pay utility / tax / concessionária bills, DARF/GRU
 *   Extrato      — account statement / transactions / balance
 *   Cash-mgmt    — TED / TEF transfers
 *
 * Tools (22):
 *   get_oauth_token         — mint/return a cached OAuth bearer (exposed for inspection)
 *   send_pix                — initiate an outbound Pix payment
 *   create_pix_qr           — create a dynamic Pix charge + QR (cob)
 *   get_pix                 — retrieve a Pix by endToEndId
 *   resolve_dict_key        — resolve a DICT key to account data
 *   refund_pix              — refund / devolução of a received Pix
 *   list_pix_received       — list Pix received during a period (BACEN /pix)
 *   create_pix_due_charge   — create a Pix charge with due date (cobv)
 *   get_pix_due_charge      — retrieve a Pix due charge by txid
 *   update_pix_due_charge   — patch a Pix due charge (cobv)
 *   register_dict_key       — register a DICT key owned by the merchant
 *   delete_dict_key         — delete/unlink a DICT key owned by the merchant
 *   create_boleto           — issue a boleto
 *   get_boleto              — retrieve a boleto by id / nosso_numero
 *   list_boletos            — list boletos by status/period
 *   get_boleto_pdf          — download the boleto PDF (base64)
 *   cancel_boleto           — cancel (baixa) a boleto
 *   get_statement           — account statement transactions
 *   get_account_balance     — current account balance (saldo)
 *   transfer_ted            — TED/TEF transfer to a bank account
 *   arrecadacao_pay         — pay a utility / concessionária bill
 *   pay_tax_darf            — pay a tax (DARF/GRU) bill
 *
 * Authentication
 *   OAuth 2.0 client_credentials + mandatory mTLS. BACEN requires mTLS for
 *   Pix v2, and Bradesco's Developer Portal enforces it across product
 *   families. This server loads the client cert + key from disk (paths via
 *   env) and routes all HTTPS requests through a Node https.Agent that
 *   presents them.
 *
 * Version: 0.2.0-alpha.1
 *   developers.bradesco.com.br is contract-gated — full OpenAPI specs are
 *   only visible to onboarded merchants. Endpoint paths below are best-guess
 *   based on (a) BACEN Pix v2 standard paths, (b) Bradesco public marketing
 *   / integration guides, and (c) conventions shared with peers (Itaú,
 *   Santander, BB). Every path that has not been byte-verified is marked
 *   TODO(verify). Consumers should treat 0.1.x as alpha and pin to exact
 *   versions.
 *
 * Environment
 *   BRADESCO_CLIENT_ID      OAuth client id
 *   BRADESCO_CLIENT_SECRET  OAuth client secret
 *   BRADESCO_CERT_PATH      path to mTLS client cert (.crt/.pem)
 *   BRADESCO_KEY_PATH       path to mTLS private key (.key/.pem)
 *   BRADESCO_ENV            "sandbox" | "production" (default: sandbox)
 *
 * Docs: https://developers.bradesco.com.br
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

const CLIENT_ID = process.env.BRADESCO_CLIENT_ID || "";
const CLIENT_SECRET = process.env.BRADESCO_CLIENT_SECRET || "";
const CERT_PATH = process.env.BRADESCO_CERT_PATH || "";
const KEY_PATH = process.env.BRADESCO_KEY_PATH || "";
const BRADESCO_ENV = (process.env.BRADESCO_ENV || "sandbox").toLowerCase();

// TODO(verify): Bradesco publishes distinct sandbox/prod hosts to onboarded
// merchants. Public references point to `proxy.api.prebanco.com.br` for
// production and `apihom-bradescorip.bradesco.com.br` (or a variant under
// the .prebanco.com.br domain) for homologação. Exact host + basePath are
// contract-gated — override via forked build if your portal provisioning
// differs.
const BASE_URL = BRADESCO_ENV === "production"
  ? "https://proxy.api.prebanco.com.br"
  : "https://apihom-bradescorip.bradesco.com.br";

// Lazy-load the mTLS agent so `--help` / schema introspection doesn't crash
// when certs are missing. Banking ops that actually hit the wire will fail
// loudly with a clear message if certs are unset.
let mtlsAgent: HttpsAgent | null = null;
function getMtlsAgent(): HttpsAgent {
  if (mtlsAgent) return mtlsAgent;
  if (!CERT_PATH || !KEY_PATH) {
    throw new Error(
      "Bradesco mTLS certificates are required. Set BRADESCO_CERT_PATH and BRADESCO_KEY_PATH " +
      "to the client cert and private-key files issued by Bradesco's Developer Portal."
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
  // TODO(verify): token path. Bradesco's portal commonly exposes
  // /auth/server/v1.1/token or /oauth/token for client_credentials; some
  // products require a signed client_assertion (JWT) instead of Basic auth.
  // Basic auth is accepted for client_credentials in sandbox for most
  // surfaces.
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetchWithMtls(`${BASE_URL}/auth/server/v1.1/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Bradesco OAuth ${res.status}: ${await res.text()}`);
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

async function bradescoRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetchWithMtls(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "x-bradesco-correlationID": `mcp-${Date.now()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Bradesco API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-bradesco", version: "0.2.0-alpha.2" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_oauth_token",
      description: "Mint or return a cached OAuth2 client_credentials bearer token for the Bradesco Developer Portal. Exposed so agents can inspect token freshness; normal tool calls obtain tokens implicitly.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "send_pix",
      description: "Initiate an outbound Pix payment from the merchant's Bradesco account. Amount in BRL major units (e.g. '10.50').",
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
      description: "Issue a boleto via Bradesco Cobrança. Returns nosso_numero, linha_digitável, barcode, and PDF URL.",
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
          our_number: { type: "string", description: "Nosso_numero. Omit to have Bradesco assign one." },
          instructions: { type: "array", description: "Free-text instructions printed on the boleto", items: { type: "string" } },
          fine: { type: "object", description: "Multa (fine after due date): { percentage?, amount?, days_after_due? }" },
          interest: { type: "object", description: "Juros (daily interest after due date): { percentage?, amount? }" },
        },
        required: ["amount", "due_date", "payer"],
      },
    },
    {
      name: "get_boleto",
      description: "Retrieve a boleto by its Bradesco identifier (id or nosso_numero).",
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
    {
      name: "arrecadacao_pay",
      description: "Pay a utility, tax, or concessionária bill via Bradesco Arrecadação. Works with barcode (código de barras) or linha digitável.",
      inputSchema: {
        type: "object",
        properties: {
          barcode: { type: "string", description: "44-digit barcode or 47/48-digit linha digitável (digits only)" },
          amount: { type: "string", description: "Amount in BRL major units. Required when the barcode does not carry a fixed amount." },
          payer_account: { type: "string", description: "Merchant account to debit" },
          due_date: { type: "string", description: "Due date ISO-8601 (for validation against the barcode)" },
          idempotency_key: { type: "string", description: "Merchant-side idempotency key (UUID recommended)" },
        },
        required: ["barcode", "payer_account", "idempotency_key"],
      },
    },
    {
      name: "list_pix_received",
      description: "List Pix transactions received by the merchant during a period. Uses BACEN Pix v2 /pix collection with ISO-8601 bounds.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start timestamp ISO-8601 (e.g. 2026-04-01T00:00:00Z)" },
          to: { type: "string", description: "End timestamp ISO-8601" },
          cpf: { type: "string", description: "Filter by payer CPF (digits only)" },
          cnpj: { type: "string", description: "Filter by payer CNPJ (digits only)" },
          page_size: { type: "number", description: "Items per page (BACEN max 1000)" },
          page: { type: "number", description: "Page number (0-indexed per BACEN spec)" },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "create_pix_due_charge",
      description: "Create a Pix charge with a due date (cobv) — commonly used for installments and scheduled invoices. Returns txid, location URL, and EMV payload.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Merchant-generated txid (26-35 alphanumeric chars per BACEN)" },
          amount: { type: "string", description: "Original amount in BRL major units, e.g. '250.00'" },
          due_date: { type: "string", description: "Due date ISO-8601 (YYYY-MM-DD)" },
          validity_after_due: { type: "number", description: "Days after due date the QR remains payable (default 30)" },
          debtor: {
            type: "object",
            description: "Debtor (devedor) identification — required for cobv",
            properties: {
              document: { type: "string", description: "CPF or CNPJ digits only" },
              name: { type: "string" },
            },
            required: ["document", "name"],
          },
          description: { type: "string", description: "Payer-visible description (solicitacaoPagador)" },
          fine: { type: "object", description: "Multa config: { modalidade: 1|2, valorPerc: string }" },
          interest: { type: "object", description: "Juros config: { modalidade: 1..7, valorPerc: string }" },
          discount: { type: "object", description: "Desconto config: { modalidade, descontoDataFixa: [...] }" },
        },
        required: ["txid", "amount", "due_date", "debtor"],
      },
    },
    {
      name: "get_pix_due_charge",
      description: "Retrieve a Pix due charge (cobv) by txid.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Pix cobv txid" },
        },
        required: ["txid"],
      },
    },
    {
      name: "update_pix_due_charge",
      description: "Patch a Pix due charge (cobv) — revise amount, due date, discount, or debtor before payment.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Pix cobv txid to update" },
          amount: { type: "string", description: "New original amount in BRL major units" },
          due_date: { type: "string", description: "New due date (YYYY-MM-DD)" },
          validity_after_due: { type: "number", description: "New validity window in days after due date" },
          description: { type: "string", description: "New payer-visible description" },
          status: { type: "string", description: "Set 'REMOVIDA_PELO_USUARIO_RECEBEDOR' to cancel" },
        },
        required: ["txid"],
      },
    },
    {
      name: "register_dict_key",
      description: "Register a DICT key (CPF, CNPJ, email, phone, or EVP) pointing to a merchant account at Bradesco. Only the account holder may register their own key.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "DICT key value. Omit for EVP (random UUID) — set key_type='EVP'." },
          key_type: { type: "string", description: "CPF | CNPJ | EMAIL | PHONE | EVP" },
          account: { type: "string", description: "Agência-conta to link the key to" },
          account_type: { type: "string", description: "CACC (checking) | SVGS (savings) | SLRY | TRAN" },
          owner_document: { type: "string", description: "Account holder CPF/CNPJ (digits only)" },
          owner_name: { type: "string", description: "Account holder name" },
        },
        required: ["key_type", "account", "owner_document", "owner_name"],
      },
    },
    {
      name: "delete_dict_key",
      description: "Delete (unlink) a DICT key that points to a merchant account at Bradesco. BACEN enforces cooldown before re-registration.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "DICT key value to delete" },
          reason: { type: "string", description: "Reason code: USER_REQUESTED | ACCOUNT_CLOSED | FRAUD | OTHER" },
        },
        required: ["key"],
      },
    },
    {
      name: "list_boletos",
      description: "List boletos issued by the merchant filtered by status and issue/due period. Paginated.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "REGISTERED | PAID | CANCELED | EXPIRED (or Bradesco-native code)" },
          from: { type: "string", description: "Start date ISO-8601 (YYYY-MM-DD)" },
          to: { type: "string", description: "End date ISO-8601 (YYYY-MM-DD)" },
          filter_by: { type: "string", description: "'issue' to filter by issue date or 'due' by due date (default 'issue')" },
          page: { type: "number", description: "Page number (1-indexed)" },
          page_size: { type: "number", description: "Items per page (default 50)" },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "get_boleto_pdf",
      description: "Download the boleto PDF as base64. Useful for attaching to emails or portal downloads.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Boleto id or nosso_numero" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_account_balance",
      description: "Retrieve the current available balance (saldo disponível) for a merchant account.",
      inputSchema: {
        type: "object",
        properties: {
          account: { type: "string", description: "Agência-conta identifier of the merchant account" },
        },
        required: ["account"],
      },
    },
    {
      name: "transfer_ted",
      description: "Execute a TED (or TEF when intra-Bradesco) transfer from the merchant's account to a beneficiary bank account. Settles same-day before BACEN cutoff.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Amount in BRL major units, e.g. '1000.00'" },
          payer_account: { type: "string", description: "Merchant account to debit (agência-conta)" },
          beneficiary: {
            type: "object",
            description: "Beneficiary (favorecido) bank account",
            properties: {
              name: { type: "string" },
              document: { type: "string", description: "CPF or CNPJ digits only" },
              bank_ispb: { type: "string", description: "8-digit ISPB of beneficiary bank" },
              bank_compe: { type: "string", description: "3-digit compe code (alternative to ISPB)" },
              branch: { type: "string" },
              account: { type: "string" },
              account_type: { type: "string", description: "CC | PP (conta corrente | poupança)" },
            },
            required: ["name", "document", "branch", "account"],
          },
          purpose_code: { type: "string", description: "BACEN finalidade code (e.g. '10' credit to account, '1' payment)" },
          description: { type: "string", description: "Free-text description shown on the statement" },
          idempotency_key: { type: "string", description: "Merchant-side idempotency key (UUID recommended)" },
        },
        required: ["amount", "payer_account", "beneficiary", "idempotency_key"],
      },
    },
    {
      name: "pay_tax_darf",
      description: "Pay a federal tax (DARF) or union fee (GRU) via Bradesco Arrecadação. Distinct product surface from utility arrecadação because DARF/GRU require tax-code fields (código de receita, período apuração, referência).",
      inputSchema: {
        type: "object",
        properties: {
          tax_type: { type: "string", description: "DARF | DARF_SIMPLES | GRU | GPS (social security)" },
          revenue_code: { type: "string", description: "Código de receita (e.g. '0220' for IRPF mensal)" },
          amount: { type: "string", description: "Principal amount in BRL major units" },
          fine: { type: "string", description: "Multa amount (optional)" },
          interest: { type: "string", description: "Juros amount (optional)" },
          total: { type: "string", description: "Valor total a pagar (principal + multa + juros)" },
          reference: { type: "string", description: "Número de referência (required for GRU/GPS; optional for DARF)" },
          assessment_period: { type: "string", description: "Período de apuração (YYYY-MM or YYYY-MM-DD)" },
          due_date: { type: "string", description: "Vencimento ISO-8601 (YYYY-MM-DD)" },
          taxpayer_document: { type: "string", description: "CPF or CNPJ of the taxpayer (digits only)" },
          payer_account: { type: "string", description: "Merchant account to debit" },
          idempotency_key: { type: "string", description: "Merchant-side idempotency key (UUID recommended)" },
        },
        required: ["tax_type", "revenue_code", "total", "taxpayer_document", "payer_account", "idempotency_key"],
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
        // Bradesco's outbound send-pix surface may sit under /pix_payments/v1
        // or /pix/v1/pagamentos.
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("POST", "/pix_payments/v1", a), null, 2) }] };
      }
      case "create_pix_qr": {
        // TODO(verify): path. Likely /cobrancas/v2/cobrancas or BACEN /cob.
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("POST", "/cobrancas/v2/cobrancas", a), null, 2) }] };
      }
      case "get_pix": {
        const id = encodeURIComponent(String(a.end_to_end_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("GET", `/pix/v2/pix/${id}`), null, 2) }] };
      }
      case "resolve_dict_key": {
        const key = encodeURIComponent(String(a.key ?? ""));
        const qs = a.payer_document ? `?payerDocument=${encodeURIComponent(String(a.payer_document))}` : "";
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("GET", `/pix/v2/dict/${key}${qs}`), null, 2) }] };
      }
      case "refund_pix": {
        const e2e = encodeURIComponent(String(a.end_to_end_id ?? ""));
        const rid = encodeURIComponent(String(a.refund_id ?? ""));
        const body: Record<string, unknown> = {};
        if (a.amount !== undefined) body.valor = a.amount;
        if (a.reason !== undefined) body.descricao = a.reason;
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("PUT", `/pix/v2/pix/${e2e}/devolucao/${rid}`, body), null, 2) }] };
      }
      case "create_boleto": {
        // TODO(verify): path. Bradesco Cobrança API historically lives at
        // /v1/boleto/registrarBoleto (v1) and /cobranca/v2/boletos for newer
        // surfaces. The v1 path is well-documented in integration guides;
        // v2 is portal-gated.
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("POST", "/cobranca/v2/boletos", a), null, 2) }] };
      }
      case "get_boleto": {
        const id = encodeURIComponent(String(a.id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("GET", `/cobranca/v2/boletos/${id}`), null, 2) }] };
      }
      case "cancel_boleto": {
        const id = encodeURIComponent(String(a.id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("DELETE", `/cobranca/v2/boletos/${id}`), null, 2) }] };
      }
      case "get_statement": {
        const account = encodeURIComponent(String(a.account ?? ""));
        const params = new URLSearchParams();
        params.set("dataInicio", String(a.from ?? ""));
        params.set("dataFim", String(a.to ?? ""));
        if (a.page !== undefined) params.set("pagina", String(a.page));
        if (a.page_size !== undefined) params.set("tamanhoPagina", String(a.page_size));
        // TODO(verify): path. Commonly /extrato/v1/contas/{account}/transacoes.
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("GET", `/extrato/v1/contas/${account}/transacoes?${params}`), null, 2) }] };
      }
      case "arrecadacao_pay": {
        // TODO(verify): path. Bradesco Arrecadação is commonly
        // /arrecadacao/v1/pagamentos.
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("POST", "/arrecadacao/v1/pagamentos", a), null, 2) }] };
      }
      case "list_pix_received": {
        // TODO(verify): BACEN Pix v2 standard is GET /pix?inicio=...&fim=....
        // Bradesco exposes this under the Pix recebidos collection.
        const params = new URLSearchParams();
        params.set("inicio", String(a.from ?? ""));
        params.set("fim", String(a.to ?? ""));
        if (a.cpf !== undefined) params.set("cpf", String(a.cpf));
        if (a.cnpj !== undefined) params.set("cnpj", String(a.cnpj));
        if (a.page_size !== undefined) params.set("paginacao.itensPorPagina", String(a.page_size));
        if (a.page !== undefined) params.set("paginacao.paginaAtual", String(a.page));
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("GET", `/pix/v2/pix?${params}`), null, 2) }] };
      }
      case "create_pix_due_charge": {
        // TODO(verify): BACEN Pix v2 cobv uses PUT /cobv/{txid}. Bradesco may
        // expose an alias under /cobrancas/v2/cobrancas-vencimento.
        const txid = encodeURIComponent(String(a.txid ?? ""));
        const body: Record<string, unknown> = {
          calendario: { dataDeVencimento: a.due_date, validadeAposVencimento: a.validity_after_due ?? 30 },
          devedor: a.debtor,
          valor: { original: a.amount },
          chave: undefined,
          solicitacaoPagador: a.description,
        };
        if (a.fine !== undefined) (body.valor as Record<string, unknown>).multa = a.fine;
        if (a.interest !== undefined) (body.valor as Record<string, unknown>).juros = a.interest;
        if (a.discount !== undefined) (body.valor as Record<string, unknown>).desconto = a.discount;
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("PUT", `/pix/v2/cobv/${txid}`, body), null, 2) }] };
      }
      case "get_pix_due_charge": {
        const txid = encodeURIComponent(String(a.txid ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("GET", `/pix/v2/cobv/${txid}`), null, 2) }] };
      }
      case "update_pix_due_charge": {
        // TODO(verify): BACEN Pix v2 cobv update is PATCH /cobv/{txid}.
        const txid = encodeURIComponent(String(a.txid ?? ""));
        const body: Record<string, unknown> = {};
        const valor: Record<string, unknown> = {};
        if (a.amount !== undefined) valor.original = a.amount;
        if (Object.keys(valor).length > 0) body.valor = valor;
        const calendario: Record<string, unknown> = {};
        if (a.due_date !== undefined) calendario.dataDeVencimento = a.due_date;
        if (a.validity_after_due !== undefined) calendario.validadeAposVencimento = a.validity_after_due;
        if (Object.keys(calendario).length > 0) body.calendario = calendario;
        if (a.description !== undefined) body.solicitacaoPagador = a.description;
        if (a.status !== undefined) body.status = a.status;
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("PATCH", `/pix/v2/cobv/${txid}`, body), null, 2) }] };
      }
      case "register_dict_key": {
        // TODO(verify): BACEN DICT register is POST /dict/v2/entries (portal
        // spec); Bradesco surfaces it under /pix/v2/dict as well. Body shape
        // follows BACEN's ClaimRequest.
        const body: Record<string, unknown> = {
          key: a.key,
          keyType: a.key_type,
          account: {
            participant: "60746948", // Bradesco ISPB
            branch: undefined,
            accountNumber: a.account,
            accountType: a.account_type ?? "CACC",
          },
          owner: {
            type: String(a.key_type).toUpperCase() === "CNPJ" ? "LEGAL_PERSON" : "NATURAL_PERSON",
            taxIdNumber: a.owner_document,
            name: a.owner_name,
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("POST", `/pix/v2/dict`, body), null, 2) }] };
      }
      case "delete_dict_key": {
        // TODO(verify): BACEN DICT delete is DELETE /dict/v2/entries/{key}.
        const key = encodeURIComponent(String(a.key ?? ""));
        const qs = a.reason ? `?reason=${encodeURIComponent(String(a.reason))}` : "";
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("DELETE", `/pix/v2/dict/${key}${qs}`), null, 2) }] };
      }
      case "list_boletos": {
        // TODO(verify): Bradesco Cobrança listing commonly /cobranca/v2/boletos?...
        const params = new URLSearchParams();
        params.set("dataInicio", String(a.from ?? ""));
        params.set("dataFim", String(a.to ?? ""));
        if (a.status !== undefined) params.set("situacao", String(a.status));
        if (a.filter_by !== undefined) params.set("filtrarPor", String(a.filter_by));
        if (a.page !== undefined) params.set("pagina", String(a.page));
        if (a.page_size !== undefined) params.set("tamanhoPagina", String(a.page_size));
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("GET", `/cobranca/v2/boletos?${params}`), null, 2) }] };
      }
      case "get_boleto_pdf": {
        // TODO(verify): PDF download under /cobranca/v2/boletos/{id}/pdf.
        const id = encodeURIComponent(String(a.id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("GET", `/cobranca/v2/boletos/${id}/pdf`), null, 2) }] };
      }
      case "get_account_balance": {
        // TODO(verify): Open Finance-aligned path /contas/v1/contas/{account}/saldos.
        const account = encodeURIComponent(String(a.account ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("GET", `/contas/v1/contas/${account}/saldos`), null, 2) }] };
      }
      case "transfer_ted": {
        // TODO(verify): TED/TEF surface typically /transferencias/v1/ted or
        // /pagamentos/v1/transferencias. Bradesco consolidates under
        // /cashmanagement/v1/transferencias for corporate clients.
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("POST", "/cashmanagement/v1/transferencias", a), null, 2) }] };
      }
      case "pay_tax_darf": {
        // TODO(verify): Bradesco Arrecadação Tributos typically
        // /arrecadacao/v1/tributos or /pagamentos/v1/darf.
        return { content: [{ type: "text", text: JSON.stringify(await bradescoRequest("POST", "/arrecadacao/v1/tributos", a), null, 2) }] };
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
        const s = new Server({ name: "mcp-bradesco", version: "0.2.0-alpha.2" }, { capabilities: { tools: {} } });
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
