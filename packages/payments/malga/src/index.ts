#!/usr/bin/env node

/**
 * MCP Server for Malga — Brazilian payments orchestration platform.
 *
 * Exposes a single API across multiple acquirers (Cielo, Rede, Stone, Adyen)
 * covering charges (credit card, Pix, boleto, voucher), capture and refund,
 * customers, saved cards and tokenization, merchants (sub-accounts), webhooks
 * and checkout sessions (1:1 and 1:N payment links).
 *
 * Tools (24):
 *   Charges
 *     - create_charge
 *     - get_charge
 *     - list_charges
 *     - capture_charge
 *     - refund_charge
 *   Customers
 *     - create_customer
 *     - get_customer
 *     - list_customers
 *   Cards / Tokens
 *     - create_card
 *     - get_card
 *     - list_customer_cards
 *     - create_token
 *   Merchants
 *     - get_merchant
 *     - list_merchants
 *   Webhooks
 *     - create_webhook
 *     - list_webhooks
 *   Sessions
 *     - create_session
 *     - get_session
 *     - pay_session
 *     - cancel_session
 *   Settings (payment link branding)
 *     - get_settings
 *     - create_settings
 *     - update_settings
 *   Sandbox
 *     - get_sandbox_guide
 *
 * Environment:
 *   MALGA_CLIENT_ID  — tenant identifier sent as X-Client-Id header (required)
 *   MALGA_API_KEY    — secret key sent as X-Api-Key header (required)
 *   MALGA_SANDBOX    — set to "false" for production (default: sandbox)
 *
 * Docs: https://docs.malga.io
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = process.env.MALGA_BASE_URL || (process.env.MALGA_SANDBOX === "false"
  ? "https://api.malga.io"
  : "https://sandbox-api.malga.io");
const CLIENT_ID = process.env.MALGA_CLIENT_ID ?? "";
const API_KEY = process.env.MALGA_API_KEY ?? "";
const USER_AGENT = "codespar-mcp-dev-latam/mcp-malga/0.1.0";

if (!CLIENT_ID || !API_KEY) {
  console.error("Error: MALGA_CLIENT_ID and MALGA_API_KEY environment variables are required.");
  process.exit(1);
}

/** @param overrideApiKey — used by pay_session with the session's publicKey */
async function malgaRequest(method: string, path: string, body?: unknown, overrideApiKey?: string, merchantId?: string) {
  const headers: Record<string, string> = {
    "X-Client-Id": CLIENT_ID,
    "X-Api-Key": overrideApiKey ?? API_KEY,
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
  };
  if (merchantId) headers["X-Merchant-Id"] = merchantId;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text.trim() ? parseMalgaResponseBody(text) : null;

  if (!response.ok) {
    throw new Error(typeof data === "string" ? data : JSON.stringify(data ?? { status: response.status }));
  }

  return data;
}

