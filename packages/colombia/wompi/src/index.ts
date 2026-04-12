#!/usr/bin/env node

/**
 * MCP Server for Wompi — Colombian payment gateway (by Bancolombia).
 *
 * Tools:
 * - create_transaction: Create a payment transaction
 * - get_transaction: Get transaction by ID
 * - list_transactions: List transactions
 * - void_transaction: Void a transaction
 * - create_payment_link: Create a payment link
 * - get_payment_link: Get payment link details
 * - list_payment_methods: List available payment methods
 * - get_acceptance_token: Get merchant acceptance token
 * - create_tokenized_card: Tokenize a credit card
 * - get_merchant: Get merchant information
 *
 * Environment:
 *   WOMPI_PUBLIC_KEY  — Public key
 *   WOMPI_PRIVATE_KEY — Private key (Bearer token)
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

const PUBLIC_KEY = process.env.WOMPI_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.WOMPI_PRIVATE_KEY || "";
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

const server = new Server(
  { name: "mcp-wompi", version: "0.1.0" },
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
      name: "get_merchant",
      description: "Get merchant information",
      inputSchema: { type: "object", properties: {} },
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
      case "list_payment_methods":
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("GET", `/merchants/${PUBLIC_KEY}`), null, 2) }] };
      case "get_acceptance_token":
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("GET", `/merchants/${PUBLIC_KEY}`), null, 2) }] };
      case "create_tokenized_card":
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("POST", "/tokens/cards", {
          number: args?.number,
          cvc: args?.cvc,
          exp_month: args?.exp_month,
          exp_year: args?.exp_year,
          card_holder: args?.card_holder,
        }), null, 2) }] };
      case "get_merchant":
        return { content: [{ type: "text", text: JSON.stringify(await wompiRequest("GET", `/merchants/${PUBLIC_KEY}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-wompi", version: "0.1.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
