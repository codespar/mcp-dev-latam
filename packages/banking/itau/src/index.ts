#!/usr/bin/env node

/**
 * MCP Server for Itaú Unibanco — Brazil's largest private bank.
 *
 * Merchants doing high-volume Pix, boleto, and cash management integrate
 * directly with Itaú instead of going through a PSP. This server exposes
 * the four Developer Portal product families:
 *
 *   Pix          — send, receive, QR, DICT lookup, refund
 *   Cobrança     — boleto lifecycle (create, query, cancel)
 *   Arrecadação  — pay utility / tax / concessionária bills
 *   Extrato      — account statement / transactions
 *
 * Tools (22):
 *   get_oauth_token          — mint/return a cached OAuth bearer (exposed for inspection)
 *   send_pix                 — initiate an outbound Pix payment
 *   create_pix_qr            — create a dynamic Pix charge + QR (cob)
 *   create_pix_cobv          — create a dynamic Pix charge with due date (cobv)
 *   list_pix_charges         — list immediate Pix charges (cob) by date range
 *   get_pix                  — retrieve a Pix by endToEndId
 *   resolve_dict_key         — resolve a DICT key (CPF, CNPJ, email, phone, EVP) to account data
 *   register_pix_key         — register a DICT key owned by the merchant
 *   delete_pix_key           — delete a DICT key owned by the merchant
 *   list_pix_keys            — list DICT keys owned by the merchant
 *   refund_pix               — refund / devolução of a received Pix
 *   create_boleto            — issue a boleto
 *   get_boleto               — retrieve a boleto by id / nosso_numero
 *   get_boleto_pdf           — download the boleto PDF (base64)
 *   cancel_boleto            — cancel (baixa) a boleto
 *   get_statement            — account statement transactions
 *   arrecadacao_pay          — pay a utility / tax / concessionária bill
 *   send_ted                 — send a TED transfer to another bank
 *   transfer_between_accounts — TAA: transfer between Itaú accounts
 *   get_tariffs              — query applicable tariffs for merchant products
 *   list_dda_bills           — list bills registered under the merchant's DDA enrolment
 *   schedule_payment         — schedule a future-dated payment (Pix/boleto/arrecadação)
 *
 * Authentication
 *   OAuth 2.0 client_credentials + mandatory mTLS. BACEN requires mTLS for
 *   Pix v2, and Itaú's Developer Portal enforces it across product families.
 *   This server loads the client cert + key from disk (paths via env) and
 *   routes all HTTPS requests through a Node https.Agent that presents them.
 *
 * Version: 0.2.0-alpha.1
 *   Itaú's devportal.itau.com.br is contract-gated — full OpenAPI specs are
 *   only visible to onboarded merchants. Endpoint paths below are best-guess
 *   based on (a) BACEN Pix v2 standard paths, (b) Itaú public marketing
 *   pages, and (c) conventions shared with peers (Santander, Bradesco, BB).
 *   Every path that has not been byte-verified is marked TODO(verify).
 *   Consumers should treat 0.1.x as alpha and pin to exact versions.
 *
 * Environment
 *   ITAU_CLIENT_ID      OAuth client id
 *   ITAU_CLIENT_SECRET  OAuth client secret
 *   ITAU_CERT_PATH      path to mTLS client cert (.crt/.pem)
 *   ITAU_KEY_PATH       path to mTLS private key (.key/.pem)
 *   ITAU_ENV            "sandbox" | "production" (default: sandbox)
 *
 * Docs: https://devportal.itau.com.br
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

const CLIENT_ID = process.env.ITAU_CLIENT_ID || "";
const CLIENT_SECRET = process.env.ITAU_CLIENT_SECRET || "";
const CERT_PATH = process.env.ITAU_CERT_PATH || "";
const KEY_PATH = process.env.ITAU_KEY_PATH || "";
const ITAU_ENV = (process.env.ITAU_ENV || "sandbox").toLowerCase();

// TODO(verify): sandbox base URL. Itaú publishes a separate sandbox subdomain
// to onboarded merchants; the exact host is contract-gated.
const BASE_URL = ITAU_ENV === "production"
  ? "https://api.itau.com.br"
  : "https://sandbox.api.itau.com.br";

// Lazy-load the mTLS agent so `--help` / schema introspection doesn't crash
// when certs are missing. Banking ops that actually hit the wire will fail
// loudly with a clear message if certs are unset.
let mtlsAgent: HttpsAgent | null = null;
function getMtlsAgent(): HttpsAgent {
  if (mtlsAgent) return mtlsAgent;
  if (!CERT_PATH || !KEY_PATH) {
    throw new Error(
      "Itaú mTLS certificates are required. Set ITAU_CERT_PATH and ITAU_KEY_PATH " +
      "to the client cert and private-key files issued by Itaú's Developer Portal."
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
  // TODO(verify): token path. Itaú commonly exposes /auth/v1/token or
  // /api/oauth/token; client-assertion JWT is preferred for high-trust flows
  // but Basic auth is accepted for client_credentials in sandbox.
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetchWithMtls(`${BASE_URL}/auth/v1/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Itaú OAuth ${res.status}: ${await res.text()}`);
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

async function itauRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetchWithMtls(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "x-itau-correlationID": `mcp-${Date.now()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Itaú API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-itau", version: "0.2.0-alpha.2" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_oauth_token",
      description: "Mint or return a cached OAuth2 client_credentials bearer token for the Itaú Developer Portal. Exposed so agents can inspect token freshness; normal tool calls obtain tokens implicitly.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "send_pix",
      description: "Initiate an outbound Pix payment from the merchant's Itaú account. Amount in BRL major units (e.g. '10.50').",
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
      description: "Issue a boleto via Itaú Cobrança. Returns nosso_numero, linha_digitável, barcode, and PDF URL.",
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
          our_number: { type: "string", description: "Nosso_numero. Omit to have Itaú assign one." },
          instructions: { type: "array", description: "Free-text instructions printed on the boleto", items: { type: "string" } },
          fine: { type: "object", description: "Multa (fine after due date): { percentage?, amount?, days_after_due? }" },
          interest: { type: "object", description: "Juros (daily interest after due date): { percentage?, amount? }" },
        },
        required: ["amount", "due_date", "payer"],
      },
    },
    {
      name: "get_boleto",
      description: "Retrieve a boleto by its Itaú identifier (id or nosso_numero).",
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
      description: "Pay a utility, tax, or concessionária bill via Itaú Arrecadação. Works with barcode (código de barras) or linha digitável.",
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
        },
        required: ["amount", "due_date", "payer"],
      },
    },
    {
      name: "list_pix_charges",
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
      name: "register_pix_key",
      description: "Register a DICT key (CPF, CNPJ, email, phone, or EVP) on an Itaú account owned by the merchant. Subject to BCB validation flows (e.g. email/SMS confirmation for email/phone keys).",
      inputSchema: {
        type: "object",
        properties: {
          key_type: { type: "string", description: "DICT key type: CPF | CNPJ | EMAIL | PHONE | EVP" },
          key: { type: "string", description: "The key value. Omit for EVP (Itaú generates the UUID)." },
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
      description: "Delete a DICT key owned by the merchant. Irreversible — the key becomes available for re-registration by any PSP after BCB lockout window.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "DICT key value to delete" },
        },
        required: ["key"],
      },
    },
    {
      name: "list_pix_keys",
      description: "List DICT keys currently registered to the merchant's Itaú accounts.",
      inputSchema: {
        type: "object",
        properties: {
          account: { type: "string", description: "Optional agência-conta filter" },
        },
      },
    },
    {
      name: "get_boleto_pdf",
      description: "Download the PDF of an issued boleto. Returns the document as base64 (content-type application/pdf).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Boleto id or nosso_numero" },
        },
        required: ["id"],
      },
    },
    {
      name: "send_ted",
      description: "Send a TED transfer to an account at another bank. Same-day settlement within banking hours; otherwise queued.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Amount in BRL major units, e.g. '1500.00'" },
          payer_account: { type: "string", description: "Merchant account to debit (agência-conta)" },
          payee: {
            type: "object",
            description: "Payee bank account",
            properties: {
              name: { type: "string" },
              document: { type: "string", description: "CPF or CNPJ digits only" },
              bank_code: { type: "string", description: "3-digit COMPE bank code (e.g. '237' Bradesco)" },
              bank_ispb: { type: "string", description: "8-digit ISPB of payee's bank (alternative to bank_code)" },
              branch: { type: "string" },
              account: { type: "string" },
              account_type: { type: "string", description: "CC (checking) | PP (savings)" },
            },
            required: ["name", "document", "branch", "account"],
          },
          purpose_code: { type: "string", description: "TED purpose code (finalidade) per BCB table — default '1' (crédito em conta)" },
          description: { type: "string", description: "Free-text description (histórico)" },
          idempotency_key: { type: "string", description: "Merchant-side idempotency key" },
        },
        required: ["amount", "payer_account", "payee", "idempotency_key"],
      },
    },
    {
      name: "transfer_between_accounts",
      description: "TAA — transfer between two Itaú accounts (owned by the merchant or a counterparty). Instant settlement, no BCB fee.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Amount in BRL major units" },
          payer_account: { type: "string", description: "Debit account (agência-conta)" },
          payee_branch: { type: "string", description: "Credit account agência" },
          payee_account: { type: "string", description: "Credit account conta" },
          payee_account_type: { type: "string", description: "CC (checking) | PP (savings)" },
          description: { type: "string", description: "Free-text description" },
          idempotency_key: { type: "string", description: "Merchant-side idempotency key" },
        },
        required: ["amount", "payer_account", "payee_branch", "payee_account", "idempotency_key"],
      },
    },
    {
      name: "get_tariffs",
      description: "Query the tariff schedule applicable to the merchant's active contracts (Pix per-transaction, boleto registration, TED, arrecadação, etc.).",
      inputSchema: {
        type: "object",
        properties: {
          product: { type: "string", description: "Optional product filter: PIX | BOLETO | TED | ARRECADACAO | EXTRATO" },
          account: { type: "string", description: "Optional agência-conta filter" },
        },
      },
    },
    {
      name: "list_dda_bills",
      description: "List bills registered for the merchant under the DDA (Débito Direto Autorizado) enrolment. Returns pending boletos/concessionária bills the merchant has opted in to.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Due-date window start (YYYY-MM-DD)" },
          to: { type: "string", description: "Due-date window end (YYYY-MM-DD)" },
          status: { type: "string", description: "PENDENTE | PAGO | VENCIDO" },
          page: { type: "number" },
          page_size: { type: "number" },
        },
      },
    },
    {
      name: "schedule_payment",
      description: "Schedule a future-dated payment (Pix, boleto, arrecadação, or TED). Itaú executes the debit on the scheduled date at D+0 cut-off.",
      inputSchema: {
        type: "object",
        properties: {
          payment_type: { type: "string", description: "PIX | BOLETO | ARRECADACAO | TED" },
          scheduled_date: { type: "string", description: "Execution date ISO-8601 (YYYY-MM-DD)" },
          amount: { type: "string", description: "Amount in BRL major units" },
          payer_account: { type: "string", description: "Merchant account to debit" },
          barcode: { type: "string", description: "Required for BOLETO / ARRECADACAO — 44/47/48-digit digitável" },
          pix: { type: "object", description: "Required for PIX — same shape as send_pix.payee + description" },
          ted: { type: "object", description: "Required for TED — same shape as send_ted.payee + purpose_code" },
          idempotency_key: { type: "string", description: "Merchant-side idempotency key" },
        },
        required: ["payment_type", "scheduled_date", "amount", "payer_account", "idempotency_key"],
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
        // Itaú's send-pix surface may sit under /pix_payments/v1.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("POST", "/pix_payments/v1", a), null, 2) }] };
      }
      case "create_pix_qr": {
        // TODO(verify): path. Likely /cobrancas/v2/cobrancas or BACEN /cob.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("POST", "/cobrancas/v2/cobrancas", a), null, 2) }] };
      }
      case "get_pix": {
        const id = encodeURIComponent(String(a.end_to_end_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("GET", `/pix/v2/pix/${id}`), null, 2) }] };
      }
      case "resolve_dict_key": {
        const key = encodeURIComponent(String(a.key ?? ""));
        const qs = a.payer_document ? `?payerDocument=${encodeURIComponent(String(a.payer_document))}` : "";
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("GET", `/pix/v2/dict/${key}${qs}`), null, 2) }] };
      }
      case "refund_pix": {
        const e2e = encodeURIComponent(String(a.end_to_end_id ?? ""));
        const rid = encodeURIComponent(String(a.refund_id ?? ""));
        const body: Record<string, unknown> = {};
        if (a.amount !== undefined) body.valor = a.amount;
        if (a.reason !== undefined) body.descricao = a.reason;
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("PUT", `/pix/v2/pix/${e2e}/devolucao/${rid}`, body), null, 2) }] };
      }
      case "create_boleto": {
        // TODO(verify): path. Itaú Cobrança v2 is documented as /cobranca/v2/boletos for onboarded merchants.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("POST", "/cobranca/v2/boletos", a), null, 2) }] };
      }
      case "get_boleto": {
        const id = encodeURIComponent(String(a.id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("GET", `/cobranca/v2/boletos/${id}`), null, 2) }] };
      }
      case "cancel_boleto": {
        const id = encodeURIComponent(String(a.id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("DELETE", `/cobranca/v2/boletos/${id}`), null, 2) }] };
      }
      case "get_statement": {
        const account = encodeURIComponent(String(a.account ?? ""));
        const params = new URLSearchParams();
        params.set("dataInicio", String(a.from ?? ""));
        params.set("dataFim", String(a.to ?? ""));
        if (a.page !== undefined) params.set("pagina", String(a.page));
        if (a.page_size !== undefined) params.set("tamanhoPagina", String(a.page_size));
        // TODO(verify): path. Commonly /extrato/v1/contas/{account}/transacoes.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("GET", `/extrato/v1/contas/${account}/transacoes?${params}`), null, 2) }] };
      }
      case "arrecadacao_pay": {
        // TODO(verify): path. Itaú Arrecadação is often /arrecadacao/v1/pagamentos.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("POST", "/arrecadacao/v1/pagamentos", a), null, 2) }] };
      }
      case "create_pix_cobv": {
        // TODO(verify): path. BACEN Pix v2 standard is POST /pix/v2/cobv for
        // due-date charges; Itaú may also expose it under /cobrancas/v2.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("POST", "/pix/v2/cobv", a), null, 2) }] };
      }
      case "list_pix_charges": {
        const params = new URLSearchParams();
        if (a.from !== undefined) params.set("inicio", String(a.from));
        if (a.to !== undefined) params.set("fim", String(a.to));
        if (a.status !== undefined) params.set("status", String(a.status));
        if (a.cpf !== undefined) params.set("cpf", String(a.cpf));
        if (a.cnpj !== undefined) params.set("cnpj", String(a.cnpj));
        if (a.page !== undefined) params.set("paginacao.paginaAtual", String(a.page));
        if (a.page_size !== undefined) params.set("paginacao.itensPorPagina", String(a.page_size));
        // TODO(verify): path. BACEN Pix v2 standard is GET /pix/v2/cob.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("GET", `/pix/v2/cob?${params}`), null, 2) }] };
      }
      case "register_pix_key": {
        // TODO(verify): path. BACEN Pix v2 DICT maintenance is POST /pix/v2/dict
        // for registration. Itaú may additionally require an ownership proof body.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("POST", "/pix/v2/dict", a), null, 2) }] };
      }
      case "delete_pix_key": {
        const key = encodeURIComponent(String(a.key ?? ""));
        // TODO(verify): path. BACEN standard is DELETE /pix/v2/dict/{key}.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("DELETE", `/pix/v2/dict/${key}`), null, 2) }] };
      }
      case "list_pix_keys": {
        const qs = a.account ? `?conta=${encodeURIComponent(String(a.account))}` : "";
        // TODO(verify): path. Not part of BACEN DICT spec; Itaú-specific listing endpoint.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("GET", `/pix/v2/dict${qs}`), null, 2) }] };
      }
      case "get_boleto_pdf": {
        const id = encodeURIComponent(String(a.id ?? ""));
        // TODO(verify): path. Typically /cobranca/v2/boletos/{id}/pdf returning application/pdf.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("GET", `/cobranca/v2/boletos/${id}/pdf`), null, 2) }] };
      }
      case "send_ted": {
        // TODO(verify): path. Itaú Cash Management TED is commonly under
        // /cash_management/v1/transferencias/ted or /pagamentos/v1/ted.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("POST", "/cash_management/v1/transferencias/ted", a), null, 2) }] };
      }
      case "transfer_between_accounts": {
        // TODO(verify): path. TAA (transferência entre contas Itaú) sits in the
        // same product family as TED: /cash_management/v1/transferencias/taa.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("POST", "/cash_management/v1/transferencias/taa", a), null, 2) }] };
      }
      case "get_tariffs": {
        const params = new URLSearchParams();
        if (a.product !== undefined) params.set("produto", String(a.product));
        if (a.account !== undefined) params.set("conta", String(a.account));
        const qs = params.toString();
        // TODO(verify): path. Itaú Tarifas query endpoint commonly /tarifas/v1/consulta.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("GET", `/tarifas/v1/consulta${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "list_dda_bills": {
        const params = new URLSearchParams();
        if (a.from !== undefined) params.set("dataInicio", String(a.from));
        if (a.to !== undefined) params.set("dataFim", String(a.to));
        if (a.status !== undefined) params.set("situacao", String(a.status));
        if (a.page !== undefined) params.set("pagina", String(a.page));
        if (a.page_size !== undefined) params.set("tamanhoPagina", String(a.page_size));
        const qs = params.toString();
        // TODO(verify): path. Itaú DDA (Débito Direto Autorizado) listing is
        // commonly /dda/v1/boletos; Febraban DDA 2.0 spec shares this shape.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("GET", `/dda/v1/boletos${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "schedule_payment": {
        // TODO(verify): path. Itaú scheduled payments (agendamentos) are
        // commonly /pagamentos/v1/agendamentos with a payment_type discriminator.
        return { content: [{ type: "text", text: JSON.stringify(await itauRequest("POST", "/pagamentos/v1/agendamentos", a), null, 2) }] };
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
        const s = new Server({ name: "mcp-itau", version: "0.2.0-alpha.2" }, { capabilities: { tools: {} } });
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
