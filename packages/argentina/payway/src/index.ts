#!/usr/bin/env node

/**
 * MCP Server for Payway — Argentina's dominant card-acquiring gateway
 * (ex-Prisma Medios de Pago / Decidir, Visa-Banelco lineage).
 *
 * Two-step card flow:
 *   1. create_token   — tokenize card data (uses the PUBLIC apikey)
 *   2. create_payment — charge the token (uses the PRIVATE apikey)
 *
 * Tools (6):
 *   create_token     — tokenize card data into a single-use payment token
 *   create_payment   — create a card charge from a token (single or distributed/split)
 *   get_payment      — fetch a payment by id
 *   list_payments    — list payments with pagination + filters
 *   refund_payment   — refund a payment (full or partial)
 *   confirm_payment  — capture a previously authorized payment (two-step flow)
 *
 * Authentication
 *   A single raw header named `apikey` (NOT Bearer). Payway issues two
 *   co-equal keys: the PUBLIC key may only tokenize (/tokens); the
 *   PRIVATE key drives payments, captures, refunds and queries.
 *
 * Environment
 *   PAYWAY_PUBLIC_API_KEY  — public apikey (required for create_token)
 *   PAYWAY_PRIVATE_API_KEY — private apikey (required for everything else)
 *   PAYWAY_ENV             — "sandbox" | "production" (default: "sandbox")
 *
 * Base URLs
 *   production: https://ventasonline.payway.com.ar/api/v2
 *   sandbox:    https://developers.decidir.com/api/v2
 *
 * Docs: https://decidirv2.api-docs.io / https://www.payway.com.ar
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const PUBLIC_KEY = process.env.PAYWAY_PUBLIC_API_KEY || "";
const PRIVATE_KEY = process.env.PAYWAY_PRIVATE_API_KEY || "";
const ENV = (process.env.PAYWAY_ENV || "sandbox").toLowerCase();

const BASE_URL = process.env.PAYWAY_BASE_URL || (ENV === "production"
  ? "https://ventasonline.payway.com.ar/api/v2"
  : "https://developers.decidir.com/api/v2");

async function paywayRequest(
  method: string,
  path: string,
  key: "public" | "private",
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<unknown> {
  const apikey = key === "public" ? PUBLIC_KEY : PRIVATE_KEY;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": apikey,
      "Cache-Control": "no-cache",
      ...(extraHeaders ?? {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Payway API ${res.status}: ${err}`);
  }
  const text = await res.text();
  if (!text) return { ok: true };
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new Server(
  { name: "mcp-payway", version: "0.1.0" },
  {
    capabilities: { tools: {} },
    instructions: `${MANAGED_TIER_HINT}

You are connected to Payway (ex-Prisma / Decidir), Argentina's dominant card-acquiring gateway.

## Workflow
The card charge flow is two-step: create_token (PUBLIC apikey) then create_payment (PRIVATE apikey).
- Amounts are integers in minor units: 50000 = ARS 500.00.
- payment_method_id identifies the card brand (1 = Visa, 31 = Mastercard, 15 = Maestro, ...).
- payment_type "single" is a normal sale; "distributed" with sub_payments splits across legs.
- Two-step (auth + capture) merchants confirm with confirm_payment.

## Important rules
- NEVER invent card data. Ask the user (or their vault) for PAN, expiry, CVV, cardholder name and document.
- site_transaction_id must be unique per sale — reuse it only to make retries idempotent.
- Refunds: POST with no amount = full refund; pass amount (minor units) for partial.`,
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_token",
      description:
        "Tokenize sensitive card data (PAN, expiry, CVV, cardholder, document) into a single-use payment token (POST /tokens). Uses the PUBLIC apikey. Returns a token id consumed by create_payment, plus the card bin.",
      inputSchema: {
        type: "object",
        properties: {
          card_number: { type: "string", description: "Full PAN (card number)" },
          card_expiration_month: { type: "string", description: "Expiry month, MM (e.g. '08')" },
          card_expiration_year: { type: "string", description: "Expiry year, YY (e.g. '27')" },
          security_code: { type: "string", description: "CVV/CVC" },
          card_holder_name: { type: "string", description: "Cardholder name as printed" },
          card_holder_identification: {
            type: "object",
            description: "Cardholder document, e.g. { type: 'dni', number: '12345678' }",
            properties: {
              type: { type: "string", description: "Document type (dni, cuit, ...)" },
              number: { type: "string", description: "Document number" },
            },
          },
        },
        required: [
          "card_number",
          "card_expiration_month",
          "card_expiration_year",
          "security_code",
          "card_holder_name",
        ],
      },
    },
    {
      name: "create_payment",
      description:
        "Create a card charge from a token produced by create_token (POST /payments). Uses the PRIVATE apikey. amount is an integer in minor units (50000 = ARS 500.00). payment_type 'single' for a normal sale, 'distributed' with sub_payments for split/marketplace.",
      inputSchema: {
        type: "object",
        properties: {
          site_transaction_id: { type: "string", description: "Merchant-side unique transaction id (idempotency anchor)" },
          token: { type: "string", description: "Token id from create_token" },
          payment_method_id: { type: "number", description: "Card brand id (1=Visa, 31=Mastercard, 15=Maestro, ...)" },
          bin: { type: "string", description: "First 6 digits of the PAN (returned by create_token)" },
          amount: { type: "number", description: "Integer amount in minor units (cents)" },
          currency: { type: "string", description: "ISO currency, e.g. ARS" },
          installments: { type: "number", description: "Number of installments (cuotas)" },
          description: { type: "string", description: "Charge description" },
          payment_type: { type: "string", enum: ["single", "distributed"], description: "'single' for a normal sale; 'distributed' for split" },
          sub_payments: { type: "array", description: "Distributed/split sub-payment legs; empty array for a single payment", items: { type: "object" } },
          customer: {
            type: "object",
            description: "Buyer reference for fraud screening: { id, email, ip_address }",
            properties: {
              id: { type: "string" },
              email: { type: "string" },
              ip_address: { type: "string" },
            },
          },
          establishment_name: { type: "string", description: "Soft descriptor / establishment name" },
        },
        required: ["site_transaction_id", "token", "payment_method_id", "amount", "currency", "installments", "payment_type"],
      },
    },
    {
      name: "get_payment",
      description: "Fetch a single payment by its Payway payment id (GET /payments/{id}). Uses the PRIVATE apikey.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payway payment id" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_payments",
      description: "List payments with optional pagination and filters (GET /payments). Uses the PRIVATE apikey.",
      inputSchema: {
        type: "object",
        properties: {
          offset: { type: "number", description: "Pagination offset" },
          pageSize: { type: "number", description: "Page size" },
          siteOperationId: { type: "string", description: "Filter by site_transaction_id" },
          merchantId: { type: "string", description: "Filter by merchant id (multi-site setups)" },
        },
      },
    },
    {
      name: "refund_payment",
      description:
        "Refund a payment, fully or partially (POST /payments/{id}/refunds). POST with an empty body refunds the full amount; pass amount (integer minor units) for a partial refund. Uses the PRIVATE apikey.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payway payment id to refund" },
          amount: { type: "number", description: "Optional partial refund amount in minor units; omit for a full refund" },
        },
        required: ["id"],
      },
    },
    {
      name: "confirm_payment",
      description:
        "Confirm (capture) a previously authorized payment in the two-step auth + capture flow (PUT /payments/{id}). Uses the PRIVATE apikey.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payway payment id to capture" },
          amount: { type: "number", description: "Amount to capture in minor units" },
        },
        required: ["id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "create_token": {
        const body = {
          card_number: args?.card_number,
          card_expiration_month: args?.card_expiration_month,
          card_expiration_year: args?.card_expiration_year,
          security_code: args?.security_code,
          card_holder_name: args?.card_holder_name,
          card_holder_identification: args?.card_holder_identification,
        };
        return {
          content: [
            { type: "text", text: JSON.stringify(await paywayRequest("POST", "/tokens", "public", body), null, 2) },
          ],
        };
      }
      case "create_payment": {
        const body = {
          site_transaction_id: args?.site_transaction_id,
          token: args?.token,
          payment_method_id: args?.payment_method_id,
          bin: args?.bin,
          amount: args?.amount,
          currency: args?.currency,
          installments: args?.installments,
          description: args?.description,
          payment_type: args?.payment_type,
          sub_payments: args?.sub_payments ?? [],
          customer: args?.customer,
          establishment_name: args?.establishment_name,
        };
        return {
          content: [
            { type: "text", text: JSON.stringify(await paywayRequest("POST", "/payments", "private", body), null, 2) },
          ],
        };
      }
      case "get_payment": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await paywayRequest("GET", `/payments/${args?.id}`, "private"), null, 2) },
          ],
        };
      }
      case "list_payments": {
        const params = new URLSearchParams();
        if (args?.offset !== undefined) params.set("offset", String(args.offset));
        if (args?.pageSize !== undefined) params.set("pageSize", String(args.pageSize));
        if (args?.siteOperationId) params.set("siteOperationId", String(args.siteOperationId));
        if (args?.merchantId) params.set("merchantId", String(args.merchantId));
        const qs = params.toString();
        return {
          content: [
            { type: "text", text: JSON.stringify(await paywayRequest("GET", `/payments${qs ? `?${qs}` : ""}`, "private"), null, 2) },
          ],
        };
      }
      case "refund_payment": {
        const body = args?.amount !== undefined ? { amount: args.amount } : undefined;
        return {
          content: [
            { type: "text", text: JSON.stringify(await paywayRequest("POST", `/payments/${args?.id}/refunds`, "private", body), null, 2) },
          ],
        };
      }
      case "confirm_payment": {
        const body = args?.amount !== undefined ? { amount: args.amount } : undefined;
        return {
          content: [
            { type: "text", text: JSON.stringify(await paywayRequest("PUT", `/payments/${args?.id}`, "private", body), null, 2) },
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
