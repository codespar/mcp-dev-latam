#!/usr/bin/env node

/**
 * MCP Server for Khipu — Chilean instant bank-transfer PSP.
 *
 * Khipu enables real-time bank-transfer payments ("transferencia") in Chile.
 * Complement to Transbank (card acquiring): Chilean agents typically bundle
 * Webpay (cards) + Khipu (bank transfer) for full coverage. Bank transfer is
 * preferred for larger transactions — no credit-card limit, no card fees.
 *
 * Tools (8):
 *   create_payment         — POST /payments, returns payment_url + transfer URLs
 *   get_payment            — GET  /payments/{id} or /payments/notify?notification_token=X
 *   delete_payment         — DELETE /payments/{id}
 *   confirm_payment        — POST /payments/{id}/confirm (manual confirmation)
 *   refund_payment         — POST /payments/{id}/refunds (full or partial)
 *   get_merchants          — GET  /merchants (receiver info)
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
  { name: "mcp-khipu", version: "0.1.0" },
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
      name: "get_merchants",
      description: "List the merchant receiver accounts accessible with the current API key. Useful to confirm auth + discover receiver_id values.",
      inputSchema: { type: "object", properties: {} },
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
      case "get_merchants":
        return { content: [{ type: "text", text: JSON.stringify(await khipuRequest("GET", "/merchants"), null, 2) }] };
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
        const s = new Server({ name: "mcp-khipu", version: "0.1.0" }, { capabilities: { tools: {} } });
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
