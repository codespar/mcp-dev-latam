#!/usr/bin/env node

/**
 * MCP Server for Stripe — global standard-bearer payments API.
 *
 * Distinct from @codespar/mcp-stripe-acp (which wraps Stripe's Agentic
 * Commerce Protocol, a new agent-specific product). This package wraps
 * Stripe's *regular* payments API — PaymentIntents, Checkout Sessions,
 * Billing, Refunds — the one nearly every LatAm SaaS that accepts Stripe
 * already uses today.
 *
 * Tools (30):
 *   Payment Intents:
 *     create_payment_intent       — POST /v1/payment_intents
 *     confirm_payment_intent      — POST /v1/payment_intents/{id}/confirm
 *     retrieve_payment_intent     — GET  /v1/payment_intents/{id}
 *     cancel_payment_intent       — POST /v1/payment_intents/{id}/cancel
 *     list_payment_intents        — GET  /v1/payment_intents
 *   Refunds:
 *     create_refund               — POST /v1/refunds
 *     list_refunds                — GET  /v1/refunds
 *   Customers:
 *     create_customer             — POST /v1/customers
 *     retrieve_customer           — GET  /v1/customers/{id}
 *     update_customer             — POST /v1/customers/{id}
 *   Products & Prices (catalog):
 *     create_product              — POST /v1/products
 *     list_products               — GET  /v1/products
 *     create_price                — POST /v1/prices
 *     list_prices                 — GET  /v1/prices
 *   Subscriptions (Stripe Billing):
 *     create_subscription         — POST /v1/subscriptions
 *     update_subscription         — POST /v1/subscriptions/{id}
 *     cancel_subscription         — DELETE /v1/subscriptions/{id}
 *     list_subscriptions          — GET  /v1/subscriptions
 *   Checkout (hosted):
 *     create_checkout_session     — POST /v1/checkout/sessions
 *   Payment Links:
 *     create_payment_link         — POST /v1/payment_links
 *     list_payment_links          — GET  /v1/payment_links
 *   Invoices:
 *     create_invoice              — POST /v1/invoices
 *     list_invoices               — GET  /v1/invoices
 *     finalize_invoice            — POST /v1/invoices/{id}/finalize
 *     send_invoice                — POST /v1/invoices/{id}/send
 *     pay_invoice                 — POST /v1/invoices/{id}/pay
 *     void_invoice                — POST /v1/invoices/{id}/void
 *   Disputes:
 *     update_dispute              — POST /v1/disputes/{id}  (submit evidence)
 *     list_disputes               — GET  /v1/disputes
 *   Balance:
 *     retrieve_balance            — GET  /v1/balance
 *
 * Authentication
 *   Authorization: Bearer ${STRIPE_SECRET_KEY}
 *   Key prefix selects env: sk_test_... → test mode, sk_live_... → live mode.
 *   No separate base URL. Optional Stripe-Version header pins API version.
 *
 * Request bodies
 *   application/x-www-form-urlencoded with nested bracket notation, e.g.
 *     customer[name]=Foo&metadata[order]=123&expand[]=latest_invoice
 *   Arrays of primitives use `key[]=val` repeats; arrays of objects use
 *   `key[0][child]=value`. Same convention as Chargebee.
 *
 * Environment
 *   STRIPE_SECRET_KEY    required. sk_test_... or sk_live_...
 *   STRIPE_API_VERSION   optional. Sent as Stripe-Version header when set.
 *
 * Docs: https://stripe.com/docs/api
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const API_VERSION = process.env.STRIPE_API_VERSION || "";
const BASE_URL = "https://api.stripe.com/v1";

/**
 * Flatten a nested object into Stripe's form-encoded convention.
 * Nested objects become `parent[child]=value`.
 * Arrays of primitives become `parent[]=v1&parent[]=v2` (Stripe's list convention).
 * Arrays of objects become `parent[0][child]=value`.
 */
