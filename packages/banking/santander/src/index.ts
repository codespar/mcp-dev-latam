#!/usr/bin/env node

/**
 * MCP Server for Santander Brasil — 3rd largest private bank in Brazil.
 *
 * Completes the top-3 BR private-bank trio alongside Itaú and Bradesco.
 * Merchants with meaningful Pix, boleto, and cash-management volume
 * integrate directly with Santander instead of going through a PSP. This
 * server exposes the four Developer Portal product families that every
 * tier-1 BR bank ships:
 *
 *   Pix          — send, receive, QR, DICT lookup, refund
 *   Cobrança     — boleto lifecycle (create, query, cancel)
 *   Arrecadação  — pay utility / tax / concessionária bills
 *   Extrato      — account statement / transactions
 *
 * Tools (22):
 *   get_oauth_token          — mint/return a cached OAuth bearer (exposed for inspection)
 *   send_pix                 — initiate an outbound Pix payment
 *   create_pix_qr            — create a dynamic Pix charge + QR (cob immediate)
 *   create_pix_cobv          — create a Pix due charge (cobv, com vencimento)
 *   get_pix_cob              — retrieve a Pix charge by txid
 *   list_pix_cob             — list Pix immediate charges by period
 *   update_pix_cob           — update / revise a Pix immediate charge (PATCH)
 *   list_pix_received        — list received Pix by period (Pix recebidos)
 *   get_pix                  — retrieve a Pix by endToEndId
 *   resolve_dict_key         — resolve a DICT key to account data
 *   register_dict_key        — register a new DICT key for the merchant
 *   delete_dict_key          — remove a merchant DICT key
 *   refund_pix               — refund / devolução of a received Pix
 *   create_boleto            — issue a boleto
 *   get_boleto               — retrieve a boleto by bill_id
 *   cancel_boleto            — cancel (baixa) a boleto
 *   download_boleto_pdf      — fetch the PDF / second-copy of a boleto
 *   get_account_balance      — get current balance for a merchant account
 *   get_statement            — account statement transactions
 *   send_ted                 — initiate a TED transfer to another bank
 *   transfer_internal        — transfer between Santander accounts (TEF / mesma instituição)
 *   arrecadacao_pay          — pay a utility / tax / concessionária bill
 *   create_openfinance_consent — create an Open Finance consent (data or payment)
 *
 * Authentication
 *   OAuth 2.0 client_credentials + mandatory mTLS. BACEN requires mTLS for
 *   Pix v2, and Santander's trust-open gateway enforces it across product
 *   families. This server loads the client cert + key from disk (paths via
 *   env) and routes all HTTPS requests through a Node https.Agent that
 *   presents them.
 *
 * Version: 0.2.0-alpha.1
 *   developer.santander.com.br is contract-gated — full OpenAPI specs are
 *   only visible to onboarded merchants. Some paths below (boleto at
 *   /collection_bill_management/v2, token at /auth/oauth/v2/token, hosts
 *   trust-open / trust-sandbox) have been verified against Santander's
 *   public integration guides. Pix / Arrecadação / Extrato paths are
 *   best-guess based on (a) BACEN Pix v2 standard paths, (b) Santander's
 *   public marketing, and (c) conventions shared with peers (Itaú,
 *   Bradesco, BB). Every path that has not been byte-verified is marked
 *   TODO(verify). Consumers should treat 0.1.x as alpha and pin to exact
 *   versions.
 *
 * Environment
 *   SANTANDER_CLIENT_ID      OAuth client id
 *   SANTANDER_CLIENT_SECRET  OAuth client secret
 *   SANTANDER_CERT_PATH      path to mTLS client cert (.crt/.pem)
 *   SANTANDER_KEY_PATH       path to mTLS private key (.key/.pem)
 *   SANTANDER_ENV            "sandbox" | "production" (default: sandbox)
 *
 * Docs: https://developer.santander.com.br
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

const CLIENT_ID = process.env.SANTANDER_CLIENT_ID || "";
const CLIENT_SECRET = process.env.SANTANDER_CLIENT_SECRET || "";
const CERT_PATH = process.env.SANTANDER_CERT_PATH || "";
const KEY_PATH = process.env.SANTANDER_KEY_PATH || "";
const SANTANDER_ENV = (process.env.SANTANDER_ENV || "sandbox").toLowerCase();

// Verified via Santander's public Cobrança v2 integration guide and
// community integrations: production traffic goes through the trust-open
// gateway, sandbox through trust-sandbox. Both enforce mTLS.
const BASE_URL = SANTANDER_ENV === "production"
  ? "https://trust-open.api.santander.com.br"
  : "https://trust-sandbox.api.santander.com.br";

// Lazy-load the mTLS agent so `--help` / schema introspection doesn't crash
// when certs are missing. Banking ops that actually hit the wire will fail
// loudly with a clear message if certs are unset.
let mtlsAgent: HttpsAgent | null = null;
function getMtlsAgent(): HttpsAgent {
  if (mtlsAgent) return mtlsAgent;
  if (!CERT_PATH || !KEY_PATH) {
    throw new Error(
      "Santander mTLS certificates are required. Set SANTANDER_CERT_PATH and SANTANDER_KEY_PATH " +
      "to the client cert and private-key files issued by Santander's Developer Portal."
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
  // Verified: Santander's trust-open gateway exposes OAuth2 client_credentials
  // at /auth/oauth/v2/token. Public integration samples confirm this path.
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
    throw new Error(`Santander OAuth ${res.status}: ${await res.text()}`);
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

async function santanderRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetchWithMtls(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "X-Application-Key": CLIENT_ID,
      "x-santander-correlationID": `mcp-${Date.now()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Santander API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-santander", version: "0.2.0-alpha.2" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_oauth_token",
      description: "Mint or return a cached OAuth2 client_credentials bearer token for the Santander Developer Portal. Exposed so agents can inspect token freshness; normal tool calls obtain tokens implicitly.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "send_pix",
      description: "Initiate an outbound Pix payment from the merchant's Santander account. Amount in BRL major units (e.g. '10.50').",
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
      description: "Issue a boleto via Santander Cobrança (collection_bill_management v2). Requires a pre-provisioned workspace_id that binds the covenant and webhook config. Returns bill_id, linha_digitável, barcode, and PDF URL.",
      inputSchema: {
        type: "object",
        properties: {
          workspace_id: { type: "string", description: "Santander workspace_id (defines convênio + webhook). Provision once via the Developer Portal." },
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
          our_number: { type: "string", description: "Nosso_numero. Omit to have Santander assign one." },
          instructions: { type: "array", description: "Free-text instructions printed on the boleto", items: { type: "string" } },
          fine: { type: "object", description: "Multa (fine after due date): { percentage?, amount?, days_after_due? }" },
          interest: { type: "object", description: "Juros (daily interest after due date): { percentage?, amount? }" },
        },
        required: ["workspace_id", "amount", "due_date", "payer"],
      },
    },
    {
      name: "get_boleto",
      description: "Retrieve a boleto by its Santander bill_id (SONDA query via collection_bill_management v2).",
      inputSchema: {
        type: "object",
        properties: {
          workspace_id: { type: "string", description: "Santander workspace_id that owns the boleto" },
          bill_id: { type: "string", description: "Santander bill_id / bank_slip identifier" },
        },
        required: ["workspace_id", "bill_id"],
      },
    },
    {
      name: "cancel_boleto",
      description: "Cancel (baixa) an outstanding boleto before payment.",
      inputSchema: {
        type: "object",
        properties: {
          workspace_id: { type: "string", description: "Santander workspace_id that owns the boleto" },
          bill_id: { type: "string", description: "Santander bill_id / bank_slip identifier" },
          reason: { type: "string", description: "Cancellation reason code or free text" },
        },
        required: ["workspace_id", "bill_id"],
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
      name: "create_pix_cobv",
      description: "Create a Pix charge with due date (cobv — cobrança com vencimento). Used for boleto-replacement flows: the payer sees a Pix QR with a due date, fine, and interest. Requires payer identification.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "26-35 char alphanumeric txid chosen by the merchant" },
          amount: { type: "string", description: "Original amount in BRL major units, e.g. '250.00'" },
          due_date: { type: "string", description: "Due date ISO-8601 (YYYY-MM-DD)" },
          validity_after_due: { type: "number", description: "Days the QR remains payable after due_date (default 30)" },
          payer: {
            type: "object",
            description: "Payer identification (mandatory for cobv)",
            properties: {
              document: { type: "string", description: "CPF or CNPJ digits only" },
              name: { type: "string" },
            },
            required: ["document", "name"],
          },
          fine: { type: "object", description: "Multa: { modalidade, valorPerc }" },
          interest: { type: "object", description: "Juros: { modalidade, valorPerc }" },
          discount: { type: "object", description: "Desconto: { modalidade, descontoDataFixa }" },
          description: { type: "string", description: "Payer-visible description" },
        },
        required: ["txid", "amount", "due_date", "payer"],
      },
    },
    {
      name: "get_pix_cob",
      description: "Retrieve a Pix immediate charge (cob) by its txid. Returns status, EMV payload, and location.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Merchant-chosen txid of the cob" },
        },
        required: ["txid"],
      },
    },
    {
      name: "list_pix_cob",
      description: "List Pix immediate charges (cob) created in a given period. Paginated; filter by status optional.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start timestamp ISO-8601 (inicio)" },
          to: { type: "string", description: "End timestamp ISO-8601 (fim)" },
          status: { type: "string", description: "Filter by cob status: ATIVA | CONCLUIDA | REMOVIDA_PELO_USUARIO_RECEBEDOR | REMOVIDA_PELO_PSP" },
          page: { type: "number", description: "Page number (paginacao.paginaAtual)" },
          page_size: { type: "number", description: "Items per page (paginacao.itensPorPagina)" },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "update_pix_cob",
      description: "Update (PATCH) an existing Pix immediate charge. Typical uses: change status to REMOVIDA_PELO_USUARIO_RECEBEDOR, adjust amount or payer info on an ATIVA charge.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "txid of the cob to update" },
          status: { type: "string", description: "New status, e.g. REMOVIDA_PELO_USUARIO_RECEBEDOR" },
          amount: { type: "string", description: "New original amount (if editable)" },
          payer: { type: "object", description: "Updated payer data (document, name)" },
          description: { type: "string", description: "Updated payer-visible description" },
        },
        required: ["txid"],
      },
    },
    {
      name: "list_pix_received",
      description: "List received Pix (Pix recebidos) in a given period. Used for reconciliation of inbound payments, including those without an associated cob.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start timestamp ISO-8601 (inicio)" },
          to: { type: "string", description: "End timestamp ISO-8601 (fim)" },
          txid: { type: "string", description: "Optional: filter by txid of originating cob" },
          cpf: { type: "string", description: "Optional: filter by payer CPF digits only" },
          cnpj: { type: "string", description: "Optional: filter by payer CNPJ digits only" },
          page: { type: "number", description: "Page number" },
          page_size: { type: "number", description: "Items per page" },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "register_dict_key",
      description: "Register a new DICT key for one of the merchant's Santander accounts. BACEN enforces ownership proof (the account document must match the key for CPF/CNPJ keys).",
      inputSchema: {
        type: "object",
        properties: {
          key_type: { type: "string", description: "CPF | CNPJ | EMAIL | PHONE | EVP" },
          key: { type: "string", description: "Key value (omit for EVP — BCB generates a UUID)" },
          account: { type: "string", description: "Merchant agência-conta that the key will point to" },
          account_type: { type: "string", description: "CACC (checking) | SVGS (savings)" },
        },
        required: ["key_type", "account"],
      },
    },
    {
      name: "delete_dict_key",
      description: "Remove (unregister) a DICT key previously registered for the merchant. Does not affect received Pix that used the key historically.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "DICT key to remove" },
        },
        required: ["key"],
      },
    },
    {
      name: "download_boleto_pdf",
      description: "Fetch the PDF (second copy / segunda via) of a registered boleto. Returns a base64-encoded PDF payload or a time-limited URL, depending on Santander's workspace config.",
      inputSchema: {
        type: "object",
        properties: {
          workspace_id: { type: "string", description: "Santander workspace_id that owns the boleto" },
          bill_id: { type: "string", description: "Santander bill_id / bank_slip identifier" },
        },
        required: ["workspace_id", "bill_id"],
      },
    },
    {
      name: "get_account_balance",
      description: "Get current available and blocked balance for a Santander merchant account.",
      inputSchema: {
        type: "object",
        properties: {
          account: { type: "string", description: "Agência-conta identifier of the merchant account" },
        },
        required: ["account"],
      },
    },
    {
      name: "send_ted",
      description: "Initiate a TED transfer from a Santander merchant account to an account at another bank. For same-day settlement within the TED cutoff window.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Amount in BRL major units, e.g. '5000.00'" },
          payer_account: { type: "string", description: "Merchant account to debit (agência-conta)" },
          payee: {
            type: "object",
            description: "Payee bank account",
            properties: {
              name: { type: "string" },
              document: { type: "string", description: "CPF or CNPJ digits only" },
              bank_ispb: { type: "string", description: "8-digit ISPB of payee's bank" },
              bank_code: { type: "string", description: "3-digit COMPE bank code (alternative to ISPB)" },
              branch: { type: "string" },
              account: { type: "string" },
              account_type: { type: "string", description: "CACC | SVGS" },
            },
            required: ["name", "document", "branch", "account"],
          },
          purpose_code: { type: "string", description: "BACEN TED finalidade code (default 1 - Crédito em Conta)" },
          idempotency_key: { type: "string", description: "Merchant-side idempotency key (UUID recommended)" },
        },
        required: ["amount", "payer_account", "payee", "idempotency_key"],
      },
    },
    {
      name: "transfer_internal",
      description: "Transfer between two Santander accounts (TEF / mesma instituição). Settles instantly and is fee-free for most covenants.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Amount in BRL major units" },
          payer_account: { type: "string", description: "Source merchant account (agência-conta)" },
          payee_account: { type: "string", description: "Destination Santander account (agência-conta)" },
          payee_document: { type: "string", description: "Destination owner CPF/CNPJ digits only" },
          description: { type: "string", description: "Free-text description on the statement" },
          idempotency_key: { type: "string", description: "Merchant-side idempotency key (UUID recommended)" },
        },
        required: ["amount", "payer_account", "payee_account", "idempotency_key"],
      },
    },
    {
      name: "create_openfinance_consent",
      description: "Create an Open Finance consent (BACEN-regulated) for data access or payment initiation against a third-party's Santander account. Returns a consent_id and authorization_url the end user must approve.",
      inputSchema: {
        type: "object",
        properties: {
          consent_type: { type: "string", description: "DATA (read account info) | PAYMENT (initiate a Pix)" },
          user_document: { type: "string", description: "End-user CPF/CNPJ digits only" },
          permissions: { type: "array", description: "Open Finance permission strings, e.g. ['ACCOUNTS_READ','RESOURCES_READ']", items: { type: "string" } },
          expiration: { type: "string", description: "Consent expiration ISO-8601 (max 12 months for data)" },
          payment: { type: "object", description: "Required for consent_type=PAYMENT: { amount, creditor: { document, name, account } }" },
        },
        required: ["consent_type", "user_document"],
      },
    },
    {
      name: "arrecadacao_pay",
      description: "Pay a utility, tax, or concessionária bill via Santander Arrecadação / Pagamento de Contas. Works with barcode (código de barras) or linha digitável.",
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
        // Santander's outbound send-pix surface may sit under a dedicated
        // /pix_payments/v1 or /pix/v1/pagamentos product family.
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("POST", "/pix_payments/v1", a), null, 2) }] };
      }
      case "create_pix_qr": {
        // TODO(verify): path. Likely /cobrancas/v2/cobrancas or BACEN /cob.
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("POST", "/cobrancas/v2/cobrancas", a), null, 2) }] };
      }
      case "get_pix": {
        const id = encodeURIComponent(String(a.end_to_end_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("GET", `/pix/v2/pix/${id}`), null, 2) }] };
      }
      case "resolve_dict_key": {
        const key = encodeURIComponent(String(a.key ?? ""));
        const qs = a.payer_document ? `?payerDocument=${encodeURIComponent(String(a.payer_document))}` : "";
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("GET", `/pix/v2/dict/${key}${qs}`), null, 2) }] };
      }
      case "refund_pix": {
        const e2e = encodeURIComponent(String(a.end_to_end_id ?? ""));
        const rid = encodeURIComponent(String(a.refund_id ?? ""));
        const body: Record<string, unknown> = {};
        if (a.amount !== undefined) body.valor = a.amount;
        if (a.reason !== undefined) body.descricao = a.reason;
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("PUT", `/pix/v2/pix/${e2e}/devolucao/${rid}`, body), null, 2) }] };
      }
      case "create_boleto": {
        // Verified: Santander Cobrança v2 lives under /collection_bill_management/v2.
        // Workspace-scoped bill registration. Public integration guides
        // document this exact base path.
        const ws = encodeURIComponent(String(a.workspace_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("POST", `/collection_bill_management/v2/workspaces/${ws}/bank_slips`, a), null, 2) }] };
      }
      case "get_boleto": {
        const ws = encodeURIComponent(String(a.workspace_id ?? ""));
        const id = encodeURIComponent(String(a.bill_id ?? ""));
        // Verified: SONDA query at /workspaces/{workspace_id}/bank_slips/{bank_slips}.
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("GET", `/collection_bill_management/v2/workspaces/${ws}/bank_slips/${id}`), null, 2) }] };
      }
      case "cancel_boleto": {
        const ws = encodeURIComponent(String(a.workspace_id ?? ""));
        const id = encodeURIComponent(String(a.bill_id ?? ""));
        // TODO(verify): cancellation semantics. Santander's v2 API uses PATCH
        // with a status mutation on the bank_slip rather than DELETE on some
        // flows; behaviour may depend on covenant config.
        const body: Record<string, unknown> = { status: "BAIXADO" };
        if (a.reason !== undefined) body.reason = a.reason;
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("PATCH", `/collection_bill_management/v2/workspaces/${ws}/bank_slips/${id}`, body), null, 2) }] };
      }
      case "get_statement": {
        const account = encodeURIComponent(String(a.account ?? ""));
        const params = new URLSearchParams();
        params.set("initialDate", String(a.from ?? ""));
        params.set("finalDate", String(a.to ?? ""));
        if (a.page !== undefined) params.set("_offset", String(a.page));
        if (a.page_size !== undefined) params.set("_limit", String(a.page_size));
        // TODO(verify): path. Santander Extrato commonly lives under
        // /bank_account_information/v1 or /extrato/v1/contas/{account}.
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("GET", `/bank_account_information/v1/accounts/${account}/statements?${params}`), null, 2) }] };
      }
      case "create_pix_cobv": {
        // TODO(verify): Santander gated path. BACEN Pix v2 standard is
        // PUT /pix/v2/cobv/{txid}. Santander's psp-side product may expose
        // this under /cobv_management/v1 — confirm via contract.
        const txid = encodeURIComponent(String(a.txid ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("PUT", `/pix/v2/cobv/${txid}`, a), null, 2) }] };
      }
      case "get_pix_cob": {
        // TODO(verify): BACEN Pix v2 standard path; Santander alignment assumed.
        const txid = encodeURIComponent(String(a.txid ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("GET", `/pix/v2/cob/${txid}`), null, 2) }] };
      }
      case "list_pix_cob": {
        // TODO(verify): BACEN standard GET /cob with inicio/fim query params.
        const params = new URLSearchParams();
        params.set("inicio", String(a.from ?? ""));
        params.set("fim", String(a.to ?? ""));
        if (a.status !== undefined) params.set("status", String(a.status));
        if (a.page !== undefined) params.set("paginacao.paginaAtual", String(a.page));
        if (a.page_size !== undefined) params.set("paginacao.itensPorPagina", String(a.page_size));
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("GET", `/pix/v2/cob?${params}`), null, 2) }] };
      }
      case "update_pix_cob": {
        // TODO(verify): BACEN standard PATCH /cob/{txid}.
        const txid = encodeURIComponent(String(a.txid ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("PATCH", `/pix/v2/cob/${txid}`, a), null, 2) }] };
      }
      case "list_pix_received": {
        // TODO(verify): BACEN standard GET /pix with inicio/fim. Santander may
        // expose this under /pix_collection/v1/received on the merchant side.
        const params = new URLSearchParams();
        params.set("inicio", String(a.from ?? ""));
        params.set("fim", String(a.to ?? ""));
        if (a.txid !== undefined) params.set("txid", String(a.txid));
        if (a.cpf !== undefined) params.set("cpf", String(a.cpf));
        if (a.cnpj !== undefined) params.set("cnpj", String(a.cnpj));
        if (a.page !== undefined) params.set("paginacao.paginaAtual", String(a.page));
        if (a.page_size !== undefined) params.set("paginacao.itensPorPagina", String(a.page_size));
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("GET", `/pix/v2/pix?${params}`), null, 2) }] };
      }
      case "register_dict_key": {
        // TODO(verify): Santander merchant-side DICT registration path.
        // BACEN DICT API uses POST /entries under the PSP; merchant-facing
        // gateway typically wraps it at /pix/v2/dict or /dict/v1/keys.
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("POST", "/pix/v2/dict", a), null, 2) }] };
      }
      case "delete_dict_key": {
        // TODO(verify): paired with register_dict_key above.
        const key = encodeURIComponent(String(a.key ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("DELETE", `/pix/v2/dict/${key}`), null, 2) }] };
      }
      case "download_boleto_pdf": {
        // TODO(verify): Santander Cobrança v2 second-copy endpoint. Public
        // docs reference GET /workspaces/{ws}/bank_slips/{id}/bank_slips_pdf
        // for some covenants; others return the PDF inline on the main GET.
        const ws = encodeURIComponent(String(a.workspace_id ?? ""));
        const id = encodeURIComponent(String(a.bill_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("GET", `/collection_bill_management/v2/workspaces/${ws}/bank_slips/${id}/bank_slips_pdf`), null, 2) }] };
      }
      case "get_account_balance": {
        // TODO(verify): path. Santander bundles balance under the account
        // information product; common path is /bank_account_information/v1/accounts/{acc}/balances.
        const account = encodeURIComponent(String(a.account ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("GET", `/bank_account_information/v1/accounts/${account}/balances`), null, 2) }] };
      }
      case "send_ted": {
        // TODO(verify): Santander TED product path. Common convention across
        // tier-1 BR banks is /transfers/v1/ted or /payments/v1/ted.
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("POST", "/transfers/v1/ted", a), null, 2) }] };
      }
      case "transfer_internal": {
        // TODO(verify): Santander TEF / same-institution transfer path.
        // Commonly /transfers/v1/tef or /transfers/v1/internal.
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("POST", "/transfers/v1/internal", a), null, 2) }] };
      }
      case "create_openfinance_consent": {
        // TODO(verify): Santander Open Finance consent path. BACEN Open Finance
        // standard is POST /consents/v3/consents (data) or
        // /payments/v4/consents (payment). Santander exposes both behind the
        // trust-open gateway under /open-banking/ or /open-finance/.
        const path = String(a.consent_type ?? "").toUpperCase() === "PAYMENT"
          ? "/open-banking/payments/v4/consents"
          : "/open-banking/consents/v3/consents";
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("POST", path, a), null, 2) }] };
      }
      case "arrecadacao_pay": {
        // TODO(verify): path. Public Santander guides document the product
        // under "API de Pagamento de Contas"; exact base path is gated.
        // Common convention: /bill_payment/v1/payments.
        return { content: [{ type: "text", text: JSON.stringify(await santanderRequest("POST", "/bill_payment/v1/payments", a), null, 2) }] };
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
        const s = new Server({ name: "mcp-santander", version: "0.2.0-alpha.2" }, { capabilities: { tools: {} } });
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
