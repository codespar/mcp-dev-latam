#!/usr/bin/env node

/**
 * MCP Server for Rede — Itaú-owned Brazilian card acquirer.
 *
 * Rede (eRede) closes the "big four" BR acquirer quadrant alongside Cielo,
 * Stone, and Getnet. Merchants with an Itaú commercial contract integrate
 * directly via eRede instead of going through a PSP.
 *
 * Tools (11):
 *   authorize_transaction — authorize a credit card transaction (optional auto-capture)
 *   capture_transaction   — capture a previously authorized transaction
 *   cancel_transaction    — cancel an uncaptured authorization (full void)
 *   refund_transaction    — refund a captured transaction (full or partial)
 *   get_transaction       — retrieve by TID or merchant reference
 *   zero_auth             — validate a card without charging
 *   tokenize_card         — store a card as a reusable token
 *   delete_token          — delete a stored card token
 *   create_recurrence     — create a native recurrence (subscription)
 *   get_recurrence        — retrieve a recurrence by id
 *   disable_recurrence    — disable an active recurrence
 *
 * Authentication
 *   HTTP Basic auth. Authorization: Basic base64(PV:TOKEN), where PV is the
 *   merchant filiação and TOKEN is the security token paired with it. Every
 *   request carries this header; nothing else is needed.
 *
 * Environment
 *   REDE_PV     Merchant filiação (PV) — required
 *   REDE_TOKEN  Security token paired with PV — required, secret
 *   REDE_ENV    'sandbox' (default) or 'production'
 *
 * Docs: https://developer.userede.com.br
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const PV = process.env.REDE_PV || "";
const TOKEN = process.env.REDE_TOKEN || "";
const ENV = (process.env.REDE_ENV || "sandbox").toLowerCase();
const BASE_URL = ENV === "production"
  ? "https://api.userede.com.br/erede/v1"
  : "https://sandbox-erede.useredecloud.com.br/v1";

async function redeRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const basic = Buffer.from(`${PV}:${TOKEN}`).toString("base64");
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${basic}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Rede API ${res.status}: ${await res.text()}`);
  }
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const server = new Server(
  { name: "mcp-rede", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "authorize_transaction",
      description: "Authorize a credit card transaction on Rede. Set capture=true to authorize + capture atomically; capture=false to authorize only (use capture_transaction later).",
      inputSchema: {
        type: "object",
        properties: {
          reference: { type: "string", description: "Merchant-side order reference (unique per merchant)" },
          amount: { type: "number", description: "Amount in cents" },
          installments: { type: "number", description: "Number of installments (1 for à vista)" },
          capture: { type: "boolean", description: "true = authorize + capture; false = authorize only" },
          cardHolderName: { type: "string", description: "Name on card" },
          cardNumber: { type: "string", description: "PAN; never log this value. Prefer storageCard (token) instead." },
          expirationMonth: { type: "number", description: "Expiration month (1-12)" },
          expirationYear: { type: "number", description: "Expiration year (4 digits)" },
          securityCode: { type: "string", description: "CVV" },
          storageCard: { type: "string", description: "Token from tokenize_card (alternative to cardNumber)" },
          softDescriptor: { type: "string", description: "Statement descriptor shown on the cardholder bill" },
          subscription: { type: "boolean", description: "Flag as a recurring charge (MIT)" },
          urls: {
            type: "array",
            description: "Optional callback/notification URL objects ({ url, kind })",
          },
        },
        required: ["reference", "amount", "installments", "capture"],
      },
    },
    {
      name: "capture_transaction",
      description: "Capture a previously authorized transaction (when capture=false was used). Pass amount for partial capture; omit for full.",
      inputSchema: {
        type: "object",
        properties: {
          tid: { type: "string", description: "Rede transaction id (tid) from authorize_transaction" },
          amount: { type: "number", description: "Amount to capture in cents. Omit to capture the full authorized amount." },
        },
        required: ["tid"],
      },
    },
    {
      name: "cancel_transaction",
      description: "Cancel an authorized-but-uncaptured transaction (void). Rede uses the refunds endpoint for both voids and refunds — cancel means full amount on an uncaptured transaction.",
      inputSchema: {
        type: "object",
        properties: {
          tid: { type: "string", description: "Rede transaction id" },
        },
        required: ["tid"],
      },
    },
    {
      name: "refund_transaction",
      description: "Refund a captured transaction. Pass amount for a partial refund; omit for full. Same endpoint as cancel; amount controls the behaviour.",
      inputSchema: {
        type: "object",
        properties: {
          tid: { type: "string", description: "Rede transaction id" },
          amount: { type: "number", description: "Refund amount in cents. Omit for a full refund." },
        },
        required: ["tid"],
      },
    },
    {
      name: "get_transaction",
      description: "Retrieve a transaction by Rede tid OR by merchant reference. Pass exactly one of tid or reference.",
      inputSchema: {
        type: "object",
        properties: {
          tid: { type: "string", description: "Rede transaction id" },
          reference: { type: "string", description: "Merchant-side reference used at authorize time" },
        },
      },
    },
    {
      name: "zero_auth",
      description: "Validate a card without charging (zero-auth / account verification). Returns whether the card is authorizable, without creating a transaction.",
      inputSchema: {
        type: "object",
        properties: {
          cardHolderName: { type: "string" },
          cardNumber: { type: "string", description: "PAN; never log. Prefer storageCard." },
          expirationMonth: { type: "number" },
          expirationYear: { type: "number" },
          securityCode: { type: "string" },
          storageCard: { type: "string", description: "Token from tokenize_card (alternative to cardNumber)" },
          onlyStatusCode: { type: "boolean", description: "If true, return status code only (faster)" },
        },
      },
    },
    {
      name: "tokenize_card",
      description: "Tokenize a card for PCI-safe reuse. Returns a token (storageCard) to pass into authorize_transaction.storageCard.",
      inputSchema: {
        type: "object",
        properties: {
          cardHolderName: { type: "string" },
          cardNumber: { type: "string", description: "PAN; never log" },
          expirationMonth: { type: "number" },
          expirationYear: { type: "number" },
          securityCode: { type: "string" },
        },
        required: ["cardHolderName", "cardNumber", "expirationMonth", "expirationYear", "securityCode"],
      },
    },
    {
      name: "delete_token",
      description: "Delete a previously created card token.",
      inputSchema: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "Token id returned by tokenize_card" },
        },
        required: ["tokenId"],
      },
    },
    {
      name: "create_recurrence",
      description: "Create a native Rede recurrence (subscription). Rede handles retries and cardholder updates automatically.",
      inputSchema: {
        type: "object",
        properties: {
          reference: { type: "string", description: "Merchant-side recurrence reference" },
          amount: { type: "number", description: "Recurring amount in cents" },
          frequency: { type: "string", description: "Billing frequency (e.g. MONTHLY, WEEKLY, DAILY)" },
          totalRecurrences: { type: "number", description: "Total number of recurrences (omit for open-ended)" },
          startDate: { type: "string", description: "Start date YYYY-MM-DD" },
          endDate: { type: "string", description: "End date YYYY-MM-DD (optional)" },
          cardHolderName: { type: "string" },
          cardNumber: { type: "string", description: "PAN; never log. Prefer storageCard." },
          expirationMonth: { type: "number" },
          expirationYear: { type: "number" },
          securityCode: { type: "string" },
          storageCard: { type: "string", description: "Token from tokenize_card (alternative to cardNumber)" },
          softDescriptor: { type: "string" },
        },
        required: ["reference", "amount", "frequency", "startDate"],
      },
    },
    {
      name: "get_recurrence",
      description: "Retrieve a recurrence by Rede recurrence id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Rede recurrence id" },
        },
        required: ["id"],
      },
    },
    {
      name: "disable_recurrence",
      description: "Disable (cancel) an active recurrence. Stops all future billings.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Rede recurrence id" },
        },
        required: ["id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "authorize_transaction": {
        const a = args as Record<string, unknown>;
        const body = { kind: "credit", ...a };
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("POST", "/transactions", body), null, 2) }] };
      }
      case "capture_transaction": {
        const tid = (args as { tid: string }).tid;
        const body: Record<string, unknown> = {};
        if ((args as { amount?: number }).amount !== undefined) body.amount = (args as { amount: number }).amount;
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("PUT", `/transactions/${tid}`, body), null, 2) }] };
      }
      case "cancel_transaction": {
        const tid = (args as { tid: string }).tid;
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("POST", `/transactions/${tid}/refunds`, {}), null, 2) }] };
      }
      case "refund_transaction": {
        const tid = (args as { tid: string }).tid;
        const body: Record<string, unknown> = {};
        if ((args as { amount?: number }).amount !== undefined) body.amount = (args as { amount: number }).amount;
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("POST", `/transactions/${tid}/refunds`, body), null, 2) }] };
      }
      case "get_transaction": {
        const a = args as { tid?: string; reference?: string };
        if (a.tid) {
          return { content: [{ type: "text", text: JSON.stringify(await redeRequest("GET", `/transactions/${a.tid}`), null, 2) }] };
        }
        if (a.reference) {
          const ref = encodeURIComponent(a.reference);
          return { content: [{ type: "text", text: JSON.stringify(await redeRequest("GET", `/transactions?reference=${ref}`), null, 2) }] };
        }
        return { content: [{ type: "text", text: "Error: pass either tid or reference" }], isError: true };
      }
      case "zero_auth":
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("POST", "/zero", args), null, 2) }] };
      case "tokenize_card":
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("POST", "/tokens", args), null, 2) }] };
      case "delete_token": {
        const tokenId = (args as { tokenId: string }).tokenId;
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("DELETE", `/tokens/${tokenId}`), null, 2) }] };
      }
      case "create_recurrence":
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("POST", "/recurrences", args), null, 2) }] };
      case "get_recurrence": {
        const id = (args as { id: string }).id;
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("GET", `/recurrences/${id}`), null, 2) }] };
      }
      case "disable_recurrence": {
        const id = (args as { id: string }).id;
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("PATCH", `/recurrences/${id}`, { status: "DISABLED" }), null, 2) }] };
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
        const s = new Server({ name: "mcp-rede", version: "0.1.0" }, { capabilities: { tools: {} } });
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
