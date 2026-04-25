#!/usr/bin/env node

/**
 * MCP Server for Culqi — Peru's Stripe-analog, the default PSP for Peruvian
 * D2C and SaaS. Ships CulqiOnline (hosted checkout), CulqiLink (payment links)
 * and CulqiFull (subscriptions). This server brings Peru into the catalog
 * alongside Mexico (Conekta), Brazil (Pagar.me, Getnet), Colombia (Wompi),
 * Argentina (Mercado Pago), and Chile.
 *
 * Tools (20):
 *   create_token          — tokenize a card (POST /tokens), test / server-side only
 *   create_charge         — charge a card or token (POST /charges) in PEN or USD
 *   get_charge            — retrieve a charge by id
 *   list_charges          — list charges with filters (GET /charges)
 *   capture_charge        — capture a previously-authorized charge (POST /charges/{id}/capture)
 *   refund_charge         — refund a captured charge (full or partial)
 *   create_customer       — create a customer record
 *   get_customer          — retrieve a customer by id
 *   list_customers        — list customers with filters (GET /customers)
 *   create_card           — attach a tokenized card to a customer for reuse
 *   delete_card           — detach a saved card (DELETE /cards/{id})
 *   create_order          — create a Yape / PagoEfectivo order (POST /orders)
 *   confirm_order         — confirm an unpaid order (POST /orders/{id}/confirm)
 *   list_orders           — list orders with filters (GET /orders)
 *   create_plan           — create a subscription plan
 *   create_subscription   — subscribe a customer's card to a plan (CulqiFull)
 *   cancel_subscription   — cancel an active subscription
 *   list_events           — list webhook events with filters
 *   get_event             — retrieve a single webhook event by id
 *   get_refund            — retrieve a refund by id (GET /refunds/{id})
 *
 * Authentication
 *   Bearer token with the secret key on every request. No separate sandbox
 *   URL — the key prefix (sk_test_ vs sk_live_) selects the environment.
 *     Authorization: Bearer <CULQI_SECRET_KEY>
 *     Content-Type: application/json
 *
 * Environment
 *   CULQI_SECRET_KEY  — secret key (sk_test_... or sk_live_...)
 *
 * Docs: https://apidocs.culqi.com
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const SECRET_KEY = process.env.CULQI_SECRET_KEY || "";
const BASE_URL = "https://api.culqi.com/v2";

async function culqiRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SECRET_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Culqi API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function buildQuery(filters: unknown): string {
  if (!filters || typeof filters !== "object") return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters as Record<string, unknown>)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

const server = new Server(
  { name: "mcp-culqi", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_token",
      description: "Tokenize a card (POST /tokens). Returns a token id like tkn_xxx. Tokenization is typically done client-side via culqi.js or mobile SDKs; this tool is primarily for test scripts and integration tests. Never send real PANs from a backend without PCI scope.",
      inputSchema: {
        type: "object",
        properties: {
          card_number: { type: "string", description: "PAN (13-19 digits). Never log." },
          cvv: { type: "string", description: "Card verification value (3 or 4 digits)" },
          expiration_month: { type: "string", description: "Two-digit month (01-12)" },
          expiration_year: { type: "string", description: "Four-digit year (e.g. 2027)" },
          email: { type: "string", description: "Cardholder email" },
          metadata: { type: "object", description: "Optional merchant-side key-value metadata" },
        },
        required: ["card_number", "cvv", "expiration_month", "expiration_year", "email"],
      },
    },
    {
      name: "create_charge",
      description: "Create a charge (POST /charges). Amount is in cents of the currency (e.g. 1000 = S/ 10.00 PEN). source_id accepts a token id (tkn_xxx) or a stored card id (crd_xxx).",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in cents (e.g. 1000 = S/ 10.00)" },
          currency_code: { type: "string", enum: ["PEN", "USD"], description: "ISO-4217 currency code supported by Culqi" },
          email: { type: "string", description: "Payer email" },
          source_id: { type: "string", description: "Token id (tkn_xxx) or saved card id (crd_xxx)" },
          description: { type: "string", description: "Human-readable description for the payer" },
          installments: { type: "number", description: "Installment count for cuotas (0 for single payment)" },
          capture: { type: "boolean", description: "true (default) authorizes + captures; false authorizes only" },
          antifraud_details: {
            type: "object",
            description: "Antifraud signals — recommended for live traffic",
            properties: {
              first_name: { type: "string" },
              last_name: { type: "string" },
              address: { type: "string" },
              address_city: { type: "string" },
              country_code: { type: "string", description: "ISO-3166 alpha-2 (e.g. PE)" },
              phone: { type: "string" },
            },
          },
          metadata: { type: "object", description: "Merchant-side key-value metadata" },
        },
        required: ["amount", "currency_code", "email", "source_id"],
      },
    },
    {
      name: "get_charge",
      description: "Retrieve a charge by Culqi id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Culqi charge id (chr_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_charges",
      description: "List charges (GET /charges) with optional filters. Filters are passed as query params: amount, min_amount, max_amount, installments, currency_code, code (auth code), decline_code, fraud_score, first_name, last_name, email, country_code, creation_date_from (ms), creation_date_to (ms), limit, before, after.",
      inputSchema: {
        type: "object",
        properties: {
          filters: {
            type: "object",
            description: "Query filters passed as-is to the Culqi /charges endpoint.",
          },
        },
      },
    },
    {
      name: "capture_charge",
      description: "Capture a previously-authorized charge (POST /charges/{id}/capture). Use after creating a charge with capture=false. Must be called within 10 days of authorization.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Culqi charge id to capture (chr_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "refund_charge",
      description: "Refund a captured charge (POST /refunds). Partial refunds supported by setting amount below the charge total.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Refund amount in cents" },
          charge_id: { type: "string", description: "Culqi charge id to refund (chr_xxx)" },
          reason: { type: "string", enum: ["duplicado", "fraudulento", "solicitud_comprador"], description: "Refund reason (Culqi enum)" },
          metadata: { type: "object", description: "Optional metadata" },
        },
        required: ["amount", "charge_id", "reason"],
      },
    },
    {
      name: "get_refund",
      description: "Retrieve a refund by id (GET /refunds/{id}).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Culqi refund id (ref_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_customer",
      description: "Create a customer record (POST /customers). Use the returned customer_id with create_card to save reusable cards.",
      inputSchema: {
        type: "object",
        properties: {
          first_name: { type: "string", description: "Customer first name" },
          last_name: { type: "string", description: "Customer last name" },
          email: { type: "string", description: "Customer email (must be unique)" },
          address: { type: "string", description: "Street address" },
          address_city: { type: "string", description: "City" },
          country_code: { type: "string", description: "ISO-3166 alpha-2 (e.g. PE)" },
          phone_number: { type: "string", description: "Phone, digits only" },
          metadata: { type: "object", description: "Merchant-side key-value metadata" },
        },
        required: ["first_name", "last_name", "email", "address", "address_city", "country_code", "phone_number"],
      },
    },
    {
      name: "get_customer",
      description: "Retrieve a customer by Culqi id (GET /customers/{id}).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Culqi customer id (cus_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_customers",
      description: "List customers (GET /customers) with optional filters passed as query params: first_name, last_name, email, country_code, creation_date_from (ms), creation_date_to (ms), limit, before, after.",
      inputSchema: {
        type: "object",
        properties: {
          filters: {
            type: "object",
            description: "Query filters passed as-is to the Culqi /customers endpoint.",
          },
        },
      },
    },
    {
      name: "create_card",
      description: "Attach a tokenized card to a customer for reuse (POST /cards). Returns a card id (crd_xxx) usable as source_id on future charges.",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Culqi customer id (cus_xxx)" },
          token_id: { type: "string", description: "Culqi token id from create_token (tkn_xxx)" },
          validate: { type: "boolean", description: "Run a 0-amount validation charge on attach (default true)" },
          metadata: { type: "object", description: "Merchant-side key-value metadata" },
        },
        required: ["customer_id", "token_id"],
      },
    },
    {
      name: "delete_card",
      description: "Detach a saved card from its customer (DELETE /cards/{id}). The card id becomes unusable as source_id afterwards.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Culqi card id (crd_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_order",
      description: "Create an order (POST /orders) for non-card payment methods — Yape, PagoEfectivo (Cash), bank transfer. Returns an order with CIP / QR data the payer uses to complete payment. Confirm reception via webhooks or confirm_order.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Order amount in cents" },
          currency_code: { type: "string", enum: ["PEN", "USD"], description: "ISO-4217 currency" },
          description: { type: "string", description: "Human-readable order description" },
          order_number: { type: "string", description: "Merchant-side unique order number (3-80 chars)" },
          client_details: {
            type: "object",
            description: "Payer details required for Yape / Cash orders",
            properties: {
              first_name: { type: "string" },
              last_name: { type: "string" },
              email: { type: "string" },
              phone_number: { type: "string" },
            },
            required: ["first_name", "last_name", "email", "phone_number"],
          },
          expiration_date: { type: "number", description: "Unix epoch seconds for when the order expires (must be ~>10 min ahead)" },
          confirm: { type: "boolean", description: "If true, confirms the order immediately on creation (default false)" },
          metadata: { type: "object", description: "Merchant-side key-value metadata" },
        },
        required: ["amount", "currency_code", "description", "order_number", "client_details", "expiration_date"],
      },
    },
    {
      name: "confirm_order",
      description: "Confirm an unpaid order (POST /orders/{id}/confirm). Moves the order to a confirmed state ready to be paid by the customer via Yape / PagoEfectivo.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Culqi order id (ord_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_orders",
      description: "List orders (GET /orders) with optional filters passed as query params: order_number, state (created, paid, expired, deleted, failed), creation_date_from (ms), creation_date_to (ms), limit, before, after.",
      inputSchema: {
        type: "object",
        properties: {
          filters: {
            type: "object",
            description: "Query filters passed as-is to the Culqi /orders endpoint.",
          },
        },
      },
    },
    {
      name: "create_plan",
      description: "Create a subscription plan (POST /plans). Plans are reusable templates — attach customer cards via create_subscription.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Full plan name" },
          short_name: { type: "string", description: "Short/display name" },
          description: { type: "string", description: "Plan description" },
          amount: { type: "number", description: "Amount charged per interval, in cents" },
          currency_code: { type: "string", enum: ["PEN", "USD"], description: "Plan currency" },
          interval_unit_time: { type: "string", enum: ["month", "year"], description: "Billing interval unit" },
          interval_count: { type: "number", description: "Number of interval units between charges (e.g. 1 = every month)" },
          initial_cycles: {
            type: "object",
            description: "Optional intro pricing for the first N cycles",
            properties: {
              count: { type: "number", description: "How many initial cycles use the intro price" },
              has_initial_charge: { type: "boolean", description: "Charge on creation" },
              amount: { type: "number", description: "Intro amount in cents" },
              interval_unit_time: { type: "string", enum: ["month", "year"] },
            },
          },
          metadata: { type: "object", description: "Merchant-side key-value metadata" },
        },
        required: ["name", "short_name", "amount", "currency_code", "interval_unit_time", "interval_count"],
      },
    },
    {
      name: "create_subscription",
      description: "Subscribe a customer's saved card to a plan (POST /subscriptions). Requires tyc=true (terms & conditions acceptance).",
      inputSchema: {
        type: "object",
        properties: {
          card_id: { type: "string", description: "Culqi card id (crd_xxx) from create_card" },
          plan_id: { type: "string", description: "Culqi plan id (pln_xxx) from create_plan" },
          tyc: { type: "boolean", description: "Customer accepted terms & conditions. Must be true." },
          metadata: { type: "object", description: "Merchant-side key-value metadata" },
        },
        required: ["card_id", "plan_id", "tyc"],
      },
    },
    {
      name: "cancel_subscription",
      description: "Cancel an active subscription (DELETE /subscriptions/{id}).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Culqi subscription id (sub_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_events",
      description: "List webhook events (GET /events) with optional filters. Filters are passed through as query params: event_type, creation_date_from, creation_date_to, limit, before, after.",
      inputSchema: {
        type: "object",
        properties: {
          filters: {
            type: "object",
            description: "Query filters passed as-is: event_type (e.g. 'charge.creation.succeeded'), creation_date_from (ms timestamp), creation_date_to (ms timestamp), limit, before, after.",
          },
        },
      },
    },
    {
      name: "get_event",
      description: "Retrieve a single webhook event by id (GET /events/{id}). Useful for auditing a webhook delivery against Culqi's canonical record.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Culqi event id (evt_xxx)" },
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
      case "create_token":
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("POST", "/tokens", args), null, 2) }] };
      case "create_charge":
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("POST", "/charges", args), null, 2) }] };
      case "get_charge": {
        const id = (args as { id: string }).id;
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("GET", `/charges/${id}`), null, 2) }] };
      }
      case "list_charges": {
        const filters = (args as { filters?: unknown })?.filters;
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("GET", `/charges${buildQuery(filters)}`), null, 2) }] };
      }
      case "capture_charge": {
        const id = (args as { id: string }).id;
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("POST", `/charges/${id}/capture`), null, 2) }] };
      }
      case "refund_charge":
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("POST", "/refunds", args), null, 2) }] };
      case "get_refund": {
        const id = (args as { id: string }).id;
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("GET", `/refunds/${id}`), null, 2) }] };
      }
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("POST", "/customers", args), null, 2) }] };
      case "get_customer": {
        const id = (args as { id: string }).id;
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("GET", `/customers/${id}`), null, 2) }] };
      }
      case "list_customers": {
        const filters = (args as { filters?: unknown })?.filters;
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("GET", `/customers${buildQuery(filters)}`), null, 2) }] };
      }
      case "create_card":
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("POST", "/cards", args), null, 2) }] };
      case "delete_card": {
        const id = (args as { id: string }).id;
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("DELETE", `/cards/${id}`), null, 2) }] };
      }
      case "create_order":
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("POST", "/orders", args), null, 2) }] };
      case "confirm_order": {
        const id = (args as { id: string }).id;
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("POST", `/orders/${id}/confirm`), null, 2) }] };
      }
      case "list_orders": {
        const filters = (args as { filters?: unknown })?.filters;
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("GET", `/orders${buildQuery(filters)}`), null, 2) }] };
      }
      case "create_plan":
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("POST", "/plans", args), null, 2) }] };
      case "create_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("POST", "/subscriptions", args), null, 2) }] };
      case "cancel_subscription": {
        const id = (args as { id: string }).id;
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("DELETE", `/subscriptions/${id}`), null, 2) }] };
      }
      case "list_events": {
        const filters = (args as { filters?: unknown })?.filters;
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("GET", `/events${buildQuery(filters)}`), null, 2) }] };
      }
      case "get_event": {
        const id = (args as { id: string }).id;
        return { content: [{ type: "text", text: JSON.stringify(await culqiRequest("GET", `/events/${id}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-culqi", version: "0.2.1" }, { capabilities: { tools: {} } });
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
