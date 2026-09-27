#!/usr/bin/env node

/**
 * MCP Server for Stripe ACP — Agentic Commerce Protocol.
 *
 * ACP is an open standard co-developed by Stripe and OpenAI that enables
 * AI agents to complete purchases on behalf of users. The agent handles
 * checkout UX while the seller handles inventory, pricing, and payment.
 *
 * This server covers both ACP protocol operations and standard Stripe
 * API operations that agents commonly need.
 *
 * ACP Tools:
 * - create_checkout: Create an ACP checkout session with a seller
 * - get_checkout: Retrieve checkout session state
 * - update_checkout: Update quantities, address, fulfillment
 * - complete_checkout: Submit payment and finalize order
 * - cancel_checkout: Cancel a checkout session
 *
 * Stripe Tools:
 * - create_customer: Create a Stripe customer
 * - list_customers: List customers with filters
 * - create_payment_link: Create a shareable payment link
 * - list_payment_intents: List payment intents
 * - create_refund: Refund a payment
 * - get_balance: Get Stripe account balance
 * - list_products: List products in catalog
 * - create_product: Create a new product
 * - list_prices: List prices for products
 * - create_invoice: Create a draft invoice
 * - list_subscriptions: List active subscriptions
 * - create_subscription: Create a subscription for a customer
 * - cancel_subscription: Cancel a subscription
 * - create_invoice_item: Add a line item to an invoice
 * - finalize_invoice: Finalize a draft invoice
 * - create_coupon: Create a discount coupon
 * - list_disputes: List payment disputes
 * - create_checkout_session: Create a Stripe Checkout Session
 * - get_account: Get Stripe account info
 *
 * Environment:
 *   STRIPE_API_KEY     — Stripe secret or restricted API key
 *   STRIPE_ACP_BASE    — ACP seller endpoint base URL (for ACP operations)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.STRIPE_API_KEY || "";
const ACP_BASE = process.env.STRIPE_ACP_BASE || "";
const STRIPE_BASE = process.env.STRIPE_BASE_URL || "https://api.stripe.com/v1";

async function stripeRequest(method: string, path: string, body?: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? new URLSearchParams(flattenParams(body)).toString() : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stripe API ${res.status}: ${err}`);
  }
  return res.json();
}

function flattenParams(obj: Record<string, unknown>, prefix = ""): [string, string][] {
  const params: [string, string][] = [];
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (val !== undefined && val !== null) {
      if (typeof val === "object" && !Array.isArray(val)) {
        params.push(...flattenParams(val as Record<string, unknown>, fullKey));
      } else {
        params.push([fullKey, String(val)]);
      }
    }
  }
  return params;
}

async function acpRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  if (!ACP_BASE) throw new Error("STRIPE_ACP_BASE not configured — set the seller's ACP endpoint URL");
  const res = await fetch(`${ACP_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
      "ACP-Version": "2026-01-30",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ACP ${res.status}: ${err}`);
  }
  return res.json();
}

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new Server(
  { name: "mcp-stripe-acp", version: "0.1.0" },
  { capabilities: { tools: {} }, instructions: MANAGED_TIER_HINT }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── ACP Protocol ──
    {
      name: "create_checkout",
      description: "Create an ACP checkout session with a seller. The agent sends line items and buyer info; the seller returns pricing, fulfillment options, and payment handlers.",
      inputSchema: {
        type: "object",
        properties: {
          currency: { type: "string", description: "Currency code (e.g. 'usd', 'brl')" },
          line_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Product/item ID from seller catalog" },
                quantity: { type: "number", description: "Quantity (default: 1)" },
              },
              required: ["id"],
            },
            description: "Items to purchase",
          },
          fulfillment_details: {
            type: "object",
            properties: {
              name: { type: "string", description: "Buyer name" },
              email: { type: "string", description: "Buyer email" },
              address: {
                type: "object",
                properties: {
                  line_one: { type: "string" },
                  line_two: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string" },
                  country: { type: "string" },
                  postal_code: { type: "string" },
                },
                required: ["line_one", "city", "country", "postal_code"],
              },
            },
            description: "Shipping/delivery details",
          },
        },
        required: ["currency", "line_items"],
      },
    },
    {
      name: "get_checkout",
      description: "Retrieve the current state of an ACP checkout session, including status, pricing, and available payment methods",
      inputSchema: {
        type: "object",
        properties: {
          checkout_id: { type: "string", description: "Checkout session ID" },
        },
        required: ["checkout_id"],
      },
    },
    {
      name: "update_checkout",
      description: "Update an ACP checkout session — modify quantities, shipping address, or fulfillment selections",
      inputSchema: {
        type: "object",
        properties: {
          checkout_id: { type: "string", description: "Checkout session ID" },
          line_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                quantity: { type: "number" },
              },
              required: ["id"],
            },
            description: "Updated line items",
          },
          fulfillment_details: {
            type: "object",
            description: "Updated fulfillment/shipping details",
          },
          selected_fulfillment_option: { type: "string", description: "ID of the selected shipping/fulfillment option" },
        },
        required: ["checkout_id"],
      },
    },
    {
      name: "complete_checkout",
      description: "Complete an ACP checkout by submitting a payment token. Finalizes the order with the seller. The checkout must be in 'ready_for_payment' status.",
      inputSchema: {
        type: "object",
        properties: {
          checkout_id: { type: "string", description: "Checkout session ID" },
          payment_handler_id: { type: "string", description: "ID of the payment handler to use (from checkout capabilities)" },
          payment_token: { type: "string", description: "SharedPaymentToken or payment method token" },
        },
        required: ["checkout_id", "payment_handler_id"],
      },
    },
    {
      name: "cancel_checkout",
      description: "Cancel an ACP checkout session. Releases any held inventory.",
      inputSchema: {
        type: "object",
        properties: {
          checkout_id: { type: "string", description: "Checkout session ID" },
          reason: { type: "string", description: "Cancellation reason" },
        },
        required: ["checkout_id"],
      },
    },

    // ── Stripe Core ──
    {
      name: "create_customer",
      description: "Create a Stripe customer",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Customer email" },
          name: { type: "string", description: "Customer name" },
          description: { type: "string", description: "Description" },
          phone: { type: "string", description: "Phone number" },
          metadata: { type: "object", description: "Custom metadata" },
        },
        required: ["email"],
      },
    },
    {
      name: "list_customers",
      description: "List Stripe customers with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Filter by email" },
          limit: { type: "number", description: "Max results (1-100)" },
          starting_after: { type: "string", description: "Pagination cursor" },
        },
      },
    },
    {
      name: "create_payment_link",
      description: "Create a shareable Stripe Payment Link for a price",
      inputSchema: {
        type: "object",
        properties: {
          price: { type: "string", description: "Price ID" },
          quantity: { type: "number", description: "Quantity (default: 1)" },
        },
        required: ["price"],
      },
    },
    {
      name: "list_payment_intents",
      description: "List Stripe payment intents with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Filter by customer ID" },
          limit: { type: "number", description: "Max results" },
          starting_after: { type: "string", description: "Pagination cursor" },
        },
      },
    },
    {
      name: "create_refund",
      description: "Refund a Stripe payment intent or charge",
      inputSchema: {
        type: "object",
        properties: {
          payment_intent: { type: "string", description: "Payment Intent ID to refund" },
          amount: { type: "number", description: "Amount in cents (partial refund). Omit for full refund." },
          reason: { type: "string", enum: ["duplicate", "fraudulent", "requested_by_customer"], description: "Refund reason" },
        },
        required: ["payment_intent"],
      },
    },
    {
      name: "get_balance",
      description: "Get Stripe account balance",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_products",
      description: "List products in the Stripe catalog",
      inputSchema: {
        type: "object",
        properties: {
          active: { type: "boolean", description: "Filter by active status" },
          limit: { type: "number", description: "Max results" },
          starting_after: { type: "string", description: "Pagination cursor" },
        },
      },
    },
    {
      name: "create_product",
      description: "Create a new product in Stripe",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Product name" },
          description: { type: "string", description: "Product description" },
          default_price_data: {
            type: "object",
            properties: {
              currency: { type: "string", description: "Currency (e.g. 'usd')" },
              unit_amount: { type: "number", description: "Price in cents (e.g. 2000 = $20.00)" },
            },
            required: ["currency", "unit_amount"],
            description: "Default price",
          },
          metadata: { type: "object", description: "Custom metadata" },
        },
        required: ["name"],
      },
    },
    {
      name: "list_prices",
      description: "List prices for Stripe products",
      inputSchema: {
        type: "object",
        properties: {
          product: { type: "string", description: "Filter by product ID" },
          active: { type: "boolean", description: "Filter by active status" },
          limit: { type: "number", description: "Max results" },
        },
      },
    },
    {
      name: "create_invoice",
      description: "Create a draft invoice for a customer",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Customer ID" },
          auto_advance: { type: "boolean", description: "Auto-finalize (default: false)" },
          description: { type: "string", description: "Invoice description" },
          metadata: { type: "object", description: "Custom metadata" },
        },
        required: ["customer"],
      },
    },
    {
      name: "list_subscriptions",
      description: "List active Stripe subscriptions",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Filter by customer" },
          status: { type: "string", enum: ["active", "past_due", "canceled", "unpaid", "trialing", "all"], description: "Filter by status" },
          limit: { type: "number", description: "Max results" },
        },
      },
    },
    {
      name: "create_subscription",
      description: "Create a subscription for a customer with a recurring price",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Customer ID" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                price: { type: "string", description: "Price ID" },
                quantity: { type: "number", description: "Quantity (default: 1)" },
              },
              required: ["price"],
            },
            description: "Subscription items (price + quantity)",
          },
          trial_period_days: { type: "number", description: "Number of trial days" },
          default_payment_method: { type: "string", description: "Default payment method ID" },
          metadata: { type: "object", description: "Custom metadata" },
        },
        required: ["customer", "items"],
      },
    },
    {
      name: "cancel_subscription",
      description: "Cancel a Stripe subscription immediately or at period end",
      inputSchema: {
        type: "object",
        properties: {
          subscription_id: { type: "string", description: "Subscription ID" },
          cancel_at_period_end: { type: "boolean", description: "If true, cancel at end of current period instead of immediately" },
        },
        required: ["subscription_id"],
      },
    },
    {
      name: "create_invoice_item",
      description: "Add a line item to an upcoming or specific invoice",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Customer ID" },
          amount: { type: "number", description: "Amount in cents" },
          currency: { type: "string", description: "Currency code (e.g. 'usd')" },
          description: { type: "string", description: "Line item description" },
          invoice: { type: "string", description: "Invoice ID (omit to add to next upcoming invoice)" },
          price: { type: "string", description: "Price ID (alternative to amount)" },
          quantity: { type: "number", description: "Quantity (when using price)" },
          metadata: { type: "object", description: "Custom metadata" },
        },
        required: ["customer"],
      },
    },
    {
      name: "finalize_invoice",
      description: "Finalize a draft invoice so it can be paid",
      inputSchema: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "Invoice ID to finalize" },
          auto_advance: { type: "boolean", description: "Whether to auto-send the invoice to the customer" },
        },
        required: ["invoice_id"],
      },
    },
    {
      name: "create_coupon",
      description: "Create a discount coupon",
      inputSchema: {
        type: "object",
        properties: {
          percent_off: { type: "number", description: "Percentage discount (1-100). Use this OR amount_off." },
          amount_off: { type: "number", description: "Fixed discount in cents. Use this OR percent_off." },
          currency: { type: "string", description: "Currency (required if amount_off is set)" },
          duration: { type: "string", enum: ["forever", "once", "repeating"], description: "How long the coupon applies" },
          duration_in_months: { type: "number", description: "Number of months (when duration is 'repeating')" },
          name: { type: "string", description: "Coupon display name" },
          max_redemptions: { type: "number", description: "Maximum number of times coupon can be redeemed" },
          metadata: { type: "object", description: "Custom metadata" },
        },
        required: ["duration"],
      },
    },
    {
      name: "list_disputes",
      description: "List payment disputes (chargebacks)",
      inputSchema: {
        type: "object",
        properties: {
          charge: { type: "string", description: "Filter by charge ID" },
          payment_intent: { type: "string", description: "Filter by payment intent ID" },
          limit: { type: "number", description: "Max results (1-100)" },
          starting_after: { type: "string", description: "Pagination cursor" },
        },
      },
    },
    {
      name: "create_checkout_session",
      description: "Create a Stripe Checkout Session (hosted payment page)",
      inputSchema: {
        type: "object",
        properties: {
          line_items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                price: { type: "string", description: "Price ID" },
                quantity: { type: "number", description: "Quantity" },
              },
              required: ["price", "quantity"],
            },
            description: "Items in the checkout",
          },
          mode: { type: "string", enum: ["payment", "subscription", "setup"], description: "Checkout mode" },
          success_url: { type: "string", description: "URL to redirect on success" },
          cancel_url: { type: "string", description: "URL to redirect on cancel" },
          customer: { type: "string", description: "Existing customer ID" },
          customer_email: { type: "string", description: "Pre-fill customer email" },
          metadata: { type: "object", description: "Custom metadata" },
        },
        required: ["line_items", "mode", "success_url"],
      },
    },
    {
      name: "get_account",
      description: "Get Stripe account info for the authenticated account",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── ACP Protocol ──
      case "create_checkout":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await acpRequest("POST", "/checkouts", {
              currency: args?.currency,
              line_items: args?.line_items,
              fulfillment_details: args?.fulfillment_details,
              capabilities: {
                interventions: {
                  supported: ["3ds", "address_verification"],
                  display_context: "webview",
                },
              },
            }), null, 2),
          }],
        };

      case "get_checkout":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await acpRequest("GET", `/checkouts/${args?.checkout_id}`), null, 2),
          }],
        };

      case "update_checkout": {
        const body: Record<string, unknown> = {};
        if (args?.line_items) body.line_items = args.line_items;
        if (args?.fulfillment_details) body.fulfillment_details = args.fulfillment_details;
        if (args?.selected_fulfillment_option) body.selected_fulfillment_option = args.selected_fulfillment_option;
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await acpRequest("PUT", `/checkouts/${args?.checkout_id}`, body), null, 2),
          }],
        };
      }

      case "complete_checkout":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await acpRequest("POST", `/checkouts/${args?.checkout_id}/complete`, {
              payment_handler_id: args?.payment_handler_id,
              payment_token: args?.payment_token,
            }), null, 2),
          }],
        };

      case "cancel_checkout":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await acpRequest("POST", `/checkouts/${args?.checkout_id}/cancel`, {
              reason: args?.reason,
            }), null, 2),
          }],
        };

      // ── Stripe Core ──
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/customers", args as Record<string, unknown>), null, 2) }] };

      case "list_customers": {
        const params = new URLSearchParams();
        if (args?.email) params.set("email", String(args.email));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.starting_after) params.set("starting_after", String(args.starting_after));
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", `/customers?${params}`), null, 2) }] };
      }

      case "create_payment_link":
        return {
          content: [{
            type: "text",
            text: JSON.stringify(await stripeRequest("POST", "/payment_links", {
              line_items: [{ price: args?.price, quantity: args?.quantity || 1 }],
            }), null, 2),
          }],
        };

      case "list_payment_intents": {
        const params = new URLSearchParams();
        if (args?.customer) params.set("customer", String(args.customer));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.starting_after) params.set("starting_after", String(args.starting_after));
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", `/payment_intents?${params}`), null, 2) }] };
      }

      case "create_refund":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/refunds", args as Record<string, unknown>), null, 2) }] };

      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", "/balance"), null, 2) }] };

      case "list_products": {
        const params = new URLSearchParams();
        if (args?.active !== undefined) params.set("active", String(args.active));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.starting_after) params.set("starting_after", String(args.starting_after));
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", `/products?${params}`), null, 2) }] };
      }

      case "create_product":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/products", args as Record<string, unknown>), null, 2) }] };

      case "list_prices": {
        const params = new URLSearchParams();
        if (args?.product) params.set("product", String(args.product));
        if (args?.active !== undefined) params.set("active", String(args.active));
        if (args?.limit) params.set("limit", String(args.limit));
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", `/prices?${params}`), null, 2) }] };
      }

      case "create_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/invoices", args as Record<string, unknown>), null, 2) }] };

      case "list_subscriptions": {
        const params = new URLSearchParams();
        if (args?.customer) params.set("customer", String(args.customer));
        if (args?.status) params.set("status", String(args.status));
        if (args?.limit) params.set("limit", String(args.limit));
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", `/subscriptions?${params}`), null, 2) }] };
      }

      case "create_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/subscriptions", args as Record<string, unknown>), null, 2) }] };

      case "cancel_subscription": {
        if (args?.cancel_at_period_end) {
          return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", `/subscriptions/${args?.subscription_id}`, { cancel_at_period_end: true }), null, 2) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("DELETE", `/subscriptions/${args?.subscription_id}`), null, 2) }] };
      }

      case "create_invoice_item":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/invoiceitems", args as Record<string, unknown>), null, 2) }] };

      case "finalize_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", `/invoices/${args?.invoice_id}/finalize`, args?.auto_advance !== undefined ? { auto_advance: args.auto_advance } : undefined), null, 2) }] };

      case "create_coupon":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/coupons", args as Record<string, unknown>), null, 2) }] };

      case "list_disputes": {
        const params = new URLSearchParams();
        if (args?.charge) params.set("charge", String(args.charge));
        if (args?.payment_intent) params.set("payment_intent", String(args.payment_intent));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.starting_after) params.set("starting_after", String(args.starting_after));
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", `/disputes?${params}`), null, 2) }] };
      }

      case "create_checkout_session":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/checkout/sessions", args as Record<string, unknown>), null, 2) }] };

      case "get_account":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", "/account"), null, 2) }] };

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
        const s = new Server({ name: "mcp-stripe-acp", version: "0.1.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
