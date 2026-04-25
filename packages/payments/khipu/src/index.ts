#!/usr/bin/env node

/**
 * MCP Server for Khipu — Chilean instant bank-transfer PSP.
 *
 * Khipu enables real-time bank-transfer payments ("transferencia") in Chile.
 * Complement to Transbank (card acquiring): Chilean agents typically bundle
 * Webpay (cards) + Khipu (bank transfer) for full coverage. Bank transfer is
 * preferred for larger transactions — no credit-card limit, no card fees.
 *
 * Tools (19):
 *   create_payment         — POST /payments, returns payment_url + transfer URLs
 *   get_payment            — GET  /payments/{id} or /payments/notify?notification_token=X
 *   delete_payment         — DELETE /payments/{id}
 *   confirm_payment        — POST /payments/{id}/confirm (manual confirmation)
 *   refund_payment         — POST /payments/{id}/refunds (full or partial)
 *   list_payments          — GET  /payments (paginated search of merchant payments)
 *   predict_payment        — POST /predict (recommend best bank / rails for a payer)
 *   get_merchants          — GET  /merchants (receiver info)
 *   get_merchant           — GET  /merchants/{id}
 *   list_merchant_accounts — GET  /merchants/{id}/accounts
 *   create_receiver        — POST /receivers (onboard a new receiver under the integrator)
 *   list_receivers         — GET  /receivers
 *   list_conciliations     — GET  /conciliations (settlement / reconciliation by date range)
 *   list_reviews           — GET  /reviews (payer opinions / NPS)
 *   register_webhook       — POST /webhooks (register a notification endpoint)
 *   list_webhooks          — GET  /webhooks
 *   delete_webhook         — DELETE /webhooks/{id}
 *   create_terminal_session — POST /terminal-sessions (in-person / POS payment session)
 *   get_terminal_session   — GET  /terminal-sessions/{id}
 *   get_banks              — GET  /banks (supported Chilean banks)
 *   create_automatic_payment — POST /automatic-payments (subscription / recurring)
 *
 * Authentication
 *   Khipu v3 uses an API key sent in the x-api-key header.
 *     Header: x-api-key: <KHIPU_API_KEY>
 *   For backward compatibility the server also accepts legacy v2 Basic auth
 *   with receiver_id:secret if KHIPU_API_KEY is not set.
 *
 * Body format
 *   v3 uses application/json for all POST bodies (v2 used x-www-form-urlencoded).
 *
 * Environment
 *   KHIPU_API_KEY       — v3 API key (preferred)
 *   KHIPU_RECEIVER_ID   — v2 receiver id (Basic auth user, legacy fallback)
 *   KHIPU_SECRET        — v2 receiver secret (Basic auth password, legacy fallback)
 *   KHIPU_BASE_URL      — optional; defaults to https://payment-api.khipu.com/v3
 *
 * Docs: https://docs.khipu.com/portal/en/payment-api/
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.KHIPU_API_KEY || "";
const RECEIVER_ID = process.env.KHIPU_RECEIVER_ID || "";
const SECRET = process.env.KHIPU_SECRET || "";
const BASE_URL = process.env.KHIPU_BASE_URL || "https://payment-api.khipu.com/v3";

function authHeaders(): Record<string, string> {
  if (API_KEY) return { "x-api-key": API_KEY };
  if (RECEIVER_ID && SECRET) {
    const basic = Buffer.from(`${RECEIVER_ID}:${SECRET}`).toString("base64");
    return { "Authorization": `Basic ${basic}` };
  }
  return {};
}

async function khipuRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    "Accept": "application/json",
    ...authHeaders(),
  };
  let bodyStr: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyStr = JSON.stringify(body);
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: bodyStr,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Khipu API ${res.status}: ${err}`);
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
  { name: "mcp-khipu", version: "0.2.0-alpha.2" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_payment",
      description: "Create a Khipu payment (bank-transfer charge). Returns a payment_id and URLs the payer visits to authorize the transfer from their Chilean bank account. Use simplified_transfer_url for in-app redirects and transfer_url for desktop bank-login flows.",
      inputSchema: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Short human-readable purpose of the payment (shown to the payer at their bank)" },
          currency: { type: "string", description: "ISO-4217 currency code. Typically CLP for Chile; CLF supported for UF-denominated charges." },
          amount: { type: "number", description: "Amount in major units (CLP has no decimals — 1000 = 1000 pesos)" },
          payer_email: { type: "string", description: "Payer email — Khipu emails the payment instructions to this address" },
          transaction_id: { type: "string", description: "Merchant-side order reference echoed back in webhooks" },
          custom: { type: "string", description: "Arbitrary merchant string (JSON-encoded if you need structure) echoed back in webhooks" },
          body: { type: "string", description: "Longer description of the payment (shown alongside subject)" },
          return_url: { type: "string", description: "Browser redirect target after a successful payment" },
          cancel_url: { type: "string", description: "Browser redirect target if the payer cancels" },
          notify_url: { type: "string", description: "Webhook URL Khipu POSTs to on status changes (receives a notification_token)" },
          notify_api_version: { type: "string", description: "Webhook API version. Use '3.0' for v3 notifications." },
          expires_date: { type: "string", description: "ISO-8601 expiration timestamp for this payment request" },
          send_email: { type: "boolean", description: "If true, Khipu emails the payer with the payment link" },
          payer_name: { type: "string", description: "Payer display name" },
          send_reminders: { type: "boolean", description: "If true, Khipu sends the payer reminder emails before expiration" },
          responsible_user_email: { type: "string", description: "Internal merchant user email shown in Khipu's dashboard as responsible for this charge" },
          fixed_payer_personal_identifier: { type: "string", description: "Lock this payment to a specific payer RUT" },
          integrator_fee: { type: "number", description: "Integrator fee (for partners)" },
          collect_account_uuid: { type: "string", description: "Override the default collection account" },
          confirm_timeout_date: { type: "string", description: "ISO-8601 deadline after which an unconfirmed payment auto-reverses" },
        },
        required: ["subject", "currency", "amount"],
      },
    },
    {
      name: "get_payment",
      description: "Retrieve a Khipu payment. Pass either payment_id (lookup by id) or notification_token (lookup from a webhook — preferred, since webhooks only contain the token).",
      inputSchema: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "Khipu payment id" },
          notification_token: { type: "string", description: "Token received in the webhook payload" },
        },
      },
    },
    {
      name: "delete_payment",
      description: "Delete (cancel) a pending Khipu payment. Only works while the payment has not been paid by the payer.",
      inputSchema: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "Khipu payment id to delete" },
        },
        required: ["payment_id"],
      },
    },
    {
      name: "confirm_payment",
      description: "Manually confirm a Khipu payment. Use when the merchant has opted into manual confirmation and the backend has validated the underlying transfer.",
      inputSchema: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "Khipu payment id to confirm" },
        },
        required: ["payment_id"],
      },
    },
    {
      name: "refund_payment",
      description: "Refund a paid Khipu payment (full or partial). Refunds are only possible for merchants collecting into a Khipu account and before settlement of the corresponding funds (until 01:00 am the next business day).",
      inputSchema: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "Khipu payment id to refund" },
          amount: { type: "number", description: "Partial refund amount in major units. Omit for a full refund." },
        },
        required: ["payment_id"],
      },
    },
    {
      name: "list_payments",
      description: "List Khipu payments for the current merchant, optionally filtered by date range and status. Useful for reconciliation jobs and agent-driven reporting.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by status (e.g. 'done', 'pending', 'expired', 'reversed')" },
          start: { type: "string", description: "ISO-8601 start timestamp (inclusive)" },
          end: { type: "string", description: "ISO-8601 end timestamp (inclusive)" },
          page: { type: "number", description: "Page number (1-based)" },
          page_size: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "predict_payment",
      description: "Predict whether a payment is likely to succeed for a given payer+amount+bank, and recommend the best bank/rail. Call before create_payment to improve conversion for large or edge-case transfers.",
      inputSchema: {
        type: "object",
        properties: {
          payer_email: { type: "string", description: "Payer email (optional — Khipu uses history if known)" },
          bank_id: { type: "string", description: "Candidate bank id (from get_banks)" },
          amount: { type: "number", description: "Intended charge amount in major units" },
          currency: { type: "string", description: "ISO-4217 currency code, typically CLP" },
        },
        required: ["amount", "currency"],
      },
    },
    {
      name: "get_merchants",
      description: "List the merchant receiver accounts accessible with the current API key. Useful to confirm auth + discover receiver_id values.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_merchant",
      description: "Fetch a single merchant by id. Returns commercial info, configured collect accounts, and current integration status.",
      inputSchema: {
        type: "object",
        properties: {
          merchant_id: { type: "string", description: "Khipu merchant id" },
        },
        required: ["merchant_id"],
      },
    },
    {
      name: "list_merchant_accounts",
      description: "List the bank accounts registered for a merchant to collect into. Use with refund_payment / conciliation flows to know which account funds settle to.",
      inputSchema: {
        type: "object",
        properties: {
          merchant_id: { type: "string", description: "Khipu merchant id" },
        },
        required: ["merchant_id"],
      },
    },
    {
      name: "create_receiver",
      description: "Create (onboard) a new receiver under an integrator account. The receiver can then collect Khipu payments. Only available to integrator-level API keys.",
      inputSchema: {
        type: "object",
        properties: {
          admin_first_name: { type: "string", description: "Admin user first name" },
          admin_last_name: { type: "string", description: "Admin user last name" },
          admin_email: { type: "string", description: "Admin user email" },
          country: { type: "string", description: "ISO-3166 country code (e.g. 'CL')" },
          business_identifier: { type: "string", description: "RUT / tax identifier of the receiving business" },
          business_name: { type: "string", description: "Legal business name" },
          contact_email: { type: "string", description: "Public contact email" },
          contact_phone: { type: "string", description: "Public contact phone" },
        },
        required: ["admin_email", "business_identifier", "business_name"],
      },
    },
    {
      name: "list_receivers",
      description: "List receivers onboarded under the current integrator account.",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number (1-based)" },
          page_size: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "list_conciliations",
      description: "List settlement / conciliation records for a date range. Each record groups settled payments into a single bank deposit. Use to match Khipu payouts to your accounting.",
      inputSchema: {
        type: "object",
        properties: {
          start: { type: "string", description: "ISO-8601 start date (inclusive)" },
          end: { type: "string", description: "ISO-8601 end date (inclusive)" },
          merchant_id: { type: "string", description: "Optional merchant filter (integrator use)" },
        },
        required: ["start", "end"],
      },
    },
    {
      name: "list_reviews",
      description: "List payer reviews / opinions left after a Khipu payment. Useful for NPS dashboards and detecting UX problems in the payment flow.",
      inputSchema: {
        type: "object",
        properties: {
          start: { type: "string", description: "ISO-8601 start date (inclusive)" },
          end: { type: "string", description: "ISO-8601 end date (inclusive)" },
          page: { type: "number", description: "Page number (1-based)" },
          page_size: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "register_webhook",
      description: "Register a webhook endpoint to receive Khipu notifications (payment.paid, payment.refunded, etc). Returns a webhook id and the shared secret used to verify incoming signatures.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "HTTPS endpoint Khipu will POST notifications to" },
          events: { type: "array", items: { type: "string" }, description: "Event names to subscribe to (e.g. ['payment.paid','payment.refunded'])" },
          secret: { type: "string", description: "Optional shared secret; Khipu generates one if omitted" },
        },
        required: ["url"],
      },
    },
    {
      name: "list_webhooks",
      description: "List registered webhook endpoints for the current merchant.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "delete_webhook",
      description: "Delete (unregister) a webhook endpoint by id. Khipu stops sending notifications immediately.",
      inputSchema: {
        type: "object",
        properties: {
          webhook_id: { type: "string", description: "Webhook id to delete" },
        },
        required: ["webhook_id"],
      },
    },
    {
      name: "create_terminal_session",
      description: "Create a Khipu terminal session for in-person / POS bank-transfer checkout. Returns a QR/URL the payer scans at the point of sale to pay from their bank app.",
      inputSchema: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Short description of the sale" },
          amount: { type: "number", description: "Amount in major units (CLP)" },
          currency: { type: "string", description: "ISO-4217 currency, typically CLP" },
          transaction_id: { type: "string", description: "Merchant-side order reference" },
          terminal_id: { type: "string", description: "Optional POS terminal identifier" },
          expires_date: { type: "string", description: "ISO-8601 expiration timestamp" },
        },
        required: ["subject", "amount", "currency"],
      },
    },
    {
      name: "get_terminal_session",
      description: "Retrieve the current status of a terminal (POS) session — whether the payer has scanned, paid, or the session has expired.",
      inputSchema: {
        type: "object",
        properties: {
          session_id: { type: "string", description: "Terminal session id returned by create_terminal_session" },
        },
        required: ["session_id"],
      },
    },
    {
      name: "get_banks",
      description: "List Chilean banks supported by Khipu for bank-transfer payments. Agents can use this to render a bank-selection UI or to validate a bank_id before creating a payment.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_automatic_payment",
      description: "Create a Khipu automatic payment (recurring / subscription charge against a previously enrolled subscription_id). The payer must have completed the subscription enrollment at their bank first.",
      inputSchema: {
        type: "object",
        properties: {
          subscription_id: { type: "string", description: "Subscription id produced during payer enrollment" },
          subject: { type: "string", description: "Short human-readable purpose of this charge" },
          amount: { type: "number", description: "Charge amount in major units" },
          currency: { type: "string", description: "ISO-4217 currency (typically CLP)" },
          transaction_id: { type: "string", description: "Merchant-side order reference" },
          custom: { type: "string", description: "Arbitrary merchant string echoed in webhooks" },
          notify_url: { type: "string", description: "Webhook URL Khipu POSTs to on status changes" },
        },
        required: ["subscription_id", "subject", "amount", "currency"],
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
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("POST", "/payments", a), null, 2) }] };
      case "get_payment": {
        if (a.notification_token) {
          const token = encodeURIComponent(String(a.notification_token));
          return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("GET", `/payments/notify?notification_token=${token}`), null, 2) }] };
        }
        if (!a.payment_id) throw new Error("Either payment_id or notification_token is required");
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("GET", `/payments/${encodeURIComponent(String(a.payment_id))}`), null, 2) }] };
      }
      case "delete_payment":
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("DELETE", `/payments/${encodeURIComponent(String(a.payment_id))}`), null, 2) }] };
      case "confirm_payment":
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("POST", `/payments/${encodeURIComponent(String(a.payment_id))}/confirm`), null, 2) }] };
      case "refund_payment": {
        const id = encodeURIComponent(String(a.payment_id));
        const body: Record<string, unknown> = {};
        if (a.amount !== undefined) body.amount = a.amount;
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("POST", `/payments/${id}/refunds`, body), null, 2) }] };
      }
      case "list_payments": {
        const q = new URLSearchParams();
        if (a.status) q.set("status", String(a.status));
        if (a.start) q.set("start", String(a.start));
        if (a.end) q.set("end", String(a.end));
        if (a.page !== undefined) q.set("page", String(a.page));
        if (a.page_size !== undefined) q.set("page_size", String(a.page_size));
        const qs = q.toString();
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("GET", `/payments${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "predict_payment":
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("POST", "/predict", a), null, 2) }] };
      case "get_merchants":
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("GET", "/merchants"), null, 2) }] };
      case "get_merchant":
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("GET", `/merchants/${encodeURIComponent(String(a.merchant_id))}`), null, 2) }] };
      case "list_merchant_accounts":
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("GET", `/merchants/${encodeURIComponent(String(a.merchant_id))}/accounts`), null, 2) }] };
      case "create_receiver":
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("POST", "/receivers", a), null, 2) }] };
      case "list_receivers": {
        const q = new URLSearchParams();
        if (a.page !== undefined) q.set("page", String(a.page));
        if (a.page_size !== undefined) q.set("page_size", String(a.page_size));
        const qs = q.toString();
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("GET", `/receivers${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "list_conciliations": {
        const q = new URLSearchParams();
        q.set("start", String(a.start));
        q.set("end", String(a.end));
        if (a.merchant_id) q.set("merchant_id", String(a.merchant_id));
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("GET", `/conciliations?${q.toString()}`), null, 2) }] };
      }
      case "list_reviews": {
        const q = new URLSearchParams();
        if (a.start) q.set("start", String(a.start));
        if (a.end) q.set("end", String(a.end));
        if (a.page !== undefined) q.set("page", String(a.page));
        if (a.page_size !== undefined) q.set("page_size", String(a.page_size));
        const qs = q.toString();
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("GET", `/reviews${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "register_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("POST", "/webhooks", a), null, 2) }] };
      case "list_webhooks":
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("GET", "/webhooks"), null, 2) }] };
      case "delete_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("DELETE", `/webhooks/${encodeURIComponent(String(a.webhook_id))}`), null, 2) }] };
      case "create_terminal_session":
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("POST", "/terminal-sessions", a), null, 2) }] };
      case "get_terminal_session":
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("GET", `/terminal-sessions/${encodeURIComponent(String(a.session_id))}`), null, 2) }] };
      case "get_banks":
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("GET", "/banks"), null, 2) }] };
      case "create_automatic_payment":
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("POST", "/automatic-payments", a), null, 2) }] };
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
        const s = new Server({ name: "mcp-khipu", version: "0.2.0-alpha.2" }, { capabilities: { tools: {} } });
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
