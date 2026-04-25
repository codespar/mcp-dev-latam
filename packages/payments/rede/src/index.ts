#!/usr/bin/env node

/**
 * MCP Server for Rede — Itaú-owned Brazilian card acquirer.
 *
 * Rede (eRede) closes the "big four" BR acquirer quadrant alongside Cielo,
 * Stone, and Getnet. Merchants with an Itaú commercial contract integrate
 * directly via eRede instead of going through a PSP.
 *
 * Tools (22):
 *   authorize_transaction     — authorize a credit card transaction (optional auto-capture)
 *   authorize_debit           — authorize a debit card transaction (requires 3DS reference)
 *   capture_transaction       — capture a previously authorized transaction
 *   cancel_transaction        — cancel an uncaptured authorization (full void)
 *   refund_transaction        — refund a captured transaction (full or partial)
 *   get_transaction           — retrieve by TID or merchant reference
 *   list_transactions         — list transactions in a date range
 *   zero_auth                 — validate a card without charging
 *   tokenize_card             — store a card as a reusable token
 *   get_token                 — retrieve stored card token metadata
 *   delete_token              — delete a stored card token
 *   create_recurrence         — create a native recurrence (subscription)
 *   get_recurrence            — retrieve a recurrence by id
 *   update_recurrence         — update an existing recurrence (amount, card, end date)
 *   disable_recurrence        — disable an active recurrence
 *   get_recurrence_transactions — list transactions belonging to a recurrence
 *   authenticate_3ds          — initiate 3DS authentication for a charge
 *   get_3ds_status            — check 3DS authentication status / fetch 3DS reference
 *   authorize_with_3ds        — authorize a transaction using a 3DS authentication reference
 *   create_boleto             — issue a boleto registrado via Rede
 *   get_boleto                — retrieve a boleto by Rede id or merchant reference
 *   cancel_boleto             — cancel an unpaid boleto
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
  { name: "mcp-rede", version: "0.2.0-alpha.2" },
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
    {
      name: "authorize_debit",
      description: "Authorize a debit card transaction on Rede. Requires a prior 3DS authentication — pass threeDSecure.embedded=true and a valid threeDSecure reference, or use authorize_with_3ds after authenticate_3ds.",
      inputSchema: {
        type: "object",
        properties: {
          reference: { type: "string", description: "Merchant-side order reference" },
          amount: { type: "number", description: "Amount in cents" },
          cardHolderName: { type: "string" },
          cardNumber: { type: "string", description: "PAN; never log. Prefer storageCard." },
          expirationMonth: { type: "number" },
          expirationYear: { type: "number" },
          securityCode: { type: "string" },
          storageCard: { type: "string", description: "Token from tokenize_card" },
          softDescriptor: { type: "string" },
          threeDSecure: {
            type: "object",
            description: "3DS payload: { embedded: true, onFailure: 'decline' | 'continue', userAgent, device: { ... } }. Required for débito.",
          },
        },
        required: ["reference", "amount", "threeDSecure"],
      },
    },
    {
      name: "list_transactions",
      description: "List transactions in a date range. Useful for reconciliation. Rede paginates results; pass page/size to walk pages.",
      inputSchema: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Start date YYYY-MM-DD" },
          endDate: { type: "string", description: "End date YYYY-MM-DD" },
          status: { type: "string", description: "Optional status filter (e.g. AUTHORIZED, CAPTURED, DENIED)" },
          page: { type: "number", description: "Page index (0-based)" },
          size: { type: "number", description: "Page size (default 20)" },
        },
        required: ["startDate", "endDate"],
      },
    },
    {
      name: "get_token",
      description: "Retrieve metadata for a previously stored card token (brand, last 4, expiration). Does not return the PAN.",
      inputSchema: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "Token id returned by tokenize_card" },
        },
        required: ["tokenId"],
      },
    },
    {
      name: "update_recurrence",
      description: "Update an existing recurrence — change amount, card (storageCard), end date, or pause/resume. Pass only the fields you want to change.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Rede recurrence id" },
          amount: { type: "number", description: "New recurring amount in cents" },
          storageCard: { type: "string", description: "New card token to charge" },
          endDate: { type: "string", description: "New end date YYYY-MM-DD" },
          status: { type: "string", description: "Status override: ENABLED | DISABLED | PAUSED" },
          softDescriptor: { type: "string" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_recurrence_transactions",
      description: "List transactions generated by a recurrence (one row per billing cycle executed).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Rede recurrence id" },
          page: { type: "number", description: "Page index (0-based)" },
          size: { type: "number", description: "Page size" },
        },
        required: ["id"],
      },
    },
    {
      name: "authenticate_3ds",
      description: "Initiate a 3DS (EMV 3-D Secure) authentication for a card charge. Returns a threeDSecure reference id and, when required, a challenge URL for cardholder interaction.",
      inputSchema: {
        type: "object",
        properties: {
          reference: { type: "string", description: "Merchant-side order reference" },
          amount: { type: "number", description: "Amount in cents" },
          installments: { type: "number", description: "Number of installments (1 for à vista)" },
          paymentMethod: { type: "string", description: "'credit' or 'debit'" },
          cardHolderName: { type: "string" },
          cardNumber: { type: "string", description: "PAN; never log. Prefer storageCard." },
          expirationMonth: { type: "number" },
          expirationYear: { type: "number" },
          securityCode: { type: "string" },
          storageCard: { type: "string", description: "Token from tokenize_card" },
          threeDSecure: {
            type: "object",
            description: "3DS options: { onFailure: 'decline' | 'continue', userAgent, device, returnUrl }",
          },
        },
        required: ["reference", "amount", "paymentMethod"],
      },
    },
    {
      name: "get_3ds_status",
      description: "Check the current status of a 3DS authentication by its reference id. Returns whether the cardholder completed the challenge and the resulting 3DS reference to attach to an authorize call.",
      inputSchema: {
        type: "object",
        properties: {
          threeDSecureId: { type: "string", description: "3DS reference id returned by authenticate_3ds" },
        },
        required: ["threeDSecureId"],
      },
    },
    {
      name: "authorize_with_3ds",
      description: "Authorize a transaction after a successful 3DS authentication, attaching the 3DS reference for liability shift. Works for both credit and debit.",
      inputSchema: {
        type: "object",
        properties: {
          reference: { type: "string", description: "Merchant-side order reference" },
          amount: { type: "number", description: "Amount in cents" },
          installments: { type: "number", description: "Number of installments (1 for à vista)" },
          capture: { type: "boolean", description: "true = authorize + capture; false = authorize only (credit only)" },
          kind: { type: "string", description: "'credit' or 'debit'" },
          threeDSecureId: { type: "string", description: "3DS reference id from authenticate_3ds" },
          cardHolderName: { type: "string" },
          cardNumber: { type: "string", description: "PAN; never log. Prefer storageCard." },
          expirationMonth: { type: "number" },
          expirationYear: { type: "number" },
          securityCode: { type: "string" },
          storageCard: { type: "string", description: "Token from tokenize_card" },
          softDescriptor: { type: "string" },
        },
        required: ["reference", "amount", "threeDSecureId"],
      },
    },
    {
      name: "create_boleto",
      description: "Issue a boleto registrado via Rede. Rede registers the slip with the banking network and returns the typable line (linha digitável) plus the PDF/URL.",
      inputSchema: {
        type: "object",
        properties: {
          reference: { type: "string", description: "Merchant-side reference (unique per merchant)" },
          amount: { type: "number", description: "Amount in cents" },
          dueDate: { type: "string", description: "Due date YYYY-MM-DD" },
          payer: {
            type: "object",
            description: "Payer object: { name, document (CPF/CNPJ, digits only), email, address: { street, number, city, state, zipCode } }",
          },
          instructions: {
            type: "array",
            description: "Optional printed instructions (strings) — e.g. fine/interest after due, discount rules.",
          },
          softDescriptor: { type: "string", description: "Statement descriptor / beneficiary name override" },
        },
        required: ["reference", "amount", "dueDate", "payer"],
      },
    },
    {
      name: "get_boleto",
      description: "Retrieve a boleto by Rede boleto id or by merchant reference. Returns status (REGISTERED, PAID, EXPIRED, CANCELED) and typable line.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Rede boleto id" },
          reference: { type: "string", description: "Merchant-side reference used at create time" },
        },
      },
    },
    {
      name: "cancel_boleto",
      description: "Cancel an unpaid boleto. Paid boletos cannot be canceled — issue a refund via the payer's bank instead.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Rede boleto id" },
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
      case "authorize_debit": {
        const a = args as Record<string, unknown>;
        const body = { kind: "debit", ...a };
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("POST", "/transactions", body), null, 2) }] };
      }
      case "list_transactions": {
        const a = args as { startDate: string; endDate: string; status?: string; page?: number; size?: number };
        const qs = new URLSearchParams();
        qs.set("startDate", a.startDate);
        qs.set("endDate", a.endDate);
        if (a.status) qs.set("status", a.status);
        if (a.page !== undefined) qs.set("page", String(a.page));
        if (a.size !== undefined) qs.set("size", String(a.size));
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("GET", `/transactions?${qs.toString()}`), null, 2) }] };
      }
      case "get_token": {
        const tokenId = (args as { tokenId: string }).tokenId;
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("GET", `/tokens/${tokenId}`), null, 2) }] };
      }
      case "update_recurrence": {
        const { id, ...rest } = args as { id: string } & Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("PATCH", `/recurrences/${id}`, rest), null, 2) }] };
      }
      case "get_recurrence_transactions": {
        const a = args as { id: string; page?: number; size?: number };
        const qs = new URLSearchParams();
        if (a.page !== undefined) qs.set("page", String(a.page));
        if (a.size !== undefined) qs.set("size", String(a.size));
        const suffix = qs.toString() ? `?${qs.toString()}` : "";
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("GET", `/recurrences/${a.id}/transactions${suffix}`), null, 2) }] };
      }
      case "authenticate_3ds":
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("POST", "/threeDSecure", args), null, 2) }] };
      case "get_3ds_status": {
        const threeDSecureId = (args as { threeDSecureId: string }).threeDSecureId;
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("GET", `/threeDSecure/${threeDSecureId}`), null, 2) }] };
      }
      case "authorize_with_3ds": {
        const a = args as Record<string, unknown> & { threeDSecureId: string; kind?: string };
        const { threeDSecureId, kind, ...rest } = a;
        const body = { kind: kind || "credit", threeDSecure: { threeDSecureId }, ...rest };
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("POST", "/transactions", body), null, 2) }] };
      }
      case "create_boleto":
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("POST", "/charges", args), null, 2) }] };
      case "get_boleto": {
        const a = args as { id?: string; reference?: string };
        if (a.id) {
          return { content: [{ type: "text", text: JSON.stringify(await redeRequest("GET", `/charges/${a.id}`), null, 2) }] };
        }
        if (a.reference) {
          const ref = encodeURIComponent(a.reference);
          return { content: [{ type: "text", text: JSON.stringify(await redeRequest("GET", `/charges?reference=${ref}`), null, 2) }] };
        }
        return { content: [{ type: "text", text: "Error: pass either id or reference" }], isError: true };
      }
      case "cancel_boleto": {
        const id = (args as { id: string }).id;
        return { content: [{ type: "text", text: JSON.stringify(await redeRequest("DELETE", `/charges/${id}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-rede", version: "0.2.0-alpha.2" }, { capabilities: { tools: {} } });
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
