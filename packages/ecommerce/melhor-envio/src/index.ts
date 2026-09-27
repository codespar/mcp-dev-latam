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
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// --- Zod validation helpers ---
const cepSchema = z.string().regex(/^\d{8}$/, "CEP must be 8 digits");
const emailSchema = z.string().email("Invalid email format");
const positiveNumberSchema = z.number().positive("Value must be greater than 0");

function validationError(msg: string) {
  return { content: [{ type: "text" as const, text: `Validation error: ${msg}` }], isError: true as const };
}

const DEMO_MODE = process.argv.includes("--demo") || process.env.MCP_DEMO === "true";

const DEMO_RESPONSES: Record<string, unknown> = {
  create_shipment: { id: "ship_demo_001", status: "posted", tracking: "ME123456789BR", service: "SEDEX", price: 25.90, delivery_estimate: "3-5 business days", from: { city: "São Paulo" }, to: { city: "Rio de Janeiro" } },
  calculate_shipping: { rates: [{ service: "SEDEX", price: 25.90, days: 3 }, { service: "PAC", price: 15.50, days: 7 }, { service: "Mini Envios", price: 12.00, days: 10 }] },
  track_shipment: { tracking: "ME123456789BR", status: "in_transit", events: [{ date: "2026-04-12T08:00:00Z", status: "Objeto postado", location: "São Paulo/SP" }, { date: "2026-04-12T14:00:00Z", status: "Em trânsito", location: "Curitiba/PR" }] },
  get_balance: { balance: 245.80, currency: "BRL" },
  get_shipment: { id: "ship_demo_001", status: "posted", tracking: "ME123456789BR", service: "SEDEX", price: 25.90 },
  list_shipments: { data: [{ id: "ship_demo_001", status: "posted", tracking: "ME123456789BR", service: "SEDEX", price: 25.90 }] },
  get_tracking_history: { tracking: "ME123456789BR", events: [{ date: "2026-04-12T08:00:00Z", status: "Objeto postado", location: "São Paulo/SP" }, { date: "2026-04-12T14:00:00Z", status: "Em trânsito", location: "Curitiba/PR" }] },
};

const TOKEN = process.env.MELHOR_ENVIO_TOKEN || "";
const BASE_URL = process.env.MELHOR_ENVIO_BASE_URL || (process.env.MELHOR_ENVIO_SANDBOX === "true"
  ? "https://sandbox.melhorenvio.com.br/api/v2"
  : "https://melhorenvio.com.br/api/v2");

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

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new Server(
  { name: "mcp-melhor-envio", version: "0.1.0" },
  { capabilities: { tools: {} }, instructions: MANAGED_TIER_HINT }
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
  const { name, arguments: rawArgs } = request.params;
  const args = rawArgs as Record<string, unknown> | undefined;

  if (DEMO_MODE) {
    return { content: [{ type: "text", text: JSON.stringify(DEMO_RESPONSES[name] || { demo: true, tool: name }, null, 2) }] };
  }

  // --- Input validation ---
  try {
    if (name === "calculate_shipping") {
      if ((args?.from as Record<string, unknown>)?.postal_code) {
        const r = cepSchema.safeParse((args!.from as Record<string, unknown>).postal_code);
        if (!r.success) return validationError(`Origin CEP: ${r.error.issues[0].message}`);
      }
      if ((args?.to as Record<string, unknown>)?.postal_code) {
        const r = cepSchema.safeParse((args!.to as Record<string, unknown>).postal_code);
        if (!r.success) return validationError(`Destination CEP: ${r.error.issues[0].message}`);
      }
    }
    if (name === "create_address") {
      if (args?.postal_code) {
        const r = cepSchema.safeParse(args.postal_code);
        if (!r.success) return validationError(r.error.issues[0].message);
      }
      if (args?.email) {
        const r = emailSchema.safeParse(args.email);
        if (!r.success) return validationError(r.error.issues[0].message);
      }
    }
    if (name === "list_services_available") {
      if (args?.from) {
        const r = cepSchema.safeParse(args.from);
        if (!r.success) return validationError(`Origin CEP: ${r.error.issues[0].message}`);
      }
      if (args?.to) {
        const r = cepSchema.safeParse(args.to);
        if (!r.success) return validationError(`Destination CEP: ${r.error.issues[0].message}`);
      }
    }
  } catch (e) {
    // Validation should not block — fall through on unexpected errors
  }

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
        const s = new Server({ name: "mcp-melhor-envio", version: "0.1.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
