#!/usr/bin/env node

/**
 * MCP Server for Iniciador — Open Finance Brasil PISP (Pix payment
 * initiation aggregator).
 *
 * Iniciador is positioned as the payment-initiation half of OFB —
 * complementary to data-side aggregators (Pluggy, Belvo). Where
 * Pluggy/Belvo specialize in account + transaction reads, Iniciador
 * specializes in writing: initiating Pix payments on the consumer's
 * behalf via OFB's payments rail (PISP role).
 *
 * Auth: API key sent as `X-API-KEY`. Some flows additionally require
 * OAuth2 client_credentials handshake — this scaffold supports API
 * key only; OAuth lands when consent + bank-issued token plumbing is
 * wired end-to-end.
 *
 * Env:
 *   INICIADOR_API_KEY  — required, issued during Iniciador onboarding
 *   INICIADOR_API_BASE — optional override (default https://api.iniciador.com.br)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_KEY = process.env.INICIADOR_API_KEY;
const BASE_URL = process.env.INICIADOR_BASE_URL || process.env.INICIADOR_API_BASE || "https://api.iniciador.com.br";

if (!API_KEY) {
  console.error("[mcp-iniciador] missing INICIADOR_API_KEY — refusing to start.");
  process.exit(1);
}

interface IniciadorResult {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
}

async function iniciadorRequest(
  method: string,
  path: string,
  options: { query?: Record<string, unknown>; body?: unknown } = {},
): Promise<IniciadorResult> {
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
      "X-API-KEY": API_KEY!,
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

function ok(result: IniciadorResult) {
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
  name: "iniciador",
  version: "0.1.0",
}, { instructions: MANAGED_TIER_HINT });

// ---------- institutions ----------

server.tool(
  "list_institutions",
  "List Brazilian banks supported for Pix payment initiation. Iniciador endpoint: GET /institutions.",
  {
    name: z.string().optional().describe("Filter by partial bank name"),
    ispb: z.string().optional().describe("Filter by 8-digit ISPB code"),
  },
  async (args) => ok(await iniciadorRequest("GET", "/institutions", { query: args })),
);

// ---------- consents ----------

server.tool(
  "create_consent",
  "Create a payment consent that the payer will authorize at their bank. Iniciador endpoint: POST /consents.",
  {
    payer: z
      .record(z.string(), z.unknown())
      .describe("Payer block (e.g. { document: { type: 'CPF', value }, name })"),
    institutionIspb: z.string().describe("ISPB of the payer's bank"),
    payment: z
      .record(z.string(), z.unknown())
      .describe("Payment block (amount, type=PIX, creditor with pixKey or bank info)"),
    redirectUri: z.string().url().optional().describe("URL to send the payer back to after authorization"),
    expiresAt: z.string().optional().describe("ISO datetime when this consent expires"),
  },
  async (args) => ok(await iniciadorRequest("POST", "/consents", { body: args })),
);

server.tool(
  "get_consent",
  "Fetch a payment consent and its current authorization status. Iniciador endpoint: GET /consents/{id}.",
  { id: z.string().describe("Consent id") },
  async ({ id }) => ok(await iniciadorRequest("GET", `/consents/${id}`)),
);

server.tool(
  "revoke_consent",
  "Revoke a payment consent before it is exercised. Iniciador endpoint: DELETE /consents/{id}.",
  { id: z.string().describe("Consent id") },
  async ({ id }) => ok(await iniciadorRequest("DELETE", `/consents/${id}`)),
);

// ---------- payments ----------

server.tool(
  "create_payment",
  "Initiate a Pix transfer once a consent has been authorized. Iniciador endpoint: POST /payments.",
  {
    consentId: z.string().describe("Authorized consent id (from create_consent + payer authorization)"),
    amount: z.string().describe("Amount in BRL, decimal string (e.g. '125.00')"),
    creditor: z
      .record(z.string(), z.unknown())
      .describe("Creditor block (pixKey, name, document, optional bank account)"),
    remittanceInformation: z.string().optional().describe("Free-text message attached to the Pix"),
    endToEndId: z.string().optional().describe("Optional E2E id (RFC-compliant); Iniciador may auto-generate"),
  },
  async (args) => ok(await iniciadorRequest("POST", "/payments", { body: args })),
);

server.tool(
  "get_payment",
  "Fetch a payment by id (status, E2E id, error reason if rejected). Iniciador endpoint: GET /payments/{id}.",
  { id: z.string().describe("Payment id") },
  async ({ id }) => ok(await iniciadorRequest("GET", `/payments/${id}`)),
);

server.tool(
  "list_payments",
  "List payments in a date range with optional filters. Iniciador endpoint: GET /payments.",
  {
    from: z.string().optional().describe("ISO date lower bound (yyyy-mm-dd)"),
    to: z.string().optional().describe("ISO date upper bound (yyyy-mm-dd)"),
    status: z
      .string()
      .optional()
      .describe("Filter by status (PENDING, AUTHORIZED, SETTLED, REJECTED, ...)"),
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
  },
  async (args) => ok(await iniciadorRequest("GET", "/payments", { query: args })),
);

server.tool(
  "cancel_payment",
  "Attempt to cancel a payment that has not yet settled. Iniciador endpoint: POST /payments/{id}/cancel.",
  {
    id: z.string().describe("Payment id"),
    reason: z.string().optional().describe("Optional human-readable cancellation reason"),
  },
  async ({ id, reason }) =>
    ok(
      await iniciadorRequest("POST", `/payments/${id}/cancel`, {
        body: reason ? { reason } : undefined,
      }),
    ),
);

// ---------- helper ----------

server.tool(
  "get_authorization_url",
  "Build the URL where the payer authorizes a consent at their bank. This is a helper — it does not call Iniciador. Returns the standard OFB authorization URL using the consent id + redirect URI.",
  {
    consentId: z.string().describe("Consent id returned by create_consent"),
    institutionIspb: z.string().describe("Target bank's ISPB"),
    redirectUri: z.string().url().describe("Where the bank should redirect after authorization"),
    authorizationBase: z
      .string()
      .url()
      .optional()
      .describe("Override the authorization base (default: Iniciador-hosted authorization gateway)"),
  },
  async ({ consentId, institutionIspb, redirectUri, authorizationBase }) => {
    const base = authorizationBase ?? `${BASE_URL}/authorize`;
    const url = new URL(base);
    url.searchParams.set("consent_id", consentId);
    url.searchParams.set("institution_ispb", institutionIspb);
    url.searchParams.set("redirect_uri", redirectUri);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              ok: true,
              status: 200,
              data: {
                authorization_url: url.toString(),
                note: "This URL is built client-side. The exact host/path depends on Iniciador's deployment; override via authorizationBase if your tenant uses a different gateway.",
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ---------- transport ----------

const transport = new StdioServerTransport();
await server.connect(transport);
