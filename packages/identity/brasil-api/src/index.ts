#!/usr/bin/env node

/**
 * MCP Server for BrasilAPI — public Brazilian data APIs.
 *
 * Tools:
 * - get_cep: Look up address by CEP (postal code, v2 with multi-provider fallback)
 * - get_cep_v1: Look up address by CEP (v1, single-provider, faster)
 * - get_cnpj: Look up company by CNPJ
 * - get_banks: List all Brazilian banks
 * - get_holidays: List national holidays for a year
 * - get_fipe_brands: List vehicle brands by type
 * - get_fipe_vehicles: List vehicle models for a brand+type
 * - get_fipe_tables: List FIPE reference tables
 * - get_fipe_price: Get FIPE vehicle price by code
 * - get_ddd: Get cities for a DDD (area code)
 * - get_isbn: Look up book by ISBN
 * - get_ncm: Look up NCM code (tax classification)
 * - get_cptec_weather: Get weather forecast for a city
 * - get_cptec_cities: Search CPTEC cities by name
 * - get_cptec_airport_weather: Get METAR airport weather by ICAO code
 * - get_cptec_capitals_weather: Get current weather for all Brazilian capitals
 * - get_cptec_ocean_forecast: Get ocean/wave forecast for a coastal city
 * - get_pix_participants: List Pix participant institutions (PSPs)
 * - get_domain_info: Look up domain registration info (.br)
 * - get_ibge_municipalities: List municipalities for a state (IBGE)
 * - get_ibge_states: List all Brazilian states/UFs (IBGE)
 * - get_tax_rates: Get current Brazilian tax rates (Selic, CDI, IPCA)
 * - get_corretoras: List CVM-registered brokerages
 * - get_corretora: Look up a single CVM brokerage by CNPJ
 *
 * Environment: none (public API, no authentication)
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
const cnpjSchema = z.string().regex(/^\d{14}$/, "CNPJ must be 14 digits");

function validationError(msg: string) {
  return { content: [{ type: "text" as const, text: `Validation error: ${msg}` }], isError: true as const };
}

const BASE_URL = "https://brasilapi.com.br/api";

async function brasilApiRequest(path: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`BrasilAPI ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-brasil-api", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_cep",
      description: "Look up address by CEP (Brazilian postal code)",
      inputSchema: {
        type: "object",
        properties: {
          cep: { type: "string", description: "CEP (8 digits, e.g. 01001000)" },
        },
        required: ["cep"],
      },
    },
    {
      name: "get_cnpj",
      description: "Look up company information by CNPJ",
      inputSchema: {
        type: "object",
        properties: {
          cnpj: { type: "string", description: "CNPJ (14 digits)" },
        },
        required: ["cnpj"],
      },
    },
    {
      name: "get_banks",
      description: "List all Brazilian banks with codes and names",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_holidays",
      description: "List national holidays for a given year",
      inputSchema: {
        type: "object",
        properties: {
          year: { type: "number", description: "Year (e.g. 2025)" },
        },
        required: ["year"],
      },
    },
    {
      name: "get_fipe_brands",
      description: "List vehicle brands by type from FIPE table",
      inputSchema: {
        type: "object",
        properties: {
          vehicle_type: { type: "string", enum: ["carros", "motos", "caminhoes"], description: "Vehicle type" },
        },
        required: ["vehicle_type"],
      },
    },
    {
      name: "get_fipe_price",
      description: "Get vehicle price from FIPE table by code",
      inputSchema: {
        type: "object",
        properties: {
          fipe_code: { type: "string", description: "FIPE code (e.g. 001004-9)" },
        },
        required: ["fipe_code"],
      },
    },
    {
      name: "get_ddd",
      description: "Get state and cities for a DDD (area code)",
      inputSchema: {
        type: "object",
        properties: {
          ddd: { type: "string", description: "DDD code (e.g. 11 for São Paulo)" },
        },
        required: ["ddd"],
      },
    },
    {
      name: "get_isbn",
      description: "Look up book information by ISBN",
      inputSchema: {
        type: "object",
        properties: {
          isbn: { type: "string", description: "ISBN (10 or 13 digits)" },
        },
        required: ["isbn"],
      },
    },
    {
      name: "get_ncm",
      description: "Look up NCM tax classification code",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "NCM code (8 digits)" },
        },
        required: ["code"],
      },
    },
    {
      name: "get_cptec_weather",
      description: "Get weather forecast for a city (CPTEC/INPE)",
      inputSchema: {
        type: "object",
        properties: {
          city_code: { type: "number", description: "CPTEC city code" },
          days: { type: "number", description: "Number of forecast days (1-6, default 6)" },
        },
        required: ["city_code"],
      },
    },
    {
      name: "get_pix_participants",
      description: "List Pix participant institutions (PSPs/banks enrolled in Pix)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_domain_info",
      description: "Look up .br domain registration info",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "Domain name (e.g. example.com.br)" },
        },
        required: ["domain"],
      },
    },
    {
      name: "get_ibge_municipalities",
      description: "List all municipalities for a Brazilian state (IBGE data)",
      inputSchema: {
        type: "object",
        properties: {
          uf: { type: "string", description: "State abbreviation (e.g. SP, RJ, MG)" },
        },
        required: ["uf"],
      },
    },
    {
      name: "get_tax_rates",
      description: "Get current Brazilian tax/economic rates (Selic, CDI, IPCA)",
      inputSchema: {
        type: "object",
        properties: {
          acronym: { type: "string", enum: ["SELIC", "CDI", "IPCA"], description: "Tax rate acronym" },
        },
        required: ["acronym"],
      },
    },
    {
      name: "get_cptec_cities",
      description: "Search CPTEC/INPE cities by name for weather forecasts",
      inputSchema: {
        type: "object",
        properties: {
          cityName: { type: "string", description: "City name to search" },
        },
        required: ["cityName"],
      },
    },
    {
      name: "get_cep_v1",
      description: "Look up address by CEP using BrasilAPI v1 (single-provider, often faster than v2)",
      inputSchema: {
        type: "object",
        properties: {
          cep: { type: "string", description: "CEP (8 digits, e.g. 01001000)" },
        },
        required: ["cep"],
      },
    },
    {
      name: "get_fipe_vehicles",
      description: "List vehicle models for a given FIPE brand code and vehicle type",
      inputSchema: {
        type: "object",
        properties: {
          vehicle_type: { type: "string", enum: ["carros", "motos", "caminhoes"], description: "Vehicle type" },
          brand_code: { type: "string", description: "FIPE brand code (from get_fipe_brands)" },
        },
        required: ["vehicle_type", "brand_code"],
      },
    },
    {
      name: "get_fipe_tables",
      description: "List FIPE reference tables (months/years available for FIPE queries)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_cptec_airport_weather",
      description: "Get current airport weather (METAR) by ICAO code from CPTEC/INPE",
      inputSchema: {
        type: "object",
        properties: {
          icao: { type: "string", description: "Airport ICAO code (e.g. SBGR for Guarulhos)" },
        },
        required: ["icao"],
      },
    },
    {
      name: "get_cptec_capitals_weather",
      description: "Get current weather conditions for all Brazilian state capitals",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_cptec_ocean_forecast",
      description: "Get ocean/wave forecast for a coastal city (CPTEC/INPE)",
      inputSchema: {
        type: "object",
        properties: {
          city_code: { type: "number", description: "CPTEC city code (use get_cptec_cities to find)" },
          days: { type: "number", description: "Number of forecast days (1-6, optional)" },
        },
        required: ["city_code"],
      },
    },
    {
      name: "get_ibge_states",
      description: "List all Brazilian states/UFs with IBGE codes and metadata",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_corretoras",
      description: "List all CVM-registered Brazilian brokerages (corretoras)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_corretora",
      description: "Look up a single CVM-registered brokerage by CNPJ",
      inputSchema: {
        type: "object",
        properties: {
          cnpj: { type: "string", description: "Brokerage CNPJ (14 digits)" },
        },
        required: ["cnpj"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // --- Input validation ---
  try {
    if ((name === "get_cep" || name === "get_cep_v1") && args?.cep) {
      const r = cepSchema.safeParse(args.cep);
      if (!r.success) return validationError(r.error.issues[0].message);
    }
    if ((name === "get_cnpj" || name === "get_corretora") && args?.cnpj) {
      const r = cnpjSchema.safeParse(args.cnpj);
      if (!r.success) return validationError(r.error.issues[0].message);
    }
  } catch (e) {
    // Validation should not block — fall through on unexpected errors
  }

  try {
    switch (name) {
      case "get_cep":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/cep/v2/${args?.cep}`), null, 2) }] };
      case "get_cnpj":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/cnpj/v1/${args?.cnpj}`), null, 2) }] };
      case "get_banks":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest("/banks/v1"), null, 2) }] };
      case "get_holidays":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/feriados/v1/${args?.year}`), null, 2) }] };
      case "get_fipe_brands":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/fipe/marcas/v1/${args?.vehicle_type}`), null, 2) }] };
      case "get_fipe_price":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/fipe/preco/v1/${args?.fipe_code}`), null, 2) }] };
      case "get_ddd":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/ddd/v1/${args?.ddd}`), null, 2) }] };
      case "get_isbn":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/isbn/v1/${args?.isbn}`), null, 2) }] };
      case "get_ncm":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/ncm/v1/${args?.code}`), null, 2) }] };
      case "get_cptec_weather": {
        const days = args?.days || 6;
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/cptec/v1/clima/previsao/${args?.city_code}/${days}`), null, 2) }] };
      }
      case "get_pix_participants":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest("/pix/v1/participants"), null, 2) }] };
      case "get_domain_info":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/registrobr/v1/${args?.domain}`), null, 2) }] };
      case "get_ibge_municipalities":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/ibge/municipios/v1/${args?.uf}?providers=dados-abertos-br,gov,wikipedia`), null, 2) }] };
      case "get_tax_rates":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/taxas/v1/${args?.acronym}`), null, 2) }] };
      case "get_cptec_cities":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/cptec/v1/cidade/${encodeURIComponent(String(args?.cityName))}`), null, 2) }] };
      case "get_cep_v1":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/cep/v1/${args?.cep}`), null, 2) }] };
      case "get_fipe_vehicles":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/fipe/veiculos/v1/${args?.vehicle_type}/${args?.brand_code}`), null, 2) }] };
      case "get_fipe_tables":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest("/fipe/tabelas/v1"), null, 2) }] };
      case "get_cptec_airport_weather":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/cptec/v1/clima/aeroporto/${encodeURIComponent(String(args?.icao))}`), null, 2) }] };
      case "get_cptec_capitals_weather":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest("/cptec/v1/clima/capital"), null, 2) }] };
      case "get_cptec_ocean_forecast": {
        const path = args?.days
          ? `/cptec/v1/ondas/${args?.city_code}/${args?.days}`
          : `/cptec/v1/ondas/${args?.city_code}`;
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(path), null, 2) }] };
      }
      case "get_ibge_states":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest("/ibge/uf/v1"), null, 2) }] };
      case "get_corretoras":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest("/cvm/corretoras/v1"), null, 2) }] };
      case "get_corretora":
        return { content: [{ type: "text", text: JSON.stringify(await brasilApiRequest(`/cvm/corretoras/v1/${args?.cnpj}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-brasil-api", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
