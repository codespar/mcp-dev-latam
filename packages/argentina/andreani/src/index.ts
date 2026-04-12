#!/usr/bin/env node

/**
 * MCP Server for Andreani — largest Argentine courier/logistics provider.
 *
 * Tools:
 * - create_shipment: Create a new shipment
 * - get_shipment: Get shipment details by ID
 * - track_shipment: Track a shipment by tracking number
 * - get_rates: Get shipping rates/quotes
 * - list_branches: List Andreani branches/sucursales
 * - create_label: Generate a shipping label
 * - get_tracking_history: Get full tracking history
 * - cancel_shipment: Cancel a shipment
 *
 * Environment:
 *   ANDREANI_API_KEY  — API key
 *   ANDREANI_USER     — Username
 *   ANDREANI_PASSWORD — Password
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.ANDREANI_API_KEY || "";
const USER = process.env.ANDREANI_USER || "";
const PASSWORD = process.env.ANDREANI_PASSWORD || "";
const BASE_URL = "https://api.andreani.com/v2";

let cachedToken: string | null = null;

async function getToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const res = await fetch(`${BASE_URL}/login`, {
    method: "GET",
    headers: {
      "Authorization": `Basic ${Buffer.from(USER + ":" + PASSWORD).toString("base64")}`,
    },
  });
  if (!res.ok) throw new Error(`Andreani login failed: ${res.status}`);
  const token = res.headers.get("x-authorization-token") || "";
  cachedToken = token;
  return token;
}

async function andreaniRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "x-authorization-token": token,
  };
  if (API_KEY) headers["x-api-key"] = API_KEY;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Andreani API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-andreani", version: "0.1.0" },
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
          contract: { type: "string", description: "Contract/account number" },
          origin: {
            type: "object",
            description: "Origin address",
            properties: {
              postal_code: { type: "string", description: "Postal code" },
              street: { type: "string", description: "Street name" },
              number: { type: "string", description: "Street number" },
              city: { type: "string", description: "City" },
              province: { type: "string", description: "Province" },
            },
            required: ["postal_code"],
          },
          destination: {
            type: "object",
            description: "Destination address",
            properties: {
              postal_code: { type: "string", description: "Postal code" },
              street: { type: "string", description: "Street name" },
              number: { type: "string", description: "Street number" },
              city: { type: "string", description: "City" },
              province: { type: "string", description: "Province" },
              contact_name: { type: "string", description: "Recipient name" },
              contact_phone: { type: "string", description: "Recipient phone" },
            },
            required: ["postal_code", "contact_name"],
          },
          packages: {
            type: "array",
            description: "Packages to ship",
            items: {
              type: "object",
              properties: {
                weight: { type: "number", description: "Weight in grams" },
                height: { type: "number", description: "Height in cm" },
                width: { type: "number", description: "Width in cm" },
                length: { type: "number", description: "Length in cm" },
              },
              required: ["weight"],
            },
          },
        },
        required: ["contract", "destination", "packages"],
      },
    },
    {
      name: "get_shipment",
      description: "Get shipment details by ID",
      inputSchema: {
        type: "object",
        properties: { shipmentId: { type: "string", description: "Shipment ID (numero de envio)" } },
        required: ["shipmentId"],
      },
    },
    {
      name: "track_shipment",
      description: "Track a shipment by tracking number",
      inputSchema: {
        type: "object",
        properties: { trackingNumber: { type: "string", description: "Tracking number" } },
        required: ["trackingNumber"],
      },
    },
    {
      name: "get_rates",
      description: "Get shipping rates/quotes",
      inputSchema: {
        type: "object",
        properties: {
          contract: { type: "string", description: "Contract number" },
          origin_postal_code: { type: "string", description: "Origin postal code" },
          destination_postal_code: { type: "string", description: "Destination postal code" },
          weight: { type: "number", description: "Weight in grams" },
          volume: { type: "number", description: "Volume in cm3" },
          declared_value: { type: "number", description: "Declared value in ARS" },
        },
        required: ["contract", "origin_postal_code", "destination_postal_code", "weight"],
      },
    },
    {
      name: "list_branches",
      description: "List Andreani branches/sucursales",
      inputSchema: {
        type: "object",
        properties: {
          province: { type: "string", description: "Filter by province" },
          locality: { type: "string", description: "Filter by locality" },
        },
      },
    },
    {
      name: "create_label",
      description: "Generate a shipping label for a shipment",
      inputSchema: {
        type: "object",
        properties: { shipmentId: { type: "string", description: "Shipment ID" } },
        required: ["shipmentId"],
      },
    },
    {
      name: "get_tracking_history",
      description: "Get full tracking history for a shipment",
      inputSchema: {
        type: "object",
        properties: { shipmentId: { type: "string", description: "Shipment ID" } },
        required: ["shipmentId"],
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
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_shipment": {
        const payload = {
          contrato: args?.contract,
          origen: args?.origin,
          destino: args?.destination,
          bultos: args?.packages,
        };
        return { content: [{ type: "text", text: JSON.stringify(await andreaniRequest("POST", "/ordenes-de-envio", payload), null, 2) }] };
      }
      case "get_shipment":
        return { content: [{ type: "text", text: JSON.stringify(await andreaniRequest("GET", `/envios/${args?.shipmentId}`), null, 2) }] };
      case "track_shipment":
        return { content: [{ type: "text", text: JSON.stringify(await andreaniRequest("GET", `/envios/${args?.trackingNumber}/trazas`), null, 2) }] };
      case "get_rates": {
        const params = new URLSearchParams({
          contrato: args?.contract,
          cpOrigen: args?.origin_postal_code,
          cpDestino: args?.destination_postal_code,
          peso: String(args?.weight),
        });
        if (args?.volume) params.set("volumen", String(args.volume));
        if (args?.declared_value) params.set("valorDeclarado", String(args.declared_value));
        return { content: [{ type: "text", text: JSON.stringify(await andreaniRequest("GET", `/tarifas?${params}`), null, 2) }] };
      }
      case "list_branches": {
        const params = new URLSearchParams();
        if (args?.province) params.set("provincia", args.province);
        if (args?.locality) params.set("localidad", args.locality);
        return { content: [{ type: "text", text: JSON.stringify(await andreaniRequest("GET", `/sucursales?${params}`), null, 2) }] };
      }
      case "create_label":
        return { content: [{ type: "text", text: JSON.stringify(await andreaniRequest("GET", `/envios/${args?.shipmentId}/etiquetas`), null, 2) }] };
      case "get_tracking_history":
        return { content: [{ type: "text", text: JSON.stringify(await andreaniRequest("GET", `/envios/${args?.shipmentId}/trazas`), null, 2) }] };
      case "cancel_shipment":
        return { content: [{ type: "text", text: JSON.stringify(await andreaniRequest("DELETE", `/envios/${args?.shipmentId}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-andreani", version: "0.1.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
