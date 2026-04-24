#!/usr/bin/env node

/**
 * MCP Server for Circle — USDC stablecoin infrastructure.
 *
 * Tools:
 * - create_wallet: Create a new Circle business-account wallet
 * - get_wallet: Get wallet details by ID
 * - list_wallets: List all wallets
 * - create_payment: Accept a USDC payment
 * - get_payment: Get payment details by ID
 * - create_payout: Create a payout (USDC to fiat)
 * - get_payout: Get payout details by ID
 * - list_payouts: List payouts with filters
 * - create_transfer: Create a USDC transfer between wallets
 * - get_transfer: Get transfer details by ID
 * - list_transfers: List transfers with filters
 * - create_card: Register card data for on-ramp
 * - get_card: Get card details by ID
 * - list_cards: List cards
 * - list_settlements: List settlements
 * - get_settlement: Get settlement details by ID
 * - list_chargebacks: List chargebacks
 * - get_chargeback: Get chargeback by ID
 * - create_subscription: Register a notification subscription (webhook)
 * - list_subscriptions: List notification subscriptions
 * - delete_subscription: Remove a notification subscription
 * - get_balance: Get business-account balance
 * - list_transactions: List transactions with filters
 *
 * Environment:
 *   CIRCLE_API_KEY — API key from https://www.circle.com/
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.CIRCLE_API_KEY || "";
const BASE_URL = "https://api.circle.com/v1";

async function circleRequest(method: string, path: string, body?: unknown): Promise<unknown> {
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
    throw new Error(`Circle API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-circle", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

const amountSchema = {
  type: "object",
  properties: {
    amount: { type: "string", description: "Amount (e.g. '10.00')" },
    currency: { type: "string", description: "Currency (USD)" },
  },
  required: ["amount", "currency"],
};

const sourceDestSchema = (label: string) => ({
  type: "object",
  properties: {
    id: { type: "string", description: `${label} ID` },
    type: { type: "string", description: `${label} type (e.g. wallet, card, ach, wire, blockchain)` },
  },
  required: ["id", "type"],
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // Wallets
    {
      name: "create_wallet",
      description: "Create a new Circle business-account wallet",
      inputSchema: {
        type: "object",
        properties: {
          idempotencyKey: { type: "string", description: "Unique idempotency key (UUID)" },
          description: { type: "string", description: "Wallet description" },
        },
        required: ["idempotencyKey"],
      },
    },
    {
      name: "get_wallet",
      description: "Get wallet details by ID",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Wallet ID" } },
        required: ["id"],
      },
    },
    {
      name: "list_wallets",
      description: "List all Circle wallets",
      inputSchema: {
        type: "object",
        properties: {
          pageSize: { type: "number", description: "Number of results per page" },
          pageBefore: { type: "string", description: "Cursor for previous page" },
          pageAfter: { type: "string", description: "Cursor for next page" },
        },
      },
    },

    // Payments
    {
      name: "create_payment",
      description: "Accept a USDC payment via Circle",
      inputSchema: {
        type: "object",
        properties: {
          idempotencyKey: { type: "string", description: "Unique idempotency key (UUID)" },
          amount: { ...amountSchema, description: "Payment amount" },
          source: { ...sourceDestSchema("Source"), description: "Payment source" },
          description: { type: "string", description: "Payment description" },
          verification: { type: "string", description: "Verification method (cvv, three_d_secure, none)" },
          metadata: { type: "object", description: "Payment metadata (email, phoneNumber, sessionId, ipAddress)" },
        },
        required: ["idempotencyKey", "amount", "source"],
      },
    },
    {
      name: "get_payment",
      description: "Get payment details by ID",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Payment ID" } },
        required: ["id"],
      },
    },

    // Payouts
    {
      name: "create_payout",
      description: "Create a payout from Circle (USDC to fiat)",
      inputSchema: {
        type: "object",
        properties: {
          idempotencyKey: { type: "string", description: "Unique idempotency key (UUID)" },
          amount: { ...amountSchema, description: "Payout amount" },
          destination: { ...sourceDestSchema("Destination"), description: "Payout destination (bank account)" },
          metadata: { type: "object", description: "Payout metadata (beneficiaryEmail)" },
        },
        required: ["idempotencyKey", "amount", "destination"],
      },
    },
    {
      name: "get_payout",
      description: "Get payout details by ID",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Payout ID" } },
        required: ["id"],
      },
    },
    {
      name: "list_payouts",
      description: "List payouts with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          source: { type: "string", description: "Filter by source wallet ID" },
          destination: { type: "string", description: "Filter by destination ID" },
          type: { type: "string", description: "Filter by type (wire, ach, sen)" },
          status: { type: "string", description: "Filter by status (pending, complete, failed)" },
          from: { type: "string", description: "Start date (ISO 8601)" },
          to: { type: "string", description: "End date (ISO 8601)" },
          pageSize: { type: "number", description: "Results per page" },
        },
      },
    },

    // Transfers
    {
      name: "create_transfer",
      description: "Create a USDC transfer between Circle wallets (or to blockchain address)",
      inputSchema: {
        type: "object",
        properties: {
          idempotencyKey: { type: "string", description: "Unique idempotency key (UUID)" },
          amount: { ...amountSchema, description: "Transfer amount" },
          source: { ...sourceDestSchema("Source"), description: "Transfer source (wallet)" },
          destination: { ...sourceDestSchema("Destination"), description: "Transfer destination (wallet or blockchain)" },
        },
        required: ["idempotencyKey", "amount", "source", "destination"],
      },
    },
    {
      name: "get_transfer",
      description: "Get transfer details by ID",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Transfer ID" } },
        required: ["id"],
      },
    },
    {
      name: "list_transfers",
      description: "List transfers with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          walletId: { type: "string", description: "Filter by wallet ID" },
          sourceWalletId: { type: "string", description: "Filter by source wallet ID" },
          destinationWalletId: { type: "string", description: "Filter by destination wallet ID" },
          from: { type: "string", description: "Start date (ISO 8601)" },
          to: { type: "string", description: "End date (ISO 8601)" },
          pageSize: { type: "number", description: "Results per page" },
        },
      },
    },

    // Cards
    {
      name: "create_card",
      description: "Register card data for on-ramp payments",
      inputSchema: {
        type: "object",
        properties: {
          idempotencyKey: { type: "string", description: "Unique idempotency key (UUID)" },
          keyId: { type: "string", description: "Public key ID used to encrypt card data" },
          encryptedData: { type: "string", description: "PGP-encrypted card number + CVV" },
          billingDetails: { type: "object", description: "Billing address details (name, city, country, line1, postalCode, district)" },
          expMonth: { type: "number", description: "Card expiration month (1-12)" },
          expYear: { type: "number", description: "Card expiration year (4-digit)" },
          metadata: { type: "object", description: "Card metadata (email, phoneNumber, sessionId, ipAddress)" },
        },
        required: ["idempotencyKey", "keyId", "encryptedData", "billingDetails", "expMonth", "expYear"],
      },
    },
    {
      name: "get_card",
      description: "Get card details by ID",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Card ID" } },
        required: ["id"],
      },
    },
    {
      name: "list_cards",
      description: "List registered cards",
      inputSchema: {
        type: "object",
        properties: {
          pageSize: { type: "number", description: "Results per page" },
          pageBefore: { type: "string", description: "Cursor for previous page" },
          pageAfter: { type: "string", description: "Cursor for next page" },
        },
      },
    },

    // Settlements
    {
      name: "list_settlements",
      description: "List settlements (card payment batches)",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Start date (ISO 8601)" },
          to: { type: "string", description: "End date (ISO 8601)" },
          pageSize: { type: "number", description: "Results per page" },
          pageBefore: { type: "string", description: "Cursor for previous page" },
          pageAfter: { type: "string", description: "Cursor for next page" },
        },
      },
    },
    {
      name: "get_settlement",
      description: "Get settlement details by ID",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Settlement ID" } },
        required: ["id"],
      },
    },

    // Chargebacks
    {
      name: "list_chargebacks",
      description: "List chargebacks",
      inputSchema: {
        type: "object",
        properties: {
          paymentId: { type: "string", description: "Filter by payment ID" },
          from: { type: "string", description: "Start date (ISO 8601)" },
          to: { type: "string", description: "End date (ISO 8601)" },
          pageSize: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "get_chargeback",
      description: "Get chargeback details by ID",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Chargeback ID" } },
        required: ["id"],
      },
    },

    // Notification subscriptions (webhooks)
    {
      name: "create_subscription",
      description: "Register a notification subscription (webhook)",
      inputSchema: {
        type: "object",
        properties: {
          endpoint: { type: "string", description: "HTTPS webhook endpoint URL" },
        },
        required: ["endpoint"],
      },
    },
    {
      name: "list_subscriptions",
      description: "List notification subscriptions (webhooks)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "delete_subscription",
      description: "Delete a notification subscription",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Subscription ID" } },
        required: ["id"],
      },
    },

    // Balance + transactions
    {
      name: "get_balance",
      description: "Get business-account balance",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_transactions",
      description: "List transactions with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["payment", "payout", "transfer"], description: "Filter by transaction type" },
          status: { type: "string", enum: ["pending", "confirmed", "complete", "failed"], description: "Filter by status" },
          from: { type: "string", description: "Start date (ISO 8601)" },
          to: { type: "string", description: "End date (ISO 8601)" },
          pageSize: { type: "number", description: "Number of results per page" },
          pageBefore: { type: "string", description: "Cursor for previous page" },
          pageAfter: { type: "string", description: "Cursor for next page" },
        },
      },
    },
  ],
}));

function buildQuery(args: Record<string, unknown> | undefined, keys: string[]): string {
  const params = new URLSearchParams();
  if (args) {
    for (const k of keys) {
      const v = args[k];
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    }
  }
  const q = params.toString();
  return q ? `?${q}` : "";
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // Wallets
      case "create_wallet":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("POST", "/businessAccount/wallets", args), null, 2) }] };
      case "get_wallet":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", `/wallets/${args?.id}`), null, 2) }] };
      case "list_wallets":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", `/wallets${buildQuery(args as any, ["pageSize", "pageBefore", "pageAfter"])}`), null, 2) }] };

      // Payments
      case "create_payment":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("POST", "/payments", args), null, 2) }] };
      case "get_payment":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", `/payments/${args?.id}`), null, 2) }] };

      // Payouts
      case "create_payout":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("POST", "/payouts", args), null, 2) }] };
      case "get_payout":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", `/payouts/${args?.id}`), null, 2) }] };
      case "list_payouts":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", `/payouts${buildQuery(args as any, ["source", "destination", "type", "status", "from", "to", "pageSize"])}`), null, 2) }] };

      // Transfers
      case "create_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("POST", "/transfers", args), null, 2) }] };
      case "get_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", `/transfers/${args?.id}`), null, 2) }] };
      case "list_transfers":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", `/transfers${buildQuery(args as any, ["walletId", "sourceWalletId", "destinationWalletId", "from", "to", "pageSize"])}`), null, 2) }] };

      // Cards
      case "create_card":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("POST", "/cards", args), null, 2) }] };
      case "get_card":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", `/cards/${args?.id}`), null, 2) }] };
      case "list_cards":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", `/cards${buildQuery(args as any, ["pageSize", "pageBefore", "pageAfter"])}`), null, 2) }] };

      // Settlements
      case "list_settlements":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", `/settlements${buildQuery(args as any, ["from", "to", "pageSize", "pageBefore", "pageAfter"])}`), null, 2) }] };
      case "get_settlement":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", `/settlements/${args?.id}`), null, 2) }] };

      // Chargebacks
      case "list_chargebacks":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", `/chargebacks${buildQuery(args as any, ["paymentId", "from", "to", "pageSize"])}`), null, 2) }] };
      case "get_chargeback":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", `/chargebacks/${args?.id}`), null, 2) }] };

      // Notification subscriptions
      case "create_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("POST", "/notifications/subscriptions", args), null, 2) }] };
      case "list_subscriptions":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", "/notifications/subscriptions"), null, 2) }] };
      case "delete_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("DELETE", `/notifications/subscriptions/${args?.id}`), null, 2) }] };

      // Balance
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", "/businessAccount/balances"), null, 2) }] };

      // Transactions
      case "list_transactions":
        return { content: [{ type: "text", text: JSON.stringify(await circleRequest("GET", `/transactions${buildQuery(args as any, ["type", "status", "from", "to", "pageSize", "pageBefore", "pageAfter"])}`), null, 2) }] };

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
        const s = new Server({ name: "mcp-circle", version: "0.2.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
