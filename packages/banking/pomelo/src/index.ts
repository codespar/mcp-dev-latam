#!/usr/bin/env node

/**
 * MCP Server for Pomelo — pan-LATAM card issuing as a service.
 *
 * Pomelo (pomelo.la) is a card-issuing processor for Visa/Mastercard
 * across Argentina, Brazil, Mexico, Colombia, Peru and Chile. This
 * server wraps the core issuing surface: identity holders (Users),
 * card issuance and lifecycle (Cards), and the transactions feed.
 *
 * Tools (9):
 *   Users:
 *     create_user        — create a card-holder identity
 *     get_user           — fetch a user by id
 *     update_user        — patch user data (status, contact fields)
 *   Cards:
 *     create_card        — issue a VIRTUAL or PHYSICAL card for a user
 *     get_card           — fetch a card by id
 *     list_cards         — list cards, filterable by user
 *     update_card_status — activate / block / unblock a card
 *   Transactions:
 *     list_transactions  — search the card-transactions feed
 *     get_transaction    — fetch a single transaction by id
 *
 * Authentication
 *   OAuth2 client-credentials: POST {AUTH_URL}/oauth/token with
 *   client_id / client_secret / audience → Bearer token (cached until
 *   ~60s before expiry).
 *
 * Environment
 *   POMELO_CLIENT_ID      — OAuth client id (required)
 *   POMELO_CLIENT_SECRET  — OAuth client secret (required)
 *   POMELO_ENV            — "sandbox" | "production" (default: "sandbox")
 *   POMELO_BASE_URL       — API base override (default per env)
 *   POMELO_AUTH_URL       — auth base override (default per env)
 *   POMELO_AUDIENCE       — OAuth audience override (default per env)
 *
 * Docs: https://docs.pomelo.la
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.POMELO_CLIENT_ID || "";
const CLIENT_SECRET = process.env.POMELO_CLIENT_SECRET || "";
const ENV = (process.env.POMELO_ENV || "sandbox").toLowerCase();

// Hosts per developers.pomelo.la ("Stage: https://api-stage.pomelo.la /
// Produccion: https://api.pomelo.la"); the token call is {API host}/oauth/token.
// Up to 0.1.0 the sandbox defaults were api-dev / auth-dev.pomelo.la,
// which do not resolve.
const BASE_URL =
  process.env.POMELO_BASE_URL ||
  (ENV === "production" ? "https://api.pomelo.la" : "https://api-stage.pomelo.la");
const AUTH_URL =
  process.env.POMELO_AUTH_URL ||
  (ENV === "production" ? "https://api.pomelo.la" : "https://api-stage.pomelo.la");
// The audience is a JWT claim value, not a host the server connects to.
const AUDIENCE =
  process.env.POMELO_AUDIENCE ||
  (ENV === "production" ? "https://auth.pomelo.la" : "https://auth-dev.pomelo.la"); // catalog-hosts: not-a-host

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const res = await fetch(`${AUTH_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      audience: AUDIENCE,
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pomelo auth ${res.status}: ${err}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

async function pomeloRequest(
  method: string,
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<unknown> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  // Pomelo requires an idempotency key on mutating card/user calls.
  if (idempotencyKey) headers["x-idempotency-key"] = idempotencyKey;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pomelo API ${res.status}: ${err}`);
  }
  const text = await res.text();
  if (!text) return { ok: true };
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function idem(args: Record<string, unknown> | undefined): string {
  const provided = args?.idempotency_key;
  if (typeof provided === "string" && provided) return provided;
  return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new Server(
  { name: "mcp-pomelo", version: "0.1.0" },
  { capabilities: { tools: {} }, instructions: MANAGED_TIER_HINT },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_user",
      description:
        "Create a card-holder identity (POST /users/v1). The user is the person or business the card is issued to. Pass the Pomelo user shape for the target country (name, surname, identification_type/value, birthdate, address, email, phone).",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Given name" },
          surname: { type: "string", description: "Family name" },
          identification_type: { type: "string", description: "Country document type (e.g. DNI, CPF, CURP, CC)" },
          identification_value: { type: "string", description: "Document number" },
          birthdate: { type: "string", description: "YYYY-MM-DD" },
          email: { type: "string", description: "Email address" },
          phone: { type: "string", description: "Phone in international format" },
          gender: { type: "string", description: "MALE | FEMALE | OTHER (country-dependent requirement)" },
          address: {
            type: "object",
            description: "Residential address: street_name, street_number, zip_code, city, region, country (ISO-3)",
          },
          operation_country: { type: "string", description: "ISO-3 country of operation (e.g. ARG, BRA, MEX, COL)" },
          extra: { type: "object", description: "Any additional Pomelo user fields, merged into the payload" },
          idempotency_key: { type: "string", description: "Optional idempotency key. Auto-generated when omitted." },
        },
        required: ["name", "surname", "identification_type", "identification_value", "operation_country"],
      },
    },
    {
      name: "get_user",
      description: "Fetch a user by id (GET /users/v1/{id}).",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Pomelo user id (usr-...)" },
        },
        required: ["user_id"],
      },
    },
    {
      name: "update_user",
      description:
        "Patch a user (PATCH /users/v1/{id}). Pass only the fields to change (e.g. status ACTIVE | BLOCKED, email, phone, address).",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Pomelo user id (usr-...)" },
          patch: { type: "object", description: "Fields to update, Pomelo user shape" },
          idempotency_key: { type: "string", description: "Optional idempotency key. Auto-generated when omitted." },
        },
        required: ["user_id", "patch"],
      },
    },
    {
      name: "create_card",
      description:
        "Issue a card for a user (POST /cards/v1). card_type VIRTUAL is usable immediately; PHYSICAL enters embossing/shipping and must be activated on receipt. affinity_group_id selects the card program (BIN, art, limits) configured with Pomelo.",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Owner user id (usr-...)" },
          affinity_group_id: { type: "string", description: "Card program id (afg-...)" },
          card_type: { type: "string", enum: ["VIRTUAL", "PHYSICAL"], description: "Card form factor" },
          address: {
            type: "object",
            description: "Shipping address for PHYSICAL cards (street_name, street_number, zip_code, city, region, country)",
          },
          extra: { type: "object", description: "Any additional Pomelo card fields, merged into the payload" },
          idempotency_key: { type: "string", description: "Optional idempotency key. Auto-generated when omitted." },
        },
        required: ["user_id", "affinity_group_id", "card_type"],
      },
    },
    {
      name: "get_card",
      description: "Fetch a card by id (GET /cards/v1/{id}). Returns masked PAN, status, type and program data — never full card credentials.",
      inputSchema: {
        type: "object",
        properties: {
          card_id: { type: "string", description: "Pomelo card id (crd-...)" },
        },
        required: ["card_id"],
      },
    },
    {
      name: "list_cards",
      description: "List cards (GET /cards/v1), filterable by user and status. Paginated.",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Filter by owner user id" },
          status: { type: "string", description: "Filter by status (e.g. ACTIVE, BLOCKED, DISABLED)" },
          page: { type: "number", description: "Page number (0-based)" },
          size: { type: "number", description: "Page size" },
        },
      },
    },
    {
      name: "update_card_status",
      description:
        "Change a card's lifecycle status (PATCH /cards/v1/{id}): ACTIVE to unblock/activate, BLOCKED to freeze, DISABLED to cancel permanently. status_reason is required by Pomelo for blocks (e.g. CLIENT_INTERNAL_REASON, LOST, STOLEN).",
      inputSchema: {
        type: "object",
        properties: {
          card_id: { type: "string", description: "Pomelo card id (crd-...)" },
          status: { type: "string", enum: ["ACTIVE", "BLOCKED", "DISABLED"], description: "Target status" },
          status_reason: { type: "string", description: "Reason code (required for BLOCKED/DISABLED)" },
          idempotency_key: { type: "string", description: "Optional idempotency key. Auto-generated when omitted." },
        },
        required: ["card_id", "status"],
      },
    },
    {
      name: "list_transactions",
      description:
        "Search the card-transactions feed (GET /transactions/v1), filterable by card, user and time window. Paginated.",
      inputSchema: {
        type: "object",
        properties: {
          card_id: { type: "string", description: "Filter by card id" },
          user_id: { type: "string", description: "Filter by user id" },
          from: { type: "string", description: "ISO-8601 start of window" },
          to: { type: "string", description: "ISO-8601 end of window" },
          page: { type: "number", description: "Page number (0-based)" },
          size: { type: "number", description: "Page size" },
        },
      },
    },
    {
      name: "get_transaction",
      description: "Fetch a single card transaction by id (GET /transactions/v1/{id}).",
      inputSchema: {
        type: "object",
        properties: {
          transaction_id: { type: "string", description: "Pomelo transaction id (ctx-...)" },
        },
        required: ["transaction_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params as {
    name: string;
    arguments?: Record<string, unknown>;
  };
  try {
    switch (name) {
      case "create_user": {
        const { extra, idempotency_key: _ik, ...fields } = (args ?? {}) as Record<string, unknown>;
        const body = { ...fields, ...(typeof extra === "object" && extra ? extra : {}) };
        return {
          content: [
            { type: "text", text: JSON.stringify(await pomeloRequest("POST", "/users/v1", body, idem(args)), null, 2) },
          ],
        };
      }
      case "get_user":
        return {
          content: [
            { type: "text", text: JSON.stringify(await pomeloRequest("GET", `/users/v1/${args?.user_id}`), null, 2) },
          ],
        };
      case "update_user":
        return {
          content: [
            { type: "text", text: JSON.stringify(await pomeloRequest("PATCH", `/users/v1/${args?.user_id}`, args?.patch, idem(args)), null, 2) },
          ],
        };
      case "create_card": {
        const { extra, idempotency_key: _ik, ...fields } = (args ?? {}) as Record<string, unknown>;
        const body = { ...fields, ...(typeof extra === "object" && extra ? extra : {}) };
        return {
          content: [
            { type: "text", text: JSON.stringify(await pomeloRequest("POST", "/cards/v1", body, idem(args)), null, 2) },
          ],
        };
      }
      case "get_card":
        return {
          content: [
            { type: "text", text: JSON.stringify(await pomeloRequest("GET", `/cards/v1/${args?.card_id}`), null, 2) },
          ],
        };
      case "list_cards": {
        const params = new URLSearchParams();
        if (args?.user_id) params.set("filter[user_id]", String(args.user_id));
        if (args?.status) params.set("filter[status]", String(args.status));
        if (args?.page !== undefined) params.set("page[number]", String(args.page));
        if (args?.size !== undefined) params.set("page[size]", String(args.size));
        const qs = params.toString();
        return {
          content: [
            { type: "text", text: JSON.stringify(await pomeloRequest("GET", `/cards/v1${qs ? `?${qs}` : ""}`), null, 2) },
          ],
        };
      }
      case "update_card_status": {
        const body: Record<string, unknown> = { status: args?.status };
        if (args?.status_reason) body.status_reason = args.status_reason;
        return {
          content: [
            { type: "text", text: JSON.stringify(await pomeloRequest("PATCH", `/cards/v1/${args?.card_id}`, body, idem(args)), null, 2) },
          ],
        };
      }
      case "list_transactions": {
        const params = new URLSearchParams();
        if (args?.card_id) params.set("filter[card_id]", String(args.card_id));
        if (args?.user_id) params.set("filter[user_id]", String(args.user_id));
        if (args?.from) params.set("filter[created_at][from]", String(args.from));
        if (args?.to) params.set("filter[created_at][to]", String(args.to));
        if (args?.page !== undefined) params.set("page[number]", String(args.page));
        if (args?.size !== undefined) params.set("page[size]", String(args.size));
        const qs = params.toString();
        return {
          content: [
            { type: "text", text: JSON.stringify(await pomeloRequest("GET", `/transactions/v1${qs ? `?${qs}` : ""}`), null, 2) },
          ],
        };
      }
      case "get_transaction":
        return {
          content: [
            { type: "text", text: JSON.stringify(await pomeloRequest("GET", `/transactions/v1/${args?.transaction_id}`), null, 2) },
          ],
        };
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
