#!/usr/bin/env node

/**
 * MCP Server for dLocal — LatAm cross-border payments.
 *
 * dLocal exposes one API that localizes payments across 15+ LatAm countries
 * (BR, MX, AR, CO, CL, PE, UY, EC, BO, CR, GT, and more). Agents can charge,
 * refund, and pay out in local currency + local payment methods through a
 * single interface. This is the abstraction that per-country PSP servers
 * (Conekta, Wompi, Mercado Pago) cannot provide on their own.
 *
 * Tools (18):
 *   create_payment              — charge a buyer via local method (card, Pix, OXXO, PSE, SPEI, etc)
 *   get_payment                 — retrieve payment status by dLocal id
 *   get_payment_by_order_id     — retrieve payment by merchant-side order_id
 *   list_payments               — list payments with date/country/status filters
 *   capture_payment             — capture an authorized payment (full or partial)
 *   cancel_payment              — cancel an authorized-but-not-captured payment
 *   create_refund               — refund a captured payment (full or partial)
 *   get_refund                  — retrieve refund status
 *   list_refunds                — list refunds for a payment
 *   create_payout               — send money out to a beneficiary in local currency
 *   get_payout                  — retrieve payout status
 *   get_payout_by_external_id   — retrieve payout by merchant external reference
 *   list_payouts                — list payouts with date/country/status filters
 *   list_payment_methods        — enumerate available methods per country (dynamic)
 *   get_balance                 — merchant account balance
 *   get_exchange_rate           — query FX rate for currency conversion
 *   create_card_token           — tokenize a card for DIRECT card flows
 *   validate_document           — validate local tax IDs (CPF, CNPJ, CUIT, DNI, RUT, RFC)
 *
 * Authentication
 *   dLocal V2 HMAC-SHA256. Every request carries:
 *     X-Date       : ISO-8601 UTC timestamp
 *     X-Login      : merchant login
 *     X-Trans-Key  : merchant transactional key
 *     Authorization: V2-HMAC-SHA256, Signature: <hex(hmac(login+x_date+body, secret_key))>
 *
 * Environment
 *   DLOCAL_LOGIN       — merchant login (X-Login)
 *   DLOCAL_TRANS_KEY   — merchant trans-key (X-Trans-Key)
 *   DLOCAL_SECRET_KEY  — HMAC secret used to sign requests
 *   DLOCAL_BASE_URL    — optional; defaults to https://api.dlocal.com
 *
 * Docs: https://docs.dlocal.com
 */

import { createHmac } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const LOGIN = process.env.DLOCAL_LOGIN || "";
const TRANS_KEY = process.env.DLOCAL_TRANS_KEY || "";
const SECRET_KEY = process.env.DLOCAL_SECRET_KEY || "";
const BASE_URL = process.env.DLOCAL_BASE_URL || "https://api.dlocal.com";

async function dlocalRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const xDate = new Date().toISOString();
  const bodyStr = body ? JSON.stringify(body) : "";
  const signedPayload = LOGIN + xDate + bodyStr;
  const signature = createHmac("sha256", SECRET_KEY).update(signedPayload).digest("hex");

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Date": xDate,
      "X-Login": LOGIN,
      "X-Trans-Key": TRANS_KEY,
      "Authorization": `V2-HMAC-SHA256, Signature: ${signature}`,
    },
    body: bodyStr || undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`dLocal API ${res.status}: ${err}`);
  }
  return res.json();
}

function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