function parseMalgaResponseBody(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    const splitAt = trimmed.indexOf("}{");
    if (splitAt !== -1) {
      try {
        return JSON.parse(trimmed.slice(0, splitAt + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error(trimmed);
  }
}

async function malgaMultipartRequest(method: string, path: string, form: FormData, merchantId?: string) {
  const headers: Record<string, string> = {
    "X-Client-Id": CLIENT_ID,
    "X-Api-Key": API_KEY,
    "User-Agent": USER_AGENT,
  };
  if (merchantId) headers["X-Merchant-Id"] = merchantId;

  const response = await fetch(`${BASE_URL}${path}`, { method, headers, body: form });
  const text = await response.text();
  const data = parseMalgaResponseBody(text);

  if (!response.ok) {
    throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  }

  return data;
}

const SETTINGS_TEXT_FIELDS = [
  "mainColor",
  "secondaryColor",
  "attentionColor",
  "errorColor",
  "successColor",
  "backgroundColor",
  "companyUrl",
  "mastercardClickToPayDpaid",
] as const;

function buildSettingsTextFields(a: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const key of SETTINGS_TEXT_FIELDS) {
    if (a[key] !== undefined && a[key] !== "") fields[key] = String(a[key]);
  }
  return fields;
}

function appendSettingsLogo(form: FormData, a: Record<string, unknown>) {
  if (!a.logoBase64) return;
  const filename = String(a.logoFilename ?? "logo.png");
  const buf = Buffer.from(String(a.logoBase64), "base64");
  form.append("logo", new Blob([buf]), filename);
}

const SETTINGS_PROPERTIES_SCHEMA = {
  merchantId: {
    type: "string",
    format: "uuid",
    description: "Optional merchant ID (sent as X-Merchant-Id). GET falls back to client default if merchant config is missing. POST/PATCH scope is exact.",
  },
  mainColor: { type: "string", description: "Primary brand color (e.g. #000000)" },
  secondaryColor: { type: "string", description: "Secondary brand color" },
  attentionColor: { type: "string", description: "Alert/warning color" },
  errorColor: { type: "string", description: "Error message color" },
  successColor: { type: "string", description: "Success message color" },
  backgroundColor: { type: "string", description: "Background color" },
  companyUrl: { type: "string", description: "URL used in the payment link (e.g. https://www.company.com)" },
  mastercardClickToPayDpaid: {
    type: "string",
    description: "Mastercard Click to Pay dpaId (optional). Enables Click to Pay on payment links.",
  },
};

async function getChargeAmount(chargeId: string): Promise<number> {
  const charge = (await malgaRequest("GET", `/v1/charges/${chargeId}`)) as { amount: number };
  return charge.amount;
}

const SANDBOX_CARD_NUMBER_DESC =
  "Card number (16 digits). SANDBOX — the last digit determines the outcome: 0/1/4 = Approved | 2 = Not authorized | 3 = Expired | 5 = Blocked | 6 = Timeout | 7 = Canceled | 8 = Random";

const SANDBOX_CVV_DESC =
  "CVV (3 or 4 digits). SANDBOX — CVV ending in 0 = validated; any other value = not validated.";

const SANDBOX_GUIDE = {
  environment: BASE_URL,
  docsUrl: "https://docs.malga.io/documentations/welcome/testing",
  cardLastDigit: {
    description: "The last digit of the card number determines the transaction outcome in sandbox.",
    rules: [
      { lastDigit: "0, 1 or 4", authorized: true, status: "Approved" },
      { lastDigit: "2", authorized: false, status: "Not authorized" },
      { lastDigit: "3", authorized: false, status: "Expired card" },
      { lastDigit: "5", authorized: false, status: "Blocked card" },
      { lastDigit: "6", authorized: false, status: "Timeout" },
      { lastDigit: "7", authorized: false, status: "Canceled card" },
      { lastDigit: "8", authorized: "random", status: "Approved / Timeout (random)" },
    ],
  },
  cvv: {
    description: "CVV validation rule in sandbox (tokenization and saved-card charges).",
    rule: "CVV ending in 0 = validated; any other value = not validated",
  },
  captureAndRefund: {
    description: "Simulate capture or refund failure.",
    rule: "Use amount = 991 (cents) in the capture or refund request",
  },
  antifraud: {
    description: "The last digit of the document sent in fraudAnalysis when creating the transaction determines the antifraud status.",
    rules: [
      { documentLastDigit: "0", authorized: false, status: "Pending", declinedCode: null },
      { documentLastDigit: "1", authorized: true, status: "Approved", declinedCode: null },
      { documentLastDigit: "2", authorized: false, status: "Failed", declinedCode: "random timeout or processing_error" },
      { documentLastDigit: "any other", authorized: false, status: "Rejected", declinedCode: null },
    ],
  },
};

const DOCUMENT_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", description: "Document type (e.g. cpf, cnpj)" },
    number: { type: "string", description: "Document number" },
    country: { type: "string", description: "ISO country code (e.g. BR)", default: "BR" },
  },
  required: ["type", "number"],
};

const FRAUD_ANALYSIS_ADDRESS_SCHEMA = {
  type: "object",
  properties: {
    street: { type: "string" },
    number: { type: "string" },
    complement: { type: "string" },
    zipCode: { type: "string" },
    country: { type: "string", description: "ISO country code (e.g. BR)" },
    state: { type: "string" },
    district: { type: "string" },
    city: { type: "string" },
  },
};

const FRAUD_ANALYSIS_SCHEMA = {
  type: "object",
  description:
    "Antifraud payload (optional). SANDBOX — last digit of customer.identity: 0=Pending | 1=Approved | 2=Failed | other=Rejected. See get_sandbox_guide.",
  properties: {
    sla: { type: "number", description: "Max analysis SLA in minutes (optional)" },
    customer: {
      type: "object",
      description: "Buyer data for antifraud. identity last digit drives sandbox status.",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        identity: {
          type: "string",
          description: "Document number. SANDBOX — last digit controls antifraud status (0/1/2/other).",
        },
        identityType: { type: "string", description: "Document type (e.g. CPF, CNPJ)" },
        registrationDate: { type: "string", description: "ISO 8601 registration date" },
        billingAddress: { ...FRAUD_ANALYSIS_ADDRESS_SCHEMA, description: "Billing address" },
        deliveryAddress: { ...FRAUD_ANALYSIS_ADDRESS_SCHEMA, description: "Delivery address" },
        browser: {
          type: "object",
          properties: {
            browserFingerprint: { type: "string" },
            cookiesAccepted: { type: "boolean" },
            email: { type: "string" },
            hostName: { type: "string" },
            ipAddress: { type: "string" },
            type: { type: "string", description: "Browser name (e.g. Chrome)" },
          },
        },
      },
    },
    cart: {
      type: "object",
      description: "Cart details for antifraud",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "integer" },
              sku: { type: "string" },
              unitPrice: { type: "integer", description: "Unit price in cents" },
              risk: { type: "string", enum: ["High", "Low"] },
              description: { type: "string" },
              categoryId: { type: "string" },
            },
            required: ["name", "quantity", "unitPrice", "risk"],
          },
        },
      },
    },
  },
};

