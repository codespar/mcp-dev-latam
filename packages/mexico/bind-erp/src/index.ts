#!/usr/bin/env node

/**
 * MCP Server for Bind ERP — Mexican cloud ERP.
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
 * - list_invoices: List invoices
 * - create_invoice: Create an invoice
 * - get_invoice: Get an invoice (CFDI)
 * - cancel_invoice: Cancel an invoice (CFDI)
 * - list_orders: List orders
 * - create_order: Create an order
 * - get_balance: Get account balance
 * - list_accounts: List accounts
 * - list_suppliers: List suppliers (proveedores)
 * - create_supplier: Create a supplier (proveedor)
 * - list_payments: List payments (pagos)
 * - create_payment: Register a payment (pago)
 *
 * Environment:
 *   BIND_API_KEY — API key for authentication
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.BIND_API_KEY || "";
const BASE_URL = "https://api.bind.com.mx/api/v1";

async function bindRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers["X-API-KEY"] = API_KEY;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Bind ERP API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-bind-erp", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_customers",
      description: "List customers",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
          search: { type: "string", description: "Search term" },
        },
      },
    },
    {
      name: "create_customer",
      description: "Create a customer",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer name" },
          rfc: { type: "string", description: "RFC (tax ID)" },
          email: { type: "string", description: "Email address" },
          phone: { type: "string", description: "Phone number" },
          address: { type: "string", description: "Street address" },
          city: { type: "string", description: "City" },
          state: { type: "string", description: "State" },
          zip: { type: "string", description: "Postal code" },
        },
        required: ["name"],
      },
    },
    {
      name: "list_products",
      description: "List products",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
          search: { type: "string", description: "Search term" },
        },
      },
    },
    {
      name: "create_product",
      description: "Create a product",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Product name" },
          sku: { type: "string", description: "SKU code" },
          price: { type: "number", description: "Unit price" },
          cost: { type: "number", description: "Unit cost" },
          description: { type: "string", description: "Product description" },
          sat_key: { type: "string", description: "SAT product key" },
          unit: { type: "string", description: "Unit of measure" },
          tax_rate: { type: "number", description: "Tax rate (e.g. 0.16 for 16% IVA)" },
        },
        required: ["name", "price"],
      },
    },
    {
      name: "list_invoices",
      description: "List invoices",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
          status: { type: "string", description: "Invoice status filter" },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
      },
    },
    {
      name: "create_invoice",
      description: "Create an invoice",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Customer ID" },
          items: {
            type: "array",
            description: "Invoice line items",
            items: {
              type: "object",
              properties: {
                product_id: { type: "string", description: "Product ID" },
                quantity: { type: "number", description: "Quantity" },
                price: { type: "number", description: "Unit price override" },
                discount: { type: "number", description: "Discount percentage" },
              },
              required: ["product_id", "quantity"],
            },
          },
          payment_form: { type: "string", description: "SAT payment form code" },
          payment_method: { type: "string", description: "PUE or PPD" },
          use: { type: "string", description: "CFDI use code" },
          notes: { type: "string", description: "Invoice notes" },
        },
        required: ["customer_id", "items"],
      },
    },
    {
      name: "list_orders",
      description: "List orders",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
          status: { type: "string", description: "Order status filter" },
        },
      },
    },
    {
      name: "create_order",
      description: "Create an order",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Customer ID" },
          items: {
            type: "array",
            description: "Order line items",
            items: {
              type: "object",
              properties: {
                product_id: { type: "string", description: "Product ID" },
                quantity: { type: "number", description: "Quantity" },
                price: { type: "number", description: "Unit price override" },
              },
              required: ["product_id", "quantity"],
            },
          },
          notes: { type: "string", description: "Order notes" },
        },
        required: ["customer_id", "items"],
      },
    },
    {
      name: "get_balance",
      description: "Get account balance summary",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Account ID (optional)" },
        },
      },
    },
    {
      name: "list_accounts",
      description: "List accounts (bank accounts, cash, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "update_customer",
      description: "Update an existing customer",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Customer ID" },
          name: { type: "string", description: "Customer name" },
          rfc: { type: "string", description: "RFC (tax ID)" },
          email: { type: "string", description: "Email address" },
          phone: { type: "string", description: "Phone number" },
          address: { type: "string", description: "Street address" },
          city: { type: "string", description: "City" },
          state: { type: "string", description: "State" },
          zip: { type: "string", description: "Postal code" },
        },
        required: ["customer_id"],
      },
    },
    {
      name: "delete_customer",
      description: "Delete a customer by ID",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Customer ID" },
        },
        required: ["customer_id"],
      },
    },
    {
      name: "update_product",
      description: "Update an existing product",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Product ID" },
          name: { type: "string", description: "Product name" },
          sku: { type: "string", description: "SKU code" },
          price: { type: "number", description: "Unit price" },
          cost: { type: "number", description: "Unit cost" },
          description: { type: "string", description: "Product description" },
          sat_key: { type: "string", description: "SAT product key" },
          unit: { type: "string", description: "Unit of measure" },
          tax_rate: { type: "number", description: "Tax rate (e.g. 0.16 for 16% IVA)" },
        },
        required: ["product_id"],
      },
    },
    {
      name: "delete_product",
      description: "Delete a product by ID",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Product ID" },
        },
        required: ["product_id"],
      },
    },
    {
      name: "get_invoice",
      description: "Get an invoice (CFDI) by ID",
      inputSchema: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "Invoice ID" },
        },
        required: ["invoice_id"],
      },
    },
    {
      name: "cancel_invoice",
      description: "Cancel an invoice (CFDI) by ID",
      inputSchema: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "Invoice ID" },
          reason: { type: "string", description: "SAT cancellation reason code (e.g. 01, 02, 03, 04)" },
          replacement_uuid: { type: "string", description: "UUID of replacement CFDI (required for reason 01)" },
        },
        required: ["invoice_id"],
      },
    },
    {
      name: "list_suppliers",
      description: "List suppliers (proveedores)",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
          search: { type: "string", description: "Search term" },
        },
      },
    },
    {
      name: "create_supplier",
      description: "Create a supplier (proveedor)",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Supplier name" },
          rfc: { type: "string", description: "RFC (tax ID)" },
          email: { type: "string", description: "Email address" },
          phone: { type: "string", description: "Phone number" },
          address: { type: "string", description: "Street address" },
          city: { type: "string", description: "City" },
          state: { type: "string", description: "State" },
          zip: { type: "string", description: "Postal code" },
        },
        required: ["name"],
      },
    },
    {
      name: "list_payments",
      description: "List payments (pagos)",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
      },
    },
    {
      name: "create_payment",
      description: "Register a payment (pago) against an invoice",
      inputSchema: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "Invoice ID being paid" },
          amount: { type: "number", description: "Payment amount" },
          payment_date: { type: "string", description: "Payment date (YYYY-MM-DD)" },
          payment_form: { type: "string", description: "SAT payment form code" },
          account_id: { type: "string", description: "Receiving account ID" },
          reference: { type: "string", description: "Payment reference / folio" },
          notes: { type: "string", description: "Payment notes" },
        },
        required: ["invoice_id", "amount"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_customers": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.search) params.set("search", String(args.search));
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("GET", `/customers?${params}`), null, 2) }] };
      }
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("POST", "/customers", {
          name: args?.name,
          rfc: args?.rfc,
          email: args?.email,
          phone: args?.phone,
          address: args?.address,
          city: args?.city,
          state: args?.state,
          zip: args?.zip,
        }), null, 2) }] };
      case "list_products": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.search) params.set("search", String(args.search));
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("GET", `/products?${params}`), null, 2) }] };
      }
      case "create_product":
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("POST", "/products", {
          name: args?.name,
          sku: args?.sku,
          price: args?.price,
          cost: args?.cost,
          description: args?.description,
          sat_key: args?.sat_key,
          unit: args?.unit,
          tax_rate: args?.tax_rate,
        }), null, 2) }] };
      case "list_invoices": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.status) params.set("status", String(args.status));
        if (args?.date_from) params.set("date_from", String(args.date_from));
        if (args?.date_to) params.set("date_to", String(args.date_to));
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("GET", `/invoices?${params}`), null, 2) }] };
      }
      case "create_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("POST", "/invoices", {
          customer_id: args?.customer_id,
          items: args?.items,
          payment_form: args?.payment_form,
          payment_method: args?.payment_method,
          use: args?.use,
          notes: args?.notes,
        }), null, 2) }] };
      case "list_orders": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.status) params.set("status", String(args.status));
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("GET", `/orders?${params}`), null, 2) }] };
      }
      case "create_order":
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("POST", "/orders", {
          customer_id: args?.customer_id,
          items: args?.items,
          notes: args?.notes,
        }), null, 2) }] };
      case "get_balance": {
        const path = args?.account_id ? `/accounts/${args.account_id}/balance` : "/accounts/balance";
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("GET", path), null, 2) }] };
      }
      case "list_accounts": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("GET", `/accounts?${params}`), null, 2) }] };
      }
      case "update_customer":
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("PUT", `/customers/${args?.customer_id}`, {
          name: args?.name,
          rfc: args?.rfc,
          email: args?.email,
          phone: args?.phone,
          address: args?.address,
          city: args?.city,
          state: args?.state,
          zip: args?.zip,
        }), null, 2) }] };
      case "delete_customer":
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("DELETE", `/customers/${args?.customer_id}`), null, 2) }] };
      case "update_product":
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("PUT", `/products/${args?.product_id}`, {
          name: args?.name,
          sku: args?.sku,
          price: args?.price,
          cost: args?.cost,
          description: args?.description,
          sat_key: args?.sat_key,
          unit: args?.unit,
          tax_rate: args?.tax_rate,
        }), null, 2) }] };
      case "delete_product":
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("DELETE", `/products/${args?.product_id}`), null, 2) }] };
      case "get_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("GET", `/invoices/${args?.invoice_id}`), null, 2) }] };
      case "cancel_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("POST", `/invoices/${args?.invoice_id}/cancel`, {
          reason: args?.reason,
          replacement_uuid: args?.replacement_uuid,
        }), null, 2) }] };
      case "list_suppliers": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.search) params.set("search", String(args.search));
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("GET", `/suppliers?${params}`), null, 2) }] };
      }
      case "create_supplier":
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("POST", "/suppliers", {
          name: args?.name,
          rfc: args?.rfc,
          email: args?.email,
          phone: args?.phone,
          address: args?.address,
          city: args?.city,
          state: args?.state,
          zip: args?.zip,
        }), null, 2) }] };
      case "list_payments": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.date_from) params.set("date_from", String(args.date_from));
        if (args?.date_to) params.set("date_to", String(args.date_to));
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("GET", `/payments?${params}`), null, 2) }] };
      }
      case "create_payment":
        return { content: [{ type: "text", text: JSON.stringify(await bindRequest("POST", "/payments", {
          invoice_id: args?.invoice_id,
          amount: args?.amount,
          payment_date: args?.payment_date,
          payment_form: args?.payment_form,
          account_id: args?.account_id,
          reference: args?.reference,
          notes: args?.notes,
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
        const s = new Server({ name: "mcp-bind-erp", version: "0.2.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
