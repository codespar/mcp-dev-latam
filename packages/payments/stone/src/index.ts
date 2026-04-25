#!/usr/bin/env node

/**
 * MCP Server for Stone — Brazilian acquirer + open banking.
 *
 * Covers Stone OpenBank (accounts, balance, Pix, boleto, transfers),
 * Stone acquiring (card charges, tokenization, refunds, cancels,
 * anticipations, receivables) and Stone/TON terminals (POS status).
 *
 * Tools (21):
 *   Banking / accounts
 *     - get_balance
 *     - list_transactions
 *     - get_statement
 *   Payments / transfers (OpenBank)
 *     - create_payment
 *     - get_payment
 *     - list_payments
 *     - create_transfer
 *     - create_pix_payment
 *     - create_pix_charge
 *     - create_boleto
 *   Acquiring (charges / cards)
 *     - create_card_charge
 *     - tokenize_card
 *     - refund_transaction
 *     - cancel_transaction
 *   Anticipations / receivables
 *     - create_anticipation
 *     - get_anticipation_limits
 *     - list_receivables
 *   Terminals (Stone / TON POS)
 *     - list_terminals
 *     - get_terminal_status
 *   Webhooks
 *     - register_webhook
 *     - list_webhooks
 *
 * Environment:
 *   STONE_CLIENT_ID — OAuth2 client ID
 *   STONE_CLIENT_SECRET — OAuth2 client secret
 *   STONE_BASE_URL — override base URL (default https://api.openbank.stone.com.br/api/v1)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.STONE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.STONE_CLIENT_SECRET || "";
const BASE_URL = process.env.STONE_BASE_URL || "https://api.openbank.stone.com.br/api/v1";

let accessToken = "";
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const res = await fetch("https://login.openbank.stone.com.br/auth/realms/stone_bank/protocol/openid-connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stone OAuth ${res.status}: ${err}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

async function stoneRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stone API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-stone", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // --- Banking: accounts ---
    {
      name: "get_balance",
      description: "Get account balance",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Account ID" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "list_transactions",
      description: "List account transactions",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Account ID" },
          limit: { type: "number", description: "Number of results" },
          cursor: { type: "string", description: "Pagination cursor" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "get_statement",
      description: "Get account statement for a period",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Account ID" },
          start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
          end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
        required: ["account_id"],
      },
    },

    // --- Banking: payments / transfers ---
    {
      name: "create_payment",
      description: "Create a payment via Stone",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Source account ID" },
          amount: { type: "number", description: "Amount in cents" },
          target: {
            type: "object",
            description: "Payment target (bank account or Pix key)",
            properties: {
              account_number: { type: "string" },
              branch_code: { type: "string" },
              institution_code: { type: "string" },
              name: { type: "string" },
              document: { type: "string" },
            },
          },
          description: { type: "string", description: "Payment description" },
        },
        required: ["account_id", "amount", "target"],
      },
    },
    {
      name: "get_payment",
      description: "Get payment details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payment ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_payments",
      description: "List payments with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Account ID" },
          status: { type: "string", description: "Filter by status" },
          limit: { type: "number", description: "Number of results" },
          cursor: { type: "string", description: "Pagination cursor" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "create_transfer",
      description: "Create a bank transfer (internal or external)",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Source account ID" },
          amount: { type: "number", description: "Amount in cents" },
          target_account_id: { type: "string", description: "Target account ID (for internal transfers)" },
          description: { type: "string", description: "Transfer description" },
        },
        required: ["account_id", "amount", "target_account_id"],
      },
    },
    {
      name: "create_pix_payment",
      description: "Create a Pix payment (outbound) via Stone",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Source account ID" },
          amount: { type: "number", description: "Amount in cents" },
          pix_key: { type: "string", description: "Recipient Pix key" },
          pix_key_type: { type: "string", enum: ["cpf", "cnpj", "email", "phone", "evp"], description: "Pix key type" },
          description: { type: "string", description: "Payment description" },
        },
        required: ["account_id", "amount", "pix_key", "pix_key_type"],
      },
    },
    {
      name: "create_pix_charge",
      description: "Create a Pix charge (QR Code / cob) to receive a payment",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Merchant account ID" },
          amount: { type: "number", description: "Amount in cents" },
          expires_in: { type: "number", description: "Expiration (seconds). Default 3600" },
          payer_document: { type: "string", description: "Payer CPF/CNPJ" },
          payer_name: { type: "string", description: "Payer name" },
          description: { type: "string", description: "Charge description" },
        },
        required: ["account_id", "amount"],
      },
    },
    {
      name: "create_boleto",
      description: "Create a boleto bancário for charging a customer",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Merchant account ID" },
          amount: { type: "number", description: "Amount in cents" },
          due_date: { type: "string", description: "Due date (YYYY-MM-DD)" },
          payer: {
            type: "object",
            description: "Payer details",
            properties: {
              name: { type: "string" },
              document: { type: "string", description: "CPF or CNPJ" },
              email: { type: "string" },
              address: { type: "object" },
            },
            required: ["name", "document"],
          },
          description: { type: "string", description: "Boleto description" },
        },
        required: ["account_id", "amount", "due_date", "payer"],
      },
    },

    // --- Acquiring: charges / cards ---
    {
      name: "create_card_charge",
      description: "Charge a credit or debit card (Stone acquiring)",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Merchant account ID" },
          amount: { type: "number", description: "Amount in cents" },
          installments: { type: "number", description: "Number of installments (default 1)" },
          capture: { type: "boolean", description: "Auto-capture (default true). false = authorize only" },
          payment_method: { type: "string", enum: ["credit_card", "debit_card"], description: "Card type" },
          card_token: { type: "string", description: "Previously tokenized card (use tokenize_card)" },
          customer: {
            type: "object",
            description: "Customer details",
            properties: {
              name: { type: "string" },
              document: { type: "string" },
              email: { type: "string" },
            },
          },
          description: { type: "string", description: "Charge description" },
        },
        required: ["account_id", "amount", "card_token"],
      },
    },
    {
      name: "tokenize_card",
      description: "Tokenize a card to PCI-safe token for later charging",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Merchant account ID" },
          number: { type: "string", description: "Card PAN" },
          holder_name: { type: "string", description: "Cardholder name" },
          exp_month: { type: "number", description: "Expiration month (1-12)" },
          exp_year: { type: "number", description: "Expiration year (YYYY)" },
          cvv: { type: "string", description: "Card verification value" },
        },
        required: ["account_id", "number", "holder_name", "exp_month", "exp_year", "cvv"],
      },
    },
    {
      name: "refund_transaction",
      description: "Refund a settled transaction (full or partial)",
      inputSchema: {
        type: "object",
        properties: {
          transaction_id: { type: "string", description: "Transaction / charge ID" },
          amount: { type: "number", description: "Refund amount in cents. Omit for full refund" },
          reason: { type: "string", description: "Reason for refund" },
        },
        required: ["transaction_id"],
      },
    },
    {
      name: "cancel_transaction",
      description: "Cancel an authorized (not-yet-captured) transaction",
      inputSchema: {
        type: "object",
        properties: {
          transaction_id: { type: "string", description: "Transaction ID to cancel" },
          reason: { type: "string", description: "Cancellation reason" },
        },
        required: ["transaction_id"],
      },
    },

    // --- Anticipations / receivables ---
    {
      name: "create_anticipation",
      description: "Anticipate future receivables (Stone's flagship 'antecipação')",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Merchant account ID" },
          amount: { type: "number", description: "Amount in cents to anticipate" },
          timeframe: { type: "string", enum: ["start", "end", "exact"], description: "When to settle (default end)" },
          receivable_ids: {
            type: "array",
            items: { type: "string" },
            description: "Specific receivable IDs to anticipate (optional; else auto-selected)",
          },
        },
        required: ["account_id", "amount"],
      },
    },
    {
      name: "get_anticipation_limits",
      description: "Get current anticipation limits (max / min / available) for a merchant",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Merchant account ID" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "list_receivables",
      description: "Search receivables (future credits from card transactions)",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Merchant account ID" },
          status: { type: "string", description: "Filter by status (e.g. waiting_funds, paid)" },
          payment_date_start: { type: "string", description: "Payment date from (YYYY-MM-DD)" },
          payment_date_end: { type: "string", description: "Payment date to (YYYY-MM-DD)" },
          limit: { type: "number", description: "Page size" },
          cursor: { type: "string", description: "Pagination cursor" },
        },
        required: ["account_id"],
      },
    },

    // --- Terminals (Stone / TON POS) ---
    {
      name: "list_terminals",
      description: "List physical Stone / TON terminals for a merchant",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Merchant account ID" },
          status: { type: "string", description: "Filter by status (active, inactive)" },
          limit: { type: "number", description: "Page size" },
          cursor: { type: "string", description: "Pagination cursor" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "get_terminal_status",
      description: "Get current status of a specific POS terminal (online / offline / last seen)",
      inputSchema: {
        type: "object",
        properties: {
          terminal_id: { type: "string", description: "Terminal serial / ID" },
        },
        required: ["terminal_id"],
      },
    },

    // --- Webhooks ---
    {
      name: "register_webhook",
      description: "Register a webhook endpoint for Stone events",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "HTTPS endpoint to receive events" },
          events: {
            type: "array",
            items: { type: "string" },
            description: "Event types (e.g. payment.paid, pix.received, anticipation.settled)",
          },
          secret: { type: "string", description: "Optional HMAC signing secret" },
        },
        required: ["url", "events"],
      },
    },
    {
      name: "list_webhooks",
      description: "List registered webhook endpoints",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Page size" },
          cursor: { type: "string", description: "Pagination cursor" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = args as Record<string, unknown> | undefined;

  try {
    switch (name) {
      // --- Banking: accounts ---
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("GET", `/accounts/${a?.account_id}/balance`), null, 2) }] };
      case "list_transactions": {
        const params = new URLSearchParams();
        if (a?.limit) params.set("limit", String(a.limit));
        if (a?.cursor) params.set("cursor", String(a.cursor));
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("GET", `/accounts/${a?.account_id}/transactions?${params}`), null, 2) }] };
      }
      case "get_statement": {
        const params = new URLSearchParams();
        if (a?.start_date) params.set("start_date", String(a.start_date));
        if (a?.end_date) params.set("end_date", String(a.end_date));
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("GET", `/accounts/${a?.account_id}/statement?${params}`), null, 2) }] };
      }

      // --- Banking: payments / transfers ---
      case "create_payment":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("POST", `/accounts/${a?.account_id}/payments`, a), null, 2) }] };
      case "get_payment":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("GET", `/payments/${a?.id}`), null, 2) }] };
      case "list_payments": {
        const params = new URLSearchParams();
        if (a?.status) params.set("status", String(a.status));
        if (a?.limit) params.set("limit", String(a.limit));
        if (a?.cursor) params.set("cursor", String(a.cursor));
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("GET", `/accounts/${a?.account_id}/payments?${params}`), null, 2) }] };
      }
      case "create_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("POST", `/accounts/${a?.account_id}/transfers`, a), null, 2) }] };
      case "create_pix_payment":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("POST", `/accounts/${a?.account_id}/pix/payments`, a), null, 2) }] };
      case "create_pix_charge":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("POST", `/accounts/${a?.account_id}/pix/charges`, a), null, 2) }] };
      case "create_boleto":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("POST", `/accounts/${a?.account_id}/boletos`, a), null, 2) }] };

      // --- Acquiring ---
      case "create_card_charge":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("POST", `/accounts/${a?.account_id}/charges`, a), null, 2) }] };
      case "tokenize_card":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("POST", `/accounts/${a?.account_id}/tokens`, a), null, 2) }] };
      case "refund_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("POST", `/charges/${a?.transaction_id}/refund`, { amount: a?.amount, reason: a?.reason }), null, 2) }] };
      case "cancel_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("POST", `/charges/${a?.transaction_id}/cancel`, { reason: a?.reason }), null, 2) }] };

      // --- Anticipations / receivables ---
      case "create_anticipation":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("POST", `/accounts/${a?.account_id}/anticipations`, a), null, 2) }] };
      case "get_anticipation_limits":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("GET", `/accounts/${a?.account_id}/anticipations/limits`), null, 2) }] };
      case "list_receivables": {
        const params = new URLSearchParams();
        if (a?.status) params.set("status", String(a.status));
        if (a?.payment_date_start) params.set("payment_date_start", String(a.payment_date_start));
        if (a?.payment_date_end) params.set("payment_date_end", String(a.payment_date_end));
        if (a?.limit) params.set("limit", String(a.limit));
        if (a?.cursor) params.set("cursor", String(a.cursor));
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("GET", `/accounts/${a?.account_id}/receivables?${params}`), null, 2) }] };
      }

      // --- Terminals ---
      case "list_terminals": {
        const params = new URLSearchParams();
        if (a?.status) params.set("status", String(a.status));
        if (a?.limit) params.set("limit", String(a.limit));
        if (a?.cursor) params.set("cursor", String(a.cursor));
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("GET", `/accounts/${a?.account_id}/terminals?${params}`), null, 2) }] };
      }
      case "get_terminal_status":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("GET", `/terminals/${a?.terminal_id}/status`), null, 2) }] };

      // --- Webhooks ---
      case "register_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("POST", `/webhooks`, a), null, 2) }] };
      case "list_webhooks": {
        const params = new URLSearchParams();
        if (a?.limit) params.set("limit", String(a.limit));
        if (a?.cursor) params.set("cursor", String(a.cursor));
        return { content: [{ type: "text", text: JSON.stringify(await stoneRequest("GET", `/webhooks?${params}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-stone", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
