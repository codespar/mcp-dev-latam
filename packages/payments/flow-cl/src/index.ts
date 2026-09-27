#!/usr/bin/env node

/**
 * MCP Server for Flow — Chile-native PSP (flow.cl).
 *
 * Flow is the Chilean payment gateway used by SMB and mid-market
 * commerce: one hosted payment order covers Webpay (credit/debit),
 * ETpay bank transfer, Servipag/cash and international cards. The API
 * is form-encoded and every call is signed: parameters are sorted
 * alphabetically, concatenated as name+value, and signed with
 * HMAC-SHA256 using the merchant's secretKey.
 *
 * Tools (8):
 *   create_payment                    — create a hosted payment order (returns url + token)
 *   create_payment_by_email          — Flow emails the customer a collection link
 *   get_payment_status               — payment status by Flow token
 *   get_payment_status_by_commerce_id — payment status by your commerceOrder id
 *   get_payment_status_by_flow_order — payment status by Flow order number
 *   list_payments                    — payments received on a given date (paged)
 *   create_refund                    — create a refund order
 *   get_refund_status                — refund status by refund token
 *
 * APIs
 *   Production: https://www.flow.cl/api
 *   Sandbox:    https://sandbox.flow.cl/api
 *
 * Authentication
 *   apiKey:    merchant API key (sent as a parameter)
 *   secretKey: HMAC-SHA256 signing secret (never sent)
 *
 * Environment
 *   FLOW_API_KEY    — Flow API key (required)
 *   FLOW_SECRET_KEY — Flow secret key for HMAC signing (required)
 *   FLOW_ENV        — "sandbox" | "production" (default: "sandbox")
 *
 * Docs: https://www.flowapi.cl/docs/api.html
 */

import { createHmac } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.FLOW_API_KEY || "";
const SECRET_KEY = process.env.FLOW_SECRET_KEY || "";
const ENV = (process.env.FLOW_ENV || "sandbox").toLowerCase();

const BASE_URL = process.env.FLOW_BASE_URL || (ENV === "production"
  ? "https://www.flow.cl/api"
  : "https://sandbox.flow.cl/api");

/** Flow signature: sort params alphabetically by name, concatenate as
 *  name+value (no separators), HMAC-SHA256 hex with the secretKey. */
function signParams(params: Record<string, string>): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("");
  return createHmac("sha256", SECRET_KEY).update(toSign).digest("hex");
}

/** Build the signed param set: apiKey + caller params + s. Skips
 *  undefined/null values so optional tool args never sign as "undefined". */
function buildParams(raw: Record<string, unknown>): URLSearchParams {
  const params: Record<string, string> = { apiKey: API_KEY };
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null) continue;
    params[k] = typeof v === "object" ? JSON.stringify(v) : String(v);
  }
  const s = signParams(params);
  const out = new URLSearchParams(params);
  out.set("s", s);
  return out;
}

