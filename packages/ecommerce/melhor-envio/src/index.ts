#!/usr/bin/env node

/**
 * MCP Server for Melhor Envio — Brazilian shipping aggregator.
 *
 * Tools:
 * - calculate_shipping: Calculate shipping rates from multiple carriers
 * - create_shipment: Create a shipment order
 * - track_shipment: Track a shipment by ID
 * - generate_label: Generate shipping label
 * - list_agencies: List carrier pickup agencies
 * - cancel_shipment: Cancel a shipment
 * - get_balance: Get account balance
 * - add_cart: Add shipment to cart for batch processing
 * - checkout_cart: Checkout all items in the cart and pay
 * - preview_label: Preview a shipping label before generating
 * - print_label: Print/download label PDF
 * - get_shipment: Get shipment order details
 * - list_shipments: List all shipment orders with filters
 * - get_store: Get store/company info
 * - search_agencies: Search pickup agencies by service and location
 * - create_address: Create a stored address for sender/recipient
 * - list_services_available: List available shipping services for a route
 * - get_tracking_history: Get complete tracking history with events
 *
 * Environment:
 *   MELHOR_ENVIO_TOKEN — Bearer token from https://melhorenvio.com.br/
 *   MELHOR_ENVIO_SANDBOX — "true" to use sandbox (default: false)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const TOKEN = process.env.MELHOR_ENVIO_TOKEN || "";
const BASE_URL = process.env.MELHOR_ENVIO_SANDBOX === "true"
  ? "https://sandbox.melhorenvio.com.br/api/v2"
  : "https://melhorenvio.com.br/api/v2";

async function melhorEnvioRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Bearer ${TOKEN}`,
      "User-Agent": "mcp-melhor-envio/0.1.0",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Melhor Envio API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-melhor-envio", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "calculate_shipping",
      description: "Calculate shipping rates from multiple carriers",
      inputSchema: {
        type: "object",
        properties: {
          from: {
            type: "object",
            properties: { postal_code: { type: "string", description: "Origin CEP" } },
            required: ["postal_code"],
          },
          to: {
            type: "object",
            properties: { postal_code: { type: "string", description: "Destination CEP" } },
            required: ["postal_code"],
          },
          products: {
            type: "array",
            description: "Products to ship",
            items: {
              type: "object",
              properties: {
                width: { type: "number", description: "Width in cm" },
                height: { type: "number", description: "Height in cm" },
                length: { type: "number", description: "Length in cm" },
                weight: { type: "number", description: "Weight in kg" },
                quantity: { type: "number", description: "Quantity" },
                insurance_value: { type: "number", description: "Declared value for insurance" },
              },
              required: ["width", "height", "length", "weight", "quantity"],
            },
          },
        },
        required: ["from", "to", "products"],
      },
    },
    {
      name: "create_shipment",
      description: "Create a shipment order",
      inputSchema: {
        type: "object",
        properties: {
          service: { type: "number", description: "Service ID from calculate_shipping" },
          from: { type: "object", description: "Sender info (name, phone, email, address, city, state, postal_code, document)" },
          to: { type: "object", description: "Recipient info (name, phone, email, address, city, state, postal_code, document)" },
          products: { type: "array", description: "Products array (same as calculate_shipping)" },
          options: { type: "object", description: "Options (insurance_value, receipt, own_hand, etc.)" },
        },
        required: ["service", "from", "to", "products"],
      },
    },
    {
      name: "track_shipment",
      description: "Track a shipment by order ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Shipment order ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "generate_label",
      description: "Generate shipping label for an order",
      inputSchema: {
        type: "object",
        properties: {
          orders: {
            type: "array",
            items: { type: "string" },
            description: "Array of order IDs to generate labels",
          },
        },
        required: ["orders"],
      },
    },
    {
      name: "list_agencies",
      description: "List carrier pickup agencies near a location",
      inputSchema: {
        type: "object",
        properties: {
          company: { type: "number", description: "Carrier company ID" },
          state: { type: "string", description: "State abbreviation (e.g. SP)" },
          city: { type: "string", description: "City name" },
        },
      },
    },
    {
      name: "cancel_shipment",
      description: "Cancel a shipment order",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Order ID to cancel" },
          reason_id: { type: "number", description: "Cancellation reason ID" },
          description: { type: "string", description: "Cancellation description" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_balance",
      description: "Get current account balance",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "add_cart",
      description: "Add shipment orders to cart for batch checkout",
      inputSchema: {
        type: "object",
        properties: {
          orders: {
            type: "array",
            items: { type: "string" },
            description: "Array of order IDs to add to cart",
          },
        },
        required: ["orders"],
      },
    },
    {
      name: "checkout_cart",
      description: "Checkout all items in the cart and pay",
      inputSchema: {
        type: "object",
        properties: {
          orders: {
            type: "array",
            items: { type: "string" },
            description: "Array of order IDs to checkout",
          },
        },
        required: ["orders"],
      },
    },
    {
      name: "preview_label",
      description: "Preview a shipping label before generating",
      inputSchema: {
        type: "object",
        properties: {
          orders: {
            type: "array",
            items: { type: "string" },
            description: "Array of order IDs to preview",
          },
        },
        required: ["orders"],
      },
    },
    {
      name: "print_label",
      description: "Print/download label PDF",
      inputSchema: {
        type: "object",
        properties: {
          orders: {
            type: "array",
            items: { type: "string" },
            description: "Array of order IDs to print labels",
          },
        },
        required: ["orders"],
      },
    },
    {
      name: "get_shipment",
      description: "Get shipment order details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Shipment order ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_shipments",
      description: "List all shipment orders with filters",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "released", "posted", "delivered", "canceled"], description: "Filter by status" },
          limit: { type: "number", description: "Number of results" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "get_store",
      description: "Get store/company information",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "search_agencies",
      description: "Search pickup agencies by service and location",
      inputSchema: {
        type: "object",
        properties: {
          service: { type: "number", description: "Service ID" },
          state: { type: "string", description: "State abbreviation (e.g. SP)" },
          city: { type: "string", description: "City name" },
        },
      },
    },
    {
      name: "create_address",
      description: "Create a stored address for sender/recipient",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Address label/name" },
          phone: { type: "string", description: "Phone number" },
          email: { type: "string", description: "Email address" },
          address: { type: "string", description: "Street address" },
          complement: { type: "string", description: "Complement" },
          number: { type: "string", description: "Street number" },
          district: { type: "string", description: "Neighborhood/district" },
          city: { type: "string", description: "City" },
          state_abbr: { type: "string", description: "State abbreviation (UF)" },
          postal_code: { type: "string", description: "CEP" },
          country_id: { type: "string", description: "Country ID (BR)" },
        },
        required: ["name", "address", "number", "district", "city", "state_abbr", "postal_code"],
      },
    },
    {
      name: "list_services_available",
      description: "List available shipping services for a route",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Origin postal code (CEP)" },
          to: { type: "string", description: "Destination postal code (CEP)" },
        },
      },
    },
    {
      name: "get_tracking_history",
      description: "Get complete tracking history with events",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Shipment order ID" },
        },
        required: ["id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "calculate_shipping":
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("POST", "/me/shipment/calculate", args), null, 2) }] };
      case "create_shipment":
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("POST", "/me/cart", args), null, 2) }] };
      case "track_shipment":
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("POST", "/me/shipment/tracking", { orders: [args?.id] }), null, 2) }] };
      case "generate_label":
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("POST", "/me/shipment/generate", { orders: args?.orders }), null, 2) }] };
      case "list_agencies": {
        const params = new URLSearchParams();
        if (args?.company) params.set("company", String(args.company));
        if (args?.state) params.set("state", String(args.state));
        if (args?.city) params.set("city", String(args.city));
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("GET", `/me/shipment/agencies?${params}`), null, 2) }] };
      }
      case "cancel_shipment":
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("POST", `/me/shipment/cancel`, { order: { id: args?.id, reason_id: args?.reason_id, description: args?.description } }), null, 2) }] };
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("GET", "/me/balance"), null, 2) }] };
      case "add_cart":
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("POST", "/me/shipment/checkout", { orders: args?.orders }), null, 2) }] };
      case "checkout_cart":
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("POST", "/me/shipment/checkout", { orders: args?.orders }), null, 2) }] };
      case "preview_label":
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("POST", "/me/shipment/preview", { orders: args?.orders }), null, 2) }] };
      case "print_label":
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("POST", "/me/shipment/print", { orders: args?.orders }), null, 2) }] };
      case "get_shipment":
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("GET", `/me/orders/${args?.id}`), null, 2) }] };
      case "list_shipments": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("GET", `/me/orders?${params}`), null, 2) }] };
      }
      case "get_store":
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("GET", "/me/companies"), null, 2) }] };
      case "search_agencies": {
        const params = new URLSearchParams();
        if (args?.service) params.set("service", String(args.service));
        if (args?.state) params.set("state", String(args.state));
        if (args?.city) params.set("city", String(args.city));
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("GET", `/me/shipment/agencies?${params}`), null, 2) }] };
      }
      case "create_address":
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("POST", "/me/addresses", args), null, 2) }] };
      case "list_services_available": {
        const params = new URLSearchParams();
        if (args?.from) params.set("from", String(args.from));
        if (args?.to) params.set("to", String(args.to));
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("GET", `/me/shipment/services?${params}`), null, 2) }] };
      }
      case "get_tracking_history":
        return { content: [{ type: "text", text: JSON.stringify(await melhorEnvioRequest("GET", `/me/tracking/${args?.id}`), null, 2) }] };
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!TOKEN) {
    console.error("MELHOR_ENVIO_TOKEN environment variable is required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
