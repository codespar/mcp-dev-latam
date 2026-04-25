#!/usr/bin/env node

/**
 * MCP Server for Chargebee — global subscription billing orchestration.
 *
 * Tools:
 * Subscriptions:
 *   - create_subscription, retrieve_subscription, update_subscription
 *   - cancel_subscription, reactivate_subscription, list_subscriptions
 * Customers:
 *   - create_customer, retrieve_customer, update_customer, list_customers
 * Invoices:
 *   - retrieve_invoice, list_invoices
 * Payment sources:
 *   - create_payment_source_using_token, delete_payment_source
 * Events:
 *   - list_events
 *
 * Environment:
 *   CHARGEBEE_SITE    — site subdomain (e.g. "acme-test" or "acme")
 *   CHARGEBEE_API_KEY — API key (used as HTTP Basic username, empty password)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const SITE = process.env.CHARGEBEE_SITE || "";
const API_KEY = process.env.CHARGEBEE_API_KEY || "";
const BASE_URL = `https://${SITE}.chargebee.com/api/v2`;

/**
 * Flatten a nested object into Chargebee's form-encoded convention.
 * Nested objects become `parent[child]=value`; arrays become `parent[i][child]=value`.
 * Primitives pass through as-is.
 */
function flattenForm(input: unknown, prefix = "", out: URLSearchParams = new URLSearchParams()): URLSearchParams {
  if (input === null || input === undefined) return out;
  if (Array.isArray(input)) {
    input.forEach((item, i) => {
      const key = prefix ? `${prefix}[${i}]` : String(i);
      flattenForm(item, key, out);
    });
    return out;
  }
  if (typeof input === "object") {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      flattenForm(v, key, out);
    }
    return out;
  }
  out.append(prefix, String(input));
  return out;
}

