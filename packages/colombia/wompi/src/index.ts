#!/usr/bin/env node

/**
 * MCP Server for Wompi — Colombian payment gateway (by Bancolombia).
 *
 * Tools:
 * - create_transaction: Create a payment transaction
 * - get_transaction: Get transaction by ID
 * - list_transactions: List transactions
 * - search_transaction_by_reference: Find transaction by merchant reference
 * - void_transaction: Void a transaction
 * - create_payment_link: Create a payment link
 * - get_payment_link: Get payment link details
 * - update_payment_link: Update a payment link
 * - list_payment_links: List payment links
 * - list_payment_methods: List available payment methods
 * - get_acceptance_token: Get merchant acceptance token
 * - create_tokenized_card: Tokenize a credit card
 * - create_tokenized_nequi: Tokenize a Nequi wallet (phone)
 * - get_tokenization_status: Query async tokenization status
 * - create_payment_source: Create payment source (card, nequi, PSE)
 * - create_customer: Create a customer
 * - get_customer: Get customer by ID
 * - list_financial_institutions: List PSE banks
 * - create_refund: Create a refund
 * - get_refund: Get refund details
 * - get_merchant: Get merchant information
 * - validate_webhook_signature: Validate Wompi webhook checksum
 *
 * Environment:
 *   WOMPI_PUBLIC_KEY  — Public key
 *   WOMPI_PRIVATE_KEY — Private key (Bearer token)
 *   WOMPI_EVENTS_SECRET — Events/webhook secret (for signature validation)
 *   WOMPI_SANDBOX     — "true" for sandbox environment
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

const PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || "";
const EVENTS_SECRET = process.env.WOMPI_EVENTS_SECRET || "";
const IS_SANDBOX = process.env.WOMPI_SANDBOX === "true";
const BASE_URL = IS_SANDBOX
  ? "https://sandbox.wompi.co/v1"
  : "https://production.wompi.co/v1";

async function wompiRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${PRIVATE_KEY}`,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Wompi API ${res.status}: ${err}`);
  }
  return res.json();
}

async function wompiPublicRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${PUBLIC_KEY}`,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Wompi API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-wompi", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_transaction",
      description: "Create a payment transaction",
      inputSchema: {
        type: "object",
        properties: {
          amount_in_cents: { type: "number", description: "Amount in cents (COP)" },
          currency: { type: "string", description: "Currency code (COP)" },
          customer_email: { type: "string", description: "Customer email" },
          reference: { type: "string", description: "Unique transaction reference" },
          payment_method: {
            type: "object",
            description: "Payment method details",
            properties: {
              type: { type: "string", description: "Payment type (CARD, NEQUI, PSE, BANCOLOMBIA_TRANSFER)" },
              token: { type: "string", description: "Tokenized card token (for CARD)" },
              installments: { type: "number", description: "Number of installments (for CARD)" },
              phone_number: { type: "string", description: "Phone number (for NEQUI)" },
              user_type: { type: "number", description: "User type: 0=Natural, 1=Legal (for PSE)" },
              financial_institution_code: { type: "string", description: "Bank code (for PSE)" },
              payment_description: { type: "string", description: "Description (for PSE)" },
            },
            required: ["type"],
          },
          acceptance_token: { type: "string", description: "Acceptance token from get_acceptance_token" },
          customer_data: {
            type: "object",
            description: "Customer data",
            properties: {
              full_name: { type: "string", description: "Full name" },
              phone_number: { type: "string", description: "Phone number" },
              legal_id: { type: "string", description: "Legal ID (cedula)" },
              legal_id_type: { type: "string", description: "Legal ID type (CC, NIT, CE)" },
            },
          },
        },
        required: ["amount_in_cents", "currency", "customer_email", "reference", "payment_method"],
      },
    },
    {
      name: "get_transaction",
      description: "Get transaction details by ID",
      inputSchema: {
        type: "object",
        properties: { transactionId: { type: "string", description: "Transaction ID" } },
        required: ["transactionId"],
      },
    },
    {
      name: "list_transactions",
      description: "List transactions",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "search_transaction_by_reference",
      description: "Find transaction(s) by merchant reference",
      inputSchema: {
        type: "object",
        properties: { reference: { type: "string", description: "Merchant reference" } },
        required: ["reference"],
      },
    },
    {
      name: "void_transaction",
      description: "Void a transaction",
      inputSchema: {
        type: "object",
        properties: { transactionId: { type: "string", description: "Transaction ID" } },
        required: ["transactionId"],
      },
    },
    {
      name: "create_payment_link",
      description: "Create a payment link",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Payment link name" },
          description: { type: "string", description: "Description" },
          single_use: { type: "boolean", description: "Whether single use" },
          collect_shipping: { type: "boolean", description: "Collect shipping info" },
          amount_in_cents: { type: "number", description: "Amount in cents" },
          currency: { type: "string", description: "Currency (COP)" },
          expires_at: { type: "string", description: "Expiration date (ISO 8601)" },
        },
        required: ["name", "amount_in_cents", "currency"],
      },
    },
    {
      name: "get_payment_link",
      description: "Get payment link details",
      inputSchema: {
        type: "object",
        properties: { linkId: { type: "string", description: "Payment link ID" } },
        required: ["linkId"],
      },
    },
    {
      name: "update_payment_link",
      description: "Update a payment link",
      inputSchema: {
        type: "object",
        properties: {
          linkId: { type: "string", description: "Payment link ID" },
          name: { type: "string", description: "Payment link name" },
          description: { type: "string", description: "Description" },
          single_use: { type: "boolean", description: "Whether single use" },
          collect_shipping: { type: "boolean", description: "Collect shipping info" },
          amount_in_cents: { type: "number", description: "Amount in cents" },
          currency: { type: "string", description: "Currency (COP)" },
          expires_at: { type: "string", description: "Expiration date (ISO 8601)" },
        },
        required: ["linkId"],
      },
    },
    {
      name: "list_payment_links",
      description: "List payment links",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          per_page: { type: "number", description: "Results per page" },
        },
      },
    },
    {
      name: "list_payment_methods",
      description: "List available payment methods for the merchant",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_acceptance_token",
      description: "Get merchant acceptance token (required for transactions)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_tokenized_card",
      description: "Tokenize a credit/debit card",
      inputSchema: {
        type: "object",
        properties: {
          number: { type: "string", description: "Card number" },
          cvc: { type: "string", description: "CVC code" },
          exp_month: { type: "string", description: "Expiration month (MM)" },
          exp_year: { type: "string", description: "Expiration year (YY)" },
          card_holder: { type: "string", description: "Cardholder name" },
        },
        required: ["number", "cvc", "exp_month", "exp_year", "card_holder"],
      },
    },
    {
      name: "create_tokenized_nequi",
      description: "Tokenize a Nequi wallet (start async tokenization by phone number)",
      inputSchema: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Nequi phone number (10 digits)" },
        },
        required: ["phone_number"],
      },
    },
    {
      name: "get_tokenization_status",
      description: "Query async tokenization status (Nequi etc.) by tokenization id",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Tokenization type (nequi)" },
          tokenizationId: { type: "string", description: "Tokenization ID returned by create_tokenized_nequi" },
        },
        required: ["type", "tokenizationId"],
      },
    },
    {
      name: "create_payment_source",
      description: "Create a reusable payment source (CARD/NEQUI/PSE) linked to a customer email",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "CARD | NEQUI | PSE" },
          token: { type: "string", description: "Token id (card or nequi token)" },
          customer_email: { type: "string", description: "Customer email" },
          acceptance_token: { type: "string", description: "Acceptance token from get_acceptance_token" },
        },
        required: ["type", "token", "customer_email", "acceptance_token"],
      },
    },
    {
      name: "create_customer",
      description: "Create a customer profile",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Customer email" },
          full_name: { type: "string", description: "Full name" },
          phone_number: { type: "string", description: "Phone number" },
          legal_id: { type: "string", description: "Legal ID (cedula)" },
          legal_id_type: { type: "string", description: "Legal ID type (CC, NIT, CE)" },
        },
        required: ["email"],
      },
    },
    {
      name: "get_customer",
      description: "Get customer by ID",
      inputSchema: {
        type: "object",
        properties: { customerId: { type: "string", description: "Customer ID" } },
        required: ["customerId"],
      },
    },
    {
      name: "list_financial_institutions",
      description: "List PSE banks (financial institutions)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_refund",
      description: "Create a refund for a transaction",
      inputSchema: {
        type: "object",
        properties: {
          transaction_id: { type: "string", description: "Transaction ID to refund" },
          amount_in_cents: { type: "number", description: "Amount in cents (optional, omits = full refund)" },
        },
        required: ["transaction_id"],
      },
    },
    {
      name: "get_refund",
      description: "Get refund details by ID",
      inputSchema: {
        type: "object",
        properties: { refundId: { type: "string", description: "Refund ID" } },
        required: ["refundId"],
      },
    },
    {
      name: "get_merchant",
      description: "Get merchant information",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "validate_webhook_signature",
      description: "Validate a Wompi event signature. Accepts either the properties-based checksum (SHA-256 of ordered props + timestamp + WOMPI_EVENTS_SECRET) or a raw-body HMAC-SHA256 signature.",
      inputSchema: {
        type: "object",
        properties: {
          mode: { type: "string", description: "'properties' (default) or 'hmac'" },
          properties: { type: "array", description: "Ordered list of property values concatenated before hashing (properties mode)", items: { type: "string" } },
          timestamp: { type: "string", description: "Event timestamp (properties mode)" },
          checksum: { type: "string", description: "Expected checksum from event payload (properties mode)" },
          raw_body: { type: "string", description: "Raw JSON body of the event (hmac mode)" },
          signature: { type: "string", description: "Signature header value (hmac mode)" },
          secret: { type: "string", description: "Override secret; defaults to WOMPI_EVENTS_SECRET env" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_transaction": {
        const payload: any = {
          amount_in_cents: args?.amount_in_cents,
          currency: args?.currency,
          customer_email: args?.customer_email,
          reference: args?.reference,
          payment_method: args?.payment_method,
        };
        if (args?.acceptance_token) payload.acceptance_token = args.acceptance_token;
        if (args?.customer_data) payload.customer_data = args.customer_data;
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("POST", "/transactions", payload), null, 2) }] };
      }
      case "get_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("GET", `/transactions/${args?.transactionId}`), null, 2) }] };
      case "list_transactions": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("GET", `/transactions?${params}`), null, 2) }] };
      }
      case "search_transaction_by_reference": {
        const params = new URLSearchParams();
        params.set("reference", String(args?.reference));
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("GET", `/transactions?${params}`), null, 2) }] };
      }
      case "void_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("POST", `/transactions/${args?.transactionId}/void`), null, 2) }] };
      case "create_payment_link": {
        const payload: any = {
          name: args?.name,
          amount_in_cents: args?.amount_in_cents,
          currency: args?.currency,
        };
        if (args?.description) payload.description = args.description;
        if (args?.single_use !== undefined) payload.single_use = args.single_use;
        if (args?.collect_shipping !== undefined) payload.collect_shipping = args.collect_shipping;
        if (args?.expires_at) payload.expires_at = args.expires_at;
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("POST", "/payment_links", payload), null, 2) }] };
      }
      case "get_payment_link":
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("GET", `/payment_links/${args?.linkId}`), null, 2) }] };
      case "update_payment_link": {
        const payload: any = {};
        if (args?.name) payload.name = args.name;
        if (args?.description) payload.description = args.description;
        if (args?.single_use !== undefined) payload.single_use = args.single_use;
        if (args?.collect_shipping !== undefined) payload.collect_shipping = args.collect_shipping;
        if (args?.amount_in_cents) payload.amount_in_cents = args.amount_in_cents;
        if (args?.currency) payload.currency = args.currency;
        if (args?.expires_at) payload.expires_at = args.expires_at;
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("PUT", `/payment_links/${args?.linkId}`, payload), null, 2) }] };
      }
      case "list_payment_links": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("GET", `/payment_links?${params}`), null, 2) }] };
      }
      case "list_payment_methods":
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("GET", `/merchants/${PUBLIC_KEY}`), null, 2) }] };
      case "get_acceptance_token":
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("GET", `/merchants/${PUBLIC_KEY}`), null, 2) }] };
      case "create_tokenized_card":
        return { content: [{ type: "text", text: JSON.stringify(await wompiPublicRequest("POST", "/tokens/cards", {
          number: args?.number,
          cvc: args?.cvc,
          exp_month: args?.exp_month,
          exp_year: args?.exp_year,
          card_holder: args?.card_holder,
        }), null, 2) }] };
      case "create_tokenized_nequi":
        return { content: [{ type: "text", text: JSON.stringify(await wompiPublicRequest("POST", "/tokens/nequi", {
          phone_number: args?.phone_number,
        }), null, 2) }] };
      case "get_tokenization_status":
        return { content: [{ type: "text", text: JSON.stringify(await wompiPublicRequest("GET", `/tokens/${args?.type}/${args?.tokenizationId}`), null, 2) }] };
      case "create_payment_source":
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("POST", "/payment_sources", {
          type: args?.type,
          token: args?.token,
          customer_email: args?.customer_email,
          acceptance_token: args?.acceptance_token,
        }), null, 2) }] };
      case "create_customer": {
        const payload: any = { email: args?.email };
        if (args?.full_name) payload.full_name = args.full_name;
        if (args?.phone_number) payload.phone_number = args.phone_number;
        if (args?.legal_id) payload.legal_id = args.legal_id;
        if (args?.legal_id_type) payload.legal_id_type = args.legal_id_type;
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("POST", "/customers", payload), null, 2) }] };
      }
      case "get_customer":
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("GET", `/customers/${args?.customerId}`), null, 2) }] };
      case "list_financial_institutions":
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("GET", "/pse/financial_institutions"), null, 2) }] };
      case "create_refund": {
        const payload: any = { transaction_id: args?.transaction_id };
        if (args?.amount_in_cents) payload.amount_in_cents = args.amount_in_cents;
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("POST", "/refunds", payload), null, 2) }] };
      }
      case "get_refund":
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("GET", `/refunds/${args?.refundId}`), null, 2) }] };
      case "get_merchant":
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("GET", `/merchants/${PUBLIC_KEY}`), null, 2) }] };
      case "validate_webhook_signature": {
        const secret = args?.secret || EVENTS_SECRET;
        if (!secret) {
          return { content: [{ type: "text", text: "Error: WOMPI_EVENTS_SECRET not configured" }], isError: true };
        }
        const mode = args?.mode || "properties";
        if (mode === "hmac") {
          const raw = String(args?.raw_body || "");
          const sig = String(args?.signature || "");
          const computed = createHmac("sha256", secret).update(raw).digest("hex");
          const a = Buffer.from(computed);
          const b = Buffer.from(sig);
          const valid = a.length === b.length && timingSafeEqual(a, b);
          return { content: [{ type: "text", text: JSON.stringify({ valid, computed }, null, 2) }] };
        }
        const props: string[] = Array.isArray(args?.properties) ? args.properties : [];
        const ts = String(args?.timestamp || "");
        const checksum = String(args?.checksum || "");
        const concatenated = props.join("") + ts + secret;
        const computed = createHash("sha256").update(concatenated).digest("hex");
        const a = Buffer.from(computed);
        const b = Buffer.from(checksum);
        const valid = a.length === b.length && timingSafeEqual(a, b);
        return { content: [{ type: "text", text: JSON.stringify({ valid, computed }, null, 2) }] };
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
        const s = new Server({ name: "mcp-wompi", version: "0.2.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
