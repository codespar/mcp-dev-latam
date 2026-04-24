#!/usr/bin/env node

/**
 * MCP Server for Conekta — Mexican payment gateway (cards, OXXO cash, SPEI).
 *
 * Tools:
 * - create_order / get_order / list_orders / update_order / cancel_order
 * - create_customer / get_customer / list_customers / update_customer / delete_customer
 * - create_charge / refund_charge / capture_charge
 * - list_payment_sources / create_payment_source / delete_payment_source
 * - create_webhook / update_webhook / delete_webhook
 * - get_webhook_events / get_webhook_event
 *
 * Environment:
 *   CONEKTA_API_KEY — API key for authentication
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.CONEKTA_API_KEY || "";
const BASE_URL = "https://api.conekta.io";

async function conektaRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/vnd.conekta-v2.2.0+json",
  };
  if (API_KEY) headers["Authorization"] = `Basic ${Buffer.from(API_KEY + ":").toString("base64")}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Conekta API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-conekta", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_order",
      description: "Create a new order",
      inputSchema: {
        type: "object",
        properties: {
          currency: { type: "string", description: "Currency code (e.g. MXN)" },
          customer_info: {
            type: "object",
            description: "Customer information",
            properties: {
              name: { type: "string", description: "Customer name" },
              email: { type: "string", description: "Customer email" },
              phone: { type: "string", description: "Customer phone" },
            },
            required: ["name", "email", "phone"],
          },
          line_items: {
            type: "array",
            description: "Order line items",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Item name" },
                unit_price: { type: "number", description: "Unit price in cents" },
                quantity: { type: "number", description: "Quantity" },
              },
              required: ["name", "unit_price", "quantity"],
            },
          },
          charges: {
            type: "array",
            description: "Charges for the order",
            items: {
              type: "object",
              properties: {
                payment_method: {
                  type: "object",
                  properties: {
                    type: { type: "string", description: "Payment type (card, oxxo_cash, spei)" },
                    token_id: { type: "string", description: "Card token (for card payments)" },
                    expires_at: { type: "number", description: "Expiration timestamp (for OXXO/SPEI)" },
                  },
                  required: ["type"],
                },
              },
            },
          },
        },
        required: ["currency", "customer_info", "line_items"],
      },
    },
    {
      name: "get_order",
      description: "Get order details by ID",
      inputSchema: {
        type: "object",
        properties: { orderId: { type: "string", description: "Order ID" } },
        required: ["orderId"],
      },
    },
    {
      name: "list_orders",
      description: "List orders with filters",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Results limit (default 20)" },
          next: { type: "string", description: "Pagination cursor" },
          status: { type: "string", description: "Order status filter" },
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
          email: { type: "string", description: "Customer email" },
          phone: { type: "string", description: "Customer phone" },
        },
        required: ["name", "email", "phone"],
      },
    },
    {
      name: "get_customer",
      description: "Get customer by ID",
      inputSchema: {
        type: "object",
        properties: { customerId: { type: "string", description: "Customer ID" } },
        required: ["customerId"],
      },
    },
    {
      name: "list_customers",
      description: "List customers",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Results limit" },
          next: { type: "string", description: "Pagination cursor" },
        },
      },
    },
    {
      name: "create_charge",
      description: "Create a charge for an existing order",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order ID" },
          payment_method: {
            type: "object",
            description: "Payment method details",
            properties: {
              type: { type: "string", description: "Payment type (card, oxxo_cash, spei)" },
              token_id: { type: "string", description: "Card token" },
              expires_at: { type: "number", description: "Expiration timestamp" },
            },
            required: ["type"],
          },
        },
        required: ["orderId", "payment_method"],
      },
    },
    {
      name: "refund_charge",
      description: "Refund a charge",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order ID" },
          chargeId: { type: "string", description: "Charge ID" },
          amount: { type: "number", description: "Refund amount in cents (omit for full refund)" },
          reason: { type: "string", description: "Refund reason" },
        },
        required: ["orderId", "chargeId"],
      },
    },
    {
      name: "list_payment_sources",
      description: "List payment sources for a customer",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "Customer ID" },
        },
        required: ["customerId"],
      },
    },
    {
      name: "get_webhook_events",
      description: "List webhook events (Conekta Events)",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Results limit" },
          next: { type: "string", description: "Pagination cursor" },
        },
      },
    },
    {
      name: "get_webhook_event",
      description: "Retrieve a single webhook event by ID",
      inputSchema: {
        type: "object",
        properties: { eventId: { type: "string", description: "Event ID" } },
        required: ["eventId"],
      },
    },
    {
      name: "update_customer",
      description: "Update a customer",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "Customer ID" },
          name: { type: "string", description: "Customer name" },
          email: { type: "string", description: "Customer email" },
          phone: { type: "string", description: "Customer phone" },
        },
        required: ["customerId"],
      },
    },
    {
      name: "delete_customer",
      description: "Delete a customer",
      inputSchema: {
        type: "object",
        properties: { customerId: { type: "string", description: "Customer ID" } },
        required: ["customerId"],
      },
    },
    {
      name: "create_payment_source",
      description: "Create a payment source (card token) for a customer",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "Customer ID" },
          type: { type: "string", description: "Source type (e.g. card)" },
          token_id: { type: "string", description: "Token ID from Conekta.js" },
        },
        required: ["customerId", "type", "token_id"],
      },
    },
    {
      name: "delete_payment_source",
      description: "Delete a payment source from a customer",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "Customer ID" },
          paymentSourceId: { type: "string", description: "Payment source ID" },
        },
        required: ["customerId", "paymentSourceId"],
      },
    },
    {
      name: "update_order",
      description: "Update an order (line_items, metadata, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order ID" },
          line_items: { type: "array", description: "New line items", items: { type: "object" } },
          metadata: { type: "object", description: "Metadata object" },
          currency: { type: "string", description: "Currency code" },
        },
        required: ["orderId"],
      },
    },
    {
      name: "cancel_order",
      description: "Cancel an order",
      inputSchema: {
        type: "object",
        properties: { orderId: { type: "string", description: "Order ID" } },
        required: ["orderId"],
      },
    },
    {
      name: "capture_charge",
      description: "Capture a pre-authorized order (pre_authorized → paid)",
      inputSchema: {
        type: "object",
        properties: { orderId: { type: "string", description: "Order ID" } },
        required: ["orderId"],
      },
    },
    {
      name: "create_webhook",
      description: "Create a webhook endpoint",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Webhook URL" },
          production_enabled: { type: "boolean", description: "Enable in production" },
          development_enabled: { type: "boolean", description: "Enable in development/sandbox" },
        },
        required: ["url"],
      },
    },
    {
      name: "update_webhook",
      description: "Update a webhook endpoint",
      inputSchema: {
        type: "object",
        properties: {
          webhookId: { type: "string", description: "Webhook ID" },
          url: { type: "string", description: "Webhook URL" },
          production_enabled: { type: "boolean", description: "Enable in production" },
          development_enabled: { type: "boolean", description: "Enable in development/sandbox" },
        },
        required: ["webhookId"],
      },
    },
    {
      name: "delete_webhook",
      description: "Delete a webhook endpoint",
      inputSchema: {
        type: "object",
        properties: { webhookId: { type: "string", description: "Webhook ID" } },
        required: ["webhookId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_order": {
        const payload: any = {
          currency: args?.currency,
          customer_info: args?.customer_info,
          line_items: args?.line_items,
        };
        if (args?.charges) payload.charges = args.charges;
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("POST", "/orders", payload), null, 2) }] };
      }
      case "get_order":
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("GET", `/orders/${args?.orderId}`), null, 2) }] };
      case "list_orders": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.next) params.set("next", String(args.next));
        if (args?.status) params.set("status", String(args.status));
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("GET", `/orders?${params}`), null, 2) }] };
      }
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("POST", "/customers", {
          name: args?.name,
          email: args?.email,
          phone: args?.phone,
        }), null, 2) }] };
      case "get_customer":
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("GET", `/customers/${args?.customerId}`), null, 2) }] };
      case "list_customers": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.next) params.set("next", String(args.next));
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("GET", `/customers?${params}`), null, 2) }] };
      }
      case "create_charge":
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("POST", `/orders/${args?.orderId}/charges`, {
          payment_method: args?.payment_method,
        }), null, 2) }] };
      case "refund_charge": {
        const body: any = {};
        if (args?.amount) body.amount = args.amount;
        if (args?.reason) body.reason = args.reason;
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("POST", `/orders/${args?.orderId}/charges/${args?.chargeId}/refunds`, body), null, 2) }] };
      }
      case "list_payment_sources":
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("GET", `/customers/${args?.customerId}/payment_sources`), null, 2) }] };
      case "get_webhook_events": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.next) params.set("next", String(args.next));
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("GET", `/events?${params}`), null, 2) }] };
      }
      case "get_webhook_event":
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("GET", `/events/${args?.eventId}`), null, 2) }] };
      case "update_customer": {
        const body: any = {};
        if (args?.name) body.name = args.name;
        if (args?.email) body.email = args.email;
        if (args?.phone) body.phone = args.phone;
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("PUT", `/customers/${args?.customerId}`, body), null, 2) }] };
      }
      case "delete_customer":
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("DELETE", `/customers/${args?.customerId}`), null, 2) }] };
      case "create_payment_source":
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("POST", `/customers/${args?.customerId}/payment_sources`, {
          type: args?.type,
          token_id: args?.token_id,
        }), null, 2) }] };
      case "delete_payment_source":
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("DELETE", `/customers/${args?.customerId}/payment_sources/${args?.paymentSourceId}`), null, 2) }] };
      case "update_order": {
        const body: any = {};
        if (args?.line_items) body.line_items = args.line_items;
        if (args?.metadata) body.metadata = args.metadata;
        if (args?.currency) body.currency = args.currency;
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("PUT", `/orders/${args?.orderId}`, body), null, 2) }] };
      }
      case "cancel_order":
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("POST", `/orders/${args?.orderId}/cancel`), null, 2) }] };
      case "capture_charge":
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("POST", `/orders/${args?.orderId}/capture`), null, 2) }] };
      case "create_webhook": {
        const body: any = { url: args?.url };
        if (args?.production_enabled !== undefined) body.production_enabled = args.production_enabled;
        if (args?.development_enabled !== undefined) body.development_enabled = args.development_enabled;
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("POST", "/webhooks", body), null, 2) }] };
      }
      case "update_webhook": {
        const body: any = {};
        if (args?.url) body.url = args.url;
        if (args?.production_enabled !== undefined) body.production_enabled = args.production_enabled;
        if (args?.development_enabled !== undefined) body.development_enabled = args.development_enabled;
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("PUT", `/webhooks/${args?.webhookId}`, body), null, 2) }] };
      }
      case "delete_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await conektaRequest("DELETE", `/webhooks/${args?.webhookId}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-conekta", version: "0.2.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