async function chargebeeRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const credentials = btoa(`${API_KEY}:`);
  const init: RequestInit = {
    method,
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Accept": "application/json",
    },
  };
  if (body && method !== "GET") {
    const form = flattenForm(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = form.toString();
  }
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chargebee API ${res.status}: ${err}`);
  }
  return res.json();
}

function buildListQuery(args: Record<string, unknown> | undefined): string {
  if (!args) return "";
  const params = new URLSearchParams();
  const { filters, limit, offset, ...rest } = args as Record<string, unknown>;
  if (limit !== undefined) params.set("limit", String(limit));
  if (offset !== undefined) params.set("offset", String(offset));
  // Flatten any additional scalar top-level args (e.g. sort_by[asc]=date)
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object") flattenForm(v, k, params);
    else params.set(k, String(v));
  }
  // `filters` is a free-form passthrough object: { "email[is]": "foo@bar.com", "status[in]": "[active]" }
  if (filters && typeof filters === "object") {
    for (const [k, v] of Object.entries(filters as Record<string, unknown>)) {
      if (v === undefined || v === null) continue;
      params.append(k, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

const server = new Server(
  { name: "mcp-chargebee", version: "0.1.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // Subscriptions
    {
      name: "create_subscription",
      description: "Create a new subscription in Chargebee. Provide either a nested `customer` object (with email/first_name/last_name) for a new customer, or pass an existing `customer_id` via nested customer or top-level field.",
      inputSchema: {
        type: "object",
        properties: {
          plan_id: { type: "string", description: "Plan identifier (required)" },
          plan_quantity: { type: "number", description: "Quantity of the plan" },
          billing_cycles: { type: "number", description: "Number of billing cycles before subscription ends" },
          customer: { type: "object", description: "New customer object (email, first_name, last_name, company, ...) — omit if using customer_id" },
          customer_id: { type: "string", description: "Existing Chargebee customer ID" },
          coupon_ids: { type: "array", items: { type: "string" }, description: "Coupon IDs to apply" },
          addons: { type: "array", items: { type: "object" }, description: "Addon objects: [{ id, quantity }]" },
        },
        required: ["plan_id"],
      },
    },
    {
      name: "retrieve_subscription",
      description: "Retrieve a subscription by ID",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Subscription ID" } },
        required: ["id"],
      },
    },
    {
      name: "update_subscription",
      description: "Update a subscription. Accepts any Chargebee subscription fields (plan_id, plan_quantity, coupon_ids, addons, billing_cycles, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Subscription ID" },
          plan_id: { type: "string" },
          plan_quantity: { type: "number" },
          billing_cycles: { type: "number" },
          coupon_ids: { type: "array", items: { type: "string" } },
          addons: { type: "array", items: { type: "object" } },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_subscription",
      description: "Cancel a subscription. By default cancels immediately; set end_of_term=true to cancel at period end.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Subscription ID" },
          end_of_term: { type: "boolean", description: "If true, cancels at end of current billing term" },
        },
        required: ["id"],
      },
    },
    {
      name: "reactivate_subscription",
      description: "Reactivate a cancelled or paused subscription",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Subscription ID" } },
        required: ["id"],
      },
    },
    {
      name: "list_subscriptions",
      description: "List subscriptions. Pass filters as a free-form object using Chargebee's field[operator]=value format, e.g. { \"status[is]\": \"active\", \"customer_id[is]\": \"cust_123\" }.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Page size (max 100)" },
          offset: { type: "string", description: "Pagination offset token from previous response" },
          filters: { type: "object", description: "Chargebee filter params in field[operator]=value format" },
        },
      },
    },
    // Customers
    {
      name: "create_customer",
      description: "Create a customer in Chargebee. At least one of email, first_name, or last_name is required.",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          company: { type: "string" },
          phone: { type: "string" },
          billing_address: { type: "object", description: "Billing address object" },
          locale: { type: "string", description: "Customer locale (e.g. 'en-US', 'pt-BR')" },
        },
      },
    },
    {
      name: "retrieve_customer",
      description: "Retrieve a customer by ID",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Customer ID" } },
        required: ["id"],
      },
    },
    {
      name: "update_customer",
      description: "Update a customer. Accepts any customer fields.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Customer ID" },
          email: { type: "string" },
          first_name: { type: "string" },
          last_name: { type: "string" },
          company: { type: "string" },
          phone: { type: "string" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_customers",
      description: "List customers. Pass filters in Chargebee's field[operator]=value format.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          offset: { type: "string" },
          filters: { type: "object", description: "Filter params, e.g. { \"email[is]\": \"foo@bar.com\" }" },
        },
      },
    },
    // Invoices
    {
      name: "retrieve_invoice",
      description: "Retrieve an invoice by ID",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Invoice ID" } },
        required: ["id"],
      },
    },
    {
      name: "list_invoices",
      description: "List invoices with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          offset: { type: "string" },
          customer_id: { type: "string", description: "Convenience filter: maps to customer_id[is]" },
          subscription_id: { type: "string", description: "Convenience filter: maps to subscription_id[is]" },
          status: { type: "string", description: "Convenience filter: maps to status[is] (paid, posted, payment_due, not_paid, voided, pending)" },
          filters: { type: "object", description: "Additional raw Chargebee filter params" },
        },
      },
    },
    // Payment sources
    {
      name: "create_payment_source_using_token",
      description: "Attach a payment source to a customer using a gateway token (e.g. from Chargebee JS / Stripe.js / Adyen tokenization)",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Chargebee customer ID" },
          token_id: { type: "string", description: "Tokenized payment identifier from the gateway" },
          gateway_account_id: { type: "string", description: "Chargebee gateway account ID" },
        },
        required: ["customer_id", "token_id", "gateway_account_id"],
      },
    },
    {
      name: "delete_payment_source",
      description: "Delete a payment source",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Payment source ID" } },
        required: ["id"],
      },
    },
    // Events
    {
      name: "list_events",
      description: "List webhook events. Useful for auditing or backfilling missed webhooks.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          offset: { type: "string" },
          event_type: { type: "string", description: "Convenience filter: maps to event_type[is]" },
          occurred_after: { type: "number", description: "Unix timestamp — maps to occurred_at[after]" },
          occurred_before: { type: "number", description: "Unix timestamp — maps to occurred_at[before]" },
          filters: { type: "object", description: "Additional raw Chargebee filter params" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args || {}) as Record<string, any>;

  try {
    switch (name) {
      // Subscriptions
      case "create_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await chargebeeRequest("POST", "/subscriptions", a), null, 2) }] };
      case "retrieve_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await chargebeeRequest("GET", `/subscriptions/${a.id}`), null, 2) }] };
      case "update_subscription": {
        const { id, ...body } = a;
        return { content: [{ type: "text", text: JSON.stringify(await chargebeeRequest("POST", `/subscriptions/${id}`, body), null, 2) }] };
      }
      case "cancel_subscription": {
        const { id, ...body } = a;
        return { content: [{ type: "text", text: JSON.stringify(await chargebeeRequest("POST", `/subscriptions/${id}/cancel`, body), null, 2) }] };
      }
      case "reactivate_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await chargebeeRequest("POST", `/subscriptions/${a.id}/reactivate`, {}), null, 2) }] };
      case "list_subscriptions":
        return { content: [{ type: "text", text: JSON.stringify(await chargebeeRequest("GET", `/subscriptions${buildListQuery(a)}`), null, 2) }] };

      // Customers
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await chargebeeRequest("POST", "/customers", a), null, 2) }] };
      case "retrieve_customer":
        return { content: [{ type: "text", text: JSON.stringify(await chargebeeRequest("GET", `/customers/${a.id}`), null, 2) }] };
      case "update_customer": {
        const { id, ...body } = a;
        return { content: [{ type: "text", text: JSON.stringify(await chargebeeRequest("POST", `/customers/${id}`, body), null, 2) }] };
      }
      case "list_customers":
        return { content: [{ type: "text", text: JSON.stringify(await chargebeeRequest("GET", `/customers${buildListQuery(a)}`), null, 2) }] };

      // Invoices
      case "retrieve_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await chargebeeRequest("GET", `/invoices/${a.id}`), null, 2) }] };
      case "list_invoices": {
        const { customer_id, subscription_id, status, filters, ...rest } = a;
        const merged: Record<string, unknown> = { ...filters };
        if (customer_id) merged["customer_id[is]"] = customer_id;
        if (subscription_id) merged["subscription_id[is]"] = subscription_id;
        if (status) merged["status[is]"] = status;
        return { content: [{ type: "text", text: JSON.stringify(await chargebeeRequest("GET", `/invoices${buildListQuery({ ...rest, filters: merged })}`), null, 2) }] };
      }

      // Payment sources
      case "create_payment_source_using_token":
        return { content: [{ type: "text", text: JSON.stringify(await chargebeeRequest("POST", "/payment_sources/create_using_token", a), null, 2) }] };
      case "delete_payment_source":
        return { content: [{ type: "text", text: JSON.stringify(await chargebeeRequest("POST", `/payment_sources/${a.id}/delete`, {}), null, 2) }] };

      // Events
      case "list_events": {
        const { event_type, occurred_after, occurred_before, filters, ...rest } = a;
        const merged: Record<string, unknown> = { ...filters };
        if (event_type) merged["event_type[is]"] = event_type;
        if (occurred_after !== undefined) merged["occurred_at[after]"] = occurred_after;
        if (occurred_before !== undefined) merged["occurred_at[before]"] = occurred_before;
        return { content: [{ type: "text", text: JSON.stringify(await chargebeeRequest("GET", `/events${buildListQuery({ ...rest, filters: merged })}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-chargebee", version: "0.1.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
