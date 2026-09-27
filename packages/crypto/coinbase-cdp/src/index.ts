#!/usr/bin/env node

/**
 * MCP Server for Coinbase Developer Platform (CDP) — single package covering
 * three CDP product surfaces under one key: Trading, Wallets, and Payments.
 *
 * Positioning vs the rest of the catalog:
 *   - @codespar/mcp-coinbase            — Advanced Trade exchange (legacy HMAC keys)
 *   - @codespar/mcp-coinbase-commerce   — merchant gateway (X-CC-Api-Key)
 *   - @codespar/mcp-coinbase-cdp        — Developer Platform (this package, ES256 JWT)
 *
 * Tools (15):
 *   Trading (4):
 *     list_quotes, create_swap, get_swap, cancel_swap
 *   Wallets (7):
 *     create_wallet, list_wallets, get_wallet, list_balances, transfer,
 *     get_transaction, list_transactions
 *   Payments (4):
 *     create_payment, list_payments, get_payment, cancel_payment
 *
 * Authentication
 *   Every request carries a fresh ES256 JWT in the Authorization header:
 *     Authorization: Bearer <jwt>
 *   Claims:
 *     sub  = COINBASE_CDP_KEY_NAME (organizations/<org>/apiKeys/<id>)
 *     iss  = "cdp"
 *     aud  = ["cdp_service"]
 *     nbf  = now
 *     exp  = now + 120
 *     uri  = "<METHOD> api.cdp.coinbase.com<path>"   (path includes query string)
 *   Header:
 *     alg  = "ES256"
 *     typ  = "JWT"
 *     kid  = COINBASE_CDP_KEY_NAME
 *     nonce = random 16-byte hex (per request)
 *
 * Environment
 *   COINBASE_CDP_KEY_NAME    — CDP key id (organizations/<org>/apiKeys/<id>)
 *   COINBASE_CDP_PRIVATE_KEY — PEM-encoded ECDSA P-256 private key
 *                              (copied from https://portal.cdp.coinbase.com at mint time)
 *
 * Docs: https://docs.cdp.coinbase.com  (base: https://api.cdp.coinbase.com)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { randomBytes } from "node:crypto";
import { SignJWT, importPKCS8, type KeyLike } from "jose";

const KEY_NAME = process.env.COINBASE_CDP_KEY_NAME || "";
const PRIVATE_KEY_PEM = process.env.COINBASE_CDP_PRIVATE_KEY || "";
const BASE_URL = process.env.COINBASE_CDP_BASE_URL || "https://api.cdp.coinbase.com";
const HOST = "api.cdp.coinbase.com";

if (!KEY_NAME || !PRIVATE_KEY_PEM) {
  throw new Error(
    "Coinbase CDP env vars missing — set COINBASE_CDP_KEY_NAME and COINBASE_CDP_PRIVATE_KEY (mint at https://portal.cdp.coinbase.com).",
  );
}

let cachedKey: KeyLike | null = null;
async function getSigningKey(): Promise<KeyLike> {
  if (cachedKey) return cachedKey;
  cachedKey = (await importPKCS8(PRIVATE_KEY_PEM, "ES256")) as KeyLike;
  return cachedKey;
}

async function mintJwt(method: string, pathWithQuery: string): Promise<string> {
  const key = await getSigningKey();
  const now = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  return await new SignJWT({
    sub: KEY_NAME,
    iss: "cdp",
    aud: ["cdp_service"],
    uri: `${method.toUpperCase()} ${HOST}${pathWithQuery}`,
  })
    .setProtectedHeader({ alg: "ES256", typ: "JWT", kid: KEY_NAME, nonce })
    .setNotBefore(now)
    .setExpirationTime(now + 120)
    .sign(key);
}

async function cdpRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const upper = method.toUpperCase();
  const jwt = await mintJwt(upper, path);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: upper,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Coinbase CDP API ${res.status}: ${err}`);
  }
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function qs(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  const search = new URLSearchParams();
  for (const [k, v] of entries) search.set(k, String(v));
  return `?${search.toString()}`;
}

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new Server(
  { name: "mcp-coinbase-cdp", version: "0.1.0" },
  { capabilities: { tools: {} }, instructions: MANAGED_TIER_HINT },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ─── Trading (4) ──────────────────────────────────────────────────────
    {
      name: "list_quotes",
      description: "List recent swap quotes minted under the authenticated CDP account. Endpoint set provisional, expand once docs stabilize.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "integer", default: 50, description: "Page size" },
          cursor: { type: "string", description: "Pagination cursor from a previous response" },
        },
      },
    },
    {
      name: "create_swap",
      description: "Create an onchain swap between two assets. Endpoint set provisional, expand once docs stabilize.",
      inputSchema: {
        type: "object",
        required: ["from_asset", "to_asset", "amount"],
        properties: {
          from_asset: { type: "string", description: "Asset symbol or contract address being sold (e.g. ETH, USDC)" },
          to_asset: { type: "string", description: "Asset symbol or contract address being bought" },
          amount: { type: "string", description: "Amount of from_asset to swap, in the asset's smallest unit (string to preserve precision)" },
          slippage_bps: { type: "integer", description: "Maximum acceptable slippage in basis points" },
          wallet_id: { type: "string", description: "CDP wallet id sourcing the swap" },
        },
      },
    },
    {
      name: "get_swap",
      description: "Get a single swap by id — full status, executed amounts, gas, and tx hash. Endpoint set provisional, expand once docs stabilize.",
      inputSchema: {
        type: "object",
        required: ["swap_id"],
        properties: {
          swap_id: { type: "string", description: "Swap id returned by create_swap" },
        },
      },
    },
    {
      name: "cancel_swap",
      description: "Cancel a pending swap before it lands onchain. Endpoint set provisional, expand once docs stabilize.",
      inputSchema: {
        type: "object",
        required: ["swap_id"],
        properties: {
          swap_id: { type: "string", description: "Swap id to cancel" },
        },
      },
    },

    // ─── Wallets (7) ──────────────────────────────────────────────────────
    {
      name: "create_wallet",
      description: "Create a new wallet under the authenticated CDP account. Returns the wallet id, network, and default address. Endpoint set provisional.",
      inputSchema: {
        type: "object",
        properties: {
          network: { type: "string", description: "Network identifier (e.g. base-mainnet, ethereum-mainnet)" },
          wallet_type: { type: "string", enum: ["smart", "embedded", "mpc"], description: "Wallet primitive (smart contract / embedded EOA / MPC)" },
        },
      },
    },
    {
      name: "list_wallets",
      description: "List wallets under the authenticated CDP account. Cursor-paginated. Endpoint set provisional.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "integer", default: 100 },
          cursor: { type: "string", description: "Pagination cursor" },
        },
      },
    },
    {
      name: "get_wallet",
      description: "Get a single wallet by id — network, addresses, status. Endpoint set provisional.",
      inputSchema: {
        type: "object",
        required: ["wallet_id"],
        properties: {
          wallet_id: { type: "string", description: "Wallet id returned by create_wallet or list_wallets" },
        },
      },
    },
    {
      name: "list_balances",
      description: "List the asset balances for a wallet across all addresses + networks. Endpoint set provisional.",
      inputSchema: {
        type: "object",
        required: ["wallet_id"],
        properties: {
          wallet_id: { type: "string" },
          asset: { type: "string", description: "Optional asset filter (ETH, USDC, etc.)" },
        },
      },
    },
    {
      name: "transfer",
      description: "Send a transfer from a wallet to a destination address. Returns the tx hash + initial status. Endpoint set provisional.",
      inputSchema: {
        type: "object",
        required: ["wallet_id", "asset", "amount", "destination"],
        properties: {
          wallet_id: { type: "string" },
          asset: { type: "string", description: "Asset symbol or contract address" },
          amount: { type: "string", description: "Amount in the asset's smallest unit (string to preserve precision)" },
          destination: { type: "string", description: "Destination address (0x… for EVM)" },
          network: { type: "string", description: "Network identifier (e.g. base-mainnet)" },
        },
      },
    },
    {
      name: "get_transaction",
      description: "Get a single transaction by id — full status, gas used, block number. Endpoint set provisional.",
      inputSchema: {
        type: "object",
        required: ["wallet_id", "transaction_id"],
        properties: {
          wallet_id: { type: "string" },
          transaction_id: { type: "string" },
        },
      },
    },
    {
      name: "list_transactions",
      description: "List historical transactions for a wallet. Filter by asset + status + time range. Cursor-paginated. Endpoint set provisional.",
      inputSchema: {
        type: "object",
        required: ["wallet_id"],
        properties: {
          wallet_id: { type: "string" },
          asset: { type: "string" },
          status: { type: "string", enum: ["pending", "submitted", "confirmed", "failed"] },
          limit: { type: "integer", default: 100 },
          cursor: { type: "string" },
        },
      },
    },

    // ─── Payments (4) ─────────────────────────────────────────────────────
    {
      name: "create_payment",
      description: "Create an onchain payment (outbound transfer to a payee). Returns the payment id and initial status. Endpoint set provisional.",
      inputSchema: {
        type: "object",
        required: ["asset", "amount", "destination"],
        properties: {
          asset: { type: "string", description: "Asset symbol or contract address (USDC, ETH, etc.)" },
          amount: { type: "string", description: "Amount in the asset's smallest unit (string to preserve precision)" },
          destination: { type: "string", description: "Payee address (0x… for EVM) or CDP user identifier" },
          network: { type: "string", description: "Network identifier (e.g. base-mainnet)" },
          memo: { type: "string", description: "Optional human-readable memo attached to the payment" },
          idempotency_key: { type: "string", description: "Caller-supplied idempotency key (UUID v4 recommended) so retries don't double-pay" },
        },
      },
    },
    {
      name: "list_payments",
      description: "List historical payments under the authenticated CDP account. Cursor-paginated. Endpoint set provisional.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "submitted", "confirmed", "failed"] },
          asset: { type: "string" },
          start_date: { type: "string", description: "ISO 8601 timestamp" },
          end_date: { type: "string", description: "ISO 8601 timestamp" },
          limit: { type: "integer", default: 100 },
          cursor: { type: "string" },
        },
      },
    },
    {
      name: "get_payment",
      description: "Get a single payment by id — full status, tx hash, gas. Endpoint set provisional.",
      inputSchema: {
        type: "object",
        required: ["payment_id"],
        properties: {
          payment_id: { type: "string", description: "Payment id returned by create_payment" },
        },
      },
    },
    {
      name: "cancel_payment",
      description: "Cancel a pending payment before it lands onchain. Endpoint set provisional.",
      inputSchema: {
        type: "object",
        required: ["payment_id"],
        properties: {
          payment_id: { type: "string" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      // ─── Trading ──────────────────────────────────────────────────────
      case "list_quotes": {
        const query = qs({ limit: a.limit, cursor: a.cursor });
        return { content: [{ type: "text", text: JSON.stringify(await cdpRequest("GET", `/v2/trading/quotes${query}`), null, 2) }] };
      }
      case "create_swap":
        return { content: [{ type: "text", text: JSON.stringify(await cdpRequest("POST", "/v2/trading/swaps", a), null, 2) }] };
      case "get_swap":
        return { content: [{ type: "text", text: JSON.stringify(await cdpRequest("GET", `/v2/trading/swaps/${encodeURIComponent(String(a.swap_id ?? ""))}`), null, 2) }] };
      case "cancel_swap":
        return { content: [{ type: "text", text: JSON.stringify(await cdpRequest("POST", `/v2/trading/swaps/${encodeURIComponent(String(a.swap_id ?? ""))}/cancel`), null, 2) }] };

      // ─── Wallets ──────────────────────────────────────────────────────
      case "create_wallet":
        return { content: [{ type: "text", text: JSON.stringify(await cdpRequest("POST", "/v2/wallets", a), null, 2) }] };
      case "list_wallets": {
        const query = qs({ limit: a.limit, cursor: a.cursor });
        return { content: [{ type: "text", text: JSON.stringify(await cdpRequest("GET", `/v2/wallets${query}`), null, 2) }] };
      }
      case "get_wallet":
        return { content: [{ type: "text", text: JSON.stringify(await cdpRequest("GET", `/v2/wallets/${encodeURIComponent(String(a.wallet_id ?? ""))}`), null, 2) }] };
      case "list_balances": {
        const { wallet_id, ...rest } = a;
        const query = qs(rest);
        return { content: [{ type: "text", text: JSON.stringify(await cdpRequest("GET", `/v2/wallets/${encodeURIComponent(String(wallet_id ?? ""))}/balances${query}`), null, 2) }] };
      }
      case "transfer": {
        const { wallet_id, ...body } = a;
        return { content: [{ type: "text", text: JSON.stringify(await cdpRequest("POST", `/v2/wallets/${encodeURIComponent(String(wallet_id ?? ""))}/transfers`, body), null, 2) }] };
      }
      case "get_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await cdpRequest("GET", `/v2/wallets/${encodeURIComponent(String(a.wallet_id ?? ""))}/transactions/${encodeURIComponent(String(a.transaction_id ?? ""))}`), null, 2) }] };
      case "list_transactions": {
        const { wallet_id, ...rest } = a;
        const query = qs(rest);
        return { content: [{ type: "text", text: JSON.stringify(await cdpRequest("GET", `/v2/wallets/${encodeURIComponent(String(wallet_id ?? ""))}/transactions${query}`), null, 2) }] };
      }

      // ─── Payments ─────────────────────────────────────────────────────
      case "create_payment":
        return { content: [{ type: "text", text: JSON.stringify(await cdpRequest("POST", "/v2/payments", a), null, 2) }] };
      case "list_payments": {
        const query = qs(a);
        return { content: [{ type: "text", text: JSON.stringify(await cdpRequest("GET", `/v2/payments${query}`), null, 2) }] };
      }
      case "get_payment":
        return { content: [{ type: "text", text: JSON.stringify(await cdpRequest("GET", `/v2/payments/${encodeURIComponent(String(a.payment_id ?? ""))}`), null, 2) }] };
      case "cancel_payment":
        return { content: [{ type: "text", text: JSON.stringify(await cdpRequest("POST", `/v2/payments/${encodeURIComponent(String(a.payment_id ?? ""))}/cancel`), null, 2) }] };

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
    app.get("/health", (_req: unknown, res: { json: (body: unknown) => unknown }) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: { headers: Record<string, string | string[] | undefined>; body: unknown }, res: { status: (code: number) => { json: (body: unknown) => unknown } }) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req as never, res as never, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-coinbase-cdp", version: "0.1.0" }, { capabilities: { tools: {} } });
        (server as unknown as { _requestHandlers: Map<unknown, unknown> })._requestHandlers.forEach((v, k) => (s as unknown as { _requestHandlers: Map<unknown, unknown> })._requestHandlers.set(k, v));
        (server as unknown as { _notificationHandlers?: Map<unknown, unknown> })._notificationHandlers?.forEach((v, k) => (s as unknown as { _notificationHandlers: Map<unknown, unknown> })._notificationHandlers.set(k, v));
        await s.connect(t);
        await t.handleRequest(req as never, res as never, req.body); return;
      }
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
    });
    app.get("/mcp", async (req: { headers: Record<string, string | string[] | undefined> }, res: { status: (code: number) => { send: (body: string) => unknown } }) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req as never, res as never); else res.status(400).send("Invalid session"); });
    app.delete("/mcp", async (req: { headers: Record<string, string | string[] | undefined> }, res: { status: (code: number) => { send: (body: string) => unknown } }) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req as never, res as never); else res.status(400).send("Invalid session"); });
    const port = Number(process.env.MCP_PORT) || 3000;
    app.listen(port, () => { console.error(`MCP HTTP server on http://localhost:${port}/mcp`); });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch(console.error);
