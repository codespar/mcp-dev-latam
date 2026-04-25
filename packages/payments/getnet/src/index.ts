#!/usr/bin/env node

/**
 * MCP Server for Getnet — Santander-owned Brazilian card acquirer.
 *
 * Getnet is the #3 BR acquirer and the #1 in BR ecommerce (per Santander IR,
 * 2021 data). Together with Cielo and Stone, adding Getnet closes three of
 * the "big four" BR acquirer quadrant. Distinct from per-PSP servers like
 * Zoop or Pagar.me: Getnet is an acquirer, so merchants with a Santander
 * commercial contract integrate directly instead of going through a PSP.
 *
 * Tools (20):
 *   authorize_credit     — authorize a credit-card payment (optional auto-capture)
 *   capture_credit       — capture a previously authorized credit payment
 *   cancel_credit        — cancel an authorized-but-uncaptured credit payment
 *   refund_credit        — refund a captured credit payment (full or partial)
 *   cancel_debit         — cancel a debit-card payment
 *   create_pix           — create a Pix charge, returns QR code + copy-paste payload
 *   query_pix            — retrieve a Pix charge by payment_id
 *   create_boleto        — create a boleto charge
 *   query_boleto         — retrieve a boleto by payment_id
 *   cancel_boleto        — cancel a boleto before payment
 *   get_payment          — retrieve any payment by payment_id
 *   get_payment_by_order — retrieve a payment by merchant order_id
 *   query_installments   — query installment options (amount + brand)
 *   tokenize_card        — PCI-safe card tokenization for reuse (number_token)
 *   create_numtoken      — create a numtoken (PAN-level tokenization) for card-on-file
 *   create_seller        — onboard a marketplace seller (Marketplace Management)
 *   get_seller           — retrieve a seller by id
 *   list_sellers         — list marketplace sellers with filters
 *   create_split         — configure a marketplace split for a subseller
 *   get_statement        — retrieve marketplace statement entries for a period
 *
 * Authentication
 *   OAuth 2.0 Client Credentials. The server calls POST /auth/oauth/v2/token
 *   with Basic auth (client_id:client_secret) and caches the bearer token
 *   in memory until a minute before expiry.
 *
 * Environment
 *   GETNET_CLIENT_ID      OAuth client_id
 *   GETNET_CLIENT_SECRET  OAuth client_secret
 *   GETNET_SELLER_ID      seller_id issued with your merchant contract
 *   GETNET_BASE_URL       optional; defaults to https://api.getnet.com.br
 *                         (use https://api-homologacao.getnet.com.br for sandbox)
 *
 * Docs: https://developers.getnet.com.br
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.GETNET_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GETNET_CLIENT_SECRET || "";
const SELLER_ID = process.env.GETNET_SELLER_ID || "";
const BASE_URL = process.env.GETNET_BASE_URL || "https://api.getnet.com.br";

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${BASE_URL}/auth/oauth/v2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "scope=oob&grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Getnet OAuth ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

async function getnetRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "seller_id": SELLER_ID,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Getnet API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-getnet", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "authorize_credit",
      description: "Authorize a credit-card payment on Getnet. Set delayed=false to authorize+capture atomically; delayed=true to authorize only (use capture_credit later).",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in cents" },
          currency: { type: "string", description: "ISO-4217 currency code (default BRL)" },
          order_id: { type: "string", description: "Merchant-side order identifier" },
          delayed: { type: "boolean", description: "true = authorize only; false = authorize + capture" },
          customer: {
            type: "object",
            description: "Customer identity",
            properties: {
              customer_id: { type: "string", description: "Merchant-side customer id" },
              first_name: { type: "string" },
              last_name: { type: "string" },
              name: { type: "string" },
              email: { type: "string" },
              document_type: { type: "string", enum: ["CPF", "CNPJ"] },
              document_number: { type: "string", description: "CPF or CNPJ digits only" },
              phone_number: { type: "string" },
            },
            required: ["customer_id", "first_name", "last_name", "email", "document_type", "document_number"],
          },
          credit: {
            type: "object",
            description: "Card data (pre-tokenized preferred via number_token)",
            properties: {
              number_token: { type: "string", description: "Token from tokenize_card" },
              cardholder_name: { type: "string" },
              security_code: { type: "string" },
              brand: { type: "string", description: "Visa, Mastercard, Elo, Amex, Hipercard" },
              expiration_month: { type: "string" },
              expiration_year: { type: "string" },
              save_card_data: { type: "boolean" },
              transaction_type: { type: "string", enum: ["FULL", "INSTALL_NO_INTEREST", "INSTALL_WITH_INTEREST"] },
              number_installments: { type: "number" },
              soft_descriptor: { type: "string" },
            },
            required: ["number_token", "cardholder_name", "security_code", "brand", "expiration_month", "expiration_year"],
          },
        },
        required: ["amount", "order_id", "delayed", "customer", "credit"],
      },
    },
    {
      name: "capture_credit",
      description: "Capture a previously authorized credit payment (when delayed=true was used).",
      inputSchema: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "Getnet payment_id from authorize_credit" },
          amount: { type: "number", description: "Amount to capture in cents. Omit to capture the full authorized amount." },
        },
        required: ["payment_id"],
      },
    },
    {
      name: "cancel_credit",
      description: "Cancel an authorized-but-uncaptured credit payment.",
      inputSchema: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "Getnet payment_id" },
        },
        required: ["payment_id"],
      },
    },
    {
      name: "refund_credit",
      description: "Refund a captured credit payment. Pass amount for a partial refund; omit for full.",
      inputSchema: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "Getnet payment_id" },
          amount: { type: "number", description: "Refund amount in cents. Omit for a full refund." },
        },
        required: ["payment_id"],
      },
    },
    {
      name: "create_pix",
      description: "Create a Pix charge. Returns qr_code (image base64), qr_code_text (EMV copy-paste payload) and payment_id. Expires per Getnet defaults unless expires_in is set.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in cents" },
          order_id: { type: "string", description: "Merchant-side order identifier" },
          customer: {
            type: "object",
            description: "Payer identity (CPF/CNPJ required by BCB)",
            properties: {
              customer_id: { type: "string" },
              first_name: { type: "string" },
              last_name: { type: "string" },
              email: { type: "string" },
              document_type: { type: "string", enum: ["CPF", "CNPJ"] },
              document_number: { type: "string" },
            },
            required: ["customer_id", "document_type", "document_number"],
          },
          expires_in: { type: "number", description: "QR code lifetime in seconds (Getnet default applies if omitted)" },
        },
        required: ["amount", "order_id", "customer"],
      },
    },
    {
      name: "create_boleto",
      description: "Create a boleto charge. Returns boleto PDF URL, barcode, and expiration date.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in cents" },
          order_id: { type: "string", description: "Merchant-side order identifier" },
          customer_id: { type: "string", description: "Merchant-side customer id" },
          boleto: {
            type: "object",
            description: "Boleto instructions + payer data",
            properties: {
              document_number: { type: "string", description: "Boleto document number" },
              expiration_date: { type: "string", description: "DD/MM/YYYY" },
              instructions: { type: "string", description: "Free-text instructions shown on boleto" },
              provider: { type: "string", description: "Bank provider identifier (e.g. santander)" },
            },
            required: ["document_number", "expiration_date"],
          },
          customer: {
            type: "object",
            description: "Payer identity",
            properties: {
              first_name: { type: "string" },
              last_name: { type: "string" },
              document_type: { type: "string", enum: ["CPF", "CNPJ"] },
              document_number: { type: "string" },
            },
            required: ["first_name", "last_name", "document_type", "document_number"],
          },
        },
        required: ["amount", "order_id", "customer_id", "boleto", "customer"],
      },
    },
    {
      name: "get_payment",
      description: "Retrieve a payment by Getnet payment_id. Works for credit, debit, Pix, and boleto.",
      inputSchema: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "Getnet payment_id" },
        },
        required: ["payment_id"],
      },
    },
    {
      name: "tokenize_card",
      description: "Tokenize a card for PCI-safe reuse. Returns a number_token to pass into authorize_credit.credit.number_token.",
      inputSchema: {
        type: "object",
        properties: {
          card_number: { type: "string", description: "PAN; never log this value" },
          customer_id: { type: "string", description: "Customer id to associate the token with" },
        },
        required: ["card_number", "customer_id"],
      },
    },
    {
      name: "create_seller",
      description: "Onboard a marketplace seller via Getnet Marketplace Management. Required before routing split payments to a seller.",
      inputSchema: {
        type: "object",
        properties: {
          merchant_id: { type: "string", description: "Marketplace merchant id" },
          legal_document_type: { type: "string", enum: ["CPF", "CNPJ"] },
          legal_document_number: { type: "string" },
          legal_name: { type: "string", description: "Razão social (CNPJ) or full name (CPF)" },
          trade_name: { type: "string", description: "Nome fantasia" },
          mcc: { type: "string", description: "Merchant category code (ISO 18245)" },
          business_address: {
            type: "object",
            description: "Seller commercial address",
            properties: {
              mailing_address_equals: { type: "string", enum: ["S", "N"] },
              street: { type: "string" },
              number: { type: "string" },
              district: { type: "string" },
              city: { type: "string" },
              state: { type: "string" },
              postal_code: { type: "string" },
              country_code: { type: "string", description: "ISO-3166 alpha-3 (e.g. BRA)" },
            },
          },
          bank_accounts: {
            type: "array",
            description: "Seller payout bank accounts",
          },
        },
        required: ["merchant_id", "legal_document_type", "legal_document_number", "legal_name"],
      },
    },
    {
      name: "get_seller",
      description: "Retrieve a seller by Getnet seller_id.",
      inputSchema: {
        type: "object",
        properties: {
          seller_id: { type: "string", description: "Getnet seller_id" },
        },
        required: ["seller_id"],
      },
    },
    {
      name: "list_sellers",
      description: "List marketplace sellers with optional filters.",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number (starts at 1)" },
          limit: { type: "number", description: "Page size" },
          legal_document_number: { type: "string", description: "Filter by CPF/CNPJ" },
          status: { type: "string", description: "Filter by status" },
        },
      },
    },
    {
      name: "cancel_debit",
      description: "Cancel a debit-card payment by Getnet payment_id.",
      inputSchema: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "Getnet payment_id for the debit transaction" },
        },
        required: ["payment_id"],
      },
    },
    {
      name: "query_pix",
      description: "Retrieve a Pix charge by Getnet payment_id. Returns current status (PENDING, APPROVED, CANCELED) and, when paid, the Pix end-to-end id.",
      inputSchema: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "Getnet payment_id returned by create_pix" },
        },
        required: ["payment_id"],
      },
    },
    {
      name: "query_boleto",
      description: "Retrieve a boleto by Getnet payment_id. Returns current status, bank slip URL and barcode.",
      inputSchema: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "Getnet payment_id returned by create_boleto" },
        },
        required: ["payment_id"],
      },
    },
    {
      name: "cancel_boleto",
      description: "Cancel a boleto that has not yet been paid.",
      inputSchema: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "Getnet payment_id for the boleto" },
        },
        required: ["payment_id"],
      },
    },
    {
      name: "get_payment_by_order",
      description: "Retrieve a payment using the merchant-side order_id (handy when you've lost the Getnet payment_id).",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Merchant-side order identifier passed at charge creation" },
        },
        required: ["order_id"],
      },
    },
    {
      name: "query_installments",
      description: "Query the installment plans Getnet offers for a given amount + card brand (with/without interest, max installments, per-installment amount).",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Transaction amount in cents" },
          brand: { type: "string", description: "Card brand: Visa, Mastercard, Elo, Amex, Hipercard" },
          number_installments: { type: "number", description: "Optional: a specific installment count to price" },
        },
        required: ["amount", "brand"],
      },
    },
    {
      name: "create_numtoken",
      description: "Create a numtoken (Getnet card-on-file PAN-level token). Use for recurring or one-click-checkout flows where the merchant stores the numtoken and later hydrates it via tokenize_card to obtain a number_token at authorization time.",
      inputSchema: {
        type: "object",
        properties: {
          card_number: { type: "string", description: "PAN; never log" },
          cardholder_name: { type: "string" },
          expiration_month: { type: "string", description: "MM" },
          expiration_year: { type: "string", description: "YY" },
          customer_id: { type: "string", description: "Merchant-side customer id to associate" },
        },
        required: ["card_number", "cardholder_name", "expiration_month", "expiration_year", "customer_id"],
      },
    },
    {
      name: "create_split",
      description: "Configure a marketplace split rule that routes part of a payment to a subseller. Values are cents; percentages are integers 0-100.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Merchant-side order identifier" },
          marketplace_subseller_payments: {
            type: "array",
            description: "One entry per subseller receiving a split",
            items: {
              type: "object",
              properties: {
                subseller_sales_amount: { type: "number", description: "Amount (cents) routed to this subseller" },
                subseller_rate_amount: { type: "number", description: "Marketplace fee (cents) retained from this subseller" },
                subseller_id: { type: "string", description: "Getnet seller_id of the subseller" },
                order_id: { type: "string", description: "Optional subseller-side order id" },
              },
              required: ["subseller_sales_amount", "subseller_id"],
            },
          },
        },
        required: ["order_id", "marketplace_subseller_payments"],
      },
    },
    {
      name: "get_statement",
      description: "Retrieve marketplace statement entries (sales, fees, payouts) for a subseller in a date range.",
      inputSchema: {
        type: "object",
        properties: {
          subseller_id: { type: "string", description: "Getnet subseller_id" },
          start_date: { type: "string", description: "YYYY-MM-DD start of period (inclusive)" },
          end_date: { type: "string", description: "YYYY-MM-DD end of period (inclusive)" },
          page: { type: "number", description: "Page number (starts at 1)" },
          limit: { type: "number", description: "Page size" },
        },
        required: ["subseller_id", "start_date", "end_date"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "authorize_credit": {
        const body = { ...(args as Record<string, unknown>), seller_id: SELLER_ID };
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("POST", "/v1/payments/credit", body), null, 2) }] };
      }
      case "capture_credit": {
        const paymentId = (args as { payment_id: string }).payment_id;
        const body: Record<string, unknown> = {};
        if ((args as { amount?: number }).amount !== undefined) body.amount = (args as { amount: number }).amount;
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("POST", `/v1/payments/credit/${paymentId}/confirm`, body), null, 2) }] };
      }
      case "cancel_credit": {
        const paymentId = (args as { payment_id: string }).payment_id;
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("POST", `/v1/payments/credit/${paymentId}/cancel`), null, 2) }] };
      }
      case "refund_credit": {
        const paymentId = (args as { payment_id: string }).payment_id;
        const body: Record<string, unknown> = {};
        if ((args as { amount?: number }).amount !== undefined) body.amount = (args as { amount: number }).amount;
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("POST", `/v1/payments/credit/${paymentId}/refund`, body), null, 2) }] };
      }
      case "create_pix": {
        const body = { ...(args as Record<string, unknown>), seller_id: SELLER_ID };
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("POST", "/v1/payments/qrcode/pix", body), null, 2) }] };
      }
      case "create_boleto": {
        const body = { ...(args as Record<string, unknown>), seller_id: SELLER_ID };
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("POST", "/v1/payments/boleto", body), null, 2) }] };
      }
      case "get_payment": {
        const paymentId = (args as { payment_id: string }).payment_id;
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("GET", `/v1/payments/${paymentId}`), null, 2) }] };
      }
      case "tokenize_card":
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("POST", "/v1/tokens/card", args), null, 2) }] };
      case "create_seller":
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("POST", "/v1/mgm/sellers", args), null, 2) }] };
      case "get_seller": {
        const sellerId = (args as { seller_id: string }).seller_id;
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("GET", `/v1/mgm/sellers/${sellerId}`), null, 2) }] };
      }
      case "list_sellers": {
        const params = new URLSearchParams();
        const a = args as Record<string, unknown>;
        if (a?.page) params.set("page", String(a.page));
        if (a?.limit) params.set("limit", String(a.limit));
        if (a?.legal_document_number) params.set("legal_document_number", String(a.legal_document_number));
        if (a?.status) params.set("status", String(a.status));
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("GET", `/v1/mgm/sellers?${params}`), null, 2) }] };
      }
      case "cancel_debit": {
        const paymentId = (args as { payment_id: string }).payment_id;
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("POST", `/v1/payments/debit/${paymentId}/cancel`), null, 2) }] };
      }
      case "query_pix": {
        const paymentId = (args as { payment_id: string }).payment_id;
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("GET", `/v1/payments/qrcode/pix/${paymentId}`), null, 2) }] };
      }
      case "query_boleto": {
        const paymentId = (args as { payment_id: string }).payment_id;
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("GET", `/v1/payments/boleto/${paymentId}`), null, 2) }] };
      }
      case "cancel_boleto": {
        const paymentId = (args as { payment_id: string }).payment_id;
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("POST", `/v1/payments/boleto/${paymentId}/cancel`), null, 2) }] };
      }
      case "get_payment_by_order": {
        const orderId = (args as { order_id: string }).order_id;
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("GET", `/v1/payments?order_id=${encodeURIComponent(orderId)}`), null, 2) }] };
      }
      case "query_installments": {
        const a = args as { amount: number; brand: string; number_installments?: number };
        const params = new URLSearchParams();
        params.set("amount", String(a.amount));
        params.set("brand", a.brand);
        if (a.number_installments !== undefined) params.set("number_installments", String(a.number_installments));
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("GET", `/v1/installments?${params}`), null, 2) }] };
      }
      case "create_numtoken":
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("POST", "/v1/tokens/numtoken", args), null, 2) }] };
      case "create_split": {
        const body = { ...(args as Record<string, unknown>), marketplace_id: SELLER_ID };
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("POST", "/v1/mgm/split", body), null, 2) }] };
      }
      case "get_statement": {
        const a = args as { subseller_id: string; start_date: string; end_date: string; page?: number; limit?: number };
        const params = new URLSearchParams();
        params.set("subseller_id", a.subseller_id);
        params.set("start_date", a.start_date);
        params.set("end_date", a.end_date);
        if (a.page !== undefined) params.set("page", String(a.page));
        if (a.limit !== undefined) params.set("limit", String(a.limit));
        return { content: [{ type: "text", text: JSON.stringify(await getnetRequest("GET", `/v1/mgm/statement?${params}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-getnet", version: "0.2.1" }, { capabilities: { tools: {} } });
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
