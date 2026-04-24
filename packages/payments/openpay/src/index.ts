#!/usr/bin/env node

/**
 * MCP Server for Openpay — BBVA-owned Mexican payment gateway.
 *
 * Openpay is the MX gateway owned by BBVA and the main competitor to Conekta
 * for Mexican online merchants. Together with Conekta, Openpay closes the
 * "big two" MX gateway quadrant (Conekta + BBVA rails). Differentiators vs
 * Conekta in this catalog: native subscriptions (plans + per-customer
 * subscriptions) and marketplace payouts.
 *
 * Tools (23):
 *   create_charge        — charge a buyer (card, bank_account/SPEI, store/OXXO)
 *   get_charge           — retrieve a charge
 *   capture_charge       — capture a previously authorized charge (delayed capture)
 *   refund_charge        — refund a captured charge (full or partial)
 *   create_customer      — create a customer record (optional wallet account)
 *   get_customer         — retrieve a customer
 *   update_customer      — update a stored customer
 *   delete_customer      — delete a customer
 *   list_customers       — list customers with optional filters
 *   create_card          — tokenize a card at merchant or customer level
 *   get_card             — retrieve a tokenized card
 *   list_cards           — list tokenized cards (merchant or per-customer)
 *   delete_card          — delete a tokenized card
 *   create_bank_account  — store a customer bank account (CLABE)
 *   delete_bank_account  — delete a stored customer bank account
 *   create_plan          — create a subscription plan (recurring schedule)
 *   create_subscription  — subscribe a customer to a plan using a stored card
 *   cancel_subscription  — cancel a customer's subscription
 *   create_payout        — pay out MXN to a bank account (marketplace / seller)
 *   list_payouts         — list payouts (merchant or per-customer)
 *   create_webhook       — register a webhook endpoint for event callbacks
 *   list_webhooks        — list configured webhooks
 *   delete_webhook       — delete a webhook subscription
 *
 * Authentication
 *   HTTP Basic. Username = OPENPAY_PRIVATE_KEY, password = empty string.
 *     Authorization: Basic base64(PRIVATE_KEY + ":")
 *   Content-Type: application/json
 *
 * Environment
 *   OPENPAY_MERCHANT_ID  merchant id (forms part of the URL path)
 *   OPENPAY_PRIVATE_KEY  private API key, secret
 *   OPENPAY_ENV          'sandbox' (default) | 'production'
 *
 * Base URL
 *   sandbox     https://sandbox-api.openpay.mx/v1/{merchant_id}
 *   production  https://api.openpay.mx/v1/{merchant_id}
 *
 * Docs: https://documents.openpay.mx/en/api
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const MERCHANT_ID = process.env.OPENPAY_MERCHANT_ID || "";
const PRIVATE_KEY = process.env.OPENPAY_PRIVATE_KEY || "";
const ENV = (process.env.OPENPAY_ENV || "sandbox").toLowerCase();

const HOST =
  ENV === "production"
    ? "https://api.openpay.mx"
    : "https://sandbox-api.openpay.mx";
const BASE_URL = `${HOST}/v1/${MERCHANT_ID}`;

async function openpayRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const basic = Buffer.from(`${PRIVATE_KEY}:`).toString("base64");
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${basic}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Openpay API ${res.status}: ${await res.text()}`);
  }
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const server = new Server(
  { name: "mcp-openpay", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_charge",
      description: "Create a charge. Pass customer_id to charge at a customer scope (POST /customers/{customer_id}/charges); omit to charge at merchant scope (POST /charges). Methods: 'card' (requires source_id token), 'bank_account' (SPEI — returns CLABE reference), 'store' (OXXO — returns barcode/reference). Amounts are in major units (e.g. 100 = 100 MXN).",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Optional. Openpay customer id to scope the charge to a stored customer." },
          method: { type: "string", enum: ["card", "bank_account", "store"], description: "Payment method: card, bank_account (SPEI), or store (OXXO)." },
          source_id: { type: "string", description: "Card or token id when method='card'. Required for card charges unless 'card' inline object is provided." },
          card: {
            type: "object",
            description: "Inline card object for method='card' when not using source_id. Alternatively pass source_id from a tokenized card.",
          },
          amount: { type: "number", description: "Amount in major units (MXN)." },
          currency: { type: "string", description: "ISO-4217 currency code. Defaults to MXN." },
          description: { type: "string", description: "Charge description shown on receipts." },
          order_id: { type: "string", description: "Merchant-side unique order reference." },
          device_session_id: { type: "string", description: "Device session id from Openpay antifraud JS (required for card charges in production)." },
          capture: { type: "boolean", description: "If false, only authorizes — use capture_charge later. Defaults to true." },
          customer: {
            type: "object",
            description: "Customer identity for one-off (merchant-scope) charges. Not required when customer_id is set.",
            properties: {
              name: { type: "string" },
              last_name: { type: "string" },
              email: { type: "string" },
              phone_number: { type: "string" },
              requires_account: { type: "boolean", description: "If true, Openpay creates a wallet account for the customer." },
            },
          },
          redirect_url: { type: "string", description: "For 3DS / redirect flows, where to return the buyer after auth." },
          use_3d_secure: { type: "boolean", description: "Force 3DS for card charges." },
          send_email: { type: "boolean", description: "For store (OXXO) charges, email the voucher to the customer." },
          due_date: { type: "string", description: "For store (OXXO) / bank_account (SPEI) charges, ISO-8601 expiration." },
        },
        required: ["method", "amount"],
      },
    },
    {
      name: "get_charge",
      description: "Retrieve a charge. Pass customer_id to fetch at customer scope (GET /customers/{customer_id}/charges/{id}); omit for merchant scope (GET /charges/{id}).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Openpay charge id (transaction id)." },
          customer_id: { type: "string", description: "Optional. Scope the fetch to this customer." },
        },
        required: ["id"],
      },
    },
    {
      name: "capture_charge",
      description: "Capture a previously authorized charge (when the original charge used capture=false). Pass amount to capture less than the authorized total; omit to capture the full authorized amount.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Openpay charge id to capture." },
          customer_id: { type: "string", description: "Optional. Customer scope if the charge was customer-scoped." },
          amount: { type: "number", description: "Amount to capture in major units. Omit for full capture." },
        },
        required: ["id"],
      },
    },
    {
      name: "refund_charge",
      description: "Refund a captured charge. Supports partial refunds via amount; omit amount for a full refund.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Openpay charge id to refund." },
          customer_id: { type: "string", description: "Optional. Customer scope if the charge was customer-scoped." },
          description: { type: "string", description: "Reason or reference for the refund." },
          amount: { type: "number", description: "Partial refund amount in major units. Omit for a full refund." },
        },
        required: ["id"],
      },
    },
    {
      name: "create_customer",
      description: "Create a customer record. Set requires_account=true to create an associated Openpay wallet for the customer; false for a payment-only record.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer first name." },
          last_name: { type: "string", description: "Customer last name." },
          email: { type: "string", description: "Customer email (required)." },
          requires_account: { type: "boolean", description: "true = create wallet account; false = payment-only record." },
          phone_number: { type: "string", description: "Customer phone number." },
          external_id: { type: "string", description: "Merchant-side stable customer id." },
          address: {
            type: "object",
            description: "Customer billing address.",
            properties: {
              line1: { type: "string" },
              line2: { type: "string" },
              line3: { type: "string" },
              postal_code: { type: "string" },
              state: { type: "string" },
              city: { type: "string" },
              country_code: { type: "string", description: "ISO-3166 alpha-2 (e.g. MX)." },
            },
          },
        },
        required: ["name", "email"],
      },
    },
    {
      name: "get_customer",
      description: "Retrieve a customer by Openpay customer id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Openpay customer id." },
        },
        required: ["id"],
      },
    },
    {
      name: "list_customers",
      description: "List customers with optional filters. All parameters are passed as query params.",
      inputSchema: {
        type: "object",
        properties: {
          creation: { type: "string", description: "Filter by creation date (YYYY-MM-DD)." },
          "creation[gte]": { type: "string", description: "Created on or after (YYYY-MM-DD)." },
          "creation[lte]": { type: "string", description: "Created on or before (YYYY-MM-DD)." },
          offset: { type: "number", description: "Pagination offset." },
          limit: { type: "number", description: "Page size (max 100)." },
          external_id: { type: "string", description: "Filter by merchant-side external_id." },
        },
      },
    },
    {
      name: "create_card",
      description: "Tokenize a card. Pass customer_id to attach to a stored customer (POST /customers/{customer_id}/cards); omit for a merchant-level token (POST /cards). Prefer tokenizing client-side with Openpay.js to avoid PCI scope.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Optional. Attach the card to this customer." },
          token_id: { type: "string", description: "Token id from client-side Openpay.js tokenization (preferred, keeps you out of PCI scope)." },
          device_session_id: { type: "string", description: "Device session id from Openpay antifraud JS." },
          card_number: { type: "string", description: "PAN. Only use server-side if you are PCI-compliant; prefer token_id." },
          holder_name: { type: "string", description: "Cardholder name as printed on the card." },
          expiration_year: { type: "string", description: "2-digit year (e.g. '27')." },
          expiration_month: { type: "string", description: "2-digit month (e.g. '04')." },
          cvv2: { type: "string", description: "CVV. Only server-side if PCI-compliant." },
          address: {
            type: "object",
            description: "Billing address for the card.",
            properties: {
              line1: { type: "string" },
              line2: { type: "string" },
              line3: { type: "string" },
              postal_code: { type: "string" },
              state: { type: "string" },
              city: { type: "string" },
              country_code: { type: "string" },
            },
          },
        },
      },
    },
    {
      name: "delete_card",
      description: "Delete a tokenized card. Pass customer_id to delete at customer scope (DELETE /customers/{customer_id}/cards/{id}); omit for merchant scope (DELETE /cards/{id}).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Openpay card id." },
          customer_id: { type: "string", description: "Optional. Customer scope if the card was customer-scoped." },
        },
        required: ["id"],
      },
    },
    {
      name: "create_plan",
      description: "Create a subscription plan. Plans are templates — use create_subscription to subscribe a customer.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Plan name shown to customers." },
          amount: { type: "number", description: "Recurring charge amount in major units (MXN)." },
          currency: { type: "string", description: "ISO-4217 currency code. Defaults to MXN." },
          repeat_every: { type: "number", description: "Interval count (e.g. 1 = every 1 unit)." },
          repeat_unit: { type: "string", enum: ["week", "month", "year"], description: "Interval unit." },
          retry_times: { type: "number", description: "How many times to retry a failed recurring charge." },
          status_after_retry: { type: "string", enum: ["unpaid", "cancelled"], description: "Subscription status after retries are exhausted." },
          trial_days: { type: "number", description: "Free trial length in days." },
        },
        required: ["name", "amount", "repeat_every", "repeat_unit", "retry_times", "status_after_retry"],
      },
    },
    {
      name: "create_subscription",
      description: "Subscribe a customer to a plan. Requires a stored card (source_id) to charge on each cycle.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Openpay customer id." },
          plan_id: { type: "string", description: "Openpay plan id from create_plan." },
          source_id: { type: "string", description: "Openpay card id to charge on each recurring cycle." },
          trial_end_date: { type: "string", description: "ISO-8601 date. Overrides plan.trial_days for this subscription." },
          device_session_id: { type: "string", description: "Device session id from Openpay antifraud JS." },
        },
        required: ["customer_id", "plan_id", "source_id"],
      },
    },
    {
      name: "create_payout",
      description: "Pay out MXN to a bank account. Used for marketplace seller payouts and cross-border settlement. Scope to a customer with customer_id (POST /customers/{customer_id}/payouts) or run at merchant scope (POST /payouts).",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Optional. Payout from a customer wallet (requires customer to have requires_account=true)." },
          method: { type: "string", enum: ["bank_account"], description: "Payout method. Currently bank_account (SPEI) only." },
          destination_id: { type: "string", description: "Stored bank account id (alternative to passing bank_account inline)." },
          bank_account: {
            type: "object",
            description: "Inline destination bank account. Use this or destination_id.",
            properties: {
              clabe: { type: "string", description: "CLABE (18-digit Mexican bank account)." },
              holder_name: { type: "string", description: "Account holder name." },
              bank_code: { type: "string", description: "Bank code (usually derived from CLABE automatically)." },
            },
          },
          amount: { type: "number", description: "Payout amount in major units (MXN)." },
          description: { type: "string", description: "Payout description." },
          order_id: { type: "string", description: "Merchant-side payout reference." },
        },
        required: ["method", "amount"],
      },
    },
    {
      name: "update_customer",
      description: "Update a stored customer (PUT /customers/{id}). Only the fields provided are updated; omit fields you don't want to change.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Openpay customer id." },
          name: { type: "string" },
          last_name: { type: "string" },
          email: { type: "string" },
          phone_number: { type: "string" },
          external_id: { type: "string" },
          address: {
            type: "object",
            properties: {
              line1: { type: "string" },
              line2: { type: "string" },
              line3: { type: "string" },
              postal_code: { type: "string" },
              state: { type: "string" },
              city: { type: "string" },
              country_code: { type: "string" },
            },
          },
        },
        required: ["id"],
      },
    },
    {
      name: "delete_customer",
      description: "Delete a customer (DELETE /customers/{id}). Irreversible — removes the customer and associated stored tokens.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Openpay customer id to delete." },
        },
        required: ["id"],
      },
    },
    {
      name: "get_card",
      description: "Retrieve a tokenized card. Pass customer_id to fetch at customer scope (GET /customers/{customer_id}/cards/{id}); omit for merchant scope (GET /cards/{id}).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Openpay card id." },
          customer_id: { type: "string", description: "Optional. Customer scope if the card was customer-scoped." },
        },
        required: ["id"],
      },
    },
    {
      name: "list_cards",
      description: "List tokenized cards. Pass customer_id to list per-customer (GET /customers/{customer_id}/cards); omit for merchant-level cards (GET /cards).",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Optional. Scope to this customer." },
          creation: { type: "string", description: "Filter by creation date (YYYY-MM-DD)." },
          "creation[gte]": { type: "string", description: "Created on or after (YYYY-MM-DD)." },
          "creation[lte]": { type: "string", description: "Created on or before (YYYY-MM-DD)." },
          offset: { type: "number", description: "Pagination offset." },
          limit: { type: "number", description: "Page size (max 100)." },
        },
      },
    },
    {
      name: "create_bank_account",
      description: "Store a customer bank account (POST /customers/{customer_id}/bankaccounts). Required before you can run destination_id-based payouts to that customer's account.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Openpay customer id." },
          clabe: { type: "string", description: "CLABE (18-digit Mexican bank account)." },
          alias: { type: "string", description: "Friendly alias for the account." },
          holder_name: { type: "string", description: "Account holder name." },
        },
        required: ["customer_id", "clabe", "holder_name"],
      },
    },
    {
      name: "delete_bank_account",
      description: "Delete a stored customer bank account (DELETE /customers/{customer_id}/bankaccounts/{id}).",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Openpay customer id." },
          id: { type: "string", description: "Openpay bank account id." },
        },
        required: ["customer_id", "id"],
      },
    },
    {
      name: "cancel_subscription",
      description: "Cancel a customer's subscription (DELETE /customers/{customer_id}/subscriptions/{id}). Cancellation takes effect at the end of the current paid period.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Openpay customer id." },
          id: { type: "string", description: "Openpay subscription id." },
        },
        required: ["customer_id", "id"],
      },
    },
    {
      name: "list_payouts",
      description: "List payouts. Pass customer_id to scope to a customer (GET /customers/{customer_id}/payouts); omit for merchant-scope payouts (GET /payouts).",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Optional. Scope to this customer." },
          creation: { type: "string", description: "Filter by creation date (YYYY-MM-DD)." },
          "creation[gte]": { type: "string", description: "Created on or after (YYYY-MM-DD)." },
          "creation[lte]": { type: "string", description: "Created on or before (YYYY-MM-DD)." },
          offset: { type: "number", description: "Pagination offset." },
          limit: { type: "number", description: "Page size (max 100)." },
        },
      },
    },
    {
      name: "create_webhook",
      description: "Register a webhook endpoint (POST /webhooks). Openpay posts event notifications to url and can optionally send HTTP Basic credentials.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "HTTPS endpoint that receives event POSTs." },
          user: { type: "string", description: "Optional HTTP Basic username Openpay should send with each notification." },
          password: { type: "string", description: "Optional HTTP Basic password Openpay should send with each notification." },
          event_types: {
            type: "array",
            items: { type: "string" },
            description: "Event subscriptions, e.g. ['charge.succeeded','charge.failed','subscription.charge.failed','payout.created','chargeback.created'].",
          },
        },
        required: ["url", "event_types"],
      },
    },
    {
      name: "list_webhooks",
      description: "List configured webhook subscriptions (GET /webhooks).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "delete_webhook",
      description: "Delete a webhook subscription (DELETE /webhooks/{id}).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Openpay webhook id." },
        },
        required: ["id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "create_charge": {
        const { customer_id, ...rest } = a;
        const path = customer_id ? `/customers/${customer_id}/charges` : `/charges`;
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("POST", path, rest), null, 2) }] };
      }
      case "get_charge": {
        const id = String(a.id ?? "");
        const path = a.customer_id ? `/customers/${a.customer_id}/charges/${id}` : `/charges/${id}`;
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("GET", path), null, 2) }] };
      }
      case "capture_charge": {
        const id = String(a.id ?? "");
        const path = a.customer_id ? `/customers/${a.customer_id}/charges/${id}/capture` : `/charges/${id}/capture`;
        const body: Record<string, unknown> = {};
        if (a.amount !== undefined) body.amount = a.amount;
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("POST", path, body), null, 2) }] };
      }
      case "refund_charge": {
        const id = String(a.id ?? "");
        const path = a.customer_id ? `/customers/${a.customer_id}/charges/${id}/refund` : `/charges/${id}/refund`;
        const body: Record<string, unknown> = {};
        if (a.description !== undefined) body.description = a.description;
        if (a.amount !== undefined) body.amount = a.amount;
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("POST", path, body), null, 2) }] };
      }
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("POST", "/customers", a), null, 2) }] };
      case "get_customer": {
        const id = String(a.id ?? "");
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("GET", `/customers/${id}`), null, 2) }] };
      }
      case "list_customers": {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(a)) {
          if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
        }
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("GET", `/customers${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "create_card": {
        const { customer_id, ...rest } = a;
        const path = customer_id ? `/customers/${customer_id}/cards` : `/cards`;
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("POST", path, rest), null, 2) }] };
      }
      case "delete_card": {
        const id = String(a.id ?? "");
        const path = a.customer_id ? `/customers/${a.customer_id}/cards/${id}` : `/cards/${id}`;
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("DELETE", path), null, 2) }] };
      }
      case "create_plan":
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("POST", "/plans", a), null, 2) }] };
      case "create_subscription": {
        const { customer_id, ...rest } = a;
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("POST", `/customers/${customer_id}/subscriptions`, rest), null, 2) }] };
      }
      case "create_payout": {
        const { customer_id, ...rest } = a;
        const path = customer_id ? `/customers/${customer_id}/payouts` : `/payouts`;
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("POST", path, rest), null, 2) }] };
      }
      case "update_customer": {
        const { id, ...rest } = a;
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("PUT", `/customers/${String(id ?? "")}`, rest), null, 2) }] };
      }
      case "delete_customer": {
        const id = String(a.id ?? "");
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("DELETE", `/customers/${id}`), null, 2) }] };
      }
      case "get_card": {
        const id = String(a.id ?? "");
        const path = a.customer_id ? `/customers/${a.customer_id}/cards/${id}` : `/cards/${id}`;
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("GET", path), null, 2) }] };
      }
      case "list_cards": {
        const { customer_id, ...rest } = a;
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
        }
        const qs = params.toString();
        const base = customer_id ? `/customers/${customer_id}/cards` : `/cards`;
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("GET", `${base}${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "create_bank_account": {
        const { customer_id, ...rest } = a;
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("POST", `/customers/${customer_id}/bankaccounts`, rest), null, 2) }] };
      }
      case "delete_bank_account": {
        const id = String(a.id ?? "");
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("DELETE", `/customers/${a.customer_id}/bankaccounts/${id}`), null, 2) }] };
      }
      case "cancel_subscription": {
        const id = String(a.id ?? "");
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("DELETE", `/customers/${a.customer_id}/subscriptions/${id}`), null, 2) }] };
      }
      case "list_payouts": {
        const { customer_id, ...rest } = a;
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(rest)) {
          if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
        }
        const qs = params.toString();
        const base = customer_id ? `/customers/${customer_id}/payouts` : `/payouts`;
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("GET", `${base}${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "create_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("POST", "/webhooks", a), null, 2) }] };
      case "list_webhooks":
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("GET", "/webhooks"), null, 2) }] };
      case "delete_webhook": {
        const id = String(a.id ?? "");
        return { content: [{ type: "text", text: JSON.stringify(await openpayRequest("DELETE", `/webhooks/${id}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-openpay", version: "0.2.0" }, { capabilities: { tools: {} } });
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
