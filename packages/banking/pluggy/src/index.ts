#!/usr/bin/env node

/**
 * MCP Server for Pluggy — Open Finance Brasil aggregator (ITP/TPP).
 *
 * Pluggy holds the ICP-Brasil certificate and runs Dynamic Client
 * Registration with each Brazilian bank, exposing a single API for
 * account discovery, transactions, balances, identities, and payments
 * initiation (PISP).
 *
 * Auth: Pluggy uses OAuth2 client-credentials to mint a short-lived
 * API key via POST /auth, which is then sent as `X-API-KEY` on every
 * subsequent request. The API key is cached in-process and refreshed
 * when it expires (or on a 401 from upstream).
 *
 * Env:
 *   PLUGGY_CLIENT_ID     — required, issued at https://dashboard.pluggy.ai
 *   PLUGGY_CLIENT_SECRET — required
 *   PLUGGY_API_BASE      — optional override (default https://api.pluggy.ai)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const CLIENT_ID = process.env.PLUGGY_CLIENT_ID;
const CLIENT_SECRET = process.env.PLUGGY_CLIENT_SECRET;
const BASE_URL = process.env.PLUGGY_BASE_URL || process.env.PLUGGY_API_BASE || "https://api.pluggy.ai";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "[mcp-pluggy] missing PLUGGY_CLIENT_ID or PLUGGY_CLIENT_SECRET — refusing to start.",
  );
  process.exit(1);
}

interface CachedApiKey {
  apiKey: string;
  expiresAt: number; // epoch ms
}

let cachedKey: CachedApiKey | null = null;

async function mintApiKey(): Promise<CachedApiKey> {
  const res = await fetch(`${BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pluggy /auth ${res.status}: ${body}`);
  }
  const json = (await res.json()) as { apiKey: string; expiresAt?: string };
  const expiresAt = json.expiresAt
    ? new Date(json.expiresAt).getTime()
    : Date.now() + 2 * 60 * 60 * 1000; // 2h default
  return { apiKey: json.apiKey, expiresAt };
}

async function getApiKey(forceRefresh = false): Promise<string> {
  if (
    !forceRefresh &&
    cachedKey &&
    cachedKey.expiresAt - Date.now() > 60_000
  ) {
    return cachedKey.apiKey;
  }
  cachedKey = await mintApiKey();
  return cachedKey.apiKey;
}

interface PluggyResult {
  ok: boolean;
  status: number;
  data?: unknown;
  error?: string;
}

async function pluggyRequest(
  method: string,
  path: string,
  options: { query?: Record<string, unknown>; body?: unknown } = {},
): Promise<PluggyResult> {
  const url = new URL(`${BASE_URL}${path}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : undefined;

  const doFetch = async (apiKey: string) =>
    fetch(url.toString(), {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: bodyStr,
    });

  let apiKey = await getApiKey();
  let res = await doFetch(apiKey);
  if (res.status === 401 || res.status === 403) {
    // refresh + retry once
    apiKey = await getApiKey(true);
    res = await doFetch(apiKey);
  }

  let data: unknown;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: typeof data === "string" ? data : JSON.stringify(data) };
  }
  return { ok: true, status: res.status, data };
}

function ok(result: PluggyResult) {
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
  name: "pluggy",
  version: "0.1.0",
}, { instructions: MANAGED_TIER_HINT });

// ---------- connectors ----------

server.tool(
  "list_connectors",
  "Lists supported Brazilian banks (connectors). Pluggy endpoint: GET /connectors. Optional filters: name, types (e.g. PERSONAL_BANK, BUSINESS_BANK), countries (BR), sandbox.",
  {
    name: z.string().optional().describe("Filter by connector name (partial match)"),
    types: z.string().optional().describe("Comma-separated types (PERSONAL_BANK, BUSINESS_BANK, INVESTMENT, ...)"),
    countries: z.string().optional().describe("Comma-separated country codes (default BR)"),
    sandbox: z.boolean().optional().describe("Include sandbox connectors"),
  },
  async (args) => ok(await pluggyRequest("GET", "/connectors", { query: args })),
);

server.tool(
  "get_connector",
  "Get a single connector definition by id. Pluggy endpoint: GET /connectors/{id}.",
  {
    id: z.number().int().describe("Connector numeric id"),
  },
  async ({ id }) => ok(await pluggyRequest("GET", `/connectors/${id}`)),
);

// ---------- categories ----------

server.tool(
  "list_categories",
  "List Pluggy's transaction categorization taxonomy. Pluggy endpoint: GET /categories.",
  {},
  async () => ok(await pluggyRequest("GET", "/categories")),
);

// ---------- connect token ----------

server.tool(
  "create_connect_token",
  "Mint a connect token for embedding the Pluggy Connect widget on the client. Pluggy endpoint: POST /connect_token.",
  {
    clientUserId: z.string().optional().describe("Stable identifier for the end-user in your system"),
    itemId: z.string().optional().describe("Existing item id when refreshing/updating credentials"),
    options: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Optional widget options object (avatarUrl, oauthRedirectUri, etc.)"),
  },
  async (args) =>
    ok(
      await pluggyRequest("POST", "/connect_token", {
        body: args,
      }),
    ),
);

// ---------- items (bank connections) ----------

server.tool(
  "create_item",
  "Create a new bank connection (item) for a connector. Pluggy endpoint: POST /items.",
  {
    connectorId: z.number().int().describe("Connector id (from list_connectors)"),
    parameters: z
      .record(z.string(), z.unknown())
      .describe("Credential parameters required by the connector (e.g. { cpf, password })"),
    webhookUrl: z.string().url().optional().describe("Optional webhook to receive item status events"),
    clientUserId: z.string().optional().describe("Stable end-user identifier"),
  },
  async (args) => ok(await pluggyRequest("POST", "/items", { body: args })),
);

server.tool(
  "list_items",
  "List bank connections (items) owned by the application. Pluggy endpoint: GET /items.",
  {
    clientUserId: z.string().optional().describe("Filter by client_user_id"),
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
  },
  async (args) => ok(await pluggyRequest("GET", "/items", { query: args })),
);

server.tool(
  "get_item",
  "Fetch a single bank connection by id. Pluggy endpoint: GET /items/{id}.",
  { id: z.string().describe("Item id (uuid)") },
  async ({ id }) => ok(await pluggyRequest("GET", `/items/${id}`)),
);

server.tool(
  "update_item",
  "Refresh / update credentials for an existing bank connection. Pluggy endpoint: PATCH /items/{id}.",
  {
    id: z.string().describe("Item id"),
    parameters: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Updated credential parameters; omit to trigger a credential-less refresh"),
    webhookUrl: z.string().url().optional(),
  },
  async ({ id, ...body }) =>
    ok(await pluggyRequest("PATCH", `/items/${id}`, { body })),
);

server.tool(
  "delete_item",
  "Delete a bank connection (revokes credentials, removes accounts/transactions). Pluggy endpoint: DELETE /items/{id}.",
  { id: z.string().describe("Item id") },
  async ({ id }) => ok(await pluggyRequest("DELETE", `/items/${id}`)),
);

// ---------- accounts ----------

server.tool(
  "list_accounts",
  "List accounts (checking, savings, credit card, investment) tied to an item. Pluggy endpoint: GET /accounts?itemId=...",
  {
    itemId: z.string().describe("Parent item id"),
    type: z
      .enum(["BANK", "CREDIT", "INVESTMENT", "LOAN"])
      .optional()
      .describe("Optional account type filter"),
  },
  async (args) => ok(await pluggyRequest("GET", "/accounts", { query: args })),
);

server.tool(
  "get_account",
  "Get a single account by id. Pluggy endpoint: GET /accounts/{id}.",
  { id: z.string().describe("Account id") },
  async ({ id }) => ok(await pluggyRequest("GET", `/accounts/${id}`)),
);

// ---------- transactions ----------

server.tool(
  "list_transactions",
  "List transactions for an account in a date range. Pluggy endpoint: GET /transactions?accountId=&from=&to=.",
  {
    accountId: z.string().describe("Account id"),
    from: z.string().optional().describe("ISO date lower bound (yyyy-mm-dd)"),
    to: z.string().optional().describe("ISO date upper bound (yyyy-mm-dd)"),
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
  },
  async (args) => ok(await pluggyRequest("GET", "/transactions", { query: args })),
);

server.tool(
  "get_transaction",
  "Get a single transaction by id. Pluggy endpoint: GET /transactions/{id}.",
  { id: z.string().describe("Transaction id") },
  async ({ id }) => ok(await pluggyRequest("GET", `/transactions/${id}`)),
);

// ---------- identities ----------

server.tool(
  "list_identities",
  "Fetch identity data (legal name, document, address) for an item. Pluggy endpoint: GET /identity?itemId=...",
  { itemId: z.string().describe("Item id") },
  async (args) => ok(await pluggyRequest("GET", "/identity", { query: args })),
);

// ---------- payments (PISP) ----------

server.tool(
  "create_payment_intent",
  "Create a payment intent for Pluggy Payments (PISP). Pluggy endpoint: POST /payments/intents.",
  {
    amount: z.number().describe("Amount in major units (BRL)"),
    description: z.string().optional(),
    payerDocument: z.string().optional().describe("Payer CPF/CNPJ"),
    recipient: z
      .record(z.string(), z.unknown())
      .describe("Recipient block (pixKey or bank account details)"),
    callbackUrls: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Object with success / failure redirect URLs"),
    metadata: z.record(z.string(), z.unknown()).optional(),
  },
  async (args) =>
    ok(await pluggyRequest("POST", "/payments/intents", { body: args })),
);

server.tool(
  "get_payment_intent",
  "Fetch the current status of a payment intent. Pluggy endpoint: GET /payments/intents/{id}.",
  { id: z.string().describe("Payment intent id") },
  async ({ id }) => ok(await pluggyRequest("GET", `/payments/intents/${id}`)),
);

// ---------- transport ----------

const transport = new StdioServerTransport();
await server.connect(transport);