const server = new Server(
  { name: "mcp-dlocal", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_payment",
      description: "Create a payment (pay-in) in a LatAm country using a local payment method. Returns the payment object with a status and, for voucher/QR methods, the redirect/display data.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in the country's currency, major units (e.g. 100 = 100 BRL, not cents)" },
          currency: { type: "string", description: "ISO-4217 currency code (BRL, MXN, ARS, COP, CLP, PEN, USD, etc)" },
          country: { type: "string", description: "ISO-3166 alpha-2 country code (BR, MX, AR, CO, CL, PE, UY, EC, BO, CR, GT)" },
          payment_method_id: { type: "string", description: "Method id from /payments-methods (e.g. CARD, PIX, OX, PSE, SPEI). Use list_payment_methods to enumerate for a country." },
          payment_method_flow: { type: "string", enum: ["DIRECT", "REDIRECT"], description: "DIRECT for tokenized card; REDIRECT for hosted flow (OXXO voucher, Pix QR, PSE bank select)" },
          payer: {
            type: "object",
            description: "Payer identification",
            properties: {
              name: { type: "string", description: "Payer full name" },
              email: { type: "string", description: "Payer email" },
              document: { type: "string", description: "Local tax ID (CPF/CNPJ for BR, RFC for MX, DNI for AR, etc)" },
              user_reference: { type: "string", description: "Merchant-side stable user ID" },
            },
            required: ["name", "email", "document"],
          },
          card: {
            type: "object",
            description: "For DIRECT card flow only — tokenized card object. Omit for REDIRECT.",
          },
          order_id: { type: "string", description: "Merchant-side order reference (appears in reports)" },
          description: { type: "string", description: "Human-readable description for the payer" },
          notification_url: { type: "string", description: "Webhook URL dLocal calls on status changes" },
          callback_url: { type: "string", description: "Browser redirect target after REDIRECT flow completes" },
        },
        required: ["amount", "currency", "country", "payment_method_id", "payment_method_flow", "payer", "order_id"],
      },
    },
    {
      name: "get_payment",
      description: "Get payment status and full detail by dLocal payment id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "dLocal payment id (e.g. D-30000-xxxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_payment_by_order_id",
      description: "Get a payment by the merchant-side order_id supplied at creation time. Useful when the agent only kept its own reference and not dLocal's id.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Merchant-side order reference passed as order_id when creating the payment" },
        },
        required: ["order_id"],
      },
    },
    {
      name: "list_payments",
      description: "List payments with optional date / country / status filters. Useful for reconciliation and reporting agents.",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number (1-indexed)" },
          page_size: { type: "number", description: "Results per page (max 100)" },
          status: { type: "string", description: "Filter by status (PAID, PENDING, REJECTED, CANCELLED, EXPIRED, AUTHORIZED, VERIFIED)" },
          country: { type: "string", description: "ISO-3166 alpha-2 country filter" },
          created_date_from: { type: "string", description: "Lower bound (ISO-8601 date or datetime)" },
          created_date_to: { type: "string", description: "Upper bound (ISO-8601 date or datetime)" },
          payment_method_id: { type: "string", description: "Filter by payment method (CARD, PIX, OX, etc)" },
        },
      },
    },
    {
      name: "capture_payment",
      description: "Capture an AUTHORIZED card payment. Omit amount for full capture; pass amount for partial capture (must be ≤ authorized amount). Card-only.",
      inputSchema: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "Original AUTHORIZED dLocal payment id" },
          amount: { type: "number", description: "Partial capture amount in major units. Omit for full capture." },
          currency: { type: "string", description: "ISO-4217 currency code (must match original payment)" },
          order_id: { type: "string", description: "Optional merchant reference for the capture" },
        },
        required: ["payment_id"],
      },
    },
    {
      name: "cancel_payment",
      description: "Cancel an authorized-but-not-captured payment, or void a PENDING payment. Card payments must be in AUTHORIZED state.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "dLocal payment id" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_refund",
      description: "Refund a captured payment. Supports full refund (amount omitted) or partial refund (amount set).",
      inputSchema: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "Original dLocal payment id" },
          amount: { type: "number", description: "Partial refund amount in major units. Omit for a full refund." },
          notification_url: { type: "string", description: "Webhook URL for refund status updates" },
          description: { type: "string", description: "Reason or reference" },
        },
        required: ["payment_id"],
      },
    },
    {
      name: "get_refund",
      description: "Get refund status by refund id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "dLocal refund id (R-xxxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_refunds",
      description: "List refunds, optionally scoped to a payment_id. Useful for reconciling partial refunds against the original charge.",
      inputSchema: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "Optional — only return refunds for this payment id" },
          page: { type: "number", description: "Page number (1-indexed)" },
          page_size: { type: "number", description: "Results per page (max 100)" },
          created_date_from: { type: "string", description: "Lower bound (ISO-8601)" },
          created_date_to: { type: "string", description: "Upper bound (ISO-8601)" },
        },
      },
    },
    {
      name: "create_payout",
      description: "Send money out to a beneficiary in a LatAm country. Used for marketplace seller payouts, creator payouts, and cross-border settlement.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Payout amount in major units" },
          currency: { type: "string", description: "ISO-4217 currency code" },
          country: { type: "string", description: "Destination country ISO-3166 alpha-2" },
          payment_method_id: { type: "string", description: "Destination method (BA for bank account, varies by country)" },
          beneficiary: {
            type: "object",
            description: "Beneficiary object with identity + destination account",
            properties: {
              name: { type: "string", description: "Full name" },
              document: { type: "string", description: "Tax ID" },
              email: { type: "string", description: "Email" },
              bank_account: {
                type: "object",
                description: "Bank account details (country-specific fields)",
              },
            },
            required: ["name", "document"],
          },
          order_id: { type: "string", description: "Merchant-side payout reference" },
          description: { type: "string", description: "Payout description" },
          notification_url: { type: "string", description: "Webhook URL for payout status updates" },
        },
        required: ["amount", "currency", "country", "payment_method_id", "beneficiary", "order_id"],
      },
    },
    {
      name: "get_payout",
      description: "Get payout status by dLocal payout id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "dLocal payout id (P-xxxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_payout_by_external_id",
      description: "Get a payout by the merchant external_id / order_id supplied at creation time. Mirror of get_payment_by_order_id for the payouts side.",
      inputSchema: {
        type: "object",
        properties: {
          external_id: { type: "string", description: "Merchant-side payout reference (order_id used at create_payout time)" },
        },
        required: ["external_id"],
      },
    },
    {
      name: "list_payouts",
      description: "List payouts with optional date / country / status filters. Useful for settlement reconciliation across countries.",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number (1-indexed)" },
          page_size: { type: "number", description: "Results per page (max 100)" },
          status: { type: "string", description: "Filter by status (PAID, PENDING, REJECTED, CANCELLED)" },
          country: { type: "string", description: "ISO-3166 alpha-2 country filter" },
          created_date_from: { type: "string", description: "Lower bound (ISO-8601)" },
          created_date_to: { type: "string", description: "Upper bound (ISO-8601)" },
        },
      },
    },
    {
      name: "list_payment_methods",
      description: "List all payment methods available for a given country. Agents use this to dynamically discover local methods (Pix in BR, OXXO in MX, PSE in CO, etc) without hard-coding per-country logic.",
      inputSchema: {
        type: "object",
        properties: {
          country: { type: "string", description: "ISO-3166 alpha-2 country code (BR, MX, AR, CO, CL, PE, UY, EC, BO, CR, GT)" },
        },
        required: ["country"],
      },
    },
    {
      name: "get_balance",
      description: "Get the merchant's current available balance per currency.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_exchange_rate",
      description: "Query the dLocal FX rate for a destination country/currency pair. Used to preview converted amounts before a payout or USD-funded charge.",
      inputSchema: {
        type: "object",
        properties: {
          from_currency: { type: "string", description: "Source currency ISO-4217 (typically USD or EUR)" },
          to_currency: { type: "string", description: "Destination local currency ISO-4217 (BRL, MXN, ARS, etc)" },
          country: { type: "string", description: "Destination country ISO-3166 alpha-2" },
          amount: { type: "number", description: "Optional source amount to convert; the response will include the destination value" },
        },
        required: ["from_currency", "to_currency", "country"],
      },
    },
    {
      name: "create_card_token",
      description: "Tokenize a card for use in DIRECT-flow create_payment. Use the returned token in the card.token field instead of raw PAN. Required for PCI scope reduction.",
      inputSchema: {
        type: "object",
        properties: {
          holder_name: { type: "string", description: "Cardholder full name" },
          card_number: { type: "string", description: "Card PAN (digits only, no spaces)" },
          cvv: { type: "string", description: "Card verification value" },
          expiration_month: { type: "number", description: "1-12" },
          expiration_year: { type: "number", description: "4-digit year (e.g. 2028)" },
          country: { type: "string", description: "Issuing country ISO-3166 alpha-2 (optional; helps method routing)" },
        },
        required: ["holder_name", "card_number", "cvv", "expiration_month", "expiration_year"],
      },
    },
    {
      name: "validate_document",
      description: "Validate a LatAm tax/identity document (CPF or CNPJ in BR, CUIT/CUIL/DNI in AR, RUT in CL/UY, RFC/CURP in MX, etc). Returns whether the document is well-formed and, when supported, registry-validated.",
      inputSchema: {
        type: "object",
        properties: {
          country: { type: "string", description: "ISO-3166 alpha-2 (BR, AR, CL, UY, MX, CO, PE, EC, BO, CR, GT)" },
          document_type: { type: "string", description: "Document type code (CPF, CNPJ, CUIT, CUIL, DNI, RUT, RFC, CURP, NIT, RUC, CI)" },
          document: { type: "string", description: "Document number (digits only when applicable)" },
        },
        required: ["country", "document_type", "document"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_payment":
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("POST", "/secure_payments", args), null, 2) }] };
      case "get_payment":
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("GET", `/payments/${args?.id}`), null, 2) }] };
      case "get_payment_by_order_id": {
        const order = encodeURIComponent(String(args?.order_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("GET", `/payments?order_id=${order}`), null, 2) }] };
      }
      case "list_payments": {
        const qs = buildQuery({
          page: args?.page,
          page_size: args?.page_size,
          status: args?.status,
          country: args?.country,
          created_date_from: args?.created_date_from,
          created_date_to: args?.created_date_to,
          payment_method_id: args?.payment_method_id,
        });
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("GET", `/payments${qs}`), null, 2) }] };
      }
      case "capture_payment": {
        const body: Record<string, unknown> = { authorization_id: args?.payment_id };
        if (args?.amount !== undefined) body.amount = args.amount;
        if (args?.currency) body.currency = args.currency;
        if (args?.order_id) body.order_id = args.order_id;
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("POST", "/payments", body), null, 2) }] };
      }
      case "cancel_payment":
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("POST", `/payments/${args?.id}/cancel`), null, 2) }] };
      case "create_refund": {
        const body: Record<string, unknown> = { payment_id: args?.payment_id };
        if (args?.amount !== undefined) body.amount = args.amount;
        if (args?.notification_url) body.notification_url = args.notification_url;
        if (args?.description) body.description = args.description;
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("POST", "/refunds", body), null, 2) }] };
      }
      case "get_refund":
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("GET", `/refunds/${args?.id}`), null, 2) }] };
      case "list_refunds": {
        const qs = buildQuery({
          payment_id: args?.payment_id,
          page: args?.page,
          page_size: args?.page_size,
          created_date_from: args?.created_date_from,
          created_date_to: args?.created_date_to,
        });
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("GET", `/refunds${qs}`), null, 2) }] };
      }
      case "create_payout":
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("POST", "/payouts", args), null, 2) }] };
      case "get_payout":
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("GET", `/payouts/${args?.id}`), null, 2) }] };
      case "get_payout_by_external_id": {
        const ext = encodeURIComponent(String(args?.external_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("GET", `/payouts?external_id=${ext}`), null, 2) }] };
      }
      case "list_payouts": {
        const qs = buildQuery({
          page: args?.page,
          page_size: args?.page_size,
          status: args?.status,
          country: args?.country,
          created_date_from: args?.created_date_from,
          created_date_to: args?.created_date_to,
        });
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("GET", `/payouts${qs}`), null, 2) }] };
      }
      case "list_payment_methods": {
        const country = encodeURIComponent(String(args?.country ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("GET", `/payments-methods?country=${country}`), null, 2) }] };
      }
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("GET", "/accounts/balance"), null, 2) }] };
      case "get_exchange_rate": {
        const qs = buildQuery({
          from_currency: args?.from_currency,
          to_currency: args?.to_currency,
          country: args?.country,
          amount: args?.amount,
        });
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("GET", `/exchange_rates${qs}`), null, 2) }] };
      }
      case "create_card_token":
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("POST", "/secure_cards", args), null, 2) }] };
      case "validate_document": {
        const body: Record<string, unknown> = {
          country: args?.country,
          document_type: args?.document_type,
          document: args?.document,
        };
        return { content: [{ type: "text", text: JSON.stringify(await dlocalRequest("POST", "/documents/validate", body), null, 2) }] };
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
        const s = new Server({ name: "mcp-dlocal", version: "0.2.1" }, { capabilities: { tools: {} } });
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