const PAYMENT_METHOD_ONEOF = [
  {
    title: "Credit card",
    type: "object",
    properties: {
      paymentType: { type: "string", enum: ["credit"], description: "Credit card payment method" },
      installments: { type: "integer", minimum: 1, description: "Number of installments (minimum 1)" },
      recurrence: {
        type: "string",
        enum: ["initial", "subsequent", "unscheduled"],
        description: "Indicates whether the transaction is recurring",
      },
    },
    required: ["paymentType", "installments"],
  },
  {
    title: "Pix",
    type: "object",
    properties: {
      paymentType: { type: "string", enum: ["pix"], description: "Pix payment method" },
      expiresIn: { type: "integer", minimum: 1, description: "Charge validity in seconds (e.g. 3600)" },
    },
    required: ["paymentType", "expiresIn"],
  },
  {
    title: "Boleto",
    type: "object",
    properties: {
      paymentType: { type: "string", enum: ["boleto"], description: "Bank slip (boleto) payment method" },
      expiresDate: { type: "string", description: "Due date as ISO date (e.g. 2026-12-31). Default: 7 days." },
      instructions: { type: "string", description: "Boleto instructions (max 255 characters)" },
    },
    required: ["paymentType"],
  },
  {
    title: "Voucher",
    type: "object",
    properties: {
      paymentType: { type: "string", enum: ["voucher"], description: "Voucher payment method (VR, Alelo, etc.)" },
    },
    required: ["paymentType"],
  },
];

const PAYMENT_SOURCE_ONEOF = [
  {
    title: "One-shot card (raw data)",
    type: "object",
    description: "Direct charge with raw card data without prior tokenization.",
    properties: {
      sourceType: { type: "string", enum: ["card"] },
      card: {
        type: "object",
        properties: {
          cardHolderName: { type: "string", description: "Cardholder name as printed on the card" },
          cardNumber: { type: "string", description: SANDBOX_CARD_NUMBER_DESC },
          cardCvv: { type: "string", description: SANDBOX_CVV_DESC },
          cardExpirationDate: { type: "string", description: "Expiration date in MM/YYYY format (e.g. 06/2028)" },
        },
        required: ["cardHolderName", "cardNumber", "cardCvv", "cardExpirationDate"],
      },
    },
    required: ["sourceType", "card"],
  },
  {
    title: "Saved card (cardId)",
    type: "object",
    description: "Charge using a card previously saved via create_card.",
    properties: {
      sourceType: { type: "string", enum: ["card"] },
      cardId: { type: "string", format: "uuid", description: "Saved card ID" },
      cardCvv: { type: "string", description: `CVV (optional, recommended when the buyer is present). ${SANDBOX_CVV_DESC}` },
    },
    required: ["sourceType", "cardId"],
  },
  {
    title: "Single-use token",
    type: "object",
    description: "Charge using a token generated by create_token (single use).",
    properties: {
      sourceType: { type: "string", enum: ["token"] },
      tokenId: { type: "string", format: "uuid", description: "Generated token ID" },
    },
    required: ["sourceType", "tokenId"],
  },
  {
    title: "Customer (default card)",
    type: "object",
    description: "Charges the customer's saved default card.",
    properties: {
      sourceType: { type: "string", enum: ["customer"] },
      customerId: { type: "string", format: "uuid", description: "Customer ID" },
      cardCvv: { type: "string", description: `CVV (optional). ${SANDBOX_CVV_DESC}` },
    },
    required: ["sourceType", "customerId"],
  },
  {
    title: "Customer with inline data (Pix/Boleto)",
    type: "object",
    description: "Pass buyer data inline — required for Pix and Boleto when no customer has been created.",
    properties: {
      sourceType: { type: "string", enum: ["customer"] },
      customer: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          phoneNumber: { type: "string" },
          document: DOCUMENT_SCHEMA,
        },
        required: ["email", "phoneNumber", "document"],
      },
    },
    required: ["sourceType", "customer"],
  },
];

