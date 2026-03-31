#!/usr/bin/env node

/**
 * MCP Server for Celcoin — Brazilian fintech infrastructure (Pix, boleto, transfers, top-ups).
 *
 * Tools:
 * - create_pix_payment: Create a Pix payment
 * - get_pix_payment: Get Pix payment details
 * - create_boleto: Create a boleto payment
 * - get_boleto: Get boleto details
 * - create_transfer: Create a bank transfer
 * - get_balance: Get account balance
 * - list_banks: List available banks
 * - create_topup: Create a mobile/service top-up (recarga)
 *
 * Environment:
 *   CELCOIN_CLIENT_ID — OAuth2 client ID
 *   CELCOIN_CLIENT_SECRET — OAuth2 client secret
 *   CELCOIN_SANDBOX — "true" to use sandbox (default: false)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.CELCOIN_CLIENT_ID || "";
const CLIENT_SECRET = process.env.CELCOIN_CLIENT_SECRET || "";
const BASE_URL = process.env.CELCOIN_SANDBOX === "true"
  ? "https://sandbox-api.celcoin.com.br"
  : "https://api-sec.celcoin.com.br";

let accessToken = "";
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const res = await fetch(`${BASE_URL}/v5/token`, {
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
    throw new Error(`Celcoin OAuth ${res.status}: ${err}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

async function celcoinRequest(method: string, path: string, body?: unknown): Promise<unknown> {
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
    throw new Error(`Celcoin API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-celcoin", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_pix_payment",
      description: "Create a Pix payment via Celcoin",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in BRL" },
          pixKey: { type: "string", description: "Recipient Pix key" },
          pixKeyType: { type: "string", enum: ["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"], description: "Pix key type" },
          recipientName: { type: "string", description: "Recipient name" },
          recipientDocument: { type: "string", description: "Recipient CPF/CNPJ" },
          description: { type: "string", description: "Payment description" },
          endToEndId: { type: "string", description: "End-to-end ID (optional)" },
        },
        required: ["amount", "pixKey", "pixKeyType"],
      },
    },
    {
      name: "get_pix_payment",
      description: "Get Pix payment details by transaction ID",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string", description: "Transaction ID" },
        },
        required: ["transactionId"],
      },
    },
    {
      name: "create_boleto",
      description: "Create a boleto payment via Celcoin",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in BRL" },
          dueDate: { type: "string", description: "Due date (YYYY-MM-DD)" },
          payerName: { type: "string", description: "Payer name" },
          payerDocument: { type: "string", description: "Payer CPF/CNPJ" },
          payerAddress: {
            type: "object",
            description: "Payer address",
            properties: {
              street: { type: "string" },
              number: { type: "string" },
              neighborhood: { type: "string" },
              city: { type: "string" },
              state: { type: "string" },
              zipCode: { type: "string" },
            },
          },
          description: { type: "string", description: "Boleto description" },
        },
        required: ["amount", "dueDate", "payerName", "payerDocument"],
      },
    },
    {
      name: "get_boleto",
      description: "Get boleto details by transaction ID",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string", description: "Transaction ID" },
        },
        required: ["transactionId"],
      },
    },
    {
      name: "create_transfer",
      description: "Create a bank transfer (TED/DOC) via Celcoin",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in BRL" },
          bankCode: { type: "string", description: "Recipient bank code (ISPB or COMPE)" },
          branch: { type: "string", description: "Recipient branch number" },
          account: { type: "string", description: "Recipient account number" },
          accountType: { type: "string", enum: ["CC", "CP", "PG"], description: "CC=Checking, CP=Savings, PG=Payment" },
          recipientName: { type: "string", description: "Recipient name" },
          recipientDocument: { type: "string", description: "Recipient CPF/CNPJ" },
          description: { type: "string", description: "Transfer description" },
        },
        required: ["amount", "bankCode", "branch", "account", "accountType", "recipientName", "recipientDocument"],
      },
    },
    {
      name: "get_balance",
      description: "Get account balance at Celcoin",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_banks",
      description: "List available banks in Brazil (ISPB codes)",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by bank name or code" },
        },
      },
    },
    {
      name: "create_topup",
      description: "Create a mobile/service top-up (recarga) via Celcoin",
      inputSchema: {
        type: "object",
        properties: {
          phoneNumber: { type: "string", description: "Phone number with DDD (e.g., 11999999999)" },
          amount: { type: "number", description: "Top-up amount in BRL" },
          providerId: { type: "number", description: "Telecom provider ID" },
        },
        required: ["phoneNumber", "amount", "providerId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_pix_payment": {
        const payload = {
          amount: args?.amount,
          key: args?.pixKey,
          keyType: args?.pixKeyType,
          receiver: {
            name: args?.recipientName,
            document: args?.recipientDocument,
          },
          description: args?.description,
          endToEndId: args?.endToEndId,
        };
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("POST", "/pix/v1/payment", payload), null, 2) }] };
      }
      case "get_pix_payment":
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("GET", `/pix/v1/payment/status/${args?.transactionId}`), null, 2) }] };
      case "create_boleto":
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("POST", "/v5/transactions/billpayments/bankslip", args), null, 2) }] };
      case "get_boleto":
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("GET", `/v5/transactions/billpayments/bankslip/${args?.transactionId}`), null, 2) }] };
      case "create_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("POST", "/v5/transactions/transfer", args), null, 2) }] };
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("GET", "/v5/merchant/balance"), null, 2) }] };
      case "list_banks": {
        const params = args?.search ? `?name=${encodeURIComponent(String(args.search))}` : "";
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("GET", `/v5/transactions/institutions${params}`), null, 2) }] };
      }
      case "create_topup": {
        const payload = {
          phoneNumber: args?.phoneNumber,
          value: args?.amount,
          providerId: args?.providerId,
        };
        return { content: [{ type: "text", text: JSON.stringify(await celcoinRequest("POST", "/v5/transactions/topups", payload), null, 2) }] };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("CELCOIN_CLIENT_ID and CELCOIN_CLIENT_SECRET environment variables are required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
