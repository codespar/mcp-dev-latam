#!/usr/bin/env node

/**
 * MCP Server for Izipay — Peru's enterprise acquirer, the merchant-facing brand
 * of Niubiz (Visa + Peruvian banks joint venture, 20%+ acquirer share in Peru).
 *
 * Complements Culqi (Peru SMB PSP) for the enterprise segment. Peruvian merchants
 * with serious volume typically have an Izipay acquirer contract before adopting
 * a PSP — different customers, different contracts, different commercial terms.
 *
 * Tools (20):
 *   create_charge            — authorize a card payment (3DS supported)
 *   capture_charge           — capture a previously authorized charge
 *   cancel_charge            — void an authorized-but-uncaptured charge
 *   refund_charge            — full or partial refund of a captured charge
 *   get_charge               — retrieve a charge by id
 *   get_charge_by_order      — retrieve a charge by merchant orderNumber
 *   tokenize_card            — PCI-safe card tokenization for reuse
 *   delete_token             — remove a stored card token
 *   create_installment_plan  — Peruvian cuotas (installment) plan
 *   list_installment_options — query available cuota programs for a BIN/amount
 *   list_transactions        — reconciliation: transactions by date + status
 *   get_settlement           — daily settlement batch for a given date
 *   list_settlements         — settlement batches across a date range
 *   create_payment_link      — hosted checkout link (pay-by-link)
 *   get_payment_link         — retrieve a payment link by id
 *   pay_yape                 — Yape direct payment (BCP wallet, phone+OTP)
 *   pay_plin                 — Plin direct payment (Interbank/BBVA/Scotia wallet)
 *   authenticate_3ds         — complete a 3DS challenge (submit cres/PaRes)
 *   create_subscription      — recurrence: start a recurring card charge
 *   cancel_subscription      — recurrence: cancel an active subscription
 *
 * Authentication
 *   JWT Bearer. The server POSTs merchant credentials to /auth/login to obtain
 *   a JWT, then caches it in memory until 60s before expiry. On every API call
 *   the cached JWT is attached as `Authorization: Bearer <jwt>`.
 *
 * Environment
 *   IZIPAY_USERNAME         merchant username
 *   IZIPAY_PASSWORD         merchant password (secret)
 *   IZIPAY_MERCHANT_CODE    merchant code (codigoComercio)
 *   IZIPAY_ENV              "sandbox" | "production" (default: production)
 *   IZIPAY_BASE_URL         optional override
 *
 * Status: 0.2.0-alpha.1. Izipay's developer docs at developers.izipay.pe are
 * contract-gated; endpoint paths and request shapes below are best-effort
 * inferences from Izipay's public SDK repos and the common Niubiz/Izipay
 * REST conventions. Validate against your integration kit before going live
 * and open a PR with corrections.
 *
 * Docs: https://developers.izipay.pe
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const USERNAME = process.env.IZIPAY_USERNAME || "";
const PASSWORD = process.env.IZIPAY_PASSWORD || "";
const MERCHANT_CODE = process.env.IZIPAY_MERCHANT_CODE || "";
const ENV = (process.env.IZIPAY_ENV || "production").toLowerCase();
const DEFAULT_BASE =
  ENV === "sandbox" ? "https://sandbox-api.izipay.pe" : "https://api.izipay.pe";
const BASE_URL = process.env.IZIPAY_BASE_URL || DEFAULT_BASE;

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: USERNAME,
      password: PASSWORD,
      merchantCode: MERCHANT_CODE,
    }),
  });
  if (!res.ok) {
    throw new Error(`Izipay auth ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    accessToken?: string;
    token?: string;
    expiresIn?: number;
    expires_in?: number;
  };
  const accessToken = data.accessToken || data.token || "";
  const expiresIn = data.expiresIn || data.expires_in || 3600;
  if (!accessToken) {
    throw new Error("Izipay auth: no accessToken in response");
  }
  tokenCache = { accessToken, expiresAt: now + expiresIn * 1000 };
  return accessToken;
}

async function izipayRequest(
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
      "X-Merchant-Code": MERCHANT_CODE,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Izipay API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-izipay", version: "0.2.0-alpha.2" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_charge",
      description:
        "Authorize a card payment. Supports 3-D Secure (3DS) challenge flow when required by issuer/brand. Set capture=true for authorize+capture atomically; capture=false to authorize only and capture later via capture_charge.",
      inputSchema: {
        type: "object",
        properties: {
          amount: {
            type: "number",
            description:
              "Amount in minor units (céntimos de sol). 10000 = 100.00 PEN.",
          },
          currency: {
            type: "string",
            description: "ISO-4217 currency code. PEN or USD.",
          },
          order_id: {
            type: "string",
            description: "Merchant-side order reference (orderNumber).",
          },
          capture: {
            type: "boolean",
            description:
              "true = authorize + capture in one call; false = authorize only.",
          },
          card: {
            type: "object",
            description:
              "Card data. Prefer token from tokenize_card via `token_id`.",
            properties: {
              token_id: {
                type: "string",
                description:
                  "Token from tokenize_card. Preferred over raw PAN for PCI scope.",
              },
              number: { type: "string", description: "PAN (avoid; prefer token_id)" },
              expiration_month: { type: "string", description: "MM" },
              expiration_year: { type: "string", description: "YYYY" },
              security_code: { type: "string", description: "CVV/CVC" },
              cardholder_name: { type: "string" },
            },
          },
          customer: {
            type: "object",
            description: "Payer identity",
            properties: {
              email: { type: "string" },
              first_name: { type: "string" },
              last_name: { type: "string" },
              document_type: {
                type: "string",
                enum: ["DNI", "CE", "RUC", "PAS"],
                description: "Peruvian ID type",
              },
              document_number: { type: "string" },
              phone: { type: "string" },
            },
            required: ["email"],
          },
          three_ds: {
            type: "object",
            description: "3DS parameters (optional). Enable for issuer challenge.",
            properties: {
              enabled: { type: "boolean" },
              return_url: {
                type: "string",
                description:
                  "URL to return the browser to after 3DS challenge completes.",
              },
            },
          },
          description: { type: "string", description: "Human-readable description" },
        },
        required: ["amount", "currency", "order_id", "capture", "customer"],
      },
    },
    {
      name: "capture_charge",
      description:
        "Capture a previously authorized charge (when capture=false was used in create_charge).",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Izipay charge id" },
          amount: {
            type: "number",
            description:
              "Amount to capture in minor units. Omit to capture the full authorized amount.",
          },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "cancel_charge",
      description:
        "Void an authorized-but-uncaptured charge. Does not work on captured charges — use refund_charge for those.",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Izipay charge id" },
          reason: { type: "string", description: "Optional cancellation reason" },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "refund_charge",
      description:
        "Refund a captured charge. Pass amount for a partial refund; omit for a full refund.",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Izipay charge id" },
          amount: {
            type: "number",
            description:
              "Refund amount in minor units. Omit for a full refund.",
          },
          reason: { type: "string", description: "Optional refund reason" },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "get_charge",
      description: "Retrieve a charge by Izipay charge id.",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Izipay charge id" },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "tokenize_card",
      description:
        "Tokenize a card for PCI-safe reuse. Returns a token_id to pass into create_charge.card.token_id.",
      inputSchema: {
        type: "object",
        properties: {
          number: { type: "string", description: "PAN; never log" },
          expiration_month: { type: "string", description: "MM" },
          expiration_year: { type: "string", description: "YYYY" },
          security_code: { type: "string", description: "CVV/CVC" },
          cardholder_name: { type: "string" },
          customer_id: {
            type: "string",
            description:
              "Optional merchant-side customer id to associate the token with.",
          },
        },
        required: [
          "number",
          "expiration_month",
          "expiration_year",
          "security_code",
          "cardholder_name",
        ],
      },
    },
    {
      name: "delete_token",
      description: "Delete a stored card token.",
      inputSchema: {
        type: "object",
        properties: {
          token_id: { type: "string", description: "Izipay token id" },
        },
        required: ["token_id"],
      },
    },
    {
      name: "create_installment_plan",
      description:
        "Create a Peruvian cuotas (installment) plan on a charge. Enables splitting a card payment into N monthly installments, with or without interest, per the issuer's cuota program.",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: {
            type: "string",
            description: "Izipay charge id to attach the plan to",
          },
          installments: {
            type: "number",
            description: "Number of cuotas (typically 2, 3, 6, 12, 18, 24).",
          },
          interest_type: {
            type: "string",
            enum: ["WITH_INTEREST", "WITHOUT_INTEREST"],
            description: "Cuotas sin intereses vs con intereses.",
          },
          issuer: {
            type: "string",
            description:
              "Optional issuer code (e.g. BCP, Interbank, BBVA) if the plan is issuer-specific.",
          },
        },
        required: ["charge_id", "installments", "interest_type"],
      },
    },
    {
      name: "list_transactions",
      description:
        "List transactions for reconciliation. Filter by date range and status.",
      inputSchema: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Start date ISO-8601 (YYYY-MM-DD or full timestamp).",
          },
          to: {
            type: "string",
            description: "End date ISO-8601.",
          },
          status: {
            type: "string",
            description:
              "Filter by status: AUTHORIZED, CAPTURED, CANCELED, REFUNDED, DECLINED.",
          },
          page: { type: "number", description: "Page number (starts at 1)" },
          limit: { type: "number", description: "Page size" },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "get_settlement",
      description:
        "Get the daily settlement batch (liquidación) for a given date. Returns gross, fees, net, and line items that settled to the merchant's bank account.",
      inputSchema: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Settlement date YYYY-MM-DD.",
          },
        },
        required: ["date"],
      },
    },
    {
      name: "get_charge_by_order",
      description:
        "Retrieve a charge by the merchant-side orderNumber (order_id passed to create_charge). Use when you have the merchant reference but not the Izipay charge id.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: {
            type: "string",
            description: "Merchant-side order reference (orderNumber).",
          },
        },
        required: ["order_id"],
      },
    },
    {
      name: "list_installment_options",
      description:
        "Query available cuota programs for a given card BIN and amount. Returns the list of issuer-offered installment plans (number of cuotas, with/without interest) that can be attached via create_installment_plan.",
      inputSchema: {
        type: "object",
        properties: {
          bin: {
            type: "string",
            description: "First 6-8 digits of PAN (card BIN).",
          },
          amount: {
            type: "number",
            description: "Amount in minor units to price the plans against.",
          },
          currency: {
            type: "string",
            description: "ISO-4217 currency code. PEN or USD.",
          },
        },
        required: ["bin", "amount", "currency"],
      },
    },
    {
      name: "list_settlements",
      description:
        "List settlement batches across a date range. Summary view over get_settlement for multi-day reconciliation.",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date YYYY-MM-DD." },
          to: { type: "string", description: "End date YYYY-MM-DD." },
          page: { type: "number", description: "Page number (starts at 1)" },
          limit: { type: "number", description: "Page size" },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "create_payment_link",
      description:
        "Create a hosted payment link (pay-by-link). Returns a URL to share with the payer; Izipay renders the checkout and reports via webhook. Useful for WhatsApp/email flows where no integrated checkout exists.",
      inputSchema: {
        type: "object",
        properties: {
          amount: {
            type: "number",
            description: "Amount in minor units.",
          },
          currency: {
            type: "string",
            description: "ISO-4217 currency code. PEN or USD.",
          },
          order_id: {
            type: "string",
            description: "Merchant-side order reference.",
          },
          description: {
            type: "string",
            description: "Human-readable description shown on the checkout.",
          },
          expires_at: {
            type: "string",
            description: "Optional ISO-8601 expiration timestamp.",
          },
          return_url: {
            type: "string",
            description: "URL to redirect the payer to after completion.",
          },
          customer: {
            type: "object",
            description: "Optional pre-filled payer identity.",
            properties: {
              email: { type: "string" },
              first_name: { type: "string" },
              last_name: { type: "string" },
              document_type: {
                type: "string",
                enum: ["DNI", "CE", "RUC", "PAS"],
              },
              document_number: { type: "string" },
              phone: { type: "string" },
            },
          },
        },
        required: ["amount", "currency", "order_id"],
      },
    },
    {
      name: "get_payment_link",
      description:
        "Retrieve a payment link by id. Returns current status, associated charge (if paid), and expiration.",
      inputSchema: {
        type: "object",
        properties: {
          link_id: { type: "string", description: "Izipay payment link id" },
        },
        required: ["link_id"],
      },
    },
    {
      name: "pay_yape",
      description:
        "Initiate a Yape direct payment. Yape is BCP's mobile wallet (most-used wallet in Peru). The payer authorizes via an OTP code from their Yape app bound to their phone number.",
      inputSchema: {
        type: "object",
        properties: {
          amount: {
            type: "number",
            description: "Amount in minor units (céntimos de sol).",
          },
          currency: {
            type: "string",
            description: "Typically PEN.",
          },
          order_id: {
            type: "string",
            description: "Merchant-side order reference.",
          },
          phone: {
            type: "string",
            description: "Payer's Yape phone number (9 digits, e.g. 9XXXXXXXX).",
          },
          otp: {
            type: "string",
            description:
              "One-time code generated in the payer's Yape app (6 digits).",
          },
          document_number: {
            type: "string",
            description: "Payer's DNI (required by Yape anti-fraud).",
          },
          description: { type: "string" },
        },
        required: [
          "amount",
          "currency",
          "order_id",
          "phone",
          "otp",
          "document_number",
        ],
      },
    },
    {
      name: "pay_plin",
      description:
        "Initiate a Plin direct payment. Plin is the inter-bank wallet (Interbank, BBVA, Scotiabank, BanBif). The payer authorizes in-app; this call sends the payment request to their phone.",
      inputSchema: {
        type: "object",
        properties: {
          amount: {
            type: "number",
            description: "Amount in minor units.",
          },
          currency: {
            type: "string",
            description: "Typically PEN.",
          },
          order_id: {
            type: "string",
            description: "Merchant-side order reference.",
          },
          phone: {
            type: "string",
            description: "Payer's Plin-registered phone number.",
          },
          document_number: {
            type: "string",
            description: "Payer's DNI.",
          },
          description: { type: "string" },
        },
        required: ["amount", "currency", "order_id", "phone", "document_number"],
      },
    },
    {
      name: "authenticate_3ds",
      description:
        "Complete a 3-D Secure challenge. Call after the payer finishes the issuer challenge (redirected back to return_url) with the authenticator response (cres / PaRes). Returns the authenticated charge state so capture or authorization can proceed.",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Izipay charge id" },
          cres: {
            type: "string",
            description: "3DS2 cres (challenge response) from the ACS.",
          },
          pares: {
            type: "string",
            description: "3DS1 PaRes (legacy). Use cres for 3DS2.",
          },
          transaction_id: {
            type: "string",
            description: "3DS transactionId / dsTransactionId if required.",
          },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "create_subscription",
      description:
        "Start a recurring card charge (subscription). The card must be tokenized first via tokenize_card. Izipay will charge the token on the configured cadence and emit webhooks per cycle.",
      inputSchema: {
        type: "object",
        properties: {
          token_id: {
            type: "string",
            description: "Card token from tokenize_card.",
          },
          amount: {
            type: "number",
            description: "Amount charged each cycle, in minor units.",
          },
          currency: {
            type: "string",
            description: "ISO-4217 currency code. PEN or USD.",
          },
          interval: {
            type: "string",
            enum: ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"],
            description: "Billing cadence.",
          },
          interval_count: {
            type: "number",
            description:
              "Number of intervals between charges (e.g. interval=MONTHLY + interval_count=3 → every 3 months).",
          },
          start_date: {
            type: "string",
            description: "First charge date YYYY-MM-DD.",
          },
          end_date: {
            type: "string",
            description: "Optional end date YYYY-MM-DD; omit for open-ended.",
          },
          customer: {
            type: "object",
            properties: {
              email: { type: "string" },
              document_type: {
                type: "string",
                enum: ["DNI", "CE", "RUC", "PAS"],
              },
              document_number: { type: "string" },
            },
            required: ["email"],
          },
          description: { type: "string" },
        },
        required: ["token_id", "amount", "currency", "interval", "customer"],
      },
    },
    {
      name: "cancel_subscription",
      description:
        "Cancel an active subscription. No further charges will be attempted; historical charges are preserved.",
      inputSchema: {
        type: "object",
        properties: {
          subscription_id: {
            type: "string",
            description: "Izipay subscription id",
          },
          reason: { type: "string", description: "Optional cancellation reason" },
        },
        required: ["subscription_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_charge":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest("POST", "/v1/charges", args),
                null,
                2,
              ),
            },
          ],
        };
      case "capture_charge": {
        const a = args as { charge_id: string; amount?: number };
        const body: Record<string, unknown> = {};
        if (a.amount !== undefined) body.amount = a.amount;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest(
                  "POST",
                  `/v1/charges/${a.charge_id}/capture`,
                  body,
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "cancel_charge": {
        const a = args as { charge_id: string; reason?: string };
        const body: Record<string, unknown> = {};
        if (a.reason) body.reason = a.reason;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest(
                  "POST",
                  `/v1/charges/${a.charge_id}/cancel`,
                  body,
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "refund_charge": {
        const a = args as { charge_id: string; amount?: number; reason?: string };
        const body: Record<string, unknown> = {};
        if (a.amount !== undefined) body.amount = a.amount;
        if (a.reason) body.reason = a.reason;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest(
                  "POST",
                  `/v1/charges/${a.charge_id}/refund`,
                  body,
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "get_charge": {
        const a = args as { charge_id: string };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest("GET", `/v1/charges/${a.charge_id}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "tokenize_card":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest("POST", "/v1/tokens", args),
                null,
                2,
              ),
            },
          ],
        };
      case "delete_token": {
        const a = args as { token_id: string };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest("DELETE", `/v1/tokens/${a.token_id}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "create_installment_plan":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest("POST", "/v1/installments", args),
                null,
                2,
              ),
            },
          ],
        };
      case "list_transactions": {
        const a = args as {
          from: string;
          to: string;
          status?: string;
          page?: number;
          limit?: number;
        };
        const params = new URLSearchParams();
        params.set("from", a.from);
        params.set("to", a.to);
        if (a.status) params.set("status", a.status);
        if (a.page !== undefined) params.set("page", String(a.page));
        if (a.limit !== undefined) params.set("limit", String(a.limit));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest("GET", `/v1/transactions?${params}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "get_settlement": {
        const a = args as { date: string };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest(
                  "GET",
                  `/v1/settlements/${encodeURIComponent(a.date)}`,
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "get_charge_by_order": {
        const a = args as { order_id: string };
        const params = new URLSearchParams({ orderNumber: a.order_id });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest("GET", `/v1/charges?${params}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "list_installment_options": {
        const a = args as { bin: string; amount: number; currency: string };
        const params = new URLSearchParams({
          bin: a.bin,
          amount: String(a.amount),
          currency: a.currency,
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest("GET", `/v1/installments/options?${params}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "list_settlements": {
        const a = args as {
          from: string;
          to: string;
          page?: number;
          limit?: number;
        };
        const params = new URLSearchParams();
        params.set("from", a.from);
        params.set("to", a.to);
        if (a.page !== undefined) params.set("page", String(a.page));
        if (a.limit !== undefined) params.set("limit", String(a.limit));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest("GET", `/v1/settlements?${params}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "create_payment_link":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest("POST", "/v1/payment-links", args),
                null,
                2,
              ),
            },
          ],
        };
      case "get_payment_link": {
        const a = args as { link_id: string };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest("GET", `/v1/payment-links/${a.link_id}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "pay_yape":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest("POST", "/v1/charges/yape", args),
                null,
                2,
              ),
            },
          ],
        };
      case "pay_plin":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest("POST", "/v1/charges/plin", args),
                null,
                2,
              ),
            },
          ],
        };
      case "authenticate_3ds": {
        const a = args as {
          charge_id: string;
          cres?: string;
          pares?: string;
          transaction_id?: string;
        };
        const body: Record<string, unknown> = {};
        if (a.cres) body.cres = a.cres;
        if (a.pares) body.pares = a.pares;
        if (a.transaction_id) body.transactionId = a.transaction_id;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest(
                  "POST",
                  `/v1/charges/${a.charge_id}/3ds/authenticate`,
                  body,
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "create_subscription":
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest("POST", "/v1/subscriptions", args),
                null,
                2,
              ),
            },
          ],
        };
      case "cancel_subscription": {
        const a = args as { subscription_id: string; reason?: string };
        const body: Record<string, unknown> = {};
        if (a.reason) body.reason = a.reason;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await izipayRequest(
                  "POST",
                  `/v1/subscriptions/${a.subscription_id}/cancel`,
                  body,
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
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
        const s = new Server({ name: "mcp-izipay", version: "0.2.0-alpha.2" }, { capabilities: { tools: {} } });
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
