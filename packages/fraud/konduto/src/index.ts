#!/usr/bin/env node

/**
 * MCP Server for Konduto — Brazilian fraud prevention (API-first).
 *
 * Konduto is the second entry in the CodeSpar `fraud` category after ClearSale.
 * Its flow mirrors ClearSale conceptually — submit order, get fraud decision,
 * feed the merchant's final call back into the model — but the API surface is
 * tighter and more developer-oriented. Konduto's differentiator is behavioral
 * device intelligence: their browser SDK captures session signals (typing
 * cadence, navigation patterns, device identity) that are referenced on the
 * order via the `visitor` field, and the resulting order decision carries a
 * numeric score plus a recommendation (approve / decline / review).
 *
 * Positioning vs. ClearSale:
 *   ClearSale  — older, larger chargeback history db, ships manual review services
 *   Konduto    — smaller footprint, API-first, strongest on behavioral fingerprinting
 * BR merchants commonly run both in parallel for score comparison or failover.
 *
 * Tools (8):
 *   send_order_for_analysis   — submit an order; returns decision + score
 *   get_order                 — retrieve current decision + score for an order
 *   update_order_status       — feed the merchant's final status back to Konduto
 *   add_to_blocklist          — add email/phone/ip/name/bin_last4/zip/tax_id to blocklist
 *   query_blocklist           — check whether a value is on the blocklist
 *   remove_from_blocklist     — remove a value from the blocklist
 *   add_to_allowlist          — add a trusted value to the allowlist (auto-approve)
 *   add_to_reviewlist         — add a value to the reviewlist (force manual review)
 *
 * Authentication
 *   HTTP Basic. The API key is the username with an empty password:
 *     Authorization: Basic base64(KONDUTO_API_KEY + ":")
 *
 * Environment
 *   KONDUTO_API_KEY   — private API key (required, secret)
 *   KONDUTO_BASE_URL  — optional; defaults to https://api.konduto.com/v1
 *
 * Alpha note
 *   Shipped as 0.1.0-alpha.1. Order create (POST /orders) and the blocklist
 *   family (POST/GET/DELETE /blacklist/{type}) are verified against the public
 *   docs at docs.konduto.com. Order retrieve (GET /orders/{id}) and status
 *   update (PUT /orders/{id}) follow the standard REST pattern used by
 *   Konduto's official client libraries but are not separately indexed on the
 *   public reference. Card-only analyze, disputes, and the /visitors retrieval
 *   endpoint hypothesized in the category spec are NOT in the public docs and
 *   have been dropped from this release. If/when Konduto publishes them,
 *   promote to 0.2.0.
 *
 * Docs: https://docs.konduto.com
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.KONDUTO_API_KEY || "";
const BASE_URL = process.env.KONDUTO_BASE_URL || "https://api.konduto.com/v1";

async function kondutoRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const basic = Buffer.from(`${API_KEY}:`).toString("base64");
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${basic}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Konduto API ${res.status}: ${err}`);
  }
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const BLOCKLIST_TYPES = ["email", "phone", "ip", "name", "bin_last4", "zip", "tax_id"];

const server = new Server(
  { name: "mcp-konduto", version: "0.1.0-alpha.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_order_for_analysis",
      description: "Submit an order to Konduto for fraud analysis. Returns a decision (approved / declined / review / not_analyzed), a numeric score, and a recommendation. Include as much signal as possible — billing + shipping, ip, items, payment, and (crucially) the visitor id captured by Konduto's browser JS SDK — to maximize decision quality.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Merchant-side order id (must be unique and stable — used to correlate future GETs and status updates)" },
          total_amount: { type: "number", description: "Total order amount in major units (e.g. 199.90 BRL)" },
          shipping_amount: { type: "number", description: "Shipping charge in major units" },
          tax_amount: { type: "number", description: "Tax amount in major units" },
          currency: { type: "string", description: "ISO-4217 currency code (typically BRL)" },
          installments: { type: "number", description: "Number of installments for card payments (1 for lump sum)" },
          ip: { type: "string", description: "Buyer's IP at order time (IPv4 or IPv6)" },
          visitor: { type: "string", description: "Visitor id captured by Konduto's browser JS SDK. Strongly recommended — drives the behavioral / device intelligence signal." },
          analyze: { type: "boolean", description: "If false, Konduto stores the order without running the ML model. Default true." },
          recurring: { type: "boolean", description: "True for subscription / recurring orders" },
          sales_channel: { type: "string", description: "Sales channel identifier (e.g. ecommerce, mobile, marketplace)" },
          customer: {
            type: "object",
            description: "Customer object: id, name, email, tax_id (CPF/CNPJ), phone1, created_at, new_account, vip, etc.",
          },
          payment: {
            type: "array",
            description: "Array of payment methods. Each item: { type: 'credit', bin, last4, expiration_date, status } or { type: 'boleto' | 'pix' | 'debit' }.",
            items: { type: "object" },
          },
          billing: {
            type: "object",
            description: "Billing address: name, address1, address2, city, state, zip, country.",
          },
          shipping: {
            type: "object",
            description: "Shipping address: name, address1, address2, city, state, zip, country.",
          },
          shopping_cart: {
            type: "array",
            description: "Line items. Each: { sku, product_code, category, name, description, unit_cost, quantity, discount }.",
            items: { type: "object" },
          },
          travel: { type: "object", description: "Travel-specific fields (passenger, flights). Omit for non-travel orders." },
          hotel: { type: "object", description: "Hotel-specific fields. Omit for non-hotel orders." },
          event: { type: "object", description: "Event ticketing fields. Omit for non-event orders." },
        },
        required: ["id", "total_amount", "installments", "customer"],
      },
    },
    {
      name: "get_order",
      description: "Retrieve the current analysis state of an order. Returns decision (approved / declined / review / not_analyzed), numeric score, and recommendation. Useful when the initial response was 'review' or when polling after async re-scoring.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Merchant-side order id used in send_order_for_analysis" },
        },
        required: ["id"],
      },
    },
    {
      name: "update_order_status",
      description: "Notify Konduto of the merchant's final status for an order. Feeds Konduto's ML model and is required for ongoing decision quality. Common transitions: new → approved, new → declined, approved → canceled, approved → fraud (when a chargeback is confirmed).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Merchant-side order id" },
          status: {
            type: "string",
            enum: ["approved", "declined", "fraud", "canceled", "not_authorized", "new"],
            description: "Merchant's final status. Use 'fraud' for confirmed chargebacks — this is the primary feedback signal Konduto's model uses to tune future decisions on similar buyers.",
          },
          comments: { type: "string", description: "Optional free-text comments on the status change" },
        },
        required: ["id", "status"],
      },
    },
    {
      name: "add_to_blocklist",
      description: "Add a value to the Konduto blocklist. Any future order matching the value is auto-declined. Useful for known-bad emails, IPs, tax IDs, or card BIN+last4 pairs observed in confirmed fraud.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: BLOCKLIST_TYPES,
            description: "Blocklist dimension: email, phone, ip, name, bin_last4 (format 'BIN-LAST4', e.g. '555555-1234'), zip, or tax_id (CPF/CNPJ).",
          },
          value: { type: "string", description: "The value to block (e.g. 'fraud@example.com' for email, '555555-1234' for bin_last4)" },
        },
        required: ["type", "value"],
      },
    },
    {
      name: "query_blocklist",
      description: "Check whether a value is currently on the Konduto blocklist.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: BLOCKLIST_TYPES, description: "Blocklist dimension" },
          value: { type: "string", description: "Value to query" },
        },
        required: ["type", "value"],
      },
    },
    {
      name: "remove_from_blocklist",
      description: "Remove a value from the Konduto blocklist.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: BLOCKLIST_TYPES, description: "Blocklist dimension" },
          value: { type: "string", description: "Value to remove" },
        },
        required: ["type", "value"],
      },
    },
    {
      name: "add_to_allowlist",
      description: "Add a value to the Konduto allowlist (trusted). Future orders matching the value are auto-approved without full ML scoring. Use sparingly — allowlist overrides fraud signals.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: BLOCKLIST_TYPES, description: "Allowlist dimension (same dimensions as blocklist)" },
          value: { type: "string", description: "Value to trust" },
        },
        required: ["type", "value"],
      },
    },
    {
      name: "add_to_reviewlist",
      description: "Add a value to the Konduto reviewlist. Future orders matching the value are forced into manual review regardless of score. Useful for ambiguous signals that warrant human eyes.",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: BLOCKLIST_TYPES, description: "Reviewlist dimension (same dimensions as blocklist)" },
          value: { type: "string", description: "Value to force into review" },
        },
        required: ["type", "value"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "send_order_for_analysis":
        return { content: [{ type: "text", text: JSON.stringify(await kondutoRequest("POST", "/orders", args), null, 2) }] };
      case "get_order": {
        const id = encodeURIComponent(String((args as { id: string }).id));
        return { content: [{ type: "text", text: JSON.stringify(await kondutoRequest("GET", `/orders/${id}`), null, 2) }] };
      }
      case "update_order_status": {
        const a = args as { id: string; status: string; comments?: string };
        const id = encodeURIComponent(String(a.id));
        const body: Record<string, unknown> = { status: a.status };
        if (a.comments) body.comments = a.comments;
        return { content: [{ type: "text", text: JSON.stringify(await kondutoRequest("PUT", `/orders/${id}`, body), null, 2) }] };
      }
      case "add_to_blocklist": {
        const a = args as { type: string; value: string };
        return { content: [{ type: "text", text: JSON.stringify(await kondutoRequest("POST", `/blacklist/${encodeURIComponent(a.type)}`, { value: a.value }), null, 2) }] };
      }
      case "query_blocklist": {
        const a = args as { type: string; value: string };
        return { content: [{ type: "text", text: JSON.stringify(await kondutoRequest("GET", `/blacklist/${encodeURIComponent(a.type)}/${encodeURIComponent(a.value)}`), null, 2) }] };
      }
      case "remove_from_blocklist": {
        const a = args as { type: string; value: string };
        return { content: [{ type: "text", text: JSON.stringify(await kondutoRequest("DELETE", `/blacklist/${encodeURIComponent(a.type)}/${encodeURIComponent(a.value)}`), null, 2) }] };
      }
      case "add_to_allowlist": {
        const a = args as { type: string; value: string };
        return { content: [{ type: "text", text: JSON.stringify(await kondutoRequest("POST", `/whitelist/${encodeURIComponent(a.type)}`, { value: a.value }), null, 2) }] };
      }
      case "add_to_reviewlist": {
        const a = args as { type: string; value: string };
        return { content: [{ type: "text", text: JSON.stringify(await kondutoRequest("POST", `/greylist/${encodeURIComponent(a.type)}`, { value: a.value }), null, 2) }] };
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
        const s = new Server({ name: "mcp-konduto", version: "0.1.0-alpha.1" }, { capabilities: { tools: {} } });
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
