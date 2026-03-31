#!/usr/bin/env node

/**
 * MCP Server for Stone — Brazilian open banking, payments, Pix, transfers.
 *
 * Tools:
 * - create_payment: Create a payment
 * - get_payment: Get payment details
 * - list_payments: List payments with filters
 * - get_balance: Get account balance
 * - list_transactions: List account transactions
 * - create_transfer: Create a bank transfer
 * - get_statement: Get account statement
 * - create_pix_payment: Create a Pix payment
 *
 * Environment:
 *   STONE_CLIENT_ID — OAuth2 client ID
 *   STONE_CLIENT_SECRET — OAuth2 client secret
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.STONE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.STONE_CLIENT_SECRET || "";
const BASE_URL = "https://api.openbank.stone.com.br/api/v1";

let accessToken = "";
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const res = await fetch("https://login.openbank.stone.com.br/auth/realms/stone_bank/protocol/openid-connect/token", {
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
    throw new Error(`Stone OAuth ${res.status}: ${err}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

async function stoneRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stone API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-stone", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_payment",
      description: "Create a payment via Stone",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Source account ID" },
          amount: { type: "number", description: "Amount in cents" },
          target: {
            type: "object",
            description: "Payment target (bank account or Pix key)",
            properties: {
              account_number: { type: "string" },
              branch_code: { type: "string" },
              institution_code: { type: "string" },
              name: { type: "string" },
              document: { type: "string" },
            },
          },
          description: { type: "string", description: "Payment description" },
        },
        required: ["account_id", "amount", "target"],
      },
    },
    {
      name: "get_payment",
      description: "Get payment details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payment ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_payments",
      description: "List payments with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Account ID" },
          status: { type: "string", description: "Filter by status" },
          limit: { type: "number", description: "Number of results" },
          cursor: { type: "string", description: "Pagination cursor" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "get_balance",
      description: "Get account balance",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Account ID" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "list_transactions",
      description: "List account transactions",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Account ID" },
          limit: { type: "number", description: "Number of results" },
          cursor: { type: "string", description: "Pagination cursor" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "create_transfer",
      description: "Create a bank transfer (internal or external)",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Source account ID" },
          amount: { type: "number", description: "Amount in cents" },
          target_account_id: { type: "string", description: "Target account ID (for internal transfers)" },
          description: { type: "string", description: "Transfer description" },
        },
        required: ["account_id", "amount", "target_account_id"],
      },
    },
    {
      name: "get_statement",
      description: "Get account statement for a period",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Account ID" },
          start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
          end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "create_pix_payment",
      description: "Create a Pix payment via Stone",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Source account ID" },
          amount: { type: "number", description: "Amount in cents" },
          pix_key: { type: "string", description: "Recipient Pix key" },
          pix_key_type: { type: "string", enum: ["cpf", "cnpj", "email", "phone", "evp"], description: "Pix key type" },
          description: { type: "string", description: "Payment description" },
        },
        required: ["account_id", "amount", "pix_key", "pix_key_type"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_payment":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("POST", `/accounts/${args?.account_id}/payments`, args), null, 2) }] };
      case "get_payment":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("GET", `/payments/${args?.id}`), null, 2) }] };
      case "list_payments": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.cursor) params.set("cursor", String(args.cursor));
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("GET", `/accounts/${args?.account_id}/payments?${params}`), null, 2) }] };
      }
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("GET", `/accounts/${args?.account_id}/balance`), null, 2) }] };
      case "list_transactions": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.cursor) params.set("cursor", String(args.cursor));
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("GET", `/accounts/${args?.account_id}/transactions?${params}`), null, 2) }] };
      }
      case "create_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("POST", `/accounts/${args?.account_id}/transfers`, args), null, 2) }] };
      case "get_statement": {
        const params = new URLSearchParams();
        if (args?.start_date) params.set("start_date", String(args.start_date));
        if (args?.end_date) params.set("end_date", String(args.end_date));
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("GET", `/accounts/${args?.account_id}/statement?${params}`), null, 2) }] };
      }
      case "create_pix_payment":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("POST", `/accounts/${args?.account_id}/pix/payments`, args), null, 2) }] };
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("STONE_CLIENT_ID and STONE_CLIENT_SECRET environment variables are required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
