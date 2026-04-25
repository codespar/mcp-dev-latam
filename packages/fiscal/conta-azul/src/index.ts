#!/usr/bin/env node

/**
 * MCP Server for Conta Azul — Brazilian accounting and invoicing platform.
 *
 * Tools:
 * - list_customers: List customers
 * - create_customer: Create a customer
 * - update_customer: Update a customer
 * - delete_customer: Delete a customer
 * - list_products: List products
 * - create_product: Create a product
 * - update_product: Update a product
 * - delete_product: Delete a product
 * - list_sales: List sales
 * - create_sale: Create a sale
 * - get_sale: Get sale by id
 * - cancel_sale: Cancel a sale
 * - list_services: List services
 * - create_service: Create a service
 * - update_service: Update a service
 * - delete_service: Delete a service
 * - get_financial_summary: Get financial summary
 * - list_categories: List categories
 * - list_bank_accounts: List bank accounts
 * - list_accounts_receivable: List accounts receivable
 *
 * Environment:
 *   CONTA_AZUL_ACCESS_TOKEN — OAuth2 access token
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
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
  // DELETE / cancel may return 204 No Content
  const text = await res.text();
  if (!text) return { ok: true };
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

const server = new Server(
  { name: "mcp-conta-azul", version: "0.2.0" },
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
      name: "update_customer",
      description: "Update a customer in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Customer UUID" },
          name: { type: "string", description: "Customer name" },
          company_name: { type: "string", description: "Company name" },
          email: { type: "string", description: "Email address" },
          document: { type: "string", description: "CPF or CNPJ" },
          person_type: { type: "string", enum: ["NATURAL", "LEGAL"], description: "Person type" },
          phone: { type: "string", description: "Phone number" },
          state_registration: { type: "string", description: "State registration (IE)" },
        },
        required: ["customer_id"],
      },
    },
    {
      name: "delete_customer",
      description: "Delete a customer in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Customer UUID" },
        },
        required: ["customer_id"],
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
      name: "update_product",
      description: "Update a product in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Product UUID" },
          name: { type: "string", description: "Product name" },
          value: { type: "number", description: "Unit price" },
          cost: { type: "number", description: "Cost price" },
          code: { type: "string", description: "Product code/SKU" },
          barcode: { type: "string", description: "Barcode (EAN)" },
          category_id: { type: "string", description: "Category UUID" },
          net_weight: { type: "number", description: "Net weight in kg" },
          ncm: { type: "string", description: "NCM fiscal code" },
        },
        required: ["product_id"],
      },
    },
    {
      name: "delete_product",
      description: "Delete a product in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Product UUID" },
        },
        required: ["product_id"],
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
      name: "get_sale",
      description: "Get a sale by id in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          sale_id: { type: "string", description: "Sale UUID" },
        },
        required: ["sale_id"],
      },
    },
    {
      name: "cancel_sale",
      description: "Cancel a sale in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          sale_id: { type: "string", description: "Sale UUID" },
        },
        required: ["sale_id"],
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
      name: "update_service",
      description: "Update a service in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          service_id: { type: "string", description: "Service UUID" },
          name: { type: "string", description: "Service name" },
          value: { type: "number", description: "Service price" },
          cost: { type: "number", description: "Service cost" },
          code: { type: "string", description: "Service code" },
        },
        required: ["service_id"],
      },
    },
    {
      name: "delete_service",
      description: "Delete a service in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          service_id: { type: "string", description: "Service UUID" },
        },
        required: ["service_id"],
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
    {
      name: "list_bank_accounts",
      description: "List bank accounts in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          size: { type: "number", description: "Items per page" },
        },
      },
    },
    {
      name: "list_accounts_receivable",
      description: "List accounts receivable (financial events to receive) in Conta Azul",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["PENDING", "PAID", "OVERDUE"], description: "Filter by status" },
          start_date: { type: "string", description: "Due date start (YYYY-MM-DD)" },
          end_date: { type: "string", description: "Due date end (YYYY-MM-DD)" },
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
      case "update_customer": {
        const { customer_id, ...body } = (args ?? {}) as { customer_id?: string; [k: string]: unknown };
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("PUT", `/customers/${customer_id}`, body), null, 2) }] };
      }
      case "delete_customer":
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("DELETE", `/customers/${args?.customer_id}`), null, 2) }] };
      case "list_products": {
        const params = new URLSearchParams();
        if (args?.search) params.set("search", String(args.search));
        if (args?.page) params.set("page", String(args.page));
        if (args?.size) params.set("size", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("GET", `/products?${params}`), null, 2) }] };
      }
      case "create_product":
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("POST", "/products", args), null, 2) }] };
      case "update_product": {
        const { product_id, ...body } = (args ?? {}) as { product_id?: string; [k: string]: unknown };
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("PUT", `/products/${product_id}`, body), null, 2) }] };
      }
      case "delete_product":
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("DELETE", `/products/${args?.product_id}`), null, 2) }] };
      case "list_sales": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.page) params.set("page", String(args.page));
        if (args?.size) params.set("size", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("GET", `/sales?${params}`), null, 2) }] };
      }
      case "create_sale":
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("POST", "/sales", args), null, 2) }] };
      case "get_sale":
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("GET", `/sales/${args?.sale_id}`), null, 2) }] };
      case "cancel_sale":
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("POST", `/sales/${args?.sale_id}/cancel`), null, 2) }] };
      case "list_services": {
        const params = new URLSearchParams();
        if (args?.search) params.set("search", String(args.search));
        if (args?.page) params.set("page", String(args.page));
        if (args?.size) params.set("size", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("GET", `/services?${params}`), null, 2) }] };
      }
      case "create_service":
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("POST", "/services", args), null, 2) }] };
      case "update_service": {
        const { service_id, ...body } = (args ?? {}) as { service_id?: string; [k: string]: unknown };
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("PUT", `/services/${service_id}`, body), null, 2) }] };
      }
      case "delete_service":
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("DELETE", `/services/${args?.service_id}`), null, 2) }] };
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
      case "list_bank_accounts": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.size) params.set("size", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("GET", `/bank-accounts?${params}`), null, 2) }] };
      }
      case "list_accounts_receivable": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.start_date) params.set("start_date", String(args.start_date));
        if (args?.end_date) params.set("end_date", String(args.end_date));
        if (args?.page) params.set("page", String(args.page));
        if (args?.size) params.set("size", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await contaAzulRequest("GET", `/financial-events/receivable?${params}`), null, 2) }] };
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
    app.get("/health", (_req: any, res: any) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: any, res: any) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req, res, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-conta-azul", version: "0.2.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
