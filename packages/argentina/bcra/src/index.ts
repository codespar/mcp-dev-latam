#!/usr/bin/env node

/**
 * MCP Server for BCRA — Argentine Central Bank public data API.
 *
 * Tools:
 * - get_exchange_rates: Get official and blue dollar exchange rates
 * - get_uva_value: Get UVA (Unidad de Valor Adquisitivo) value
 * - get_monetary_base: Get monetary base data
 * - get_reserves: Get international reserves data
 * - get_interest_rates: Get reference interest rates
 * - get_inflation: Get inflation data (CPI)
 *
 * Environment:
 *   None (public API, no authentication required)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = "https://api.bcra.gob.ar";

async function bcraRequest(method: string, path: string): Promise<unknown> {
  const headers: Record<string, string> = {
    "Accept": "application/json",
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`BCRA API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-bcra", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_exchange_rates",
      description: "Get official exchange rates (USD, EUR, BRL, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date (YYYY-MM-DD), defaults to latest" },
          currency: { type: "string", description: "Currency code filter (USD, EUR, BRL)" },
        },
      },
    },
    {
      name: "get_uva_value",
      description: "Get UVA (Unidad de Valor Adquisitivo) value, used for inflation-adjusted mortgage calculations",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date (YYYY-MM-DD), defaults to latest" },
          date_from: { type: "string", description: "Start date for range query" },
          date_to: { type: "string", description: "End date for range query" },
        },
      },
    },
    {
      name: "get_monetary_base",
      description: "Get monetary base data (base monetaria)",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date (YYYY-MM-DD)" },
          date_from: { type: "string", description: "Start date for range query" },
          date_to: { type: "string", description: "End date for range query" },
        },
      },
    },
    {
      name: "get_reserves",
      description: "Get international reserves data (reservas internacionales)",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date (YYYY-MM-DD)" },
          date_from: { type: "string", description: "Start date for range query" },
          date_to: { type: "string", description: "End date for range query" },
        },
      },
    },
    {
      name: "get_interest_rates",
      description: "Get reference interest rates (tasas de interés de referencia)",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date (YYYY-MM-DD)" },
          date_from: { type: "string", description: "Start date for range query" },
          date_to: { type: "string", description: "End date for range query" },
        },
      },
    },
    {
      name: "get_inflation",
      description: "Get inflation data (CPI / IPC)",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date (YYYY-MM-DD)" },
          date_from: { type: "string", description: "Start date for range query" },
          date_to: { type: "string", description: "End date for range query" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_exchange_rates": {
        const params = new URLSearchParams();
        if (args?.date) params.set("fecha", args.date);
        if (args?.currency) params.set("moneda", args.currency);
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v2.0/DatosVariable/cotizaciones?${params}`), null, 2) }] };
      }
      case "get_uva_value": {
        const params = new URLSearchParams();
        if (args?.date) params.set("fecha", args.date);
        if (args?.date_from) params.set("fechaDesde", args.date_from);
        if (args?.date_to) params.set("fechaHasta", args.date_to);
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v2.0/DatosVariable/27/1?${params}`), null, 2) }] };
      }
      case "get_monetary_base": {
        const params = new URLSearchParams();
        if (args?.date) params.set("fecha", args.date);
        if (args?.date_from) params.set("fechaDesde", args.date_from);
        if (args?.date_to) params.set("fechaHasta", args.date_to);
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v2.0/DatosVariable/15/1?${params}`), null, 2) }] };
      }
      case "get_reserves": {
        const params = new URLSearchParams();
        if (args?.date) params.set("fecha", args.date);
        if (args?.date_from) params.set("fechaDesde", args.date_from);
        if (args?.date_to) params.set("fechaHasta", args.date_to);
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v2.0/DatosVariable/1/1?${params}`), null, 2) }] };
      }
      case "get_interest_rates": {
        const params = new URLSearchParams();
        if (args?.date) params.set("fecha", args.date);
        if (args?.date_from) params.set("fechaDesde", args.date_from);
        if (args?.date_to) params.set("fechaHasta", args.date_to);
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v2.0/DatosVariable/6/1?${params}`), null, 2) }] };
      }
      case "get_inflation": {
        const params = new URLSearchParams();
        if (args?.date) params.set("fecha", args.date);
        if (args?.date_from) params.set("fechaDesde", args.date_from);
        if (args?.date_to) params.set("fechaHasta", args.date_to);
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v2.0/DatosVariable/28/1?${params}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-bcra", version: "0.1.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
