#!/usr/bin/env node

/**
 * MCP Server for Tienda Nube — LATAM e-commerce platform (Nuvemshop).
 *
 * Tools:
 * - list_products: List products
 * - get_product: Get product by ID
 * - create_product: Create a product
 * - update_product: Update a product
 * - list_orders: List orders
 * - get_order: Get order by ID
 * - list_customers: List customers
 * - get_customer: Get customer by ID
 * - list_categories: List product categories
 * - update_order_status: Update order fulfillment status
 *
 * Environment:
 *   TIENDANUBE_ACCESS_TOKEN — Access token
 *   TIENDANUBE_STORE_ID     — Store identifier
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ACCESS_TOKEN = process.env.TIENDANUBE_ACCESS_TOKEN || "";
const STORE_ID = process.env.TIENDANUBE_STORE_ID || "";
const BASE_URL = `https://api.tiendanube.com/v1/${STORE_ID}`;

async function tiendaNubeRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authentication": `bearer ${ACCESS_TOKEN}`,
    "User-Agent": "MCP Tienda Nube Server/0.1.0",
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Tienda Nube API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-tienda-nube", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_products",
      description: "List products from the store",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page (max 200)" },
          since_id: { type: "number", description: "Filter products after this ID" },
          created_at_min: { type: "string", description: "Min creation date (ISO 8601)" },
          created_at_max: { type: "string", description: "Max creation date (ISO 8601)" },
        },
      },
    },
    {
      name: "get_product",
      description: "Get product details by ID",
      inputSchema: {
        type: "object",
        properties: { productId: { type: "number", description: "Product ID" } },
        required: ["productId"],
      },
    },
    {
      name: "create_product",
      description: "Create a new product",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "object", description: "Product name by locale, e.g. {\"es\":\"Producto\"}", properties: { es: { type: "string" }, pt: { type: "string" }, en: { type: "string" } } },
          variants: {
            type: "array",
            description: "Product variants",
            items: {
              type: "object",
              properties: {
                price: { type: "string", description: "Price" },
                stock: { type: "number", description: "Stock quantity" },
                sku: { type: "string", description: "SKU" },
                weight: { type: "string", description: "Weight in kg" },
              },
              required: ["price"],
            },
          },
          description: { type: "object", description: "Description by locale", properties: { es: { type: "string" }, pt: { type: "string" } } },
          published: { type: "boolean", description: "Whether the product is published" },
          categories: { type: "array", description: "Category IDs", items: { type: "number" } },
        },
        required: ["name", "variants"],
      },
    },
    {
      name: "update_product",
      description: "Update an existing product",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "number", description: "Product ID" },
          name: { type: "object", description: "Product name by locale", properties: { es: { type: "string" }, pt: { type: "string" } } },
          description: { type: "object", description: "Description by locale", properties: { es: { type: "string" }, pt: { type: "string" } } },
          published: { type: "boolean", description: "Whether the product is published" },
        },
        required: ["productId"],
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
          status: { type: "string", description: "Order status (open, closed, cancelled)" },
          payment_status: { type: "string", description: "Payment status (pending, paid, refunded)" },
          shipping_status: { type: "string", description: "Shipping status (unpacked, shipped, delivered)" },
        },
      },
    },
    {
      name: "get_order",
      description: "Get order details by ID",
      inputSchema: {
        type: "object",
        properties: { orderId: { type: "number", description: "Order ID" } },
        required: ["orderId"],
      },
    },
    {
      name: "list_customers",
      description: "List customers",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
          since_id: { type: "number", description: "Filter customers after this ID" },
          q: { type: "string", description: "Search query (name, email)" },
        },
      },
    },
    {
      name: "get_customer",
      description: "Get customer details by ID",
      inputSchema: {
        type: "object",
        properties: { customerId: { type: "number", description: "Customer ID" } },
        required: ["customerId"],
      },
    },
    {
      name: "list_categories",
      description: "List product categories",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "update_order_status",
      description: "Update order fulfillment/shipping status",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "number", description: "Order ID" },
          status: { type: "string", description: "New status (open, closed, cancelled)" },
          shipping_status: { type: "string", description: "Shipping status (unpacked, shipped, delivered)" },
          tracking_number: { type: "string", description: "Tracking number" },
          tracking_url: { type: "string", description: "Tracking URL" },
          shipping_carrier: { type: "string", description: "Shipping carrier name" },
        },
        required: ["orderId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_products": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.since_id) params.set("since_id", String(args.since_id));
        if (args?.created_at_min) params.set("created_at_min", args.created_at_min);
        if (args?.created_at_max) params.set("created_at_max", args.created_at_max);
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("GET", `/products?${params}`), null, 2) }] };
      }
      case "get_product":
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("GET", `/products/${args?.productId}`), null, 2) }] };
      case "create_product":
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("POST", "/products", {
          name: args?.name,
          variants: args?.variants,
          description: args?.description,
          published: args?.published,
          categories: args?.categories,
        }), null, 2) }] };
      case "update_product": {
        const payload: any = {};
        if (args?.name) payload.name = args.name;
        if (args?.description) payload.description = args.description;
        if (args?.published !== undefined) payload.published = args.published;
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("PUT", `/products/${args?.productId}`, payload), null, 2) }] };
      }
      case "list_orders": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.status) params.set("status", args.status);
        if (args?.payment_status) params.set("payment_status", args.payment_status);
        if (args?.shipping_status) params.set("shipping_status", args.shipping_status);
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("GET", `/orders?${params}`), null, 2) }] };
      }
      case "get_order":
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("GET", `/orders/${args?.orderId}`), null, 2) }] };
      case "list_customers": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.since_id) params.set("since_id", String(args.since_id));
        if (args?.q) params.set("q", args.q);
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("GET", `/customers?${params}`), null, 2) }] };
      }
      case "get_customer":
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("GET", `/customers/${args?.customerId}`), null, 2) }] };
      case "list_categories": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("GET", `/categories?${params}`), null, 2) }] };
      }
      case "update_order_status": {
        const payload: any = {};
        if (args?.status) payload.status = args.status;
        if (args?.shipping_status) payload.shipping_status = args.shipping_status;
        if (args?.tracking_number) payload.tracking_number = args.tracking_number;
        if (args?.tracking_url) payload.tracking_url = args.tracking_url;
        if (args?.shipping_carrier) payload.shipping_carrier = args.shipping_carrier;
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("PUT", `/orders/${args?.orderId}`, payload), null, 2) }] };
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
        const s = new Server({ name: "mcp-tienda-nube", version: "0.1.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