const SESSION_PAYMENT_METHODS_ITEMS_ONEOF = [
  {
    title: "Credit card",
    type: "object",
    properties: {
      paymentType: { type: "string", enum: ["credit"] },
      installments: { type: "integer", minimum: 1, description: "Number of installments" },
    },
    required: ["paymentType", "installments"],
  },
  {
    title: "Pix",
    type: "object",
    properties: {
      paymentType: { type: "string", enum: ["pix"] },
      expiresIn: { type: "integer", minimum: 1, description: "Validity in seconds (e.g. 3600)" },
    },
    required: ["paymentType", "expiresIn"],
  },
  {
    title: "Boleto",
    type: "object",
    properties: {
      paymentType: { type: "string", enum: ["boleto"] },
      expiresDate: { type: "string", description: "Due date as ISO date (e.g. 2026-12-31)" },
    },
    required: ["paymentType", "expiresDate"],
  },
  {
    title: "Drip",
    type: "object",
    properties: {
      paymentType: { type: "string", enum: ["drip"] },
      cancelRedirectUrl: { type: "string" },
      successRedirectUrl: { type: "string" },
    },
    required: ["paymentType"],
  },
  {
    title: "NuPay",
    type: "object",
    properties: {
      paymentType: { type: "string", enum: ["nupay"] },
      orderUrl: { type: "string" },
      returnUrl: { type: "string" },
      cancelUrl: { type: "string" },
      delayToAutoCancel: { type: "integer", description: "Minutes until automatic expiration" },
    },
    required: ["paymentType"],
  },
];

const SESSION_ITEM_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Item name" },
    unitPrice: { type: "integer", minimum: 0, description: "Unit price in cents" },
    quantity: { type: "integer", minimum: 1, description: "Quantity" },
    description: { type: "string", description: "Description (optional)" },
    tangible: { type: "boolean", description: "Physical item (optional)" },
    categoryId: { type: "string", description: "Category ID (optional)" },
  },
  required: ["name", "unitPrice", "quantity"],
};

