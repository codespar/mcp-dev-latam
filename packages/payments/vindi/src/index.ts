#!/usr/bin/env node

/**
 * MCP Server for Vindi — Brazilian recurring billing platform.
 *
 * Tools (20):
 * Customers: create_customer, get_customer, update_customer
 * Products: create_product, list_products
 * Plans: create_plan, list_plans
 * Subscriptions: create_subscription, get_subscription, list_subscriptions,
 *   cancel_subscription, reactivate_subscription
 * Bills: create_bill, get_bill, list_bills, cancel_bill, charge_bill
 * Charges: refund_charge
 * Payment Profiles: create_payment_profile, list_payment_profiles
 *
 * Environment:
 *   VINDI_API_KEY — API key from https://app.vindi.com.br/
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
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
  { name: "mcp-vindi", version: "0.2.1" },
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
    {
      name: "update_customer",
      description: "Update a customer's details",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Customer ID" },
          name: { type: "string", description: "Customer name" },
          email: { type: "string", description: "Email address" },
          registry_code: { type: "string", description: "CPF or CNPJ" },
          notes: { type: "string", description: "Free-form notes" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_product",
      description: "Create a product (catalog item that can be attached to plans or bills)",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Product name" },
          code: { type: "string", description: "Internal product code" },
          description: { type: "string", description: "Product description" },
          status: { type: "string", enum: ["active", "inactive"], description: "Product status" },
          pricing_schema: {
            type: "object",
            description: "Pricing schema (e.g. { price: 99.90, schema_type: 'flat' })",
            properties: {
              price: { type: "number" },
              schema_type: { type: "string", enum: ["flat", "per_unit", "volume", "step"] },
            },
          },
        },
        required: ["name", "pricing_schema"],
      },
    },
    {
      name: "list_products",
      description: "List products in the catalog",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Items per page" },
          status: { type: "string", enum: ["active", "inactive"], description: "Filter by status" },
        },
      },
    },
    {
      name: "cancel_subscription",
      description: "Cancel a subscription immediately",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Subscription ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "reactivate_subscription",
      description: "Reactivate a canceled subscription",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Subscription ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_bill",
      description: "Cancel a pending bill",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Bill ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "charge_bill",
      description: "Retry charging a pending bill (runs the billing workflow)",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Bill ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "refund_charge",
      description: "Refund a charge (full or partial). Requires the gateway to support refunds.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Charge ID" },
          amount: { type: "number", description: "Refund amount (omit for full refund)" },
          cancel_bill: { type: "boolean", description: "Whether to also cancel the associated bill" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_payment_profile",
      description: "Create a payment profile (tokenized card / saved payment method) for a customer",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "number", description: "Customer ID" },
          holder_name: { type: "string", description: "Cardholder name" },
          card_expiration: { type: "string", description: "Card expiration MM/YYYY" },
          card_number: { type: "string", description: "Card number (PAN)" },
          card_cvv: { type: "string", description: "Card CVV" },
          payment_method_code: { type: "string", description: "Payment method code (e.g. credit_card)" },
          payment_company_code: { type: "string", description: "Card brand (visa, mastercard, elo, etc.)" },
        },
        required: ["customer_id", "holder_name", "card_expiration", "card_number", "payment_method_code"],
      },
    },
    {
      name: "list_payment_profiles",
      description: "List payment profiles, optionally filtered by customer",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "number", description: "Filter by customer ID" },
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Items per page" },
          status: { type: "string", enum: ["active", "inactive"], description: "Filter by status" },
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
      case "update_customer": {
        const { id, ...body } = (args ?? {}) as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("PUT", `/customers/${id}`, body), null, 2) }] };
      }
      case "create_product":
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("POST", "/products", args), null, 2) }] };
      case "list_products": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.status) params.set("query", `status=${args.status}`);
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("GET", `/products?${params}`), null, 2) }] };
      }
      case "cancel_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("DELETE", `/subscriptions/${args?.id}`), null, 2) }] };
      case "reactivate_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("POST", `/subscriptions/${args?.id}/reactivate`), null, 2) }] };
      case "cancel_bill":
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("DELETE", `/bills/${args?.id}`), null, 2) }] };
      case "charge_bill":
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("POST", `/bills/${args?.id}/charge`), null, 2) }] };
      case "refund_charge": {
        const { id, ...body } = (args ?? {}) as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("POST", `/charges/${id}/refund`, body), null, 2) }] };
      }
      case "create_payment_profile":
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("POST", "/payment_profiles", args), null, 2) }] };
      case "list_payment_profiles": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        const qParts: string[] = [];
        if (args?.customer_id) qParts.push(`customer_id=${args.customer_id}`);
        if (args?.status) qParts.push(`status=${args.status}`);
        if (qParts.length) params.set("query", qParts.join(" "));
        return { content: [{ type: "text", text: JSON.stringify(await vindiRequest("GET", `/payment_profiles?${params}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-vindi", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
