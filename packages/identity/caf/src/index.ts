#!/usr/bin/env node

/**
 * DEPRECATED (2026-09-27): no live endpoint. api.caf.io does not resolve.
 * No tool reaches a service. Override the host with
 * CAF_BASE_URL if you have a working endpoint.
 *
 * MCP Server for Caf — Brazilian identity + Trust Platform.
 *
 * KYC/KYB, face authentication + liveness, document validation + OCR,
 * antifraud signals, identity orchestration (Trust Platform). Direct
 * competitor to Unico / IDwall / Certta in BR KYC; their Trust Platform
 * orchestrates multi-step identity flows with policy rules.
 *
 * Auth: `Authorization: Bearer <api_key>` on every request.
 *
 * Env:
 *   CAF_API_KEY    — required, issued from the Caf dashboard
 *   CAF_API_BASE   — optional override (default https://api.caf.io)
 *
 * Endpoint paths mirror codespar-enterprise/packages/api/src/catalog/caf.json.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_KEY = process.env.CAF_API_KEY;
const BASE_URL = process.env.CAF_BASE_URL || process.env.CAF_API_BASE || "https://api.caf.io";

if (!API_KEY) {
  console.error("[mcp-caf] missing CAF_API_KEY — refusing to start.");
  process.exit(1);
}

interface CafResult {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
}

async function cafRequest(
  method: string,
  path: string,
  options: { query?: Record<string, unknown>; body?: unknown } = {},
): Promise<CafResult> {
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY!}`,
    },
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

function ok(result: CafResult) {
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
  name: "caf",
  version: "0.1.0",
}, { instructions: MANAGED_TIER_HINT });

// ---------- KYC / KYB ----------

server.tool(
  "person_check",
  "KYC — validate a CPF, return name + DOB + restrictions + risk indicators. POST /v1/checks/person.",
  {
    cpf: z.string().describe("CPF (with or without punctuation)"),
    datasource_ids: z
      .array(z.string())
      .optional()
      .describe("Optional datasources (Receita, SPC, Serasa, OFAC, ...)"),
  },
  async (args) => ok(await cafRequest("POST", "/v1/checks/person", { body: args })),
);

server.tool(
  "company_check",
  "KYB — validate a CNPJ, return corporate profile, QSA, regularity, sanctions. POST /v1/checks/company.",
  {
    cnpj: z.string().describe("CNPJ"),
    datasource_ids: z.array(z.string()).optional(),
  },
  async (args) => ok(await cafRequest("POST", "/v1/checks/company", { body: args })),
);

// ---------- biometrics ----------

server.tool(
  "face_authentication",
  "Face authentication against a base image (typically the document photo). Returns match_score + liveness verdict + spoofing indicators. POST /v1/biometrics/face.",
  {
    selfie: z.string().describe("Base64 JPEG or URL"),
    base_image: z.string().describe("Base64 JPEG or URL — typically document photo"),
  },
  async (args) => ok(await cafRequest("POST", "/v1/biometrics/face", { body: args })),
);

server.tool(
  "liveness_check",
  "Passive liveness on a selfie (no comparison image). Returns liveness_score + spoofing signals. POST /v1/biometrics/liveness.",
  {
    selfie: z.string().describe("Base64 JPEG or URL"),
  },
  async (args) => ok(await cafRequest("POST", "/v1/biometrics/liveness", { body: args })),
);

// ---------- documents ----------

server.tool(
  "document_check",
  "Document validation — OCR + authenticity check on RG / CNH / passport / proof of residence. Returns structured fields + authenticity_score. POST /v1/checks/document.",
  {
    document_type: z.enum(["rg", "cnh", "passport", "proof_of_residence"]),
    front_image: z.string().describe("Base64 or URL"),
    back_image: z
      .string()
      .optional()
      .describe("Optional — required for some doc types (CNH back)"),
  },
  async (args) => ok(await cafRequest("POST", "/v1/checks/document", { body: args })),
);

// ---------- Trust Platform orchestration ----------

server.tool(
  "trust_platform_start",
  "Start a Trust Platform onboarding flow — orchestrated pipeline chaining person/company checks + biometrics + document validation per a dashboard template. Returns flow_id + hosted onboarding URL. POST /v1/trust/flows.",
  {
    template_id: z.string().describe("Trust Platform template id"),
    subject: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("{ cpf, email, phone, ... }"),
    return_url: z
      .string()
      .optional()
      .describe("Where the hosted flow redirects after completion"),
  },
  async (args) => ok(await cafRequest("POST", "/v1/trust/flows", { body: args })),
);

server.tool(
  "trust_platform_get",
  "Get the status + step-by-step verdicts of a Trust Platform flow. GET /v1/trust/flows/{flow_id}.",
  {
    flow_id: z.string().describe("Trust Platform flow id"),
  },
  async ({ flow_id }) => ok(await cafRequest("GET", `/v1/trust/flows/${flow_id}`)),
);

// ---------- metadata + replay ----------

server.tool(
  "list_datasources",
  "List the datasources available to your Caf account (varies per subscription tier). GET /v1/datasources.",
  {},
  async () => ok(await cafRequest("GET", "/v1/datasources")),
);

server.tool(
  "get_check_result",
  "Retrieve a previously-run check by ID (person, company, or document). Useful for replay + auditing without re-querying datasources. GET /v1/checks/{check_id}.",
  {
    check_id: z.string().describe("Check id"),
  },
  async ({ check_id }) => ok(await cafRequest("GET", `/v1/checks/${check_id}`)),
);

// ---------- transport ----------

const transport = new StdioServerTransport();
await server.connect(transport);
