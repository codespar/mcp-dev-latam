#!/usr/bin/env node

/**
 * MCP Server for Bold — Colombian acquirer (bold.co).
 *
 * Bold is a Colombian payments company (cards, PSE, Nequi, Botón
 * Bancolombia) known for its clean, modern REST integration surface.
 * The public integrations API is link-first: you create a payment
 * link (open or closed amount), hand the URL to the payer, and poll
 * the link for its payment status. The checkout button flow is
 * secured with a SHA-256 integrity signature; webhooks are signed
 * with an HMAC over the raw body.
 *
 * Tools (7):
 *   create_payment_link       — create a payment link (POST /online/link/v1)
 *   create_pse_payment_link   — convenience: link restricted to PSE
 *   create_card_payment_link  — convenience: link restricted to cards
 *   get_payment_link          — query a link's status (GET /online/link/v1/{id})
 *   list_payment_methods      — available methods (GET /online/link/v1/payment_methods)
 *   generate_checkout_signature — SHA-256 integrity hash for the checkout button (local)
 *   validate_webhook_signature  — verify the HMAC signature of a Bold webhook (local)
 *
 * API
 *   Base URL: https://integrations.api.bold.co
 *   Auth:     Authorization: x-api-key <identity key>
 *
 * Environment
 *   BOLD_API_KEY     — identity (llave de identidad) API key (required)
 *   BOLD_SECRET_KEY  — secret key, used only for local signature tools (optional)
 *
 * Bold has no separate sandbox host — test mode is driven by test keys.
 *
 * Docs: https://developers.bold.co
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const API_KEY = process.env.BOLD_API_KEY || "";
const SECRET_KEY = process.env.BOLD_SECRET_KEY || "";
const BASE_URL = process.env.BOLD_BASE_URL || "https://integrations.api.bold.co";

async function boldRequest(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `x-api-key ${API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Bold API ${res.status}: ${err}`);
  }
  const text = await res.text();
  if (!text) return { ok: true };
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/** Build the payment-link creation body shared by the three create_* tools. */
function linkBody(args: Record<string, unknown> | undefined, methods?: string[]) {
  const body: Record<string, unknown> = {
    amount_type: args?.amount_type ?? "CLOSE",
    description: args?.description,
  };
  if (args?.amount_type !== "OPEN") {
    body.amount = {
      currency: (args?.currency as string) ?? "COP",
      total_amount: args?.total_amount,
      tip_amount: args?.tip_amount ?? 0,
    };
  }
  if (methods ?? args?.payment_methods) body.payment_methods = methods ?? args?.payment_methods;
  if (args?.expiration_date !== undefined) body.expiration_date = args.expiration_date;
  if (args?.callback_url !== undefined) body.callback_url = args.callback_url;
  if (args?.payer_email !== undefined) body.payer_email = args.payer_email;
  return body;
}

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new Server(
  { name: "mcp-bold-co", version: "0.1.0" },
  { capabilities: { tools: {} }, instructions: MANAGED_TIER_HINT },
);

