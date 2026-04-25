#!/usr/bin/env node

/**
 * MCP Server for Tienda Nube — LATAM e-commerce platform (Nuvemshop).
 *
 * Tools:
 * - list_products: List products
 * - get_product: Get product by ID
 * - create_product: Create a product
 * - update_product: Update a product
 * - delete_product: Delete a product
 * - list_product_variants: List variants of a product
 * - update_product_variant: Update a product variant (price, stock, sku)
 * - list_orders: List orders
 * - get_order: Get order by ID
 * - update_order_status: Update order fulfillment/shipping status
 * - close_order: Close an order
 * - cancel_order: Cancel an order
 * - list_customers: List customers
 * - get_customer: Get customer by ID
 * - list_categories: List product categories
 * - create_category: Create a category
 * - update_category: Update a category
 * - delete_category: Delete a category
 * - list_webhooks: List configured webhooks
 * - create_webhook: Subscribe to a webhook event
 * - delete_webhook: Delete a webhook
 * - list_discount_coupons: List discount coupons
 * - create_discount_coupon: Create a discount coupon
 * - list_abandoned_carts: List abandoned checkouts
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
    "User-Agent": "MCP Tienda Nube Server/0.2.0",
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
  { name: "mcp-tienda-nube", version: "0.2.1" },
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
    {
      name: "delete_product",
      description: "Delete a product by ID",
      inputSchema: {
        type: "object",
        properties: { productId: { type: "number", description: "Product ID" } },
        required: ["productId"],
      },
    },
    {
      name: "list_product_variants",
      description: "List variants of a product",
      inputSchema: {
        type: "object",
        properties: { productId: { type: "number", description: "Product ID" } },
        required: ["productId"],
      },
    },
    {
      name: "update_product_variant",
      description: "Update a product variant (price, stock, sku, weight)",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "number", description: "Product ID" },
          variantId: { type: "number", description: "Variant ID" },
          price: { type: "string", description: "Price" },
          promotional_price: { type: "string", description: "Promotional price" },
          stock: { type: "number", description: "Stock quantity" },
          sku: { type: "string", description: "SKU" },
          weight: { type: "string", description: "Weight in kg" },
        },
        required: ["productId", "variantId"],
      },
    },
    {
      name: "close_order",
      description: "Close an order (mark as fulfilled/closed)",
      inputSchema: {
        type: "object",
        properties: { orderId: { type: "number", description: "Order ID" } },
        required: ["orderId"],
      },
    },
    {
      name: "cancel_order",
      description: "Cancel an order, optionally restocking and refunding",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "number", description: "Order ID" },
          reason: { type: "string", description: "Cancellation reason (customer, inventory, fraud, other)" },
          email: { type: "boolean", description: "Whether to notify the customer by email" },
          restock: { type: "boolean", description: "Whether to restock items" },
        },
        required: ["orderId"],
      },
    },
    {
      name: "create_category",
      description: "Create a product category",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "object", description: "Category name by locale, e.g. {\"es\":\"Categoría\"}", properties: { es: { type: "string" }, pt: { type: "string" }, en: { type: "string" } } },
          description: { type: "object", description: "Description by locale", properties: { es: { type: "string" }, pt: { type: "string" } } },
          parent: { type: "number", description: "Parent category ID (optional)" },
        },
        required: ["name"],
      },
    },
    {
      name: "update_category",
      description: "Update a product category",
      inputSchema: {
        type: "object",
        properties: {
          categoryId: { type: "number", description: "Category ID" },
          name: { type: "object", description: "Category name by locale", properties: { es: { type: "string" }, pt: { type: "string" } } },
          description: { type: "object", description: "Description by locale", properties: { es: { type: "string" }, pt: { type: "string" } } },
          parent: { type: "number", description: "Parent category ID" },
        },
        required: ["categoryId"],
      },
    },
    {
      name: "delete_category",
      description: "Delete a product category by ID",
      inputSchema: {
        type: "object",
        properties: { categoryId: { type: "number", description: "Category ID" } },
        required: ["categoryId"],
      },
    },
    {
      name: "list_webhooks",
      description: "List configured webhooks",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
          event: { type: "string", description: "Filter by event name" },
        },
      },
    },
    {
      name: "create_webhook",
      description: "Subscribe to a webhook event",
      inputSchema: {
        type: "object",
        properties: {
          event: { type: "string", description: "Event name (e.g. order/created, product/updated)" },
          url: { type: "string", description: "Callback URL (HTTPS)" },
        },
        required: ["event", "url"],
      },
    },
    {
      name: "delete_webhook",
      description: "Delete a webhook by ID",
      inputSchema: {
        type: "object",
        properties: { webhookId: { type: "number", description: "Webhook ID" } },
        required: ["webhookId"],
      },
    },
    {
      name: "list_discount_coupons",
      description: "List discount coupons",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
          code: { type: "string", description: "Filter by exact coupon code" },
        },
      },
    },
    {
      name: "create_discount_coupon",
      description: "Create a discount coupon",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Coupon code" },
          type: { type: "string", description: "Type: percentage, absolute, or shipping" },
          value: { type: "string", description: "Discount value (numeric string)" },
          valid: { type: "boolean", description: "Whether the coupon is valid" },
          start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
          end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
          max_uses: { type: "number", description: "Maximum number of uses" },
          min_price: { type: "string", description: "Minimum cart price for coupon to apply" },
          first_consumer_purchase: { type: "boolean", description: "Restrict to first-time customers" },
        },
        required: ["code", "type", "value"],
      },
    },
    {
      name: "list_abandoned_carts",
      description: "List abandoned checkouts",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
          since_id: { type: "number", description: "Filter checkouts after this ID" },
          created_at_min: { type: "string", description: "Min creation date (ISO 8601)" },
          created_at_max: { type: "string", description: "Max creation date (ISO 8601)" },
        },
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
      case "delete_product":
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("DELETE", `/products/${args?.productId}`), null, 2) }] };
      case "list_product_variants":
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("GET", `/products/${args?.productId}/variants`), null, 2) }] };
      case "update_product_variant": {
        const payload: any = {};
        if (args?.price !== undefined) payload.price = args.price;
        if (args?.promotional_price !== undefined) payload.promotional_price = args.promotional_price;
        if (args?.stock !== undefined) payload.stock = args.stock;
        if (args?.sku !== undefined) payload.sku = args.sku;
        if (args?.weight !== undefined) payload.weight = args.weight;
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("PUT", `/products/${args?.productId}/variants/${args?.variantId}`, payload), null, 2) }] };
      }
      case "close_order":
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("POST", `/orders/${args?.orderId}/close`), null, 2) }] };
      case "cancel_order": {
        const payload: any = {};
        if (args?.reason) payload.reason = args.reason;
        if (args?.email !== undefined) payload.email = args.email;
        if (args?.restock !== undefined) payload.restock = args.restock;
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("POST", `/orders/${args?.orderId}/cancel`, payload), null, 2) }] };
      }
      case "create_category":
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("POST", "/categories", {
          name: args?.name,
          description: args?.description,
          parent: args?.parent,
        }), null, 2) }] };
      case "update_category": {
        const payload: any = {};
        if (args?.name) payload.name = args.name;
        if (args?.description) payload.description = args.description;
        if (args?.parent !== undefined) payload.parent = args.parent;
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("PUT", `/categories/${args?.categoryId}`, payload), null, 2) }] };
      }
      case "delete_category":
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("DELETE", `/categories/${args?.categoryId}`), null, 2) }] };
      case "list_webhooks": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.event) params.set("event", args.event);
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("GET", `/webhooks?${params}`), null, 2) }] };
      }
      case "create_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("POST", "/webhooks", {
          event: args?.event,
          url: args?.url,
        }), null, 2) }] };
      case "delete_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("DELETE", `/webhooks/${args?.webhookId}`), null, 2) }] };
      case "list_discount_coupons": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.code) params.set("code", args.code);
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("GET", `/coupons?${params}`), null, 2) }] };
      }
      case "create_discount_coupon": {
        const payload: any = {
          code: args?.code,
          type: args?.type,
          value: args?.value,
        };
        if (args?.valid !== undefined) payload.valid = args.valid;
        if (args?.start_date) payload.start_date = args.start_date;
        if (args?.end_date) payload.end_date = args.end_date;
        if (args?.max_uses !== undefined) payload.max_uses = args.max_uses;
        if (args?.min_price !== undefined) payload.min_price = args.min_price;
        if (args?.first_consumer_purchase !== undefined) payload.first_consumer_purchase = args.first_consumer_purchase;
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("POST", "/coupons", payload), null, 2) }] };
      }
      case "list_abandoned_carts": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.since_id) params.set("since_id", String(args.since_id));
        if (args?.created_at_min) params.set("created_at_min", args.created_at_min);
        if (args?.created_at_max) params.set("created_at_max", args.created_at_max);
        return { content: [{ type: "text", text: JSON.stringify(await tiendaNubeRequest("GET", `/checkouts?${params}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-tienda-nube", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