async function flowRequest(
  method: "GET" | "POST",
  path: string,
  rawParams: Record<string, unknown>,
): Promise<unknown> {
  const params = buildParams(rawParams);
  const url = method === "GET"
    ? `${BASE_URL}${path}?${params.toString()}`
    : `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: method === "POST"
      ? { "Content-Type": "application/x-www-form-urlencoded" }
      : undefined,
    body: method === "POST" ? params.toString() : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Flow API ${res.status}: ${text}`);
  }
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
  { name: "mcp-flow-cl", version: "0.1.0" },
  { capabilities: { tools: {} }, instructions: MANAGED_TIER_HINT },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_payment",
      description:
        "Create a hosted payment order (POST /payment/create). Returns url + token + flowOrder; the customer pays at url + '?token=' + token. paymentMethod 9 offers every method Flow has enabled for the merchant (Webpay, ETpay bank transfer, cash, international cards).",
      inputSchema: {
        type: "object",
        properties: {
          commerceOrder: { type: "string", description: "Your unique order id" },
          subject: { type: "string", description: "Payment description shown to the customer" },
          currency: { type: "string", description: "Currency (CLP or UF). Default CLP" },
          amount: { type: "number", description: "Amount to charge (integer for CLP)" },
          email: { type: "string", description: "Customer email" },
          paymentMethod: { type: "number", description: "1 Webpay, 3 all cards, 5 Onepay, 8 ETpay, 9 all enabled methods. Default 9" },
          urlConfirmation: { type: "string", description: "Server-to-server confirmation callback URL (POST, receives token)" },
          urlReturn: { type: "string", description: "URL the customer returns to after paying" },
          optional: { type: "object", description: "Optional JSON of extra fields echoed back in getStatus" },
          timeout: { type: "number", description: "Seconds the payment order stays valid (omit = no expiry)" },
        },
        required: ["commerceOrder", "subject", "amount", "email", "urlConfirmation", "urlReturn"],
      },
    },
    {
      name: "create_payment_by_email",
      description:
        "Create a collection order Flow emails to the customer (POST /payment/createEmail). Same shape as create_payment but Flow delivers the payment link by email — no checkout redirect needed.",
      inputSchema: {
        type: "object",
        properties: {
          commerceOrder: { type: "string", description: "Your unique order id" },
          subject: { type: "string", description: "Payment description shown to the customer" },
          currency: { type: "string", description: "Currency (CLP or UF). Default CLP" },
          amount: { type: "number", description: "Amount to charge (integer for CLP)" },
          email: { type: "string", description: "Customer email that receives the collection link" },
          urlConfirmation: { type: "string", description: "Server-to-server confirmation callback URL" },
          urlReturn: { type: "string", description: "URL the customer returns to after paying" },
          forward_days_after: { type: "number", description: "Resend the email N days after the first send" },
          forward_times: { type: "number", description: "How many times to resend" },
          timeout: { type: "number", description: "Seconds the payment order stays valid" },
        },
        required: ["commerceOrder", "subject", "amount", "email", "urlConfirmation", "urlReturn"],
      },
    },
    {
      name: "get_payment_status",
      description:
        "Get a payment order's status by Flow token (GET /payment/getStatus). status: 1 pending, 2 paid, 3 rejected, 4 canceled.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Flow payment token (from create_payment or the confirmation callback)" },
        },
        required: ["token"],
      },
    },
    {
      name: "get_payment_status_by_commerce_id",
      description:
        "Get a payment order's status by your commerceOrder id (GET /payment/getStatusByCommerceId).",
      inputSchema: {
        type: "object",
        properties: {
          commerceId: { type: "string", description: "The commerceOrder you sent on create" },
        },
        required: ["commerceId"],
      },
    },
    {
      name: "get_payment_status_by_flow_order",
      description:
        "Get a payment order's status by Flow order number (GET /payment/getStatusByFlowOrder).",
      inputSchema: {
        type: "object",
        properties: {
          flowOrder: { type: "number", description: "Flow order number (returned by create_payment)" },
        },
        required: ["flowOrder"],
      },
    },
    {
      name: "list_payments",
      description:
        "List payments received on a given date (GET /payment/getPayments). Paged; date is the merchant's local day.",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date to list, format YYYY-MM-DD" },
          start: { type: "number", description: "Pagination offset (default 0)" },
          limit: { type: "number", description: "Page size, max 100 (default 10)" },
        },
        required: ["date"],
      },
    },
    {
      name: "create_refund",
      description:
        "Create a refund order (POST /refund/create). Refund a received payment fully or partially; Flow notifies urlCallBack when the refund resolves.",
      inputSchema: {
        type: "object",
        properties: {
          refundCommerceOrder: { type: "string", description: "Your unique refund order id" },
          receiverEmail: { type: "string", description: "Email of the refund receiver" },
          amount: { type: "number", description: "Amount to refund" },
          urlCallBack: { type: "string", description: "Callback URL Flow notifies when the refund resolves" },
          commerceTrxId: { type: "string", description: "Original commerceOrder (alternative to flowTrxId)" },
          flowTrxId: { type: "number", description: "Original Flow order number (alternative to commerceTrxId)" },
        },
        required: ["refundCommerceOrder", "receiverEmail", "amount", "urlCallBack"],
      },
    },
    {
      name: "get_refund_status",
      description:
        "Get a refund order's status by refund token (GET /refund/getStatus). status: created, accepted, rejected, refunded, canceled.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Refund token (returned by create_refund)" },
        },
        required: ["token"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "create_payment": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await flowRequest("POST", "/payment/create", args ?? {}), null, 2) },
          ],
        };
      }
      case "create_payment_by_email": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await flowRequest("POST", "/payment/createEmail", args ?? {}), null, 2) },
          ],
        };
      }
      case "get_payment_status": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await flowRequest("GET", "/payment/getStatus", { token: args?.token }), null, 2) },
          ],
        };
      }
      case "get_payment_status_by_commerce_id": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await flowRequest("GET", "/payment/getStatusByCommerceId", { commerceId: args?.commerceId }), null, 2) },
          ],
        };
      }
      case "get_payment_status_by_flow_order": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await flowRequest("GET", "/payment/getStatusByFlowOrder", { flowOrder: args?.flowOrder }), null, 2) },
          ],
        };
      }
      case "list_payments": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await flowRequest("GET", "/payment/getPayments", { date: args?.date, start: args?.start, limit: args?.limit }), null, 2) },
          ],
        };
      }
      case "create_refund": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await flowRequest("POST", "/refund/create", args ?? {}), null, 2) },
          ],
        };
      }
      case "get_refund_status": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await flowRequest("GET", "/refund/getStatus", { token: args?.token }), null, 2) },
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
  if (process.argv.includes("--http") || process.env.MCP_HTTP === "true") {
    const { default: express } = await import("express");
    const { randomUUID } = await import("node:crypto");
    const app = express();
    app.use(express.json());
    const transports = new Map<string, StreamableHTTPServerTransport>();
    app.get("/health", (_req: any, res: any) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: any, res: any) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req, res, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-flow-cl", version: "0.1.0" }, { capabilities: { tools: {} } });
        (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v));
        (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v));
        await s.connect(t);
        await t.handleRequest(req, res, req.body); return;
      }
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
    });
    app.get("/mcp", async (req: any, res: any) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req, res); else res.status(400).send("Invalid session"); });
    app.delete("/mcp", async (req: any, res: any) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req, res); else res.status(400).send("Invalid session"); });
    const port = Number(process.env.MCP_PORT) || 3000;
    app.listen(port, () => { console.error(`MCP HTTP server on http://localhost:${port}/mcp`); });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch(console.error);