const LINK_CREATE_PROPS = {
  amount_type: {
    type: "string",
    description: "CLOSE for a fixed amount (default), OPEN lets the payer type the amount",
    enum: ["CLOSE", "OPEN"],
  },
  total_amount: { type: "number", description: "Total amount in COP (required when amount_type=CLOSE)" },
  tip_amount: { type: "number", description: "Tip portion of the amount (default 0)" },
  currency: { type: "string", description: "Currency code (default COP)" },
  description: { type: "string", description: "What the payer sees on the checkout page" },
  expiration_date: {
    type: "number",
    description: "Link expiry as a Unix timestamp in NANOSECONDS (Bold convention). Omit for no expiry.",
  },
  callback_url: { type: "string", description: "URL the payer is redirected to after paying" },
  payer_email: { type: "string", description: "Prefill the payer's email on the checkout page" },
} as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_payment_link",
      description:
        "Create a Bold payment link (POST /online/link/v1). Returns payload.payment_link (LNK_ id) and payload.url to hand to the payer. Supports cards, PSE, Nequi and Botón Bancolombia; restrict with payment_methods.",
      inputSchema: {
        type: "object",
        properties: {
          ...LINK_CREATE_PROPS,
          payment_methods: {
            type: "array",
            items: { type: "string" },
            description:
              "Restrict accepted methods, e.g. [\"CREDIT_CARD\", \"PSE\", \"NEQUI\", \"BOTON_BANCOLOMBIA\"]. Omit to accept every method enabled on the merchant.",
          },
        },
        required: ["description"],
      },
    },
    {
      name: "create_pse_payment_link",
      description:
        "Convenience wrapper: create a Bold payment link restricted to PSE bank debit (payment_methods=[\"PSE\"]).",
      inputSchema: {
        type: "object",
        properties: { ...LINK_CREATE_PROPS },
        required: ["description", "total_amount"],
      },
    },
    {
      name: "create_card_payment_link",
      description:
        "Convenience wrapper: create a Bold payment link restricted to cards (payment_methods=[\"CREDIT_CARD\"]).",
      inputSchema: {
        type: "object",
        properties: { ...LINK_CREATE_PROPS },
        required: ["description", "total_amount"],
      },
    },
    {
      name: "get_payment_link",
      description:
        "Query a Bold payment link by id (GET /online/link/v1/{payment_link}). Returns status (ACTIVE, PROCESSING, PAID, REJECTED, EXPIRED), amount, and transaction data once paid.",
      inputSchema: {
        type: "object",
        properties: {
          payment_link: { type: "string", description: "Payment link id, e.g. LNK_XXXXXXXXXX" },
        },
        required: ["payment_link"],
      },
    },
    {
      name: "list_payment_methods",
      description:
        "List the payment methods enabled for this merchant (GET /online/link/v1/payment_methods).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "generate_checkout_signature",
      description:
        "Generate the SHA-256 integrity signature Bold's embedded checkout button requires: sha256(orderId + amount + currency + secretKey). Runs locally; requires BOLD_SECRET_KEY.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Merchant order id used in the checkout button" },
          amount: { type: "string", description: "Amount exactly as passed to the button (string, no separators)" },
          currency: { type: "string", description: "Currency code, e.g. COP" },
        },
        required: ["order_id", "amount", "currency"],
      },
    },
    {
      name: "validate_webhook_signature",
      description:
        "Verify the HMAC-SHA256 signature of a Bold webhook notification against BOLD_SECRET_KEY. Pass the raw request body string and the signature header value. Accepts hex or base64 encodings. Runs locally.",
      inputSchema: {
        type: "object",
        properties: {
          raw_body: { type: "string", description: "Raw webhook request body, exactly as received" },
          signature: { type: "string", description: "Signature header value sent by Bold" },
        },
        required: ["raw_body", "signature"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "create_payment_link": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await boldRequest("POST", "/online/link/v1", linkBody(args)), null, 2) },
          ],
        };
      }
      case "create_pse_payment_link": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await boldRequest("POST", "/online/link/v1", linkBody(args, ["PSE"])), null, 2) },
          ],
        };
      }
      case "create_card_payment_link": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await boldRequest("POST", "/online/link/v1", linkBody(args, ["CREDIT_CARD"])), null, 2) },
          ],
        };
      }
      case "get_payment_link": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await boldRequest("GET", `/online/link/v1/${args?.payment_link}`), null, 2) },
          ],
        };
      }
      case "list_payment_methods": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await boldRequest("GET", "/online/link/v1/payment_methods"), null, 2) },
          ],
        };
      }
      case "generate_checkout_signature": {
        if (!SECRET_KEY) throw new Error("BOLD_SECRET_KEY is required for signature generation");
        const hash = createHash("sha256")
          .update(`${args?.order_id}${args?.amount}${args?.currency}${SECRET_KEY}`)
          .digest("hex");
        return {
          content: [{ type: "text", text: JSON.stringify({ integrity_signature: hash }, null, 2) }],
        };
      }
      case "validate_webhook_signature": {
        if (!SECRET_KEY) throw new Error("BOLD_SECRET_KEY is required for webhook validation");
        const raw = String(args?.raw_body ?? "");
        const provided = String(args?.signature ?? "");
        const mac = createHmac("sha256", SECRET_KEY).update(raw);
        const macCopy = createHmac("sha256", SECRET_KEY).update(raw);
        const hex = mac.digest("hex");
        const b64 = macCopy.digest("base64");
        const safeEq = (a: string, b: string) => {
          const ab = Buffer.from(a);
          const bb = Buffer.from(b);
          return ab.length === bb.length && timingSafeEqual(ab, bb);
        };
        const valid = safeEq(provided, hex) || safeEq(provided, b64);
        return {
          content: [{ type: "text", text: JSON.stringify({ valid }, null, 2) }],
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
        const s = new Server({ name: "mcp-bold-co", version: "0.1.0" }, { capabilities: { tools: {} } });
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
