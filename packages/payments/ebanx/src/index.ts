#!/usr/bin/env node

/**
 * MCP Server for EBANX — cross-border payment platform for Latin America.
 *
 * Tools (existing):
 * - create_payment, get_payment, list_payments, refund, create_payout,
 *   exchange_rate, get_banks
 *
 * Tools (added in 0.2.0):
 * - query_payment_by_merchant_code, capture_payment, cancel_payment,
 *   create_mass_payout, get_payout, simulate_payment, list_payment_methods,
 *   create_card_token, delete_card_token, validate_document, verify_notification
 *
 * Environment:
 *   EBANX_INTEGRATION_KEY — Integration key from https://dashboard.ebanx.com/
 *   EBANX_SANDBOX — "true" to use sandbox (default: false)
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

const INTEGRATION_KEY = process.env.EBANX_INTEGRATION_KEY || "";
const BASE_URL = process.env.EBANX_SANDBOX === "true"
  ? "https://sandbox.ebanx.com/ws"
  : "https://api.ebanx.com/ws";

async function ebanxRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const payload = method === "POST"
    ? { integration_key: INTEGRATION_KEY, ...(body as Record<string, unknown> || {}) }
    : undefined;

  const url = method === "GET" && body
    ? `${BASE_URL}${path}?${new URLSearchParams({ integration_key: INTEGRATION_KEY, ...(body as Record<string, string>) })}`
    : method === "GET"
      ? `${BASE_URL}${path}?${new URLSearchParams({ integration_key: INTEGRATION_KEY })}`
      : `${BASE_URL}${path}`;

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`EBANX API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-ebanx", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_payment",
      description: "Create a payment in EBANX (boleto, credit card, PIX, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer name" },
          email: { type: "string", description: "Customer email" },
          country: { type: "string", description: "Country code (e.g. BR)" },
          payment_type_code: { type: "string", enum: ["boleto", "creditcard", "pix", "debitcard"], description: "Payment type" },
          merchant_payment_code: { type: "string", description: "Unique merchant payment code" },
          currency_code: { type: "string", description: "Currency (e.g. BRL, USD)" },
          amount_total: { type: "number", description: "Total amount" },
          document: { type: "string", description: "CPF or CNPJ" },
        },
        required: ["name", "email", "country", "payment_type_code", "merchant_payment_code", "currency_code", "amount_total", "document"],
      },
    },
    {
      name: "get_payment",
      description: "Get payment details by hash",
      inputSchema: {
        type: "object",
        properties: {
          hash: { type: "string", description: "Payment hash returned on creation" },
        },
        required: ["hash"],
      },
    },
    {
      name: "list_payments",
      description: "List payments by date range",
      inputSchema: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          page: { type: "number", description: "Page number" },
        },
        required: ["date_from", "date_to"],
      },
    },
    {
      name: "refund",
      description: "Refund a payment (full or partial)",
      inputSchema: {
        type: "object",
        properties: {
          hash: { type: "string", description: "Payment hash" },
          amount: { type: "number", description: "Amount to refund (omit for full)" },
          description: { type: "string", description: "Refund reason" },
        },
        required: ["hash"],
      },
    },
    {
      name: "create_payout",
      description: "Create a payout to a bank account",
      inputSchema: {
        type: "object",
        properties: {
          external_reference: { type: "string", description: "Unique payout reference" },
          country: { type: "string", description: "Country code (e.g. BR)" },
          amount: { type: "number", description: "Amount to send" },
          currency_code: { type: "string", description: "Currency code" },
          payee_name: { type: "string", description: "Payee full name" },
          payee_document: { type: "string", description: "Payee CPF/CNPJ" },
          payee_bank_code: { type: "string", description: "Bank code" },
          payee_bank_branch: { type: "string", description: "Branch number" },
          payee_bank_account: { type: "string", description: "Account number" },
          payee_bank_account_type: { type: "string", enum: ["C", "S"], description: "Account type (C=checking, S=savings)" },
        },
        required: ["external_reference", "country", "amount", "currency_code", "payee_name", "payee_document"],
      },
    },
    {
      name: "exchange_rate",
      description: "Get current exchange rate for a currency pair",
      inputSchema: {
        type: "object",
        properties: {
          currency_code: { type: "string", description: "Currency code (e.g. BRL)" },
        },
        required: ["currency_code"],
      },
    },
    {
      name: "get_banks",
      description: "List available banks for a country",
      inputSchema: {
        type: "object",
        properties: {
          country: { type: "string", description: "Country code (e.g. BR)" },
        },
        required: ["country"],
      },
    },
    {
      name: "query_payment_by_merchant_code",
      description: "Get payment details by merchant_payment_code (alternative to hash)",
      inputSchema: {
        type: "object",
        properties: {
          merchant_payment_code: { type: "string", description: "Merchant-issued payment code" },
        },
        required: ["merchant_payment_code"],
      },
    },
    {
      name: "capture_payment",
      description: "Capture a previously authorized credit card payment (full or partial).",
      inputSchema: {
        type: "object",
        properties: {
          hash: { type: "string", description: "Payment hash to capture" },
          amount: { type: "number", description: "Amount to capture (omit for full)" },
        },
        required: ["hash"],
      },
    },
    {
      name: "cancel_payment",
      description: "Cancel/void a pending payment by hash (e.g. unpaid boleto, authorized card).",
      inputSchema: {
        type: "object",
        properties: {
          hash: { type: "string", description: "Payment hash to cancel" },
        },
        required: ["hash"],
      },
    },
    {
      name: "create_mass_payout",
      description: "Create a mass payout — multiple payouts in a single batch request.",
      inputSchema: {
        type: "object",
        properties: {
          payouts: {
            type: "array",
            description: "Array of payout objects (same shape as create_payout)",
            items: { type: "object" },
          },
        },
        required: ["payouts"],
      },
    },
    {
      name: "get_payout",
      description: "Query a payout by external_reference or payout id.",
      inputSchema: {
        type: "object",
        properties: {
          external_reference: { type: "string", description: "Payout external reference" },
          id: { type: "string", description: "Payout id (alternative to external_reference)" },
        },
      },
    },
    {
      name: "simulate_payment",
      description: "Simulate the response of a payment in sandbox without persisting it (useful for integration testing).",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          country: { type: "string" },
          payment_type_code: { type: "string" },
          merchant_payment_code: { type: "string" },
          currency_code: { type: "string" },
          amount_total: { type: "number" },
          document: { type: "string" },
        },
        required: ["name", "email", "country", "payment_type_code", "currency_code", "amount_total"],
      },
    },
    {
      name: "list_payment_methods",
      description: "List available payment methods for a country (which payment_type_codes are supported).",
      inputSchema: {
        type: "object",
        properties: {
          country: { type: "string", description: "Country code (e.g. BR, MX, CO, AR, PE, CL)" },
        },
        required: ["country"],
      },
    },
    {
      name: "create_card_token",
      description: "Tokenize a credit/debit card for reuse without re-collecting card data.",
      inputSchema: {
        type: "object",
        properties: {
          country: { type: "string", description: "Country code" },
          payment_type_code: { type: "string", description: "Card brand (e.g. visa, mastercard, amex)" },
          creditcard: {
            type: "object",
            description: "Card data: card_number, card_name, card_due_date (MM/YYYY), card_cvv",
          },
        },
        required: ["country", "payment_type_code", "creditcard"],
      },
    },
    {
      name: "delete_card_token",
      description: "Delete a previously stored card token.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Card token to delete" },
          country: { type: "string", description: "Country code" },
        },
        required: ["token"],
      },
    },
    {
      name: "validate_document",
      description: "Validate a LATAM tax document (CPF/CNPJ for BR, RFC for MX, DNI for AR/PE) using checksum/format rules. Local validation, no API call.",
      inputSchema: {
        type: "object",
        properties: {
          document: { type: "string", description: "Document number" },
          type: { type: "string", enum: ["CPF", "CNPJ", "RFC", "DNI", "RUT", "CC"], description: "Document type" },
        },
        required: ["document", "type"],
      },
    },
    {
      name: "verify_notification",
      description: "Verify an EBANX webhook notification HMAC signature against the integration key. Local verification, no API call.",
      inputSchema: {
        type: "object",
        properties: {
          payload: { type: "string", description: "Raw notification body (string)" },
          signature: { type: "string", description: "Signature header value (e.g. x-ebanx-signature)" },
          secret: { type: "string", description: "Webhook secret (defaults to EBANX_INTEGRATION_KEY)" },
        },
        required: ["payload", "signature"],
      },
    },
  ],
}));

function validateDocument(doc: string, type: string): { valid: boolean; reason?: string } {
  const digits = doc.replace(/\D/g, "");
  switch (type) {
    case "CPF": {
      if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return { valid: false, reason: "CPF must be 11 digits, not all equal" };
      const calc = (slice: number) => {
        let sum = 0;
        for (let i = 0; i < slice; i++) sum += parseInt(digits[i], 10) * (slice + 1 - i);
        const r = (sum * 10) % 11;
        return r === 10 ? 0 : r;
      };
      return { valid: calc(9) === parseInt(digits[9], 10) && calc(10) === parseInt(digits[10], 10) };
    }
    case "CNPJ": {
      if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return { valid: false, reason: "CNPJ must be 14 digits" };
      const calc = (len: number) => {
        const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
        let sum = 0;
        for (let i = 0; i < len; i++) sum += parseInt(digits[i], 10) * weights[i];
        const r = sum % 11;
        return r < 2 ? 0 : 11 - r;
      };
      return { valid: calc(12) === parseInt(digits[12], 10) && calc(13) === parseInt(digits[13], 10) };
    }
    case "RFC":
      return { valid: /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/i.test(doc.trim()), reason: "RFC format check" };
    case "DNI":
      return { valid: digits.length >= 7 && digits.length <= 9, reason: "DNI numeric length" };
    case "RUT":
      return { valid: /^\d{7,8}-[\dkK]$/.test(doc.trim()), reason: "RUT format like 12345678-9" };
    case "CC":
      return { valid: digits.length >= 6 && digits.length <= 11, reason: "CC numeric length (CO)" };
    default:
      return { valid: false, reason: `Unsupported type: ${type}` };
  }
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_payment":
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("POST", "/direct", { payment: args }), null, 2) }] };
      case "get_payment":
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("GET", "/query", { hash: String(args?.hash) }), null, 2) }] };
      case "list_payments": {
        const params: Record<string, string> = {
          date_from: String(args?.date_from),
          date_to: String(args?.date_to),
        };
        if (args?.page) params.page = String(args.page);
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("GET", "/query", params), null, 2) }] };
      }
      case "refund": {
        const body: Record<string, unknown> = { hash: args?.hash };
        if (args?.amount) body.amount = args.amount;
        if (args?.description) body.description = args.description;
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("POST", "/refund", body), null, 2) }] };
      }
      case "create_payout":
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("POST", "/payout", args), null, 2) }] };
      case "exchange_rate":
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("GET", "/exchange", { currency_code: String(args?.currency_code) }), null, 2) }] };
      case "get_banks":
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("GET", "/getBankList", { country: String(args?.country) }), null, 2) }] };
      case "query_payment_by_merchant_code":
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("GET", "/query", { merchant_payment_code: String(args?.merchant_payment_code) }), null, 2) }] };
      case "capture_payment": {
        const body: Record<string, unknown> = { hash: args?.hash };
        if (args?.amount) body.amount = args.amount;
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("POST", "/capture", body), null, 2) }] };
      }
      case "cancel_payment":
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("POST", "/cancel", { hash: args?.hash }), null, 2) }] };
      case "create_mass_payout":
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("POST", "/payout/mass", { payouts: args?.payouts }), null, 2) }] };
      case "get_payout": {
        const params: Record<string, string> = {};
        if (args?.external_reference) params.external_reference = String(args.external_reference);
        if (args?.id) params.id = String(args.id);
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("GET", "/payout/query", params), null, 2) }] };
      }
      case "simulate_payment":
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("POST", "/simulatePayment", { payment: args }), null, 2) }] };
      case "list_payment_methods":
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("GET", "/merchantPaymentOptions", { country: String(args?.country) }), null, 2) }] };
      case "create_card_token":
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("POST", "/token", args), null, 2) }] };
      case "delete_card_token": {
        const body: Record<string, unknown> = { token: args?.token };
        if (args?.country) body.country = args.country;
        return { content: [{ type: "text", text: JSON.stringify(await ebanxRequest("POST", "/token/delete", body), null, 2) }] };
      }
      case "validate_document": {
        const result = validateDocument(String(args?.document), String(args?.type));
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "verify_notification": {
        const secret = String(args?.secret || INTEGRATION_KEY);
        const expected = createHmac("sha256", secret).update(String(args?.payload)).digest("hex");
        const provided = String(args?.signature || "").replace(/^sha256=/, "");
        let valid = false;
        try {
          const a = Buffer.from(expected, "hex");
          const b = Buffer.from(provided, "hex");
          valid = a.length === b.length && timingSafeEqual(a, b);
        } catch {
          valid = false;
        }
        return { content: [{ type: "text", text: JSON.stringify({ valid, expected }, null, 2) }] };
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
    app.get("/health", (_req: any, res: any) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: any, res: any) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req, res, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-ebanx", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
