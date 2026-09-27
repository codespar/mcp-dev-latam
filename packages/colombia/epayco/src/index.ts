#!/usr/bin/env node

/**
 * MCP Server for ePayco — Colombian payment gateway (Davivienda-owned).
 *
 * ePayco covers the broadest inbound mix in Colombia: cards (with
 * tokenization), PSE bank debit, Daviplata, and the cash networks
 * (Efecty, Gana, Red Servi, Punto Red, Su Red). This server mirrors
 * the endpoint set of the official ePayco SDKs (epayco-node), which
 * splits across two hosts: the card/token API (api.secure.payco.co)
 * and the restpagos API (secure.payco.co) for PSE and cash.
 *
 * Tools (8):
 *   tokenize_card       — create a card token (POST /v1/tokens)
 *   create_customer     — create a customer bound to a card token (POST /payment/v1/customer/create)
 *   charge_card         — charge a tokenized card (POST /payment/v1/charge/create)
 *   get_transaction     — transaction detail by referencePayco (GET validation/v1/reference/{ref})
 *   create_pse_payment  — PSE bank-debit payment (POST /restpagos/pagos/debitos.json)
 *   get_pse_transaction — PSE transaction status (GET /restpagos/pse/transactioninfo.json)
 *   list_pse_banks      — PSE bank list (GET /restpagos/pse/bancos.json)
 *   create_cash_payment — cash payment: efecty / gana / redservi / puntored / sured (POST /restpagos/v2/efectivo/{network})
 *
 * Authentication
 *   Card/token API:  Authorization: Basic base64(PUBLIC_KEY:PRIVATE_KEY)
 *   restpagos API:   public key travels in the payload/query (SDK convention)
 *
 * Environment
 *   EPAYCO_PUBLIC_KEY   — public key (required)
 *   EPAYCO_PRIVATE_KEY  — private key (required)
 *   EPAYCO_TEST         — "true" flags payloads as test mode (default: "true")
 *
 * Docs: https://docs.epayco.com
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const PUBLIC_KEY = process.env.EPAYCO_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.EPAYCO_PRIVATE_KEY || "";
const IS_TEST = (process.env.EPAYCO_TEST || "true").toLowerCase() !== "false";

const API_URL = process.env.EPAYCO_BASE_URL || "https://api.secure.payco.co";
const REST_URL = process.env.EPAYCO_REST_URL || "https://secure.payco.co";
const VALIDATION_URL = process.env.EPAYCO_VALIDATION_URL || "https://secure.epayco.co";

/** Card/token API — Basic auth with the key pair (SDK convention). */
async function apiRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const basic = Buffer.from(`${PUBLIC_KEY}:${PRIVATE_KEY}`).toString("base64");
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": `Basic ${basic}`,
      "type": "sdk",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ePayco API ${res.status}: ${err}`);
  }
  return res.json();
}

/** restpagos / validation APIs — public key in payload or query (SDK convention). */
async function restRequest(base: string, method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ePayco API ${res.status}: ${err}`);
  }
  return res.json();
}

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new Server(
  { name: "mcp-epayco", version: "0.1.0" },
  { capabilities: { tools: {} }, instructions: MANAGED_TIER_HINT },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "tokenize_card",
      description:
        "Create a one-time card token (POST /v1/tokens on api.secure.payco.co). The token is then bound to a customer via create_customer and charged via charge_card.",
      inputSchema: {
        type: "object",
        properties: {
          card_number: { type: "string", description: "Card PAN" },
          exp_year: { type: "string", description: "Expiry year, e.g. 2027" },
          exp_month: { type: "string", description: "Expiry month, e.g. 09" },
          cvc: { type: "string", description: "Card CVC" },
        },
        required: ["card_number", "exp_year", "exp_month", "cvc"],
      },
    },
    {
      name: "create_customer",
      description:
        "Create an ePayco customer bound to a card token (POST /payment/v1/customer/create). Returns customer_id used by charge_card.",
      inputSchema: {
        type: "object",
        properties: {
          token_card: { type: "string", description: "Card token from tokenize_card" },
          name: { type: "string", description: "Customer first name" },
          last_name: { type: "string", description: "Customer last name" },
          email: { type: "string", description: "Customer email" },
          phone: { type: "string", description: "Customer phone" },
          default: { type: "boolean", description: "Set this card as the customer default (default true)" },
        },
        required: ["token_card", "name", "email"],
      },
    },
    {
      name: "charge_card",
      description:
        "Charge a tokenized card (POST /payment/v1/charge/create). Amounts in COP unless currency says otherwise. Test mode is controlled by EPAYCO_TEST.",
      inputSchema: {
        type: "object",
        properties: {
          token_card: { type: "string", description: "Card token" },
          customer_id: { type: "string", description: "Customer id from create_customer" },
          doc_type: { type: "string", description: "Payer document type: CC, CE, NIT, ..." },
          doc_number: { type: "string", description: "Payer document number" },
          name: { type: "string", description: "Payer first name" },
          last_name: { type: "string", description: "Payer last name" },
          email: { type: "string", description: "Payer email" },
          bill: { type: "string", description: "Merchant invoice/order reference" },
          description: { type: "string", description: "Charge description" },
          value: { type: "string", description: "Amount (string, e.g. \"116000\")" },
          tax: { type: "string", description: "Tax portion (default \"0\")" },
          tax_base: { type: "string", description: "Taxable base (default value)" },
          currency: { type: "string", description: "Currency code (default COP)" },
          dues: { type: "string", description: "Installments (default \"1\")" },
        },
        required: ["token_card", "customer_id", "doc_type", "doc_number", "name", "email", "bill", "value"],
      },
    },
    {
      name: "get_transaction",
      description:
        "Get transaction detail by referencePayco (GET https://secure.epayco.co/validation/v1/reference/{ref}). Works for card, PSE and cash payments.",
      inputSchema: {
        type: "object",
        properties: {
          reference_payco: { type: "string", description: "The referencePayco returned when the payment was created" },
        },
        required: ["reference_payco"],
      },
    },
    {
      name: "create_pse_payment",
      description:
        "Create a PSE bank-debit payment (POST /restpagos/pagos/debitos.json on secure.payco.co). Returns a bank redirect URL the payer must open to authorize the debit.",
      inputSchema: {
        type: "object",
        properties: {
          bank: { type: "string", description: "PSE bank code from list_pse_banks" },
          invoice: { type: "string", description: "Merchant invoice/order reference" },
          description: { type: "string", description: "Payment description" },
          value: { type: "string", description: "Amount (string)" },
          tax: { type: "string", description: "Tax portion (default \"0\")" },
          tax_base: { type: "string", description: "Taxable base" },
          currency: { type: "string", description: "Currency (default COP)" },
          type_person: { type: "string", description: "0 = natural person, 1 = company" },
          doc_type: { type: "string", description: "Payer document type: CC, CE, NIT, ..." },
          doc_number: { type: "string", description: "Payer document number" },
          name: { type: "string", description: "Payer first name" },
          last_name: { type: "string", description: "Payer last name" },
          email: { type: "string", description: "Payer email" },
          cell_phone: { type: "string", description: "Payer mobile phone" },
          ip: { type: "string", description: "Payer IP address (PSE requirement)" },
          url_response: { type: "string", description: "URL the payer returns to after the bank flow" },
          url_confirmation: { type: "string", description: "Server-to-server confirmation webhook URL" },
        },
        required: ["bank", "invoice", "description", "value", "doc_type", "doc_number", "name", "email", "cell_phone", "ip"],
      },
    },
    {
      name: "get_pse_transaction",
      description:
        "Get a PSE transaction's status by transaction id (GET /restpagos/pse/transactioninfo.json on secure.payco.co).",
      inputSchema: {
        type: "object",
        properties: {
          transaction_id: { type: "string", description: "PSE transactionID returned by create_pse_payment" },
        },
        required: ["transaction_id"],
      },
    },
    {
      name: "list_pse_banks",
      description:
        "List PSE banks available for bank debit (GET /restpagos/pse/bancos.json on secure.payco.co).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_cash_payment",
      description:
        "Create a cash payment voucher on a Colombian cash network (POST /restpagos/v2/efectivo/{network} on secure.payco.co). The payer takes the voucher code to a physical point to pay.",
      inputSchema: {
        type: "object",
        properties: {
          network: {
            type: "string",
            description: "Cash network",
            enum: ["efecty", "gana", "redservi", "puntored", "sured"],
          },
          invoice: { type: "string", description: "Merchant invoice/order reference" },
          description: { type: "string", description: "Payment description" },
          value: { type: "string", description: "Amount (string)" },
          tax: { type: "string", description: "Tax portion (default \"0\")" },
          tax_base: { type: "string", description: "Taxable base" },
          currency: { type: "string", description: "Currency (default COP)" },
          doc_type: { type: "string", description: "Payer document type" },
          doc_number: { type: "string", description: "Payer document number" },
          name: { type: "string", description: "Payer first name" },
          last_name: { type: "string", description: "Payer last name" },
          email: { type: "string", description: "Payer email" },
          cell_phone: { type: "string", description: "Payer mobile phone" },
          end_date: { type: "string", description: "Voucher expiry date, YYYY-MM-DD" },
          ip: { type: "string", description: "Payer IP address" },
          url_response: { type: "string", description: "URL the payer returns to" },
          url_confirmation: { type: "string", description: "Server-to-server confirmation webhook URL" },
        },
        required: ["network", "invoice", "description", "value", "doc_type", "doc_number", "name", "email", "cell_phone", "end_date", "ip"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "tokenize_card": {
        const body = {
          "card[number]": args?.card_number,
          "card[exp_year]": args?.exp_year,
          "card[exp_month]": args?.exp_month,
          "card[cvc]": args?.cvc,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(await apiRequest("POST", "/v1/tokens", body), null, 2) }],
        };
      }
      case "create_customer": {
        const body = {
          token_card: args?.token_card,
          name: args?.name,
          last_name: args?.last_name,
          email: args?.email,
          phone: args?.phone,
          default: args?.default ?? true,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(await apiRequest("POST", "/payment/v1/customer/create", body), null, 2) }],
        };
      }
      case "charge_card": {
        const body = {
          token_card: args?.token_card,
          customer_id: args?.customer_id,
          doc_type: args?.doc_type,
          doc_number: args?.doc_number,
          name: args?.name,
          last_name: args?.last_name,
          email: args?.email,
          bill: args?.bill,
          description: args?.description,
          value: args?.value,
          tax: args?.tax ?? "0",
          tax_base: args?.tax_base ?? args?.value,
          currency: args?.currency ?? "COP",
          dues: args?.dues ?? "1",
          test: IS_TEST,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(await apiRequest("POST", "/payment/v1/charge/create", body), null, 2) }],
        };
      }
      case "get_transaction": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await restRequest(VALIDATION_URL, "GET", `/validation/v1/reference/${args?.reference_payco}`), null, 2) },
          ],
        };
      }
      case "create_pse_payment": {
        const body = {
          public_key: PUBLIC_KEY,
          bank: args?.bank,
          invoice: args?.invoice,
          description: args?.description,
          value: args?.value,
          tax: args?.tax ?? "0",
          tax_base: args?.tax_base ?? args?.value,
          currency: args?.currency ?? "COP",
          type_person: args?.type_person ?? "0",
          doc_type: args?.doc_type,
          doc_number: args?.doc_number,
          name: args?.name,
          last_name: args?.last_name,
          email: args?.email,
          cell_phone: args?.cell_phone,
          ip: args?.ip,
          url_response: args?.url_response,
          url_confirmation: args?.url_confirmation,
          test: IS_TEST,
        };
        return {
          content: [
            { type: "text", text: JSON.stringify(await restRequest(REST_URL, "POST", "/restpagos/pagos/debitos.json", body), null, 2) },
          ],
        };
      }
      case "get_pse_transaction": {
        const qs = new URLSearchParams({
          transactionID: String(args?.transaction_id ?? ""),
          public_key: PUBLIC_KEY,
        });
        return {
          content: [
            { type: "text", text: JSON.stringify(await restRequest(REST_URL, "GET", `/restpagos/pse/transactioninfo.json?${qs}`), null, 2) },
          ],
        };
      }
      case "list_pse_banks": {
        const qs = new URLSearchParams({ public_key: PUBLIC_KEY });
        return {
          content: [
            { type: "text", text: JSON.stringify(await restRequest(REST_URL, "GET", `/restpagos/pse/bancos.json?${qs}`), null, 2) },
          ],
        };
      }
      case "create_cash_payment": {
        const network = String(args?.network ?? "efecty");
        const body = {
          public_key: PUBLIC_KEY,
          invoice: args?.invoice,
          description: args?.description,
          value: args?.value,
          tax: args?.tax ?? "0",
          tax_base: args?.tax_base ?? args?.value,
          currency: args?.currency ?? "COP",
          doc_type: args?.doc_type,
          doc_number: args?.doc_number,
          name: args?.name,
          last_name: args?.last_name,
          email: args?.email,
          cell_phone: args?.cell_phone,
          end_date: args?.end_date,
          ip: args?.ip,
          url_response: args?.url_response,
          url_confirmation: args?.url_confirmation,
          test: IS_TEST,
        };
        return {
          content: [
            { type: "text", text: JSON.stringify(await restRequest(REST_URL, "POST", `/restpagos/v2/efectivo/${network}`, body), null, 2) },
          ],
        };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
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
        const s = new Server({ name: "mcp-epayco", version: "0.1.0" }, { capabilities: { tools: {} } });
        (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v));
        (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v));
        await s.connect(t);
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
