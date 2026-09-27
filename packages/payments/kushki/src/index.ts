#!/usr/bin/env node

/**
 * MCP Server for Kushki — omnichannel LATAM PSP (kushkipagos.com).
 *
 * Kushki spans Mexico, Colombia, Chile, Peru and Ecuador with one REST
 * API: card tokenization + one-step or two-step card charges, bank
 * transfer-in (PSE in Colombia, SPEI in Mexico), cash networks, and
 * card subscriptions. Two credentials: the PUBLIC merchant id
 * tokenizes cards (safe for client-side), the PRIVATE merchant id
 * moves money (server-side only).
 *
 * Tools (10):
 *   tokenize_card             — exchange raw card data for a single-use token
 *   create_charge             — one-step card charge with a token
 *   create_preauthorization   — two-step: hold funds on the card
 *   capture_preauthorization  — two-step: capture a previous preauth
 *   void_charge               — void / refund a card charge by ticketNumber
 *   create_transfer_token     — token for a bank-transfer-in (PSE / SPEI)
 *   create_transfer_charge    — bank transfer-in charge with a transfer token
 *   create_cash_charge        — cash payment reference for OXXO-style networks
 *   create_subscription       — recurring card subscription
 *   cancel_subscription       — cancel a subscription
 *
 * APIs
 *   Production: https://api.kushkipagos.com
 *   Testing:    https://api-uat.kushkipagos.com
 *
 * Environment
 *   KUSHKI_PUBLIC_MERCHANT_ID  — public merchant id (tokenization)
 *   KUSHKI_PRIVATE_MERCHANT_ID — private merchant id (charges)
 *   KUSHKI_ENV                 — "sandbox" | "production" (default: "sandbox")
 *
 * Docs: https://docs.kushki.com
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const PUBLIC_MERCHANT_ID = process.env.KUSHKI_PUBLIC_MERCHANT_ID || "";
const PRIVATE_MERCHANT_ID = process.env.KUSHKI_PRIVATE_MERCHANT_ID || "";
const ENV = (process.env.KUSHKI_ENV || "sandbox").toLowerCase();

const BASE_URL = process.env.KUSHKI_BASE_URL || (ENV === "production"
  ? "https://api.kushkipagos.com"
  : "https://api-uat.kushkipagos.com");

async function kushkiRequest(
  method: string,
  path: string,
  auth: "public" | "private",
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth === "public"
        ? { "Public-Merchant-Id": PUBLIC_MERCHANT_ID }
        : { "Private-Merchant-Id": PRIVATE_MERCHANT_ID }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Kushki API ${res.status}: ${text}`);
  }
  if (!text) return { ok: true };
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new Server(
  { name: "mcp-kushki", version: "0.1.0" },
  { capabilities: { tools: {} }, instructions: MANAGED_TIER_HINT },
);

const AMOUNT_SCHEMA = {
  type: "object",
  description:
    "Kushki amount object. subtotalIva = taxed subtotal, subtotalIva0 = untaxed subtotal, iva = tax. currency per country: MXN, COP, CLP, PEN, USD (EC).",
  properties: {
    subtotalIva: { type: "number", description: "Taxed subtotal (0 if none)" },
    subtotalIva0: { type: "number", description: "Untaxed subtotal" },
    iva: { type: "number", description: "Tax amount (0 if none)" },
    ice: { type: "number", description: "ICE tax (Ecuador, optional)" },
    currency: { type: "string", description: "MXN | COP | CLP | PEN | USD" },
  },
  required: ["subtotalIva", "subtotalIva0", "iva", "currency"],
} as const;

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "tokenize_card",
      description:
        "Exchange raw card data for a single-use token (POST /card/v1/tokens, public merchant id). The token feeds create_charge / create_preauthorization / create_subscription. Card data never touches your backend.",
      inputSchema: {
        type: "object",
        properties: {
          card: {
            type: "object",
            description: "Card data",
            properties: {
              name: { type: "string", description: "Cardholder name" },
              number: { type: "string", description: "Card number (PAN)" },
              expiryMonth: { type: "string", description: "MM" },
              expiryYear: { type: "string", description: "YY" },
              cvv: { type: "string", description: "Security code" },
            },
            required: ["name", "number", "expiryMonth", "expiryYear", "cvv"],
          },
          totalAmount: { type: "number", description: "Total amount the token will charge" },
          currency: { type: "string", description: "MXN | COP | CLP | PEN | USD" },
        },
        required: ["card", "totalAmount", "currency"],
      },
    },
    {
      name: "create_charge",
      description:
        "One-step card charge (POST /card/v1/charges, private merchant id). Pass the token from tokenize_card plus the amount object. Supports metadata, months (MX installments) and deferred (installment plans).",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Single-use token from tokenize_card" },
          amount: AMOUNT_SCHEMA,
          months: { type: "number", description: "Installments (Mexico meses sin intereses)" },
          deferred: { type: "object", description: "Deferred/installment config (country-specific)" },
          metadata: { type: "object", description: "Free-form metadata echoed in webhooks" },
          contactDetails: { type: "object", description: "Customer contact: documentType, documentNumber, email, firstName, lastName, phoneNumber" },
          fullResponse: { type: "boolean", description: "Return the acquirer's full response" },
        },
        required: ["token", "amount"],
      },
    },
    {
      name: "create_preauthorization",
      description:
        "Two-step charge, step 1: hold funds on the card (POST /card/v1/preAuthorization, private merchant id). Returns a ticketNumber to capture later.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Single-use token from tokenize_card" },
          amount: AMOUNT_SCHEMA,
          metadata: { type: "object", description: "Free-form metadata" },
          fullResponse: { type: "boolean", description: "Return the acquirer's full response" },
        },
        required: ["token", "amount"],
      },
    },
    {
      name: "capture_preauthorization",
      description:
        "Two-step charge, step 2: capture a previous preauthorization (POST /card/v1/capture, private merchant id). Amount may be lower than the preauth (partial capture).",
      inputSchema: {
        type: "object",
        properties: {
          ticketNumber: { type: "string", description: "ticketNumber returned by create_preauthorization" },
          amount: AMOUNT_SCHEMA,
          fullResponse: { type: "boolean", description: "Return the acquirer's full response" },
        },
        required: ["ticketNumber", "amount"],
      },
    },
    {
      name: "void_charge",
      description:
        "Void / refund a card charge (DELETE /card/v1/charges/{ticketNumber}, private merchant id). Same-day = void; settled = refund. Optional partial amount where the acquirer supports it.",
      inputSchema: {
        type: "object",
        properties: {
          ticketNumber: { type: "string", description: "ticketNumber of the charge to void/refund" },
          amount: { ...AMOUNT_SCHEMA, description: "Optional partial amount (defaults to full)" },
        },
        required: ["ticketNumber"],
      },
    },
    {
      name: "create_transfer_token",
      description:
        "Token for a bank-transfer-in (POST /transfer/v1/tokens, public merchant id). PSE in Colombia, SPEI in Mexico, bank transfer in Chile/Peru. Feeds create_transfer_charge.",
      inputSchema: {
        type: "object",
        properties: {
          amount: AMOUNT_SCHEMA,
          callbackUrl: { type: "string", description: "URL the customer returns to after bank auth" },
          userType: { type: "string", description: "0 = natural person, 1 = company (PSE)" },
          documentType: { type: "string", description: "Customer document type (e.g. CC, NIT, CE)" },
          documentNumber: { type: "string", description: "Customer document number" },
          email: { type: "string", description: "Customer email" },
          bankId: { type: "string", description: "Bank code (from Kushki's bank list, PSE)" },
          description: { type: "string", description: "Charge description" },
        },
        required: ["amount", "callbackUrl", "email"],
      },
    },
    {
      name: "create_transfer_charge",
      description:
        "Bank transfer-in charge with a transfer token (POST /transfer/v1/init, private merchant id). Returns the bank redirect URL the customer authorizes at.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Token from create_transfer_token" },
          amount: AMOUNT_SCHEMA,
          metadata: { type: "object", description: "Free-form metadata" },
        },
        required: ["token", "amount"],
      },
    },
    {
      name: "create_cash_charge",
      description:
        "Cash payment reference (POST /cash/v1/charges, private merchant id). Generates a voucher/reference the customer pays at a cash network (OXXO-style). Returns reference + expiry.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer first name" },
          lastName: { type: "string", description: "Customer last name" },
          documentType: { type: "string", description: "Customer document type" },
          documentNumber: { type: "string", description: "Customer document number" },
          email: { type: "string", description: "Customer email" },
          totalAmount: { type: "number", description: "Amount to collect" },
          currency: { type: "string", description: "MXN | COP | CLP | PEN | USD" },
          description: { type: "string", description: "Charge description on the voucher" },
          expirationDate: { type: "string", description: "Voucher expiry, YYYY-MM-DD (optional)" },
        },
        required: ["name", "lastName", "documentNumber", "email", "totalAmount", "currency"],
      },
    },
    {
      name: "create_subscription",
      description:
        "Recurring card subscription (POST /card/v1/subscriptions, private merchant id). Kushki charges the tokenized card on the given periodicity until cancelled.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "Single-use token from tokenize_card" },
          planName: { type: "string", description: "Plan name shown on statements" },
          periodicity: { type: "string", description: "daily | weekly | biweekly | monthly | bimonthly | quarterly | halfYearly | yearly" },
          contactDetails: {
            type: "object",
            description: "Customer contact",
            properties: {
              firstName: { type: "string", description: "First name" },
              lastName: { type: "string", description: "Last name" },
              email: { type: "string", description: "Email" },
              documentType: { type: "string", description: "Document type" },
              documentNumber: { type: "string", description: "Document number" },
              phoneNumber: { type: "string", description: "Phone" },
            },
            required: ["firstName", "lastName", "email"],
          },
          amount: AMOUNT_SCHEMA,
          startDate: { type: "string", description: "First charge date, YYYY-MM-DD" },
          metadata: { type: "object", description: "Free-form metadata" },
        },
        required: ["token", "planName", "periodicity", "contactDetails", "amount", "startDate"],
      },
    },
    {
      name: "cancel_subscription",
      description:
        "Cancel a subscription (DELETE /card/v1/subscriptions/{subscriptionId}, private merchant id). Stops all future charges.",
      inputSchema: {
        type: "object",
        properties: {
          subscriptionId: { type: "string", description: "Subscription id returned on create" },
        },
        required: ["subscriptionId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case "tokenize_card": {
        const body = { card: args?.card, totalAmount: args?.totalAmount, currency: args?.currency };
        return {
          content: [
            { type: "text", text: JSON.stringify(await kushkiRequest("POST", "/card/v1/tokens", "public", body), null, 2) },
          ],
        };
      }
      case "create_charge": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await kushkiRequest("POST", "/card/v1/charges", "private", args), null, 2) },
          ],
        };
      }
      case "create_preauthorization": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await kushkiRequest("POST", "/card/v1/preAuthorization", "private", args), null, 2) },
          ],
        };
      }
      case "capture_preauthorization": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await kushkiRequest("POST", "/card/v1/capture", "private", args), null, 2) },
          ],
        };
      }
      case "void_charge": {
        const path = `/card/v1/charges/${args?.ticketNumber}`;
        const body = args?.amount ? { amount: args.amount } : undefined;
        return {
          content: [
            { type: "text", text: JSON.stringify(await kushkiRequest("DELETE", path, "private", body), null, 2) },
          ],
        };
      }
      case "create_transfer_token": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await kushkiRequest("POST", "/transfer/v1/tokens", "public", args), null, 2) },
          ],
        };
      }
      case "create_transfer_charge": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await kushkiRequest("POST", "/transfer/v1/init", "private", args), null, 2) },
          ],
        };
      }
      case "create_cash_charge": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await kushkiRequest("POST", "/cash/v1/charges", "private", args), null, 2) },
          ],
        };
      }
      case "create_subscription": {
        return {
          content: [
            { type: "text", text: JSON.stringify(await kushkiRequest("POST", "/card/v1/subscriptions", "private", args), null, 2) },
          ],
        };
      }
      case "cancel_subscription": {
        const path = `/card/v1/subscriptions/${args?.subscriptionId}`;
        return {
          content: [
            { type: "text", text: JSON.stringify(await kushkiRequest("DELETE", path, "private"), null, 2) },
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
        const s = new Server({ name: "mcp-kushki", version: "0.1.0" }, { capabilities: { tools: {} } });
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