const TOOLS = [
  {
    name: "create_charge",
    description: "Create a new charge in Malga. Supports credit card (one-shot or saved), token, Pix, and boleto. The `capture` field defaults to `false` in the API — pass `true` for automatic capture. SANDBOX antifraud — the last digit of the document in fraudAnalysis determines the status: 0 = Pending | 1 = Approved | 2 = Failed | other = Rejected. Use get_sandbox_guide for all simulation rules.",
    inputSchema: {
      type: "object",
      properties: {
        merchantId: { type: "string", format: "uuid", description: "Merchant ID that will receive the payment" },
        amount: { type: "integer", description: "Amount in cents (e.g. 1000 = R$10.00)" },
        currency: { type: "string", default: "BRL", description: "ISO currency code (default: BRL)" },
        capture: { type: "boolean", default: false, description: "Capture automatically. Default false (pre-authorization)" },
        statementDescriptor: { type: "string", description: "Description shown on the buyer's statement (optional)" },
        description: { type: "string", description: "Internal charge description (optional)" },
        orderId: { type: "string", description: "Order ID in your system (optional)" },
        customerId: { type: "string", format: "uuid", description: "Malga customer ID (optional)" },
        paymentMethod: {
          description: "Payment method. Choose ONE of the variants below.",
          oneOf: PAYMENT_METHOD_ONEOF,
        },
        paymentSource: {
          description: "Payment source (card data, token, customer, etc.). Choose ONE of the variants below.",
          oneOf: PAYMENT_SOURCE_ONEOF,
        },
        fraudAnalysis: FRAUD_ANALYSIS_SCHEMA,
      },
      required: ["merchantId", "amount", "currency", "paymentMethod", "paymentSource"],
    },
  },
  {
    name: "get_charge",
    description: "Get charge details by ID.",
    inputSchema: {
      type: "object",
      properties: {
        chargeId: { type: "string", description: "Charge ID" },
      },
      required: ["chargeId"],
    },
  },
  {
    name: "list_charges",
    description: "List charges with optional filters.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "pre_authorized", "authorized", "failed", "canceled", "voided", "charged_back", "refund_pending", "capture_pending"],
          description: "Filter by status",
        },
        paymentType: { type: "string", enum: ["credit", "pix", "boleto", "voucher", "drip", "nupay", "picpay"], description: "Filter by payment method" },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Records per page (default 15)" },
        page: { type: "integer", minimum: 1, description: "Page number (default 1)" },
      },
      required: [],
    },
  },
  {
    name: "capture_charge",
    description: "Capture a pre-authorized charge (created with capture: false). If amount is omitted, uses the full charge amount.",
    inputSchema: {
      type: "object",
      properties: {
        chargeId: { type: "string", description: "Pre-authorized charge ID" },
        amount: { type: "integer", description: "Amount in cents to capture (default: full charge amount). SANDBOX — use 991 to simulate failure." },
      },
      required: ["chargeId"],
    },
  },
  {
    name: "refund_charge",
    description: "Void/refund an authorized or captured charge. If amount is omitted, uses the full charge amount.",
    inputSchema: {
      type: "object",
      properties: {
        chargeId: { type: "string", description: "Charge ID" },
        amount: { type: "integer", description: "Amount in cents to refund (default: full charge amount). SANDBOX — use 991 to simulate failure." },
      },
      required: ["chargeId"],
    },
  },
  {
    name: "create_customer",
    description: "Create a new customer in Malga. Email and document are unique per account.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name" },
        email: { type: "string", description: "Email (unique per account)" },
        phoneNumber: { type: "string", description: "Phone with area code (e.g. +5511999999999)" },
        document: {
          ...DOCUMENT_SCHEMA,
          description: "Customer document (required)",
        },
        address: {
          type: "object",
          description: "Address (optional)",
          properties: {
            street: { type: "string" },
            streetNumber: { type: "string" },
            complement: { type: "string" },
            zipCode: { type: "string" },
            country: { type: "string", default: "BR" },
          },
        },
      },
      required: ["name", "email", "phoneNumber", "document"],
    },
  },
  {
    name: "get_customer",
    description: "Get customer details by ID.",
    inputSchema: {
      type: "object",
      properties: {
        customerId: { type: "string", description: "Customer ID" },
      },
      required: ["customerId"],
    },
  },
  {
    name: "list_customers",
    description: "List customers with optional pagination.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Records per page (default 15)" },
        page: { type: "integer", minimum: 1, description: "Page number (default 1)" },
      },
      required: [],
    },
  },
  {
    name: "create_card",
    description: "Save a card linked to a customer for reuse in future charges. Pass `tokenId` (from create_token) or raw card data — in the latter case tokenization is performed automatically before saving.",
    inputSchema: {
      type: "object",
      properties: {
        customerId: { type: "string", format: "uuid", description: "Customer ID to link the card to" },
        tokenId: { type: "string", format: "uuid", description: "Single-use token generated by create_token" },
        number: { type: "string", description: `${SANDBOX_CARD_NUMBER_DESC} Alternative to tokenId.` },
        holderName: { type: "string", description: "Name printed on the card (e.g. JOHN S). Required if tokenId is not provided." },
        expirationDate: { type: "string", description: "Expiration date MM/YYYY. Required if tokenId is not provided." },
        cvv: { type: "string", description: `${SANDBOX_CVV_DESC} Required if tokenId is not provided.` },
      },
      required: ["customerId"],
    },
  },
  {
    name: "get_card",
    description: "Get saved card details by ID.",
    inputSchema: {
      type: "object",
      properties: {
        cardId: { type: "string", description: "Card ID" },
      },
      required: ["cardId"],
    },
  },
  {
    name: "list_customer_cards",
    description: "List all saved cards for a customer.",
    inputSchema: {
      type: "object",
      properties: {
        customerId: { type: "string", description: "Customer ID" },
      },
      required: ["customerId"],
    },
  },
  {
    name: "get_merchant",
    description: "Get merchant (sub-account) details by ID.",
    inputSchema: {
      type: "object",
      properties: {
        merchantId: { type: "string", description: "Merchant ID" },
      },
      required: ["merchantId"],
    },
  },
  {
    name: "list_merchants",
    description: "List merchants (sub-accounts) with optional pagination.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Records per page (default 15)" },
        page: { type: "integer", minimum: 1, description: "Page number (default 1)" },
      },
      required: [],
    },
  },
  {
    name: "create_webhook",
    description: "Register an endpoint to receive Malga event notifications. Use `*` in the event field to receive all events.",
    inputSchema: {
      type: "object",
      properties: {
        event: { type: "string", description: "Malga event (e.g. transaction.authorized, transaction.voided, transaction.failed) or * for all. See docs.malga.io for the full list." },
        endpoint: { type: "string", description: "HTTPS endpoint URL (e.g. https://example.com/webhook)" },
        version: { type: "number", default: 1.1, description: "Malga API version the webhook implements (default: 1.1)" },
        status: { type: "boolean", default: true, description: "Webhook active (default: true)" },
      },
      required: ["event", "endpoint"],
    },
  },
  {
    name: "list_webhooks",
    description: "List all webhooks configured on the account.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "create_session",
    description: "Create a checkout session (payment link) in Malga. Returns an `id` and a `publicKey` used to pay the session via pay_session. Supports 1:1 (default) and 1:N sessions (multiple payments via maxPayments).",
    inputSchema: {
      type: "object",
      properties: {
        merchantId: { type: "string", format: "uuid", description: "Merchant ID that will receive the payment" },
        amount: { type: "integer", minimum: 0, description: "Total amount in cents (optional; calculated from items if omitted)" },
        currency: { type: "string", default: "BRL", description: "ISO currency code (default: BRL)" },
        name: { type: "string", description: "Session identifier name (optional)" },
        description: { type: "string", description: "Session description (optional)" },
        statementDescriptor: { type: "string", minLength: 3, description: "Description on the buyer's statement (optional)" },
        capture: { type: "boolean", description: "Capture automatically (optional)" },
        isActive: { type: "boolean", description: "Whether the session starts active (default true)" },
        createLink: { type: "boolean", description: "Generate a public payment link (optional)" },
        captchaEnabled: { type: "boolean", description: "Enable CAPTCHA on the payment link (optional)" },
        dueDate: { type: "string", description: "Deadline as ISO 8601 — minimum tomorrow (e.g. 2026-12-31 or 2026-12-31T23:59:59Z)" },
        maxPayments: {
          description: "Configure as a 1:N link. Use -1 for unlimited or 1–99999 for a fixed limit. Omit for 1:1 session.",
          oneOf: [
            { type: "integer", enum: [-1], description: "Unlimited 1:N link" },
            { type: "integer", minimum: 1, maximum: 99999, description: "1:N link with fixed limit" },
          ],
        },
        orderId: { type: "string", description: "Order ID in your system (optional)" },
        paymentMethods: {
          type: "array",
          minItems: 1,
          description: "Accepted payment methods. Each item must follow ONE variant (credit, pix, boleto, drip, nupay).",
          items: { anyOf: SESSION_PAYMENT_METHODS_ITEMS_ONEOF },
        },
        items: {
          type: "array",
          minItems: 1,
          description: "Order items.",
          items: SESSION_ITEM_SCHEMA,
        },
      },
      required: ["merchantId", "paymentMethods", "items"],
    },
  },
  {
    name: "get_session",
    description: "Get session details and current status by ID. Includes `publicKey` to pay the session.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session ID" },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "pay_session",
    description: "Pay an existing session. IMPORTANT: requires the `publicKey` returned when creating the session (the `publicKey` field from create_session or get_session) — it is used as the authentication key for this call.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session ID to pay" },
        publicKey: { type: "string", format: "uuid", description: "Session publicKey (returned by create_session / get_session). Used as X-Api-Key for this call." },
        paymentMethod: {
          description: "Payment method. Choose ONE of the variants.",
          oneOf: PAYMENT_METHOD_ONEOF,
        },
        paymentSource: {
          description: "Payment source. Choose ONE of the variants.",
          oneOf: PAYMENT_SOURCE_ONEOF,
        },
      },
      required: ["sessionId", "publicKey", "paymentMethod", "paymentSource"],
    },
  },
  {
    name: "cancel_session",
    description: "Cancel a pending payment session.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "Session ID to cancel" },
      },
      required: ["sessionId"],
    },
  },
  {
    name: "create_token",
    description: "Tokenize card data generating a temporary single-use token. Does not save the card. Use in `paymentSource: { sourceType: 'token', tokenId }` of create_charge. Use `create_card` to save permanently.",
    inputSchema: {
      type: "object",
      properties: {
        cardHolderName: { type: "string", description: "Name printed on the card" },
        cardNumber: { type: "string", description: `${SANDBOX_CARD_NUMBER_DESC} No spaces.` },
        cardExpirationDate: { type: "string", description: "Expiration date in MM/YYYY format (e.g. 12/2026)" },
        cardCvv: { type: "string", description: SANDBOX_CVV_DESC },
      },
      required: ["cardHolderName", "cardNumber", "cardExpirationDate", "cardCvv"],
    },
  },
  {
    name: "get_sandbox_guide",
    description: "Return Malga sandbox simulation rules: card last-digit behavior, CVV rule, capture/refund failure, and antifraud.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_settings",
    description: "Get payment link branding settings for the client or a specific merchant. With merchantId, returns merchant config or falls back to client default.",
    inputSchema: {
      type: "object",
      properties: {
        merchantId: SETTINGS_PROPERTIES_SCHEMA.merchantId,
      },
      required: [],
    },
  },
  {
    name: "create_settings",
    description: "Create payment link branding settings. Uses multipart/form-data. REQUIRED: pass logoBase64+logoFilename (.png/.jpg, max 1000px) — the API rejects POST /v1/settings without a file. Without merchantId, creates the client default.",
    inputSchema: {
      type: "object",
      properties: {
        ...SETTINGS_PROPERTIES_SCHEMA,
        logoBase64: { type: "string", description: "Base64-encoded logo image (.png or .jpg, max 1000px). Required for create_settings." },
        logoFilename: { type: "string", description: "Filename for logoBase64 upload (e.g. logo.png). Defaults to logo.png." },
      },
      required: [],
    },
  },
  {
    name: "update_settings",
    description: "Update payment link branding settings (PATCH /v1/settings). Sends JSON for text fields; uses multipart when a logo is provided. Empty strings are ignored. Returns 422 if no effective fields are sent.",
    inputSchema: {
      type: "object",
      properties: {
        ...SETTINGS_PROPERTIES_SCHEMA,
        logoBase64: { type: "string", description: "Base64-encoded logo (.png or .jpg). When set (with or without text fields), request uses multipart/form-data." },
        logoFilename: { type: "string", description: "Filename for logoBase64 upload (e.g. logo.png). Defaults to logo.png." },
      },
      required: [],
    },
  },
];