function flattenForm(input: unknown, prefix = "", out: URLSearchParams = new URLSearchParams()): URLSearchParams {
  if (input === null || input === undefined) return out;
  if (Array.isArray(input)) {
    const primitive = input.every((v) => v === null || v === undefined || typeof v !== "object");
    if (primitive) {
      for (const item of input) {
        if (item === null || item === undefined) continue;
        out.append(`${prefix}[]`, String(item));
      }
      return out;
    }
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

async function stripeRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${SECRET_KEY}`,
    "Accept": "application/json",
  };
  if (API_VERSION) headers["Stripe-Version"] = API_VERSION;

  const init: RequestInit = { method, headers };
  if (body && method !== "GET" && method !== "DELETE") {
    const form = flattenForm(body);
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = form.toString();
  }

  let url = `${BASE_URL}${path}`;
  if (body && method === "GET") {
    const qs = flattenForm(body).toString();
    if (qs) url += (url.includes("?") ? "&" : "?") + qs;
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Stripe API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-stripe", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // Payment Intents
    {
      name: "create_payment_intent",
      description: "Create a PaymentIntent — Stripe's modern primitive for charging a customer. Use confirm=true to authorize + capture atomically, or omit for a two-step flow.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in the smallest currency unit (e.g. cents for USD, centavos for BRL)" },
          currency: { type: "string", description: "ISO-4217 currency code (usd, brl, mxn, eur, ...)" },
          customer: { type: "string", description: "Stripe customer id (cus_...) to attach this intent to" },
          payment_method: { type: "string", description: "PaymentMethod id (pm_...) to charge" },
          payment_method_types: { type: "array", items: { type: "string" }, description: "Allowed method types, e.g. ['card','pix','boleto']" },
          confirm: { type: "boolean", description: "If true, confirm the PaymentIntent immediately" },
          capture_method: { type: "string", enum: ["automatic", "automatic_async", "manual"], description: "manual = authorize only; capture later" },
          description: { type: "string", description: "Human-readable description" },
          receipt_email: { type: "string", description: "Email address to send a receipt to" },
          statement_descriptor: { type: "string", description: "Up to 22 chars appearing on the customer's statement" },
          metadata: { type: "object", description: "Arbitrary key-value metadata" },
          automatic_payment_methods: { type: "object", description: "e.g. { enabled: true } to let Stripe pick methods from the Dashboard" },
        },
        required: ["amount", "currency"],
      },
    },
    {
      name: "confirm_payment_intent",
      description: "Confirm a PaymentIntent created with confirm=false. Attaches and charges the payment method.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "PaymentIntent id (pi_...)" },
          payment_method: { type: "string", description: "PaymentMethod id to attach if not already set" },
          return_url: { type: "string", description: "URL to redirect to after 3DS / redirect-based methods" },
          off_session: { type: "boolean", description: "true for merchant-initiated confirmations without customer present" },
        },
        required: ["id"],
      },
    },
    {
      name: "retrieve_payment_intent",
      description: "Retrieve a PaymentIntent by id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "PaymentIntent id (pi_...)" },
          expand: { type: "array", items: { type: "string" }, description: "Relations to expand, e.g. ['customer','latest_charge']" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_payment_intent",
      description: "Cancel a PaymentIntent. Works only when status is requires_payment_method, requires_capture, requires_confirmation, requires_action, or processing.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "PaymentIntent id" },
          cancellation_reason: { type: "string", enum: ["duplicate", "fraudulent", "requested_by_customer", "abandoned"], description: "Reason for cancellation" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_payment_intents",
      description: "List PaymentIntents. Filter by customer or created window.",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Filter by customer id (cus_...)" },
          created: { type: "object", description: "Range filter, e.g. { gte: 1700000000, lte: 1710000000 }" },
          limit: { type: "number", description: "Page size (1-100)" },
          starting_after: { type: "string", description: "Cursor for pagination" },
          ending_before: { type: "string", description: "Cursor for reverse pagination" },
        },
      },
    },

    // Refunds
    {
      name: "create_refund",
      description: "Refund a charge or a PaymentIntent. Omit amount for a full refund; set amount for partial.",
      inputSchema: {
        type: "object",
        properties: {
          payment_intent: { type: "string", description: "PaymentIntent id to refund (pi_...). Provide this OR charge." },
          charge: { type: "string", description: "Charge id to refund (ch_...). Provide this OR payment_intent." },
          amount: { type: "number", description: "Partial refund amount in smallest currency unit. Omit for full refund." },
          reason: { type: "string", enum: ["duplicate", "fraudulent", "requested_by_customer"], description: "Refund reason" },
          metadata: { type: "object", description: "Arbitrary key-value metadata" },
        },
      },
    },
    {
      name: "list_refunds",
      description: "List Refunds. Filter by charge or payment_intent.",
      inputSchema: {
        type: "object",
        properties: {
          charge: { type: "string", description: "Filter by charge id" },
          payment_intent: { type: "string", description: "Filter by PaymentIntent id" },
          created: { type: "object", description: "Range filter, e.g. { gte, lte }" },
          limit: { type: "number", description: "Page size (1-100)" },
          starting_after: { type: "string" },
          ending_before: { type: "string" },
        },
      },
    },

    // Customers
    {
      name: "create_customer",
      description: "Create a Stripe Customer. All fields optional; Stripe will still assign a cus_... id.",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string" },
          name: { type: "string" },
          phone: { type: "string" },
          description: { type: "string" },
          address: { type: "object", description: "Address object (line1, line2, city, state, postal_code, country)" },
          shipping: { type: "object", description: "Shipping { name, phone, address }" },
          payment_method: { type: "string", description: "Default PaymentMethod id (pm_...) to attach" },
          invoice_settings: { type: "object", description: "e.g. { default_payment_method: 'pm_...' }" },
          metadata: { type: "object" },
        },
      },
    },
    {
      name: "retrieve_customer",
      description: "Retrieve a Customer by id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Customer id (cus_...)" },
          expand: { type: "array", items: { type: "string" }, description: "Relations to expand" },
        },
        required: ["id"],
      },
    },
    {
      name: "update_customer",
      description: "Update a Customer. Accepts any customer field.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Customer id (cus_...)" },
          email: { type: "string" },
          name: { type: "string" },
          phone: { type: "string" },
          description: { type: "string" },
          address: { type: "object" },
          shipping: { type: "object" },
          invoice_settings: { type: "object" },
          metadata: { type: "object" },
        },
        required: ["id"],
      },
    },

    // Products & Prices (catalog)
    {
      name: "create_product",
      description: "Create a Product — the catalog entity Prices reference. For a digital/physical good or SaaS plan, create one Product then one or more Prices.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Human-readable product name" },
          description: { type: "string" },
          active: { type: "boolean", description: "Whether product is currently available for purchase" },
          default_price_data: { type: "object", description: "Inline price to create alongside the product, e.g. { currency: 'usd', unit_amount: 1000 }" },
          images: { type: "array", items: { type: "string" }, description: "Array of image URLs" },
          tax_code: { type: "string", description: "Stripe Tax product tax code (e.g. 'txcd_10000000')" },
          unit_label: { type: "string", description: "Label to describe units on invoices (e.g. 'seat', 'user')" },
          url: { type: "string", description: "URL of a public-facing webpage for the product" },
          metadata: { type: "object" },
        },
        required: ["name"],
      },
    },
    {
      name: "list_products",
      description: "List Products. Filter by active flag or ids.",
      inputSchema: {
        type: "object",
        properties: {
          active: { type: "boolean", description: "Only return products matching this active flag" },
          ids: { type: "array", items: { type: "string" }, description: "Only return products with these ids" },
          limit: { type: "number", description: "Page size (1-100)" },
          starting_after: { type: "string" },
          ending_before: { type: "string" },
        },
      },
    },
    {
      name: "create_price",
      description: "Create a Price attached to a Product. Set recurring for subscription prices; omit for one-time. Amount is in smallest currency unit.",
      inputSchema: {
        type: "object",
        properties: {
          currency: { type: "string", description: "ISO-4217 code (usd, brl, mxn, ...)" },
          product: { type: "string", description: "Existing Product id (prod_...)" },
          product_data: { type: "object", description: "Inline product to create, e.g. { name: 'Pro Plan' }. Use instead of product." },
          unit_amount: { type: "number", description: "Price in smallest currency unit (cents for USD)" },
          unit_amount_decimal: { type: "string", description: "Alternative to unit_amount for sub-cent pricing" },
          recurring: { type: "object", description: "For subscriptions, e.g. { interval: 'month', interval_count: 1 }" },
          tax_behavior: { type: "string", enum: ["inclusive", "exclusive", "unspecified"] },
          nickname: { type: "string", description: "Internal-only name" },
          active: { type: "boolean" },
          metadata: { type: "object" },
        },
        required: ["currency"],
      },
    },
    {
      name: "list_prices",
      description: "List Prices. Filter by product, active flag, type (one_time/recurring), or currency.",
      inputSchema: {
        type: "object",
        properties: {
          product: { type: "string", description: "Filter by Product id" },
          active: { type: "boolean" },
          type: { type: "string", enum: ["one_time", "recurring"] },
          currency: { type: "string", description: "ISO-4217 code filter" },
          limit: { type: "number", description: "Page size (1-100)" },
          starting_after: { type: "string" },
          ending_before: { type: "string" },
        },
      },
    },

    // Subscriptions (Stripe Billing)
    {
      name: "create_subscription",
      description: "Create a Subscription for an existing customer. Items reference Prices (price_...) configured in the Stripe Dashboard or via the Prices API.",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Customer id (cus_...)" },
          items: {
            type: "array",
            description: "Array of subscription items, e.g. [{ price: 'price_123', quantity: 1 }]",
            items: { type: "object" },
          },
          default_payment_method: { type: "string", description: "PaymentMethod id to charge" },
          trial_period_days: { type: "number", description: "Trial length in days" },
          collection_method: { type: "string", enum: ["charge_automatically", "send_invoice"] },
          coupon: { type: "string", description: "Coupon id to apply" },
          metadata: { type: "object" },
        },
        required: ["customer", "items"],
      },
    },
    {
      name: "update_subscription",
      description: "Update a Subscription. Common uses: change items (plan swap), set cancel_at_period_end, apply a coupon, toggle pause_collection.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Subscription id (sub_...)" },
          items: { type: "array", items: { type: "object" }, description: "Subscription items to add/update/delete, e.g. [{ id: 'si_...', price: 'price_...' }]" },
          cancel_at_period_end: { type: "boolean", description: "If true, subscription cancels at end of current billing period" },
          default_payment_method: { type: "string", description: "PaymentMethod id (pm_...)" },
          proration_behavior: { type: "string", enum: ["create_prorations", "none", "always_invoice"] },
          coupon: { type: "string", description: "Coupon id to apply" },
          pause_collection: { type: "object", description: "e.g. { behavior: 'mark_uncollectible' } — pass null to resume" },
          trial_end: { type: "string", description: "Unix timestamp or 'now' to end trial" },
          metadata: { type: "object" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_subscription",
      description: "Cancel a Subscription. By default cancels immediately. For end-of-period cancellation use update_subscription with cancel_at_period_end=true (not exposed here).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Subscription id (sub_...)" },
          invoice_now: { type: "boolean", description: "Generate a final invoice for any unbilled usage" },
          prorate: { type: "boolean", description: "Credit unused time on a prorated basis" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_subscriptions",
      description: "List Subscriptions. Filter by customer, status, or price.",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Filter by customer id" },
          status: { type: "string", description: "active, past_due, unpaid, canceled, incomplete, incomplete_expired, trialing, paused, all" },
          price: { type: "string", description: "Filter by Price id" },
          limit: { type: "number", description: "Page size (1-100)" },
          starting_after: { type: "string", description: "Cursor for pagination" },
        },
      },
    },

    // Checkout
    {
      name: "create_checkout_session",
      description: "Create a hosted Checkout Session. Returns a url the customer completes payment on. Use mode='payment' for one-time, 'subscription' for recurring, 'setup' for saving a card for future use.",
      inputSchema: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["payment", "subscription", "setup"], description: "Checkout mode" },
          line_items: {
            type: "array",
            description: "Items to charge, e.g. [{ price: 'price_123', quantity: 1 }] or [{ price_data: { currency, product_data, unit_amount }, quantity }]",
            items: { type: "object" },
          },
          success_url: { type: "string", description: "Redirect URL after payment (supports {CHECKOUT_SESSION_ID} placeholder)" },
          cancel_url: { type: "string", description: "Redirect URL if customer cancels" },
          customer: { type: "string", description: "Existing customer id" },
          customer_email: { type: "string", description: "Prefill email when no customer id" },
          client_reference_id: { type: "string", description: "Merchant-side reference (order id, user id)" },
          payment_method_types: { type: "array", items: { type: "string" }, description: "e.g. ['card','pix','boleto']" },
          allow_promotion_codes: { type: "boolean" },
          metadata: { type: "object" },
        },
        required: ["mode", "success_url"],
      },
    },

    // Payment Links
    {
      name: "create_payment_link",
      description: "Create a long-lived Payment Link (shareable URL) that charges a price or set of line items. Ideal for invoicing, creator payouts, Telegram/WhatsApp commerce.",
      inputSchema: {
        type: "object",
        properties: {
          line_items: {
            type: "array",
            description: "Items to charge, e.g. [{ price: 'price_123', quantity: 1 }]",
            items: { type: "object" },
          },
          after_completion: { type: "object", description: "e.g. { type: 'redirect', redirect: { url: 'https://...' } }" },
          allow_promotion_codes: { type: "boolean" },
          currency: { type: "string", description: "ISO-4217 currency code (required if line_items use price_data)" },
          metadata: { type: "object" },
          payment_method_types: { type: "array", items: { type: "string" } },
        },
        required: ["line_items"],
      },
    },
    {
      name: "list_payment_links",
      description: "List Payment Links. Filter by active flag.",
      inputSchema: {
        type: "object",
        properties: {
          active: { type: "boolean", description: "Filter by active flag" },
          limit: { type: "number", description: "Page size (1-100)" },
          starting_after: { type: "string" },
          ending_before: { type: "string" },
        },
      },
    },

    // Invoices
    {
      name: "create_invoice",
      description: "Create an Invoice draft for a customer. Add InvoiceItems first (not exposed here — use Stripe Dashboard or Prices API), then finalize/send via Stripe's invoice lifecycle.",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Customer id (cus_...)" },
          collection_method: { type: "string", enum: ["charge_automatically", "send_invoice"] },
          days_until_due: { type: "number", description: "Days until invoice is due (send_invoice mode only)" },
          auto_advance: { type: "boolean", description: "Auto-finalize this draft after ~1h" },
          description: { type: "string" },
          subscription: { type: "string", description: "Subscription id to bill against" },
          metadata: { type: "object" },
        },
        required: ["customer"],
      },
    },
    {
      name: "list_invoices",
      description: "List Invoices. Filter by customer, status, or subscription.",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Filter by customer id" },
          status: { type: "string", enum: ["draft", "open", "paid", "uncollectible", "void"] },
          subscription: { type: "string", description: "Filter by subscription id" },
          collection_method: { type: "string", enum: ["charge_automatically", "send_invoice"] },
          created: { type: "object", description: "Range filter, e.g. { gte, lte }" },
          limit: { type: "number", description: "Page size (1-100)" },
          starting_after: { type: "string" },
          ending_before: { type: "string" },
        },
      },
    },
    {
      name: "finalize_invoice",
      description: "Finalize a draft Invoice. Moves status draft → open and makes it payable. Required before send/pay when auto_advance=false.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Invoice id (in_...)" },
          auto_advance: { type: "boolean", description: "Whether Stripe should auto-advance the invoice lifecycle after finalization" },
        },
        required: ["id"],
      },
    },
    {
      name: "send_invoice",
      description: "Send a finalized Invoice to the customer by email. Only works when collection_method=send_invoice.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Invoice id (in_...)" },
        },
        required: ["id"],
      },
    },
    {
      name: "pay_invoice",
      description: "Attempt to collect payment on an open Invoice. Charges the customer's default payment method (or the one provided).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Invoice id (in_...)" },
          payment_method: { type: "string", description: "PaymentMethod id (pm_...) to charge" },
          source: { type: "string", description: "Legacy source id" },
          paid_out_of_band: { type: "boolean", description: "Mark as paid outside Stripe (no charge attempted)" },
          forgive: { type: "boolean", description: "Allow payment even when smaller than amount_due" },
          off_session: { type: "boolean" },
        },
        required: ["id"],
      },
    },
    {
      name: "void_invoice",
      description: "Void a finalized Invoice. Similar to deletion but preserves the audit trail. Cannot be undone.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Invoice id (in_...)" },
        },
        required: ["id"],
      },
    },

    // Disputes
    {
      name: "update_dispute",
      description: "Submit evidence on a Dispute. Pass an `evidence` object with customer_name, receipt, shipping_documentation, etc. Set submit=true to lock and submit to the bank.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Dispute id (dp_...)" },
          evidence: { type: "object", description: "Evidence object — see Stripe docs for fields (customer_name, customer_email_address, receipt, refund_policy, service_documentation, shipping_documentation, uncategorized_text, etc.)" },
          submit: { type: "boolean", description: "If true, lock and submit evidence to the card network. Cannot be undone." },
          metadata: { type: "object" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_disputes",
      description: "List Disputes. Filter by charge, payment_intent, or created window.",
      inputSchema: {
        type: "object",
        properties: {
          charge: { type: "string", description: "Filter by charge id" },
          payment_intent: { type: "string", description: "Filter by PaymentIntent id" },
          created: { type: "object", description: "Range filter, e.g. { gte, lte }" },
          limit: { type: "number", description: "Page size (1-100)" },
          starting_after: { type: "string" },
          ending_before: { type: "string" },
        },
      },
    },

    // Balance
    {
      name: "retrieve_balance",
      description: "Retrieve the current Stripe account balance — available, pending, and connect_reserved funds broken down by currency. No parameters.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args || {}) as Record<string, any>;

  try {
    switch (name) {
      // Payment Intents
      case "create_payment_intent":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/payment_intents", a), null, 2) }] };
      case "confirm_payment_intent": {
        const { id, ...body } = a;
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", `/payment_intents/${id}/confirm`, body), null, 2) }] };
      }
      case "retrieve_payment_intent": {
        const { id, ...query } = a;
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", `/payment_intents/${id}`, query), null, 2) }] };
      }
      case "cancel_payment_intent": {
        const { id, ...body } = a;
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", `/payment_intents/${id}/cancel`, body), null, 2) }] };
      }
      case "list_payment_intents":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", "/payment_intents", a), null, 2) }] };

      // Refunds
      case "create_refund":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/refunds", a), null, 2) }] };
      case "list_refunds":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", "/refunds", a), null, 2) }] };

      // Customers
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/customers", a), null, 2) }] };
      case "retrieve_customer": {
        const { id, ...query } = a;
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", `/customers/${id}`, query), null, 2) }] };
      }
      case "update_customer": {
        const { id, ...body } = a;
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", `/customers/${id}`, body), null, 2) }] };
      }

      // Products & Prices
      case "create_product":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/products", a), null, 2) }] };
      case "list_products":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", "/products", a), null, 2) }] };
      case "create_price":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/prices", a), null, 2) }] };
      case "list_prices":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", "/prices", a), null, 2) }] };

      // Subscriptions
      case "create_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/subscriptions", a), null, 2) }] };
      case "update_subscription": {
        const { id, ...body } = a;
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", `/subscriptions/${id}`, body), null, 2) }] };
      }
      case "cancel_subscription": {
        const { id, ...body } = a;
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("DELETE", `/subscriptions/${id}${Object.keys(body).length ? "?" + flattenForm(body).toString() : ""}`), null, 2) }] };
      }
      case "list_subscriptions":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", "/subscriptions", a), null, 2) }] };

      // Checkout
      case "create_checkout_session":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/checkout/sessions", a), null, 2) }] };

      // Payment Links
      case "create_payment_link":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/payment_links", a), null, 2) }] };
      case "list_payment_links":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", "/payment_links", a), null, 2) }] };

      // Invoices
      case "create_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", "/invoices", a), null, 2) }] };
      case "list_invoices":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", "/invoices", a), null, 2) }] };
      case "finalize_invoice": {
        const { id, ...body } = a;
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", `/invoices/${id}/finalize`, body), null, 2) }] };
      }
      case "send_invoice": {
        const { id } = a;
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", `/invoices/${id}/send`), null, 2) }] };
      }
      case "pay_invoice": {
        const { id, ...body } = a;
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", `/invoices/${id}/pay`, body), null, 2) }] };
      }
      case "void_invoice": {
        const { id } = a;
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", `/invoices/${id}/void`), null, 2) }] };
      }

      // Disputes
      case "update_dispute": {
        const { id, ...body } = a;
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("POST", `/disputes/${id}`, body), null, 2) }] };
      }
      case "list_disputes":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", "/disputes", a), null, 2) }] };

      // Balance
      case "retrieve_balance":
        return { content: [{ type: "text", text: JSON.stringify(await stripeRequest("GET", "/balance", a), null, 2) }] };

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
    app.get("/health", (_req: unknown, res: { json: (body: unknown) => unknown }) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: { headers: Record<string, string | string[] | undefined>; body: unknown }, res: { status: (code: number) => { json: (body: unknown) => unknown } }) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req as never, res as never, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-stripe", version: "0.2.1" }, { capabilities: { tools: {} } });
        (server as unknown as { _requestHandlers: Map<unknown, unknown> })._requestHandlers.forEach((v, k) => (s as unknown as { _requestHandlers: Map<unknown, unknown> })._requestHandlers.set(k, v));
        (server as unknown as { _notificationHandlers?: Map<unknown, unknown> })._notificationHandlers?.forEach((v, k) => (s as unknown as { _notificationHandlers: Map<unknown, unknown> })._notificationHandlers.set(k, v));
        await s.connect(t);
        await t.handleRequest(req as never, res as never, req.body); return;
      }
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
    });
    app.get("/mcp", async (req: { headers: Record<string, string | string[] | undefined> }, res: { status: (code: number) => { send: (body: string) => unknown } }) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req as never, res as never); else res.status(400).send("Invalid session"); });
    app.delete("/mcp", async (req: { headers: Record<string, string | string[] | undefined> }, res: { status: (code: number) => { send: (body: string) => unknown } }) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req as never, res as never); else res.status(400).send("Invalid session"); });
    const port = Number(process.env.MCP_PORT) || 3000;
    app.listen(port, () => { console.error(`MCP HTTP server on http://localhost:${port}/mcp`); });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch(console.error);
