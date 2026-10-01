#!/usr/bin/env node

/**
 * MCP Server for Coinbase Advanced Trade — global crypto exchange.
 *
 * Tools:
 * Accounts & portfolios:
 * - list_accounts, get_account, list_portfolios
 * Market data:
 * - list_products, get_product, get_best_bid_ask, get_market_trades
 * Orders & fills:
 * - create_order, list_orders, get_order, cancel_orders, list_fills
 * Reporting:
 * - get_transaction_summary
 *
 * Authentication: legacy HMAC API keys (CB-ACCESS-KEY / CB-ACCESS-SIGN /
 * CB-ACCESS-TIMESTAMP). Coinbase Cloud / CDP keys (JWT-ECDSA) are NOT
 * supported by this package — mint legacy HMAC keys from
 * https://www.coinbase.com/settings/api.
 *
 * Environment:
 *   COINBASE_ACCESS_KEY — legacy HMAC API key
 *   COINBASE_API_SECRET — API secret for HMAC-SHA256 signature
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as crypto from "node:crypto";

const ACCESS_KEY = process.env.COINBASE_ACCESS_KEY || "";
const API_SECRET = process.env.COINBASE_API_SECRET || "";
const BASE_URL = "https://api.coinbase.com";

async function coinbaseRequest(
  method: string,
  path: string,
  query?: Record<string, string | number | boolean | string[] | undefined>,
  body?: unknown,
): Promise<unknown> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyStr = body ? JSON.stringify(body) : "";

  const params = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v)) {
        for (const item of v) params.append(k, String(item));
      } else {
        params.set(k, String(v));
      }
    }
  }
  const queryString = params.toString();
  const pathWithQuery = queryString ? `${path}?${queryString}` : path;

  const upperMethod = method.toUpperCase();
  const prehash = timestamp + upperMethod + pathWithQuery + bodyStr;
  const signature = crypto.createHmac("sha256", API_SECRET).update(prehash).digest("hex");

  const url = `${BASE_URL}${pathWithQuery}`;
  const res = await fetch(url, {
    method: upperMethod,
    headers: {
      "Content-Type": "application/json",
      "CB-ACCESS-KEY": ACCESS_KEY,
      "CB-ACCESS-TIMESTAMP": timestamp,
      "CB-ACCESS-SIGN": signature,
    },
    body: bodyStr || undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Coinbase API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-coinbase", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_accounts",
      description: "List the authenticated user's accounts (one per asset — BTC, ETH, USDC, etc.) with available + held balances. Use this before placing orders to confirm funding.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "Page size, max 250", default: 49 },
          cursor: { type: "string", description: "Pagination cursor from a previous response" },
        },
      },
    },
    {
      name: "get_account",
      description: "Get a specific account by UUID. Returns currency, available_balance, hold, ready, and parent portfolio info.",
      inputSchema: {
        type: "object",
        required: ["account_uuid"],
        properties: {
          account_uuid: { type: "string", description: "Account UUID returned by list_accounts" },
        },
      },
    },
    {
      name: "list_products",
      description: "List all tradable products (e.g. BTC-USD, ETH-USD, USDC-BRL). Filter by product type if you only need spot or perpetuals.",
      inputSchema: {
        type: "object",
        properties: {
          product_type: { type: "string", enum: ["SPOT", "FUTURE"] },
          limit: { type: "integer", default: 250 },
        },
      },
    },
    {
      name: "get_product",
      description: "Get a single product's metadata — base + quote increments, min order size, status (online / offline / maintenance).",
      inputSchema: {
        type: "object",
        required: ["product_id"],
        properties: {
          product_id: { type: "string", description: "e.g. BTC-USD, ETH-USD, USDC-BRL" },
        },
      },
    },
    {
      name: "get_best_bid_ask",
      description: "Get top-of-book bid + ask + size for a product. Use this to peek price before placing a market order.",
      inputSchema: {
        type: "object",
        properties: {
          product_ids: {
            type: "array",
            items: { type: "string" },
            description: "Up to 10 product_ids; omit to fetch all",
          },
        },
      },
    },
    {
      name: "get_market_trades",
      description: "Get recent trades (last N executions) for a product — handy for slippage estimation before placing a market order.",
      inputSchema: {
        type: "object",
        required: ["product_id"],
        properties: {
          product_id: { type: "string" },
          limit: { type: "integer", default: 100, description: "Max trades to return" },
        },
      },
    },
    {
      name: "create_order",
      description: "Place a market or limit order. Provide either market_market_ioc (market) or limit_limit_gtc / limit_limit_gtd (limit) inside order_configuration. Returns the order_id and initial status.",
      inputSchema: {
        type: "object",
        required: ["client_order_id", "product_id", "side", "order_configuration"],
        properties: {
          client_order_id: { type: "string", description: "Idempotency key — UUID v4 supplied by caller" },
          product_id: { type: "string", description: "e.g. BTC-USD" },
          side: { type: "string", enum: ["BUY", "SELL"] },
          order_configuration: {
            type: "object",
            description: "One of: market_market_ioc, limit_limit_gtc, limit_limit_gtd, stop_limit_stop_limit_gtc, stop_limit_stop_limit_gtd",
          },
        },
      },
    },
    {
      name: "list_orders",
      description: "List historical orders for the authenticated user. Filter by product_id, order_status, time range. Cursor-paginated.",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          order_status: {
            type: "array",
            items: { type: "string", enum: ["OPEN", "FILLED", "CANCELLED", "EXPIRED", "FAILED"] },
          },
          start_date: { type: "string", description: "ISO 8601 timestamp" },
          end_date: { type: "string", description: "ISO 8601 timestamp" },
          limit: { type: "integer", default: 100 },
          cursor: { type: "string" },
        },
      },
    },
    {
      name: "get_order",
      description: "Get a single order by order_id — returns full status, fills array, executed_value, average_filled_price.",
      inputSchema: {
        type: "object",
        required: ["order_id"],
        properties: {
          order_id: { type: "string", description: "order_id returned by create_order or list_orders" },
        },
      },
    },
    {
      name: "cancel_orders",
      description: "Cancel one or more open orders by order_id. Returns per-order success/failure.",
      inputSchema: {
        type: "object",
        required: ["order_ids"],
        properties: {
          order_ids: {
            type: "array",
            items: { type: "string" },
            description: "Up to 100 order_ids per call",
          },
        },
      },
    },
    {
      name: "list_fills",
      description: "List individual fills (executions) across orders — useful for fee accounting + reconciliation. Filter by product_id + time range.",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          order_id: { type: "string" },
          start_sequence_timestamp: { type: "string" },
          end_sequence_timestamp: { type: "string" },
          limit: { type: "integer", default: 250 },
          cursor: { type: "string" },
        },
      },
    },
    {
      name: "get_transaction_summary",
      description: "Get the user's 30-day trading volume + fee tier. Drives variable maker/taker fee math.",
      inputSchema: {
        type: "object",
        properties: {
          product_type: { type: "string", enum: ["SPOT", "FUTURE"], default: "SPOT" },
        },
      },
    },
    {
      name: "list_portfolios",
      description: "List portfolios under the authenticated user — segregates fund pools (e.g. one per fund or strategy).",
      inputSchema: {
        type: "object",
        properties: {
          portfolio_type: { type: "string", enum: ["DEFAULT", "CONSUMER", "INTX"] },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_accounts":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", "/api/v3/brokerage/accounts", args as Record<string, string | number | undefined>), null, 2) }] };
      case "get_account":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", `/api/v3/brokerage/accounts/${args?.account_uuid}`), null, 2) }] };
      case "list_products":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", "/api/v3/brokerage/products", args as Record<string, string | number | undefined>), null, 2) }] };
      case "get_product":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", `/api/v3/brokerage/products/${args?.product_id}`), null, 2) }] };
      case "get_best_bid_ask":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", "/api/v3/brokerage/best_bid_ask", args as Record<string, string[] | undefined>), null, 2) }] };
      case "get_market_trades": {
        const { product_id, ...rest } = (args || {}) as Record<string, string | number | undefined>;
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", `/api/v3/brokerage/products/${product_id}/ticker`, rest), null, 2) }] };
      }
      case "create_order":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("POST", "/api/v3/brokerage/orders", undefined, args), null, 2) }] };
      case "list_orders":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", "/api/v3/brokerage/orders/historical/batch", args as Record<string, string | number | string[] | undefined>), null, 2) }] };
      case "get_order":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", `/api/v3/brokerage/orders/historical/${args?.order_id}`), null, 2) }] };
      case "cancel_orders":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("POST", "/api/v3/brokerage/orders/batch_cancel", undefined, args), null, 2) }] };
      case "list_fills":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", "/api/v3/brokerage/orders/historical/fills", args as Record<string, string | number | undefined>), null, 2) }] };
      case "get_transaction_summary":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", "/api/v3/brokerage/transaction_summary", args as Record<string, string | undefined>), null, 2) }] };
      case "list_portfolios":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", "/api/v3/brokerage/portfolios", args as Record<string, string | undefined>), null, 2) }] };
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
    app.get("/health", (_req: any, res: any) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: any, res: any) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req, res, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-coinbase", version: "0.1.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
