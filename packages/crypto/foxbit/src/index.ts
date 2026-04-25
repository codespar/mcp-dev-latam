#!/usr/bin/env node

/**
 * MCP Server for Foxbit — Brazilian cryptocurrency exchange.
 *
 * Tools:
 * Public market data:
 * - list_markets, list_currencies, get_currency, list_pairs
 * - get_ticker, get_orderbook, get_market_trades, get_candles
 * Account & balances:
 * - get_account_balances, get_balance
 * Orders & trades:
 * - create_order, get_order, list_orders, cancel_order, list_trades
 * Pix (BR instant payments):
 * - create_pix_deposit, list_pix_deposits, create_pix_withdrawal, list_pix_withdrawals
 * Crypto withdrawals & transactions:
 * - create_crypto_withdrawal, list_deposits_withdrawals
 * Fees:
 * - get_trading_fees
 *
 * Environment:
 *   FOXBIT_API_KEY — API key from https://app.foxbit.com.br/
 *   FOXBIT_API_SECRET — API secret for HMAC-SHA256 signature
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

const API_KEY = process.env.FOXBIT_API_KEY || "";
const API_SECRET = process.env.FOXBIT_API_SECRET || "";
const BASE_URL = "https://api.foxbit.com.br";
const PATH_PREFIX = "/rest/v3";

async function foxbitRequest(
  method: string,
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
  body?: unknown,
): Promise<unknown> {
  const timestamp = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : "";

  const params = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    }
  }
  const queryString = params.toString();
  const fullPath = `${PATH_PREFIX}${path}`;

  const prehash = timestamp + method.toUpperCase() + fullPath + queryString + bodyStr;
  const signature = crypto.createHmac("sha256", API_SECRET).update(prehash).digest("hex");

  const url = `${BASE_URL}${fullPath}${queryString ? `?${queryString}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-FB-ACCESS-KEY": API_KEY,
      "X-FB-ACCESS-TIMESTAMP": timestamp,
      "X-FB-ACCESS-SIGNATURE": signature,
    },
    body: bodyStr || undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Foxbit API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-foxbit", version: "0.2.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_markets",
      description: "List all available trading pairs / markets on Foxbit",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_currencies",
      description: "List all supported currencies (crypto and fiat) on Foxbit",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_currency",
      description: "Get details of a specific currency (precision, min/max amounts, type)",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Currency symbol (e.g. btc, brl, eth)" },
        },
        required: ["symbol"],
      },
    },
    {
      name: "get_ticker",
      description: "Get 24h ticker data for a market (price, volume, high/low)",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Market symbol (e.g. btcbrl, ethbrl, ltcbrl)" },
        },
        required: ["symbol"],
      },
    },
    {
      name: "get_orderbook",
      description: "Get order book (bids and asks) for a market",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Market symbol (e.g. btcbrl)" },
          depth: { type: "number", description: "Number of price levels per side" },
        },
        required: ["symbol"],
      },
    },
    {
      name: "get_market_trades",
      description: "Get recent public trades for a market (trade history / tape)",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Market symbol (e.g. btcbrl)" },
          page_size: { type: "number", description: "Results per page (max 100)" },
          page: { type: "number", description: "Page number" },
        },
        required: ["symbol"],
      },
    },
    {
      name: "get_candles",
      description: "Get OHLC candlestick data for a market",
      inputSchema: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Market symbol (e.g. btcbrl)" },
          interval: { type: "string", enum: ["1m", "5m", "15m", "30m", "1h", "4h", "12h", "1d", "1w"], description: "Candle interval" },
          start_time: { type: "string", description: "Start time (ISO 8601)" },
          end_time: { type: "string", description: "End time (ISO 8601)" },
          limit: { type: "number", description: "Max number of candles to return" },
        },
        required: ["symbol", "interval"],
      },
    },
    {
      name: "get_account_balances",
      description: "Get account balances for all currencies",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_balance",
      description: "Get account balance for a single currency",
      inputSchema: {
        type: "object",
        properties: {
          currency_symbol: { type: "string", description: "Currency symbol (e.g. brl, btc, eth)" },
        },
        required: ["currency_symbol"],
      },
    },
    {
      name: "create_order",
      description: "Create a buy or sell order (limit or market)",
      inputSchema: {
        type: "object",
        properties: {
          market_symbol: { type: "string", description: "Market symbol (e.g. btcbrl)" },
          side: { type: "string", enum: ["BUY", "SELL"], description: "Order side" },
          type: { type: "string", enum: ["LIMIT", "MARKET", "STOP_LIMIT", "STOP_MARKET"], description: "Order type" },
          quantity: { type: "string", description: "Base asset quantity (e.g. BTC)" },
          price: { type: "string", description: "Limit price (required for LIMIT orders)" },
          client_order_id: { type: "string", description: "Client-supplied order ID" },
          time_in_force: { type: "string", enum: ["GTC", "IOC", "FOK"], description: "Time in force" },
        },
        required: ["market_symbol", "side", "type", "quantity"],
      },
    },
    {
      name: "get_order",
      description: "Get order details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Order ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_orders",
      description: "List orders with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          market_symbol: { type: "string", description: "Filter by market symbol" },
          state: { type: "string", enum: ["ACTIVE", "FILLED", "CANCELED", "PARTIALLY_FILLED", "PARTIALLY_CANCELED"], description: "Filter by order state" },
          side: { type: "string", enum: ["BUY", "SELL"], description: "Filter by side" },
          start_time: { type: "string", description: "Start time (ISO 8601)" },
          end_time: { type: "string", description: "End time (ISO 8601)" },
          page_size: { type: "number", description: "Results per page" },
          page: { type: "number", description: "Page number" },
        },
      },
    },
    {
      name: "cancel_order",
      description: "Cancel an open order by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Order ID to cancel" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_trades",
      description: "List user's executed trades (private trade history)",
      inputSchema: {
        type: "object",
        properties: {
          market_symbol: { type: "string", description: "Filter by market symbol" },
          start_time: { type: "string", description: "Start time (ISO 8601)" },
          end_time: { type: "string", description: "End time (ISO 8601)" },
          page_size: { type: "number", description: "Results per page" },
          page: { type: "number", description: "Page number" },
        },
      },
    },
    {
      name: "list_deposits_withdrawals",
      description: "List deposits and withdrawals (transactions) for a currency",
      inputSchema: {
        type: "object",
        properties: {
          currency_symbol: { type: "string", description: "Currency symbol (e.g. brl, btc, eth)" },
          type: { type: "string", enum: ["deposit", "withdraw"], description: "Filter by transaction type" },
          start_time: { type: "string", description: "Start time (ISO 8601)" },
          end_time: { type: "string", description: "End time (ISO 8601)" },
          page_size: { type: "number", description: "Results per page" },
          page: { type: "number", description: "Page number" },
        },
        required: ["currency_symbol"],
      },
    },
    {
      name: "create_pix_deposit",
      description: "Create a Pix instant deposit (BRL). Returns Pix QR code / copy-paste payload.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Deposit amount in BRL (e.g. \"100.00\")" },
        },
        required: ["amount"],
      },
    },
    {
      name: "list_pix_deposits",
      description: "List Pix deposit history (BRL instant deposits)",
      inputSchema: {
        type: "object",
        properties: {
          start_time: { type: "string", description: "Start time (ISO 8601)" },
          end_time: { type: "string", description: "End time (ISO 8601)" },
          page_size: { type: "number", description: "Results per page" },
          page: { type: "number", description: "Page number" },
        },
      },
    },
    {
      name: "create_pix_withdrawal",
      description: "Create a Pix withdrawal (BRL) to a Pix key",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Withdrawal amount in BRL (e.g. \"100.00\")" },
          pix_key: { type: "string", description: "Destination Pix key (CPF, CNPJ, email, phone, or random key)" },
          pix_key_type: { type: "string", enum: ["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"], description: "Pix key type" },
        },
        required: ["amount", "pix_key", "pix_key_type"],
      },
    },
    {
      name: "list_pix_withdrawals",
      description: "List Pix withdrawal history (BRL fiat withdrawals)",
      inputSchema: {
        type: "object",
        properties: {
          start_time: { type: "string", description: "Start time (ISO 8601)" },
          end_time: { type: "string", description: "End time (ISO 8601)" },
          page_size: { type: "number", description: "Results per page" },
          page: { type: "number", description: "Page number" },
        },
      },
    },
    {
      name: "create_crypto_withdrawal",
      description: "Create a crypto withdrawal to an external wallet address",
      inputSchema: {
        type: "object",
        properties: {
          currency_symbol: { type: "string", description: "Currency symbol (e.g. btc, eth, usdt)" },
          amount: { type: "string", description: "Withdrawal amount in base units" },
          address: { type: "string", description: "Destination wallet address" },
          network: { type: "string", description: "Blockchain network (e.g. BTC, ERC20, TRC20, POLYGON)" },
          tag: { type: "string", description: "Memo / tag / destination tag (for XRP, XLM, etc.)" },
        },
        required: ["currency_symbol", "amount", "address"],
      },
    },
    {
      name: "get_trading_fees",
      description: "Get current trading fees and limits (maker/taker per pair, withdrawal limits)",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_markets":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", "/markets"), null, 2) }] };
      case "list_currencies":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", "/currencies"), null, 2) }] };
      case "get_currency":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", `/currencies/${args?.symbol}`), null, 2) }] };
      case "get_ticker":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", `/markets/${args?.symbol}/ticker/24hr`), null, 2) }] };
      case "get_orderbook":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", `/markets/${args?.symbol}/orderbook`, { depth: args?.depth as number | undefined }), null, 2) }] };
      case "get_market_trades": {
        const { symbol, ...rest } = (args || {}) as Record<string, string | number | undefined>;
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", `/markets/${symbol}/trades`, rest), null, 2) }] };
      }
      case "get_candles": {
        const { symbol, ...rest } = (args || {}) as Record<string, string | number | undefined>;
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", `/markets/${symbol}/candlesticks`, rest), null, 2) }] };
      }
      case "get_account_balances":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", "/accounts"), null, 2) }] };
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", `/accounts/${args?.currency_symbol}`), null, 2) }] };
      case "create_order":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("POST", "/orders", undefined, args), null, 2) }] };
      case "get_order":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", `/orders/${args?.id}`), null, 2) }] };
      case "list_orders":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", "/orders", args as Record<string, string | number | undefined>), null, 2) }] };
      case "cancel_order":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("DELETE", `/orders/${args?.id}`), null, 2) }] };
      case "list_trades":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", "/trades", args as Record<string, string | number | undefined>), null, 2) }] };
      case "list_deposits_withdrawals": {
        const { currency_symbol, ...rest } = (args || {}) as Record<string, string | number | undefined>;
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", `/accounts/${currency_symbol}/transactions`, rest), null, 2) }] };
      }
      case "create_pix_deposit":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("POST", "/accounts/brl/pix/deposits", undefined, args), null, 2) }] };
      case "list_pix_deposits":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", "/accounts/brl/pix/deposits", args as Record<string, string | number | undefined>), null, 2) }] };
      case "create_pix_withdrawal":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("POST", "/accounts/brl/pix/withdrawals", undefined, args), null, 2) }] };
      case "list_pix_withdrawals":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", "/accounts/brl/pix/withdrawals", args as Record<string, string | number | undefined>), null, 2) }] };
      case "create_crypto_withdrawal": {
        const { currency_symbol, ...rest } = (args || {}) as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("POST", `/accounts/${currency_symbol}/withdrawals`, undefined, rest), null, 2) }] };
      }
      case "get_trading_fees":
        return { content: [{ type: "text", text: JSON.stringify(await foxbitRequest("GET", "/system/fees-and-limits"), null, 2) }] };
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
        const s = new Server({ name: "mcp-foxbit", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
