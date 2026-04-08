#!/usr/bin/env node

/**
 * MCP Server for x402 — HTTP-native micropayments protocol by Coinbase.
 *
 * x402 enables machine-to-machine payments at the HTTP layer.
 * When a request returns HTTP 402 Payment Required, the client
 * automatically pays (USDC on Base/Solana) and retries.
 *
 * Tools:
 * - pay_request: Pay for a 402-protected resource and return its content
 * - verify_payment: Verify if a x402 payment was received and settled
 * - create_paywall: Create a x402 paywall configuration for an endpoint
 * - get_paywall: Get paywall configuration for a URL
 * - list_paywalls: List all configured paywalls
 * - delete_paywall: Remove a paywall from an endpoint
 * - get_balance: Get available USDC balance for x402 payments
 * - list_payments: List x402 payment history with filters
 * - get_payment: Get details of a specific x402 payment
 * - get_supported_networks: List supported blockchain networks and tokens
 *
 * Environment:
 *   X402_API_KEY       — API key for x402 facilitator
 *   X402_NETWORK       — Network: "base" (default) or "solana"
 *   X402_WALLET_ADDRESS — Wallet address for payments
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.X402_API_KEY || "";
const NETWORK = process.env.X402_NETWORK || "base";
const WALLET_ADDRESS = process.env.X402_WALLET_ADDRESS || "";
const BASE_URL = "https://api.x402.org/v1";

async function x402Request(method: string, path: string, body?: unknown): Promise<unknown> {
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
    throw new Error(`x402 API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-x402", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "pay_request",
      description: "Pay for a 402-protected resource. Sends USDC payment via x402 protocol and returns the resource content. The agent automatically handles the 402 handshake.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL of the 402-protected resource" },
          maxAmount: { type: "string", description: "Maximum USDC amount willing to pay (e.g. '0.01')" },
          network: { type: "string", enum: ["base", "solana"], description: "Blockchain network (default: base)" },
        },
        required: ["url", "maxAmount"],
      },
    },
    {
      name: "verify_payment",
      description: "Verify if a x402 payment was received and settled on-chain",
      inputSchema: {
        type: "object",
        properties: {
          paymentId: { type: "string", description: "Payment ID to verify" },
        },
        required: ["paymentId"],
      },
    },
    {
      name: "create_paywall",
      description: "Create a x402 paywall configuration for an endpoint. When requests hit this endpoint, they receive HTTP 402 with payment instructions.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL pattern to protect (e.g. 'https://api.example.com/premium/*')" },
          price: { type: "string", description: "Price in USDC per request (e.g. '0.001')" },
          recipientAddress: { type: "string", description: "Wallet address to receive payments" },
          network: { type: "string", enum: ["base", "solana"], description: "Blockchain network (default: base)" },
          description: { type: "string", description: "Description of the paywalled resource" },
        },
        required: ["url", "price", "recipientAddress"],
      },
    },
    {
      name: "get_paywall",
      description: "Get paywall configuration for a specific URL",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL of the paywalled resource" },
        },
        required: ["url"],
      },
    },
    {
      name: "list_paywalls",
      description: "List all configured x402 paywalls",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "inactive", "all"], description: "Filter by status" },
          pageSize: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "delete_paywall",
      description: "Remove a x402 paywall from an endpoint",
      inputSchema: {
        type: "object",
        properties: {
          paywallId: { type: "string", description: "Paywall ID to delete" },
        },
        required: ["paywallId"],
      },
    },
    {
      name: "get_balance",
      description: "Get available USDC balance for x402 payments",
      inputSchema: {
        type: "object",
        properties: {
          network: { type: "string", enum: ["base", "solana"], description: "Blockchain network" },
        },
      },
    },
    {
      name: "list_payments",
      description: "List x402 payment history with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["sent", "received", "all"], description: "Filter by payment direction" },
          status: { type: "string", enum: ["pending", "confirmed", "settled", "failed"], description: "Filter by status" },
          from: { type: "string", description: "Start date (ISO 8601)" },
          to: { type: "string", description: "End date (ISO 8601)" },
          pageSize: { type: "number", description: "Results per page" },
          cursor: { type: "string", description: "Pagination cursor" },
        },
      },
    },
    {
      name: "get_payment",
      description: "Get details of a specific x402 payment",
      inputSchema: {
        type: "object",
        properties: {
          paymentId: { type: "string", description: "Payment ID" },
        },
        required: ["paymentId"],
      },
    },
    {
      name: "get_supported_networks",
      description: "List supported blockchain networks, tokens, and facilitators for x402 payments",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "pay_request":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await x402Request("POST", "/payments/pay", {
              url: args?.url,
              maxAmount: args?.maxAmount,
              network: args?.network || NETWORK,
              walletAddress: WALLET_ADDRESS,
            }), null, 2),
          }],
        };

      case "verify_payment":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await x402Request("GET", `/payments/${args?.paymentId}/verify`), null, 2),
          }],
        };

      case "create_paywall":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await x402Request("POST", "/paywalls", {
              url: args?.url,
              price: args?.price,
              recipientAddress: args?.recipientAddress,
              network: args?.network || NETWORK,
              description: args?.description,
            }), null, 2),
          }],
        };

      case "get_paywall": {
        const encoded = encodeURIComponent(String(args?.url));
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await x402Request("GET", `/paywalls?url=${encoded}`), null, 2),
          }],
        };
      }

      case "list_paywalls": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.pageSize) params.set("pageSize", String(args.pageSize));
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await x402Request("GET", `/paywalls?${params}`), null, 2),
          }],
        };
      }

      case "delete_paywall":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await x402Request("DELETE", `/paywalls/${args?.paywallId}`), null, 2),
          }],
        };

      case "get_balance": {
        const network = args?.network || NETWORK;
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await x402Request("GET", `/balance?network=${network}&wallet=${WALLET_ADDRESS}`), null, 2),
          }],
        };
      }

      case "list_payments": {
        const params = new URLSearchParams();
        if (args?.direction) params.set("direction", String(args.direction));
        if (args?.status) params.set("status", String(args.status));
        if (args?.from) params.set("from", String(args.from));
        if (args?.to) params.set("to", String(args.to));
        if (args?.pageSize) params.set("pageSize", String(args.pageSize));
        if (args?.cursor) params.set("cursor", String(args.cursor));
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await x402Request("GET", `/payments?${params}`), null, 2),
          }],
        };
      }

      case "get_payment":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await x402Request("GET", `/payments/${args?.paymentId}`), null, 2),
          }],
        };

      case "get_supported_networks":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await x402Request("GET", "/networks"), null, 2),
          }],
        };

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!API_KEY) {
    console.error("X402_API_KEY environment variable is required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
