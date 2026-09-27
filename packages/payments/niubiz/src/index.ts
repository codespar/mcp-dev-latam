#!/usr/bin/env node

/**
 * MCP Server for Niubiz — Peru's dominant card acquirer (niubiz.com.pe).
 *
 * Niubiz (ex-VisaNet Perú, 300k+ merchants) runs the standard
 * ecommerce card flow in Peru. The API is a 3-step dance:
 *   1. get_security_token   — Basic-auth user/password → bearer token
 *   2. create_session_token — session for the checkout form (antifraud data)
 *   3. authorize_transaction — authorize with the transactionToken the
 *      Niubiz checkout returns after the customer enters the card
 * Plus reverse_transaction to undo an authorization same-day.
 *
 * The security token is cached in-process and refreshed on demand —
 * tools other than get_security_token fetch it automatically.
 *
 * Tools (4):
 *   get_security_token    — fetch (and cache) the API bearer token
 *   create_session_token  — create a checkout session (amount + antifraud)
 *   authorize_transaction — authorize a purchase with a transactionToken
 *   reverse_transaction   — reverse (void) an authorization
 *
 * APIs
 *   Production: https://apiprod.vnforapps.com
 *   Sandbox:    https://apisandbox.vnforappstest.com
 *
 * Environment
 *   NIUBIZ_USER        — API user (required)
 *   NIUBIZ_PASSWORD    — API password (required)
 *   NIUBIZ_MERCHANT_ID — merchant id / código de comercio (required)
 *   NIUBIZ_ENV         — "sandbox" | "production" (default: "sandbox")
 *
 * Docs: https://desarrolladores.niubiz.com.pe
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const USER = process.env.NIUBIZ_USER || "";
const PASSWORD = process.env.NIUBIZ_PASSWORD || "";
const MERCHANT_ID = process.env.NIUBIZ_MERCHANT_ID || "";
const ENV = (process.env.NIUBIZ_ENV || "sandbox").toLowerCase();

const BASE_URL = process.env.NIUBIZ_BASE_URL || (ENV === "production"
  ? "https://apiprod.vnforapps.com"
  : "https://apisandbox.vnforappstest.com");

/** Security tokens are valid for a limited window; cache and reuse,
 *  refetch when older than 20 minutes. */
let cachedToken: { value: string; fetchedAt: number } | null = null;
const TOKEN_TTL_MS = 20 * 60 * 1000;

async function getSecurityToken(force = false): Promise<string> {
  if (!force && cachedToken && Date.now() - cachedToken.fetchedAt < TOKEN_TTL_MS) {
    return cachedToken.value;
  }
  const res = await fetch(`${BASE_URL}/api.security/v1/security`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString("base64")}`,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Niubiz security API ${res.status}: ${text}`);
  }
  // The endpoint returns the token as a plain string body.
  const token = text.trim().replace(/^"|"$/g, "");
  cachedToken = { value: token, fetchedAt: Date.now() };
  return token;
}

async function niubizRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const token = await getSecurityToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Niubiz API ${res.status}: ${text}`);
  }
  if (!text) return { ok: true };
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new Server(
  { name: "mcp-niubiz", version: "0.1.0" },
  { capabilities: { tools: {} }, instructions: MANAGED_TIER_HINT },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_security_token",
      description:
        "Fetch the Niubiz API bearer token (POST /api.security/v1/security, Basic auth). Other tools fetch and cache this automatically — call it explicitly only to verify credentials or force a refresh.",
      inputSchema: {
        type: "object",
        properties: {
          force: { type: "boolean", description: "Force a fresh token even if one is cached" },
        },
      },
    },
    {
      name: "create_session_token",
      description:
        "Create a checkout session (POST /api.ecommerce/v2/ecommerce/token/session/{merchantId}). Returns the sessionKey the Niubiz checkout form needs. Send the purchase amount and the customer's IP for antifraud scoring.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Purchase amount (e.g. 100.00)" },
          channel: { type: "string", description: "Sales channel: web (default) | mobile" },
          clientIp: { type: "string", description: "Customer IP address (antifraud)" },
          merchantDefineData: { type: "object", description: "Optional MDD antifraud fields (MDD4 email, MDD21 frequent-flyer, etc.)" },
        },
        required: ["amount", "clientIp"],
      },
    },
    {
      name: "authorize_transaction",
      description:
        "Authorize a purchase (POST /api.authorization/v3/authorization/ecommerce/{merchantId}). Pass the transactionToken the Niubiz checkout form returned after the customer entered the card, plus your purchaseNumber and the amount.",
      inputSchema: {
        type: "object",
        properties: {
          transactionToken: { type: "string", description: "tokenId returned by the Niubiz checkout form" },
          purchaseNumber: { type: "string", description: "Your unique purchase number (numeric string, max 12 digits)" },
          amount: { type: "number", description: "Amount to authorize (must match the session)" },
          currency: { type: "string", description: "PEN (default) or USD" },
          channel: { type: "string", description: "Sales channel: web (default) | mobile" },
          captureType: { type: "string", description: "manual | automatic (default automatic)" },
          countable: { type: "boolean", description: "true = sale (capture), false = preauth only" },
        },
        required: ["transactionToken", "purchaseNumber", "amount"],
      },
    },
    {
      name: "reverse_transaction",
      description:
        "Reverse (void) an authorization (POST /api.authorization/v3/reverse/ecommerce/{merchantId}). Same-day undo of an authorized transaction by transactionId or purchaseNumber.",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string", description: "Niubiz transaction id to reverse" },
          purchaseNumber: { type: "string", description: "Your purchase number (alternative reference)" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "get_security_token": {
        const token = await getSecurityToken(Boolean(args?.force));
        return {
          content: [
            { type: "text", text: JSON.stringify({ token, cached_until: new Date((cachedToken?.fetchedAt ?? 0) + TOKEN_TTL_MS).toISOString() }, null, 2) },
          ],
        };
      }
      case "create_session_token": {
        const body = {
          channel: args?.channel ?? "web",
          amount: args?.amount,
          antifraud: {
            clientIp: args?.clientIp,
            merchantDefineData: args?.merchantDefineData ?? {},
          },
        };
        const path = `/api.ecommerce/v2/ecommerce/token/session/${MERCHANT_ID}`;
        return {
          content: [
            { type: "text", text: JSON.stringify(await niubizRequest("POST", path, body), null, 2) },
          ],
        };
      }
      case "authorize_transaction": {
        const body = {
          channel: args?.channel ?? "web",
          captureType: args?.captureType ?? "manual",
          countable: args?.countable ?? true,
          order: {
            tokenId: args?.transactionToken,
            purchaseNumber: args?.purchaseNumber,
            amount: args?.amount,
            currency: args?.currency ?? "PEN",
          },
        };
        const path = `/api.authorization/v3/authorization/ecommerce/${MERCHANT_ID}`;
        return {
          content: [
            { type: "text", text: JSON.stringify(await niubizRequest("POST", path, body), null, 2) },
          ],
        };
      }
      case "reverse_transaction": {
        const body = {
          order: {
            transactionId: args?.transactionId,
            purchaseNumber: args?.purchaseNumber,
          },
        };
        const path = `/api.authorization/v3/reverse/ecommerce/${MERCHANT_ID}`;
        return {
          content: [
            { type: "text", text: JSON.stringify(await niubizRequest("POST", path, body), null, 2) },
          ],
        };
      }
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
        const s = new Server({ name: "mcp-niubiz", version: "0.1.0" }, { capabilities: { tools: {} } });
        (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v));
        (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v));
        await s.connect(t);
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
