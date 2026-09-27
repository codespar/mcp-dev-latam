#!/usr/bin/env node

/**
 * MCP Server for Rinne — Brazilian card acquiring & payment infrastructure API.
 *
 * B2B2B model: an Organization key sees/acts on all its Merchants; a Merchant
 * key is scoped to one merchant. Most resources expose a "self" path
 * (org-level) and a "/v1/merchants/{merchantId}/..." path — tools below
 * accept an optional `merchant_id` and pick the right one.
 *
 * Two auth mechanisms are in play:
 *   - x-api-key (RINNE_API_KEY) — almost everything: merchants, affiliations,
 *     cards, 3DS, transactions, PIX, banking/cashouts, pricing, webhooks.
 *   - JWT session (RINNE_EMAIL + RINNE_PASSWORD) — access-management surface
 *     that a leaked API key must never reach: API Keys, Roles, Permissions,
 *     org-level Users, and (oddly) Zipcode lookup. This server logs in lazily
 *     the first time a JWT-gated tool is called and re-logs-in once on 401.
 *
 * Tools (62):
 *   Company            - get_company / update_company
 *   Merchants          - create_merchant / list_merchants / get_merchant / update_merchant
 *   Affiliations       - create_affiliation / register_affiliation / list_affiliations / get_affiliation
 *   Cards on file      - store_card / list_cards / get_card / delete_card
 *   3D Secure          - create_3ds_session
 *   Transactions       - create_transaction / authenticate_transaction / get_transaction /
 *                         list_transactions / cancel_transaction / refund_transaction /
 *                         cancel_refund / get_transaction_receipt / simulate_pay_transaction
 *   PIX (collection)   - create_pix_collection_key / list_pix_collection_keys
 *   Ledger             - list_ledger_entries / get_ledger_entry
 *   Banking            - create_bank_account / update_bank_account / register_cashout_pix_key /
 *                         get_balance / topup_balance / get_statement /
 *                         create_internal_transfer / list_judicial_blockages
 *   Cashouts           - create_cashout / list_cashouts / get_cashout / get_cashout_receipt
 *   Pricing            - list_fee_policies / create_fee_policy / replace_fee_policy /
 *                         update_fee_policy / list_cost_policies / list_mccs
 *   Webhooks           - get_webhook_dashboard_url
 *   System             - get_health
 *   Access mgmt (JWT)  - create_api_key / list_api_keys / revoke_api_key / create_role /
 *                         list_roles / list_permissions / get_current_session
 *   Users              - create_user / list_users / update_user / suspend_user / activate_user
 *   Zipcode (JWT)      - lookup_zipcode
 *   Sandbox            - get_sandbox_guide
 *
 * IMPORTANT — card data is never accepted in the clear. `card.number` /
 * `card_data.number` / `card_data.cvv` (and wallet `network_token`/`cryptogram`)
 * must already be encrypted client-side by the rinne-js Card/Wallet Element
 * (values look like "ev:..."). Rinne rejects a raw PAN/CVV with 400
 * VALIDATION_ERROR — there is no server-side encryption path. This server
 * finalizes operations with an already-encrypted token; it cannot itself
 * turn a raw card number into one.
 *
 * Environment:
 *   RINNE_API_KEY    — sent as x-api-key header (required for most tools)
 *   RINNE_SANDBOX    — set to "false" for production (default: sandbox)
 *   RINNE_EMAIL      — login identifier for JWT-gated tools (optional)
 *   RINNE_PASSWORD   — login password for JWT-gated tools (optional)
 *   RINNE_COMPANY_ID — company to select after login, for multi-company accounts (optional)
 *
 * Docs: https://docs.rinne.com.br
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = process.env.RINNE_BASE_URL || (process.env.RINNE_SANDBOX === "false"
  ? "https://api.rinne.com.br/core"
  : "https://api-sandbox.rinne.com.br/core");
const API_KEY = process.env.RINNE_API_KEY ?? "";
const AUTH_EMAIL = process.env.RINNE_EMAIL;
const AUTH_PASSWORD = process.env.RINNE_PASSWORD;
const AUTH_COMPANY_ID = process.env.RINNE_COMPANY_ID;
const USER_AGENT = "codespar-mcp-dev-latam/mcp-rinne/0.1.0";

if (!API_KEY) {
  console.error("Error: RINNE_API_KEY environment variable is required.");
  process.exit(1);
}

function parseBody(text: string): unknown {
  return text.trim() ? JSON.parse(text) : null;
}

function throwOnError(response: Response, data: unknown): never | void {
  if (response.ok) return;
  const err = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
  if (err) throw new Error(`${err.code}: ${err.message}${err.details ? ` — ${JSON.stringify(err.details)}` : ""}`);
  throw new Error(JSON.stringify(data ?? { status: response.status }));
}

async function rinneRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "x-api-key": API_KEY, "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = parseBody(await response.text());
  throwOnError(response, data);
  return data;
}

let jwtToken: string | null = null;

async function loginForJwt(): Promise<string> {
  if (!AUTH_EMAIL || !AUTH_PASSWORD) {
    throw new Error("This operation needs a JWT session (Rinne's access-management endpoints reject API keys). Set RINNE_EMAIL and RINNE_PASSWORD.");
  }
  const loginRes = await fetch(`${BASE_URL}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ identifier: AUTH_EMAIL, password: AUTH_PASSWORD }),
  });
  const loginData = parseBody(await loginRes.text()) as { token?: string; access_token?: string } | null;
  throwOnError(loginRes, loginData);
  let token = loginData?.token ?? loginData?.access_token ?? "";
  if (AUTH_COMPANY_ID) {
    const selectRes = await fetch(`${BASE_URL}/v1/auth/select-company`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ company_id: AUTH_COMPANY_ID }),
    });
    const selectData = parseBody(await selectRes.text()) as { token?: string; access_token?: string } | null;
    if (selectRes.ok) token = selectData?.token ?? selectData?.access_token ?? token;
  }
  return token;
}

async function rinneJwtRequest(method: string, path: string, body?: unknown, retry = true): Promise<unknown> {
  if (!jwtToken) jwtToken = await loginForJwt();
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${jwtToken}`, "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (response.status === 401 && retry) {
    jwtToken = null;
    return rinneJwtRequest(method, path, body, false);
  }
  const data = parseBody(await response.text());
  throwOnError(response, data);
  return data;
}

function ok(data: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function txBase(merchantId?: string): string {
  return merchantId ? `/v1/merchants/${merchantId}/transactions` : "/v1/transactions";
}
function cardsBase(merchantId?: string): string {
  return merchantId ? `/v1/merchants/${merchantId}/cards` : "/v1/cards";
}
function threeDsBase(merchantId?: string): string {
  return merchantId ? `/v1/merchants/${merchantId}/3ds-sessions` : "/v1/3ds-sessions";
}
function affiliationsBase(merchantId?: string): string {
  return merchantId ? `/v1/merchants/${merchantId}/affiliations` : "/v1/merchants/affiliations";
}
function bankAccountsBase(merchantId?: string): string {
  return merchantId ? `/v1/merchants/${merchantId}/bank-accounts` : "/v1/companies/me/bank-accounts";
}
function cashoutPixKeysBase(merchantId?: string): string {
  return merchantId ? `/v1/merchants/${merchantId}/pix-keys` : "/v1/companies/me/pix-keys";
}
function balanceBase(merchantId?: string): string {
  return merchantId ? `/v1/merchants/${merchantId}/balance` : "/v1/banking/balance";
}
function judicialBlockagesBase(merchantId?: string): string {
  return merchantId ? `/v1/merchants/${merchantId}/banking/judicial-blockages` : "/v1/banking/judicial-blockages";
}
function cashoutsBase(merchantId?: string): string {
  return merchantId ? `/v1/merchants/${merchantId}/cashouts` : "/v1/banking/cashouts";
}
function usersBase(merchantId?: string): string {
  return merchantId ? `/v1/merchants/${merchantId}/users` : "/v1/users";
}
function apiKeysBase(merchantId?: string): string {
  return merchantId ? `/v1/merchants/${merchantId}/api-keys` : "/v1/api-keys";
}

const ENCRYPTED_CARD_NOTE =
  'PRE-ENCRYPTED by the rinne-js Card Element in the browser (format "ev:..."). Rinne rejects raw/plaintext card numbers and CVVs with 400 VALIDATION_ERROR — there is no server-side encryption path. Run a rinne-js checkout flow first to obtain this token, then pass it here to finalize server-side. See get_sandbox_guide.';

const MERCHANT_ID_PARAM = {
  type: "string",
  description: "Merchant ID to scope this call to (uses /v1/merchants/{merchant_id}/...). Omit to act at the organization/self level with an org-scoped key.",
};

const ADDRESS_SCHEMA = {
  type: "object",
  description: "Address.",
  properties: {
    street: { type: "string" },
    street_number: { type: "string" },
    complement: { type: "string" },
    neighborhood: { type: "string" },
    city: { type: "string" },
    state: { type: "string", description: "2-letter state code, e.g. SP" },
    zipcode: { type: "string", description: "8 digits, no punctuation", pattern: "^[0-9]{8}$" },
    country: { type: "string", default: "BR" },
  },
};
const ADDRESS_SCHEMA_REQUIRED = {
  ...ADDRESS_SCHEMA,
  required: ["street", "neighborhood", "zipcode", "country", "state", "city"],
};

const CONTACT_SCHEMA = {
  type: "object",
  description: "Contact / responsible-person details.",
  properties: {
    first_name: { type: "string" },
    last_name: { type: "string" },
    email: { type: "string" },
    phone: { type: "string", description: 'E.164 format, e.g. "+5511999999999". A bare local number (e.g. "11999999999") is rejected with 400 VALIDATION_ERROR (confirmed live against sandbox).' },
    birth_date: { type: "string", description: 'Format "DD-MM-YYYY". NOT ISO 8601 — Rinne rejects every ISO 8601 variant with 400 VALIDATION_ERROR (confirmed live against sandbox).' },
    document_number: { type: "string", description: "Responsible person's CPF" },
    mother_name: { type: "string" },
    address: ADDRESS_SCHEMA,
    occupation: {
      type: "string",
      description: "Closed enum — free text is rejected. Defaults to OTHER if omitted.",
      enum: [
        "ADMINISTRATOR_MANAGER", "SALES_REPRESENTATIVE", "HR_ANALYST", "FINANCIAL_ANALYST", "SOFTWARE_DEVELOPER",
        "MARKETING_PROFESSIONAL", "HEALTHCARE_PROFESSIONAL", "TEACHER", "ENGINEER", "LAWYER", "GENERAL_SERVICES",
        "CONSTRUCTION_WORKER", "DRIVER", "RECEPTIONIST", "TECHNICIAN", "DESIGNER", "MACHINE_OPERATOR", "CONSULTANT",
        "BEAUTY_PROFESSIONAL", "SECURITY_AGENT", "AGRICULTURAL_WORKER", "TRAVEL_AGENT", "JOURNALIST", "PSYCHOLOGIST",
        "PUBLIC_SERVANT", "RESEARCHER", "ARTISAN", "RETIRED", "STUDENT", "SELF_EMPLOYED", "OTHER",
      ],
    },
    role: { type: "string", description: "Defaults to PARTNER if omitted.", enum: ["PARTNER", "REPRESENTATIVE"] },
    politically_exposed: { type: "boolean", default: false },
    declared_income: { type: "number", description: "Defaults to 5000 if omitted." },
    net_worth: { type: "number", description: "Defaults to 50000 if omitted." },
  },
};
const CONTACT_SCHEMA_REQUIRED = {
  ...CONTACT_SCHEMA,
  required: ["first_name", "last_name", "phone", "email", "mother_name", "birth_date", "document_number", "address"],
};

const TRANSFER_CONFIGURATIONS_SCHEMA = {
  type: "object",
  description: "Payout schedule to the merchant's registered destination (PIX key or bank account).",
  properties: {
    automatic_transfer_enabled: { type: "boolean" },
    transfer_frequency: { type: "string", enum: ["DAILY", "WEEKLY", "MONTHLY"] },
    rail: { type: "string", enum: ["PIX"], description: "Only PIX is currently supported for automatic transfers." },
    utc_hour_of_day: { type: "integer" },
    day_of_week: { type: "integer", description: "Used when transfer_frequency is WEEKLY." },
    day_of_month: { type: "integer", description: "Used when transfer_frequency is MONTHLY." },
    min_balance: { type: "integer", description: "Minimum balance (cents) to keep before transferring." },
  },
  required: ["automatic_transfer_enabled", "transfer_frequency", "rail"],
};

const CARD_ON_FILE_SCHEMA = {
  type: "object",
  description: "Card to store. `number` must already be encrypted.",
  properties: {
    number: { type: "string", description: `Card number. ${ENCRYPTED_CARD_NOTE}` },
    expiry_month: { type: "string", description: 'e.g. "12"' },
    expiry_year: { type: "string", description: 'e.g. "2030"' },
    last_digits: { type: "string", description: "Last 4 digits, for display" },
    brand: { type: "string", description: "e.g. VISA, MASTERCARD" },
    cardholder_name: { type: "string" },
  },
  required: ["number", "expiry_month", "expiry_year", "cardholder_name"],
};

const CARD_DATA_TX_SCHEMA = {
  type: "object",
  description: "Card or digital wallet used for this transaction. For a raw card, set number+cvv (both pre-encrypted). For Apple Pay / Google Pay, set network_token+cryptogram+wallet_type instead. Omit entirely if paying via card_id.",
  properties: {
    number: { type: "string", description: `Card number, for raw-card payment. ${ENCRYPTED_CARD_NOTE}` },
    cvv: { type: "string", description: `CVV, for raw-card payment. ${ENCRYPTED_CARD_NOTE}` },
    network_token: { type: "string", description: `Device network token, for Apple Pay / Google Pay. ${ENCRYPTED_CARD_NOTE}` },
    cryptogram: { type: "string", description: `Wallet cryptogram, for Apple Pay / Google Pay. ${ENCRYPTED_CARD_NOTE}` },
    wallet_type: { type: "string", description: "e.g. APPLE_PAY, GOOGLE_PAY (wallet payments only)" },
    display_name: { type: "string", description: 'e.g. "Visa 1111" (wallet payments only)' },
    expiry_month: { type: "string", description: 'e.g. "12"' },
    expiry_year: { type: "string", description: 'e.g. "2028"' },
    cardholder_name: { type: "string" },
    last_digits: { type: "string", description: "Last 4 digits, for display" },
  },
};

const PIX_DATA_SCHEMA = {
  type: "object",
  description: "PIX charge details, for payment_method: PIX.",
  properties: {
    description: { type: "string" },
    expiration_in_seconds: { type: "integer", description: "For an immediate PIX charge (QR code)" },
    due_date: { type: "string", description: "ISO date — for a PIX-with-due-date (bolepix) charge instead of immediate" },
    expiration_in_days_after_due_date: { type: "integer" },
    interest: { type: "object", properties: { percentage: { type: "number" }, modality: { type: "string" } } },
    fine: { type: "object", properties: { percentage: { type: "number" }, modality: { type: "string" } } },
    discount: {
      type: "object",
      properties: {
        modality: { type: "string" },
        discount_dates_config: { type: "array", items: { type: "object", properties: { until_date: { type: "string" }, percentage: { type: "number" } } } },
      },
    },
    abatement: { type: "object", properties: { amount: { type: "integer" }, modality: { type: "string" } } },
  },
};

const CONSUMER_SCHEMA = {
  type: "object",
  description: "Payer/buyer identification. Required for PIX; optional for card.",
  properties: {
    full_name: { type: "string" },
    email: { type: "string" },
    document_type: { type: "string", description: "e.g. CPF, CNPJ" },
    document_number: { type: "string" },
  },
};

const SANDBOX_GUIDE = {
  environment: BASE_URL,
  docsUrl: "https://docs.rinne.com.br/guides/testing",
  cardEncryption: {
    description: 'card_data.number / card_data.cvv / card.number (and wallet network_token/cryptogram) must be pre-encrypted ("ev:...") by the rinne-js Card/Wallet Element. Raw PAN/CVV is rejected with 400 VALIDATION_ERROR — there is no server-side encryption path in this API.',
  },
  testCards: [
    { number: "5155901222280001", brand: "Mastercard", threeDs: false },
    { number: "4012001037141112", brand: "Visa", threeDs: false },
    { number: "4242424242424242", brand: "Visa", threeDs: "challenge" },
  ],
  amountOutcomeRule: {
    description: "In sandbox, the last two digits of amount (in cents) determine the transaction outcome, not the card number.",
    rules: [
      { lastTwoDigits: "00", status: "APPROVED" },
      { lastTwoDigits: "51", status: "REFUSED", reason: "Insufficient funds" },
      { lastTwoDigits: "05", status: "REFUSED", reason: "Do not honor" },
      { lastTwoDigits: "54", status: "REFUSED", reason: "Expired card" },
    ],
    example: "amount: 1051 -> REFUSED with code 51 (insufficient funds)",
  },
  pixSimulation: "Use simulate_pay_transaction (sandbox only) to mark a WAITING_PAYMENT PIX transaction as paid.",
  jwtGatedTools: "create_api_key, list_api_keys, revoke_api_key, create_role, list_roles, list_permissions, get_current_session, lookup_zipcode, and org-level create_user/list_users/update_user/suspend_user/activate_user need RINNE_EMAIL + RINNE_PASSWORD — Rinne rejects API keys on these endpoints by design.",
};

const TOOLS = [
  // --- Company ---
  {
    name: "get_company",
    description: "Get the authenticated company (organization or merchant, depending on the API key's scope).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "update_company",
    description: "Update the authenticated company. All fields optional.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, full_name: { type: "string" }, contact: CONTACT_SCHEMA, address: ADDRESS_SCHEMA },
      required: [],
    },
  },
  // --- Merchants ---
  {
    name: "create_merchant",
    description: "Create a new merchant under your organization. Requires KYC data. IMPORTANT: Rinne does NOT reject a duplicate document_number here — confirmed live against sandbox (created 3 merchants with the same CNPJ, no error), contradicting the publicly documented 409 CONFLICT_ERROR behavior. Always call list_merchants with document_number first and dedupe yourself before calling this.",
    inputSchema: {
      type: "object",
      properties: {
        full_name: { type: "string", description: "Full legal name (razão social / nome completo)" },
        name: { type: "string", description: "Trading/display name (optional)" },
        document_number: { type: "string", description: "CNPJ or CPF" },
        document_type: { type: "string", description: "e.g. CNPJ or CPF" },
        document_tax_type: { type: "string", description: "Tax classification of document_number.", enum: ["PJ", "MEI", "ME", "PF"] },
        mcc: { type: "string", description: "Merchant Category Code — see list_mccs" },
        contact: CONTACT_SCHEMA_REQUIRED,
        address: ADDRESS_SCHEMA_REQUIRED,
        transfer_configurations: TRANSFER_CONFIGURATIONS_SCHEMA,
        declared_revenue: { type: "number", description: "Declared monthly/annual revenue (optional; defaults to 50000 for CNPJ)" },
        company_logo_url: { type: "string" },
        website_url: { type: "string" },
        fee_policy_id: { type: "string", description: "Optional. Overrides the organization's default fee policy for this merchant." },
        metadata: { type: "object", description: "Optional. Arbitrary key-value pairs — e.g. to tag which CodeSpar sales channel this merchant belongs to." },
        bank_account: { type: "object", description: "Optional bank account details for this merchant." },
        gateway_affiliation: { type: "object", description: "Optional gateway affiliation details." },
      },
      required: ["full_name", "document_number", "document_type", "document_tax_type", "mcc", "contact", "address", "transfer_configurations"],
    },
  },
  {
    name: "list_merchants",
    description: "List merchants under your organization, with optional filters. Use document_number to check for an existing merchant before create_merchant (Rinne itself does not enforce this).",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "integer", minimum: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        document_number: { type: "string", description: "Exact match (CPF or CNPJ)." },
        document_type: { type: "string", description: "e.g. CPF, CNPJ" },
        name: { type: "string", description: "Case-insensitive prefix match" },
        full_name: { type: "string", description: "Case-insensitive prefix match" },
        status: { type: "string", enum: ["pending_activation", "active", "inactive", "blocked"] },
        created_at_from: { type: "string" },
        created_at_to: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "get_merchant",
    description: "Get merchant details by ID.",
    inputSchema: { type: "object", properties: { merchant_id: { type: "string" } }, required: ["merchant_id"] },
  },
  {
    name: "update_merchant",
    description: "Update a merchant. All fields optional besides merchant_id.",
    inputSchema: {
      type: "object",
      properties: { merchant_id: { type: "string" }, name: { type: "string" }, full_name: { type: "string" }, contact: CONTACT_SCHEMA, address: ADDRESS_SCHEMA },
      required: ["merchant_id"],
    },
  },
  // --- Affiliations ---
  {
    name: "create_affiliation",
    description: "Create a merchant account with a payment provider (e.g. RINNE, CAPPTA, CELCOIN), enabling transaction processing for the given payment methods and capture channels. Starts in PENDING_APPROVAL.",
    inputSchema: {
      type: "object",
      properties: {
        merchant_id: MERCHANT_ID_PARAM,
        provider: { type: "string", description: "e.g. RINNE, CAPPTA, CELCOIN" },
        allowed_capture_methods: { type: "array", items: { type: "string", description: "e.g. ECOMMERCE, POS" } },
        allowed_payment_methods: { type: "array", items: { type: "string", description: "e.g. CREDIT_CARD, DEBIT_CARD, PIX, BOLEPIX" } },
      },
      required: ["merchant_id", "provider", "allowed_capture_methods", "allowed_payment_methods"],
    },
  },
  {
    name: "register_affiliation",
    description: "Register a gateway-mode affiliation — bring an existing account/credentials with the provider instead of having Rinne provision a new one.",
    inputSchema: {
      type: "object",
      properties: {
        merchant_id: MERCHANT_ID_PARAM,
        provider: { type: "string", description: "e.g. CAPPTA, CELCOIN" },
        allowed_capture_methods: { type: "array", items: { type: "string" } },
        allowed_payment_methods: { type: "array", items: { type: "string" } },
        provider_credentials: { type: "object", description: "Existing credentials with the provider (gateway mode). Shape is provider-specific; passed through as-is." },
      },
      required: ["merchant_id", "provider", "allowed_capture_methods", "allowed_payment_methods"],
    },
  },
  {
    name: "list_affiliations",
    description: "List affiliations. With merchant_id, scoped to that merchant; without it, lists across all merchants in the organization.",
    inputSchema: {
      type: "object",
      properties: { merchant_id: MERCHANT_ID_PARAM, status: { type: "string", description: "e.g. PENDING_APPROVAL, ACTIVE, REJECTED" }, provider: { type: "string" } },
      required: [],
    },
  },
  {
    name: "get_affiliation",
    description: "Get a specific affiliation for a merchant.",
    inputSchema: { type: "object", properties: { merchant_id: { type: "string" }, affiliation_id: { type: "string" } }, required: ["merchant_id", "affiliation_id"] },
  },
  // --- Cards on file ---
  {
    name: "store_card",
    description: "Save a card on file for reuse in future transactions (via card_id).",
    inputSchema: { type: "object", properties: { merchant_id: MERCHANT_ID_PARAM, card: CARD_ON_FILE_SCHEMA }, required: ["card"] },
  },
  {
    name: "list_cards",
    description: "List cards on file.",
    inputSchema: { type: "object", properties: { merchant_id: MERCHANT_ID_PARAM, page: { type: "integer", minimum: 1 }, limit: { type: "integer", minimum: 1, maximum: 100 } }, required: [] },
  },
  {
    name: "get_card",
    description: "Get a stored card by ID.",
    inputSchema: { type: "object", properties: { merchant_id: MERCHANT_ID_PARAM, card_id: { type: "string" } }, required: ["card_id"] },
  },
  {
    name: "delete_card",
    description: "Delete a stored card.",
    inputSchema: { type: "object", properties: { merchant_id: MERCHANT_ID_PARAM, card_id: { type: "string" } }, required: ["card_id"] },
  },
  // --- 3D Secure ---
  {
    name: "create_3ds_session",
    description: "Create a 3D Secure authentication session for a card, ahead of (or alongside) creating a transaction. Returns an id to pass as `three_d_secure_session_id` to create_transaction / authenticate_transaction.",
    inputSchema: {
      type: "object",
      properties: {
        merchant_id: MERCHANT_ID_PARAM,
        amount: { type: "integer", description: "Amount in cents" },
        currency: { type: "string", default: "BRL" },
        card: {
          type: "object",
          properties: {
            number: { type: "string", description: `Card number. ${ENCRYPTED_CARD_NOTE}` },
            expiry: { type: "object", properties: { month: { type: "string" }, year: { type: "string" } }, required: ["month", "year"] },
          },
          required: ["number", "expiry"],
        },
        merchant: { type: "object", properties: { website: { type: "string" } } },
        payer_email: { type: "string" },
        payer_name: { type: "string" },
        payer_document: { type: "string" },
        billing_address: ADDRESS_SCHEMA,
      },
      required: ["amount", "currency", "card"],
    },
  },
  // --- Transactions ---
  {
    name: "create_transaction",
    description: "Create a transaction — card (raw, stored, or Apple Pay/Google Pay) or PIX. For card, either: (1) \"session-first\" — call create_3ds_session first and pass its id as three_d_secure_session_id; or (2) \"transaction-first\" — pass require_3ds: true and the transaction comes back AWAITING_3DS, then call authenticate_transaction. For PIX, set payment_method: \"PIX\" and fill pix_data + consumer; the transaction comes back WAITING_PAYMENT with a QR code.",
    inputSchema: {
      type: "object",
      properties: {
        merchant_id: MERCHANT_ID_PARAM,
        provider: { type: "string", default: "RINNE", description: "Processing provider — RINNE by default, or a provider this merchant has an active affiliation with (e.g. CAPPTA, CELCOIN)" },
        request_id: { type: "string", description: "Your idempotency key for this transaction" },
        amount: { type: "integer", description: "Amount in cents" },
        currency: { type: "string", default: "BRL" },
        capture_method: { type: "string", default: "ECOMMERCE", description: "e.g. ECOMMERCE" },
        payment_method: { type: "string", default: "CREDIT_CARD", description: "e.g. CREDIT_CARD, DEBIT_CARD, PIX" },
        installments: { type: "integer", minimum: 1, description: "Card only" },
        card_data: CARD_DATA_TX_SCHEMA,
        card_id: { type: "string", description: "Card only — use a card previously saved via store_card instead of card_data" },
        three_d_secure_session_id: { type: "string", description: "Card only — id from create_3ds_session (session-first flow)" },
        require_3ds: { type: "boolean", description: "Card only — transaction-first flow: force 3DS, returns AWAITING_3DS for authenticate_transaction" },
        pix_data: PIX_DATA_SCHEMA,
        consumer: CONSUMER_SCHEMA,
      },
      required: ["request_id", "amount", "currency"],
    },
  },
  {
    name: "authenticate_transaction",
    description: "Complete 3DS authentication for a transaction that came back AWAITING_3DS (transaction-first flow).",
    inputSchema: {
      type: "object",
      properties: { merchant_id: MERCHANT_ID_PARAM, transaction_id: { type: "string" }, three_d_secure_session_id: { type: "string" } },
      required: ["transaction_id", "three_d_secure_session_id"],
    },
  },
  {
    name: "get_transaction",
    description: "Get transaction details and current status by ID, including any refunds.",
    inputSchema: { type: "object", properties: { merchant_id: MERCHANT_ID_PARAM, transaction_id: { type: "string" } }, required: ["transaction_id"] },
  },
  {
    name: "list_transactions",
    description: "List transactions. With merchant_id, scoped to that merchant; without it, lists across all merchants in the organization.",
    inputSchema: {
      type: "object",
      properties: {
        merchant_id: MERCHANT_ID_PARAM,
        status: { type: "string", description: "e.g. APPROVED, REFUSED, AWAITING_3DS, WAITING_PAYMENT" },
        page: { type: "integer", minimum: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: [],
    },
  },
  {
    name: "cancel_transaction",
    description: "Cancel a pending transaction (e.g. an unpaid BOLEPIX charge before its due date).",
    inputSchema: { type: "object", properties: { merchant_id: MERCHANT_ID_PARAM, transaction_id: { type: "string" } }, required: ["transaction_id"] },
  },
  {
    name: "refund_transaction",
    description: "Refund a transaction, fully or partially.",
    inputSchema: {
      type: "object",
      properties: {
        merchant_id: { type: "string", description: "Required — refunds are always issued at the merchant level" },
        transaction_id: { type: "string" },
        refund_amount: { type: "integer", description: "Amount in cents to refund" },
        refund_reason: { type: "string", description: "e.g. CUSTOMER_REQUEST" },
        description: { type: "string" },
      },
      required: ["merchant_id", "transaction_id", "refund_amount"],
    },
  },
  {
    name: "cancel_refund",
    description: "Cancel a refund that hasn't settled yet.",
    inputSchema: { type: "object", properties: { merchant_id: MERCHANT_ID_PARAM, transaction_id: { type: "string" } }, required: ["transaction_id"] },
  },
  {
    name: "get_transaction_receipt",
    description: "Get a transaction's receipt(s) (returns base64 PDF).",
    inputSchema: { type: "object", properties: { merchant_id: MERCHANT_ID_PARAM, transaction_id: { type: "string" } }, required: ["transaction_id"] },
  },
  {
    name: "simulate_pay_transaction",
    description: "SANDBOX ONLY. Mark a WAITING_PAYMENT transaction (typically PIX) as paid, simulating the payer completing payment.",
    inputSchema: {
      type: "object",
      properties: { merchant_id: MERCHANT_ID_PARAM, transaction_id: { type: "string" }, payer_company_id: { type: "string" } },
      required: ["transaction_id", "payer_company_id"],
    },
  },
  // --- PIX (collection keys) ---
  {
    name: "create_pix_collection_key",
    description: "Create a PIX key the merchant uses to RECEIVE payments, tied to a provider affiliation. Different resource from register_cashout_pix_key (which registers a key as a payout destination).",
    inputSchema: {
      type: "object",
      properties: { merchant_id: { type: "string" }, provider: { type: "string", description: "e.g. CELCOIN" }, key_type: { type: "string", description: "e.g. EVP" }, primary: { type: "boolean" } },
      required: ["merchant_id", "provider", "key_type"],
    },
  },
  {
    name: "list_pix_collection_keys",
    description: "List the merchant's PIX collection keys.",
    inputSchema: { type: "object", properties: { merchant_id: { type: "string" } }, required: ["merchant_id"] },
  },
  // --- Ledger ---
  {
    name: "list_ledger_entries",
    description: "List ledger entries for the authenticated company.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string" },
        operation: { type: "string" },
        transaction_id: { type: "string" },
        refund_id: { type: "string" },
        cashout_id: { type: "string" },
        settled: { type: "boolean" },
        payment_date_from: { type: "string" },
        payment_date_to: { type: "string" },
        page: { type: "integer", minimum: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: [],
    },
  },
  {
    name: "get_ledger_entry",
    description: "Get a single ledger entry by ID.",
    inputSchema: { type: "object", properties: { ledger_entry_id: { type: "string" } }, required: ["ledger_entry_id"] },
  },
  // --- Banking ---
  {
    name: "create_bank_account",
    description: "Register an external bank account (payout destination).",
    inputSchema: {
      type: "object",
      properties: {
        merchant_id: MERCHANT_ID_PARAM,
        nickname: { type: "string" },
        branch_number: { type: "string" },
        account_number: { type: "string" },
        account_type: { type: "string" },
        account_holder_name: { type: "string" },
        account_holder_document_number: { type: "string" },
        ispb: { type: "string", description: "Bank ISPB code" },
      },
      required: ["branch_number", "account_number", "account_type", "account_holder_name", "account_holder_document_number", "ispb"],
    },
  },
  {
    name: "update_bank_account",
    description: "Set a bank account as primary.",
    inputSchema: {
      type: "object",
      properties: { merchant_id: { type: "string" }, bank_account_id: { type: "string" }, primary: { type: "boolean" } },
      required: ["merchant_id", "bank_account_id", "primary"],
    },
  },
  {
    name: "register_cashout_pix_key",
    description: "Register an external PIX key as a payout (cashout) destination. Different resource from create_pix_collection_key (which registers a key to receive payments).",
    inputSchema: {
      type: "object",
      properties: { merchant_id: MERCHANT_ID_PARAM, key: { type: "string" }, primary: { type: "boolean" } },
      required: ["key"],
    },
  },
  {
    name: "get_balance",
    description: "Get the current balance.",
    inputSchema: { type: "object", properties: { merchant_id: MERCHANT_ID_PARAM, provider: { type: "string" } }, required: [] },
  },
  {
    name: "topup_balance",
    description: "SANDBOX ONLY. Simulate funding the balance — not a real deposit call.",
    inputSchema: {
      type: "object",
      properties: { merchant_id: MERCHANT_ID_PARAM, provider: { type: "string" }, amount: { type: "integer", description: "Amount in cents" } },
      required: ["provider", "amount"],
    },
  },
  {
    name: "get_statement",
    description: "Get a merchant's balance statement (movements) for a date range.",
    inputSchema: {
      type: "object",
      properties: { merchant_id: { type: "string" }, provider: { type: "string" }, date_from: { type: "string" }, date_to: { type: "string" } },
      required: ["merchant_id"],
    },
  },
  {
    name: "create_internal_transfer",
    description: "Transfer funds between two of your organization's own bank accounts.",
    inputSchema: {
      type: "object",
      properties: {
        request_id: { type: "string" },
        origin_bank_account_id: { type: "string" },
        destination_bank_account_id: { type: "string" },
        amount: { type: "integer", description: "Amount in cents" },
        metadata: { type: "object" },
      },
      required: ["request_id", "origin_bank_account_id", "destination_bank_account_id", "amount"],
    },
  },
  {
    name: "list_judicial_blockages",
    description: "List judicial blockages (court-ordered account freezes) affecting balances.",
    inputSchema: {
      type: "object",
      properties: {
        merchant_id: MERCHANT_ID_PARAM,
        type: { type: "string" },
        affiliation_bank_account_id: { type: "string" },
        process_number: { type: "string" },
        occurred_at_from: { type: "string" },
        occurred_at_to: { type: "string" },
        page: { type: "integer", minimum: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: [],
    },
  },
  // --- Cashouts ---
  {
    name: "create_cashout",
    description: "Create a cashout (payout) to a bank account or PIX key. Provide exactly one of destination_bank_account_id or destination_pix_key_id.",
    inputSchema: {
      type: "object",
      properties: {
        merchant_id: MERCHANT_ID_PARAM,
        request_id: { type: "string" },
        origin_bank_account_id: { type: "string" },
        amount: { type: "integer", description: "Amount in cents" },
        method: { type: "string", description: "e.g. PIX, TED" },
        destination_bank_account_id: { type: "string" },
        destination_pix_key_id: { type: "string" },
        currency: { type: "string", default: "BRL" },
        metadata: { type: "object" },
      },
      required: ["request_id", "origin_bank_account_id", "amount", "method"],
    },
  },
  {
    name: "list_cashouts",
    description: "List cashouts.",
    inputSchema: { type: "object", properties: { merchant_id: MERCHANT_ID_PARAM }, required: [] },
  },
  {
    name: "get_cashout",
    description: "Get a single cashout by ID.",
    inputSchema: { type: "object", properties: { merchant_id: MERCHANT_ID_PARAM, cashout_id: { type: "string" } }, required: ["cashout_id"] },
  },
  {
    name: "get_cashout_receipt",
    description: "Get a cashout's receipt.",
    inputSchema: { type: "object", properties: { merchant_id: MERCHANT_ID_PARAM, cashout_id: { type: "string" } }, required: ["cashout_id"] },
  },
  // --- Pricing ---
  {
    name: "list_fee_policies",
    description: "List fee policies (what you charge merchants).",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, is_active: { type: "boolean" }, id: { type: "string" }, page: { type: "integer", minimum: 1 }, limit: { type: "integer", minimum: 1, maximum: 100 } },
      required: [],
    },
  },
  {
    name: "create_fee_policy",
    description: "Create a fee policy — pricing rules applied to merchants.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        is_active: { type: "boolean" },
        cashout_price: { type: "integer", description: "Flat cashout fee, in cents" },
        rules: {
          type: "array",
          items: {
            type: "object",
            properties: {
              conditions: { type: "array", items: { type: "object" } },
              price: {
                type: "object",
                description: "At least one of percentage / flat (cents) / minimum_price (cents)",
                properties: { percentage: { type: "number" }, flat: { type: "integer" }, minimum_price: { type: "integer" } },
              },
              priority: { type: "integer" },
            },
          },
        },
      },
      required: ["name", "is_active", "cashout_price", "rules"],
    },
  },
  {
    name: "replace_fee_policy",
    description: "Replace a fee policy in full (PUT).",
    inputSchema: {
      type: "object",
      properties: {
        fee_policy_id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        is_active: { type: "boolean" },
        cashout_price: { type: "integer" },
        rules: { type: "array", items: { type: "object" } },
      },
      required: ["fee_policy_id", "name", "is_active", "cashout_price", "rules"],
    },
  },
  {
    name: "update_fee_policy",
    description: "Partially update a fee policy (PATCH) — any subset of fields.",
    inputSchema: {
      type: "object",
      properties: {
        fee_policy_id: { type: "string" },
        name: { type: "string" },
        is_active: { type: "boolean" },
        cashout_price: { type: "integer" },
        rules: { type: "array", items: { type: "object" } },
      },
      required: ["fee_policy_id"],
    },
  },
  {
    name: "list_cost_policies",
    description: "List cost policies (what providers charge you).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        is_active: { type: "boolean" },
        id: { type: "string" },
        mcc: { type: "string", description: "4-digit MCC" },
        provider: { type: "string", description: "CELCOIN, RINNE, or CAPPTA" },
        page: { type: "integer", minimum: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: [],
    },
  },
  {
    name: "list_mccs",
    description: "List Merchant Category Codes (MCCs), for use in create_merchant.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  // --- Webhooks ---
  {
    name: "get_webhook_dashboard_url",
    description: "Get the URL of the webhook management dashboard, to configure endpoints and subscribed events (webhooks themselves are configured there, not via this API). Requires the webhook.list permission. Events are Svix-signed; verify with the Svix SDK and your webhook secret.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  // --- System ---
  {
    name: "get_health",
    description: "Check Rinne API health status.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  // --- Access management (JWT) ---
  {
    name: "create_api_key",
    description: "JWT required (RINNE_EMAIL/RINNE_PASSWORD) — API keys can't create other API keys. The full key is returned once only; store it immediately.",
    inputSchema: {
      type: "object",
      properties: {
        merchant_id: MERCHANT_ID_PARAM,
        name: { type: "string" },
        permissions: { type: "array", items: { type: "string" }, description: 'e.g. ["transaction.create", "transaction.list"] or ["*.*"] for full access' },
        expires_at: { type: "string", description: "ISO 8601 (optional)" },
      },
      required: ["name", "permissions"],
    },
  },
  {
    name: "list_api_keys",
    description: "JWT required. List API keys (shows prefix + last 4 only, not the full key).",
    inputSchema: { type: "object", properties: { merchant_id: MERCHANT_ID_PARAM }, required: [] },
  },
  {
    name: "revoke_api_key",
    description: "JWT required. Revoke an API key.",
    inputSchema: { type: "object", properties: { merchant_id: MERCHANT_ID_PARAM, api_key_id: { type: "string" } }, required: ["api_key_id"] },
  },
  {
    name: "create_role",
    description: "JWT required. Create a custom role.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, description: { type: "string" }, permissions: { type: "array", items: { type: "string" } } },
      required: ["name", "permissions"],
    },
  },
  {
    name: "list_roles",
    description: "JWT required. List roles.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" }, company_id: { type: "string" }, page: { type: "integer", minimum: 1 }, limit: { type: "integer", minimum: 1, maximum: 100 } },
      required: [],
    },
  },
  {
    name: "list_permissions",
    description: "JWT required. List all available permissions (read-only, system-defined), optionally filtered by resource.",
    inputSchema: { type: "object", properties: { resource: { type: "string", description: "e.g. transaction, user" } }, required: [] },
  },
  {
    name: "get_current_session",
    description: "JWT required. Get the current JWT session's identity/company context — a whoami for the JWT scope, distinct from get_company (x-api-key scope).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  // --- Users ---
  {
    name: "create_user",
    description: "Create a user. With merchant_id, uses the merchant's x-api-key scope; without it, creates an org user and requires JWT (RINNE_EMAIL/RINNE_PASSWORD).",
    inputSchema: {
      type: "object",
      properties: {
        merchant_id: MERCHANT_ID_PARAM,
        identifiers: { type: "array", items: { type: "object", properties: { type: { type: "string", description: "e.g. email" }, value: { type: "string" } } } },
        first_name: { type: "string" },
        last_name: { type: "string" },
        auth_methods: { type: "array", items: { type: "string" } },
        roles: { type: "array", items: { type: "string" } },
      },
      required: ["identifiers", "first_name", "last_name"],
    },
  },
  {
    name: "list_users",
    description: "List users. With merchant_id, uses the merchant's x-api-key scope; without it, lists org users and requires JWT.",
    inputSchema: {
      type: "object",
      properties: { merchant_id: MERCHANT_ID_PARAM, page: { type: "integer", minimum: 1 }, limit: { type: "integer", minimum: 1, maximum: 100 }, sort: { type: "string", description: "e.g. created_at or -created_at" } },
      required: [],
    },
  },
  {
    name: "update_user",
    description: "JWT required (org users only). Update a user's name/roles.",
    inputSchema: {
      type: "object",
      properties: { user_id: { type: "string" }, first_name: { type: "string" }, last_name: { type: "string" }, roles: { type: "array", items: { type: "string" } } },
      required: ["user_id"],
    },
  },
  {
    name: "suspend_user",
    description: "JWT required (org users only). Suspend a user's access.",
    inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] },
  },
  {
    name: "activate_user",
    description: "JWT required (org users only). Reactivate a suspended user.",
    inputSchema: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] },
  },
  // --- Zipcode ---
  {
    name: "lookup_zipcode",
    description: "JWT required — unlike almost every other endpoint in this API, zipcode lookup rejects x-api-key. Look up a Brazilian address by CEP.",
    inputSchema: { type: "object", properties: { zipcode: { type: "string", description: "5-9 digit CEP" } }, required: ["zipcode"] },
  },
  // --- Sandbox ---
  {
    name: "get_sandbox_guide",
    description: "Return Rinne sandbox rules: the card-encryption requirement, test card numbers, the amount-based approve/decline rule, and which tools need a JWT session.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

const server = new Server(
  { name: "mcp-rinne", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const a = args as Record<string, unknown>;
  const merchantId = a.merchant_id as string | undefined;

  try {
    switch (name) {
      // Company
      case "get_company":
        return ok(await rinneRequest("GET", "/v1/companies/me"));

      case "update_company": {
        const body: Record<string, unknown> = {};
        if (a.name) body.name = a.name;
        if (a.full_name) body.full_name = a.full_name;
        if (a.contact) body.contact = a.contact;
        if (a.address) body.address = a.address;
        return ok(await rinneRequest("PATCH", "/v1/companies/me", body));
      }

      // Merchants
      case "create_merchant": {
        const body: Record<string, unknown> = {
          full_name: a.full_name, document_number: a.document_number,
          document_type: a.document_type, document_tax_type: a.document_tax_type,
          mcc: a.mcc, contact: a.contact, address: a.address,
          transfer_configurations: a.transfer_configurations,
        };
        if (a.name !== undefined) body.name = a.name;
        if (a.declared_revenue !== undefined) body.declared_revenue = a.declared_revenue;
        if (a.company_logo_url !== undefined) body.company_logo_url = a.company_logo_url;
        if (a.website_url !== undefined) body.website_url = a.website_url;
        if (a.fee_policy_id !== undefined) body.fee_policy_id = a.fee_policy_id;
        if (a.metadata !== undefined) body.metadata = a.metadata;
        if (a.bank_account !== undefined) body.bank_account = a.bank_account;
        if (a.gateway_affiliation !== undefined) body.gateway_affiliation = a.gateway_affiliation;
        return ok(await rinneRequest("POST", "/v1/merchants", body));
      }

      case "list_merchants": {
        const params = new URLSearchParams();
        if (a.page) params.set("page", String(a.page));
        if (a.limit) params.set("limit", String(a.limit));
        if (a.document_number) params.set("document_number", String(a.document_number));
        if (a.document_type) params.set("document_type", String(a.document_type));
        if (a.name) params.set("name", String(a.name));
        if (a.full_name) params.set("full_name", String(a.full_name));
        if (a.status) params.set("status", String(a.status));
        if (a.created_at_from) params.set("created_at_from", String(a.created_at_from));
        if (a.created_at_to) params.set("created_at_to", String(a.created_at_to));
        return ok(await rinneRequest("GET", `/v1/merchants?${params}`));
      }

      case "get_merchant":
        return ok(await rinneRequest("GET", `/v1/merchants/${a.merchant_id}`));

      case "update_merchant": {
        const body: Record<string, unknown> = {};
        if (a.name) body.name = a.name;
        if (a.full_name) body.full_name = a.full_name;
        if (a.contact) body.contact = a.contact;
        if (a.address) body.address = a.address;
        return ok(await rinneRequest("PATCH", `/v1/merchants/${a.merchant_id}`, body));
      }

      // Affiliations
      case "create_affiliation":
        return ok(await rinneRequest("POST", `/v1/merchants/${a.merchant_id}/affiliations`, {
          provider: a.provider, allowed_capture_methods: a.allowed_capture_methods, allowed_payment_methods: a.allowed_payment_methods,
        }));

      case "register_affiliation": {
        const body: Record<string, unknown> = { provider: a.provider, allowed_capture_methods: a.allowed_capture_methods, allowed_payment_methods: a.allowed_payment_methods };
        if (a.provider_credentials) body.provider_credentials = a.provider_credentials;
        return ok(await rinneRequest("POST", `/v1/merchants/${a.merchant_id}/affiliations/register`, body));
      }

      case "list_affiliations": {
        const params = new URLSearchParams();
        if (a.status) params.set("status", String(a.status));
        if (a.provider) params.set("provider", String(a.provider));
        return ok(await rinneRequest("GET", `${affiliationsBase(merchantId)}?${params}`));
      }

      case "get_affiliation":
        return ok(await rinneRequest("GET", `/v1/merchants/${a.merchant_id}/affiliations/${a.affiliation_id}`));

      // Cards on file
      case "store_card":
        return ok(await rinneRequest("POST", cardsBase(merchantId), { card: a.card }));

      case "list_cards": {
        const params = new URLSearchParams();
        if (a.page) params.set("page", String(a.page));
        if (a.limit) params.set("limit", String(a.limit));
        return ok(await rinneRequest("GET", `${cardsBase(merchantId)}?${params}`));
      }

      case "get_card":
        return ok(await rinneRequest("GET", `${cardsBase(merchantId)}/${a.card_id}`));

      case "delete_card":
        await rinneRequest("DELETE", `${cardsBase(merchantId)}/${a.card_id}`);
        return ok({ id: a.card_id, deleted: true });

      // 3D Secure
      case "create_3ds_session": {
        const body: Record<string, unknown> = { amount: a.amount, currency: a.currency, card: a.card };
        if (a.merchant) body.merchant = a.merchant;
        if (a.payer_email) body.payer_email = a.payer_email;
        if (a.payer_name) body.payer_name = a.payer_name;
        if (a.payer_document) body.payer_document = a.payer_document;
        if (a.billing_address) body.billing_address = a.billing_address;
        return ok(await rinneRequest("POST", threeDsBase(merchantId), body));
      }

      // Transactions
      case "create_transaction": {
        if (!a.card_data && !a.card_id && !a.pix_data) {
          throw new Error("Provide card_data or card_id for a card transaction, or pix_data for a PIX transaction");
        }
        const body: Record<string, unknown> = {
          provider: a.provider ?? "RINNE",
          request_id: a.request_id,
          amount: a.amount,
          currency: a.currency,
          capture_method: a.capture_method ?? "ECOMMERCE",
          payment_method: a.payment_method ?? (a.pix_data ? "PIX" : "CREDIT_CARD"),
        };
        if (a.installments !== undefined) body.installments = a.installments;
        if (a.card_data) body.card_data = a.card_data;
        if (a.card_id) body.card_id = a.card_id;
        if (a.three_d_secure_session_id) body.three_d_secure_session_id = a.three_d_secure_session_id;
        if (a.require_3ds !== undefined) body.require_3ds = a.require_3ds;
        if (a.pix_data) body.pix_data = a.pix_data;
        if (a.consumer) body.consumer = a.consumer;
        return ok(await rinneRequest("POST", txBase(merchantId), body));
      }

      case "authenticate_transaction":
        return ok(await rinneRequest("POST", `${txBase(merchantId)}/${a.transaction_id}/authenticate`, { three_d_secure_session_id: a.three_d_secure_session_id }));

      case "get_transaction":
        return ok(await rinneRequest("GET", `${txBase(merchantId)}/${a.transaction_id}`));

      case "list_transactions": {
        const params = new URLSearchParams();
        if (a.status) params.set("status", String(a.status));
        if (a.page) params.set("page", String(a.page));
        if (a.limit) params.set("limit", String(a.limit));
        const path = merchantId ? `/v1/merchants/${merchantId}/transactions` : "/v1/merchants/transactions";
        return ok(await rinneRequest("GET", `${path}?${params}`));
      }

      case "cancel_transaction":
        return ok(await rinneRequest("POST", `${txBase(merchantId)}/${a.transaction_id}/cancel`, {}));

      case "refund_transaction": {
        const body: Record<string, unknown> = { refund_amount: a.refund_amount };
        if (a.refund_reason) body.refund_reason = a.refund_reason;
        if (a.description) body.description = a.description;
        return ok(await rinneRequest("POST", `/v1/merchants/${a.merchant_id}/transactions/${a.transaction_id}/refunds`, body));
      }

      case "cancel_refund":
        return ok(await rinneRequest("PATCH", `${txBase(merchantId)}/${a.transaction_id}/refunds/cancel`, {}));

      case "get_transaction_receipt":
        return ok(await rinneRequest("GET", `${txBase(merchantId)}/${a.transaction_id}/receipt`));

      case "simulate_pay_transaction":
        return ok(await rinneRequest("POST", `${txBase(merchantId)}/${a.transaction_id}/pay`, { payer_company_id: a.payer_company_id }));

      // PIX collection keys
      case "create_pix_collection_key":
        return ok(await rinneRequest("POST", `/v1/merchants/${a.merchant_id}/pix/keys`, { provider: a.provider, key_type: a.key_type, primary: a.primary ?? false }));

      case "list_pix_collection_keys":
        return ok(await rinneRequest("GET", `/v1/merchants/${a.merchant_id}/pix/keys`));

      // Ledger
      case "list_ledger_entries": {
        const params = new URLSearchParams();
        for (const key of ["type", "operation", "transaction_id", "refund_id", "cashout_id", "payment_date_from", "payment_date_to", "page", "limit"]) {
          if (a[key] !== undefined) params.set(key, String(a[key]));
        }
        if (a.settled !== undefined) params.set("settled", String(a.settled));
        return ok(await rinneRequest("GET", `/v1/ledger-entries?${params}`));
      }

      case "get_ledger_entry":
        return ok(await rinneRequest("GET", `/v1/ledger-entries/${a.ledger_entry_id}`));

      // Banking
      case "create_bank_account": {
        const body: Record<string, unknown> = {
          branch_number: a.branch_number, account_number: a.account_number, account_type: a.account_type,
          account_holder_name: a.account_holder_name, account_holder_document_number: a.account_holder_document_number, ispb: a.ispb,
        };
        if (a.nickname) body.nickname = a.nickname;
        return ok(await rinneRequest("POST", bankAccountsBase(merchantId), body));
      }

      case "update_bank_account":
        return ok(await rinneRequest("PATCH", `/v1/merchants/${a.merchant_id}/bank-accounts/${a.bank_account_id}`, { primary: a.primary }));

      case "register_cashout_pix_key":
        return ok(await rinneRequest("POST", cashoutPixKeysBase(merchantId), { key: a.key, primary: a.primary ?? false }));

      case "get_balance": {
        const params = new URLSearchParams();
        if (a.provider) params.set("provider", String(a.provider));
        return ok(await rinneRequest("GET", `${balanceBase(merchantId)}?${params}`));
      }

      case "topup_balance":
        return ok(await rinneRequest("POST", balanceBase(merchantId), { provider: a.provider, amount: a.amount }));

      case "get_statement": {
        const params = new URLSearchParams();
        if (a.provider) params.set("provider", String(a.provider));
        if (a.date_from) params.set("date_from", String(a.date_from));
        if (a.date_to) params.set("date_to", String(a.date_to));
        return ok(await rinneRequest("GET", `/v1/merchants/${a.merchant_id}/statement?${params}`));
      }

      case "create_internal_transfer": {
        const body: Record<string, unknown> = {
          request_id: a.request_id, origin_bank_account_id: a.origin_bank_account_id,
          destination_bank_account_id: a.destination_bank_account_id, amount: a.amount,
        };
        if (a.metadata) body.metadata = a.metadata;
        return ok(await rinneRequest("POST", "/v1/banking/internal-transfers", body));
      }

      case "list_judicial_blockages": {
        const params = new URLSearchParams();
        for (const key of ["type", "affiliation_bank_account_id", "process_number", "occurred_at_from", "occurred_at_to", "page", "limit"]) {
          if (a[key] !== undefined) params.set(key, String(a[key]));
        }
        return ok(await rinneRequest("GET", `${judicialBlockagesBase(merchantId)}?${params}`));
      }

      // Cashouts
      case "create_cashout": {
        if (!a.destination_bank_account_id && !a.destination_pix_key_id) {
          throw new Error("Provide exactly one of destination_bank_account_id or destination_pix_key_id");
        }
        const body: Record<string, unknown> = {
          request_id: a.request_id, origin_bank_account_id: a.origin_bank_account_id, amount: a.amount,
          method: a.method, currency: a.currency ?? "BRL",
        };
        if (a.destination_bank_account_id) body.destination_bank_account_id = a.destination_bank_account_id;
        if (a.destination_pix_key_id) body.destination_pix_key_id = a.destination_pix_key_id;
        if (a.metadata) body.metadata = a.metadata;
        return ok(await rinneRequest("POST", cashoutsBase(merchantId), body));
      }

      case "list_cashouts":
        return ok(await rinneRequest("GET", cashoutsBase(merchantId)));

      case "get_cashout":
        return ok(await rinneRequest("GET", `${cashoutsBase(merchantId)}/${a.cashout_id}`));

      case "get_cashout_receipt":
        return ok(await rinneRequest("GET", `${cashoutsBase(merchantId)}/${a.cashout_id}/receipt`));

      // Pricing
      case "list_fee_policies": {
        const params = new URLSearchParams();
        for (const key of ["name", "id", "page", "limit"]) {
          if (a[key] !== undefined) params.set(key, String(a[key]));
        }
        if (a.is_active !== undefined) params.set("is_active", String(a.is_active));
        return ok(await rinneRequest("GET", `/v1/pricing/fee-policies?${params}`));
      }

      case "create_fee_policy":
        return ok(await rinneRequest("POST", "/v1/pricing/fee-policies", {
          name: a.name, description: a.description, is_active: a.is_active, cashout_price: a.cashout_price, rules: a.rules,
        }));

      case "replace_fee_policy":
        return ok(await rinneRequest("PUT", `/v1/pricing/fee-policies/${a.fee_policy_id}`, {
          name: a.name, description: a.description, is_active: a.is_active, cashout_price: a.cashout_price, rules: a.rules,
        }));

      case "update_fee_policy": {
        const body: Record<string, unknown> = {};
        for (const key of ["name", "is_active", "cashout_price", "rules"]) {
          if (a[key] !== undefined) body[key] = a[key];
        }
        return ok(await rinneRequest("PATCH", `/v1/pricing/fee-policies/${a.fee_policy_id}`, body));
      }

      case "list_cost_policies": {
        const params = new URLSearchParams();
        for (const key of ["name", "id", "mcc", "provider", "page", "limit"]) {
          if (a[key] !== undefined) params.set(key, String(a[key]));
        }
        if (a.is_active !== undefined) params.set("is_active", String(a.is_active));
        return ok(await rinneRequest("GET", `/v1/pricing/cost-policies?${params}`));
      }

      case "list_mccs":
        return ok(await rinneRequest("GET", "/v1/companies/mccs"));

      // Webhooks
      case "get_webhook_dashboard_url":
        return ok(await rinneRequest("GET", "/v1/webhooks/dashboard"));

      // System
      case "get_health":
        return ok(await rinneRequest("GET", "/health"));

      // Access management (JWT)
      case "create_api_key": {
        const body: Record<string, unknown> = { name: a.name, permissions: a.permissions };
        if (a.expires_at) body.expires_at = a.expires_at;
        return ok(await rinneJwtRequest("POST", apiKeysBase(merchantId), body));
      }

      case "list_api_keys":
        return ok(await rinneJwtRequest("GET", apiKeysBase(merchantId)));

      case "revoke_api_key":
        await rinneJwtRequest("DELETE", `${apiKeysBase(merchantId)}/${a.api_key_id}`);
        return ok({ id: a.api_key_id, revoked: true });

      case "create_role": {
        const body: Record<string, unknown> = { name: a.name, permissions: a.permissions };
        if (a.description) body.description = a.description;
        return ok(await rinneJwtRequest("POST", "/v1/roles", body));
      }

      case "list_roles": {
        const params = new URLSearchParams();
        for (const key of ["name", "company_id", "page", "limit"]) {
          if (a[key] !== undefined) params.set(key, String(a[key]));
        }
        return ok(await rinneJwtRequest("GET", `/v1/roles?${params}`));
      }

      case "list_permissions": {
        const params = new URLSearchParams();
        if (a.resource) params.set("resource", String(a.resource));
        return ok(await rinneJwtRequest("GET", `/v1/permissions?${params}`));
      }

      case "get_current_session":
        return ok(await rinneJwtRequest("GET", "/v1/auth/me"));

      // Users
      case "create_user": {
        const body: Record<string, unknown> = { identifiers: a.identifiers, first_name: a.first_name, last_name: a.last_name };
        if (a.auth_methods) body.auth_methods = a.auth_methods;
        if (a.roles) body.roles = a.roles;
        return ok(merchantId ? await rinneRequest("POST", usersBase(merchantId), body) : await rinneJwtRequest("POST", usersBase(), body));
      }

      case "list_users": {
        const params = new URLSearchParams();
        for (const key of ["page", "limit", "sort"]) {
          if (a[key] !== undefined) params.set(key, String(a[key]));
        }
        const path = `${usersBase(merchantId)}?${params}`;
        return ok(merchantId ? await rinneRequest("GET", path) : await rinneJwtRequest("GET", path));
      }

      case "update_user": {
        const body: Record<string, unknown> = {};
        if (a.first_name) body.first_name = a.first_name;
        if (a.last_name) body.last_name = a.last_name;
        if (a.roles) body.roles = a.roles;
        return ok(await rinneJwtRequest("PATCH", `/v1/users/${a.user_id}`, body));
      }

      case "suspend_user":
        return ok(await rinneJwtRequest("POST", `/v1/users/${a.user_id}/suspend`, {}));

      case "activate_user":
        return ok(await rinneJwtRequest("POST", `/v1/users/${a.user_id}/activate`, {}));

      // Zipcode
      case "lookup_zipcode":
        return ok(await rinneJwtRequest("GET", `/v1/zipcodes/${a.zipcode}`));

      // Sandbox
      case "get_sandbox_guide":
        return ok(SANDBOX_GUIDE);

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
