#!/usr/bin/env node

/**
 * MCP Server for Bitso — Latin American cryptocurrency exchange.
 *
 * Tools:
 * - get_ticker: Get ticker data for a trading pair
 * - list_orderbook: Get order book for a trading pair
 * - create_order: Create a buy or sell order
 * - get_order: Get order details by ID
 * - cancel_order: Cancel an open order
 * - list_orders: List orders with filters
 * - get_balances: Get account balances
 * - list_trades: List executed trades
 * - list_funding_sources: List available funding sources
 * - create_withdrawal: Create a withdrawal request
 * - list_ledger: List account ledger entries (trades, fees, fundings, withdrawals)
 * - list_open_orders: List currently open orders
 * - lookup_order: Look up an order by origin_id / client_id
 * - cancel_all_orders: Cancel all open orders
 * - list_fundings: List account fundings (deposits)
 * - list_withdrawals: List account withdrawals
 * - get_withdrawal: Retrieve a specific withdrawal by ID
 * - list_fees: List applicable fees for the authenticated user
 * - get_account_status: Retrieve account KYC and verification status
 * - list_funding_destinations: Get funding destination info for a currency
 *
 * Environment:
 *   BITSO_API_KEY — API key from https://bitso.com/
 *   BITSO_API_SECRET — API secret for HMAC signature
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

const API_KEY = process.env.BITSO_API_KEY || "";
const API_SECRET = process.env.BITSO_API_SECRET || "";
const BASE_URL = "https://api.bitso.com/v3";

function generateAuthHeader(method: string, path: string, body?: string): string {
  const nonce = Date.now().toString();
  const payload = nonce + method.toUpperCase() + path + (body || "");
  const signature = crypto.createHmac("sha256", API_SECRET).update(payload).digest("hex");
  return `Bitso ${API_KEY}:${nonce}:${signature}`;
}

async function bitsoRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const bodyStr = body ? JSON.stringify(body) : undefined;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": generateAuthHeader(method, `/v3${path}`, bodyStr),
    },
    body: bodyStr,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Bitso API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-bitso", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_ticker",
      description: "Get ticker data for a trading pair (price, volume, VWAP, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          book: { type: "string", description: "Order book symbol (e.g. btc_mxn, eth_mxn, usdc_mxn)" },
        },
        required: ["book"],
      },
    },
    {
      name: "list_orderbook",
      description: "Get order book (bids and asks) for a trading pair",
      inputSchema: {
        type: "object",
        properties: {
          book: { type: "string", description: "Order book symbol (e.g. btc_mxn)" },
          aggregate: { type: "boolean", description: "Aggregate orders at same price level (default true)" },
        },
        required: ["book"],
      },
    },
    {
      name: "create_order",
      description: "Create a buy or sell order",
      inputSchema: {
        type: "object",
        properties: {
          book: { type: "string", description: "Order book symbol (e.g. btc_mxn)" },
          side: { type: "string", enum: ["buy", "sell"], description: "Order side" },
          type: { type: "string", enum: ["limit", "market"], description: "Order type" },
          major: { type: "string", description: "Amount of major currency (e.g. BTC quantity)" },
          minor: { type: "string", description: "Amount of minor currency (e.g. MXN amount)" },
          price: { type: "string", description: "Limit price (required for limit orders)" },
        },
        required: ["book", "side", "type"],
      },
    },
    {
      name: "get_order",
      description: "Get order details by ID",
      inputSchema: {
        type: "object",
        properties: {
          oid: { type: "string", description: "Order ID" },
        },
        required: ["oid"],
      },
    },
    {
      name: "cancel_order",
      description: "Cancel an open order",
      inputSchema: {
        type: "object",
        properties: {
          oid: { type: "string", description: "Order ID to cancel" },
        },
        required: ["oid"],
      },
    },
    {
      name: "list_orders",
      description: "List orders with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          book: { type: "string", description: "Filter by order book symbol" },
          status: { type: "string", enum: ["open", "partially_filled", "completed", "cancelled"], description: "Filter by status" },
          limit: { type: "number", description: "Number of results (default 25, max 100)" },
          marker: { type: "string", description: "Pagination marker" },
          sort: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
        },
      },
    },
    {
      name: "get_balances",
      description: "Get account balances for all assets",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_trades",
      description: "List executed trades for an order book",
      inputSchema: {
        type: "object",
        properties: {
          book: { type: "string", description: "Order book symbol (e.g. btc_mxn)" },
          limit: { type: "number", description: "Number of results (default 25, max 100)" },
          marker: { type: "string", description: "Pagination marker" },
          sort: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
        },
        required: ["book"],
      },
    },
    {
      name: "list_funding_sources",
      description: "List available funding sources (bank accounts, etc.)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_withdrawal",
      description: "Create a withdrawal request (crypto or fiat)",
      inputSchema: {
        type: "object",
        properties: {
          currency: { type: "string", description: "Currency to withdraw (e.g. btc, eth, mxn)" },
          amount: { type: "string", description: "Amount to withdraw" },
          address: { type: "string", description: "Destination address (for crypto)" },
          destination_tag: { type: "string", description: "Destination tag (for XRP, etc.)" },
          network: { type: "string", description: "Blockchain network" },
        },
        required: ["currency", "amount"],
      },
    },
    {
      name: "list_ledger",
      description: "List account ledger entries (trades, fees, fundings, withdrawals)",
      inputSchema: {
        type: "object",
        properties: {
          operation: { type: "string", enum: ["trade", "fee", "funding", "withdrawal"], description: "Filter by operation type" },
          limit: { type: "number", description: "Number of results (default 25, max 100)" },
          marker: { type: "string", description: "Pagination marker" },
          sort: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
        },
      },
    },
    {
      name: "list_open_orders",
      description: "List currently open orders for the authenticated user",
      inputSchema: {
        type: "object",
        properties: {
          book: { type: "string", description: "Filter by order book symbol (e.g. btc_mxn)" },
          marker: { type: "string", description: "Pagination marker" },
          sort: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
          limit: { type: "number", description: "Number of results (default 25, max 100)" },
        },
      },
    },
    {
      name: "lookup_order",
      description: "Look up one or more orders by origin_id (client_id)",
      inputSchema: {
        type: "object",
        properties: {
          origin_ids: { type: "string", description: "Comma-separated origin_id values (client IDs)" },
        },
        required: ["origin_ids"],
      },
    },
    {
      name: "cancel_all_orders",
      description: "Cancel all open orders for the authenticated user",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_fundings",
      description: "List account fundings (deposits)",
      inputSchema: {
        type: "object",
        properties: {
          fids: { type: "string", description: "Comma-separated funding IDs to filter" },
          status: { type: "string", enum: ["pending", "complete", "cancelled"], description: "Filter by status" },
          method: { type: "string", description: "Funding method (e.g. spei, bitcoin)" },
          limit: { type: "number", description: "Number of results (default 25, max 100)" },
          marker: { type: "string", description: "Pagination marker" },
          sort: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
        },
      },
    },
    {
      name: "list_withdrawals",
      description: "List account withdrawals",
      inputSchema: {
        type: "object",
        properties: {
          wids: { type: "string", description: "Comma-separated withdrawal IDs to filter" },
          status: { type: "string", enum: ["pending", "processing", "complete", "failed"], description: "Filter by status" },
          method: { type: "string", description: "Withdrawal method (e.g. spei, bitcoin)" },
          limit: { type: "number", description: "Number of results (default 25, max 100)" },
          marker: { type: "string", description: "Pagination marker" },
          sort: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
        },
      },
    },
    {
      name: "get_withdrawal",
      description: "Retrieve a specific withdrawal by its ID",
      inputSchema: {
        type: "object",
        properties: {
          wid: { type: "string", description: "Withdrawal ID" },
        },
        required: ["wid"],
      },
    },
    {
      name: "list_fees",
      description: "List applicable fees for the authenticated user across trading pairs",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_account_status",
      description: "Retrieve account KYC and verification status (tier, limits, required docs)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_funding_destinations",
      description: "Get funding destination details (address/CLABE) for a given currency",
      inputSchema: {
        type: "object",
        properties: {
          fund_currency: { type: "string", description: "Currency code (e.g. btc, mxn, ars)" },
        },
        required: ["fund_currency"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_ticker":
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", `/ticker?book=${args?.book}`), null, 2) }] };
      case "list_orderbook": {
        const params = new URLSearchParams();
        params.set("book", String(args?.book));
        if (args?.aggregate !== undefined) params.set("aggregate", String(args.aggregate));
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", `/order_book?${params}`), null, 2) }] };
      }
      case "create_order":
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("POST", "/orders", args), null, 2) }] };
      case "get_order":
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", `/orders/${args?.oid}`), null, 2) }] };
      case "cancel_order":
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("DELETE", `/orders/${args?.oid}`), null, 2) }] };
      case "list_orders": {
        const params = new URLSearchParams();
        if (args?.book) params.set("book", String(args.book));
        if (args?.status) params.set("status", String(args.status));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.marker) params.set("marker", String(args.marker));
        if (args?.sort) params.set("sort", String(args.sort));
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", `/open_orders?${params}`), null, 2) }] };
      }
      case "get_balances":
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", "/balance"), null, 2) }] };
      case "list_trades": {
        const params = new URLSearchParams();
        params.set("book", String(args?.book));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.marker) params.set("marker", String(args.marker));
        if (args?.sort) params.set("sort", String(args.sort));
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", `/user_trades?${params}`), null, 2) }] };
      }
      case "list_funding_sources":
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", "/funding_destination"), null, 2) }] };
      case "create_withdrawal":
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("POST", "/withdrawals", args), null, 2) }] };
      case "list_ledger": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.marker) params.set("marker", String(args.marker));
        if (args?.sort) params.set("sort", String(args.sort));
        const op = args?.operation ? `/${args.operation}s` : "";
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", `/ledger${op}${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "list_open_orders": {
        const params = new URLSearchParams();
        if (args?.book) params.set("book", String(args.book));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.marker) params.set("marker", String(args.marker));
        if (args?.sort) params.set("sort", String(args.sort));
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", `/open_orders${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "lookup_order":
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", `/orders/${args?.origin_ids}`), null, 2) }] };
      case "cancel_all_orders":
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("DELETE", "/orders/all"), null, 2) }] };
      case "list_fundings": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.method) params.set("method", String(args.method));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.marker) params.set("marker", String(args.marker));
        if (args?.sort) params.set("sort", String(args.sort));
        const suffix = args?.fids ? `/${args.fids}` : "";
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", `/fundings${suffix}${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "list_withdrawals": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.method) params.set("method", String(args.method));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.marker) params.set("marker", String(args.marker));
        if (args?.sort) params.set("sort", String(args.sort));
        const suffix = args?.wids ? `/${args.wids}` : "";
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", `/withdrawals${suffix}${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "get_withdrawal":
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", `/withdrawals/${args?.wid}`), null, 2) }] };
      case "list_fees":
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", "/fees"), null, 2) }] };
      case "get_account_status":
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", "/account_status"), null, 2) }] };
      case "list_funding_destinations": {
        const params = new URLSearchParams();
        params.set("fund_currency", String(args?.fund_currency));
        return { content: [{ type: "text", text: JSON.stringify(await bitsoRequest("GET", `/funding_destination?${params}`), null, 2) }] };
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
    app.get("/health", (_req: any, res: any) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: any, res: any) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req, res, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-bitso", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
