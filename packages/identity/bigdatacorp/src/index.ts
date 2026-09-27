#!/usr/bin/env node

/**
 * MCP Server for BigDataCorp — Brazilian data enrichment + KYC.
 *
 * Look up a person by CPF and get name, DOB, address, employment, score,
 * sanctions, social signals. Same for companies via CNPJ. Standard rail in
 * BR e-commerce + lending agents for KYC, AML, fraud scoring.
 *
 * Auth: PAIRED headers (not Bearer) — BigDataCorp's platform issues two
 * credentials that travel together on every call:
 *   AccessToken: <access_token>
 *   TokenId:     <token_id>
 *
 * Env:
 *   BIGDATACORP_ACCESS_TOKEN — required (AccessToken header)
 *   BIGDATACORP_TOKEN_ID     — required (TokenId header)
 *   BIGDATACORP_API_BASE     — optional override (default https://plataforma.bigdatacorp.com.br)
 *
 * Endpoint paths follow the BigDataCorp platform's `/v1/datasets/*` shape.
 * Many tools share the persons endpoint with different `Datasets` filters —
 * see the catalog at codespar-enterprise/packages/api/src/catalog/bigdatacorp.json.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const ACCESS_TOKEN = process.env.BIGDATACORP_ACCESS_TOKEN;
const TOKEN_ID = process.env.BIGDATACORP_TOKEN_ID;
const BASE_URL = process.env.BIGDATACORP_BASE_URL || process.env.BIGDATACORP_API_BASE || "https://plataforma.bigdatacorp.com.br";

if (!ACCESS_TOKEN) {
  console.error("[mcp-bigdatacorp] missing BIGDATACORP_ACCESS_TOKEN — refusing to start.");
  process.exit(1);
}
if (!TOKEN_ID) {
  console.error("[mcp-bigdatacorp] missing BIGDATACORP_TOKEN_ID — refusing to start.");
  process.exit(1);
}

interface BdcResult {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
}

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    AccessToken: ACCESS_TOKEN!,
    TokenId: TOKEN_ID!,
  };
}

async function bdcRequest(
  method: string,
  path: string,
  options: { query?: Record<string, unknown>; body?: unknown } = {},
): Promise<BdcResult> {
  const url = new URL(`${BASE_URL}${path}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : undefined;

  const res = await fetch(url.toString(), {
    method,
    headers: authHeaders(),
    body: bodyStr,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: typeof data === "string" ? data : JSON.stringify(data),
    };
  }
  return { ok: true, status: res.status, data };
}

function ok(result: BdcResult) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new McpServer({
  name: "bigdatacorp",
  version: "0.1.0",
}, { instructions: MANAGED_TIER_HINT });

// ---------- persons / companies ----------

server.tool(
  "persons_lookup",
  "CPF lookup — name, DOB, mother's name, address history, contacts, deceased flag. POST /v1/datasets/persons.",
  {
    Datasets: z
      .string()
      .describe("Comma-separated dataset list (e.g. 'basic_data,registration_data,addresses')"),
    q: z.string().describe("Query string — typically 'doc{CPF}'"),
  },
  async (args) => ok(await bdcRequest("POST", "/v1/datasets/persons", { body: args })),
);

server.tool(
  "companies_lookup",
  "CNPJ lookup — razão social, fantasia, founding date, paid-in capital, partners, address, CNAE. POST /v1/datasets/companies.",
  {
    Datasets: z
      .string()
      .describe("e.g. 'basic_data,registration_data,economic_group,addresses'"),
    q: z.string().describe("Query string — typically 'doc{CNPJ}'"),
  },
  async (args) => ok(await bdcRequest("POST", "/v1/datasets/companies", { body: args })),
);

server.tool(
  "vehicles_lookup",
  "Vehicle lookup by plate / chassis / RENAVAM — make, model, year, color, fuel, FIPE price, ownership history, restrictions. POST /v1/datasets/vehicles.",
  {
    Datasets: z.string().describe("e.g. 'basic_data,owner_history,restrictions'"),
    q: z.string().describe("Query — 'plate{ABC1D23}' / 'chassis{...}' / 'renavam{...}'"),
  },
  async (args) => ok(await bdcRequest("POST", "/v1/datasets/vehicles", { body: args })),
);

server.tool(
  "properties_lookup",
  "Real-estate lookup by address or registration — property type, area, owner history, market value estimate. POST /v1/datasets/properties.",
  {
    Datasets: z.string().describe("e.g. 'basic_data,owner_history,valuation'"),
    q: z.string().describe("Query — 'address{...}' or 'registration{...}'"),
  },
  async (args) => ok(await bdcRequest("POST", "/v1/datasets/properties", { body: args })),
);

// ---------- enrichment slices (persons endpoint, varying Datasets) ----------

server.tool(
  "financial_data",
  "Credit + financial profile for a CPF/CNPJ — income, score, declared assets, banking, default history. POST /v1/datasets/persons.",
  {
    Datasets: z
      .string()
      .optional()
      .describe("Financial-focused datasets (default 'financial_data,income_data,credit_data')"),
    q: z.string().describe("Query string — 'doc{CPF}' or 'doc{CNPJ}'"),
  },
  async (args) => {
    const body = {
      Datasets: args.Datasets ?? "financial_data,income_data,credit_data",
      q: args.q,
    };
    return ok(await bdcRequest("POST", "/v1/datasets/persons", { body }));
  },
);

server.tool(
  "employment_data",
  "Employment profile for a CPF — current employer, history, monthly income, professional category. POST /v1/datasets/persons.",
  {
    Datasets: z.string().optional().describe("Default 'professional_data,occupation_data'"),
    q: z.string().describe("Query — 'doc{CPF}'"),
  },
  async (args) => {
    const body = {
      Datasets: args.Datasets ?? "professional_data,occupation_data",
      q: args.q,
    };
    return ok(await bdcRequest("POST", "/v1/datasets/persons", { body }));
  },
);

server.tool(
  "sanctions_check",
  "Sanctions + PEP screening (OFAC / UN / EU / BR PEP / CNJ / INSS / IBAMA) for a CPF or CNPJ. POST /v1/datasets/persons.",
  {
    Datasets: z.string().optional().describe("Default 'kyc,pep,sanctions,processes'"),
    q: z.string().describe("Query — 'doc{CPF}' or 'doc{CNPJ}'"),
  },
  async (args) => {
    const body = {
      Datasets: args.Datasets ?? "kyc,pep,sanctions,processes",
      q: args.q,
    };
    return ok(await bdcRequest("POST", "/v1/datasets/persons", { body }));
  },
);

server.tool(
  "social_signals",
  "Social-presence enrichment for a CPF (Instagram / LinkedIn / Twitter / Facebook handles + follower counts). POST /v1/datasets/persons.",
  {
    Datasets: z.string().optional().describe("Default 'social_data,public_data'"),
    q: z.string().describe("Query — 'doc{CPF}'"),
  },
  async (args) => {
    const body = {
      Datasets: args.Datasets ?? "social_data,public_data",
      q: args.q,
    };
    return ok(await bdcRequest("POST", "/v1/datasets/persons", { body }));
  },
);

// ---------- antifraud ----------

server.tool(
  "antifraud_score",
  "Composite fraud risk score (0-1000) for a transaction context (CPF + email + phone + IP + device). Returns score, risk factors, decision recommendation. POST /v1/datasets/antifraud.",
  {
    Datasets: z.string().optional().describe("Default 'fraud_score,behavioral_data'"),
    q: z
      .string()
      .describe("Query combining identifiers — 'doc{CPF},email{...},phone{...},ip{...}'"),
  },
  async (args) => {
    const body = {
      Datasets: args.Datasets ?? "fraud_score,behavioral_data",
      q: args.q,
    };
    return ok(await bdcRequest("POST", "/v1/datasets/antifraud", { body }));
  },
);

// ---------- addresses ----------

server.tool(
  "address_validation",
  "Address normalization + validation against CORREIOS + IBGE — canonical address, CEP, neighborhood, city, state, geocode. POST /v1/datasets/addresses.",
  {
    Datasets: z.string().optional().describe("Default 'address_data,geocode'"),
    q: z.string().describe("Query — 'address{...}' or 'cep{12345678}'"),
  },
  async (args) => {
    const body = {
      Datasets: args.Datasets ?? "address_data,geocode",
      q: args.q,
    };
    return ok(await bdcRequest("POST", "/v1/datasets/addresses", { body }));
  },
);

// ---------- transport ----------

const transport = new StdioServerTransport();
await server.connect(transport);
