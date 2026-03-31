#!/usr/bin/env node

/**
 * MCP Server for Stark Bank — Brazilian digital banking platform.
 *
 * Tools:
 * - create_transfer: Create a bank transfer
 * - get_transfer: Get transfer details by ID
 * - list_transfers: List transfers with filters
 * - create_boleto: Create a boleto payment
 * - get_balance: Get account balance
 * - create_invoice: Create an invoice
 * - get_invoice: Get invoice details by ID
 * - list_invoices: List invoices with filters
 * - create_pix_request: Create a Pix payment request
 * - get_webhook_events: Get webhook events
 *
 * Environment:
 *   STARK_BANK_ACCESS_TOKEN — API access token
 *   STARK_BANK_SANDBOX — "true" to use sandbox (default: false)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ACCESS_TOKEN = process.env.STARK_BANK_ACCESS_TOKEN || "";
const BASE_URL = process.env.STARK_BANK_SANDBOX === "true"
  ? "https://sandbox.api.starkbank.com/v2"
  : "https://api.starkbank.com/v2";

async function starkBankRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stark Bank API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-stark-bank", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_transfer",
      description: "Create a bank transfer (Pix or TED)",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in cents (e.g. 1000 = R$10.00)" },
          name: { type: "string", description: "Recipient name" },
          taxId: { type: "string", description: "Recipient CPF or CNPJ" },
          bankCode: { type: "string", description: "Bank code (e.g. '20018183' for Stark Bank)" },
          branchCode: { type: "string", description: "Branch code" },
          accountNumber: { type: "string", description: "Account number with digit" },
          accountType: { type: "string", enum: ["checking", "savings", "salary", "payment"], description: "Account type" },
          tags: { type: "array", items: { type: "string" }, description: "Tags for organization" },
        },
        required: ["amount", "name", "taxId", "bankCode", "branchCode", "accountNumber"],
      },
    },
    {
      name: "get_transfer",
      description: "Get transfer details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Transfer ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_transfers",
      description: "List transfers with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (default 10)" },
          after: { type: "string", description: "Filter by date after (YYYY-MM-DD)" },
          before: { type: "string", description: "Filter by date before (YYYY-MM-DD)" },
          status: { type: "string", enum: ["created", "processing", "success", "failed"], description: "Filter by status" },
        },
      },
    },
    {
      name: "create_boleto",
      description: "Create a boleto payment",
      inputSchema: {
        type: "object",
        properties: {
          taxId: { type: "string", description: "Payer CPF or CNPJ" },
          description: { type: "string", description: "Payment description" },
          line: { type: "string", description: "Boleto digitable line or barcode" },
          scheduled: { type: "string", description: "Scheduled payment date (YYYY-MM-DD)" },
          tags: { type: "array", items: { type: "string" }, description: "Tags for organization" },
        },
        required: ["taxId", "description", "line"],
      },
    },
    {
      name: "get_balance",
      description: "Get current account balance",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_invoice",
      description: "Create an invoice (generates Pix QR code)",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in cents" },
          name: { type: "string", description: "Payer name" },
          taxId: { type: "string", description: "Payer CPF or CNPJ" },
          due: { type: "string", description: "Due date (YYYY-MM-DD)" },
          expiration: { type: "number", description: "Seconds until expiration after due date" },
          fine: { type: "number", description: "Fine percentage for late payment" },
          interest: { type: "number", description: "Monthly interest percentage" },
          tags: { type: "array", items: { type: "string" }, description: "Tags for organization" },
        },
        required: ["amount", "name", "taxId"],
      },
    },
    {
      name: "get_invoice",
      description: "Get invoice details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Invoice ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_invoices",
      description: "List invoices with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (default 10)" },
          after: { type: "string", description: "Filter by date after (YYYY-MM-DD)" },
          before: { type: "string", description: "Filter by date before (YYYY-MM-DD)" },
          status: { type: "string", enum: ["created", "paid", "canceled", "overdue"], description: "Filter by status" },
        },
      },
    },
    {
      name: "create_pix_request",
      description: "Create a Pix payment request",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in cents" },
          pixKey: { type: "string", description: "Pix key of the recipient" },
          description: { type: "string", description: "Payment description" },
          tags: { type: "array", items: { type: "string" }, description: "Tags for organization" },
        },
        required: ["amount", "pixKey"],
      },
    },
    {
      name: "get_webhook_events",
      description: "Get webhook events (payment confirmations, transfers, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (default 10)" },
          after: { type: "string", description: "Filter by date after (YYYY-MM-DD)" },
          before: { type: "string", description: "Filter by date before (YYYY-MM-DD)" },
          isDelivered: { type: "boolean", description: "Filter by delivery status" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await starkBankRequest("POST", "/transfer", { transfers: [args] }), null, 2) }] };
      case "get_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await starkBankRequest("GET", `/transfer/${args?.id}`), null, 2) }] };
      case "list_transfers": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.after) params.set("after", String(args.after));
        if (args?.before) params.set("before", String(args.before));
        if (args?.status) params.set("status", String(args.status));
        return { content: [{ type: "text", text: JSON.stringify(await starkBankRequest("GET", `/transfer?${params}`), null, 2) }] };
      }
      case "create_boleto":
        return { content: [{ type: "text", text: JSON.stringify(await starkBankRequest("POST", "/boleto-payment", { payments: [args] }), null, 2) }] };
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await starkBankRequest("GET", "/balance"), null, 2) }] };
      case "create_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await starkBankRequest("POST", "/invoice", { invoices: [args] }), null, 2) }] };
      case "get_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await starkBankRequest("GET", `/invoice/${args?.id}`), null, 2) }] };
      case "list_invoices": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.after) params.set("after", String(args.after));
        if (args?.before) params.set("before", String(args.before));
        if (args?.status) params.set("status", String(args.status));
        return { content: [{ type: "text", text: JSON.stringify(await starkBankRequest("GET", `/invoice?${params}`), null, 2) }] };
      }
      case "create_pix_request":
        return { content: [{ type: "text", text: JSON.stringify(await starkBankRequest("POST", "/pix-request", { requests: [args] }), null, 2) }] };
      case "get_webhook_events": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.after) params.set("after", String(args.after));
        if (args?.before) params.set("before", String(args.before));
        if (args?.isDelivered !== undefined) params.set("isDelivered", String(args.isDelivered));
        return { content: [{ type: "text", text: JSON.stringify(await starkBankRequest("GET", `/event?${params}`), null, 2) }] };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!ACCESS_TOKEN) {
    console.error("STARK_BANK_ACCESS_TOKEN environment variable is required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
