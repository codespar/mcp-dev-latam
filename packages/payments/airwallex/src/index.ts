#!/usr/bin/env node

/**
 * MCP Server for Airwallex — embedded finance for cross-border collection and payouts.
 *
 * Airwallex is the inverse of EBANX: where EBANX lets global platforms collect
 * FROM LatAm and settle to USD, Airwallex lets LatAm sellers collect FROM abroad
 * (USD/EUR/GBP) into global accounts and settle locally, plus send cross-border
 * payouts and FX conversions. Together they bracket the cross-border flow both
 * ways.
 *
 * Tools (20):
 *   create_payment_intent    — create a pay-in payment intent (USD/EUR/GBP/etc)
 *   confirm_payment_intent   — confirm a payment intent with a payment method
 *   capture_payment_intent   — capture a previously-authorized payment intent
 *   retrieve_payment_intent  — fetch a payment intent by id
 *   cancel_payment_intent    — cancel an unconfirmed or uncaptured intent
 *   list_payment_intents     — list payment intents with filters (status, date range)
 *   create_refund            — refund a captured payment intent
 *   retrieve_refund          — fetch a refund by id
 *   create_customer          — onboard a customer for saved payment methods
 *   retrieve_customer        — fetch a customer by id
 *   update_customer          — update customer fields (email, address, metadata)
 *   create_beneficiary       — onboard a transfer beneficiary (bank details)
 *   retrieve_beneficiary     — fetch a beneficiary by id
 *   list_beneficiaries       — list beneficiaries with filters
 *   create_transfer          — send a cross-border transfer to a beneficiary
 *   retrieve_transfer        — fetch a transfer by id
 *   cancel_transfer          — cancel a transfer that has not yet settled
 *   list_transfers           — list transfers with filters (status, date range)
 *   create_conversion        — execute an FX conversion between wallet currencies
 *   retrieve_balance         — fetch current wallet balance per currency
 *
 * Authentication
 *   Token flow. POST /authentication/login with headers x-client-id + x-api-key
 *   (no body). Returns { token, expires_at }. The returned JWT is sent as
 *   Authorization: Bearer <token> on every subsequent call. Tokens last ~30
 *   minutes — the server caches the token in memory and refreshes 60s before
 *   expiry (same pattern as the Getnet OAuth cache).
 *
 * Environment
 *   AIRWALLEX_CLIENT_ID   client id (x-client-id on login)
 *   AIRWALLEX_API_KEY     api key, secret (x-api-key on login)
 *   AIRWALLEX_ENV         'demo' (default) or 'production'
 *
 * Docs: https://www.airwallex.com/docs/api
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.AIRWALLEX_CLIENT_ID || "";
const API_KEY = process.env.AIRWALLEX_API_KEY || "";
const ENV = (process.env.AIRWALLEX_ENV || "demo").toLowerCase();
const BASE_URL =
  ENV === "production"
    ? "https://api.airwallex.com/api/v1"
    : "https://api-demo.airwallex.com/api/v1";

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }
  const res = await fetch(`${BASE_URL}/authentication/login`, {
    method: "POST",
    headers: {
      "x-client-id": CLIENT_ID,
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Airwallex auth ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { token: string; expires_at: string };
  const expiresAtMs = Date.parse(data.expires_at);
  tokenCache = {
    token: data.token,
    expiresAt: Number.isFinite(expiresAtMs) ? expiresAtMs : now + 25 * 60_000,
  };
  return data.token;
}

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entries.length === 0) return "";
  const qs = new URLSearchParams();
  for (const [k, v] of entries) {
    qs.append(k, String(v));
  }
  return `?${qs.toString()}`;
}

async function airwallexRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Airwallex API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-airwallex", version: "0.2.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_payment_intent",
      description:
        "Create an Airwallex payment intent (pay-in). Used when a LatAm seller needs to collect USD/EUR/GBP from buyers abroad. Returns the intent with client_secret for client-side confirmation.",
      inputSchema: {
        type: "object",
        properties: {
          request_id: {
            type: "string",
            description:
              "Idempotency key (UUID recommended). Agents control idempotency — do not reuse.",
          },
          amount: { type: "number", description: "Amount in major units (e.g. 10.50 = 10.50 USD)" },
          currency: { type: "string", description: "ISO-4217 currency code (USD, EUR, GBP, etc)" },
          merchant_order_id: { type: "string", description: "Merchant-side order reference" },
          order: {
            type: "object",
            description: "Order detail (products, shipping, type). Structure per Airwallex /pa/payment_intents/create.",
          },
          customer_id: {
            type: "string",
            description: "Optional Airwallex customer id (from create_customer) to attach the intent to a saved customer",
          },
          descriptor: { type: "string", description: "Statement descriptor shown on buyer's statement" },
          metadata: { type: "object", description: "Free-form metadata key/value pairs" },
          return_url: { type: "string", description: "Browser return URL after hosted flow" },
        },
        required: ["request_id", "amount", "currency", "merchant_order_id"],
      },
    },
    {
      name: "confirm_payment_intent",
      description:
        "Confirm a previously-created payment intent with a payment method. For card intents this triggers authorization; for APM intents this returns a next_action (redirect, QR, etc).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payment intent id" },
          request_id: { type: "string", description: "Idempotency key" },
          payment_method: {
            type: "object",
            description: "Payment method object (type + per-type fields). See Airwallex API payment_method schema.",
          },
          payment_consent_reference: {
            type: "object",
            description: "Optional consent reference for MIT/recurring flows",
          },
          return_url: { type: "string", description: "Browser return URL for 3DS / APM redirects" },
        },
        required: ["id", "request_id", "payment_method"],
      },
    },
    {
      name: "retrieve_payment_intent",
      description: "Retrieve a payment intent by id. Returns current status, payment_attempts, and latest payment_method.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payment intent id" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_payment_intent",
      description:
        "Cancel a payment intent that has not yet been captured. Fails on already-captured intents; use create_refund instead.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payment intent id" },
          request_id: { type: "string", description: "Idempotency key" },
          cancellation_reason: {
            type: "string",
            description: "Reason code (e.g. duplicate, fraudulent, requested_by_customer, abandoned)",
          },
        },
        required: ["id", "request_id"],
      },
    },
    {
      name: "capture_payment_intent",
      description:
        "Capture a previously-authorized payment intent (two-step auth + capture flow). Use this after confirm_payment_intent on intents created with capture_method=manual. Amount may be less than authorized for partial capture.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payment intent id" },
          request_id: { type: "string", description: "Idempotency key" },
          amount: { type: "number", description: "Amount to capture in major units. Omit for full authorized amount." },
        },
        required: ["id", "request_id"],
      },
    },
    {
      name: "list_payment_intents",
      description:
        "List payment intents with optional filters (status, merchant_order_id, date range). Supports pagination via page_num / page_size.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by status (REQUIRES_PAYMENT_METHOD, SUCCEEDED, CANCELLED, etc)" },
          merchant_order_id: { type: "string", description: "Filter by merchant-side order reference" },
          from_created_at: { type: "string", description: "Lower bound on creation time (ISO 8601)" },
          to_created_at: { type: "string", description: "Upper bound on creation time (ISO 8601)" },
          page_num: { type: "number", description: "Page index (0-based)" },
          page_size: { type: "number", description: "Page size (default 20, max 200)" },
        },
      },
    },
    {
      name: "create_refund",
      description: "Refund a captured payment intent (full or partial). Returns the refund object with status.",
      inputSchema: {
        type: "object",
        properties: {
          request_id: { type: "string", description: "Idempotency key" },
          payment_intent_id: { type: "string", description: "Original payment intent id to refund" },
          amount: { type: "number", description: "Refund amount in major units. Omit for full refund." },
          reason: { type: "string", description: "Human-readable refund reason" },
          metadata: { type: "object", description: "Free-form metadata" },
        },
        required: ["request_id", "payment_intent_id"],
      },
    },
    {
      name: "retrieve_refund",
      description: "Retrieve a refund by id. Returns current status (RECEIVED, ACCEPTED, PROCESSING, SUCCEEDED, FAILED).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Refund id" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_customer",
      description:
        "Create an Airwallex customer for saved payment methods and recurring charges. Returns a customer object whose id can be passed into create_payment_intent.customer_id.",
      inputSchema: {
        type: "object",
        properties: {
          request_id: { type: "string", description: "Idempotency key" },
          merchant_customer_id: { type: "string", description: "Merchant-side stable customer id" },
          email: { type: "string", description: "Customer email" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          phone_number: { type: "string" },
          address: {
            type: "object",
            description: "Customer address (country_code, city, street, postcode, state)",
          },
          metadata: { type: "object", description: "Free-form metadata" },
        },
        required: ["request_id", "merchant_customer_id"],
      },
    },
    {
      name: "retrieve_customer",
      description: "Retrieve a customer by id. Returns the customer profile plus metadata.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Airwallex customer id" },
        },
        required: ["id"],
      },
    },
    {
      name: "update_customer",
      description:
        "Update fields on an existing customer (email, phone, address, metadata). Immutable fields like merchant_customer_id cannot be changed.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Airwallex customer id" },
          request_id: { type: "string", description: "Idempotency key" },
          email: { type: "string", description: "Updated email" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          phone_number: { type: "string" },
          address: { type: "object", description: "Updated address object" },
          metadata: { type: "object", description: "Free-form metadata (replaces previous metadata)" },
        },
        required: ["id", "request_id"],
      },
    },
    {
      name: "create_beneficiary",
      description:
        "Create a transfer beneficiary (recipient) with bank details. Required before sending cross-border payouts via create_transfer. Entity type, bank details fields, and required IDs vary by destination country.",
      inputSchema: {
        type: "object",
        properties: {
          request_id: { type: "string", description: "Idempotency key" },
          nickname: { type: "string", description: "Friendly label for this beneficiary" },
          type: { type: "string", description: "Beneficiary type (e.g. BANK_ACCOUNT)" },
          entity_type: { type: "string", enum: ["PERSONAL", "COMPANY"], description: "Individual or corporate beneficiary" },
          beneficiary: {
            type: "object",
            description:
              "Beneficiary identity (company_name or first_name+last_name, address, date_of_birth, etc, per entity_type)",
          },
          bank_details: {
            type: "object",
            description:
              "Destination bank details (account_number, account_currency, bank_country_code, swift_code, iban, local_clearing_system, etc). Required fields depend on destination country.",
          },
          payment_methods: {
            type: "array",
            description: "Allowed payment methods (e.g. ['LOCAL', 'SWIFT'])",
          },
        },
        required: ["request_id", "nickname", "entity_type", "beneficiary", "bank_details"],
      },
    },
    {
      name: "retrieve_beneficiary",
      description: "Retrieve a beneficiary by id. Returns bank details, entity_type, and allowed payment_methods.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Beneficiary id" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_beneficiaries",
      description: "List beneficiaries. Supports pagination and filters by entity_type, nickname and bank_country_code.",
      inputSchema: {
        type: "object",
        properties: {
          entity_type: { type: "string", enum: ["PERSONAL", "COMPANY"], description: "Filter by entity type" },
          nickname: { type: "string", description: "Filter by friendly label" },
          bank_country_code: { type: "string", description: "Filter by destination bank country (ISO-2)" },
          page_num: { type: "number", description: "Page index (0-based)" },
          page_size: { type: "number", description: "Page size (default 20)" },
        },
      },
    },
    {
      name: "create_transfer",
      description:
        "Send a cross-border transfer to a pre-created beneficiary. Supports same-currency payouts (source_currency === transfer_currency) or FX-inclusive payouts. Use quote_id from a prior quote for locked rates.",
      inputSchema: {
        type: "object",
        properties: {
          request_id: { type: "string", description: "Idempotency key" },
          reason: {
            type: "string",
            description:
              "Payout reason (e.g. GOODS_PURCHASE, SERVICES_FEE, PAYROLL, INVESTMENT) — required by regulators",
          },
          source_amount: { type: "number", description: "Amount debited from wallet in source_currency" },
          source_currency: { type: "string", description: "Wallet currency to debit" },
          beneficiary_id: { type: "string", description: "Airwallex beneficiary id (from create_beneficiary)" },
          transfer_amount: { type: "number", description: "Amount credited to beneficiary in transfer_currency" },
          transfer_currency: { type: "string", description: "Currency credited to beneficiary" },
          transfer_date: { type: "string", description: "Value date (YYYY-MM-DD)" },
          reference: { type: "string", description: "Reference shown on beneficiary's statement" },
          quote_id: { type: "string", description: "Optional FX quote id to lock the rate" },
          metadata: { type: "object", description: "Free-form metadata" },
        },
        required: ["request_id", "reason", "beneficiary_id", "transfer_currency"],
      },
    },
    {
      name: "retrieve_transfer",
      description: "Retrieve a transfer by id. Returns current status (APPROVED, IN_PROGRESS, DELIVERED, CANCELLED, etc).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Transfer id" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_transfer",
      description:
        "Cancel a transfer that has not yet settled. Only works while the transfer is in an early status (e.g. APPROVED, IN_PROGRESS before funds leave). Fails on DELIVERED transfers.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Transfer id" },
          request_id: { type: "string", description: "Idempotency key" },
        },
        required: ["id", "request_id"],
      },
    },
    {
      name: "list_transfers",
      description: "List transfers with optional filters (status, date range). Supports pagination.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by status (APPROVED, IN_PROGRESS, DELIVERED, CANCELLED, FAILED)" },
          from_created_at: { type: "string", description: "Lower bound on creation time (ISO 8601)" },
          to_created_at: { type: "string", description: "Upper bound on creation time (ISO 8601)" },
          page_num: { type: "number", description: "Page index (0-based)" },
          page_size: { type: "number", description: "Page size (default 20)" },
        },
      },
    },
    {
      name: "create_conversion",
      description:
        "Execute an FX conversion between wallet currencies (e.g. swap USD received into BRL before settling locally). Pass quote_id for a locked quoted rate, or omit for a market rate.",
      inputSchema: {
        type: "object",
        properties: {
          request_id: { type: "string", description: "Idempotency key" },
          buy_amount: { type: "number", description: "Amount to buy in buy_currency" },
          buy_currency: { type: "string", description: "Currency to buy" },
          sell_currency: { type: "string", description: "Currency to sell" },
          sell_amount: { type: "number", description: "Optional — amount to sell. Provide either buy_amount or sell_amount, not both." },
          conversion_date: { type: "string", description: "Settlement date (YYYY-MM-DD)" },
          quote_id: { type: "string", description: "Optional FX quote id to lock the rate" },
        },
        required: ["request_id", "buy_currency", "sell_currency"],
      },
    },
    {
      name: "retrieve_balance",
      description: "Retrieve the current wallet balance for every currency the account holds.",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_payment_intent":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("POST", "/pa/payment_intents/create", args),
                null,
                2,
              ),
            },
          ],
        };
      case "confirm_payment_intent": {
        const a = args as Record<string, unknown>;
        const id = String(a.id ?? "");
        const { id: _omit, ...body } = a;
        void _omit;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("POST", `/pa/payment_intents/${id}/confirm`, body),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "retrieve_payment_intent": {
        const id = String((args as { id: string }).id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("GET", `/pa/payment_intents/${id}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "cancel_payment_intent": {
        const a = args as Record<string, unknown>;
        const id = String(a.id ?? "");
        const { id: _omit, ...body } = a;
        void _omit;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("POST", `/pa/payment_intents/${id}/cancel`, body),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "capture_payment_intent": {
        const a = args as Record<string, unknown>;
        const id = String(a.id ?? "");
        const { id: _omit, ...body } = a;
        void _omit;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("POST", `/pa/payment_intents/${id}/capture`, body),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "list_payment_intents": {
        const qs = buildQuery(args as Record<string, unknown> | undefined);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("GET", `/pa/payment_intents${qs}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "create_refund":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("POST", "/pa/refunds/create", args),
                null,
                2,
              ),
            },
          ],
        };
      case "retrieve_refund": {
        const id = String((args as { id: string }).id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("GET", `/pa/refunds/${id}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "create_customer":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("POST", "/pa/customers/create", args),
                null,
                2,
              ),
            },
          ],
        };
      case "retrieve_customer": {
        const id = String((args as { id: string }).id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("GET", `/pa/customers/${id}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "update_customer": {
        const a = args as Record<string, unknown>;
        const id = String(a.id ?? "");
        const { id: _omit, ...body } = a;
        void _omit;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("POST", `/pa/customers/${id}/update`, body),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "create_beneficiary":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("POST", "/beneficiaries/create", args),
                null,
                2,
              ),
            },
          ],
        };
      case "retrieve_beneficiary": {
        const id = String((args as { id: string }).id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("GET", `/beneficiaries/${id}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "list_beneficiaries": {
        const qs = buildQuery(args as Record<string, unknown> | undefined);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("GET", `/beneficiaries${qs}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "create_transfer":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("POST", "/transfers/create", args),
                null,
                2,
              ),
            },
          ],
        };
      case "retrieve_transfer": {
        const id = String((args as { id: string }).id);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("GET", `/transfers/${id}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "cancel_transfer": {
        const a = args as Record<string, unknown>;
        const id = String(a.id ?? "");
        const { id: _omit, ...body } = a;
        void _omit;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("POST", `/transfers/${id}/cancel`, body),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "list_transfers": {
        const qs = buildQuery(args as Record<string, unknown> | undefined);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("GET", `/transfers${qs}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "create_conversion":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("POST", "/transactions/create_conversion", args),
                null,
                2,
              ),
            },
          ],
        };
      case "retrieve_balance":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await airwallexRequest("GET", "/balances/current"),
                null,
                2,
              ),
            },
          ],
        };
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return {
      content: [
        { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
      ],
      isError: true,
    };
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
        const s = new Server({ name: "mcp-airwallex", version: "0.2.1" }, { capabilities: { tools: {} } });
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
