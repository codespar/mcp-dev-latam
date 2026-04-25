#!/usr/bin/env node

/**
 * MCP Server for PayPal — global payments and payouts via the PayPal REST API.
 *
 * Target customer: LatAm SaaS / marketplaces selling globally that already
 * hold a PayPal merchant account and want agent-driven checkout, payouts,
 * subscriptions, and dispute handling.
 *
 * Tools (19):
 *   create_order              — POST /v2/checkout/orders
 *   get_order                 — GET  /v2/checkout/orders/{id}
 *   capture_order             — POST /v2/checkout/orders/{id}/capture
 *   authorize_order           — POST /v2/checkout/orders/{id}/authorize
 *   capture_authorization     — POST /v2/payments/authorizations/{id}/capture
 *   refund_capture            — POST /v2/payments/captures/{id}/refund
 *   void_authorization        — POST /v2/payments/authorizations/{id}/void
 *   get_payment_details       — GET  /v2/payments/{type}/{id}  (authorizations|captures|refunds)
 *   create_batch_payout       — POST /v1/payments/payouts
 *   get_payout                — GET  /v1/payments/payouts/{batch_id}
 *   get_payout_item           — GET  /v1/payments/payouts-item/{item_id}
 *   create_subscription       — POST /v1/billing/subscriptions
 *   get_subscription          — GET  /v1/billing/subscriptions/{id}
 *   cancel_subscription       — POST /v1/billing/subscriptions/{id}/cancel
 *   list_disputes             — GET  /v1/customer/disputes
 *   get_dispute               — GET  /v1/customer/disputes/{id}
 *   accept_dispute_claim      — POST /v1/customer/disputes/{id}/accept-claim
 *   list_webhooks             — GET  /v1/notifications/webhooks
 *   verify_webhook_signature  — POST /v1/notifications/verify-webhook-signature
 *
 * Authentication
 *   OAuth2 client_credentials. The server posts CLIENT_ID:CLIENT_SECRET (HTTP
 *   Basic) to /v1/oauth2/token with grant_type=client_credentials and caches
 *   the bearer token until 60s before expiry.
 *
 * Environment
 *   PAYPAL_CLIENT_ID       REST app client id
 *   PAYPAL_CLIENT_SECRET   REST app client secret (OAuth2)
 *   PAYPAL_ENV             'sandbox' (default) or 'live'
 *
 * Docs: https://developer.paypal.com/api/rest
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "";
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "";
const ENV = (process.env.PAYPAL_ENV || "sandbox").toLowerCase();
const BASE_URL =
  ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.value;
  }
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`PayPal OAuth2 ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

async function paypalRequest(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options: {
    body?: unknown;
    query?: Record<string, string | number | undefined>;
    requestId?: string;
  } = {},
): Promise<unknown> {
  const token = await getAccessToken();
  const url = new URL(`${BASE_URL}${path}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/json",
  };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.requestId) headers["PayPal-Request-Id"] = options.requestId;
  const res = await fetch(url.toString(), {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PayPal API ${res.status} ${method} ${path}: ${text}`);
  }
  // Some endpoints (void, cancel) return 204 No Content.
  if (!text) return { status: res.status };
  try {
    return JSON.parse(text);
  } catch {
    return { status: res.status, body: text };
  }
}

const server = new Server(
  { name: "mcp-paypal", version: "0.1.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_order",
      description:
        "Create a PayPal Order via POST /v2/checkout/orders. Pass intent ('CAPTURE' or 'AUTHORIZE') and purchase_units (each with an amount object). Returns the order with id, status, and HATEOAS links (including the approve URL for the buyer).",
      inputSchema: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            enum: ["CAPTURE", "AUTHORIZE"],
            description: "Capture immediately on buyer approval, or authorize for later capture.",
          },
          purchase_units: {
            type: "array",
            description:
              "Array of purchase_unit objects. Each must include amount: { currency_code, value }. Optional: reference_id, description, items, shipping, payee.",
            items: { type: "object" },
          },
          payment_source: {
            type: "object",
            description:
              "Optional payment_source object (e.g. { paypal: { experience_context: { return_url, cancel_url } } } or { card: { ... } }).",
          },
          body: {
            type: "object",
            description:
              "Additional Order create body fields merged into the request (application_context, etc).",
          },
          paypalRequestId: {
            type: "string",
            description: "Optional PayPal-Request-Id header for idempotency.",
          },
        },
        required: ["intent", "purchase_units"],
      },
    },
    {
      name: "get_order",
      description:
        "Fetch a PayPal Order by id via GET /v2/checkout/orders/{id}. Returns the full order including status, purchase_units, and payments collection.",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "PayPal order id." },
        },
        required: ["orderId"],
      },
    },
    {
      name: "capture_order",
      description:
        "Capture payment for an approved order via POST /v2/checkout/orders/{id}/capture. Use after the buyer approves an order with intent=CAPTURE. Returns the captured payment details.",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "PayPal order id (intent=CAPTURE, status=APPROVED)." },
          payment_source: {
            type: "object",
            description:
              "Optional payment_source override (rarely needed — usually set at create_order time).",
          },
          body: {
            type: "object",
            description: "Additional capture body fields merged into the request.",
          },
          paypalRequestId: {
            type: "string",
            description: "Optional PayPal-Request-Id header for idempotency.",
          },
        },
        required: ["orderId"],
      },
    },
    {
      name: "authorize_order",
      description:
        "Authorize payment for an approved order via POST /v2/checkout/orders/{id}/authorize. Use after the buyer approves an order with intent=AUTHORIZE. Returns the created authorization (capture later with capture_authorization).",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "PayPal order id (intent=AUTHORIZE, status=APPROVED)." },
          payment_source: {
            type: "object",
            description: "Optional payment_source override.",
          },
          body: {
            type: "object",
            description: "Additional authorize body fields merged into the request.",
          },
          paypalRequestId: {
            type: "string",
            description: "Optional PayPal-Request-Id header for idempotency.",
          },
        },
        required: ["orderId"],
      },
    },
    {
      name: "capture_authorization",
      description:
        "Capture a previously authorized payment via POST /v2/payments/authorizations/{id}/capture. Pass an amount object for partial captures, or omit to capture the full authorized amount. Set final_capture=true on the last partial capture.",
      inputSchema: {
        type: "object",
        properties: {
          authorizationId: {
            type: "string",
            description: "PayPal authorization id (from a prior authorize_order).",
          },
          amount: {
            type: "object",
            description: "Optional amount object { currency_code, value } for partial capture. Omit for full.",
          },
          final_capture: {
            type: "boolean",
            description: "Set true on the final partial capture to release any remaining authorized funds.",
          },
          invoice_id: {
            type: "string",
            description: "Merchant-side invoice id recorded with the capture.",
          },
          note_to_payer: {
            type: "string",
            description: "Optional note shown to the payer in the PayPal account history.",
          },
          body: {
            type: "object",
            description: "Additional capture body fields merged into the request.",
          },
          paypalRequestId: {
            type: "string",
            description: "Optional PayPal-Request-Id header for idempotency.",
          },
        },
        required: ["authorizationId"],
      },
    },
    {
      name: "refund_capture",
      description:
        "Refund a captured payment via POST /v2/payments/captures/{id}/refund. Pass an amount object for partial refunds, or omit for a full refund. Idempotent via PayPal-Request-Id.",
      inputSchema: {
        type: "object",
        properties: {
          captureId: {
            type: "string",
            description: "PayPal capture id (from a captured order or capture_authorization).",
          },
          amount: {
            type: "object",
            description: "Optional amount { currency_code, value } for partial refund. Omit for full.",
          },
          invoice_id: { type: "string", description: "Merchant-side invoice id recorded with the refund." },
          note_to_payer: { type: "string", description: "Optional note shown to the payer." },
          body: {
            type: "object",
            description: "Additional refund body fields merged into the request.",
          },
          paypalRequestId: {
            type: "string",
            description: "Optional PayPal-Request-Id header for idempotency.",
          },
        },
        required: ["captureId"],
      },
    },
    {
      name: "void_authorization",
      description:
        "Void (release) an unsettled authorization via POST /v2/payments/authorizations/{id}/void. Use when funds were authorized but will not be captured. Returns 204 No Content on success.",
      inputSchema: {
        type: "object",
        properties: {
          authorizationId: { type: "string", description: "PayPal authorization id to void." },
        },
        required: ["authorizationId"],
      },
    },
    {
      name: "get_payment_details",
      description:
        "Fetch a payment object by id via GET /v2/payments/{type}/{id}. type is one of 'authorizations', 'captures', or 'refunds'. Returns the full payment object with status and links.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["authorizations", "captures", "refunds"],
            description: "Payment type.",
          },
          id: { type: "string", description: "Payment id (authorization, capture, or refund id)." },
        },
        required: ["type", "id"],
      },
    },
    {
      name: "create_batch_payout",
      description:
        "Create a batch payout via POST /v1/payments/payouts. sender_batch_header carries metadata; items is an array of payout_item objects each with recipient_type, amount { currency, value }, receiver, and note. Async — poll get_payout to track status.",
      inputSchema: {
        type: "object",
        properties: {
          sender_batch_header: {
            type: "object",
            description:
              "Batch metadata: { sender_batch_id, email_subject, email_message, recipient_type }.",
          },
          items: {
            type: "array",
            description:
              "Array of payout items. Each: { recipient_type, amount: { value, currency }, receiver, note, sender_item_id }.",
            items: { type: "object" },
          },
          body: {
            type: "object",
            description: "Additional payout body fields merged into the request.",
          },
          paypalRequestId: {
            type: "string",
            description: "Optional PayPal-Request-Id header for idempotency.",
          },
        },
        required: ["sender_batch_header", "items"],
      },
    },
    {
      name: "get_payout",
      description:
        "Fetch a payout batch by id via GET /v1/payments/payouts/{batch_id}. Returns batch_header (status, time_created, etc.) and items array with per-item status.",
      inputSchema: {
        type: "object",
        properties: {
          payoutBatchId: { type: "string", description: "Payout batch id." },
        },
        required: ["payoutBatchId"],
      },
    },
    {
      name: "get_payout_item",
      description:
        "Fetch a single payout item by id via GET /v1/payments/payouts-item/{item_id}. Use to inspect the status of one recipient inside a batch (UNCLAIMED, SUCCESS, FAILED, etc).",
      inputSchema: {
        type: "object",
        properties: {
          payoutItemId: { type: "string", description: "Payout item id." },
        },
        required: ["payoutItemId"],
      },
    },
    {
      name: "create_subscription",
      description:
        "Create a billing subscription via POST /v1/billing/subscriptions. plan_id is the id of a previously created billing plan. Returns the subscription with status (APPROVAL_PENDING) and HATEOAS approve link for the buyer.",
      inputSchema: {
        type: "object",
        properties: {
          plan_id: { type: "string", description: "PayPal billing plan id." },
          subscriber: {
            type: "object",
            description: "Optional subscriber object (name, email_address, shipping_address).",
          },
          application_context: {
            type: "object",
            description:
              "Optional application_context (brand_name, locale, return_url, cancel_url, user_action).",
          },
          start_time: { type: "string", description: "ISO 8601 start time. Defaults to immediate." },
          quantity: { type: "string", description: "Quantity of the product in the subscription." },
          custom_id: { type: "string", description: "Merchant-side subscription identifier." },
          body: {
            type: "object",
            description: "Additional subscription body fields merged into the request.",
          },
          paypalRequestId: {
            type: "string",
            description: "Optional PayPal-Request-Id header for idempotency.",
          },
        },
        required: ["plan_id"],
      },
    },
    {
      name: "get_subscription",
      description:
        "Fetch a subscription by id via GET /v1/billing/subscriptions/{id}. Returns id, status, plan_id, subscriber, billing_info, and links.",
      inputSchema: {
        type: "object",
        properties: {
          subscriptionId: { type: "string", description: "PayPal subscription id." },
        },
        required: ["subscriptionId"],
      },
    },
    {
      name: "cancel_subscription",
      description:
        "Cancel an active subscription via POST /v1/billing/subscriptions/{id}/cancel. Pass a reason string. Returns 204 No Content on success.",
      inputSchema: {
        type: "object",
        properties: {
          subscriptionId: { type: "string", description: "PayPal subscription id to cancel." },
          reason: {
            type: "string",
            description: "Cancellation reason recorded on the subscription.",
          },
        },
        required: ["subscriptionId", "reason"],
      },
    },
    {
      name: "list_disputes",
      description:
        "List disputes via GET /v1/customer/disputes. Filter by disputed_transaction_id, dispute_state, update_time_before / update_time_after. Pagination via page_size and next_page_token.",
      inputSchema: {
        type: "object",
        properties: {
          disputed_transaction_id: { type: "string", description: "Filter by disputed transaction id." },
          dispute_state: {
            type: "string",
            description:
              "Comma-separated dispute states (REQUIRED_ACTION, UNDER_REVIEW, RESOLVED, etc).",
          },
          page_size: { type: "number", description: "Page size (default 10, max 50)." },
          next_page_token: { type: "string", description: "Pagination token from a prior response." },
          update_time_before: { type: "string", description: "ISO 8601 upper bound on update_time." },
          update_time_after: { type: "string", description: "ISO 8601 lower bound on update_time." },
        },
      },
    },
    {
      name: "get_dispute",
      description:
        "Fetch a dispute by id via GET /v1/customer/disputes/{id}. Returns full dispute details including reason, status, life_cycle_stage, disputed_transactions, and messages.",
      inputSchema: {
        type: "object",
        properties: {
          disputeId: { type: "string", description: "PayPal dispute id." },
        },
        required: ["disputeId"],
      },
    },
    {
      name: "accept_dispute_claim",
      description:
        "Accept liability for a dispute claim via POST /v1/customer/disputes/{id}/accept-claim. The disputed amount is refunded to the buyer. Terminal action.",
      inputSchema: {
        type: "object",
        properties: {
          disputeId: { type: "string", description: "PayPal dispute id." },
          note: {
            type: "string",
            description: "Required note explaining the merchant's reason for accepting.",
          },
          accept_claim_reason: {
            type: "string",
            description:
              "Optional reason code (DID_NOT_SHIP_ITEM, TOO_TIME_CONSUMING, LOST_IN_MAIL, etc).",
          },
          body: {
            type: "object",
            description: "Additional accept-claim body fields merged into the request.",
          },
        },
        required: ["disputeId", "note"],
      },
    },
    {
      name: "list_webhooks",
      description:
        "List configured webhooks for the app via GET /v1/notifications/webhooks. Returns each webhook with id, url, and event_types.",
      inputSchema: {
        type: "object",
        properties: {
          anchor_type: {
            type: "string",
            description: "Optional anchor type filter (APPLICATION or ACCOUNT). Defaults to APPLICATION.",
          },
        },
      },
    },
    {
      name: "verify_webhook_signature",
      description:
        "Verify a webhook event signature via POST /v1/notifications/verify-webhook-signature. Pass the headers and body received on your webhook endpoint. Returns verification_status SUCCESS or FAILURE.",
      inputSchema: {
        type: "object",
        properties: {
          auth_algo: { type: "string", description: "PayPal-Auth-Algo header from the webhook request." },
          cert_url: { type: "string", description: "PayPal-Cert-Url header from the webhook request." },
          transmission_id: { type: "string", description: "PayPal-Transmission-Id header." },
          transmission_sig: { type: "string", description: "PayPal-Transmission-Sig header." },
          transmission_time: { type: "string", description: "PayPal-Transmission-Time header." },
          webhook_id: { type: "string", description: "Configured webhook id receiving the event." },
          webhook_event: {
            type: "object",
            description: "The full webhook event JSON body as received.",
          },
        },
        required: [
          "auth_algo",
          "cert_url",
          "transmission_id",
          "transmission_sig",
          "transmission_time",
          "webhook_id",
          "webhook_event",
        ],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "create_order": {
        const body = {
          ...((a.body as Record<string, unknown>) ?? {}),
          intent: a.intent,
          purchase_units: a.purchase_units,
          ...(a.payment_source !== undefined ? { payment_source: a.payment_source } : {}),
        };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest("POST", "/v2/checkout/orders", {
                  body,
                  requestId: a.paypalRequestId as string | undefined,
                }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "get_order": {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest("GET", `/v2/checkout/orders/${a.orderId}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "capture_order": {
        const body = {
          ...((a.body as Record<string, unknown>) ?? {}),
          ...(a.payment_source !== undefined ? { payment_source: a.payment_source } : {}),
        };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest(
                  "POST",
                  `/v2/checkout/orders/${a.orderId}/capture`,
                  {
                    body: Object.keys(body).length > 0 ? body : {},
                    requestId: a.paypalRequestId as string | undefined,
                  },
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "authorize_order": {
        const body = {
          ...((a.body as Record<string, unknown>) ?? {}),
          ...(a.payment_source !== undefined ? { payment_source: a.payment_source } : {}),
        };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest(
                  "POST",
                  `/v2/checkout/orders/${a.orderId}/authorize`,
                  {
                    body: Object.keys(body).length > 0 ? body : {},
                    requestId: a.paypalRequestId as string | undefined,
                  },
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "capture_authorization": {
        const body = {
          ...((a.body as Record<string, unknown>) ?? {}),
          ...(a.amount !== undefined ? { amount: a.amount } : {}),
          ...(a.final_capture !== undefined ? { final_capture: a.final_capture } : {}),
          ...(a.invoice_id !== undefined ? { invoice_id: a.invoice_id } : {}),
          ...(a.note_to_payer !== undefined ? { note_to_payer: a.note_to_payer } : {}),
        };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest(
                  "POST",
                  `/v2/payments/authorizations/${a.authorizationId}/capture`,
                  {
                    body,
                    requestId: a.paypalRequestId as string | undefined,
                  },
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "refund_capture": {
        const body = {
          ...((a.body as Record<string, unknown>) ?? {}),
          ...(a.amount !== undefined ? { amount: a.amount } : {}),
          ...(a.invoice_id !== undefined ? { invoice_id: a.invoice_id } : {}),
          ...(a.note_to_payer !== undefined ? { note_to_payer: a.note_to_payer } : {}),
        };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest(
                  "POST",
                  `/v2/payments/captures/${a.captureId}/refund`,
                  {
                    body,
                    requestId: a.paypalRequestId as string | undefined,
                  },
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "void_authorization": {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest(
                  "POST",
                  `/v2/payments/authorizations/${a.authorizationId}/void`,
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "get_payment_details": {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest("GET", `/v2/payments/${a.type}/${a.id}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "create_batch_payout": {
        const body = {
          ...((a.body as Record<string, unknown>) ?? {}),
          sender_batch_header: a.sender_batch_header,
          items: a.items,
        };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest("POST", "/v1/payments/payouts", {
                  body,
                  requestId: a.paypalRequestId as string | undefined,
                }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "get_payout": {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest("GET", `/v1/payments/payouts/${a.payoutBatchId}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "get_payout_item": {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest(
                  "GET",
                  `/v1/payments/payouts-item/${a.payoutItemId}`,
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "create_subscription": {
        const body = {
          ...((a.body as Record<string, unknown>) ?? {}),
          plan_id: a.plan_id,
          ...(a.subscriber !== undefined ? { subscriber: a.subscriber } : {}),
          ...(a.application_context !== undefined
            ? { application_context: a.application_context }
            : {}),
          ...(a.start_time !== undefined ? { start_time: a.start_time } : {}),
          ...(a.quantity !== undefined ? { quantity: a.quantity } : {}),
          ...(a.custom_id !== undefined ? { custom_id: a.custom_id } : {}),
        };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest("POST", "/v1/billing/subscriptions", {
                  body,
                  requestId: a.paypalRequestId as string | undefined,
                }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "get_subscription": {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest(
                  "GET",
                  `/v1/billing/subscriptions/${a.subscriptionId}`,
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "cancel_subscription": {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest(
                  "POST",
                  `/v1/billing/subscriptions/${a.subscriptionId}/cancel`,
                  { body: { reason: a.reason } },
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "list_disputes": {
        const query: Record<string, string | number | undefined> = {};
        if (a.disputed_transaction_id !== undefined)
          query.disputed_transaction_id = a.disputed_transaction_id as string;
        if (a.dispute_state !== undefined) query.dispute_state = a.dispute_state as string;
        if (a.page_size !== undefined) query.page_size = a.page_size as number;
        if (a.next_page_token !== undefined)
          query.next_page_token = a.next_page_token as string;
        if (a.update_time_before !== undefined)
          query.update_time_before = a.update_time_before as string;
        if (a.update_time_after !== undefined)
          query.update_time_after = a.update_time_after as string;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest("GET", "/v1/customer/disputes", { query }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "get_dispute": {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest("GET", `/v1/customer/disputes/${a.disputeId}`),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "accept_dispute_claim": {
        const body = {
          ...((a.body as Record<string, unknown>) ?? {}),
          note: a.note,
          ...(a.accept_claim_reason !== undefined
            ? { accept_claim_reason: a.accept_claim_reason }
            : {}),
        };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest(
                  "POST",
                  `/v1/customer/disputes/${a.disputeId}/accept-claim`,
                  { body },
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "list_webhooks": {
        const query: Record<string, string | undefined> = {};
        if (a.anchor_type !== undefined) query.anchor_type = a.anchor_type as string;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest("GET", "/v1/notifications/webhooks", { query }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "verify_webhook_signature": {
        const body = {
          auth_algo: a.auth_algo,
          cert_url: a.cert_url,
          transmission_id: a.transmission_id,
          transmission_sig: a.transmission_sig,
          transmission_time: a.transmission_time,
          webhook_id: a.webhook_id,
          webhook_event: a.webhook_event,
        };
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await paypalRequest(
                  "POST",
                  "/v1/notifications/verify-webhook-signature",
                  { body },
                ),
                null,
                2,
              ),
            },
          ],
        };
      }
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
        const s = new Server({ name: "mcp-paypal", version: "0.1.1" }, { capabilities: { tools: {} } });
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
