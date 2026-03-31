#!/usr/bin/env node

/**
 * MCP Server for Conta Azul — Brazilian accounting and invoicing platform.
 *
 * Tools:
 * - list_customers: List customers
 * - create_customer: Create a customer
 * - list_products: List products
 * - create_product: Create a product
 * - list_sales: List sales
 * - create_sale: Create a sale
 * - list_services: List services
 * - create_service: Create a service
 * - get_financial_summary: Get financial summary
 * - list_categories: List categories
 *
 * Environment:
 *   CONTA_AZUL_ACCESS_TOKEN — OAuth2 access token
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ACCESS_TOKEN = process.env.CONTA_AZUL_ACCESS_TOKEN || "";
const BASE_URL = "https://api.contaazul.com/v1";

async function contaAzulRequest(method: string, path: string, body?: unknown): Promise<unknown> {
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
    throw new Error(`Conta Azul API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-conta-azul", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_customers",
      description: "List customers in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by name or document" },
          page: { type: "number", description: "Page number (starts at 0)" },
          size: { type: "number", description: "Items per page (default 20)" },
        },
      },
    },
    {
      name: "create_customer",
      description: "Create a customer in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer name" },
          company_name: { type: "string", description: "Company name (for legal entities)" },
          email: { type: "string", description: "Email address" },
          document: { type: "string", description: "CPF or CNPJ" },
          person_type: { type: "string", enum: ["NATURAL", "LEGAL"], description: "Person type" },
          phone: { type: "string", description: "Phone number" },
          state_registration: { type: "string", description: "State registration (IE)" },
        },
        required: ["name", "person_type"],
      },
    },
    {
      name: "list_products",
      description: "List products in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by name" },
          page: { type: "number", description: "Page number" },
          size: { type: "number", description: "Items per page" },
        },
      },
    },
    {
      name: "create_product",
      description: "Create a product in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Product name" },
          value: { type: "number", description: "Unit price" },
          cost: { type: "number", description: "Cost price" },
          code: { type: "string", description: "Product code/SKU" },
          barcode: { type: "string", description: "Barcode (EAN)" },
          category_id: { type: "string", description: "Category UUID" },
          net_weight: { type: "number", description: "Net weight in kg" },
          ncm: { type: "string", description: "NCM fiscal code" },
        },
        required: ["name", "value"],
      },
    },
    {
      name: "list_sales",
      description: "List sales in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["COMMITTED", "PENDING", "CANCELLED"], description: "Filter by status" },
          page: { type: "number", description: "Page number" },
          size: { type: "number", description: "Items per page" },
        },
      },
    },
    {
      name: "create_sale",
      description: "Create a sale in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Customer UUID" },
          emission: { type: "string", description: "Emission date (YYYY-MM-DD)" },
          status: { type: "string", enum: ["COMMITTED", "PENDING"], description: "Sale status" },
          products: {
            type: "array",
            description: "Sale line items",
            items: {
              type: "object",
              properties: {
                product_id: { type: "string" },
                quantity: { type: "number" },
                value: { type: "number" },
              },
            },
          },
          notes: { type: "string", description: "Sale notes" },
        },
        required: ["customer_id", "emission", "status", "products"],
      },
    },
    {
      name: "list_services",
      description: "List services in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Search by name" },
          page: { type: "number", description: "Page number" },
          size: { type: "number", description: "Items per page" },
        },
      },
    },
    {
      name: "create_service",
      description: "Create a service in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Service name" },
          value: { type: "number", description: "Service price" },
          cost: { type: "number", description: "Service cost" },
          code: { type: "string", description: "Service code" },
        },
        required: ["name", "value"],
      },
    },
    {
      name: "get_financial_summary",
      description: "Get financial summary from Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
          end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
        required: ["start_date", "end_date"],
      },
    },
    {
      name: "list_categories",
      description: "List product/service categories",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          size: { type: "number", description: "Items per page" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_customers": {
        const params = new URLSearchParams();
        if (args?.search) params.set("search", String(args.search));
        if (args?.page) params.set("page", String(args.page));
        if (args?.size) params.set("size", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("GET", `/customers?${params}`), null, 2) }] };
      }
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("POST", "/customers", args), null, 2) }] };
      case "list_products": {
        const params = new URLSearchParams();
        if (args?.search) params.set("search", String(args.search));
        if (args?.page) params.set("page", String(args.page));
        if (args?.size) params.set("size", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("GET", `/products?${params}`), null, 2) }] };
      }
      case "create_product":
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("POST", "/products", args), null, 2) }] };
      case "list_sales": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.page) params.set("page", String(args.page));
        if (args?.size) params.set("size", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("GET", `/sales?${params}`), null, 2) }] };
      }
      case "create_sale":
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("POST", "/sales", args), null, 2) }] };
      case "list_services": {
        const params = new URLSearchParams();
        if (args?.search) params.set("search", String(args.search));
        if (args?.page) params.set("page", String(args.page));
        if (args?.size) params.set("size", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("GET", `/services?${params}`), null, 2) }] };
      }
      case "create_service":
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("POST", "/services", args), null, 2) }] };
      case "get_financial_summary": {
        const params = new URLSearchParams();
        params.set("start_date", String(args?.start_date));
        params.set("end_date", String(args?.end_date));
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("GET", `/financial/summary?${params}`), null, 2) }] };
      }
      case "list_categories": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.size) params.set("size", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("GET", `/categories?${params}`), null, 2) }] };
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
    console.error("CONTA_AZUL_ACCESS_TOKEN environment variable is required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
