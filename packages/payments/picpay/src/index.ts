#!/usr/bin/env node

/**
 * MCP Server for PicPay Business — Brazilian digital wallet (60M+ users).
 *
 * PicPay is one of Brazil's largest digital wallets. The Business Checkout API
 * (a.k.a. "PicPay ecommerce") lets merchants create a payment intent that is
 * completed inside the PicPay app, returning a redirect URL plus a Pix-style
 * QR code. PicPay also supports recurring charges ("Recurrency") via a
 * subscription-plan API.
 *
 * Tools (20):
 *   create_payment           — POST /payments: create a checkout, returns paymentUrl + qrcode
 *   get_payment_status       — GET  /payments/{referenceId}/status
 *   cancel_payment           — POST /payments/{referenceId}/cancellations (also refunds if paid)
 *   refund_payment           — POST /payments/{referenceId}/refunds (explicit refund with optional amount)
 *   create_plan              — POST /recurrency/plans
 *   list_plans               — GET  /recurrency/plans
 *   update_plan              — PUT  /recurrency/plans/{planId}
 *   delete_plan              — DELETE /recurrency/plans/{planId}
 *   create_subscription      — POST /recurrency/subscriptions
 *   get_subscription         — GET  /recurrency/subscriptions/{subscriptionId}
 *   cancel_subscription      — POST /recurrency/subscriptions/{subscriptionId}/cancel
 *   validate_notification    — verify an incoming webhook by x-seller-token header
 *   create_b2p_transfer      — POST /b2p/transfers: business-to-person transfer to a PicPay user
 *   get_b2p_transfer         — GET  /b2p/transfers/{referenceId}: query B2P transfer status
 *   create_batch_payment     — POST /b2p/transfers/batch: batch payments to many PicPay users
 *   list_transactions        — GET  /transactions?startDate&endDate: list merchant transactions by date range
 *   get_wallet_balance       — GET  /wallet/balance: merchant wallet balance
 *   generate_static_qrcode   — POST /qrcode/static: static PicPay Pay QR code (buyer sets amount)
 *   generate_dynamic_qrcode  — POST /qrcode/dynamic: dynamic PicPay Pay QR code (merchant-fixed amount)
 *   create_payment_link      — POST /payment-links: shareable payment link URL
 *
 * Authentication
 *   Header: x-picpay-token: <PICPAY_TOKEN>  (merchant integration token)
 *   Content-Type: application/json
 *   Webhook callbacks carry x-seller-token: <PICPAY_SELLER_TOKEN> so the
 *   merchant can confirm the notification came from PicPay.
 *
 * Environment
 *   PICPAY_TOKEN         Merchant integration token (x-picpay-token header)
 *   PICPAY_SELLER_TOKEN  Seller token used to validate webhook callbacks
 *   PICPAY_BASE_URL      Optional; defaults to https://appws.picpay.com/ecommerce/public
 *
 * Docs: https://developers-business.picpay.com
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const TOKEN = process.env.PICPAY_TOKEN || "";
const SELLER_TOKEN = process.env.PICPAY_SELLER_TOKEN || "";
const BASE_URL = process.env.PICPAY_BASE_URL || "https://appws.picpay.com/ecommerce/public";

async function picpayRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-picpay-token": TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PicPay API ${res.status}: ${err}`);
  }
  // Some PicPay endpoints (e.g. DELETE plan) return an empty body.
  const text = await res.text();
  if (!text) return { ok: true };
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const server = new Server(
  { name: "mcp-picpay", version: "0.2.0-alpha.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_payment",
      description: "Create a PicPay checkout payment. Returns paymentUrl (redirect the buyer to the PicPay app / web) and qrcode (content + base64 image). The buyer pays inside PicPay; your callbackUrl receives the status update. value is in BRL as a decimal number (e.g. 20.50).",
      inputSchema: {
        type: "object",
        properties: {
          referenceId: { type: "string", description: "Merchant-side unique identifier for this order. Used in subsequent status/cancel calls." },
          callbackUrl: { type: "string", description: "HTTPS endpoint PicPay POSTs to on status changes. Validate via x-seller-token header." },
          returnUrl: { type: "string", description: "URL the buyer is redirected to after completing payment in the PicPay app." },
          value: { type: "number", description: "Amount in BRL, decimal (e.g. 100.50). Not cents." },
          expiresAt: { type: "string", description: "ISO-8601 expiration timestamp (e.g. 2026-12-31T23:59:59-03:00)" },
          buyer: {
            type: "object",
            description: "Buyer identity. document (CPF) is required by BCB rules.",
            properties: {
              firstName: { type: "string" },
              lastName: { type: "string" },
              document: { type: "string", description: "CPF, digits only or formatted" },
              email: { type: "string" },
              phone: { type: "string", description: "E.164 or BR format (e.g. +55 11 91234-5678)" },
            },
            required: ["firstName", "lastName", "document"],
          },
        },
        required: ["referenceId", "callbackUrl", "returnUrl", "value"],
      },
    },
    {
      name: "get_payment_status",
      description: "Get the status of a payment by referenceId. Typical statuses: created, expired, analysis, paid, completed, refunded, chargeback.",
      inputSchema: {
        type: "object",
        properties: {
          referenceId: { type: "string", description: "Merchant-side order reference passed to create_payment" },
        },
        required: ["referenceId"],
      },
    },
    {
      name: "cancel_payment",
      description: "Cancel a PicPay order. If the order is unpaid, it is voided. If already paid, this triggers a refund (requires merchant account balance to cover).",
      inputSchema: {
        type: "object",
        properties: {
          referenceId: { type: "string", description: "Merchant-side order reference" },
          authorizationId: { type: "string", description: "PicPay authorizationId (returned by get_payment_status for paid orders). Required only when refunding a paid order." },
        },
        required: ["referenceId"],
      },
    },
    {
      name: "create_plan",
      description: "Create a subscription plan (Recurrency API). Plans define the recurring amount, frequency, and trial.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Plan name shown to the buyer" },
          description: { type: "string", description: "Plan description" },
          value: { type: "number", description: "Recurring charge amount in BRL (decimal)" },
          frequency: { type: "string", description: "Billing frequency (e.g. MONTHLY, WEEKLY, YEARLY) — confirm exact values in PicPay docs" },
          durationInDays: { type: "number", description: "Optional duration of each billing cycle in days" },
          trialInDays: { type: "number", description: "Optional free trial length in days" },
        },
        required: ["name", "value", "frequency"],
      },
    },
    {
      name: "list_plans",
      description: "List all subscription plans registered for this merchant.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "update_plan",
      description: "Update an existing subscription plan.",
      inputSchema: {
        type: "object",
        properties: {
          planId: { type: "string", description: "PicPay plan identifier" },
          name: { type: "string" },
          description: { type: "string" },
          value: { type: "number" },
          frequency: { type: "string" },
          durationInDays: { type: "number" },
          trialInDays: { type: "number" },
        },
        required: ["planId"],
      },
    },
    {
      name: "delete_plan",
      description: "Delete a subscription plan. Fails if the plan has active subscriptions.",
      inputSchema: {
        type: "object",
        properties: {
          planId: { type: "string", description: "PicPay plan identifier" },
        },
        required: ["planId"],
      },
    },
    {
      name: "create_subscription",
      description: "Enroll a buyer in a subscription plan. Returns the subscription record and the buyer-facing authorization URL.",
      inputSchema: {
        type: "object",
        properties: {
          planId: { type: "string", description: "PicPay plan id to subscribe the buyer to" },
          referenceId: { type: "string", description: "Merchant-side unique subscription reference" },
          callbackUrl: { type: "string", description: "HTTPS endpoint PicPay POSTs to on subscription/charge events" },
          returnUrl: { type: "string", description: "URL the buyer is redirected to after authorization" },
          buyer: {
            type: "object",
            properties: {
              firstName: { type: "string" },
              lastName: { type: "string" },
              document: { type: "string", description: "CPF" },
              email: { type: "string" },
              phone: { type: "string" },
            },
            required: ["firstName", "lastName", "document"],
          },
        },
        required: ["planId", "referenceId", "callbackUrl", "returnUrl", "buyer"],
      },
    },
    {
      name: "get_subscription",
      description: "Retrieve a subscription by id.",
      inputSchema: {
        type: "object",
        properties: {
          subscriptionId: { type: "string", description: "PicPay subscription id" },
        },
        required: ["subscriptionId"],
      },
    },
    {
      name: "cancel_subscription",
      description: "Cancel an active subscription. Future recurring charges are stopped; past charges are not refunded automatically.",
      inputSchema: {
        type: "object",
        properties: {
          subscriptionId: { type: "string", description: "PicPay subscription id" },
        },
        required: ["subscriptionId"],
      },
    },
    {
      name: "validate_notification",
      description: "Verify that an incoming webhook callback came from PicPay by comparing the x-seller-token header against PICPAY_SELLER_TOKEN. Use this in your callback handler before trusting the payload, then call get_payment_status to fetch the authoritative status.",
      inputSchema: {
        type: "object",
        properties: {
          headerToken: { type: "string", description: "Value of the x-seller-token header from the incoming webhook request" },
        },
        required: ["headerToken"],
      },
    },
    {
      name: "refund_payment",
      description: "Refund a paid PicPay order, optionally partially. Unlike cancel_payment, this is the explicit refund endpoint and accepts a custom amount for partial refunds. The merchant wallet must have enough balance to cover the refund.",
      inputSchema: {
        type: "object",
        properties: {
          referenceId: { type: "string", description: "Merchant-side order reference of the paid payment to refund" },
          authorizationId: { type: "string", description: "PicPay authorizationId returned by get_payment_status for the paid order" },
          value: { type: "number", description: "Optional refund amount in BRL (decimal). Omit for a full refund." },
        },
        required: ["referenceId", "authorizationId"],
      },
    },
    {
      name: "create_b2p_transfer",
      description: "Create a Business-to-Person (B2P) transfer: push funds from the merchant wallet to a PicPay user identified by CPF/CNPJ. Useful for payouts, cashbacks, rewards and marketplace splits. Amount in BRL decimal.",
      inputSchema: {
        type: "object",
        properties: {
          referenceId: { type: "string", description: "Merchant-side unique identifier for this transfer" },
          value: { type: "number", description: "Transfer amount in BRL (decimal, e.g. 50.00)" },
          document: { type: "string", description: "Recipient CPF/CNPJ, digits only or formatted" },
          description: { type: "string", description: "Optional message shown to the recipient in PicPay" },
          callbackUrl: { type: "string", description: "Optional HTTPS endpoint PicPay POSTs to on transfer status change" },
        },
        required: ["referenceId", "value", "document"],
      },
    },
    {
      name: "get_b2p_transfer",
      description: "Get the status of a B2P transfer by referenceId. Typical statuses: created, processing, completed, failed.",
      inputSchema: {
        type: "object",
        properties: {
          referenceId: { type: "string", description: "Merchant-side transfer reference passed to create_b2p_transfer" },
        },
        required: ["referenceId"],
      },
    },
    {
      name: "create_batch_payment",
      description: "Submit a batch of B2P transfers in a single request. Each item is an independent transfer to a PicPay user; PicPay processes them asynchronously and notifies per-item via callback.",
      inputSchema: {
        type: "object",
        properties: {
          batchReferenceId: { type: "string", description: "Merchant-side unique identifier for the whole batch" },
          callbackUrl: { type: "string", description: "Optional HTTPS endpoint PicPay POSTs to on per-item status changes" },
          transfers: {
            type: "array",
            description: "Array of transfers. Each must have its own referenceId, value and document.",
            items: {
              type: "object",
              properties: {
                referenceId: { type: "string", description: "Merchant-side unique identifier for this item" },
                value: { type: "number", description: "Transfer amount in BRL (decimal)" },
                document: { type: "string", description: "Recipient CPF/CNPJ" },
                description: { type: "string", description: "Optional message to the recipient" },
              },
              required: ["referenceId", "value", "document"],
            },
          },
        },
        required: ["batchReferenceId", "transfers"],
      },
    },
    {
      name: "list_transactions",
      description: "List merchant transactions (payments and transfers) within a date range. Supports pagination and optional status filter.",
      inputSchema: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Start of the window, ISO-8601 (e.g. 2026-04-01 or 2026-04-01T00:00:00-03:00)" },
          endDate: { type: "string", description: "End of the window, ISO-8601" },
          status: { type: "string", description: "Optional status filter (e.g. paid, refunded, completed)" },
          page: { type: "number", description: "Optional page number (1-based)" },
          pageSize: { type: "number", description: "Optional page size" },
        },
        required: ["startDate", "endDate"],
      },
    },
    {
      name: "get_wallet_balance",
      description: "Retrieve the merchant's current PicPay wallet balance (available and blocked amounts in BRL). Useful before issuing refunds or B2P transfers.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "generate_static_qrcode",
      description: "Generate a static PicPay Pay QR code for in-store / reusable use. The buyer opens PicPay, scans the QR and types in the amount. Returns the QR content and a base64 image.",
      inputSchema: {
        type: "object",
        properties: {
          referenceId: { type: "string", description: "Merchant-side unique identifier for this QR (used to correlate incoming payments)" },
          description: { type: "string", description: "Optional text shown to the buyer in the PicPay app" },
        },
        required: ["referenceId"],
      },
    },
    {
      name: "generate_dynamic_qrcode",
      description: "Generate a dynamic PicPay Pay QR code with a fixed amount and optional expiration. Each QR is single-purpose. Returns qrcode content + base64 image and a paymentUrl.",
      inputSchema: {
        type: "object",
        properties: {
          referenceId: { type: "string", description: "Merchant-side unique identifier for this QR / payment" },
          value: { type: "number", description: "Amount in BRL (decimal)" },
          expiresAt: { type: "string", description: "Optional ISO-8601 expiration timestamp" },
          description: { type: "string", description: "Optional text shown to the buyer in the PicPay app" },
          callbackUrl: { type: "string", description: "Optional HTTPS endpoint PicPay POSTs to on payment status change" },
        },
        required: ["referenceId", "value"],
      },
    },
    {
      name: "create_payment_link",
      description: "Create a shareable PicPay payment link. Returns a short URL the merchant can send via WhatsApp / email. The buyer opens the link and completes payment inside PicPay.",
      inputSchema: {
        type: "object",
        properties: {
          referenceId: { type: "string", description: "Merchant-side unique identifier for this link / order" },
          value: { type: "number", description: "Amount in BRL (decimal)" },
          description: { type: "string", description: "Optional text shown to the buyer" },
          expiresAt: { type: "string", description: "Optional ISO-8601 expiration timestamp" },
          callbackUrl: { type: "string", description: "Optional HTTPS endpoint PicPay POSTs to on status change" },
          returnUrl: { type: "string", description: "Optional URL the buyer is redirected to after paying" },
          maxUses: { type: "number", description: "Optional max number of times the link can be paid (default 1)" },
        },
        required: ["referenceId", "value"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "create_payment":
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("POST", "/payments", a), null, 2) }] };
      case "get_payment_status": {
        const ref = encodeURIComponent(String(a.referenceId));
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("GET", `/payments/${ref}/status`), null, 2) }] };
      }
      case "cancel_payment": {
        const ref = encodeURIComponent(String(a.referenceId));
        const body: Record<string, unknown> = {};
        if (a.authorizationId) body.authorizationId = a.authorizationId;
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("POST", `/payments/${ref}/cancellations`, body), null, 2) }] };
      }
      case "create_plan":
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("POST", "/recurrency/plans", a), null, 2) }] };
      case "list_plans":
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("GET", "/recurrency/plans"), null, 2) }] };
      case "update_plan": {
        const planId = encodeURIComponent(String(a.planId));
        const body = { ...a };
        delete (body as { planId?: unknown }).planId;
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("PUT", `/recurrency/plans/${planId}`, body), null, 2) }] };
      }
      case "delete_plan": {
        const planId = encodeURIComponent(String(a.planId));
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("DELETE", `/recurrency/plans/${planId}`), null, 2) }] };
      }
      case "create_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("POST", "/recurrency/subscriptions", a), null, 2) }] };
      case "get_subscription": {
        const sid = encodeURIComponent(String(a.subscriptionId));
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("GET", `/recurrency/subscriptions/${sid}`), null, 2) }] };
      }
      case "cancel_subscription": {
        const sid = encodeURIComponent(String(a.subscriptionId));
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("POST", `/recurrency/subscriptions/${sid}/cancel`), null, 2) }] };
      }
      case "validate_notification": {
        const headerToken = String(a.headerToken ?? "");
        const valid = Boolean(SELLER_TOKEN) && headerToken === SELLER_TOKEN;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  valid,
                  reason: valid
                    ? "x-seller-token matches PICPAY_SELLER_TOKEN"
                    : SELLER_TOKEN
                    ? "x-seller-token does not match PICPAY_SELLER_TOKEN"
                    : "PICPAY_SELLER_TOKEN is not configured",
                },
                null,
                2
              ),
            },
          ],
        };
      }
      case "refund_payment": {
        const ref = encodeURIComponent(String(a.referenceId));
        const body: Record<string, unknown> = { authorizationId: a.authorizationId };
        if (a.value !== undefined) body.value = a.value;
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("POST", `/payments/${ref}/refunds`, body), null, 2) }] };
      }
      case "create_b2p_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("POST", "/b2p/transfers", a), null, 2) }] };
      case "get_b2p_transfer": {
        const ref = encodeURIComponent(String(a.referenceId));
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("GET", `/b2p/transfers/${ref}`), null, 2) }] };
      }
      case "create_batch_payment":
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("POST", "/b2p/transfers/batch", a), null, 2) }] };
      case "list_transactions": {
        const qs = new URLSearchParams();
        if (a.startDate) qs.set("startDate", String(a.startDate));
        if (a.endDate) qs.set("endDate", String(a.endDate));
        if (a.status) qs.set("status", String(a.status));
        if (a.page !== undefined) qs.set("page", String(a.page));
        if (a.pageSize !== undefined) qs.set("pageSize", String(a.pageSize));
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("GET", `/transactions?${qs.toString()}`), null, 2) }] };
      }
      case "get_wallet_balance":
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("GET", "/wallet/balance"), null, 2) }] };
      case "generate_static_qrcode":
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("POST", "/qrcode/static", a), null, 2) }] };
      case "generate_dynamic_qrcode":
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("POST", "/qrcode/dynamic", a), null, 2) }] };
      case "create_payment_link":
        return { content: [{ type: "text", text: JSON.stringify(await picpayRequest("POST", "/payment-links", a), null, 2) }] };
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
        const s = new Server({ name: "mcp-picpay", version: "0.2.0-alpha.1" }, { capabilities: { tools: {} } });
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
