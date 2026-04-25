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
 * Tools (23):
 *   get_oauth_token       — mint/return a cached OAuth bearer (exposed for inspection)
 *   send_pix              — initiate an outbound Pix payment
 *   create_pix_qr         — create a dynamic Pix charge + QR (cob)
 *   get_pix_charge        — retrieve a Pix immediate charge (cob) by txid
 *   update_pix_charge     — update a Pix immediate charge (cob) by txid (PATCH)
 *   list_pix_charges      — list Pix immediate charges (cob) by date range / status
 *   create_pix_due_charge — create a Pix due-date charge (cobv) with payer data
 *   get_pix_due_charge    — retrieve a Pix due-date charge (cobv) by txid
 *   list_pix_received     — list received Pix transactions by date range
 *   get_pix               — retrieve a Pix by endToEndId
 *   resolve_dict_key      — resolve a DICT key (CPF, CNPJ, email, phone, EVP) to account data
 *   register_dict_key     — register a DICT key owned by the merchant
 *   delete_dict_key       — delete (unregister) a DICT key owned by the merchant
 *   refund_pix            — refund / devolução of a received Pix
 *   create_boleto         — issue a boleto via Caixa Cobrança (SICOB)
 *   get_boleto            — retrieve a boleto by id / nosso_numero
 *   cancel_boleto         — cancel (baixa) a boleto
 *   download_boleto_pdf   — fetch the rendered boleto PDF URL / bytes
 *   get_account_balance   — current balance and available limits for a merchant account
 *   get_statement         — account statement transactions
 *   transfer_ted          — outbound TED to an external bank account
 *   consult_fgts          — FGTS balance / extrato consulta (worker/employer view)
 *   pay_tribute           — pay a federal tribute (DARF / GPS / GRU) via Caixa arrecadação
 *
 * Authentication
 *   OAuth 2.0 client_credentials + mandatory mTLS. BACEN requires mTLS for
 *   Pix v2, and Caixa's Developer Portal enforces it across product families.
 *   This server loads the client cert + key from disk (paths via env) and
 *   routes all HTTPS requests through a Node https.Agent that presents them.
 *
 * Version: 0.2.0-alpha.1
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
  { name: "mcp-caixa", version: "0.2.0-alpha.2" },
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
    {
      name: "get_pix_charge",
      description: "Retrieve a Pix immediate charge (cob) by its BCB txid. Returns status, QR payload, and associated received Pix (if paid).",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "BCB txid (26-35 alphanumeric chars)" },
        },
        required: ["txid"],
      },
    },
    {
      name: "update_pix_charge",
      description: "Update (PATCH) a Pix immediate charge (cob) — e.g. change amount before payment, adjust expiration, or mark as REMOVIDA_PELO_USUARIO_RECEBEDOR.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "BCB txid of the charge to update" },
          amount: { type: "string", description: "New amount in BRL major units (optional)" },
          status: { type: "string", description: "New status: ATIVA | REMOVIDA_PELO_USUARIO_RECEBEDOR" },
          expires_in: { type: "number", description: "New QR lifetime in seconds" },
          description: { type: "string", description: "Payer-visible description" },
        },
        required: ["txid"],
      },
    },
    {
      name: "list_pix_charges",
      description: "List Pix immediate charges (cob) filtered by date range and optional status / CPF / CNPJ. Paginated per BACEN Pix v2.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date-time ISO-8601 (e.g. 2025-01-01T00:00:00Z)" },
          to: { type: "string", description: "End date-time ISO-8601" },
          status: { type: "string", description: "Filter by status: ATIVA | CONCLUIDA | REMOVIDA_PELO_USUARIO_RECEBEDOR | REMOVIDA_PELO_PSP" },
          cpf: { type: "string", description: "Filter by payer CPF (digits only)" },
          cnpj: { type: "string", description: "Filter by payer CNPJ (digits only)" },
          page: { type: "number", description: "Page number (0-indexed per BACEN)" },
          page_size: { type: "number", description: "Items per page" },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "create_pix_due_charge",
      description: "Create a Pix due-date charge (cobv) with mandatory payer data and due date. Supports fine, interest, discount, and abatement fields.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Merchant-provided BCB txid (26-35 alphanumeric)" },
          amount: { type: "string", description: "Original amount in BRL major units" },
          due_date: { type: "string", description: "Due date ISO-8601 (YYYY-MM-DD)" },
          validity_after_due: { type: "number", description: "Days the charge remains payable after due date" },
          payer: {
            type: "object",
            description: "Payer (devedor) — required by BACEN for cobv",
            properties: {
              document: { type: "string", description: "CPF or CNPJ digits only" },
              name: { type: "string" },
              email: { type: "string" },
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
          fine: { type: "object", description: "Multa: { modalidade: 1|2, valorPerc: string }" },
          interest: { type: "object", description: "Juros: { modalidade: 1..7, valorPerc: string }" },
          discount: { type: "object", description: "Desconto: { modalidade, descontoDataFixa: [...] }" },
          description: { type: "string", description: "Payer-visible description" },
        },
        required: ["txid", "amount", "due_date", "payer"],
      },
    },
    {
      name: "get_pix_due_charge",
      description: "Retrieve a Pix due-date charge (cobv) by its BCB txid.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "BCB txid" },
        },
        required: ["txid"],
      },
    },
    {
      name: "list_pix_received",
      description: "List received Pix transactions (pix recebidos) by date range. Useful for reconciliation against cob/cobv charges.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date-time ISO-8601" },
          to: { type: "string", description: "End date-time ISO-8601" },
          txid: { type: "string", description: "Optional txid filter" },
          cpf: { type: "string", description: "Optional payer CPF filter" },
          cnpj: { type: "string", description: "Optional payer CNPJ filter" },
          page: { type: "number", description: "Page number (0-indexed per BACEN)" },
          page_size: { type: "number", description: "Items per page" },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "register_dict_key",
      description: "Register a DICT key (CPF, CNPJ, email, phone, or EVP) to an account owned by the merchant. Subject to BACEN portability flow for keys claimed elsewhere.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "DICT key value. Omit / use EVP to request a random UUID key." },
          key_type: { type: "string", description: "Key type: CPF | CNPJ | EMAIL | PHONE | EVP" },
          account: {
            type: "object",
            description: "Account the key should resolve to",
            properties: {
              bank_ispb: { type: "string", description: "8-digit ISPB (Caixa = 00360305)" },
              branch: { type: "string", description: "Agência digits" },
              account_number: { type: "string", description: "Account digits" },
              account_type: { type: "string", description: "CACC (corrente) | SVGS (poupança) | SLRY (salário) | TRAN (pagamento)" },
              owner_document: { type: "string", description: "CPF or CNPJ of the account owner" },
              owner_name: { type: "string" },
            },
            required: ["bank_ispb", "branch", "account_number", "account_type", "owner_document", "owner_name"],
          },
        },
        required: ["key_type", "account"],
      },
    },
    {
      name: "delete_dict_key",
      description: "Delete (unregister) a DICT key owned by the merchant. The key must belong to a Caixa account under the merchant's contract.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "DICT key to delete" },
        },
        required: ["key"],
      },
    },
    {
      name: "download_boleto_pdf",
      description: "Fetch the rendered boleto PDF for an issued boleto. Returns the PDF URL (or base64 bytes) so it can be attached to an invoice or email.",
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
      description: "Return the current balance for a Caixa merchant account, including available, blocked, and overdraft limit if present.",
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
      description: "Initiate an outbound TED transfer from a Caixa merchant account to an external bank account. Settles same-day within BACEN TED windows.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Amount in BRL major units" },
          payer_account: { type: "string", description: "Source Caixa account (agência-conta)" },
          beneficiary: {
            type: "object",
            description: "TED beneficiary data",
            properties: {
              name: { type: "string" },
              document: { type: "string", description: "CPF or CNPJ digits only" },
              bank_ispb: { type: "string", description: "8-digit ISPB of destination bank" },
              bank_code: { type: "string", description: "3-digit COMPE code (optional; ISPB preferred)" },
              branch: { type: "string" },
              account: { type: "string" },
              account_type: { type: "string", description: "CC | PP | SAL (default CC)" },
            },
            required: ["name", "document", "bank_ispb", "branch", "account"],
          },
          purpose: { type: "string", description: "Finalidade TED code (e.g. 1=Crédito em Conta)" },
          description: { type: "string", description: "Free-text description (max 140 chars)" },
          idempotency_key: { type: "string", description: "Merchant-side idempotency key (UUID recommended)" },
        },
        required: ["amount", "payer_account", "beneficiary", "idempotency_key"],
      },
    },
    {
      name: "consult_fgts",
      description: "Query FGTS balance / extrato. Caixa is the sole operator of FGTS (Fundo de Garantia do Tempo de Serviço) and exposes worker-side and employer-side queries through dedicated product contracts.",
      inputSchema: {
        type: "object",
        properties: {
          worker_document: { type: "string", description: "CPF of the worker (digits only)" },
          pis_pasep: { type: "string", description: "NIS / PIS / PASEP number (optional, improves lookup)" },
          employer_cnpj: { type: "string", description: "Employer CNPJ — required for employer-side consults" },
          from: { type: "string", description: "Start competency YYYY-MM for extrato (optional)" },
          to: { type: "string", description: "End competency YYYY-MM for extrato (optional)" },
        },
        required: ["worker_document"],
      },
    },
    {
      name: "pay_tribute",
      description: "Pay a federal tribute (DARF, GPS, GRU) or other guia de arrecadação via Caixa. Input is the full 44/47-digit barcode or linha digitável plus debit account. Requires arrecadação contract.",
      inputSchema: {
        type: "object",
        properties: {
          barcode: { type: "string", description: "44-digit barcode OR 47/48-digit linha digitável (digits only)" },
          kind: { type: "string", description: "Tribute kind hint: DARF | GPS | GRU | FGTS_GRRF | OUTROS" },
          payer_account: { type: "string", description: "Caixa account to debit (agência-conta)" },
          due_date: { type: "string", description: "Original due date ISO-8601 (YYYY-MM-DD) — used when barcode does not carry it" },
          amount: { type: "string", description: "Amount to pay in BRL major units (required when barcode has 0000000 amount)" },
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
      case "get_pix_charge": {
        // TODO(verify): BACEN Pix v2 standard path is GET /cob/{txid}; Caixa
        // commonly exposes it under /pix/v2/cob for onboarded merchants.
        const txid = encodeURIComponent(String(a.txid ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("GET", `/pix/v2/cob/${txid}`), null, 2) }] };
      }
      case "update_pix_charge": {
        // TODO(verify): BACEN Pix v2 standard path is PATCH /cob/{txid}.
        const txid = encodeURIComponent(String(a.txid ?? ""));
        const body: Record<string, unknown> = {};
        if (a.amount !== undefined) body.valor = { original: a.amount };
        if (a.status !== undefined) body.status = a.status;
        if (a.expires_in !== undefined) body.calendario = { expiracao: a.expires_in };
        if (a.description !== undefined) body.solicitacaoPagador = a.description;
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("PATCH", `/pix/v2/cob/${txid}`, body), null, 2) }] };
      }
      case "list_pix_charges": {
        // TODO(verify): BACEN Pix v2 standard path is GET /cob with
        // inicio/fim query params (ISO-8601 date-times).
        const params = new URLSearchParams();
        params.set("inicio", String(a.from ?? ""));
        params.set("fim", String(a.to ?? ""));
        if (a.status !== undefined) params.set("status", String(a.status));
        if (a.cpf !== undefined) params.set("cpf", String(a.cpf));
        if (a.cnpj !== undefined) params.set("cnpj", String(a.cnpj));
        if (a.page !== undefined) params.set("paginacao.paginaAtual", String(a.page));
        if (a.page_size !== undefined) params.set("paginacao.itensPorPagina", String(a.page_size));
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("GET", `/pix/v2/cob?${params}`), null, 2) }] };
      }
      case "create_pix_due_charge": {
        // TODO(verify): BACEN Pix v2 standard path is PUT /cobv/{txid}.
        const txid = encodeURIComponent(String(a.txid ?? ""));
        const { txid: _t, ...rest } = a;
        void _t;
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("PUT", `/pix/v2/cobv/${txid}`, rest), null, 2) }] };
      }
      case "get_pix_due_charge": {
        // TODO(verify): BACEN Pix v2 standard path is GET /cobv/{txid}.
        const txid = encodeURIComponent(String(a.txid ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("GET", `/pix/v2/cobv/${txid}`), null, 2) }] };
      }
      case "list_pix_received": {
        // TODO(verify): BACEN Pix v2 standard path is GET /pix with
        // inicio/fim query params.
        const params = new URLSearchParams();
        params.set("inicio", String(a.from ?? ""));
        params.set("fim", String(a.to ?? ""));
        if (a.txid !== undefined) params.set("txid", String(a.txid));
        if (a.cpf !== undefined) params.set("cpf", String(a.cpf));
        if (a.cnpj !== undefined) params.set("cnpj", String(a.cnpj));
        if (a.page !== undefined) params.set("paginacao.paginaAtual", String(a.page));
        if (a.page_size !== undefined) params.set("paginacao.itensPorPagina", String(a.page_size));
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("GET", `/pix/v2/pix?${params}`), null, 2) }] };
      }
      case "register_dict_key": {
        // TODO(verify): DICT write paths are PSP-scoped; Caixa exposes them
        // under /pix/v2/dict for onboarded merchants. BACEN CID flow may
        // require additional headers (`x-pi-cid`, consent ID) in production.
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("POST", "/pix/v2/dict", a), null, 2) }] };
      }
      case "delete_dict_key": {
        // TODO(verify): DELETE /pix/v2/dict/{key} — only callable for keys
        // owned by the merchant's Caixa account.
        const key = encodeURIComponent(String(a.key ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("DELETE", `/pix/v2/dict/${key}`), null, 2) }] };
      }
      case "download_boleto_pdf": {
        // TODO(verify): SICOB commonly exposes the rendered PDF under
        // /cobranca/v2/boletos/{id}/pdf. Some Caixa contracts return a
        // signed URL; others stream application/pdf bytes.
        const id = encodeURIComponent(String(a.id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("GET", `/cobranca/v2/boletos/${id}/pdf`), null, 2) }] };
      }
      case "get_account_balance": {
        // TODO(verify): Commonly /extrato/v1/contas/{account}/saldo.
        const account = encodeURIComponent(String(a.account ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("GET", `/extrato/v1/contas/${account}/saldo`), null, 2) }] };
      }
      case "transfer_ted": {
        // TODO(verify): TED outbound sits under /transferencias/v1/ted for
        // onboarded merchants; Caixa also exposes an inter-conta endpoint
        // under /transferencias/v1/internas for same-bank moves.
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("POST", "/transferencias/v1/ted", a), null, 2) }] };
      }
      case "consult_fgts": {
        // TODO(verify): FGTS worker query is commonly /fgts/v1/trabalhadores/{cpf}
        // and employer query is /fgts/v1/empregadores/{cnpj}/extrato. Contract
        // gating differs — worker-side FGTS requires a citizen-authorization
        // flow that is out of scope for this server.
        const cpf = encodeURIComponent(String(a.worker_document ?? ""));
        const params = new URLSearchParams();
        if (a.pis_pasep !== undefined) params.set("nis", String(a.pis_pasep));
        if (a.employer_cnpj !== undefined) params.set("cnpjEmpregador", String(a.employer_cnpj));
        if (a.from !== undefined) params.set("competenciaInicio", String(a.from));
        if (a.to !== undefined) params.set("competenciaFim", String(a.to));
        const qs = params.toString() ? `?${params}` : "";
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("GET", `/fgts/v1/trabalhadores/${cpf}${qs}`), null, 2) }] };
      }
      case "pay_tribute": {
        // TODO(verify): Arrecadação (DARF/GPS/GRU) payment commonly sits
        // under /arrecadacao/v1/pagamentos; input is the full barcode or
        // linha digitável. Requires a separate arrecadação contract on top
        // of the baseline merchant contract.
        return { content: [{ type: "text", text: JSON.stringify(await caixaRequest("POST", "/arrecadacao/v1/pagamentos", a), null, 2) }] };
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
        const s = new Server({ name: "mcp-caixa", version: "0.2.0-alpha.2" }, { capabilities: { tools: {} } });
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
