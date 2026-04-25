#!/usr/bin/env node

/**
 * MCP Server for Transbank — Chile's dominant card acquirer.
 *
 * Transbank is effectively default for Chilean commerce (state-origin roots,
 * owned by a consortium of Chilean banks). Shipping this server is a
 * prerequisite for any "CodeSpar covers LatAm" claim that includes Chile.
 *
 * Three products are covered:
 *   Webpay Plus          — one-shot redirect payments (buy_order + amount)
 *   Webpay Mall          — same redirect flow, but splits a single cart across
 *                          multiple seller commerce codes (details[] body)
 *   Webpay OneClick Mall — tokenized recurring payments across multiple
 *                          merchant codes (stored-card / card-on-file)
 *
 * Tools (19):
 *   Webpay Plus (single payments)
 *     webpay_create_transaction      — start a Webpay Plus transaction (returns redirect URL)
 *     webpay_commit_transaction      — commit after user returns to merchant
 *     webpay_get_transaction_status  — look up status by token
 *     webpay_refund_transaction      — refund a committed Webpay Plus transaction
 *     webpay_increase_amount         — capture partial authorization
 *     webpay_capture_transaction     — PUT deferred-capture (official path)
 *
 *   Webpay Mall (split-cart / multi-seller single payment)
 *     webpay_mall_create_transaction — start a Webpay Mall transaction with details[]
 *     webpay_mall_commit_transaction — commit after user returns from Webpay
 *     webpay_mall_get_transaction_status — look up mall transaction status by token
 *     webpay_mall_refund_transaction — refund one child seller of a mall transaction
 *     webpay_mall_capture_transaction — deferred capture for one child seller
 *
 *   OneClick Mall (recurring / stored cards)
 *     oneclick_create_inscription    — start card-enrollment flow
 *     oneclick_finish_inscription    — confirm enrollment after user returns
 *     oneclick_delete_inscription    — delete a stored card
 *     oneclick_authorize             — charge a stored card across mall sellers
 *     oneclick_capture               — capture a previously authorized OneClick charge
 *     oneclick_refund                — refund a OneClick Mall charge
 *     oneclick_status                — look up OneClick transaction status (alias of _by_buy_order)
 *     oneclick_get_transaction_by_buy_order — same lookup, explicit name for buy_order pattern
 *
 *   Patpass by Webpay (recurring direct debit)
 *     NOTE: Patpass by Webpay is SOAP-only per official docs — there is no REST
 *     surface to wrap as MCP tools. Skipped intentionally.
 *
 * Authentication
 *   Transbank REST uses two headers on every request:
 *     Tbk-Api-Key-Id     : merchant commerce code
 *     Tbk-Api-Key-Secret : secret key
 *
 * Environment
 *   TRANSBANK_COMMERCE_CODE   merchant commerce code
 *   TRANSBANK_API_KEY_SECRET  secret key
 *   TRANSBANK_ENV             'integration' (default) | 'production'
 *
 * Docs: https://www.transbankdevelopers.cl
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const COMMERCE_CODE = process.env.TRANSBANK_COMMERCE_CODE || "";
const API_KEY_SECRET = process.env.TRANSBANK_API_KEY_SECRET || "";
const ENV = (process.env.TRANSBANK_ENV || "integration").toLowerCase();
const BASE_URL = ENV === "production"
  ? "https://webpay3g.transbank.cl"
  : "https://webpay3gint.transbank.cl";

async function transbankRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Tbk-Api-Key-Id": COMMERCE_CODE,
      "Tbk-Api-Key-Secret": API_KEY_SECRET,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Transbank API ${res.status}: ${err}`);
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
  { name: "mcp-transbank", version: "0.2.0-alpha.2" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "webpay_create_transaction",
      description: "Create a Webpay Plus transaction. Returns { token, url } — redirect the user to url?token_ws=<token> to complete payment. After the user returns to return_url, call webpay_commit_transaction.",
      inputSchema: {
        type: "object",
        properties: {
          buy_order: { type: "string", description: "Merchant-side order id (max 26 chars)" },
          session_id: { type: "string", description: "Merchant-side session id (max 61 chars)" },
          amount: { type: "number", description: "Amount in CLP (integer, no decimals)" },
          return_url: { type: "string", description: "URL Transbank redirects the user back to after payment" },
        },
        required: ["buy_order", "session_id", "amount", "return_url"],
      },
    },
    {
      name: "webpay_commit_transaction",
      description: "Commit a Webpay Plus transaction after the user has returned from the Webpay flow. Must be called to actually charge the card.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Webpay token (token_ws query param on return)" },
        },
        required: ["token"],
      },
    },
    {
      name: "webpay_get_transaction_status",
      description: "Get the current status of a Webpay Plus transaction by token.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Webpay token" },
        },
        required: ["token"],
      },
    },
    {
      name: "webpay_refund_transaction",
      description: "Refund a committed Webpay Plus transaction. Full refund if amount equals original; partial otherwise.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Webpay token of the original transaction" },
          amount: { type: "number", description: "Refund amount in CLP (integer)" },
        },
        required: ["token", "amount"],
      },
    },
    {
      name: "webpay_increase_amount",
      description: "Capture a previously authorized Webpay Plus transaction (partial-capture / deferred-capture flow).",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Webpay token of the authorized transaction" },
          buy_order: { type: "string", description: "Original buy_order" },
          authorization_code: { type: "string", description: "Authorization code returned at authorization time" },
          capture_amount: { type: "number", description: "Amount to capture in CLP (integer)" },
        },
        required: ["token", "buy_order", "authorization_code", "capture_amount"],
      },
    },
    {
      name: "webpay_capture_transaction",
      description: "Deferred-capture for a previously authorized Webpay Plus transaction. Uses the official PUT /capture endpoint — prefer this over webpay_increase_amount for standard deferred-capture flows.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Webpay token of the authorized transaction" },
          buy_order: { type: "string", description: "Original buy_order" },
          authorization_code: { type: "string", description: "Authorization code returned at authorization time" },
          capture_amount: { type: "number", description: "Amount to capture in CLP (integer)" },
        },
        required: ["token", "buy_order", "authorization_code", "capture_amount"],
      },
    },
    {
      name: "webpay_mall_create_transaction",
      description: "Create a Webpay Mall transaction — one parent buy_order split across several seller commerce codes. Returns { token, url } exactly like Webpay Plus. Each details entry is a child charge with its own commerce_code, buy_order, and amount.",
      inputSchema: {
        type: "object",
        properties: {
          buy_order: { type: "string", description: "Parent (mall) buy_order (max 26 chars)" },
          session_id: { type: "string", description: "Merchant-side session id (max 61 chars)" },
          return_url: { type: "string", description: "URL Transbank redirects the user back to after payment" },
          details: {
            type: "array",
            description: "Child charges, one per mall seller",
            items: {
              type: "object",
              properties: {
                amount: { type: "number", description: "Child amount in CLP (integer)" },
                commerce_code: { type: "string", description: "Child-merchant commerce code" },
                buy_order: { type: "string", description: "Child buy_order (unique per detail, max 26 chars)" },
              },
              required: ["amount", "commerce_code", "buy_order"],
            },
          },
        },
        required: ["buy_order", "session_id", "return_url", "details"],
      },
    },
    {
      name: "webpay_mall_commit_transaction",
      description: "Commit a Webpay Mall transaction after the user has returned. Charges all child commerce codes at once.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Webpay token (token_ws query param on return)" },
        },
        required: ["token"],
      },
    },
    {
      name: "webpay_mall_get_transaction_status",
      description: "Get the status of a Webpay Mall transaction by token (includes per-child details).",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Webpay token" },
        },
        required: ["token"],
      },
    },
    {
      name: "webpay_mall_refund_transaction",
      description: "Refund one child seller of a Webpay Mall transaction. Must specify which child (commerce_code + buy_order) to refund.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Webpay token of the original mall transaction" },
          buy_order: { type: "string", description: "Child buy_order to refund" },
          commerce_code: { type: "string", description: "Child commerce_code" },
          amount: { type: "number", description: "Refund amount in CLP (integer)" },
        },
        required: ["token", "buy_order", "commerce_code", "amount"],
      },
    },
    {
      name: "webpay_mall_capture_transaction",
      description: "Deferred-capture for one child seller inside a Webpay Mall transaction.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Webpay token of the authorized mall transaction" },
          commerce_code: { type: "string", description: "Child commerce_code to capture" },
          buy_order: { type: "string", description: "Child buy_order" },
          authorization_code: { type: "string", description: "Authorization code returned at authorization time" },
          capture_amount: { type: "number", description: "Amount to capture in CLP (integer)" },
        },
        required: ["token", "commerce_code", "buy_order", "authorization_code", "capture_amount"],
      },
    },
    {
      name: "oneclick_create_inscription",
      description: "Start a OneClick Mall card-enrollment flow. Returns { token, url_webpay } — redirect the user to complete enrollment. After return to response_url, call oneclick_finish_inscription.",
      inputSchema: {
        type: "object",
        properties: {
          username: { type: "string", description: "Merchant-side stable user identifier (max 40 chars)" },
          email: { type: "string", description: "User email" },
          response_url: { type: "string", description: "URL Transbank redirects the user back to after enrollment" },
        },
        required: ["username", "email", "response_url"],
      },
    },
    {
      name: "oneclick_finish_inscription",
      description: "Finalize a OneClick Mall enrollment after the user has returned. Returns the tbk_user token to store and reuse in oneclick_authorize.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Inscription token (TBK_TOKEN query param on return)" },
        },
        required: ["token"],
      },
    },
    {
      name: "oneclick_delete_inscription",
      description: "Delete (revoke) a stored OneClick Mall card for a user.",
      inputSchema: {
        type: "object",
        properties: {
          tbk_user: { type: "string", description: "Stored-card token from oneclick_finish_inscription" },
          username: { type: "string", description: "Same merchant-side username used at enrollment" },
        },
        required: ["tbk_user", "username"],
      },
    },
    {
      name: "oneclick_authorize",
      description: "Charge a stored OneClick Mall card across one or more mall merchant codes. Each details entry is a separate child charge with its own commerce_code, buy_order, amount, and installments_number.",
      inputSchema: {
        type: "object",
        properties: {
          username: { type: "string", description: "Merchant-side username associated with the tbk_user" },
          tbk_user: { type: "string", description: "Stored-card token" },
          buy_order: { type: "string", description: "Parent (mall) buy_order (max 26 chars)" },
          details: {
            type: "array",
            description: "Child charges, one per mall seller",
            items: {
              type: "object",
              properties: {
                commerce_code: { type: "string", description: "Child-merchant commerce code" },
                buy_order: { type: "string", description: "Child buy_order (unique per detail, max 26 chars)" },
                amount: { type: "number", description: "Child amount in CLP (integer)" },
                installments_number: { type: "number", description: "Installments (1 for single payment)" },
              },
              required: ["commerce_code", "buy_order", "amount", "installments_number"],
            },
          },
        },
        required: ["username", "tbk_user", "buy_order", "details"],
      },
    },
    {
      name: "oneclick_capture",
      description: "Capture a previously authorized OneClick Mall charge (deferred-capture flow). One capture per child detail.",
      inputSchema: {
        type: "object",
        properties: {
          commerce_code: { type: "string", description: "Child commerce_code used at authorize" },
          buy_order: { type: "string", description: "Child buy_order used at authorize" },
          authorization_code: { type: "string", description: "Authorization code returned from oneclick_authorize" },
          capture_amount: { type: "number", description: "Amount to capture in CLP (integer)" },
        },
        required: ["commerce_code", "buy_order", "authorization_code", "capture_amount"],
      },
    },
    {
      name: "oneclick_refund",
      description: "Refund a OneClick Mall charge. Parent buy_order identifies the mall transaction; detail_buy_order + commerce_code pinpoint the child to refund.",
      inputSchema: {
        type: "object",
        properties: {
          buy_order: { type: "string", description: "Parent (mall) buy_order" },
          detail_buy_order: { type: "string", description: "Child buy_order to refund" },
          commerce_code: { type: "string", description: "Child commerce_code" },
          amount: { type: "number", description: "Refund amount in CLP (integer)" },
        },
        required: ["buy_order", "detail_buy_order", "commerce_code", "amount"],
      },
    },
    {
      name: "oneclick_status",
      description: "Get the status of a OneClick Mall transaction by parent buy_order.",
      inputSchema: {
        type: "object",
        properties: {
          buy_order: { type: "string", description: "Parent (mall) buy_order" },
        },
        required: ["buy_order"],
      },
    },
    {
      name: "oneclick_get_transaction_by_buy_order",
      description: "Look up a OneClick Mall transaction by parent buy_order. Functionally identical to oneclick_status — provided as an explicit name for agents that follow the 'get by identifier' naming convention.",
      inputSchema: {
        type: "object",
        properties: {
          buy_order: { type: "string", description: "Parent (mall) buy_order" },
        },
        required: ["buy_order"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = args as Record<string, unknown>;

  try {
    switch (name) {
      case "webpay_create_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("POST", "/rswebpaytransaction/api/webpay/v1.2/transactions", args), null, 2) }] };
      case "webpay_commit_transaction": {
        const token = encodeURIComponent(String(a.token));
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("PUT", `/rswebpaytransaction/api/webpay/v1.2/transactions/${token}`), null, 2) }] };
      }
      case "webpay_get_transaction_status": {
        const token = encodeURIComponent(String(a.token));
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("GET", `/rswebpaytransaction/api/webpay/v1.2/transactions/${token}`), null, 2) }] };
      }
      case "webpay_refund_transaction": {
        const token = encodeURIComponent(String(a.token));
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("POST", `/rswebpaytransaction/api/webpay/v1.2/transactions/${token}/refunds`, { amount: a.amount }), null, 2) }] };
      }
      case "webpay_increase_amount": {
        const token = encodeURIComponent(String(a.token));
        const body = {
          buy_order: a.buy_order,
          authorization_code: a.authorization_code,
          capture_amount: a.capture_amount,
        };
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("POST", `/rswebpaytransaction/api/webpay/v1.2/transactions/${token}/capture`, body), null, 2) }] };
      }
      case "webpay_capture_transaction": {
        const token = encodeURIComponent(String(a.token));
        const body = {
          buy_order: a.buy_order,
          authorization_code: a.authorization_code,
          capture_amount: a.capture_amount,
        };
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("PUT", `/rswebpaytransaction/api/webpay/v1.2/transactions/${token}/capture`, body), null, 2) }] };
      }
      case "webpay_mall_create_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("POST", "/rswebpaytransaction/api/webpay/v1.2/transactions", args), null, 2) }] };
      case "webpay_mall_commit_transaction": {
        const token = encodeURIComponent(String(a.token));
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("PUT", `/rswebpaytransaction/api/webpay/v1.2/transactions/${token}`), null, 2) }] };
      }
      case "webpay_mall_get_transaction_status": {
        const token = encodeURIComponent(String(a.token));
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("GET", `/rswebpaytransaction/api/webpay/v1.2/transactions/${token}`), null, 2) }] };
      }
      case "webpay_mall_refund_transaction": {
        const token = encodeURIComponent(String(a.token));
        const body = {
          buy_order: a.buy_order,
          commerce_code: a.commerce_code,
          amount: a.amount,
        };
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("POST", `/rswebpaytransaction/api/webpay/v1.2/transactions/${token}/refunds`, body), null, 2) }] };
      }
      case "webpay_mall_capture_transaction": {
        const token = encodeURIComponent(String(a.token));
        const body = {
          commerce_code: a.commerce_code,
          buy_order: a.buy_order,
          authorization_code: a.authorization_code,
          capture_amount: a.capture_amount,
        };
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("PUT", `/rswebpaytransaction/api/webpay/v1.2/transactions/${token}/capture`, body), null, 2) }] };
      }
      case "oneclick_create_inscription":
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("POST", "/rswebpaytransaction/api/oneclick/mall/v1.2/inscriptions", args), null, 2) }] };
      case "oneclick_finish_inscription": {
        const token = encodeURIComponent(String(a.token));
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("PUT", `/rswebpaytransaction/api/oneclick/mall/v1.2/inscriptions/${token}`), null, 2) }] };
      }
      case "oneclick_delete_inscription":
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("DELETE", "/rswebpaytransaction/api/oneclick/mall/v1.2/inscriptions", { tbk_user: a.tbk_user, username: a.username }), null, 2) }] };
      case "oneclick_authorize":
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("POST", "/rswebpaytransaction/api/oneclick/mall/v1.2/transactions", args), null, 2) }] };
      case "oneclick_capture": {
        const body = {
          commerce_code: a.commerce_code,
          buy_order: a.buy_order,
          authorization_code: a.authorization_code,
          capture_amount: a.capture_amount,
        };
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("PUT", "/rswebpaytransaction/api/oneclick/mall/v1.2/transactions/capture", body), null, 2) }] };
      }
      case "oneclick_refund": {
        const buyOrder = encodeURIComponent(String(a.buy_order));
        const body = {
          detail_buy_order: a.detail_buy_order,
          commerce_code: a.commerce_code,
          amount: a.amount,
        };
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("POST", `/rswebpaytransaction/api/oneclick/mall/v1.2/transactions/${buyOrder}/refunds`, body), null, 2) }] };
      }
      case "oneclick_status":
      case "oneclick_get_transaction_by_buy_order": {
        const buyOrder = encodeURIComponent(String(a.buy_order));
        return { content: [{ type: "text", text: JSON.stringify(await transbankRequest("GET", `/rswebpaytransaction/api/oneclick/mall/v1.2/transactions/${buyOrder}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-transbank", version: "0.2.0-alpha.2" }, { capabilities: { tools: {} } });
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
