#!/usr/bin/env node

/**
 * MCP Server for MoonPay — fiat-to-crypto on/off-ramp.
 *
 * MoonPay spans 100+ crypto assets and many geographies, with both buy
 * (fiat -> crypto) and sell (crypto -> fiat) flows. For LatAm, Pix is
 * supported as a BR onramp rail. Complementary to UnblockPay (BRL/MXN
 * <-> USDC) in the catalog: MoonPay is the broader-coverage, longer-tail
 * option for agents paying out in crypto or end users buying crypto with
 * local currency.
 *
 * Tools (10):
 *   get_buy_quote            — preview a fiat -> crypto exchange before committing
 *   create_buy_transaction   — create a buy transaction (fiat -> crypto)
 *   get_buy_transaction      — retrieve a buy transaction by id
 *   list_buy_transactions    — list buy transactions with filters
 *   get_sell_quote           — preview a crypto -> fiat exchange
 *   create_sell_transaction  — create a sell transaction (crypto -> fiat)
 *   get_sell_transaction     — retrieve a sell transaction by id
 *   create_customer          — create a KYC'd end user
 *   get_customer             — retrieve a customer by id
 *   list_currencies          — list supported fiat + crypto assets (dynamic discovery)
 *
 * Authentication
 *   Every request carries:
 *     Authorization: Api-Key <API_KEY>
 *   Sandbox vs production is selected by which key you pass; the base URL is the same.
 *
 * Environment
 *   MOONPAY_API_KEY   — API key (required, secret)
 *   MOONPAY_BASE_URL  — optional; defaults to https://api.moonpay.com
 *
 * Docs: https://dev.moonpay.com
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.MOONPAY_API_KEY || "";
const BASE_URL = process.env.MOONPAY_BASE_URL || "https://api.moonpay.com";

async function moonpayRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Api-Key ${API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MoonPay API ${res.status}: ${err}`);
  }
  // Some endpoints (e.g. 204 No Content) may not return JSON.
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function qs(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  const search = new URLSearchParams();
  for (const [k, v] of entries) search.set(k, String(v));
  return `?${search.toString()}`;
}

const server = new Server(
  { name: "mcp-moonpay", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_buy_quote",
      description: "Preview a fiat -> crypto buy quote in real time. Use this before create_buy_transaction to show the end user the exact crypto amount, fees, and effective rate.",
      inputSchema: {
        type: "object",
        properties: {
          currencyCode: { type: "string", description: "Crypto currency code you want to buy (e.g. btc, eth, usdc, sol). Must be a code returned by list_currencies." },
          baseCurrencyCode: { type: "string", description: "Fiat currency you are paying with (e.g. usd, eur, brl, mxn)" },
          baseCurrencyAmount: { type: "number", description: "Amount in fiat to spend (major units). Either this or quoteCurrencyAmount must be supplied." },
          quoteCurrencyAmount: { type: "number", description: "Amount of crypto to receive (major units). Either this or baseCurrencyAmount must be supplied." },
          paymentMethod: { type: "string", description: "Optional payment method hint (e.g. credit_debit_card, sepa_bank_transfer, pix)" },
          areFeesIncluded: { type: "boolean", description: "If true, baseCurrencyAmount includes MoonPay fees." },
        },
        required: ["currencyCode", "baseCurrencyCode"],
      },
    },
    {
      name: "create_buy_transaction",
      description: "Create a buy transaction (fiat -> crypto). The returned object contains status plus — depending on method — redirect URL for hosted checkout, Pix QR data, or card auth next steps.",
      inputSchema: {
        type: "object",
        properties: {
          baseCurrencyAmount: { type: "number", description: "Fiat amount to charge (major units)" },
          baseCurrencyCode: { type: "string", description: "Fiat currency code (e.g. brl, usd)" },
          currencyCode: { type: "string", description: "Crypto currency code to receive (e.g. btc, usdc)" },
          walletAddress: { type: "string", description: "Destination crypto wallet address" },
          walletAddressTag: { type: "string", description: "Destination tag / memo (for chains that require it, e.g. XRP, XLM)" },
          customerId: { type: "string", description: "Existing MoonPay customer id (use create_customer first)" },
          externalCustomerId: { type: "string", description: "Your internal user id, propagated to MoonPay for reconciliation" },
          externalTransactionId: { type: "string", description: "Your internal transaction reference" },
          paymentMethod: { type: "string", description: "Payment method (e.g. credit_debit_card, sepa_bank_transfer, pix)" },
          returnUrl: { type: "string", description: "Browser redirect after hosted flow completes" },
          extraFields: { type: "object", description: "Additional provider-specific fields passed through as-is" },
        },
        required: ["baseCurrencyAmount", "baseCurrencyCode", "currencyCode", "walletAddress"],
      },
    },
    {
      name: "get_buy_transaction",
      description: "Retrieve a buy transaction (fiat -> crypto) by its MoonPay id. Returns current status and settlement detail.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "MoonPay transaction id" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_buy_transactions",
      description: "List buy transactions with optional filters. Used for reconciliation and agent-driven monitoring.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "Filter to a single MoonPay customer id" },
          externalCustomerId: { type: "string", description: "Filter to your internal user id" },
          status: { type: "string", description: "Filter by transaction status (e.g. pending, completed, failed)" },
          limit: { type: "number", description: "Max results to return" },
        },
      },
    },
    {
      name: "get_sell_quote",
      description: "Preview a crypto -> fiat sell quote in real time. Use this before create_sell_transaction to show the end user the exact fiat amount, fees, and effective rate.",
      inputSchema: {
        type: "object",
        properties: {
          currencyCode: { type: "string", description: "Crypto currency code you want to sell (e.g. btc, usdc)" },
          quoteCurrencyCode: { type: "string", description: "Fiat currency to receive (e.g. usd, eur, brl)" },
          baseCurrencyAmount: { type: "number", description: "Crypto amount to sell (major units). Either this or quoteCurrencyAmount must be supplied." },
          quoteCurrencyAmount: { type: "number", description: "Fiat amount to receive (major units). Either this or baseCurrencyAmount must be supplied." },
          payoutMethod: { type: "string", description: "Optional payout method hint (e.g. sepa_bank_transfer, credit_debit_card, pix)" },
        },
        required: ["currencyCode", "quoteCurrencyCode"],
      },
    },
    {
      name: "create_sell_transaction",
      description: "Create a sell transaction (crypto -> fiat). Used for agents that need to pay out in local fiat after receiving crypto.",
      inputSchema: {
        type: "object",
        properties: {
          baseCurrencyAmount: { type: "number", description: "Crypto amount to sell (major units)" },
          baseCurrencyCode: { type: "string", description: "Crypto currency code (e.g. btc, usdc)" },
          quoteCurrencyCode: { type: "string", description: "Fiat currency to receive (e.g. usd, brl)" },
          customerId: { type: "string", description: "MoonPay customer id receiving the fiat payout" },
          externalCustomerId: { type: "string", description: "Your internal user id" },
          externalTransactionId: { type: "string", description: "Your internal transaction reference" },
          payoutMethod: { type: "string", description: "Fiat payout method (e.g. sepa_bank_transfer, pix)" },
          bankAccount: { type: "object", description: "Destination bank account detail (country-specific fields)" },
          returnUrl: { type: "string", description: "Browser redirect after hosted flow completes" },
          extraFields: { type: "object", description: "Additional provider-specific fields passed through as-is" },
        },
        required: ["baseCurrencyAmount", "baseCurrencyCode", "quoteCurrencyCode"],
      },
    },
    {
      name: "get_sell_transaction",
      description: "Retrieve a sell transaction (crypto -> fiat) by its MoonPay id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "MoonPay sell transaction id" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_customer",
      description: "Create a MoonPay customer (KYC'd end user). Required before creating transactions that must be tied to an identified individual.",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Customer email (used for MoonPay communications + KYC)" },
          firstName: { type: "string", description: "Legal first name" },
          lastName: { type: "string", description: "Legal last name" },
          dateOfBirth: { type: "string", description: "ISO date (YYYY-MM-DD)" },
          externalCustomerId: { type: "string", description: "Your internal user id for correlation" },
          address: {
            type: "object",
            description: "Residential address object",
            properties: {
              country: { type: "string", description: "ISO-3166 alpha-2 country code (e.g. BR, US, MX)" },
              state: { type: "string", description: "State / region code" },
              town: { type: "string", description: "City" },
              postCode: { type: "string", description: "Postal / ZIP code" },
              street: { type: "string", description: "Street address" },
              subStreet: { type: "string", description: "Unit / apt / complement" },
            },
          },
        },
        required: ["email"],
      },
    },
    {
      name: "get_customer",
      description: "Retrieve a MoonPay customer by id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "MoonPay customer id" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_currencies",
      description: "List supported currencies (fiat + crypto). Essential for agents: use this to discover currency codes dynamically rather than hard-coding, and to check which assets/fiats are currently enabled.",
      inputSchema: {
        type: "object",
        properties: {
          show: { type: "string", enum: ["enabled", "all"], description: "Filter to enabled currencies only, or return everything. Defaults to enabled on the API side." },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "get_buy_quote": {
        const code = encodeURIComponent(String(a.currencyCode ?? ""));
        const query = qs({
          baseCurrencyCode: a.baseCurrencyCode,
          baseCurrencyAmount: a.baseCurrencyAmount,
          quoteCurrencyAmount: a.quoteCurrencyAmount,
          paymentMethod: a.paymentMethod,
          areFeesIncluded: a.areFeesIncluded,
        });
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v3/currencies/${code}/buy_quote${query}`), null, 2) }] };
      }
      case "create_buy_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("POST", "/v3/transactions", a), null, 2) }] };
      case "get_buy_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v1/transactions/${encodeURIComponent(String(a.id ?? ""))}`), null, 2) }] };
      case "list_buy_transactions": {
        const query = qs({
          customerId: a.customerId,
          externalCustomerId: a.externalCustomerId,
          status: a.status,
          limit: a.limit,
        });
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v1/transactions${query}`), null, 2) }] };
      }
      case "get_sell_quote": {
        const code = encodeURIComponent(String(a.currencyCode ?? ""));
        const query = qs({
          quoteCurrencyCode: a.quoteCurrencyCode,
          baseCurrencyAmount: a.baseCurrencyAmount,
          quoteCurrencyAmount: a.quoteCurrencyAmount,
          payoutMethod: a.payoutMethod,
        });
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v3/currencies/${code}/sell_quote${query}`), null, 2) }] };
      }
      case "create_sell_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("POST", "/v3/sell_transactions", a), null, 2) }] };
      case "get_sell_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v3/sell_transactions/${encodeURIComponent(String(a.id ?? ""))}`), null, 2) }] };
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("POST", "/v1/customers", a), null, 2) }] };
      case "get_customer":
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v1/customers/${encodeURIComponent(String(a.id ?? ""))}`), null, 2) }] };
      case "list_currencies": {
        const query = qs({ show: a.show });
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v3/currencies${query}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-moonpay", version: "0.1.0" }, { capabilities: { tools: {} } });
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
