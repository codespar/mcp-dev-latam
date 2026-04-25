#!/usr/bin/env node

/**
 * MCP Server for iugu — Brazilian payment & subscription-billing platform.
 *
 * Tools (v0.2.0 — 20):
 *
 * Invoices:
 * - create_invoice, get_invoice, list_invoices, cancel_invoice, refund_invoice, duplicate_invoice
 *
 * Customers:
 * - create_customer, update_customer, list_customers
 *
 * Plans:
 * - create_plan, update_plan, list_plans
 *
 * Subscriptions:
 * - create_subscription, suspend_subscription, activate_subscription, cancel_subscription
 *
 * Payment Methods & Tokens:
 * - create_payment_token, create_payment_method
 *
 * Marketplace / Payouts:
 * - create_subaccount, create_transfer, request_withdraw
 *
 * Webhooks:
 * - create_webhook
 *
 * Account:
 * - get_account_info
 *
 * Environment:
 *   IUGU_API_TOKEN — API token from https://dev.iugu.com/
 *   IUGU_SANDBOX — "true" to use test mode (default: false)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_TOKEN = process.env.IUGU_API_TOKEN || "";
const BASE_URL = "https://api.iugu.com/v1";

async function iuguRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const credentials = btoa(`${API_TOKEN}:`);
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
    throw new Error(`iugu API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-iugu", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Invoices ─────────────────────────────────────────────────────
    {
      name: "create_invoice",
      description: "Create an invoice in iugu (Pix, boleto, or credit card)",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Payer email address" },
          due_date: { type: "string", description: "Due date (YYYY-MM-DD)" },
          items: {
            type: "array",
            description: "Invoice items",
            items: {
              type: "object",
              properties: {
                description: { type: "string", description: "Item description" },
                quantity: { type: "number", description: "Quantity" },
                price_cents: { type: "number", description: "Unit price in cents (BRL)" },
              },
              required: ["description", "quantity", "price_cents"],
            },
          },
          payable_with: { type: "string", enum: ["pix", "bank_slip", "credit_card", "all"], description: "Payment method (default: all)" },
          customer_id: { type: "string", description: "Customer ID (optional)" },
          return_url: { type: "string", description: "URL to redirect after payment" },
          notification_url: { type: "string", description: "Webhook URL for status updates" },
        },
        required: ["email", "due_date", "items"],
      },
    },
    {
      name: "get_invoice",
      description: "Get invoice details by ID",
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
          status_filter: { type: "string", enum: ["pending", "paid", "canceled", "partially_paid", "refunded", "expired"], description: "Filter by status" },
          customer_id: { type: "string", description: "Filter by customer ID" },
          limit: { type: "number", description: "Number of results (default 100)" },
          start: { type: "number", description: "Pagination offset" },
          created_at_from: { type: "string", description: "Filter from date (YYYY-MM-DD)" },
          created_at_to: { type: "string", description: "Filter to date (YYYY-MM-DD)" },
        },
      },
    },
    {
      name: "cancel_invoice",
      description: "Cancel (delete) an invoice. Endpoint: DELETE /invoices/:id",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Invoice ID" } },
        required: ["id"],
      },
    },
    {
      name: "refund_invoice",
      description: "Refund a paid invoice (full or partial). Endpoint: POST /invoices/:id/refund",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Invoice ID" },
          partial_value_refund_cents: { type: "number", description: "Partial refund amount in cents (omit for full refund)" },
        },
        required: ["id"],
      },
    },
    {
      name: "duplicate_invoice",
      description: "Duplicate an existing invoice with a new due date. Endpoint: POST /invoices/:id/duplicate",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Invoice ID to duplicate" },
          due_date: { type: "string", description: "New due date (YYYY-MM-DD)" },
          ignore_due_email: { type: "boolean", description: "Skip sending due-date email" },
        },
        required: ["id", "due_date"],
      },
    },

    // ── Customers ────────────────────────────────────────────────────
    {
      name: "create_customer",
      description: "Create a customer in iugu",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer name" },
          email: { type: "string", description: "Email address" },
          cpf_cnpj: { type: "string", description: "CPF or CNPJ (numbers only)" },
          phone_prefix: { type: "string", description: "Phone area code (DDD)" },
          phone: { type: "string", description: "Phone number" },
          zip_code: { type: "string", description: "ZIP code (CEP)" },
          street: { type: "string", description: "Street address" },
          number: { type: "string", description: "Address number" },
          city: { type: "string", description: "City" },
          state: { type: "string", description: "State (UF, 2 letters)" },
        },
        required: ["name", "email"],
      },
    },
    {
      name: "update_customer",
      description: "Update a customer. Endpoint: PUT /customers/:id. Omitted fields are unchanged.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Customer ID" },
          name: { type: "string" },
          email: { type: "string" },
          cpf_cnpj: { type: "string" },
          phone_prefix: { type: "string" },
          phone: { type: "string" },
          zip_code: { type: "string" },
          street: { type: "string" },
          number: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_customers",
      description: "List customers with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results" },
          start: { type: "number", description: "Pagination offset" },
          query: { type: "string", description: "Search by name or email" },
        },
      },
    },

    // ── Plans ────────────────────────────────────────────────────────
    {
      name: "create_plan",
      description: "Create a subscription plan (recurring template). Endpoint: POST /plans",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Plan name" },
          identifier: { type: "string", description: "Unique slug identifier (e.g., 'basic_monthly')" },
          interval: { type: "number", description: "Interval quantity (e.g., 1)" },
          interval_type: { type: "string", enum: ["weeks", "months"], description: "Interval unit" },
          value_cents: { type: "number", description: "Price per period in cents (BRL)" },
          currency: { type: "string", description: "Currency code (default BRL)" },
          payable_with: { type: "array", items: { type: "string" }, description: "Allowed payment methods: credit_card, bank_slip, pix" },
          features: {
            type: "array",
            description: "Plan features",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                identifier: { type: "string" },
                value: { type: "number" },
              },
            },
          },
        },
        required: ["name", "identifier", "interval", "interval_type", "value_cents"],
      },
    },
    {
      name: "update_plan",
      description: "Update an existing plan. Endpoint: PUT /plans/:id",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Plan ID" },
          name: { type: "string" },
          interval: { type: "number" },
          interval_type: { type: "string", enum: ["weeks", "months"] },
          value_cents: { type: "number" },
          payable_with: { type: "array", items: { type: "string" } },
        },
        required: ["id"],
      },
    },
    {
      name: "list_plans",
      description: "List subscription plans. Endpoint: GET /plans",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results" },
          start: { type: "number", description: "Pagination offset" },
          query: { type: "string", description: "Search by name or identifier" },
        },
      },
    },

    // ── Subscriptions ────────────────────────────────────────────────
    {
      name: "create_subscription",
      description: "Create a recurring subscription in iugu",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Customer ID" },
          plan_identifier: { type: "string", description: "Plan identifier slug" },
          expires_at: { type: "string", description: "First charge date (YYYY-MM-DD)" },
          only_on_charge_success: { type: "boolean", description: "Only activate on first successful charge" },
          payable_with: { type: "string", enum: ["credit_card", "bank_slip", "pix", "all"], description: "Payment method" },
          credits_based: { type: "boolean", description: "Whether this is a credit-based subscription" },
          price_cents: { type: "number", description: "Amount in cents for credit-based subscriptions" },
          return_url: { type: "string", description: "Redirect URL after payment" },
        },
        required: ["customer_id"],
      },
    },
    {
      name: "suspend_subscription",
      description: "Suspend a subscription. Endpoint: POST /subscriptions/:id/suspend",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Subscription ID" } },
        required: ["id"],
      },
    },
    {
      name: "activate_subscription",
      description: "Reactivate a suspended subscription. Endpoint: POST /subscriptions/:id/activate",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Subscription ID" } },
        required: ["id"],
      },
    },
    {
      name: "cancel_subscription",
      description: "Cancel (delete) a subscription. Endpoint: DELETE /subscriptions/:id",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Subscription ID" } },
        required: ["id"],
      },
    },

    // ── Payment Tokens & Methods ─────────────────────────────────────
    {
      name: "create_payment_token",
      description: "Tokenize a credit card server-side. Endpoint: POST /payment_token. WARNING: using this from your server subjects you to PCI audits — prefer iugu.js client-side tokenization in production.",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "iugu account ID" },
          method: { type: "string", description: "Payment method (e.g., 'credit_card')" },
          test: { type: "boolean", description: "Use test mode" },
          data: {
            type: "object",
            description: "Card data",
            properties: {
              number: { type: "string", description: "Card number" },
              verification_value: { type: "string", description: "CVV" },
              first_name: { type: "string" },
              last_name: { type: "string" },
              month: { type: "string", description: "Expiration month (MM)" },
              year: { type: "string", description: "Expiration year (YYYY)" },
            },
            required: ["number", "verification_value", "first_name", "last_name", "month", "year"],
          },
        },
        required: ["account_id", "method", "data"],
      },
    },
    {
      name: "create_payment_method",
      description: "Attach a payment method (credit card token) to a customer. Endpoint: POST /customers/:customer_id/payment_methods",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Customer ID" },
          description: { type: "string", description: "Card description (e.g., 'Visa ending 1234')" },
          token: { type: "string", description: "Card token from iugu.js or create_payment_token" },
          set_as_default: { type: "boolean", description: "Set as default payment method" },
        },
        required: ["customer_id", "description", "token"],
      },
    },

    // ── Marketplace / Payouts ────────────────────────────────────────
    {
      name: "create_subaccount",
      description: "Create a marketplace sub-account. Endpoint: POST /marketplace/create_account. Note: only works in production mode. Returns live/test API tokens and user_token.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Sub-account name (no special characters; defaults to account_id if omitted)" },
          commission_percent: { type: "number", description: "Commission percentage to retain from this sub-account" },
        },
      },
    },
    {
      name: "create_transfer",
      description: "Transfer funds between iugu accounts (marketplace). Endpoint: POST /transfers",
      inputSchema: {
        type: "object",
        properties: {
          receiver_id: { type: "string", description: "Destination account ID" },
          amount_cents: { type: "number", description: "Amount in cents (minimum 1)" },
        },
        required: ["receiver_id", "amount_cents"],
      },
    },
    {
      name: "request_withdraw",
      description: "Request a bank withdrawal (saque) from a sub-account. Endpoint: POST /accounts/:id/request_withdraw",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Sub-account ID requesting the withdraw" },
          amount: { type: "string", description: "Amount (e.g., '100.00' in BRL)" },
        },
        required: ["account_id", "amount"],
      },
    },

    // ── Webhooks ─────────────────────────────────────────────────────
    {
      name: "create_webhook",
      description: "Register a webhook (gatilho) for an iugu event. Endpoint: POST /web_hooks",
      inputSchema: {
        type: "object",
        properties: {
          event: { type: "string", description: "Event name (e.g., 'invoice.status_changed', 'subscription.expired')" },
          url: { type: "string", description: "Your endpoint that will receive the POST" },
          authorization: { type: "string", description: "Optional Basic auth header value for callbacks" },
        },
        required: ["event", "url"],
      },
    },

    // ── Account ──────────────────────────────────────────────────────
    {
      name: "get_account_info",
      description: "Get account information, configuration, and balance",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── Invoices ────────────────────────────────────────────────
      case "create_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("POST", "/invoices", args), null, 2) }] };
      case "get_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("GET", `/invoices/${args?.id}`), null, 2) }] };
      case "list_invoices": {
        const params = new URLSearchParams();
        if (args?.status_filter) params.set("status_filter", String(args.status_filter));
        if (args?.customer_id) params.set("customer_id", String(args.customer_id));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.start) params.set("start", String(args.start));
        if (args?.created_at_from) params.set("created_at_from", String(args.created_at_from));
        if (args?.created_at_to) params.set("created_at_to", String(args.created_at_to));
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("GET", `/invoices?${params}`), null, 2) }] };
      }
      case "cancel_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("DELETE", `/invoices/${args?.id}`), null, 2) }] };
      case "refund_invoice": {
        const { id, ...body } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("POST", `/invoices/${id}/refund`, body), null, 2) }] };
      }
      case "duplicate_invoice": {
        const { id, ...body } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("POST", `/invoices/${id}/duplicate`, body), null, 2) }] };
      }

      // ── Customers ───────────────────────────────────────────────
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("POST", "/customers", args), null, 2) }] };
      case "update_customer": {
        const { id, ...body } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("PUT", `/customers/${id}`, body), null, 2) }] };
      }
      case "list_customers": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.start) params.set("start", String(args.start));
        if (args?.query) params.set("query", String(args.query));
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("GET", `/customers?${params}`), null, 2) }] };
      }

      // ── Plans ───────────────────────────────────────────────────
      case "create_plan":
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("POST", "/plans", args), null, 2) }] };
      case "update_plan": {
        const { id, ...body } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("PUT", `/plans/${id}`, body), null, 2) }] };
      }
      case "list_plans": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.start) params.set("start", String(args.start));
        if (args?.query) params.set("query", String(args.query));
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("GET", `/plans?${params}`), null, 2) }] };
      }

      // ── Subscriptions ───────────────────────────────────────────
      case "create_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("POST", "/subscriptions", args), null, 2) }] };
      case "suspend_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("POST", `/subscriptions/${args?.id}/suspend`), null, 2) }] };
      case "activate_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("POST", `/subscriptions/${args?.id}/activate`), null, 2) }] };
      case "cancel_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("DELETE", `/subscriptions/${args?.id}`), null, 2) }] };

      // ── Payment Tokens & Methods ────────────────────────────────
      case "create_payment_token":
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("POST", "/payment_token", args), null, 2) }] };
      case "create_payment_method": {
        const { customer_id, ...methodBody } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("POST", `/customers/${customer_id}/payment_methods`, methodBody), null, 2) }] };
      }

      // ── Marketplace / Payouts ───────────────────────────────────
      case "create_subaccount":
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("POST", "/marketplace/create_account", args), null, 2) }] };
      case "create_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("POST", "/transfers", args), null, 2) }] };
      case "request_withdraw": {
        const { account_id, ...body } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("POST", `/accounts/${account_id}/request_withdraw`, body), null, 2) }] };
      }

      // ── Webhooks ────────────────────────────────────────────────
      case "create_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("POST", "/web_hooks", args), null, 2) }] };

      // ── Account ─────────────────────────────────────────────────
      case "get_account_info":
        return { content: [{ type: "text", text: JSON.stringify(await iuguRequest("GET", "/accounts"), null, 2) }] };

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
        const s = new Server({ name: "mcp-iugu", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
