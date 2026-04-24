#!/usr/bin/env node

/**
 * MCP Server for Shopify — global ecommerce platform Admin REST API.
 *
 * Shopify is the global DTC standard and dominant in LatAm for international
 * brands. Agents building merchant tools (restocking, refund automation,
 * marketing campaigns, fulfillment orchestration) integrate directly with
 * the Admin API rather than through a reseller.
 *
 * Tools (28):
 *   list_orders                 — GET /orders.json (filters: status, financial_status, created_at_min, etc)
 *   get_order                   — GET /orders/{id}.json
 *   create_order                — POST /orders.json
 *   update_order                — PUT /orders/{id}.json
 *   cancel_order                — POST /orders/{id}/cancel.json
 *   list_products               — GET /products.json
 *   get_product                 — GET /products/{id}.json
 *   create_product              — POST /products.json
 *   update_product              — PUT /products/{id}.json
 *   list_customers              — GET /customers.json
 *   create_customer             — POST /customers.json
 *   adjust_inventory            — POST /inventory_levels/adjust.json
 *   create_fulfillment          — POST /fulfillments.json (Fulfillment API 2024-01)
 *   update_fulfillment_tracking — POST /fulfillments/{id}/update_tracking.json
 *   create_draft_order          — POST /draft_orders.json
 *   complete_draft_order        — PUT /draft_orders/{id}/complete.json
 *   create_price_rule           — POST /price_rules.json
 *   create_discount_code        — POST /price_rules/{price_rule_id}/discount_codes.json
 *   create_smart_collection     — POST /smart_collections.json
 *   create_custom_collection    — POST /custom_collections.json
 *   create_metafield            — POST /metafields.json
 *   create_variant              — POST /products/{product_id}/variants.json
 *   update_variant              — PUT /variants/{id}.json
 *   list_transactions           — GET /orders/{order_id}/transactions.json
 *   list_abandoned_checkouts    — GET /checkouts.json
 *   list_locations              — GET /locations.json
 *   create_refund               — POST /orders/{order_id}/refunds.json
 *   register_webhook            — POST /webhooks.json
 *
 * Authentication
 *   Private/custom app access token sent as header:
 *     X-Shopify-Access-Token: <SHOPIFY_ACCESS_TOKEN>
 *
 * Environment
 *   SHOPIFY_SHOP          — shop subdomain (e.g. "acme" for acme.myshopify.com)
 *   SHOPIFY_ACCESS_TOKEN  — Admin API access token (secret)
 *   SHOPIFY_API_VERSION   — optional; defaults to 2024-01
 *
 * Docs: https://shopify.dev/docs/api/admin-rest
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const SHOP = process.env.SHOPIFY_SHOP || "";
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || "";
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";
const BASE_URL = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}`;

async function shopifyRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ACCESS_TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Shopify API ${res.status}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

function buildQuery(params: Record<string, unknown> | undefined): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  const qs = entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
  return `?${qs}`;
}

const server = new Server(
  { name: "mcp-shopify", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_orders",
      description: "List orders with optional filters. Returns an array of order objects with line items, customer, shipping, and financial status.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["open", "closed", "cancelled", "any"], description: "Order status. Defaults to 'open'." },
          financial_status: { type: "string", description: "Filter by financial status (paid, pending, refunded, voided, partially_paid, partially_refunded, authorized)" },
          fulfillment_status: { type: "string", description: "Filter by fulfillment status (shipped, partial, unshipped, any, unfulfilled)" },
          created_at_min: { type: "string", description: "ISO-8601 minimum created_at timestamp" },
          created_at_max: { type: "string", description: "ISO-8601 maximum created_at timestamp" },
          updated_at_min: { type: "string", description: "ISO-8601 minimum updated_at timestamp" },
          limit: { type: "number", description: "Max results per page (1-250, default 50)" },
          ids: { type: "string", description: "Comma-separated list of order IDs to retrieve" },
        },
      },
    },
    {
      name: "get_order",
      description: "Get a single order by ID with full detail.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Shopify order ID (numeric)" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_order",
      description: "Create a new order. Useful for draft orders, phone orders, or marketplace order ingestion.",
      inputSchema: {
        type: "object",
        properties: {
          order: {
            type: "object",
            description: "Shopify order object. Must include line_items (array of {variant_id, quantity} or {title, price, quantity}). Optional: customer, billing_address, shipping_address, email, financial_status, tags, note.",
          },
        },
        required: ["order"],
      },
    },
    {
      name: "update_order",
      description: "Update an existing order (tags, note, email, shipping_address, metafields, etc).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Shopify order ID" },
          order: { type: "object", description: "Partial order object with fields to update. The 'id' field is injected automatically." },
        },
        required: ["id", "order"],
      },
    },
    {
      name: "cancel_order",
      description: "Cancel an order. Optionally restock inventory, refund payment, notify customer.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Shopify order ID" },
          reason: { type: "string", enum: ["customer", "fraud", "inventory", "declined", "other"], description: "Cancellation reason" },
          email: { type: "boolean", description: "Send cancellation email to customer" },
          restock: { type: "boolean", description: "Restock the line items (deprecated in newer versions; use refund)" },
          refund: { type: "object", description: "Refund object to issue with the cancellation" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_products",
      description: "List products with optional filters. Each product includes variants, images, and options.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "archived", "draft"], description: "Filter by product status" },
          vendor: { type: "string", description: "Filter by vendor name" },
          product_type: { type: "string", description: "Filter by product_type" },
          collection_id: { type: "string", description: "Filter to products in a specific collection" },
          created_at_min: { type: "string", description: "ISO-8601 minimum created_at" },
          updated_at_min: { type: "string", description: "ISO-8601 minimum updated_at" },
          limit: { type: "number", description: "Max results per page (1-250, default 50)" },
          ids: { type: "string", description: "Comma-separated list of product IDs" },
        },
      },
    },
    {
      name: "get_product",
      description: "Get a single product by ID including all variants and images.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Shopify product ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_product",
      description: "Create a new product with variants, options, and images.",
      inputSchema: {
        type: "object",
        properties: {
          product: {
            type: "object",
            description: "Shopify product object. Required: title. Optional: body_html, vendor, product_type, tags, status, variants (array), options, images.",
          },
        },
        required: ["product"],
      },
    },
    {
      name: "update_product",
      description: "Update an existing product's fields, variants, or images.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Shopify product ID" },
          product: { type: "object", description: "Partial product object with fields to update. The 'id' field is injected automatically." },
        },
        required: ["id", "product"],
      },
    },
    {
      name: "list_customers",
      description: "List customers with optional query filter.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Full-text query (email, name, phone, tag, etc)" },
          created_at_min: { type: "string", description: "ISO-8601 minimum created_at" },
          updated_at_min: { type: "string", description: "ISO-8601 minimum updated_at" },
          limit: { type: "number", description: "Max results per page (1-250, default 50)" },
          ids: { type: "string", description: "Comma-separated list of customer IDs" },
        },
      },
    },
    {
      name: "create_customer",
      description: "Create a new customer record.",
      inputSchema: {
        type: "object",
        properties: {
          customer: {
            type: "object",
            description: "Shopify customer object. Typical: email, first_name, last_name, phone, addresses (array), tags, accepts_marketing.",
          },
        },
        required: ["customer"],
      },
    },
    {
      name: "adjust_inventory",
      description: "Adjust the available inventory for a specific inventory_item at a specific location by a delta (positive to increase, negative to decrease).",
      inputSchema: {
        type: "object",
        properties: {
          inventory_item_id: { type: "number", description: "Shopify inventory_item_id (numeric) — found on variant.inventory_item_id" },
          location_id: { type: "number", description: "Shopify location_id (numeric)" },
          available_adjustment: { type: "number", description: "Delta to apply to available quantity (e.g. -3 to decrement by 3, +10 to increment by 10)" },
        },
        required: ["inventory_item_id", "location_id", "available_adjustment"],
      },
    },
    {
      name: "create_fulfillment",
      description: "Create a fulfillment for an order (mark line items as shipped, attach tracking number and carrier).",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Shopify order ID to fulfill" },
          fulfillment: {
            type: "object",
            description: "Fulfillment object. Typical: location_id, tracking_number, tracking_company, tracking_urls (array), notify_customer (boolean), line_items (array).",
          },
        },
        required: ["order_id", "fulfillment"],
      },
    },
    {
      name: "update_fulfillment_tracking",
      description: "Update the tracking number, tracking company, or tracking URL on an existing fulfillment (post-ship tracking correction or late-binding tracking attach).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Shopify fulfillment ID" },
          tracking_info: {
            type: "object",
            description: "Tracking info object. Typical: number (string), company (string), url (string).",
          },
          notify_customer: { type: "boolean", description: "Email the customer about the tracking update. Defaults to false." },
        },
        required: ["id", "tracking_info"],
      },
    },
    {
      name: "create_draft_order",
      description: "Create a draft order (invoice-style quote). Can be completed later into a real order via complete_draft_order.",
      inputSchema: {
        type: "object",
        properties: {
          draft_order: {
            type: "object",
            description: "Shopify draft_order object. Typical: line_items (array of {variant_id, quantity} or {title, price, quantity}), customer, billing_address, shipping_address, email, note, tags, applied_discount, use_customer_default_address.",
          },
        },
        required: ["draft_order"],
      },
    },
    {
      name: "complete_draft_order",
      description: "Convert a draft order into a real order. Optionally mark as paid or send invoice.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Shopify draft_order ID" },
          payment_pending: { type: "boolean", description: "If true, the draft order is completed with payment pending (customer pays later). If false/omitted, it is marked paid." },
        },
        required: ["id"],
      },
    },
    {
      name: "create_price_rule",
      description: "Create a price rule (the policy that governs discounts — percentage/fixed amount, prerequisites, entitlements, usage caps). Pair with create_discount_code to mint a usable code.",
      inputSchema: {
        type: "object",
        properties: {
          price_rule: {
            type: "object",
            description: "Shopify price_rule object. Required: title, target_type ('line_item' | 'shipping_line'), target_selection ('all' | 'entitled'), allocation_method ('across' | 'each'), value_type ('percentage' | 'fixed_amount'), value (negative string, e.g. '-10.0'), customer_selection ('all' | 'prerequisite'), starts_at. Optional: ends_at, usage_limit, once_per_customer, prerequisite_subtotal_range, entitled_product_ids, entitled_collection_ids.",
          },
        },
        required: ["price_rule"],
      },
    },
    {
      name: "create_discount_code",
      description: "Create a discount code tied to an existing price rule (the customer-facing string like 'SUMMER20').",
      inputSchema: {
        type: "object",
        properties: {
          price_rule_id: { type: "string", description: "Parent price_rule ID" },
          discount_code: {
            type: "object",
            description: "Discount code object. Required: code (string, e.g. 'SUMMER20').",
          },
        },
        required: ["price_rule_id", "discount_code"],
      },
    },
    {
      name: "create_smart_collection",
      description: "Create a smart collection — an automated collection populated by rules (e.g. vendor, tag, product_type, price range).",
      inputSchema: {
        type: "object",
        properties: {
          smart_collection: {
            type: "object",
            description: "Shopify smart_collection object. Required: title, rules (array of {column, relation, condition}). Optional: body_html, sort_order, disjunctive (boolean — OR vs AND), published.",
          },
        },
        required: ["smart_collection"],
      },
    },
    {
      name: "create_custom_collection",
      description: "Create a custom collection — a manually curated collection. Products are attached separately via collects.",
      inputSchema: {
        type: "object",
        properties: {
          custom_collection: {
            type: "object",
            description: "Shopify custom_collection object. Required: title. Optional: body_html, sort_order, published, image, metafields, collects (array of {product_id}).",
          },
        },
        required: ["custom_collection"],
      },
    },
    {
      name: "create_metafield",
      description: "Attach a metafield (custom typed field) to a resource (shop, product, variant, customer, order, collection, draft_order, etc).",
      inputSchema: {
        type: "object",
        properties: {
          metafield: {
            type: "object",
            description: "Shopify metafield object. Required: namespace, key, value, type (e.g. 'single_line_text_field', 'number_integer', 'json', 'boolean'). Optional: owner_resource ('product' | 'variant' | 'customer' | 'order' | 'collection' | ...), owner_id, description. Omit owner_* to attach to shop.",
          },
        },
        required: ["metafield"],
      },
    },
    {
      name: "create_variant",
      description: "Add a new variant to an existing product (size/color/SKU permutation with its own price and inventory).",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Parent product ID" },
          variant: {
            type: "object",
            description: "Shopify variant object. Typical: option1, option2, option3, price, sku, barcode, inventory_management ('shopify' | null), inventory_policy ('deny' | 'continue'), inventory_quantity, weight, weight_unit, taxable, requires_shipping.",
          },
        },
        required: ["product_id", "variant"],
      },
    },
    {
      name: "update_variant",
      description: "Update an existing product variant's price, SKU, barcode, options, weight, or inventory policy.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Shopify variant ID" },
          variant: { type: "object", description: "Partial variant object with fields to update. The 'id' field is injected automatically." },
        },
        required: ["id", "variant"],
      },
    },
    {
      name: "list_transactions",
      description: "List all payment transactions for an order (authorizations, captures, sales, refunds, voids) including gateway and amount.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Shopify order ID" },
          since_id: { type: "string", description: "Return only transactions with IDs greater than this value" },
          in_shop_currency: { type: "boolean", description: "Show amounts in the shop's default currency rather than transaction currency" },
        },
        required: ["order_id"],
      },
    },
    {
      name: "list_abandoned_checkouts",
      description: "List abandoned checkouts (carts where the customer entered contact info but did not complete checkout). Useful for recovery campaigns.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["open", "closed"], description: "Checkout status. Defaults to 'open'." },
          created_at_min: { type: "string", description: "ISO-8601 minimum created_at" },
          created_at_max: { type: "string", description: "ISO-8601 maximum created_at" },
          updated_at_min: { type: "string", description: "ISO-8601 minimum updated_at" },
          limit: { type: "number", description: "Max results per page (1-250, default 50)" },
          since_id: { type: "string", description: "Return only checkouts with IDs greater than this value" },
        },
      },
    },
    {
      name: "list_locations",
      description: "List all fulfillment locations (physical stores, warehouses, 3PLs). Use the returned IDs with adjust_inventory and create_fulfillment.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "create_refund",
      description: "Refund one or more line items on an order. Can refund to original payment or as store credit, optionally restocking inventory.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Shopify order ID to refund" },
          refund: {
            type: "object",
            description: "Shopify refund object. Typical: currency, notify (boolean), note, shipping ({amount} or {full_refund: true}), refund_line_items (array of {line_item_id, quantity, restock_type: 'no_restock' | 'cancel' | 'return'}), transactions (array of {parent_id, amount, kind: 'refund', gateway}).",
          },
        },
        required: ["order_id", "refund"],
      },
    },
    {
      name: "register_webhook",
      description: "Register a webhook subscription for a Shopify event topic (orders/create, orders/paid, products/update, app/uninstalled, etc).",
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string", description: "Webhook topic (e.g. 'orders/create', 'orders/paid', 'products/update', 'customers/create', 'app/uninstalled')" },
          address: { type: "string", description: "HTTPS URL that will receive webhook POSTs" },
          format: { type: "string", enum: ["json", "xml"], description: "Payload format. Defaults to 'json'." },
          fields: { type: "array", items: { type: "string" }, description: "Optional list of fields to include in the payload" },
        },
        required: ["topic", "address"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = args as Record<string, unknown> | undefined;

  try {
    switch (name) {
      case "list_orders": {
        const qs = buildQuery(a);
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("GET", `/orders.json${qs}`), null, 2) }] };
      }
      case "get_order":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("GET", `/orders/${a?.id}.json`), null, 2) }] };
      case "create_order":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", "/orders.json", { order: a?.order }), null, 2) }] };
      case "update_order": {
        const order = { ...(a?.order as Record<string, unknown> ?? {}), id: a?.id };
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("PUT", `/orders/${a?.id}.json`, { order }), null, 2) }] };
      }
      case "cancel_order": {
        const body: Record<string, unknown> = {};
        if (a?.reason !== undefined) body.reason = a.reason;
        if (a?.email !== undefined) body.email = a.email;
        if (a?.restock !== undefined) body.restock = a.restock;
        if (a?.refund !== undefined) body.refund = a.refund;
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", `/orders/${a?.id}/cancel.json`, body), null, 2) }] };
      }
      case "list_products": {
        const qs = buildQuery(a);
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("GET", `/products.json${qs}`), null, 2) }] };
      }
      case "get_product":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("GET", `/products/${a?.id}.json`), null, 2) }] };
      case "create_product":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", "/products.json", { product: a?.product }), null, 2) }] };
      case "update_product": {
        const product = { ...(a?.product as Record<string, unknown> ?? {}), id: a?.id };
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("PUT", `/products/${a?.id}.json`, { product }), null, 2) }] };
      }
      case "list_customers": {
        const qs = buildQuery(a);
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("GET", `/customers.json${qs}`), null, 2) }] };
      }
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", "/customers.json", { customer: a?.customer }), null, 2) }] };
      case "adjust_inventory":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", "/inventory_levels/adjust.json", {
          inventory_item_id: a?.inventory_item_id,
          location_id: a?.location_id,
          available_adjustment: a?.available_adjustment,
        }), null, 2) }] };
      case "create_fulfillment":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", `/orders/${a?.order_id}/fulfillments.json`, { fulfillment: a?.fulfillment }), null, 2) }] };
      case "update_fulfillment_tracking": {
        const body: Record<string, unknown> = { fulfillment: { tracking_info: a?.tracking_info, notify_customer: a?.notify_customer ?? false } };
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", `/fulfillments/${a?.id}/update_tracking.json`, body), null, 2) }] };
      }
      case "create_draft_order":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", "/draft_orders.json", { draft_order: a?.draft_order }), null, 2) }] };
      case "complete_draft_order": {
        const qs = a?.payment_pending !== undefined ? `?payment_pending=${a.payment_pending}` : "";
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("PUT", `/draft_orders/${a?.id}/complete.json${qs}`), null, 2) }] };
      }
      case "create_price_rule":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", "/price_rules.json", { price_rule: a?.price_rule }), null, 2) }] };
      case "create_discount_code":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", `/price_rules/${a?.price_rule_id}/discount_codes.json`, { discount_code: a?.discount_code }), null, 2) }] };
      case "create_smart_collection":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", "/smart_collections.json", { smart_collection: a?.smart_collection }), null, 2) }] };
      case "create_custom_collection":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", "/custom_collections.json", { custom_collection: a?.custom_collection }), null, 2) }] };
      case "create_metafield":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", "/metafields.json", { metafield: a?.metafield }), null, 2) }] };
      case "create_variant":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", `/products/${a?.product_id}/variants.json`, { variant: a?.variant }), null, 2) }] };
      case "update_variant": {
        const variant = { ...(a?.variant as Record<string, unknown> ?? {}), id: a?.id };
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("PUT", `/variants/${a?.id}.json`, { variant }), null, 2) }] };
      }
      case "list_transactions": {
        const { order_id, ...rest } = (a ?? {}) as Record<string, unknown>;
        const qs = buildQuery(rest);
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("GET", `/orders/${order_id}/transactions.json${qs}`), null, 2) }] };
      }
      case "list_abandoned_checkouts": {
        const qs = buildQuery(a);
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("GET", `/checkouts.json${qs}`), null, 2) }] };
      }
      case "list_locations":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("GET", "/locations.json"), null, 2) }] };
      case "create_refund":
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", `/orders/${a?.order_id}/refunds.json`, { refund: a?.refund }), null, 2) }] };
      case "register_webhook": {
        const webhook: Record<string, unknown> = { topic: a?.topic, address: a?.address };
        if (a?.format !== undefined) webhook.format = a.format;
        if (a?.fields !== undefined) webhook.fields = a.fields;
        return { content: [{ type: "text", text: JSON.stringify(await shopifyRequest("POST", "/webhooks.json", { webhook }), null, 2) }] };
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
    app.get("/health", (_req: unknown, res: { json: (body: unknown) => unknown }) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: { headers: Record<string, string | string[] | undefined>; body: unknown }, res: { status: (code: number) => { json: (body: unknown) => unknown } }) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req as never, res as never, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-shopify", version: "0.2.0" }, { capabilities: { tools: {} } });
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
