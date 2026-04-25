#!/usr/bin/env node

/**
 * MCP Server for Coinbase Commerce — global crypto merchant payments.
 *
 * Coinbase Commerce is the merchant-accept side of crypto: a store creates a
 * charge (or hosted checkout / invoice) priced in local fiat, the buyer pays
 * in BTC / ETH / USDC / etc., and Coinbase settles to the merchant in the
 * chosen crypto or fiat. This complements rather than overlaps the rest of
 * the CodeSpar crypto catalog:
 *   - UnblockPay   — BRL/MXN <-> USDC corridor for agents moving value
 *   - MoonPay      — end-user fiat <-> crypto on/off-ramp (100+ assets)
 *   - Transak      — end-user on/off-ramp (broad geo)
 *   - Coinbase     — merchants ACCEPT crypto from buyers at checkout
 *                    Commerce    (this package)
 *
 * Tools (18):
 *   create_charge              — create a crypto charge (merchant invoice)
 *   retrieve_charge            — look up a charge by id or short code
 *   list_charges               — list charges (paginated)
 *   cancel_charge              — cancel a no-longer-needed charge (before payment)
 *   resolve_charge             — manually mark a charge as paid
 *   create_checkout            — create a reusable hosted checkout (product page)
 *   retrieve_checkout          — look up a checkout by id
 *   list_checkouts             — list checkouts (paginated)
 *   update_checkout            — update an existing checkout's name/description/price/fields
 *   delete_checkout            — delete a checkout
 *   list_events                — list webhook-like events (charge:* lifecycle)
 *   retrieve_event             — retrieve a single event by id (webhook audit)
 *   create_invoice             — create an invoice for a known recipient
 *   retrieve_invoice           — retrieve an invoice by code
 *   list_invoices              — list invoices (paginated)
 *   void_invoice               — void an unpaid invoice
 *   list_exchange_rates        — current Coinbase exchange rates (BTC, ETH, USDC, ...)
 *   verify_webhook_signature   — local HMAC-SHA256 verifier for X-CC-Webhook-Signature
 *
 * Authentication
 *   Most requests carry two headers:
 *     X-CC-Api-Key: <COINBASE_COMMERCE_API_KEY>
 *     X-CC-Version: 2018-03-22   (version header is required)
 *   The exchange-rates endpoint is public and does not require the API key.
 *   verify_webhook_signature runs locally and uses COINBASE_COMMERCE_WEBHOOK_SECRET.
 *
 * Environment
 *   COINBASE_COMMERCE_API_KEY        — API key (required for merchant tools, secret)
 *   COINBASE_COMMERCE_API_VERSION    — optional; defaults to 2018-03-22
 *   COINBASE_COMMERCE_WEBHOOK_SECRET — optional; needed only for verify_webhook_signature
 *
 * Docs: https://docs.cdp.coinbase.com/commerce-onchain  (base: https://api.commerce.coinbase.com)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createHmac, timingSafeEqual } from "node:crypto";

const API_KEY = process.env.COINBASE_COMMERCE_API_KEY || "";
const API_VERSION = process.env.COINBASE_COMMERCE_API_VERSION || "2018-03-22";
const WEBHOOK_SECRET = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET || "";
const BASE_URL = "https://api.commerce.coinbase.com";

async function coinbaseRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CC-Api-Key": API_KEY,
      "X-CC-Version": API_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Coinbase Commerce API ${res.status}: ${err}`);
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

function verifyWebhook(rawBody: string, signature: string, secret: string): boolean {
  if (!rawBody || !signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const server = new Server(
  { name: "mcp-coinbase-commerce", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_charge",
      description: "Create a crypto charge — a one-time merchant invoice priced in local fiat that a buyer can settle in BTC, ETH, USDC, and other supported assets. Returns a hosted_url the buyer can be redirected to, plus per-asset payment addresses.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short product/order name shown on the hosted payment page" },
          description: { type: "string", description: "Longer human-readable description of what the buyer is paying for" },
          pricing_type: { type: "string", enum: ["fixed_price", "no_price"], description: "fixed_price: exact amount in local_price. no_price: buyer chooses (donations)." },
          local_price: {
            type: "object",
            description: "Fiat-denominated price the charge is quoted in. Required when pricing_type is fixed_price.",
            properties: {
              amount: { type: "string", description: "Amount as a decimal string (e.g. \"29.90\")" },
              currency: { type: "string", description: "ISO-4217 fiat currency code (e.g. USD, BRL, EUR, MXN)" },
            },
            required: ["amount", "currency"],
          },
          metadata: { type: "object", description: "Arbitrary JSON you want echoed back on events (customer_id, order_id, etc.)" },
          redirect_url: { type: "string", description: "Browser redirect after a successful payment" },
          cancel_url: { type: "string", description: "Browser redirect if the buyer abandons the hosted page" },
        },
        required: ["name", "description", "pricing_type"],
      },
    },
    {
      name: "retrieve_charge",
      description: "Retrieve a charge by its Coinbase Commerce id OR its short code (the 8-character code embedded in the hosted URL). Returns current status, timeline, and payments.",
      inputSchema: {
        type: "object",
        properties: {
          code_or_id: { type: "string", description: "Charge id or short code" },
        },
        required: ["code_or_id"],
      },
    },
    {
      name: "list_charges",
      description: "List charges, newest first. Supports cursor pagination via starting_after / ending_before.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results per page (default 25, max 100)" },
          starting_after: { type: "string", description: "Cursor: return results after this charge id" },
          ending_before: { type: "string", description: "Cursor: return results before this charge id" },
          order: { type: "string", enum: ["asc", "desc"], description: "Sort order by created_at. Defaults to desc." },
        },
      },
    },
    {
      name: "cancel_charge",
      description: "Cancel a charge that has not yet been paid. Only charges in NEW status can be cancelled; once pending or completed the call will fail.",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Charge short code" },
        },
        required: ["code"],
      },
    },
    {
      name: "resolve_charge",
      description: "Manually resolve a charge as paid. Used for out-of-band settlement (e.g. underpayment you accept, delayed confirmation you want to honour).",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Charge short code" },
        },
        required: ["code"],
      },
    },
    {
      name: "create_checkout",
      description: "Create a reusable hosted checkout — think product-page-style link that can be paid multiple times. Good for evergreen SKUs and donation pages.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Product / checkout name" },
          description: { type: "string", description: "Longer description shown to buyers" },
          pricing_type: { type: "string", enum: ["fixed_price", "no_price"], description: "fixed_price: exact amount in local_price. no_price: buyer chooses." },
          local_price: {
            type: "object",
            description: "Fiat-denominated price. Required when pricing_type is fixed_price.",
            properties: {
              amount: { type: "string", description: "Amount as decimal string" },
              currency: { type: "string", description: "ISO-4217 fiat currency code" },
            },
            required: ["amount", "currency"],
          },
          requested_info: {
            type: "array",
            description: "Buyer fields Coinbase should collect on the hosted page (e.g. [\"name\", \"email\"])",
            items: { type: "string" },
          },
        },
        required: ["name", "description", "pricing_type"],
      },
    },
    {
      name: "retrieve_checkout",
      description: "Retrieve a checkout by id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Checkout id" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_checkouts",
      description: "List reusable hosted checkouts, newest first. Cursor pagination via starting_after / ending_before.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results per page (default 25, max 100)" },
          starting_after: { type: "string", description: "Cursor: return results after this checkout id" },
          ending_before: { type: "string", description: "Cursor: return results before this checkout id" },
          order: { type: "string", enum: ["asc", "desc"], description: "Sort order by created_at. Defaults to desc." },
        },
      },
    },
    {
      name: "update_checkout",
      description: "Update an existing reusable checkout. Supply only the fields you want to change (Coinbase replaces the supplied fields). Use to retitle a product, change the price, or adjust which buyer fields are collected.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Checkout id to update" },
          name: { type: "string", description: "New checkout / product name" },
          description: { type: "string", description: "New checkout description" },
          pricing_type: { type: "string", enum: ["fixed_price", "no_price"], description: "Update pricing model" },
          local_price: {
            type: "object",
            description: "New fiat-denominated price",
            properties: {
              amount: { type: "string", description: "Amount as decimal string" },
              currency: { type: "string", description: "ISO-4217 fiat currency code" },
            },
            required: ["amount", "currency"],
          },
          requested_info: {
            type: "array",
            description: "New list of buyer fields to collect",
            items: { type: "string" },
          },
        },
        required: ["id"],
      },
    },
    {
      name: "delete_checkout",
      description: "Delete a reusable checkout. The hosted URL stops accepting new payments. Existing charges spawned by the checkout are unaffected.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Checkout id to delete" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_events",
      description: "List events — the lifecycle signals (charge:created, charge:confirmed, charge:failed, charge:delayed, charge:pending, charge:resolved) that Coinbase Commerce also delivers via webhook. Useful for reconciliation and agent polling.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results per page (default 25, max 100)" },
          starting_after: { type: "string", description: "Cursor: return results after this event id" },
          ending_before: { type: "string", description: "Cursor: return results before this event id" },
          order: { type: "string", enum: ["asc", "desc"], description: "Sort order by created_at. Defaults to desc." },
        },
      },
    },
    {
      name: "retrieve_event",
      description: "Retrieve a single event by id. Useful when auditing a webhook delivery or replaying state — fetch the event Coinbase Commerce recorded server-side and compare against what your endpoint received.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Event id (the id field on a webhook payload)" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_invoice",
      description: "Create an invoice — a directed bill sent to a specific named recipient. Unlike a charge, an invoice captures who it was issued to and has its own draft / viewed / paid lifecycle.",
      inputSchema: {
        type: "object",
        properties: {
          business_name: { type: "string", description: "Your business name shown on the invoice" },
          customer_email: { type: "string", description: "Email of the invoice recipient" },
          customer_name: { type: "string", description: "Display name of the invoice recipient" },
          memo: { type: "string", description: "Free-form note to the recipient (appears on invoice)" },
          local_price: {
            type: "object",
            description: "Fiat-denominated amount the invoice is quoted in",
            properties: {
              amount: { type: "string", description: "Amount as decimal string" },
              currency: { type: "string", description: "ISO-4217 fiat currency code" },
            },
            required: ["amount", "currency"],
          },
        },
        required: ["business_name", "customer_email", "customer_name", "local_price"],
      },
    },
    {
      name: "retrieve_invoice",
      description: "Retrieve an invoice by code. Returns recipient details, status (DRAFT, OPEN, VIEWED, PAID, VOID), and the linked charge once payment begins.",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Invoice short code" },
        },
        required: ["code"],
      },
    },
    {
      name: "list_invoices",
      description: "List invoices, newest first. Cursor pagination via starting_after / ending_before.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results per page (default 25, max 100)" },
          starting_after: { type: "string", description: "Cursor: return results after this invoice id" },
          ending_before: { type: "string", description: "Cursor: return results before this invoice id" },
          order: { type: "string", enum: ["asc", "desc"], description: "Sort order by created_at. Defaults to desc." },
        },
      },
    },
    {
      name: "void_invoice",
      description: "Void an unpaid invoice. The recipient can no longer pay it. Already-paid invoices cannot be voided — refund out-of-band if needed.",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Invoice short code to void" },
        },
        required: ["code"],
      },
    },
    {
      name: "list_exchange_rates",
      description: "Fetch current Coinbase exchange rates for a base asset (e.g. BTC, ETH, USDC) against every supported fiat and crypto. Useful for quoting or reconciling fiat-equivalent amounts. This endpoint is public and does not require the API key.",
      inputSchema: {
        type: "object",
        properties: {
          currency: { type: "string", description: "Base currency code (e.g. BTC, ETH, USDC, USD). Defaults to USD." },
        },
      },
    },
    {
      name: "verify_webhook_signature",
      description: "Local helper — verify a Coinbase Commerce webhook payload using HMAC-SHA256. Pass the EXACT raw request body string (do not re-stringify the parsed JSON, byte-equivalence matters) and the X-CC-Webhook-Signature header value. The shared secret comes from COINBASE_COMMERCE_WEBHOOK_SECRET unless overridden. Returns { valid: boolean }.",
      inputSchema: {
        type: "object",
        properties: {
          raw_body: { type: "string", description: "Exact raw request body bytes as a string" },
          signature: { type: "string", description: "X-CC-Webhook-Signature header value (hex)" },
          secret: { type: "string", description: "Override webhook shared secret. Defaults to COINBASE_COMMERCE_WEBHOOK_SECRET env var." },
        },
        required: ["raw_body", "signature"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "create_charge":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("POST", "/charges", a), null, 2) }] };
      case "retrieve_charge":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", `/charges/${encodeURIComponent(String(a.code_or_id ?? ""))}`), null, 2) }] };
      case "list_charges": {
        const query = qs({
          limit: a.limit,
          starting_after: a.starting_after,
          ending_before: a.ending_before,
          order: a.order,
        });
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", `/charges${query}`), null, 2) }] };
      }
      case "cancel_charge":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("POST", `/charges/${encodeURIComponent(String(a.code ?? ""))}/cancel`), null, 2) }] };
      case "resolve_charge":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("POST", `/charges/${encodeURIComponent(String(a.code ?? ""))}/resolve`), null, 2) }] };
      case "create_checkout":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("POST", "/checkouts", a), null, 2) }] };
      case "retrieve_checkout":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", `/checkouts/${encodeURIComponent(String(a.id ?? ""))}`), null, 2) }] };
      case "list_checkouts": {
        const query = qs({
          limit: a.limit,
          starting_after: a.starting_after,
          ending_before: a.ending_before,
          order: a.order,
        });
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", `/checkouts${query}`), null, 2) }] };
      }
      case "update_checkout": {
        const { id, ...body } = a;
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("PUT", `/checkouts/${encodeURIComponent(String(id ?? ""))}`, body), null, 2) }] };
      }
      case "delete_checkout":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("DELETE", `/checkouts/${encodeURIComponent(String(a.id ?? ""))}`), null, 2) }] };
      case "list_events": {
        const query = qs({
          limit: a.limit,
          starting_after: a.starting_after,
          ending_before: a.ending_before,
          order: a.order,
        });
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", `/events${query}`), null, 2) }] };
      }
      case "retrieve_event":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", `/events/${encodeURIComponent(String(a.id ?? ""))}`), null, 2) }] };
      case "create_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("POST", "/invoices", a), null, 2) }] };
      case "retrieve_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", `/invoices/${encodeURIComponent(String(a.code ?? ""))}`), null, 2) }] };
      case "list_invoices": {
        const query = qs({
          limit: a.limit,
          starting_after: a.starting_after,
          ending_before: a.ending_before,
          order: a.order,
        });
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", `/invoices${query}`), null, 2) }] };
      }
      case "void_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("PUT", `/invoices/${encodeURIComponent(String(a.code ?? ""))}/void`), null, 2) }] };
      case "list_exchange_rates": {
        const query = qs({ currency: a.currency });
        return { content: [{ type: "text", text: JSON.stringify(await coinbaseRequest("GET", `/exchange-rates${query}`), null, 2) }] };
      }
      case "verify_webhook_signature": {
        const rawBody = String(a.raw_body ?? "");
        const signature = String(a.signature ?? "");
        const secret = String(a.secret ?? WEBHOOK_SECRET ?? "");
        if (!secret) {
          return { content: [{ type: "text", text: "Error: webhook secret missing — set COINBASE_COMMERCE_WEBHOOK_SECRET or pass `secret`." }], isError: true };
        }
        const valid = verifyWebhook(rawBody, signature, secret);
        return { content: [{ type: "text", text: JSON.stringify({ valid }, null, 2) }] };
      }
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
        const s = new Server({ name: "mcp-coinbase-commerce", version: "0.2.1" }, { capabilities: { tools: {} } });
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
