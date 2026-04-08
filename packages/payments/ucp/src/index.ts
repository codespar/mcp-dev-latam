#!/usr/bin/env node

/**
 * MCP Server for Google UCP — Universal Commerce Protocol.
 *
 * UCP is Google's open standard for agentic commerce. It enables
 * AI agents to discover products, build carts, checkout, manage
 * orders, and track delivery — all programmatically, without
 * screen-scraping or bespoke merchant integrations.
 *
 * UCP works alongside AP2 (payments) and A2A (agent interop),
 * with MCP as the transport/tool layer.
 *
 * Discovery:
 * - search_products: Search merchant product catalog
 * - get_product: Get detailed product information
 * - check_availability: Check stock and delivery availability
 * - list_merchants: List available UCP-compatible merchants
 *
 * Cart:
 * - create_cart: Create a new shopping cart
 * - add_to_cart: Add item to cart
 * - remove_from_cart: Remove item from cart
 * - get_cart: Get cart contents and totals
 * - clear_cart: Clear all items from cart
 *
 * Checkout:
 * - get_delivery_options: Get shipping/delivery options
 * - initiate_checkout: Start checkout process
 * - apply_payment: Apply payment method to checkout
 * - confirm_order: Confirm and place the order
 *
 * Orders:
 * - get_order: Get order details and status
 * - list_orders: List orders with filters
 * - cancel_order: Cancel a pending order
 * - request_return: Request a return/refund
 * - track_shipment: Get shipment tracking details
 *
 * Identity:
 * - link_identity: Link buyer identity for personalization
 * - get_profile: Get buyer profile and preferences
 *
 * Environment:
 *   UCP_API_KEY      — API key for UCP platform
 *   UCP_MERCHANT_ID  — Default merchant ID
 *   UCP_SANDBOX      — Set to "true" for sandbox mode
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.UCP_API_KEY || "";
const MERCHANT_ID = process.env.UCP_MERCHANT_ID || "";
const SANDBOX = process.env.UCP_SANDBOX === "true";
const BASE_URL = SANDBOX
  ? "https://sandbox.commerce.googleapis.com/ucp/v1"
  : "https://commerce.googleapis.com/ucp/v1";

async function ucpRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
      "X-Merchant-Id": MERCHANT_ID,
      "UCP-Version": "2026-04-01",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`UCP API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-ucp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Discovery ──
    {
      name: "search_products",
      description: "Search merchant product catalog. Supports text query, category filters, price range, and sorting.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (e.g. 'wireless headphones')" },
          merchantId: { type: "string", description: "Merchant ID (uses default if omitted)" },
          category: { type: "string", description: "Category filter" },
          minPrice: { type: "number", description: "Minimum price" },
          maxPrice: { type: "number", description: "Maximum price" },
          currency: { type: "string", description: "Currency code (default: USD)" },
          sortBy: { type: "string", enum: ["relevance", "price_asc", "price_desc", "rating", "newest"], description: "Sort order" },
          pageSize: { type: "number", description: "Results per page" },
          pageToken: { type: "string", description: "Pagination token" },
        },
        required: ["query"],
      },
    },
    {
      name: "get_product",
      description: "Get detailed product information including pricing, variants, availability, and reviews",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", description: "Product ID" },
          merchantId: { type: "string", description: "Merchant ID" },
        },
        required: ["productId"],
      },
    },
    {
      name: "check_availability",
      description: "Check product stock and delivery availability for a specific location",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", description: "Product ID" },
          merchantId: { type: "string", description: "Merchant ID" },
          variantId: { type: "string", description: "Variant ID (size, color, etc.)" },
          quantity: { type: "number", description: "Requested quantity" },
          postalCode: { type: "string", description: "Delivery postal code" },
          country: { type: "string", description: "Delivery country code" },
        },
        required: ["productId"],
      },
    },
    {
      name: "list_merchants",
      description: "List UCP-compatible merchants with optional category and region filters",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Merchant category (e.g. 'electronics', 'fashion')" },
          region: { type: "string", description: "Region filter (e.g. 'BR', 'US')" },
          pageSize: { type: "number", description: "Results per page" },
        },
      },
    },

    // ── Cart ──
    {
      name: "create_cart",
      description: "Create a new shopping cart for a merchant",
      inputSchema: {
        type: "object",
        properties: {
          merchantId: { type: "string", description: "Merchant ID" },
          currency: { type: "string", description: "Cart currency (default: USD)" },
        },
      },
    },
    {
      name: "add_to_cart",
      description: "Add an item to the shopping cart",
      inputSchema: {
        type: "object",
        properties: {
          cartId: { type: "string", description: "Cart ID" },
          productId: { type: "string", description: "Product ID" },
          variantId: { type: "string", description: "Variant ID" },
          quantity: { type: "number", description: "Quantity to add (default: 1)" },
        },
        required: ["cartId", "productId"],
      },
    },
    {
      name: "remove_from_cart",
      description: "Remove an item from the shopping cart",
      inputSchema: {
        type: "object",
        properties: {
          cartId: { type: "string", description: "Cart ID" },
          itemId: { type: "string", description: "Cart item ID" },
        },
        required: ["cartId", "itemId"],
      },
    },
    {
      name: "get_cart",
      description: "Get cart contents, item totals, taxes, and shipping estimates",
      inputSchema: {
        type: "object",
        properties: {
          cartId: { type: "string", description: "Cart ID" },
        },
        required: ["cartId"],
      },
    },
    {
      name: "clear_cart",
      description: "Remove all items from the cart",
      inputSchema: {
        type: "object",
        properties: {
          cartId: { type: "string", description: "Cart ID" },
        },
        required: ["cartId"],
      },
    },

    // ── Checkout ──
    {
      name: "get_delivery_options",
      description: "Get available shipping and delivery options for a cart",
      inputSchema: {
        type: "object",
        properties: {
          cartId: { type: "string", description: "Cart ID" },
          address: {
            type: "object",
            properties: {
              line1: { type: "string" },
              city: { type: "string" },
              state: { type: "string" },
              postalCode: { type: "string" },
              country: { type: "string" },
            },
            required: ["line1", "city", "country", "postalCode"],
            description: "Delivery address",
          },
        },
        required: ["cartId", "address"],
      },
    },
    {
      name: "initiate_checkout",
      description: "Start the checkout process for a cart. Returns a checkout session with payment options.",
      inputSchema: {
        type: "object",
        properties: {
          cartId: { type: "string", description: "Cart ID" },
          deliveryOptionId: { type: "string", description: "Selected delivery option ID" },
          buyerEmail: { type: "string", description: "Buyer email" },
          buyerName: { type: "string", description: "Buyer name" },
        },
        required: ["cartId"],
      },
    },
    {
      name: "apply_payment",
      description: "Apply a payment method to the checkout session. Supports card, AP2 token, or x402.",
      inputSchema: {
        type: "object",
        properties: {
          checkoutId: { type: "string", description: "Checkout session ID" },
          paymentMethod: { type: "string", enum: ["card", "ap2", "x402", "pix", "wallet"], description: "Payment method type" },
          paymentToken: { type: "string", description: "Payment token or AP2 authorization ID" },
        },
        required: ["checkoutId", "paymentMethod"],
      },
    },
    {
      name: "confirm_order",
      description: "Confirm and place the order. Payment is captured and order is sent to merchant.",
      inputSchema: {
        type: "object",
        properties: {
          checkoutId: { type: "string", description: "Checkout session ID" },
        },
        required: ["checkoutId"],
      },
    },

    // ── Orders ──
    {
      name: "get_order",
      description: "Get order details including items, status, payment, and shipping info",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order ID" },
        },
        required: ["orderId"],
      },
    },
    {
      name: "list_orders",
      description: "List orders with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "confirmed", "shipped", "delivered", "canceled", "returned"], description: "Filter by status" },
          merchantId: { type: "string", description: "Filter by merchant" },
          from: { type: "string", description: "Start date (ISO 8601)" },
          to: { type: "string", description: "End date (ISO 8601)" },
          pageSize: { type: "number", description: "Results per page" },
          pageToken: { type: "string", description: "Pagination token" },
        },
      },
    },
    {
      name: "cancel_order",
      description: "Cancel a pending or confirmed order",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order ID" },
          reason: { type: "string", description: "Cancellation reason" },
        },
        required: ["orderId"],
      },
    },
    {
      name: "request_return",
      description: "Request a return or refund for a delivered order",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order ID" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                itemId: { type: "string" },
                quantity: { type: "number" },
                reason: { type: "string" },
              },
              required: ["itemId"],
            },
            description: "Items to return",
          },
        },
        required: ["orderId", "items"],
      },
    },
    {
      name: "track_shipment",
      description: "Get real-time shipment tracking details for an order",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order ID" },
        },
        required: ["orderId"],
      },
    },

    // ── Identity ──
    {
      name: "link_identity",
      description: "Link buyer identity for personalization and order history across merchants",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Buyer email" },
          name: { type: "string", description: "Buyer name" },
          phone: { type: "string", description: "Phone number" },
          merchantId: { type: "string", description: "Merchant to link with" },
        },
        required: ["email"],
      },
    },
    {
      name: "get_profile",
      description: "Get buyer profile, preferences, and linked merchants",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Buyer email" },
        },
        required: ["email"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── Discovery ──
      case "search_products": {
        const params = new URLSearchParams();
        params.set("q", String(args?.query || ""));
        if (args?.category) params.set("category", String(args.category));
        if (args?.minPrice) params.set("minPrice", String(args.minPrice));
        if (args?.maxPrice) params.set("maxPrice", String(args.maxPrice));
        if (args?.currency) params.set("currency", String(args.currency));
        if (args?.sortBy) params.set("sortBy", String(args.sortBy));
        if (args?.pageSize) params.set("pageSize", String(args.pageSize));
        if (args?.pageToken) params.set("pageToken", String(args.pageToken));
        const merchant = args?.merchantId || MERCHANT_ID;
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("GET", `/merchants/${merchant}/products?${params}`), null, 2) }] };
      }

      case "get_product":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("GET", `/merchants/${args?.merchantId || MERCHANT_ID}/products/${args?.productId}`), null, 2) }] };

      case "check_availability": {
        const params = new URLSearchParams();
        if (args?.variantId) params.set("variantId", String(args.variantId));
        if (args?.quantity) params.set("quantity", String(args.quantity));
        if (args?.postalCode) params.set("postalCode", String(args.postalCode));
        if (args?.country) params.set("country", String(args.country));
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("GET", `/merchants/${args?.merchantId || MERCHANT_ID}/products/${args?.productId}/availability?${params}`), null, 2) }] };
      }

      case "list_merchants": {
        const params = new URLSearchParams();
        if (args?.category) params.set("category", String(args.category));
        if (args?.region) params.set("region", String(args.region));
        if (args?.pageSize) params.set("pageSize", String(args.pageSize));
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("GET", `/merchants?${params}`), null, 2) }] };
      }

      // ── Cart ──
      case "create_cart":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("POST", `/merchants/${args?.merchantId || MERCHANT_ID}/carts`, { currency: args?.currency || "USD" }), null, 2) }] };

      case "add_to_cart":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("POST", `/carts/${args?.cartId}/items`, { productId: args?.productId, variantId: args?.variantId, quantity: args?.quantity || 1 }), null, 2) }] };

      case "remove_from_cart":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("DELETE", `/carts/${args?.cartId}/items/${args?.itemId}`), null, 2) }] };

      case "get_cart":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("GET", `/carts/${args?.cartId}`), null, 2) }] };

      case "clear_cart":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("DELETE", `/carts/${args?.cartId}/items`), null, 2) }] };

      // ── Checkout ──
      case "get_delivery_options":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("POST", `/carts/${args?.cartId}/delivery-options`, { address: args?.address }), null, 2) }] };

      case "initiate_checkout":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("POST", "/checkouts", { cartId: args?.cartId, deliveryOptionId: args?.deliveryOptionId, buyer: { email: args?.buyerEmail, name: args?.buyerName } }), null, 2) }] };

      case "apply_payment":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("POST", `/checkouts/${args?.checkoutId}/payment`, { method: args?.paymentMethod, token: args?.paymentToken }), null, 2) }] };

      case "confirm_order":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("POST", `/checkouts/${args?.checkoutId}/confirm`), null, 2) }] };

      // ── Orders ──
      case "get_order":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("GET", `/orders/${args?.orderId}`), null, 2) }] };

      case "list_orders": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.merchantId) params.set("merchantId", String(args.merchantId));
        if (args?.from) params.set("from", String(args.from));
        if (args?.to) params.set("to", String(args.to));
        if (args?.pageSize) params.set("pageSize", String(args.pageSize));
        if (args?.pageToken) params.set("pageToken", String(args.pageToken));
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("GET", `/orders?${params}`), null, 2) }] };
      }

      case "cancel_order":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("POST", `/orders/${args?.orderId}/cancel`, { reason: args?.reason }), null, 2) }] };

      case "request_return":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("POST", `/orders/${args?.orderId}/returns`, { items: args?.items }), null, 2) }] };

      case "track_shipment":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("GET", `/orders/${args?.orderId}/shipment`), null, 2) }] };

      // ── Identity ──
      case "link_identity":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("POST", "/identity/link", { email: args?.email, name: args?.name, phone: args?.phone, merchantId: args?.merchantId }), null, 2) }] };

      case "get_profile":
        return { content: [{ type: "text", text: JSON.stringify(await ucpRequest("GET", `/identity/profile?email=${encodeURIComponent(String(args?.email))}`), null, 2) }] };

      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!API_KEY) {
    console.error("UCP_API_KEY environment variable is required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
