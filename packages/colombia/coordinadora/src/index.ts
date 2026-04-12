#!/usr/bin/env node

/**
 * MCP Server for Coordinadora — major Colombian courier/logistics company.
 *
 * Tools:
 * - create_shipment: Create a new shipment
 * - get_shipment: Get shipment details
 * - track_shipment: Track a shipment
 * - get_rates: Get shipping rates/quotes
 * - list_cities: List available cities for shipping
 * - create_pickup: Schedule a pickup
 * - get_coverage: Check coverage for a location
 * - cancel_shipment: Cancel a shipment
 *
 * Environment:
 *   COORDINADORA_API_KEY — API key
 *   COORDINADORA_NIT     — Company NIT number
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.COORDINADORA_API_KEY || "";
const NIT = process.env.COORDINADORA_NIT || "";
const BASE_URL = "https://api.coordinadora.com/v1";

async function coordinadoraRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "x-api-key": API_KEY,
    "x-nit": NIT,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Coordinadora API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-coordinadora", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_shipment",
      description: "Create a new shipment",
      inputSchema: {
        type: "object",
        properties: {
          origin_city: { type: "string", description: "Origin city DANE code" },
          destination_city: { type: "string", description: "Destination city DANE code" },
          sender: {
            type: "object",
            description: "Sender information",
            properties: {
              name: { type: "string", description: "Sender name" },
              phone: { type: "string", description: "Sender phone" },
              address: { type: "string", description: "Sender address" },
              nit: { type: "string", description: "Sender NIT/CC" },
            },
            required: ["name", "phone", "address"],
          },
          recipient: {
            type: "object",
            description: "Recipient information",
            properties: {
              name: { type: "string", description: "Recipient name" },
              phone: { type: "string", description: "Recipient phone" },
              address: { type: "string", description: "Recipient address" },
              nit: { type: "string", description: "Recipient NIT/CC" },
            },
            required: ["name", "phone", "address"],
          },
          packages: {
            type: "array",
            description: "Packages to ship",
            items: {
              type: "object",
              properties: {
                weight: { type: "number", description: "Weight in kg" },
                height: { type: "number", description: "Height in cm" },
                width: { type: "number", description: "Width in cm" },
                length: { type: "number", description: "Length in cm" },
                declared_value: { type: "number", description: "Declared value in COP" },
                content: { type: "string", description: "Package content description" },
              },
              required: ["weight"],
            },
          },
          service_type: { type: "string", description: "Service type (standard, express, same_day)" },
          payment_type: { type: "string", description: "Payment type (prepaid, collect, contra_entrega)" },
        },
        required: ["origin_city", "destination_city", "sender", "recipient", "packages"],
      },
    },
    {
      name: "get_shipment",
      description: "Get shipment details by guide number",
      inputSchema: {
        type: "object",
        properties: { guideNumber: { type: "string", description: "Guide number (numero de guia)" } },
        required: ["guideNumber"],
      },
    },
    {
      name: "track_shipment",
      description: "Track a shipment by guide number",
      inputSchema: {
        type: "object",
        properties: { guideNumber: { type: "string", description: "Guide number" } },
        required: ["guideNumber"],
      },
    },
    {
      name: "get_rates",
      description: "Get shipping rates/quotes",
      inputSchema: {
        type: "object",
        properties: {
          origin_city: { type: "string", description: "Origin city DANE code" },
          destination_city: { type: "string", description: "Destination city DANE code" },
          weight: { type: "number", description: "Weight in kg" },
          height: { type: "number", description: "Height in cm" },
          width: { type: "number", description: "Width in cm" },
          length: { type: "number", description: "Length in cm" },
          declared_value: { type: "number", description: "Declared value in COP" },
        },
        required: ["origin_city", "destination_city", "weight"],
      },
    },
    {
      name: "list_cities",
      description: "List available cities for shipping",
      inputSchema: {
        type: "object",
        properties: {
          department: { type: "string", description: "Filter by department name" },
          search: { type: "string", description: "Search by city name" },
        },
      },
    },
    {
      name: "create_pickup",
      description: "Schedule a pickup at an address",
      inputSchema: {
        type: "object",
        properties: {
          address: { type: "string", description: "Pickup address" },
          city: { type: "string", description: "City DANE code" },
          contact_name: { type: "string", description: "Contact person name" },
          contact_phone: { type: "string", description: "Contact phone" },
          date: { type: "string", description: "Pickup date (YYYY-MM-DD)" },
          time_from: { type: "string", description: "Pickup window start (HH:MM)" },
          time_to: { type: "string", description: "Pickup window end (HH:MM)" },
          packages_count: { type: "number", description: "Number of packages" },
          total_weight: { type: "number", description: "Total weight in kg" },
        },
        required: ["address", "city", "contact_name", "contact_phone", "date"],
      },
    },
    {
      name: "get_coverage",
      description: "Check if a location is within coverage area",
      inputSchema: {
        type: "object",
        properties: {
          city: { type: "string", description: "City DANE code or name" },
          postal_code: { type: "string", description: "Postal code" },
        },
        required: ["city"],
      },
    },
    {
      name: "cancel_shipment",
      description: "Cancel a shipment",
      inputSchema: {
        type: "object",
        properties: {
          guideNumber: { type: "string", description: "Guide number" },
          reason: { type: "string", description: "Cancellation reason" },
        },
        required: ["guideNumber"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_shipment":
        return { content: [{ type: "text", text: JSON.stringify(await coordinadoraRequest("POST", "/guias", {
          ciudadOrigen: args?.origin_city,
          ciudadDestino: args?.destination_city,
          remitente: args?.sender,
          destinatario: args?.recipient,
          bultos: args?.packages,
          tipoServicio: args?.service_type,
          tipoPago: args?.payment_type,
        }), null, 2) }] };
      case "get_shipment":
        return { content: [{ type: "text", text: JSON.stringify(await coordinadoraRequest("GET", `/guias/${args?.guideNumber}`), null, 2) }] };
      case "track_shipment":
        return { content: [{ type: "text", text: JSON.stringify(await coordinadoraRequest("GET", `/guias/${args?.guideNumber}/tracking`), null, 2) }] };
      case "get_rates": {
        const payload: any = {
          ciudadOrigen: args?.origin_city,
          ciudadDestino: args?.destination_city,
          peso: args?.weight,
        };
        if (args?.height) payload.alto = args.height;
        if (args?.width) payload.ancho = args.width;
        if (args?.length) payload.largo = args.length;
        if (args?.declared_value) payload.valorDeclarado = args.declared_value;
        return { content: [{ type: "text", text: JSON.stringify(await coordinadoraRequest("POST", "/cotizaciones", payload), null, 2) }] };
      }
      case "list_cities": {
        const params = new URLSearchParams();
        if (args?.department) params.set("departamento", args.department);
        if (args?.search) params.set("buscar", args.search);
        return { content: [{ type: "text", text: JSON.stringify(await coordinadoraRequest("GET", `/ciudades?${params}`), null, 2) }] };
      }
      case "create_pickup":
        return { content: [{ type: "text", text: JSON.stringify(await coordinadoraRequest("POST", "/recolecciones", {
          direccion: args?.address,
          ciudad: args?.city,
          contactoNombre: args?.contact_name,
          contactoTelefono: args?.contact_phone,
          fecha: args?.date,
          horaDesde: args?.time_from,
          horaHasta: args?.time_to,
          cantidadBultos: args?.packages_count,
          pesoTotal: args?.total_weight,
        }), null, 2) }] };
      case "get_coverage": {
        const params = new URLSearchParams();
        params.set("ciudad", args?.city);
        if (args?.postal_code) params.set("codigoPostal", args.postal_code);
        return { content: [{ type: "text", text: JSON.stringify(await coordinadoraRequest("GET", `/cobertura?${params}`), null, 2) }] };
      }
      case "cancel_shipment": {
        const payload: any = {};
        if (args?.reason) payload.motivo = args.reason;
        return { content: [{ type: "text", text: JSON.stringify(await coordinadoraRequest("DELETE", `/guias/${args?.guideNumber}`, payload), null, 2) }] };
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
        const s = new Server({ name: "mcp-coordinadora", version: "0.1.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
