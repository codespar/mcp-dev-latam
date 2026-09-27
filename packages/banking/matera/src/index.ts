#!/usr/bin/env node
/**
 * DEPRECATED (2026-09-27): no live endpoint. api.matera.com does not resolve.
 * No tool reaches a service. Override the host with
 * MATERA_BASE_URL if you have a working endpoint.
 *
 * MCP Server for Matera — Brazilian core-banking infrastructure (BaaS).
 *
 * Matera is core-banking rails underneath fintechs, not a PSP. Per vendor
 * case studies it processes ~10% of Brazil's Pix transactions. Its customer
 * is a fintech building on top of Pix (issuing accounts, moving money through
 * DICT, registering recurring Pix Automático agreements) — distinct from PSPs
 * like Zoop/Asaas/Mercado Pago which serve merchants accepting Pix.
 *
 * Tools (21) — Pix + DICT + accounts for v0.2:
 *
 *   Immediate Pix charges (BCB /cob)
 *     create_pix_charge_static    — static QR code (merchant Pix key, reusable)
 *     create_pix_charge_dynamic   — dynamic QR code (single-use, expiring)
 *     get_pix_charge              — fetch a charge by txid
 *     list_pix_charges            — list /cob charges with date+status filters
 *     update_pix_charge           — PATCH a /cob (revise amount/expiration/status)
 *
 *   Due-dated Pix charges (BCB /cobv — boleto-style with vencimento)
 *     create_pix_charge_due       — cobv create
 *     get_pix_charge_due          — cobv get by txid
 *
 *   Outbound Pix payments (ordem de pagamento)
 *     create_pix_payment          — initiate an outbound Pix transfer
 *     get_pix_payment             — fetch a payment by endToEndId
 *     refund_pix_payment          — refund a Pix payment (MED / devolução)
 *     list_pix_payments           — list outbound payments with filters
 *
 *   Inbound Pix (recebidos)
 *     list_pix_received           — list received Pix in a window
 *
 *   DICT (Pix key directory)
 *     resolve_pix_key             — DICT lookup (CPF/CNPJ/email/phone/random → account)
 *     list_dict_keys              — list DICT keys registered to merchant accounts
 *     register_dict_key           — claim/register a DICT key for a merchant account
 *     delete_dict_key             — remove a DICT key the merchant owns
 *
 *   Pix Automático (BCB 2025 recurring Pix)
 *     create_pix_automatico       — register a recurring Pix agreement
 *     get_pix_automatico          — fetch a recurrence by idRec
 *     cancel_pix_automatico       — cancel an active recurrence
 *
 *   Accounts (Matera-managed core-banking accounts)
 *     get_account_balance         — current balance for a Matera account
 *     get_account_statement       — extrato / statement for a date range
 *     internal_transfer           — book transfer between two Matera-managed accounts
 *
 * -------------------------------------------------------------------------
 * ALPHA STATUS — endpoint paths below are NOT verified against a live sandbox.
 *
 * On 2026-04-24 we attempted to validate every path against doc-api.matera.com.
 * The doc site was not reachable from our automation environment (DNS-gated;
 * no login wall observed). Public search snippets and third-party references
 * confirm Matera's product surface and auth model but do not surface exact URL
 * paths. Where Matera-specific paths are unknown, we follow BCB Pix API v2
 * conventions (`/cob`, `/cobv`, `/pix`, `/rec`) which Matera is required to
 * mirror as a participating PSP. Known-suspect items are flagged inline with
 * `TODO(verify)` comments.
 *
 * High-confidence corrections pending sandbox access:
 *   - Auth: Matera's server integration uses `secret-key` + `data-signature`
 *     headers, not OAuth2. OAuth2 is documented only for mobile / web-UI
 *     integrations. The code below still uses the OAuth2 client_credentials
 *     flow as a placeholder and will fail against the real server path.
 *   - Pix Automático: BCB's 2025 spec uses POST /rec (recurrence) and /cobr
 *     (recurring charge). `/pix/automatico` is a placeholder; the true Matera
 *     path is unknown.
 *   - DICT: Real DICT (RSFN-gated) sits at BCB; Matera wraps it. The wrapper
 *     path `/pix/dict/*` is a guess.
 *   - Accounts (balance/statement/internal-transfer): no public path.
 *     `/accounts/*` is a reasoned default.
 *
 * The 21 tool names + input schemas are the stable public contract. Only the
 * internal `materaRequest(method, path, body)` calls will change when paths
 * are verified.
 * -------------------------------------------------------------------------
 *
 * Authentication (placeholder — see note above)
 *   OAuth 2.0 Client Credentials. POST /auth/token with Basic auth
 *   (client_id:client_secret) + grant_type=client_credentials. Bearer token
 *   cached in memory until a minute before expiry.
 *   Matera's production server auth is secret-key + data-signature — NOT
 *   implemented in this alpha.
 *
 * Environment
 *   MATERA_CLIENT_ID      OAuth2 client_id
 *   MATERA_CLIENT_SECRET  OAuth2 client_secret
 *   MATERA_BASE_URL       optional; defaults to https://api.matera.com
 *                         (sandbox URL varies per product line)
 *
 * Docs: https://doc-api.matera.com
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.MATERA_CLIENT_ID || "";
const CLIENT_SECRET = process.env.MATERA_CLIENT_SECRET || "";
const BASE_URL = process.env.MATERA_BASE_URL || "https://api.matera.com";

let tokenCache: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  // TODO(verify): Matera's real token path is unconfirmed. Candidates include
  // `/auth/token`, `/oauth/token`, `/auth/v1/token`. Leaving the original
  // placeholder until the sandbox confirms it.
  const res = await fetch(`${BASE_URL}/auth/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Matera OAuth ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

async function materaRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Matera API ${res.status}: ${await res.text()}`);
  }
  // Some endpoints (e.g. 204 No Content on refund) may return empty body
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new Server(
  { name: "mcp-matera", version: "0.2.0" },
  { capabilities: { tools: {} }, instructions: MANAGED_TIER_HINT },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_pix_charge_static",
      description: "Create a static Pix charge (reusable QR code tied to a merchant Pix key). Returns EMV copy-paste payload and QR code image. Use for points-of-sale or donations where the same QR is shown to many payers.",
      inputSchema: {
        type: "object",
        properties: {
          pix_key: { type: "string", description: "Merchant Pix key (CPF, CNPJ, email, phone, or random UUID)" },
          amount: { type: "number", description: "Amount in BRL (decimal, e.g. 10.50). Omit for open-amount QR." },
          description: { type: "string", description: "Free-text description shown to payer" },
          merchant_name: { type: "string", description: "Merchant name as it will appear on the QR payload" },
          merchant_city: { type: "string", description: "Merchant city" },
          txid: { type: "string", description: "Optional merchant-side transaction identifier (26-35 alphanumerics)" },
        },
        required: ["pix_key", "description"],
      },
    },
    {
      name: "create_pix_charge_dynamic",
      description: "Create a dynamic Pix charge (single-use QR with expiration). Returns txid, EMV copy-paste, and QR image. Preferred for e-commerce checkouts and invoices.",
      inputSchema: {
        type: "object",
        properties: {
          pix_key: { type: "string", description: "Merchant Pix key the charge settles to" },
          amount: { type: "number", description: "Amount in BRL (decimal)" },
          description: { type: "string", description: "Description shown to payer" },
          expiration: { type: "number", description: "QR lifetime in seconds (e.g. 3600 = 1 hour)" },
          debtor: {
            type: "object",
            description: "Optional payer identification (BCB requires CPF/CNPJ to be pre-known for some flows)",
            properties: {
              cpf: { type: "string" },
              cnpj: { type: "string" },
              name: { type: "string" },
            },
          },
          txid: { type: "string", description: "Optional merchant-side transaction identifier" },
        },
        required: ["pix_key", "amount", "description", "expiration"],
      },
    },
    {
      name: "get_pix_charge",
      description: "Retrieve a Pix charge (static or dynamic) by txid.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Matera txid returned by create_pix_charge_*" },
        },
        required: ["txid"],
      },
    },
    {
      name: "list_pix_charges",
      description: "List immediate Pix charges (BCB /cob) with date and status filters. Use for reconciling QR-driven receipts in a time window.",
      inputSchema: {
        type: "object",
        properties: {
          start: { type: "string", description: "ISO-8601 start timestamp (inclusive). BCB calls this `inicio`." },
          end: { type: "string", description: "ISO-8601 end timestamp (exclusive). BCB calls this `fim`." },
          status: { type: "string", description: "Filter by status (ATIVA, CONCLUIDA, REMOVIDA_PELO_USUARIO_RECEBEDOR, REMOVIDA_PELO_PSP)" },
          cpf: { type: "string", description: "Filter charges where the payer CPF equals this value" },
          cnpj: { type: "string", description: "Filter charges where the payer CNPJ equals this value" },
          page: { type: "number", description: "Page number (starts at 0 per BCB convention)" },
          limit: { type: "number", description: "Page size (BCB max 1000)" },
        },
        required: ["start", "end"],
      },
    },
    {
      name: "update_pix_charge",
      description: "Update an immediate Pix charge (BCB PATCH /cob/{txid}). Use to revise amount/expiration before payment, or to mark a charge REMOVIDA_PELO_USUARIO_RECEBEDOR.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "txid of the existing charge" },
          amount: { type: "number", description: "New amount in BRL (only if charge still ATIVA)" },
          expiration: { type: "number", description: "New expiration in seconds from creation" },
          description: { type: "string", description: "New description shown to payer" },
          status: { type: "string", description: "Set to REMOVIDA_PELO_USUARIO_RECEBEDOR to cancel an unpaid charge" },
        },
        required: ["txid"],
      },
    },
    {
      name: "create_pix_charge_due",
      description: "Create a due-dated Pix charge (BCB /cobv — Pix com Vencimento). Boleto-style charge with due date, late fee (multa), interest (juros), and discount fields. Returns txid + QR payload.",
      inputSchema: {
        type: "object",
        properties: {
          pix_key: { type: "string", description: "Merchant Pix key the charge settles to" },
          amount: { type: "number", description: "Original amount in BRL (valor.original)" },
          description: { type: "string", description: "Description shown to payer (solicitacaoPagador)" },
          due_date: { type: "string", description: "ISO-8601 date when the charge becomes due (data.dataDeVencimento)" },
          validity_days_after_due: { type: "number", description: "How many calendar days after due date the QR remains payable (validadeAposVencimento). Default 30." },
          debtor: {
            type: "object",
            description: "Payer (devedor). BCB requires CPF or CNPJ + name for cobv.",
            properties: {
              cpf: { type: "string" },
              cnpj: { type: "string" },
              name: { type: "string" },
              address: { type: "string", description: "Logradouro" },
              city: { type: "string", description: "Cidade" },
              state: { type: "string", description: "UF (2-letter)" },
              zip: { type: "string", description: "CEP" },
            },
            required: ["name"],
          },
          fine: { type: "number", description: "Late fee, BRL or % depending on `fine_mode` (multa.valor or multa.modalidade)" },
          fine_mode: { type: "number", enum: [1, 2], description: "1=fixed amount, 2=percent (BCB modalidade)" },
          interest: { type: "number", description: "Interest after due date" },
          interest_mode: { type: "number", description: "BCB juros.modalidade (1..7). 2=percent per day, 5=percent per month, etc." },
          discount: { type: "number", description: "Discount value if paid before due date" },
          discount_mode: { type: "number", description: "BCB desconto.modalidade (1..6)" },
          txid: { type: "string", description: "Optional merchant-side txid (26-35 alphanumerics)" },
        },
        required: ["pix_key", "amount", "description", "due_date", "debtor"],
      },
    },
    {
      name: "get_pix_charge_due",
      description: "Retrieve a due-dated Pix charge (BCB GET /cobv/{txid}).",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "txid of the cobv charge" },
        },
        required: ["txid"],
      },
    },
    {
      name: "create_pix_payment",
      description: "Initiate an outbound Pix transfer (ordem de pagamento). Moves money from a debtor account held on Matera to any Pix key in BR. Returns endToEndId once the BCB SPI confirms.",
      inputSchema: {
        type: "object",
        properties: {
          debtor_account: {
            type: "object",
            description: "Source account held on Matera (ispb, branch, account, account type)",
            properties: {
              ispb: { type: "string", description: "ISPB of the debtor bank" },
              branch: { type: "string", description: "Branch (agência)" },
              account: { type: "string", description: "Account number" },
              account_type: { type: "string", enum: ["CACC", "SLRY", "SVGS", "TRAN"], description: "ISO 20022 account type (CACC=corrente, SVGS=poupança)" },
            },
            required: ["ispb", "branch", "account", "account_type"],
          },
          creditor_pix_key: { type: "string", description: "Destination Pix key (CPF/CNPJ/email/phone/random)" },
          amount: { type: "number", description: "Amount in BRL (decimal)" },
          description: { type: "string", description: "Message shown to the recipient (optional)" },
          idempotency_key: { type: "string", description: "Merchant-side unique id to prevent double-send on retry" },
        },
        required: ["debtor_account", "creditor_pix_key", "amount"],
      },
    },
    {
      name: "get_pix_payment",
      description: "Retrieve an outbound Pix payment by endToEndId.",
      inputSchema: {
        type: "object",
        properties: {
          end_to_end_id: { type: "string", description: "32-char BCB endToEndId (E<ispb><yyyyMMddHHmm><random>)" },
        },
        required: ["end_to_end_id"],
      },
    },
    {
      name: "refund_pix_payment",
      description: "Refund (devolução) a Pix payment. Supports full or partial amount. Use reason codes per BCB MED catalog.",
      inputSchema: {
        type: "object",
        properties: {
          end_to_end_id: { type: "string", description: "endToEndId of the payment to refund" },
          amount: { type: "number", description: "Refund amount in BRL. Must be <= original." },
          reason: { type: "string", description: "Reason for refund (BCB MED code or free text)" },
        },
        required: ["end_to_end_id", "amount", "reason"],
      },
    },
    {
      name: "list_pix_payments",
      description: "List outbound Pix payments with optional filters. Useful for reconciliation and agent-driven audit.",
      inputSchema: {
        type: "object",
        properties: {
          start: { type: "string", description: "ISO-8601 start timestamp (inclusive)" },
          end: { type: "string", description: "ISO-8601 end timestamp (exclusive)" },
          status: { type: "string", description: "Filter by status (e.g. ACSC, RJCT, PDNG)" },
          page: { type: "number", description: "Page number (starts at 1)" },
          limit: { type: "number", description: "Page size" },
        },
      },
    },
    {
      name: "list_pix_received",
      description: "List inbound Pix (Pix recebidos) credited to merchant accounts in a date range. Mirrors BCB GET /pix. Filter by txid to find the receipt that closed a specific cob.",
      inputSchema: {
        type: "object",
        properties: {
          start: { type: "string", description: "ISO-8601 start timestamp (inclusive)" },
          end: { type: "string", description: "ISO-8601 end timestamp (exclusive)" },
          txid: { type: "string", description: "Only return Pix receipts that closed this txid" },
          cpf: { type: "string", description: "Filter by payer CPF" },
          cnpj: { type: "string", description: "Filter by payer CNPJ" },
          page: { type: "number", description: "Page number (BCB starts at 0)" },
          limit: { type: "number", description: "Page size" },
        },
        required: ["start", "end"],
      },
    },
    {
      name: "resolve_pix_key",
      description: "Resolve a Pix DICT key to the account holder's identity and ISPB/branch/account. Use before sending large transfers to verify the counterparty. Note: DICT queries are rate-limited and logged by BCB.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "Pix key to resolve (CPF, CNPJ, email, phone, or random UUID)" },
        },
        required: ["key"],
      },
    },
    {
      name: "list_dict_keys",
      description: "List DICT keys registered to the merchant's accounts on Matera.",
      inputSchema: {
        type: "object",
        properties: {
          account: { type: "string", description: "Optional filter: return only keys for this account number" },
        },
      },
    },
    {
      name: "register_dict_key",
      description: "Register (claim) a DICT key for a merchant account on Matera. For email/phone keys this triggers BCB's confirmation flow; for CPF/CNPJ/random it claims immediately. Subject to BCB DICT rate limits and ownership rules (max 5 keys per CPF, 20 per CNPJ).",
      inputSchema: {
        type: "object",
        properties: {
          key_type: { type: "string", enum: ["CPF", "CNPJ", "EMAIL", "PHONE", "RANDOM"], description: "Type of key to register" },
          key_value: { type: "string", description: "Value (omit for RANDOM — Matera will generate the UUID)" },
          account: {
            type: "object",
            description: "Matera-managed account that will own the key",
            properties: {
              branch: { type: "string", description: "Branch (agência)" },
              account: { type: "string", description: "Account number" },
              account_type: { type: "string", enum: ["CACC", "SLRY", "SVGS", "TRAN"], description: "ISO 20022 account type" },
              ispb: { type: "string", description: "ISPB of the holding institution (Matera-issued)" },
            },
            required: ["branch", "account", "account_type"],
          },
        },
        required: ["key_type", "account"],
      },
    },
    {
      name: "delete_dict_key",
      description: "Delete a DICT key the merchant owns. After delete, the key is held in BCB's quarentena window before another holder can claim it.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "Pix key value to delete" },
          reason: { type: "string", description: "Optional reason (BCB MotivoExclusao). Default: USER_REQUESTED." },
        },
        required: ["key"],
      },
    },
    {
      name: "create_pix_automatico",
      description: "Register a Pix Automático recurrence (BCB 2025 recurring Pix product, /rec). The payer authorizes the merchant to pull recurring amounts on a schedule. Matera is one of the few providers live with this.",
      inputSchema: {
        type: "object",
        properties: {
          payer: {
            type: "object",
            description: "Payer identity + bank",
            properties: {
              cpf: { type: "string" },
              cnpj: { type: "string" },
              name: { type: "string" },
              ispb: { type: "string", description: "Payer bank ISPB" },
            },
            required: ["name"],
          },
          merchant_pix_key: { type: "string", description: "Merchant Pix key receiving the recurring payments" },
          frequency: { type: "string", enum: ["WEEKLY", "MONTHLY", "QUARTERLY", "SEMESTRAL", "ANNUAL"], description: "Recurrence frequency" },
          amount: { type: "number", description: "Amount per charge in BRL (fixed schedule)" },
          first_charge_date: { type: "string", description: "ISO-8601 date of the first charge" },
          end_date: { type: "string", description: "Optional ISO-8601 date to stop the recurrence" },
          description: { type: "string", description: "Description shown to the payer on the authorization screen" },
        },
        required: ["payer", "merchant_pix_key", "frequency", "amount", "first_charge_date", "description"],
      },
    },
    {
      name: "get_pix_automatico",
      description: "Retrieve a Pix Automático recurrence by idRec. Returns current status (CRIADA, APROVADA, REJEITADA, CANCELADA), schedule, and last charge attempt.",
      inputSchema: {
        type: "object",
        properties: {
          id_rec: { type: "string", description: "Recurrence id (idRec) returned by create_pix_automatico" },
        },
        required: ["id_rec"],
      },
    },
    {
      name: "cancel_pix_automatico",
      description: "Cancel an active Pix Automático recurrence. Future charges stop after BCB confirms the cancellation. Past charges are unaffected.",
      inputSchema: {
        type: "object",
        properties: {
          id_rec: { type: "string", description: "Recurrence id (idRec) to cancel" },
          reason: { type: "string", description: "Optional reason recorded on the cancellation" },
        },
        required: ["id_rec"],
      },
    },
    {
      name: "get_account_balance",
      description: "Get the current balance of a Matera-managed account. Returns available, blocked, and total balance in BRL.",
      inputSchema: {
        type: "object",
        properties: {
          branch: { type: "string", description: "Branch (agência)" },
          account: { type: "string", description: "Account number" },
          account_type: { type: "string", enum: ["CACC", "SLRY", "SVGS", "TRAN"], description: "ISO 20022 account type. Defaults to CACC." },
        },
        required: ["branch", "account"],
      },
    },
    {
      name: "get_account_statement",
      description: "Get the statement (extrato) of a Matera-managed account in a date range. Returns one entry per credit/debit with counterparty, endToEndId (when applicable), and running balance.",
      inputSchema: {
        type: "object",
        properties: {
          branch: { type: "string", description: "Branch (agência)" },
          account: { type: "string", description: "Account number" },
          account_type: { type: "string", enum: ["CACC", "SLRY", "SVGS", "TRAN"], description: "ISO 20022 account type. Defaults to CACC." },
          start: { type: "string", description: "ISO-8601 start date (inclusive)" },
          end: { type: "string", description: "ISO-8601 end date (exclusive)" },
          page: { type: "number", description: "Page number" },
          limit: { type: "number", description: "Page size" },
        },
        required: ["branch", "account", "start", "end"],
      },
    },
    {
      name: "internal_transfer",
      description: "Book a transfer between two accounts both held on Matera (TED-interno / transferência interna). Settles instantly without touching SPI/Pix rails — no endToEndId, no DICT lookup. Use for moving funds across a fintech's own customer accounts.",
      inputSchema: {
        type: "object",
        properties: {
          debtor_account: {
            type: "object",
            properties: {
              branch: { type: "string" },
              account: { type: "string" },
              account_type: { type: "string", enum: ["CACC", "SLRY", "SVGS", "TRAN"] },
            },
            required: ["branch", "account", "account_type"],
          },
          creditor_account: {
            type: "object",
            properties: {
              branch: { type: "string" },
              account: { type: "string" },
              account_type: { type: "string", enum: ["CACC", "SLRY", "SVGS", "TRAN"] },
            },
            required: ["branch", "account", "account_type"],
          },
          amount: { type: "number", description: "Amount in BRL (decimal)" },
          description: { type: "string", description: "Free-text description recorded on both ledger entries" },
          idempotency_key: { type: "string", description: "Merchant-side unique id to prevent double-debit on retry" },
        },
        required: ["debtor_account", "creditor_account", "amount"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;
  try {
    switch (name) {
      // TODO(verify): BCB canonical charge paths are `/cob` (immediate) and
      // `/cobv` (dated). Matera may expose them at `/pix/charges/*` per the
      // original guess, but this has NOT been confirmed against the sandbox.
      case "create_pix_charge_static":
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("POST", "/pix/charges/static", a), null, 2) }] };
      case "create_pix_charge_dynamic":
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("POST", "/pix/charges/dynamic", a), null, 2) }] };
      case "get_pix_charge": {
        const txid = encodeURIComponent(String(a.txid ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("GET", `/pix/charges/${txid}`), null, 2) }] };
      }
      case "list_pix_charges": {
        // TODO(verify): BCB Pix v2 lists /cob via `?inicio=&fim=`. Path is a
        // wrapped Matera guess.
        const params = new URLSearchParams();
        if (a.start) params.set("inicio", String(a.start));
        if (a.end) params.set("fim", String(a.end));
        if (a.status) params.set("status", String(a.status));
        if (a.cpf) params.set("cpf", String(a.cpf));
        if (a.cnpj) params.set("cnpj", String(a.cnpj));
        if (a.page !== undefined) params.set("paginacao.paginaAtual", String(a.page));
        if (a.limit !== undefined) params.set("paginacao.itensPorPagina", String(a.limit));
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("GET", `/pix/charges${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "update_pix_charge": {
        // TODO(verify): BCB spec uses PATCH /cob/{txid}. Wrapper path guessed.
        const txid = encodeURIComponent(String(a.txid ?? ""));
        const body: Record<string, unknown> = {};
        if (a.amount !== undefined) body.amount = a.amount;
        if (a.expiration !== undefined) body.expiration = a.expiration;
        if (a.description !== undefined) body.description = a.description;
        if (a.status !== undefined) body.status = a.status;
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("PATCH", `/pix/charges/${txid}`, body), null, 2) }] };
      }
      case "create_pix_charge_due": {
        // TODO(verify): BCB canonical path is PUT /cobv/{txid}. Matera wrapper
        // path unknown — using `/pix/charges/due` for symmetry with /charges.
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("POST", "/pix/charges/due", a), null, 2) }] };
      }
      case "get_pix_charge_due": {
        const txid = encodeURIComponent(String(a.txid ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("GET", `/pix/charges/due/${txid}`), null, 2) }] };
      }
      // TODO(verify): BCB spec names outbound Pix refunds
      // `PUT /pix/{e2eid}/devolucao/{id}`. The `POST /pix/payments/{e2eid}/refund`
      // path below is a plausible Matera wrapper but NOT confirmed.
      case "create_pix_payment":
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("POST", "/pix/payments", a), null, 2) }] };
      case "get_pix_payment": {
        const e2e = encodeURIComponent(String(a.end_to_end_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("GET", `/pix/payments/${e2e}`), null, 2) }] };
      }
      case "refund_pix_payment": {
        const e2e = encodeURIComponent(String(a.end_to_end_id ?? ""));
        const body: Record<string, unknown> = { amount: a.amount, reason: a.reason };
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("POST", `/pix/payments/${e2e}/refund`, body), null, 2) }] };
      }
      case "list_pix_payments": {
        const params = new URLSearchParams();
        if (a.start) params.set("start", String(a.start));
        if (a.end) params.set("end", String(a.end));
        if (a.status) params.set("status", String(a.status));
        if (a.page) params.set("page", String(a.page));
        if (a.limit) params.set("limit", String(a.limit));
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("GET", `/pix/payments${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "list_pix_received": {
        // TODO(verify): BCB canonical is GET /pix?inicio=&fim=. Wrapper path
        // assumed at `/pix/received`.
        const params = new URLSearchParams();
        if (a.start) params.set("inicio", String(a.start));
        if (a.end) params.set("fim", String(a.end));
        if (a.txid) params.set("txid", String(a.txid));
        if (a.cpf) params.set("cpf", String(a.cpf));
        if (a.cnpj) params.set("cnpj", String(a.cnpj));
        if (a.page !== undefined) params.set("paginacao.paginaAtual", String(a.page));
        if (a.limit !== undefined) params.set("paginacao.itensPorPagina", String(a.limit));
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("GET", `/pix/received${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      // TODO(verify): BCB DICT is RSFN-gated and typically lives under
      // `/api/v2/entries/*` on the Central Bank side. Matera wraps it in its
      // own API — path `/pix/dict/*` below is a guess.
      case "resolve_pix_key": {
        const key = encodeURIComponent(String(a.key ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("GET", `/pix/dict/${key}`), null, 2) }] };
      }
      case "list_dict_keys": {
        const params = new URLSearchParams();
        if (a.account) params.set("account", String(a.account));
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("GET", `/pix/dict/keys${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "register_dict_key": {
        // TODO(verify): BCB DICT register is POST /api/v2/entries with an XML
        // signed payload. Matera wraps it; path `/pix/dict/keys` is a guess.
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("POST", "/pix/dict/keys", a), null, 2) }] };
      }
      case "delete_dict_key": {
        // TODO(verify): BCB uses DELETE /api/v2/entries/{key}. Wrapper path
        // assumed.
        const key = encodeURIComponent(String(a.key ?? ""));
        const params = new URLSearchParams();
        if (a.reason) params.set("reason", String(a.reason));
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("DELETE", `/pix/dict/${key}${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      // TODO(verify): `/pix/automatico` is almost certainly wrong. BCB's
      // 2025 Pix Automático spec uses `POST /rec` (recorrência — payer
      // authorization) and `/cobr/{txid}` (cobrança recorrente — each
      // recurring charge). Matera likely mirrors this. The body shape here
      // also needs to change (idRec, expiracaoSolicitacao, vinculo, etc.)
      case "create_pix_automatico":
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("POST", "/pix/automatico", a), null, 2) }] };
      case "get_pix_automatico": {
        const id = encodeURIComponent(String(a.id_rec ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("GET", `/pix/automatico/${id}`), null, 2) }] };
      }
      case "cancel_pix_automatico": {
        const id = encodeURIComponent(String(a.id_rec ?? ""));
        const body: Record<string, unknown> = { status: "CANCELADA" };
        if (a.reason) body.reason = a.reason;
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("PATCH", `/pix/automatico/${id}`, body), null, 2) }] };
      }
      // TODO(verify): No public Matera path for accounts. `/accounts/*` is a
      // reasoned default. Real path may live under `/baas/accounts/*` or
      // `/core/accounts/*`.
      case "get_account_balance": {
        const params = new URLSearchParams();
        params.set("branch", String(a.branch ?? ""));
        params.set("account", String(a.account ?? ""));
        if (a.account_type) params.set("account_type", String(a.account_type));
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("GET", `/accounts/balance?${params.toString()}`), null, 2) }] };
      }
      case "get_account_statement": {
        const params = new URLSearchParams();
        params.set("branch", String(a.branch ?? ""));
        params.set("account", String(a.account ?? ""));
        if (a.account_type) params.set("account_type", String(a.account_type));
        if (a.start) params.set("start", String(a.start));
        if (a.end) params.set("end", String(a.end));
        if (a.page !== undefined) params.set("page", String(a.page));
        if (a.limit !== undefined) params.set("limit", String(a.limit));
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("GET", `/accounts/statement?${params.toString()}`), null, 2) }] };
      }
      case "internal_transfer": {
        // TODO(verify): book transfer endpoint unknown. Using `/accounts/transfers`.
        return { content: [{ type: "text", text: JSON.stringify(await materaRequest("POST", "/accounts/transfers", a), null, 2) }] };
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
    app.get("/health", (_req, res) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req, res) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) {
        await transports.get(sid)!.handleRequest(req, res, req.body);
        return;
      }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-matera", version: "0.2.0" }, { capabilities: { tools: {} } });
        (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v));
        (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v));
        await s.connect(t);
        await t.handleRequest(req, res, req.body);
        return;
      }
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
    });
    app.get("/mcp", async (req, res) => { const sid = req.headers["mcp-session-id"] as string | undefined; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req, res); else res.status(400).send("Invalid session"); });
    app.delete("/mcp", async (req, res) => { const sid = req.headers["mcp-session-id"] as string | undefined; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req, res); else res.status(400).send("Invalid session"); });
    const port = Number(process.env.MCP_PORT) || 3000;
    app.listen(port, () => { console.error(`MCP HTTP server on http://localhost:${port}/mcp`); });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}
main().catch(console.error);
