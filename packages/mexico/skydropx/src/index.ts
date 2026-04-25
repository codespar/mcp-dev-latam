#!/usr/bin/env node

/**
 * MCP Server for Skydropx — Mexican multi-carrier shipping aggregator
 * (Estafeta, DHL, FedEx, Redpack).
 *
 * Tools:
 * - create_shipment: Create a shipment
 * - get_shipment: Get shipment by ID
 * - list_shipments: List shipments
 * - get_rates: Get shipping rates
 * - create_label: Create a shipping label
 * - track_shipment: Track a shipment
 * - list_carriers: List available carriers
 * - create_address: Create an address
 * - get_address: Get address by ID
 * - cancel_shipment: Cancel a shipment
 * - validate_address: Validate an address
 * - list_addresses: List saved addresses
 * - list_parcels: List saved parcel presets
 * - get_label: Get a label by ID
 * - list_labels: List labels
 * - create_pickup: Schedule a carrier pickup
 * - list_pickups: List pickups
 * - cancel_pickup: Cancel a pickup
 * - get_tracker: Get tracker by ID
 * - list_trackers: List trackers
 * - create_webhook: Register a webhook
 * - list_webhooks: List webhooks
 * - delete_webhook: Delete a webhook
 *
 * Environment:
 *   SKYDROPX_API_TOKEN — API token for authentication
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_TOKEN = process.env.SKYDROPX_API_TOKEN || "";
const BASE_URL = "https://api.skydropx.com/v1";

async function skyRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_TOKEN) headers["Authorization"] = `Token token=${API_TOKEN}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Skydropx API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-skydropx", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_shipment",
      description: "Create a shipment",
      inputSchema: {
        type: "object",
        properties: {
          address_from: { type: "string", description: "Origin address ID" },
          address_to: { type: "string", description: "Destination address ID" },
          parcels: {
            type: "array",
            description: "Parcel details",
            items: {
              type: "object",
              properties: {
                length: { type: "number", description: "Length in cm" },
                width: { type: "number", description: "Width in cm" },
                height: { type: "number", description: "Height in cm" },
                weight: { type: "number", description: "Weight in kg" },
              },
              required: ["length", "width", "height", "weight"],
            },
          },
        },
        required: ["address_from", "address_to", "parcels"],
      },
    },
    {
      name: "get_shipment",
      description: "Get shipment by ID",
      inputSchema: {
        type: "object",
        properties: { shipmentId: { type: "string", description: "Shipment ID" } },
        required: ["shipmentId"],
      },
    },
    {
      name: "list_shipments",
      description: "List shipments",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "get_rates",
      description: "Get shipping rates for a shipment",
      inputSchema: {
        type: "object",
        properties: {
          address_from: {
            type: "object",
            description: "Origin address",
            properties: {
              zip: { type: "string", description: "Postal code" },
              country: { type: "string", description: "Country code (MX)" },
            },
            required: ["zip"],
          },
          address_to: {
            type: "object",
            description: "Destination address",
            properties: {
              zip: { type: "string", description: "Postal code" },
              country: { type: "string", description: "Country code (MX)" },
            },
            required: ["zip"],
          },
          parcel: {
            type: "object",
            description: "Parcel dimensions",
            properties: {
              length: { type: "number", description: "Length in cm" },
              width: { type: "number", description: "Width in cm" },
              height: { type: "number", description: "Height in cm" },
              weight: { type: "number", description: "Weight in kg" },
            },
            required: ["length", "width", "height", "weight"],
          },
        },
        required: ["address_from", "address_to", "parcel"],
      },
    },
    {
      name: "create_label",
      description: "Create a shipping label for a shipment",
      inputSchema: {
        type: "object",
        properties: {
          shipmentId: { type: "string", description: "Shipment ID" },
          rate_id: { type: "string", description: "Selected rate ID" },
          label_format: { type: "string", enum: ["pdf", "zpl"], description: "Label format (default pdf)" },
        },
        required: ["shipmentId", "rate_id"],
      },
    },
    {
      name: "track_shipment",
      description: "Track a shipment",
      inputSchema: {
        type: "object",
        properties: {
          tracking_number: { type: "string", description: "Tracking number" },
          carrier: { type: "string", description: "Carrier slug (e.g. estafeta, dhl, fedex)" },
        },
        required: ["tracking_number", "carrier"],
      },
    },
    {
      name: "list_carriers",
      description: "List available carriers",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_address",
      description: "Create an address",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Contact name" },
          company: { type: "string", description: "Company name" },
          street1: { type: "string", description: "Street address" },
          street2: { type: "string", description: "Street address line 2" },
          city: { type: "string", description: "City" },
          province: { type: "string", description: "State/province" },
          zip: { type: "string", description: "Postal code" },
          country: { type: "string", description: "Country code (MX)" },
          phone: { type: "string", description: "Phone number" },
          email: { type: "string", description: "Email address" },
        },
        required: ["name", "street1", "city", "province", "zip", "country"],
      },
    },
    {
      name: "get_address",
      description: "Get address by ID",
      inputSchema: {
        type: "object",
        properties: { addressId: { type: "string", description: "Address ID" } },
        required: ["addressId"],
      },
    },
    {
      name: "cancel_shipment",
      description: "Cancel a shipment",
      inputSchema: {
        type: "object",
        properties: { shipmentId: { type: "string", description: "Shipment ID" } },
        required: ["shipmentId"],
      },
    },
    {
      name: "validate_address",
      description: "Validate an address (zip, city, province, country)",
      inputSchema: {
        type: "object",
        properties: {
          street1: { type: "string", description: "Street address" },
          city: { type: "string", description: "City" },
          province: { type: "string", description: "State/province" },
          zip: { type: "string", description: "Postal code" },
          country: { type: "string", description: "Country code (MX)" },
        },
        required: ["zip", "country"],
      },
    },
    {
      name: "list_addresses",
      description: "List saved addresses",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "list_parcels",
      description: "List saved parcel presets",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "get_label",
      description: "Get a label by ID",
      inputSchema: {
        type: "object",
        properties: { labelId: { type: "string", description: "Label ID" } },
        required: ["labelId"],
      },
    },
    {
      name: "list_labels",
      description: "List labels",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "create_pickup",
      description: "Schedule a carrier pickup",
      inputSchema: {
        type: "object",
        properties: {
          carrier: { type: "string", description: "Carrier slug (e.g. estafeta, dhl, fedex)" },
          address_id: { type: "string", description: "Pickup address ID" },
          shipments: { type: "array", description: "Shipment IDs to include in pickup", items: { type: "string" } },
          pickup_date: { type: "string", description: "Pickup date (YYYY-MM-DD)" },
          ready_time: { type: "string", description: "Ready time (HH:MM)" },
          close_time: { type: "string", description: "Close time (HH:MM)" },
          instructions: { type: "string", description: "Special instructions" },
        },
        required: ["carrier", "address_id", "pickup_date"],
      },
    },
    {
      name: "list_pickups",
      description: "List scheduled pickups",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "cancel_pickup",
      description: "Cancel a scheduled pickup",
      inputSchema: {
        type: "object",
        properties: { pickupId: { type: "string", description: "Pickup ID" } },
        required: ["pickupId"],
      },
    },
    {
      name: "get_tracker",
      description: "Get tracker (events) by tracker ID",
      inputSchema: {
        type: "object",
        properties: { trackerId: { type: "string", description: "Tracker ID" } },
        required: ["trackerId"],
      },
    },
    {
      name: "list_trackers",
      description: "List trackers",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "create_webhook",
      description: "Register a webhook to receive shipment/tracker events",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Webhook URL" },
          events: { type: "array", description: "Event types to subscribe to", items: { type: "string" } },
        },
        required: ["url"],
      },
    },
    {
      name: "list_webhooks",
      description: "List registered webhooks",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "delete_webhook",
      description: "Delete a registered webhook",
      inputSchema: {
        type: "object",
        properties: { webhookId: { type: "string", description: "Webhook ID" } },
        required: ["webhookId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_shipment":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("POST", "/shipments", {
          address_from: args?.address_from,
          address_to: args?.address_to,
          parcels: args?.parcels,
        }), null, 2) }] };
      case "get_shipment":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("GET", `/shipments/${args?.shipmentId}`), null, 2) }] };
      case "list_shipments": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("GET", `/shipments?${params}`), null, 2) }] };
      }
      case "get_rates":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("POST", "/quotations", {
          address_from: args?.address_from,
          address_to: args?.address_to,
          parcel: args?.parcel,
        }), null, 2) }] };
      case "create_label": {
        const payload: any = { rate_id: args?.rate_id };
        if (args?.label_format) payload.label_format = args.label_format;
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("POST", `/shipments/${args?.shipmentId}/labels`, payload), null, 2) }] };
      }
      case "track_shipment":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("GET", `/tracking?tracking_number=${args?.tracking_number}&carrier=${args?.carrier}`), null, 2) }] };
      case "list_carriers":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("GET", "/carriers"), null, 2) }] };
      case "create_address":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("POST", "/addresses", {
          name: args?.name,
          company: args?.company,
          street1: args?.street1,
          street2: args?.street2,
          city: args?.city,
          province: args?.province,
          zip: args?.zip,
          country: args?.country,
          phone: args?.phone,
          email: args?.email,
        }), null, 2) }] };
      case "get_address":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("GET", `/addresses/${args?.addressId}`), null, 2) }] };
      case "cancel_shipment":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("DELETE", `/shipments/${args?.shipmentId}`), null, 2) }] };
      case "validate_address":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("POST", "/addresses/validate", {
          street1: args?.street1,
          city: args?.city,
          province: args?.province,
          zip: args?.zip,
          country: args?.country,
        }), null, 2) }] };
      case "list_addresses": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("GET", `/addresses?${params}`), null, 2) }] };
      }
      case "list_parcels": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("GET", `/parcels?${params}`), null, 2) }] };
      }
      case "get_label":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("GET", `/labels/${args?.labelId}`), null, 2) }] };
      case "list_labels": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("GET", `/labels?${params}`), null, 2) }] };
      }
      case "create_pickup":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("POST", "/pickups", {
          carrier: args?.carrier,
          address_id: args?.address_id,
          shipments: args?.shipments,
          pickup_date: args?.pickup_date,
          ready_time: args?.ready_time,
          close_time: args?.close_time,
          instructions: args?.instructions,
        }), null, 2) }] };
      case "list_pickups": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("GET", `/pickups?${params}`), null, 2) }] };
      }
      case "cancel_pickup":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("DELETE", `/pickups/${args?.pickupId}`), null, 2) }] };
      case "get_tracker":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("GET", `/trackers/${args?.trackerId}`), null, 2) }] };
      case "list_trackers": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("GET", `/trackers?${params}`), null, 2) }] };
      }
      case "create_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("POST", "/webhooks", {
          url: args?.url,
          events: args?.events,
        }), null, 2) }] };
      case "list_webhooks":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("GET", "/webhooks"), null, 2) }] };
      case "delete_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await skyRequest("DELETE", `/webhooks/${args?.webhookId}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-skydropx", version: "0.2.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