const server = new Server(
  { name: "mcp-malga", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  const a = args as Record<string, unknown>;

  try {
    switch (name) {
      case "create_charge": {
        const body: Record<string, unknown> = {
          merchantId: a.merchantId,
          amount: a.amount,
          currency: a.currency,
          paymentMethod: a.paymentMethod,
          paymentSource: a.paymentSource,
        };
        if (a.capture !== undefined) body.capture = a.capture;
        if (a.statementDescriptor) body.statementDescriptor = a.statementDescriptor;
        if (a.description) body.description = a.description;
        if (a.orderId) body.orderId = a.orderId;
        if (a.customerId) body.customerId = a.customerId;
        if (a.fraudAnalysis) body.fraudAnalysis = a.fraudAnalysis;
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("POST", "/v1/charges", body), null, 2) }] };
      }

      case "get_charge":
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("GET", `/v1/charges/${a.chargeId}`), null, 2) }] };

      case "list_charges": {
        const params = new URLSearchParams();
        if (a.status) params.set("status", String(a.status));
        if (a.paymentType) params.set("paymentType", String(a.paymentType));
        if (a.limit) params.set("limit", String(a.limit));
        if (a.page) params.set("page", String(a.page));
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("GET", `/v1/charges?${params}`), null, 2) }] };
      }

      case "capture_charge": {
        const amount = a.amount ?? await getChargeAmount(String(a.chargeId));
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("POST", `/v1/charges/${a.chargeId}/capture`, { amount }), null, 2) }] };
      }

      case "refund_charge": {
        const amount = a.amount ?? await getChargeAmount(String(a.chargeId));
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("POST", `/v1/charges/${a.chargeId}/void`, { amount }), null, 2) }] };
      }

      case "create_customer": {
        const body: Record<string, unknown> = {
          name: a.name,
          email: a.email,
          phoneNumber: a.phoneNumber,
          document: a.document,
        };
        if (a.address) body.address = a.address;
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("POST", "/v1/customers", body), null, 2) }] };
      }

      case "get_customer":
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("GET", `/v1/customers/${a.customerId}`), null, 2) }] };

      case "list_customers": {
        const params = new URLSearchParams();
        if (a.limit) params.set("limit", String(a.limit));
        if (a.page) params.set("page", String(a.page));
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("GET", `/v1/customers?${params}`), null, 2) }] };
      }

      case "create_card": {
        let tokenId = a.tokenId as string | undefined;
        if (!tokenId) {
          if (!a.number || !a.holderName || !a.expirationDate || !a.cvv) {
            throw new Error("Provide tokenId (from create_token) or raw card data: number, holderName, expirationDate, cvv");
          }
          const token = (await malgaRequest("POST", "/v1/tokens", {
            cardHolderName: a.holderName,
            cardNumber: a.number,
            cardExpirationDate: a.expirationDate,
            cardCvv: a.cvv,
          })) as { tokenId: string };
          tokenId = token.tokenId;
        }
        const card = (await malgaRequest("POST", "/v1/cards", { tokenId })) as { id?: string };
        const customerId = a.customerId as string | undefined;
        if (customerId && card.id) {
          await malgaRequest("POST", `/v1/customers/${customerId}/cards`, { cardId: card.id });
          const linked = await malgaRequest("GET", `/v1/cards/${card.id}`);
          return { content: [{ type: "text", text: JSON.stringify(linked, null, 2) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(card, null, 2) }] };
      }

      case "get_card":
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("GET", `/v1/cards/${a.cardId}`), null, 2) }] };

      case "list_customer_cards":
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("GET", `/v1/customers/${a.customerId}/cards`), null, 2) }] };

      case "get_merchant":
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("GET", `/v1/merchants/${a.merchantId}`), null, 2) }] };

      case "list_merchants": {
        const params = new URLSearchParams();
        if (a.limit) params.set("limit", String(a.limit));
        if (a.page) params.set("page", String(a.page));
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("GET", `/v1/merchants?${params}`), null, 2) }] };
      }

      case "create_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("POST", "/v1/webhooks", {
          event: a.event,
          endpoint: a.endpoint,
          version: a.version ?? 1.1,
          status: a.status ?? true,
        }), null, 2) }] };

      case "list_webhooks":
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("GET", "/v1/webhooks"), null, 2) }] };

      case "create_session": {
        const body: Record<string, unknown> = {
          merchantId: a.merchantId,
          paymentMethods: a.paymentMethods,
          items: a.items,
        };
        if (a.amount !== undefined) body.amount = a.amount;
        if (a.currency) body.currency = a.currency;
        if (a.name) body.name = a.name;
        if (a.description) body.description = a.description;
        if (a.statementDescriptor) body.statementDescriptor = a.statementDescriptor;
        if (a.capture !== undefined) body.capture = a.capture;
        if (a.isActive !== undefined) body.isActive = a.isActive;
        if (a.createLink !== undefined) body.createLink = a.createLink;
        if (a.captchaEnabled !== undefined) body.captchaEnabled = a.captchaEnabled;
        if (a.dueDate) body.dueDate = a.dueDate;
        if (a.maxPayments !== undefined) body.maxPayments = a.maxPayments;
        if (a.orderId) body.orderId = a.orderId;
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("POST", "/v1/sessions", body), null, 2) }] };
      }

      case "get_session":
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("GET", `/v1/sessions/${a.sessionId}`), null, 2) }] };

      case "pay_session":
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest(
          "POST",
          `/v1/sessions/${a.sessionId}/charge`,
          { paymentMethod: a.paymentMethod, paymentSource: a.paymentSource },
          a.publicKey as string,
        ), null, 2) }] };

      case "cancel_session":
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("POST", `/v1/sessions/${a.sessionId}/cancel`, {}), null, 2) }] };

      case "create_token":
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("POST", "/v1/tokens", {
          cardHolderName: a.cardHolderName,
          cardNumber: a.cardNumber,
          cardExpirationDate: a.cardExpirationDate,
          cardCvv: a.cardCvv,
        }), null, 2) }] };

      case "get_sandbox_guide":
        return { content: [{ type: "text", text: JSON.stringify(SANDBOX_GUIDE, null, 2) }] };

      case "get_settings":
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("GET", "/v1/settings", undefined, undefined, a.merchantId as string | undefined), null, 2) }] };

      case "create_settings": {
        if (!a.logoBase64) {
          throw new Error(
            "create_settings requires logoBase64. The Malga API rejects POST /v1/settings without a file upload (returns concatenated JSON errors)."
          );
        }
        const form = new FormData();
        const fields = buildSettingsTextFields(a);
        for (const [key, value] of Object.entries(fields)) form.append(key, value);
        appendSettingsLogo(form, a);
        if (!form.has("logo")) {
          throw new Error("Failed to attach logo — check logoBase64 is valid base64");
        }
        return { content: [{ type: "text", text: JSON.stringify(await malgaMultipartRequest("POST", "/v1/settings", form, a.merchantId as string | undefined), null, 2) }] };
      }

      case "update_settings": {
        const merchantId = a.merchantId as string | undefined;
        const hasLogo = Boolean(a.logoBase64);
        if (hasLogo) {
          const form = new FormData();
          const fields = buildSettingsTextFields(a);
          for (const [key, value] of Object.entries(fields)) form.append(key, value);
          appendSettingsLogo(form, a);
          if (Object.keys(fields).length === 0 && !form.has("logo")) {
            throw new Error("Provide at least one text field or a logo to update settings");
          }
          return { content: [{ type: "text", text: JSON.stringify(await malgaMultipartRequest("PATCH", "/v1/settings", form, merchantId), null, 2) }] };
        }
        const body = buildSettingsTextFields(a);
        if (Object.keys(body).length === 0) {
          throw new Error("Provide at least one field to update (empty strings are ignored by the API)");
        }
        return { content: [{ type: "text", text: JSON.stringify(await malgaRequest("PATCH", "/v1/settings", body, undefined, merchantId), null, 2) }] };
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
