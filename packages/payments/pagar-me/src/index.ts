#!/usr/bin/env node

/**
 * MCP Server for Pagar.me — Brazilian payment platform.
 *
 * Tools (v0.2.0):
 * Core:
 * - create_order, get_order, list_orders
 * - create_charge, get_charge, capture_charge
 * - create_recipient, list_recipients
 * - get_balance, create_transfer, refund, partial_refund
 * Anticipations:
 * - create_anticipation, get_anticipation, get_anticipation_limits
 * Subscriptions:
 * - create_plan, update_plan, create_subscription, cancel_subscription
 * Other:
 * - create_card_token, create_withdrawal, register_webhook
 *
 * Environment:
 *   PAGARME_API_KEY — Secret key (sk_xxx) from https://dash.pagar.me/
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.PAGARME_API_KEY || "";
const BASE_URL = "https://api.pagar.me/core/v5";

async function pagarmeRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Basic " + btoa(`${API_KEY}:`),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pagar.me API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-pagar-me", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_order",
      description: "Create an order in Pagar.me with items and payment",
      inputSchema: {
        type: "object",
        properties: {
          customer: {
            type: "object",
            description: "Customer object with name, email, document, type",
            properties: {
              name: { type: "string", description: "Customer name" },
              email: { type: "string", description: "Customer email" },
              document: { type: "string", description: "CPF or CNPJ" },
              type: { type: "string", enum: ["individual", "company"], description: "Customer type" },
            },
            required: ["name", "email", "document", "type"],
          },
          items: {
            type: "array",
            description: "Order items",
            items: {
              type: "object",
              properties: {
                amount: { type: "number", description: "Amount in cents" },
                description: { type: "string", description: "Item description" },
                quantity: { type: "number", description: "Item quantity" },
              },
              required: ["amount", "description", "quantity"],
            },
          },
          payments: {
            type: "array",
            description: "Payment methods array",
          },
        },
        required: ["customer", "items", "payments"],
      },
    },
    {
      name: "get_order",
      description: "Get order details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Order ID (or_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_orders",
      description: "List orders with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "paid", "canceled", "failed"], description: "Filter by status" },
          page: { type: "number", description: "Page number" },
          size: { type: "number", description: "Page size" },
        },
      },
    },
    {
      name: "create_charge",
      description: "Create a charge (Pix, boleto, or credit card)",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Order ID to attach the charge" },
          amount: { type: "number", description: "Amount in cents" },
          payment_method: { type: "string", enum: ["pix", "boleto", "credit_card"], description: "Payment method" },
          customer_id: { type: "string", description: "Customer ID" },
        },
        required: ["amount", "payment_method"],
      },
    },
    {
      name: "get_charge",
      description: "Get charge details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Charge ID (ch_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_recipient",
      description: "Create a recipient for split payments",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Recipient name" },
          email: { type: "string", description: "Recipient email" },
          document: { type: "string", description: "CPF or CNPJ" },
          type: { type: "string", enum: ["individual", "company"], description: "Recipient type" },
          bank_account: {
            type: "object",
            description: "Bank account details",
            properties: {
              bank: { type: "string", description: "Bank code (e.g. 001)" },
              branch_number: { type: "string", description: "Branch number" },
              account_number: { type: "string", description: "Account number" },
              account_check_digit: { type: "string", description: "Account check digit" },
              type: { type: "string", enum: ["checking", "savings"], description: "Account type" },
              holder_name: { type: "string", description: "Account holder name" },
              holder_document: { type: "string", description: "Account holder document" },
            },
          },
        },
        required: ["name", "email", "document", "type"],
      },
    },
    {
      name: "get_balance",
      description: "Get current account balance",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_transfer",
      description: "Create a transfer to a recipient",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in cents" },
          recipient_id: { type: "string", description: "Recipient ID (rp_xxx)" },
        },
        required: ["amount", "recipient_id"],
      },
    },
    {
      name: "refund",
      description: "Refund a charge (full or partial)",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Charge ID (ch_xxx)" },
          amount: { type: "number", description: "Amount in cents (omit for full refund)" },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "list_recipients",
      description: "List recipients with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          size: { type: "number", description: "Page size" },
        },
      },
    },
    {
      name: "create_anticipation",
      description: "Request anticipation of receivables for a recipient (antecipação)",
      inputSchema: {
        type: "object",
        properties: {
          recipient_id: { type: "string", description: "Recipient ID (rp_xxx)" },
          amount: { type: "number", description: "Amount in cents to anticipate" },
          timeframe: { type: "string", enum: ["start", "end"], description: "Anticipation timeframe: 'start' (D+1) or 'end' (D+30)" },
          payment_date: { type: "string", description: "Payment date in YYYY-MM-DD format" },
        },
        required: ["recipient_id", "amount", "timeframe", "payment_date"],
      },
    },
    {
      name: "get_anticipation",
      description: "Get anticipation details by ID",
      inputSchema: {
        type: "object",
        properties: {
          recipient_id: { type: "string", description: "Recipient ID (rp_xxx)" },
          anticipation_id: { type: "string", description: "Anticipation ID (anti_xxx)" },
        },
        required: ["recipient_id", "anticipation_id"],
      },
    },
    {
      name: "get_anticipation_limits",
      description: "Get anticipation limits available for a recipient",
      inputSchema: {
        type: "object",
        properties: {
          recipient_id: { type: "string", description: "Recipient ID (rp_xxx)" },
          timeframe: { type: "string", enum: ["start", "end"], description: "Anticipation timeframe" },
          payment_date: { type: "string", description: "Payment date in YYYY-MM-DD format" },
        },
        required: ["recipient_id", "timeframe", "payment_date"],
      },
    },
    {
      name: "create_plan",
      description: "Create a subscription plan",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Plan name" },
          description: { type: "string", description: "Plan description" },
          interval: { type: "string", enum: ["day", "week", "month", "year"], description: "Billing interval" },
          interval_count: { type: "number", description: "Number of intervals between charges (e.g., 1 = monthly)" },
          billing_type: { type: "string", enum: ["prepaid", "postpaid", "exact_day"], description: "Billing type" },
          payment_methods: {
            type: "array",
            items: { type: "string", enum: ["credit_card", "boleto", "pix"] },
            description: "Accepted payment methods",
          },
          items: {
            type: "array",
            description: "Plan items with pricing",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Item name" },
                quantity: { type: "number", description: "Quantity" },
                pricing_scheme: {
                  type: "object",
                  description: "Pricing scheme with scheme_type and price in cents",
                },
              },
            },
          },
          currency: { type: "string", description: "Currency code (default BRL)" },
        },
        required: ["name", "interval", "interval_count", "billing_type", "items"],
      },
    },
    {
      name: "update_plan",
      description: "Update an existing subscription plan",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Plan ID (plan_xxx)" },
          name: { type: "string", description: "New plan name" },
          description: { type: "string", description: "New plan description" },
          status: { type: "string", enum: ["active", "inactive"], description: "Plan status" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_subscription",
      description: "Create a recurring subscription for a customer",
      inputSchema: {
        type: "object",
        properties: {
          plan_id: { type: "string", description: "Plan ID (plan_xxx) — optional for ad-hoc subscriptions" },
          customer: {
            type: "object",
            description: "Customer object (or provide customer_id)",
          },
          customer_id: { type: "string", description: "Existing customer ID" },
          card: {
            type: "object",
            description: "Card object for credit card subscriptions (or provide card_id / card_token)",
          },
          card_id: { type: "string", description: "Existing card ID" },
          card_token: { type: "string", description: "Card token from create_card_token" },
          payment_method: { type: "string", enum: ["credit_card", "boleto", "pix"], description: "Payment method" },
          billing_type: { type: "string", enum: ["prepaid", "postpaid", "exact_day"], description: "Billing type" },
          interval: { type: "string", enum: ["day", "week", "month", "year"], description: "Billing interval (if no plan_id)" },
          interval_count: { type: "number", description: "Interval count (if no plan_id)" },
          items: { type: "array", description: "Subscription items (if no plan_id)" },
          currency: { type: "string", description: "Currency code (default BRL)" },
        },
      },
    },
    {
      name: "cancel_subscription",
      description: "Cancel a recurring subscription",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Subscription ID (sub_xxx)" },
          cancel_pending_invoices: { type: "boolean", description: "Cancel pending invoices as well" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_card_token",
      description: "Tokenize a credit card (PCI-safe). Requires a PUBLIC key (pk_xxx) passed as appId. Use via live public key — secret key is NOT used for tokens.",
      inputSchema: {
        type: "object",
        properties: {
          public_key: { type: "string", description: "Public key (pk_xxx) — overrides env for this call" },
          type: { type: "string", enum: ["card"], description: "Token type (always 'card')" },
          card: {
            type: "object",
            description: "Card data",
            properties: {
              number: { type: "string", description: "Card number" },
              holder_name: { type: "string", description: "Cardholder name" },
              exp_month: { type: "number", description: "Expiration month (1-12)" },
              exp_year: { type: "number", description: "Expiration year (4 digits)" },
              cvv: { type: "string", description: "CVV" },
              brand: { type: "string", description: "Card brand (optional)" },
            },
            required: ["number", "holder_name", "exp_month", "exp_year", "cvv"],
          },
        },
        required: ["card"],
      },
    },
    {
      name: "create_withdrawal",
      description: "Create a withdrawal (saque) transferring recipient balance to their registered bank account",
      inputSchema: {
        type: "object",
        properties: {
          recipient_id: { type: "string", description: "Recipient ID (rp_xxx)" },
          amount: { type: "number", description: "Amount in cents" },
          metadata: { type: "object", description: "Optional metadata key/value pairs" },
        },
        required: ["recipient_id", "amount"],
      },
    },
    {
      name: "register_webhook",
      description: "Register a webhook endpoint to receive event notifications",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "HTTPS endpoint URL that will receive events" },
          events: {
            type: "array",
            items: { type: "string" },
            description: "Event types to subscribe to (e.g. ['order.paid', 'charge.paid', 'subscription.canceled']). Use ['*'] for all events.",
          },
        },
        required: ["url", "events"],
      },
    },
    {
      name: "capture_charge",
      description: "Capture a pre-authorized charge (auth-then-capture flow). Optional amount for partial capture.",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Charge ID (ch_xxx)" },
          amount: { type: "number", description: "Amount in cents to capture (omit to capture full authorized amount)" },
          split: { type: "array", description: "Optional split rules at capture time" },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "partial_refund",
      description: "Refund a portion of a charge (explicit partial refund; returns amount in cents).",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Charge ID (ch_xxx)" },
          amount: { type: "number", description: "Amount in cents to refund (must be less than charge amount)" },
        },
        required: ["charge_id", "amount"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_order":
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("POST", "/orders", args), null, 2) }] };
      case "get_order":
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("GET", `/orders/${args?.id}`), null, 2) }] };
      case "list_orders": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.page) params.set("page", String(args.page));
        if (args?.size) params.set("size", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("GET", `/orders?${params}`), null, 2) }] };
      }
      case "create_charge": {
        const orderId = args?.order_id;
        const body = { ...args } as Record<string, unknown>;
        delete body.order_id;
        const path = orderId ? `/orders/${orderId}/charges` : "/charges";
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("POST", path, body), null, 2) }] };
      }
      case "get_charge":
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("GET", `/charges/${args?.id}`), null, 2) }] };
      case "create_recipient":
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("POST", "/recipients", args), null, 2) }] };
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("GET", "/balance"), null, 2) }] };
      case "create_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("POST", "/transfers", args), null, 2) }] };
      case "refund": {
        const chargeId = args?.charge_id;
        const body: Record<string, unknown> = {};
        if (args?.amount) body.amount = args.amount;
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("POST", `/charges/${chargeId}/refund`, body), null, 2) }] };
      }
      case "list_recipients": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.size) params.set("size", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("GET", `/recipients?${params}`), null, 2) }] };
      }
      case "create_anticipation": {
        const recipientId = args?.recipient_id;
        const body = { ...args } as Record<string, unknown>;
        delete body.recipient_id;
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("POST", `/recipients/${recipientId}/anticipations`, body), null, 2) }] };
      }
      case "get_anticipation":
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("GET", `/recipients/${args?.recipient_id}/anticipations/${args?.anticipation_id}`), null, 2) }] };
      case "get_anticipation_limits": {
        const params = new URLSearchParams();
        if (args?.timeframe) params.set("timeframe", String(args.timeframe));
        if (args?.payment_date) params.set("payment_date", String(args.payment_date));
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("GET", `/recipients/${args?.recipient_id}/anticipation_limits?${params}`), null, 2) }] };
      }
      case "create_plan":
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("POST", "/plans", args), null, 2) }] };
      case "update_plan": {
        const planId = args?.id;
        const body = { ...args } as Record<string, unknown>;
        delete body.id;
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("PUT", `/plans/${planId}`, body), null, 2) }] };
      }
      case "create_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("POST", "/subscriptions", args), null, 2) }] };
      case "cancel_subscription": {
        const subId = args?.id;
        const body: Record<string, unknown> = {};
        if (typeof args?.cancel_pending_invoices === "boolean") body.cancel_pending_invoices = args.cancel_pending_invoices;
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("DELETE", `/subscriptions/${subId}`, Object.keys(body).length ? body : undefined), null, 2) }] };
      }
      case "create_card_token": {
        // Tokens endpoint uses a PUBLIC key (pk_xxx) as query param 'appId', not secret key.
        const publicKey = (args?.public_key as string | undefined) || process.env.PAGARME_PUBLIC_KEY || "";
        if (!publicKey) {
          return { content: [{ type: "text", text: "Error: create_card_token requires a public key. Pass 'public_key' (pk_xxx) or set PAGARME_PUBLIC_KEY env var." }], isError: true };
        }
        const body = { ...args } as Record<string, unknown>;
        delete body.public_key;
        if (!body.type) body.type = "card";
        const res = await fetch(`${BASE_URL}/tokens?appId=${encodeURIComponent(publicKey)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const text = await res.text();
        if (!res.ok) {
          return { content: [{ type: "text", text: `Pagar.me API ${res.status}: ${text}` }], isError: true };
        }
        return { content: [{ type: "text", text }] };
      }
      case "create_withdrawal": {
        const recipientId = args?.recipient_id;
        const body = { ...args } as Record<string, unknown>;
        delete body.recipient_id;
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("POST", `/recipients/${recipientId}/withdrawals`, body), null, 2) }] };
      }
      case "register_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("POST", "/hooks", args), null, 2) }] };
      case "capture_charge": {
        const chargeId = args?.charge_id;
        const body: Record<string, unknown> = {};
        if (args?.amount) body.amount = args.amount;
        if (args?.split) body.split = args.split;
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("POST", `/charges/${chargeId}/capture`, body), null, 2) }] };
      }
      case "partial_refund": {
        const chargeId = args?.charge_id;
        return { content: [{ type: "text", text: JSON.stringify(await pagarmeRequest("POST", `/charges/${chargeId}/refund`, { amount: args?.amount }), null, 2) }] };
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
        const s = new Server({ name: "mcp-pagar-me", version: "0.2.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
