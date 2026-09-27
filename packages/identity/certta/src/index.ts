#!/usr/bin/env node

/**
 * DEPRECATED (2026-09-27): no live endpoint. api.certta.com.br does not resolve.
 * No tool reaches a service. Override the host with
 * CERTTA_BASE_URL if you have a working endpoint.
 *
 * MCP Server for Certta — Brazilian identity + signature platform.
 *
 * KYC/KYB (CPF / CNPJ via Receita Federal + SPC / Serasa), face match +
 * liveness, OCR of RG / CNH / comprovantes, antifraud score, ICP-Brasil
 * digital signature + GoCertta electronic signature. Onboarding pipelines
 * chain KYC + biometrics + signature in a single orchestrated process.
 *
 * Auth: `Authorization: Bearer <api_key>` on every request.
 *
 * Env:
 *   CERTTA_API_KEY    — required, issued from the Certta dashboard
 *   CERTTA_API_BASE   — optional override (default https://api.certta.com.br)
 *
 * Endpoint paths mirror codespar-enterprise/packages/api/src/catalog/certta.json.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_KEY = process.env.CERTTA_API_KEY;
const BASE_URL = process.env.CERTTA_BASE_URL || process.env.CERTTA_API_BASE || "https://api.certta.com.br";

if (!API_KEY) {
  console.error("[mcp-certta] missing CERTTA_API_KEY — refusing to start.");
  process.exit(1);
}

interface CerttaResult {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
}

async function certtaRequest(
  method: string,
  path: string,
  options: { query?: Record<string, unknown>; body?: unknown } = {},
): Promise<CerttaResult> {
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

function ok(result: CerttaResult) {
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
  name: "certta",
  version: "0.1.0",
}, { instructions: MANAGED_TIER_HINT });

// ---------- KYC / KYB ----------

server.tool(
  "kyc_lookup_cpf",
  "Validate a CPF against Receita Federal + SPC / Serasa. Returns name, DOB, regularity status, restrictions, risk score. POST /v1/kyc/cpf.",
  {
    cpf: z.string().describe("11-digit CPF, with or without punctuation"),
    birth_date: z
      .string()
      .optional()
      .describe("YYYY-MM-DD (some Receita queries require for cross-check)"),
  },
  async (args) => ok(await certtaRequest("POST", "/v1/kyc/cpf", { body: args })),
);

server.tool(
  "kyb_lookup_cnpj",
  "Validate a CNPJ and return company profile — corporate name, fantasia, address, partners (QSA), CNAE, share capital, regularity status. POST /v1/kyb/cnpj.",
  {
    cnpj: z.string().describe("14-digit CNPJ"),
  },
  async (args) => ok(await certtaRequest("POST", "/v1/kyb/cnpj", { body: args })),
);

// ---------- biometrics ----------

server.tool(
  "biometrics_face_match",
  "Compare a selfie against a document photo (RG / CNH front). Returns match_score (0..1) and liveness verdict. POST /v1/biometrics/face-match.",
  {
    selfie: z.string().describe("Base64-encoded JPEG or URL"),
    document_image: z.string().describe("Base64-encoded JPEG or URL"),
    liveness_check: z.boolean().optional().describe("Default true"),
  },
  async (args) => ok(await certtaRequest("POST", "/v1/biometrics/face-match", { body: args })),
);

server.tool(
  "biometrics_liveness",
  "Passive liveness check on a selfie (no document). Returns liveness_score (0..1) + spoofing_indicators. POST /v1/biometrics/liveness.",
  {
    selfie: z.string().describe("Base64-encoded JPEG or URL"),
  },
  async (args) => ok(await certtaRequest("POST", "/v1/biometrics/liveness", { body: args })),
);

// ---------- documents ----------

server.tool(
  "documents_ocr",
  "OCR a Brazilian ID document (RG / CNH / CRLV / proof of residence / passport). Returns extracted structured fields per document type. POST /v1/documents/ocr.",
  {
    document_type: z
      .enum(["rg", "cnh", "crlv", "proof_of_residence", "passport"])
      .describe("Document type"),
    image: z.string().describe("Base64-encoded JPEG/PNG or URL"),
  },
  async (args) => ok(await certtaRequest("POST", "/v1/documents/ocr", { body: args })),
);

// ---------- antifraud ----------

server.tool(
  "antifraud_score",
  "Compute Certta's antifraud risk score for an applicant given KYC + biometrics + device signals. 0..100 (higher = riskier). POST /v1/antifraud/score.",
  {
    subject: z
      .record(z.string(), z.unknown())
      .describe("{ cpf, name, email, phone, ip, device_fingerprint, ... }"),
    context: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Optional transaction context (amount, currency, merchant)"),
  },
  async (args) => ok(await certtaRequest("POST", "/v1/antifraud/score", { body: args })),
);

// ---------- signature ----------

server.tool(
  "signature_icp_create",
  "Create an ICP-Brasil digital signature envelope for one or more documents. Returns envelope_id + signers' authorization URLs. POST /v1/signature/icp/envelopes.",
  {
    documents: z
      .array(z.record(z.string(), z.unknown()))
      .describe("Array of { name, content (base64 PDF) }"),
    signers: z
      .array(z.record(z.string(), z.unknown()))
      .describe("Array of { name, cpf, email }"),
  },
  async (args) =>
    ok(await certtaRequest("POST", "/v1/signature/icp/envelopes", { body: args })),
);

server.tool(
  "signature_electronic_create",
  "Create a GoCertta electronic signature envelope (e-signature without ICP-Brasil cert — lower legal weight, faster UX). POST /v1/signature/electronic/envelopes.",
  {
    documents: z.array(z.record(z.string(), z.unknown())),
    signers: z.array(z.record(z.string(), z.unknown())),
  },
  async (args) =>
    ok(await certtaRequest("POST", "/v1/signature/electronic/envelopes", { body: args })),
);

server.tool(
  "signature_get_envelope",
  "Get status + signer responses for a signature envelope. GET /v1/signature/envelopes/{envelope_id}.",
  {
    envelope_id: z.string().describe("Envelope id returned by signature_*_create"),
  },
  async ({ envelope_id }) =>
    ok(await certtaRequest("GET", `/v1/signature/envelopes/${envelope_id}`)),
);

// ---------- onboarding pipelines ----------

server.tool(
  "onboarding_process_create",
  "Kick off an orchestrated onboarding pipeline that chains KYC + biometrics + signature in one call. Returns process_id; track via onboarding_process_get. POST /v1/onboarding/processes.",
  {
    template_id: z
      .string()
      .describe("Template ID configured in the Certta dashboard"),
    subject: z
      .record(z.string(), z.unknown())
      .describe("{ cpf, name, email, phone, ... }"),
  },
  async (args) => ok(await certtaRequest("POST", "/v1/onboarding/processes", { body: args })),
);

server.tool(
  "onboarding_process_get",
  "Get status + results of an onboarding process. Each step (KYC, biometrics, signature) reports its own verdict. GET /v1/onboarding/processes/{process_id}.",
  {
    process_id: z.string().describe("Onboarding process id"),
  },
  async ({ process_id }) =>
    ok(await certtaRequest("GET", `/v1/onboarding/processes/${process_id}`)),
);

// ---------- transport ----------

const transport = new StdioServerTransport();
await server.connect(transport);
