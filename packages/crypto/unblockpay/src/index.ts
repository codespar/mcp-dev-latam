#!/usr/bin/env node

/**
 * MCP Server for UnblockPay — fiat-to-stablecoin onramp/offramp platform.
 *
 * Tools:
 * - create_wallet: Create a new wallet
 * - get_wallet: Get wallet details by ID
 * - list_wallets: List all wallets
 * - create_onramp: Create a fiat-to-stablecoin onramp transaction
 * - create_offramp: Create a stablecoin-to-fiat offramp transaction
 * - get_transaction: Get transaction details by ID
 * - list_transactions: List transactions with filters
 * - get_exchange_rate: Get current exchange rate for a currency pair
 * - create_transfer: Create a stablecoin transfer between wallets
 * - get_balance: Get wallet balance
 * - submit_corporate_kyc: Submit corporate KYC application
 * - get_corporate_kyc_status: Get corporate KYC status by application ID
 * - submit_individual_kyc: Submit individual KYC application
 * - get_individual_kyc_status: Get individual KYC status by application ID
 * - add_bank_account: Register a fiat bank account for offramps
 * - list_bank_accounts: List registered bank accounts
 * - delete_bank_account: Delete a registered bank account
 * - simulate_swap_quote: Simulate a fiat<->crypto swap quote (no execution)
 * - list_supported_assets: List supported crypto assets / stablecoins
 * - register_webhook: Register a webhook endpoint for transaction events
 *
 * Environment:
 *   UNBLOCKPAY_API_KEY — API key from https://unblockpay.com/
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.UNBLOCKPAY_API_KEY || "";
const BASE_URL = "https://api.unblockpay.com/v1";

async function unblockpayRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`UnblockPay API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-unblockpay", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_wallet",
      description: "Create a new wallet in UnblockPay",
      inputSchema: {
        type: "object",
        properties: {
          currency: { type: "string", description: "Wallet currency (e.g. USDC, USDT, EUR)" },
          chain: { type: "string", description: "Blockchain network (e.g. ethereum, polygon, solana)" },
          label: { type: "string", description: "Human-readable wallet label" },
        },
        required: ["currency", "chain"],
      },
    },
    {
      name: "get_wallet",
      description: "Get wallet details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Wallet ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_wallets",
      description: "List all wallets",
      inputSchema: {
        type: "object",
        properties: {
          currency: { type: "string", description: "Filter by currency" },
          limit: { type: "number", description: "Number of results (default 10)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "create_onramp",
      description: "Create a fiat-to-stablecoin onramp transaction",
      inputSchema: {
        type: "object",
        properties: {
          sourceCurrency: { type: "string", description: "Fiat currency (e.g. BRL, USD, EUR)" },
          targetCurrency: { type: "string", description: "Stablecoin (e.g. USDC, USDT)" },
          amount: { type: "number", description: "Amount in source currency" },
          walletId: { type: "string", description: "Destination wallet ID" },
          chain: { type: "string", description: "Target blockchain network" },
        },
        required: ["sourceCurrency", "targetCurrency", "amount", "walletId"],
      },
    },
    {
      name: "create_offramp",
      description: "Create a stablecoin-to-fiat offramp transaction",
      inputSchema: {
        type: "object",
        properties: {
          sourceCurrency: { type: "string", description: "Stablecoin (e.g. USDC, USDT)" },
          targetCurrency: { type: "string", description: "Fiat currency (e.g. BRL, USD, EUR)" },
          amount: { type: "number", description: "Amount in source stablecoin" },
          walletId: { type: "string", description: "Source wallet ID" },
          bankAccountId: { type: "string", description: "Destination bank account ID" },
        },
        required: ["sourceCurrency", "targetCurrency", "amount", "walletId"],
      },
    },
    {
      name: "get_transaction",
      description: "Get transaction details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Transaction ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_transactions",
      description: "List transactions with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          walletId: { type: "string", description: "Filter by wallet ID" },
          type: { type: "string", enum: ["onramp", "offramp", "transfer"], description: "Filter by transaction type" },
          status: { type: "string", enum: ["pending", "processing", "completed", "failed"], description: "Filter by status" },
          limit: { type: "number", description: "Number of results (default 10)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "get_exchange_rate",
      description: "Get current exchange rate for a currency pair",
      inputSchema: {
        type: "object",
        properties: {
          sourceCurrency: { type: "string", description: "Source currency (e.g. BRL, USD)" },
          targetCurrency: { type: "string", description: "Target currency (e.g. USDC, USDT)" },
        },
        required: ["sourceCurrency", "targetCurrency"],
      },
    },
    {
      name: "create_transfer",
      description: "Create a stablecoin transfer between wallets",
      inputSchema: {
        type: "object",
        properties: {
          sourceWalletId: { type: "string", description: "Source wallet ID" },
          destinationAddress: { type: "string", description: "Destination wallet address" },
          amount: { type: "number", description: "Amount to transfer" },
          currency: { type: "string", description: "Currency (e.g. USDC)" },
        },
        required: ["sourceWalletId", "destinationAddress", "amount", "currency"],
      },
    },
    {
      name: "get_balance",
      description: "Get wallet balance",
      inputSchema: {
        type: "object",
        properties: {
          walletId: { type: "string", description: "Wallet ID" },
        },
        required: ["walletId"],
      },
    },
    {
      name: "submit_corporate_kyc",
      description: "Submit a corporate KYC application (business onboarding)",
      inputSchema: {
        type: "object",
        properties: {
          companyName: { type: "string", description: "Legal company name" },
          registrationNumber: { type: "string", description: "Tax / registration number (e.g. CNPJ)" },
          country: { type: "string", description: "ISO 3166-1 alpha-2 country code (e.g. BR, US)" },
          address: { type: "string", description: "Registered company address" },
          contactEmail: { type: "string", description: "Primary contact email" },
          documents: { type: "array", items: { type: "string" }, description: "Array of uploaded document IDs or URLs" },
        },
        required: ["companyName", "registrationNumber", "country"],
      },
    },
    {
      name: "get_corporate_kyc_status",
      description: "Get the status of a corporate KYC application",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Corporate KYC application ID" },
        },
        required: ["applicationId"],
      },
    },
    {
      name: "submit_individual_kyc",
      description: "Submit an individual KYC application (personal onboarding)",
      inputSchema: {
        type: "object",
        properties: {
          firstName: { type: "string", description: "Legal first name" },
          lastName: { type: "string", description: "Legal last name" },
          dateOfBirth: { type: "string", description: "Date of birth (YYYY-MM-DD)" },
          country: { type: "string", description: "ISO 3166-1 alpha-2 country code" },
          taxId: { type: "string", description: "National tax ID (e.g. CPF)" },
          address: { type: "string", description: "Residential address" },
          email: { type: "string", description: "Contact email" },
          documents: { type: "array", items: { type: "string" }, description: "Array of uploaded document IDs or URLs" },
        },
        required: ["firstName", "lastName", "dateOfBirth", "country"],
      },
    },
    {
      name: "get_individual_kyc_status",
      description: "Get the status of an individual KYC application",
      inputSchema: {
        type: "object",
        properties: {
          applicationId: { type: "string", description: "Individual KYC application ID" },
        },
        required: ["applicationId"],
      },
    },
    {
      name: "add_bank_account",
      description: "Register a fiat bank account for offramp payouts",
      inputSchema: {
        type: "object",
        properties: {
          currency: { type: "string", description: "Bank account currency (e.g. BRL, USD, EUR)" },
          country: { type: "string", description: "ISO 3166-1 alpha-2 country code" },
          accountHolderName: { type: "string", description: "Name on the bank account" },
          accountNumber: { type: "string", description: "Account number (or IBAN)" },
          routingNumber: { type: "string", description: "Routing/sort code/agency (if applicable)" },
          bankName: { type: "string", description: "Bank name" },
          pixKey: { type: "string", description: "Pix key (for BRL accounts)" },
          label: { type: "string", description: "Human-readable label" },
        },
        required: ["currency", "country", "accountHolderName"],
      },
    },
    {
      name: "list_bank_accounts",
      description: "List registered fiat bank accounts",
      inputSchema: {
        type: "object",
        properties: {
          currency: { type: "string", description: "Filter by currency" },
          limit: { type: "number", description: "Number of results (default 10)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "delete_bank_account",
      description: "Delete a registered bank account by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Bank account ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "simulate_swap_quote",
      description: "Simulate a fiat<->crypto swap quote without executing it",
      inputSchema: {
        type: "object",
        properties: {
          sourceCurrency: { type: "string", description: "Source currency (fiat or crypto)" },
          targetCurrency: { type: "string", description: "Target currency (fiat or crypto)" },
          amount: { type: "number", description: "Amount in source currency" },
          chain: { type: "string", description: "Blockchain network (for crypto leg)" },
        },
        required: ["sourceCurrency", "targetCurrency", "amount"],
      },
    },
    {
      name: "list_supported_assets",
      description: "List supported crypto assets / stablecoins on UnblockPay",
      inputSchema: {
        type: "object",
        properties: {
          chain: { type: "string", description: "Filter by blockchain network" },
        },
      },
    },
    {
      name: "register_webhook",
      description: "Register a webhook endpoint for transaction lifecycle events",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "HTTPS URL that will receive webhook callbacks" },
          events: { type: "array", items: { type: "string" }, description: "Event types to subscribe to (e.g. transaction.completed, transaction.failed)" },
          secret: { type: "string", description: "Optional shared secret for signature verification" },
        },
        required: ["url", "events"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_wallet":
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("POST", "/wallets", args), null, 2) }] };
      case "get_wallet":
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("GET", `/wallets/${args?.id}`), null, 2) }] };
      case "list_wallets": {
        const params = new URLSearchParams();
        if (args?.currency) params.set("currency", String(args.currency));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("GET", `/wallets?${params}`), null, 2) }] };
      }
      case "create_onramp":
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("POST", "/onramp", args), null, 2) }] };
      case "create_offramp":
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("POST", "/offramp", args), null, 2) }] };
      case "get_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("GET", `/transactions/${args?.id}`), null, 2) }] };
      case "list_transactions": {
        const params = new URLSearchParams();
        if (args?.walletId) params.set("walletId", String(args.walletId));
        if (args?.type) params.set("type", String(args.type));
        if (args?.status) params.set("status", String(args.status));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("GET", `/transactions?${params}`), null, 2) }] };
      }
      case "get_exchange_rate": {
        const params = new URLSearchParams();
        if (args?.sourceCurrency) params.set("sourceCurrency", String(args.sourceCurrency));
        if (args?.targetCurrency) params.set("targetCurrency", String(args.targetCurrency));
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("GET", `/exchange-rates?${params}`), null, 2) }] };
      }
      case "create_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("POST", "/transfers", args), null, 2) }] };
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("GET", `/wallets/${args?.walletId}/balance`), null, 2) }] };
      case "submit_corporate_kyc":
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("POST", "/kyc/corporate", args), null, 2) }] };
      case "get_corporate_kyc_status":
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("GET", `/kyc/corporate/${args?.applicationId}`), null, 2) }] };
      case "submit_individual_kyc":
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("POST", "/kyc/individual", args), null, 2) }] };
      case "get_individual_kyc_status":
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("GET", `/kyc/individual/${args?.applicationId}`), null, 2) }] };
      case "add_bank_account":
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("POST", "/bank-accounts", args), null, 2) }] };
      case "list_bank_accounts": {
        const params = new URLSearchParams();
        if (args?.currency) params.set("currency", String(args.currency));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("GET", `/bank-accounts?${params}`), null, 2) }] };
      }
      case "delete_bank_account":
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("DELETE", `/bank-accounts/${args?.id}`), null, 2) }] };
      case "simulate_swap_quote":
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("POST", "/swaps/quote", args), null, 2) }] };
      case "list_supported_assets": {
        const params = new URLSearchParams();
        if (args?.chain) params.set("chain", String(args.chain));
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("GET", `/assets?${params}`), null, 2) }] };
      }
      case "register_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await unblockpayRequest("POST", "/webhooks", args), null, 2) }] };
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
        const s = new Server({ name: "mcp-unblockpay", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
