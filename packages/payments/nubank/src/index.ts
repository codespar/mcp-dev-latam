#!/usr/bin/env node

/**
 * MCP Server for Nubank — via Open Finance Brasil standard.
 *
 * Tools:
 * - get_accounts: List accounts
 * - get_balance: Get account balance
 * - get_transactions: List transactions with filters
 * - get_credit_card_bill: Get credit card bill
 * - get_investments: List investments
 * - initiate_pix: Initiate PIX transfer
 * - get_pix_keys: List registered PIX keys
 * - get_statement: Get account statement
 * - get_profile: Get authenticated user profile
 * - list_cards: List debit/credit cards
 * - get_pix_transfer: Get status of a specific PIX transfer
 * - schedule_pix: Schedule a future-dated PIX transfer
 * - cancel_scheduled_pix: Cancel a previously scheduled PIX
 * - create_pix_key: Register a new PIX key
 * - delete_pix_key: Remove a registered PIX key
 * - get_card_details: Get details for a single card
 * - block_card: Block a card
 * - unblock_card: Unblock a card
 * - get_credit_card_transactions: List transactions for a given bill/card
 * - pay_credit_card_bill: Pay a credit card bill from an account
 * - get_boleto: Retrieve boleto details by barcode/digitable line
 * - pay_boleto: Pay a boleto
 *
 * Environment:
 *   NUBANK_CLIENT_ID     — OAuth2 client ID
 *   NUBANK_CLIENT_SECRET — OAuth2 client secret
 *   NUBANK_CERT_PATH     — Path to mTLS certificate
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.NUBANK_CLIENT_ID || "";
const CLIENT_SECRET = process.env.NUBANK_CLIENT_SECRET || "";
const CERT_PATH = process.env.NUBANK_CERT_PATH || "";
const BASE_URL = "https://api.nubank.com.br";

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Nubank OAuth ${res.status}: ${err}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function nubankRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Nubank API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-nubank", version: "0.2.0-alpha.2" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_accounts",
      description: "List all accounts (checking, savings)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_balance",
      description: "Get account balance",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Account ID" },
        },
        required: ["accountId"],
      },
    },
    {
      name: "get_transactions",
      description: "List transactions with filters",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Account ID" },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          type: { type: "string", enum: ["credit", "debit", "pix", "transfer"], description: "Transaction type filter" },
          limit: { type: "number", description: "Results limit" },
          offset: { type: "number", description: "Results offset" },
        },
        required: ["accountId"],
      },
    },
    {
      name: "get_credit_card_bill",
      description: "Get credit card bill details",
      inputSchema: {
        type: "object",
        properties: {
          month: { type: "string", description: "Bill month (YYYY-MM)" },
          status: { type: "string", enum: ["open", "closed", "future"], description: "Bill status" },
        },
      },
    },
    {
      name: "get_investments",
      description: "List investments and yields",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "initiate_pix",
      description: "Initiate a PIX transfer",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Transfer amount in BRL" },
          pix_key: { type: "string", description: "Recipient PIX key" },
          pix_key_type: { type: "string", enum: ["cpf", "cnpj", "email", "phone", "random"], description: "PIX key type" },
          description: { type: "string", description: "Transfer description" },
        },
        required: ["amount", "pix_key", "pix_key_type"],
      },
    },
    {
      name: "get_pix_keys",
      description: "List registered PIX keys",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_statement",
      description: "Get account statement for a period",
      inputSchema: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Account ID" },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
        required: ["accountId"],
      },
    },
    {
      name: "get_profile",
      description: "Get authenticated user profile information",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_cards",
      description: "List debit and credit cards",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_pix_transfer",
      description: "Get status and details of a specific PIX transfer",
      inputSchema: {
        type: "object",
        properties: {
          transferId: { type: "string", description: "PIX transfer ID" },
        },
        required: ["transferId"],
      },
    },
    {
      name: "schedule_pix",
      description: "Schedule a future-dated PIX transfer",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Transfer amount in BRL" },
          pix_key: { type: "string", description: "Recipient PIX key" },
          pix_key_type: { type: "string", enum: ["cpf", "cnpj", "email", "phone", "random"], description: "PIX key type" },
          scheduled_date: { type: "string", description: "Execution date (YYYY-MM-DD)" },
          description: { type: "string", description: "Transfer description" },
        },
        required: ["amount", "pix_key", "pix_key_type", "scheduled_date"],
      },
    },
    {
      name: "cancel_scheduled_pix",
      description: "Cancel a previously scheduled PIX transfer",
      inputSchema: {
        type: "object",
        properties: {
          transferId: { type: "string", description: "Scheduled PIX transfer ID" },
        },
        required: ["transferId"],
      },
    },
    {
      name: "create_pix_key",
      description: "Register a new PIX key for the authenticated account",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "PIX key value (cpf/cnpj/email/phone, or omit for random)" },
          key_type: { type: "string", enum: ["cpf", "cnpj", "email", "phone", "random"], description: "PIX key type" },
          accountId: { type: "string", description: "Account ID to attach the key to" },
        },
        required: ["key_type", "accountId"],
      },
    },
    {
      name: "delete_pix_key",
      description: "Remove a registered PIX key",
      inputSchema: {
        type: "object",
        properties: {
          keyId: { type: "string", description: "PIX key ID to delete" },
        },
        required: ["keyId"],
      },
    },
    {
      name: "get_card_details",
      description: "Get details for a single debit or credit card",
      inputSchema: {
        type: "object",
        properties: {
          cardId: { type: "string", description: "Card ID" },
        },
        required: ["cardId"],
      },
    },
    {
      name: "block_card",
      description: "Block a card (reports lost/stolen or temporarily disables it)",
      inputSchema: {
        type: "object",
        properties: {
          cardId: { type: "string", description: "Card ID" },
          reason: { type: "string", enum: ["lost", "stolen", "damaged", "temporary"], description: "Reason for block" },
        },
        required: ["cardId"],
      },
    },
    {
      name: "unblock_card",
      description: "Unblock a previously blocked card (only valid for temporary blocks)",
      inputSchema: {
        type: "object",
        properties: {
          cardId: { type: "string", description: "Card ID" },
        },
        required: ["cardId"],
      },
    },
    {
      name: "get_credit_card_transactions",
      description: "List transactions for a given credit card bill",
      inputSchema: {
        type: "object",
        properties: {
          billId: { type: "string", description: "Credit card bill ID" },
        },
        required: ["billId"],
      },
    },
    {
      name: "pay_credit_card_bill",
      description: "Pay a credit card bill from a linked account",
      inputSchema: {
        type: "object",
        properties: {
          billId: { type: "string", description: "Credit card bill ID" },
          accountId: { type: "string", description: "Debit account ID" },
          amount: { type: "number", description: "Payment amount in BRL (partial or full)" },
        },
        required: ["billId", "accountId", "amount"],
      },
    },
    {
      name: "get_boleto",
      description: "Retrieve boleto details by barcode or digitable line",
      inputSchema: {
        type: "object",
        properties: {
          barcode: { type: "string", description: "Boleto barcode or digitable line" },
        },
        required: ["barcode"],
      },
    },
    {
      name: "pay_boleto",
      description: "Pay a boleto from a linked account",
      inputSchema: {
        type: "object",
        properties: {
          barcode: { type: "string", description: "Boleto barcode or digitable line" },
          accountId: { type: "string", description: "Debit account ID" },
          amount: { type: "number", description: "Payment amount in BRL (optional — uses boleto amount if omitted)" },
        },
        required: ["barcode", "accountId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_accounts":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("GET", "/api/accounts"), null, 2) }] };
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("GET", `/api/accounts/${args?.accountId}/balance`), null, 2) }] };
      case "get_transactions": {
        const params = new URLSearchParams();
        if (args?.date_from) params.set("date_from", String(args.date_from));
        if (args?.date_to) params.set("date_to", String(args.date_to));
        if (args?.type) params.set("type", String(args.type));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("GET", `/api/accounts/${args?.accountId}/transactions?${params}`), null, 2) }] };
      }
      case "get_credit_card_bill": {
        const params = new URLSearchParams();
        if (args?.month) params.set("month", String(args.month));
        if (args?.status) params.set("status", String(args.status));
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("GET", `/api/credit-card/bills?${params}`), null, 2) }] };
      }
      case "get_investments":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("GET", "/api/investments"), null, 2) }] };
      case "initiate_pix":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("POST", "/api/pix/transfers", {
          amount: args?.amount,
          pix_key: args?.pix_key,
          pix_key_type: args?.pix_key_type,
          description: args?.description,
        }), null, 2) }] };
      case "get_pix_keys":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("GET", "/api/pix/keys"), null, 2) }] };
      case "get_statement": {
        const params = new URLSearchParams();
        if (args?.date_from) params.set("date_from", String(args.date_from));
        if (args?.date_to) params.set("date_to", String(args.date_to));
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("GET", `/api/accounts/${args?.accountId}/statement?${params}`), null, 2) }] };
      }
      case "get_profile":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("GET", "/api/profile"), null, 2) }] };
      case "list_cards":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("GET", "/api/cards"), null, 2) }] };
      case "get_pix_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("GET", `/api/pix/transfers/${args?.transferId}`), null, 2) }] };
      case "schedule_pix":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("POST", "/api/pix/transfers/scheduled", {
          amount: args?.amount,
          pix_key: args?.pix_key,
          pix_key_type: args?.pix_key_type,
          scheduled_date: args?.scheduled_date,
          description: args?.description,
        }), null, 2) }] };
      case "cancel_scheduled_pix":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("DELETE", `/api/pix/transfers/scheduled/${args?.transferId}`), null, 2) }] };
      case "create_pix_key":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("POST", "/api/pix/keys", {
          key: args?.key,
          key_type: args?.key_type,
          account_id: args?.accountId,
        }), null, 2) }] };
      case "delete_pix_key":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("DELETE", `/api/pix/keys/${args?.keyId}`), null, 2) }] };
      case "get_card_details":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("GET", `/api/cards/${args?.cardId}`), null, 2) }] };
      case "block_card":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("POST", `/api/cards/${args?.cardId}/block`, {
          reason: args?.reason,
        }), null, 2) }] };
      case "unblock_card":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("POST", `/api/cards/${args?.cardId}/unblock`), null, 2) }] };
      case "get_credit_card_transactions":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("GET", `/api/credit-card/bills/${args?.billId}/transactions`), null, 2) }] };
      case "pay_credit_card_bill":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("POST", `/api/credit-card/bills/${args?.billId}/payments`, {
          account_id: args?.accountId,
          amount: args?.amount,
        }), null, 2) }] };
      case "get_boleto":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("GET", `/api/boletos/${encodeURIComponent(String(args?.barcode))}`), null, 2) }] };
      case "pay_boleto":
        return { content: [{ type: "text", text: JSON.stringify(await nubankRequest("POST", "/api/boletos/payments", {
          barcode: args?.barcode,
          account_id: args?.accountId,
          amount: args?.amount,
        }), null, 2) }] };
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
        const s = new Server({ name: "mcp-nubank", version: "0.2.0-alpha.2" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
