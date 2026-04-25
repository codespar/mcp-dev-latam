#!/usr/bin/env node

/**
 * MCP Server for BCRA — Argentine Central Bank public data API.
 *
 * Tools (16):
 *  Exchange rates / cotizaciones:
 *  - get_exchange_rates: Official exchange rates snapshot
 *  - list_currencies: Master list of currencies (divisas)
 *  - get_official_rate: Quote for a single currency on a date
 *  - get_currency_history: Historical quotes for a currency in a date range
 *
 *  Variables monetarias (estadísticas):
 *  - list_variables: Catalog of monetary variables (id, descripción, categoría)
 *  - get_variable_history: History for any variable id with optional date range
 *  - get_uva_value: UVA (Unidad de Valor Adquisitivo)
 *  - get_monetary_base: Base monetaria
 *  - get_reserves: Reservas internacionales
 *  - get_interest_rates: Tasas de referencia
 *  - get_inflation: IPC nivel general
 *  - get_badlar_rate: Tasa BADLAR (bancos privados)
 *  - get_tm20_rate: Tasa TM20 (depósitos a plazo > 20M)
 *  - get_leliq_rate: Tasa de política monetaria (ex-LELIQ)
 *
 *  Cheques:
 *  - list_cheque_entities: Catálogo de entidades financieras (códigos)
 *  - validate_cheque: Verifica si un cheque está denunciado
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

function buildVariableQuery(args: any): string {
  const params = new URLSearchParams();
  if (args?.date) params.set("fecha", args.date);
  if (args?.date_from) params.set("fechaDesde", args.date_from);
  if (args?.date_to) params.set("fechaHasta", args.date_to);
  if (args?.limit) params.set("limit", String(args.limit));
  if (args?.offset) params.set("offset", String(args.offset));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

const server = new Server(
  { name: "mcp-bcra", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_exchange_rates",
      description: "Get official exchange rates snapshot for a date (USD, EUR, BRL, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date (YYYY-MM-DD), defaults to latest" },
          currency: { type: "string", description: "Currency code filter (USD, EUR, BRL)" },
        },
      },
    },
    {
      name: "list_currencies",
      description: "List the master catalog of currencies (divisas) tracked by BCRA",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_official_rate",
      description: "Get the official BCRA quote for a single currency on a specific date",
      inputSchema: {
        type: "object",
        properties: {
          currency: { type: "string", description: "ISO currency code (e.g. USD, EUR, BRL)" },
          date: { type: "string", description: "Date (YYYY-MM-DD), defaults to latest" },
        },
        required: ["currency"],
      },
    },
    {
      name: "get_currency_history",
      description: "Get historical quotes for a currency over a date range",
      inputSchema: {
        type: "object",
        properties: {
          currency: { type: "string", description: "ISO currency code (e.g. USD, EUR, BRL)" },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          limit: { type: "number", description: "Max rows (default 1000, max 1000)" },
          offset: { type: "number", description: "Offset for pagination" },
        },
        required: ["currency"],
      },
    },
    {
      name: "list_variables",
      description: "List the catalog of monetary variables (id, descripción, categoría) — use this to discover variable ids for get_variable_history",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_variable_history",
      description: "Get the historical series for any monetary variable by id, with optional date range. Use list_variables to discover ids.",
      inputSchema: {
        type: "object",
        properties: {
          variable_id: { type: "number", description: "Variable id from list_variables" },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          limit: { type: "number", description: "Max rows (default 1000, max 3000)" },
          offset: { type: "number", description: "Offset for pagination" },
        },
        required: ["variable_id"],
      },
    },
    {
      name: "get_uva_value",
      description: "Get UVA (Unidad de Valor Adquisitivo) — used for inflation-adjusted mortgage calculations",
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
      description: "Get inflation data (IPC nivel general — variación mensual)",
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
      name: "get_badlar_rate",
      description: "Get BADLAR rate (tasa de plazos fijos >1M ARS, bancos privados) — used as benchmark for many financial products",
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
      name: "get_tm20_rate",
      description: "Get TM20 rate (tasa de plazos fijos >20M ARS, bancos privados)",
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
      name: "get_leliq_rate",
      description: "Get monetary policy rate (ex-LELIQ / tasa de política monetaria)",
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
      name: "list_cheque_entities",
      description: "List the catalog of financial entities with their cheque codes — use the código to validate cheques",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "validate_cheque",
      description: "Check whether a cheque has been reported as stolen/lost (denunciado) by entity code and cheque number",
      inputSchema: {
        type: "object",
        properties: {
          entity_code: { type: "number", description: "Código de entidad (from list_cheque_entities)" },
          cheque_number: { type: "number", description: "Número de cheque" },
        },
        required: ["entity_code", "cheque_number"],
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
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticascambiarias/v1.0/Cotizaciones?${params}`), null, 2) }] };
      }
      case "list_currencies": {
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticascambiarias/v1.0/Maestros/Divisas`), null, 2) }] };
      }
      case "get_official_rate": {
        if (!args?.currency) throw new Error("currency is required");
        const params = new URLSearchParams();
        if (args?.date) params.set("fechaDesde", args.date);
        if (args?.date) params.set("fechaHasta", args.date);
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticascambiarias/v1.0/Cotizaciones/${encodeURIComponent(args.currency)}${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "get_currency_history": {
        if (!args?.currency) throw new Error("currency is required");
        const params = new URLSearchParams();
        if (args?.date_from) params.set("fechaDesde", args.date_from);
        if (args?.date_to) params.set("fechaHasta", args.date_to);
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticascambiarias/v1.0/Cotizaciones/${encodeURIComponent(args.currency)}${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "list_variables": {
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v3.0/Monetarias`), null, 2) }] };
      }
      case "get_variable_history": {
        if (args?.variable_id == null) throw new Error("variable_id is required");
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v3.0/Monetarias/${args.variable_id}${buildVariableQuery(args)}`), null, 2) }] };
      }
      case "get_uva_value": {
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v3.0/Monetarias/31${buildVariableQuery(args)}`), null, 2) }] };
      }
      case "get_monetary_base": {
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v3.0/Monetarias/15${buildVariableQuery(args)}`), null, 2) }] };
      }
      case "get_reserves": {
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v3.0/Monetarias/1${buildVariableQuery(args)}`), null, 2) }] };
      }
      case "get_interest_rates": {
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v3.0/Monetarias/6${buildVariableQuery(args)}`), null, 2) }] };
      }
      case "get_inflation": {
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v3.0/Monetarias/27${buildVariableQuery(args)}`), null, 2) }] };
      }
      case "get_badlar_rate": {
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v3.0/Monetarias/7${buildVariableQuery(args)}`), null, 2) }] };
      }
      case "get_tm20_rate": {
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v3.0/Monetarias/8${buildVariableQuery(args)}`), null, 2) }] };
      }
      case "get_leliq_rate": {
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/estadisticas/v3.0/Monetarias/34${buildVariableQuery(args)}`), null, 2) }] };
      }
      case "list_cheque_entities": {
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/cheques/v1.0/entidades`), null, 2) }] };
      }
      case "validate_cheque": {
        if (args?.entity_code == null) throw new Error("entity_code is required");
        if (args?.cheque_number == null) throw new Error("cheque_number is required");
        return { content: [{ type: "text", text: JSON.stringify(await bcraRequest("GET", `/cheques/v1.0/denunciados/${args.entity_code}/${args.cheque_number}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-bcra", version: "0.2.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
