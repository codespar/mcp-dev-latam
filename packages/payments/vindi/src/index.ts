#!/usr/bin/env node

/**
 * MCP Server for Vindi — Brazilian recurring billing platform.
 *
 * Tools:
 * - create_subscription: Create a recurring subscription
 * - get_subscription: Get subscription details
 * - list_subscriptions: List subscriptions with filters
 * - create_bill: Create a bill (charge)
 * - get_bill: Get bill details
 * - list_bills: List bills with filters
 * - create_customer: Create a customer
 * - get_customer: Get customer details
 * - create_plan: Create a billing plan
 * - list_plans: List available plans
 *
 * Environment:
 *   VINDI_API_KEY — API key from https://app.vindi.com.br/
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.VINDI_API_KEY || "";
const BASE_URL = "https://app.vindi.com.br/api/v1";

async function vindiRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const credentials = btoa(`${API_KEY}:`);
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${credentials}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vindi API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-vindi", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_subscription",
      description: "Create a recurring subscription in Vindi",
      inputSchema: {
        type: "object",
        properties: {
          plan_id: { type: "number", description: "Plan ID" },
          customer_id: { type: "number", description: "Customer ID" },
          payment_method_code: { type: "string", description: "Payment method (credit_card, bank_slip, pix)" },
          start_at: { type: "string", description: "Start date (YYYY-MM-DD)" },
        },
        required: ["plan_id", "customer_id", "payment_method_code"],
      },
    },
    {
      name: "get_subscription",
      description: "Get subscription details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Subscription ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_subscriptions",
      description: "List subscriptions with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Items per page (default 25)" },
          status: { type: "string", enum: ["active", "canceled", "expired"], description: "Filter by status" },
        },
      },
    },
    {
      name: "create_bill",
      description: "Create a bill (charge) in Vindi",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "number", description: "Customer ID" },
          payment_method_code: { type: "string", description: "Payment method (credit_card, bank_slip, pix)" },
          bill_items: {
            type: "array",
            description: "Line items with product_id, amount, and quantity",
            items: {
              type: "object",
              properties: {
                product_id: { type: "number" },
                amount: { type: "number" },
                quantity: { type: "number" },
              },
            },
          },
        },
        required: ["customer_id", "payment_method_code", "bill_items"],
      },
    },
    {
      name: "get_bill",
      description: "Get bill details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Bill ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_bills",
      description: "List bills with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Items per page" },
          status: { type: "string", enum: ["pending", "paid", "canceled"], description: "Filter by status" },
        },
      },
    },
    {
      name: "create_customer",
      description: "Create a customer in Vindi",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer name" },
          email: { type: "string", description: "Email address" },
          registry_code: { type: "string", description: "CPF or CNPJ" },
          phones: {
            type: "array",
            description: "Phone numbers",
            items: {
              type: "object",
              properties: {
                phone_type: { type: "string", enum: ["mobile", "landline"] },
                number: { type: "string" },
              },
            },
          },
        },
        required: ["name", "email"],
      },
    },
    {
      name: "get_customer",
      description: "Get customer details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Customer ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_plan",
      description: "Create a billing plan in Vindi",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Plan name" },
          interval: { type: "string", enum: ["days", "months"], description: "Billing interval unit" },
          interval_count: { type: "number", description: "Number of intervals between billings" },
          billing_trigger_type: { type: "string", enum: ["beginning_of_period", "end_of_period"], description: "When to bill" },
          plan_items: {
            type: "array",
            description: "Plan items with product_id and cycles",
            items: {
              type: "object",
              properties: {
                product_id: { type: "number" },
                cycles: { type: "number" },
              },
            },
          },
        },
        required: ["name", "interval", "interval_count"],
      },
    },
    {
      name: "list_plans",
      description: "List available billing plans",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Items per page" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("POST", "/subscriptions", args), null, 2) }] };
      case "get_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("GET", `/subscriptions/${args?.id}`), null, 2) }] };
      case "list_subscriptions": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.status) params.set("query", `status=${args.status}`);
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("GET", `/subscriptions?${params}`), null, 2) }] };
      }
      case "create_bill":
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("POST", "/bills", args), null, 2) }] };
      case "get_bill":
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("GET", `/bills/${args?.id}`), null, 2) }] };
      case "list_bills": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.status) params.set("query", `status=${args.status}`);
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("GET", `/bills?${params}`), null, 2) }] };
      }
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("POST", "/customers", args), null, 2) }] };
      case "get_customer":
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("GET", `/customers/${args?.id}`), null, 2) }] };
      case "create_plan":
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("POST", "/plans", args), null, 2) }] };
      case "list_plans": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("GET", `/plans?${params}`), null, 2) }] };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!API_KEY) {
    console.error("VINDI_API_KEY environment variable is required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
