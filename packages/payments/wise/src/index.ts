#!/usr/bin/env node

/**
 * MCP Server for Wise (Wise Platform API) — global multi-currency accounts, FX,
 * and international transfers across 70+ currencies via local rails.
 *
 * Tools (19):
 *   list_profiles                          — list profiles (personal + business) on the token
 *   get_profile                            — fetch a single profile by id
 *   create_quote                           — quote an FX + transfer (locked rate, fees)
 *   get_quote                              — fetch a quote by id
 *   update_quote                           — update a quote (e.g. attach payOut, target account)
 *   create_recipient                       — create a payout recipient (account holder)
 *   get_recipient                          — fetch a recipient by id
 *   list_recipients                        — list recipients on a profile (filter by currency)
 *   delete_recipient                       — deactivate a recipient
 *   list_recipient_account_requirements    — discover required fields per currency/country
 *   create_transfer                        — create an international transfer (quote + recipient)
 *   get_transfer                           — fetch a transfer by id
 *   list_transfers                         — list transfers on a profile
 *   fund_transfer                          — fund a transfer from a multi-currency balance
 *   cancel_transfer                        — cancel a transfer not yet processed
 *   list_balances                          — list balance accounts on a profile
 *   get_balance                            — fetch a single balance account
 *   create_balance_account                 — open a new currency balance on a profile
 *   list_webhooks / create_webhook / delete_webhook — subscribe to event notifications
 *
 * Authentication
 *   Bearer token. Every request sends Authorization: Bearer ${WISE_API_TOKEN}.
 *   Tokens are issued per profile in the Wise dashboard — keep one per env.
 *
 * Environment
 *   WISE_API_TOKEN  Wise Platform API token (Bearer)
 *   WISE_ENV        'sandbox' (default) or 'live'
 *
 * Docs: https://docs.wise.com
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";

const API_TOKEN = process.env.WISE_API_TOKEN || "";
const ENV = (process.env.WISE_ENV || "sandbox").toLowerCase();
const BASE_URL =
  ENV === "live"
    ? "https://api.transferwise.com"
    : "https://api.sandbox.transferwise.tech";

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entries.length === 0) return "";
  const qs = new URLSearchParams();
  for (const [k, v] of entries) {
    qs.append(k, String(v));
  }
  return `?${qs.toString()}`;
}

async function wiseRequest(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${API_TOKEN}`,
    ...(extraHeaders || {}),
  };
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Wise API ${res.status}: ${await res.text()}`);
  }
  // Some Wise endpoints (e.g. delete_recipient) return 200 with empty body.
  const text = await res.text();
  if (!text) return { ok: true };
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const server = new Server(
  { name: "mcp-wise", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Profiles ──────────────────────────────────────────────────────────
    {
      name: "list_profiles",
      description:
        "List Wise profiles (personal + business) accessible to this API token. Most other endpoints are scoped to a profile id, so call this first to discover yours.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_profile",
      description: "Fetch a single Wise profile by id.",
      inputSchema: {
        type: "object",
        properties: {
          profile_id: { type: "string", description: "Wise profile id" },
        },
        required: ["profile_id"],
      },
    },

    // ── Quotes ────────────────────────────────────────────────────────────
    {
      name: "create_quote",
      description:
        "Create a Wise quote — locked FX rate plus payment options for a sourceCurrency / targetCurrency pair. Provide either sourceAmount or targetAmount, not both. Returns the quote id used to create a transfer.",
      inputSchema: {
        type: "object",
        properties: {
          profile_id: { type: "string", description: "Wise profile id (sender)" },
          sourceCurrency: { type: "string", description: "ISO-4217 source currency (e.g. USD)" },
          targetCurrency: { type: "string", description: "ISO-4217 target currency (e.g. EUR)" },
          sourceAmount: { type: "number", description: "Amount to send. Provide either sourceAmount or targetAmount." },
          targetAmount: { type: "number", description: "Amount the recipient should receive. Provide either sourceAmount or targetAmount." },
          targetAccount: { type: "number", description: "Optional recipient account id to attach to the quote" },
          payOut: { type: "string", description: "Optional payout method (e.g. BANK_TRANSFER, BALANCE, SWIFT)" },
          preferredPayIn: { type: "string", description: "Optional preferred pay-in method (e.g. BALANCE, BANK_TRANSFER)" },
        },
        required: ["profile_id", "sourceCurrency", "targetCurrency"],
      },
    },
    {
      name: "get_quote",
      description: "Fetch a Wise quote by id (within a profile). Returns rate, fees, and available paymentOptions.",
      inputSchema: {
        type: "object",
        properties: {
          profile_id: { type: "string", description: "Wise profile id" },
          quote_id: { type: "string", description: "Quote id" },
        },
        required: ["profile_id", "quote_id"],
      },
    },
    {
      name: "update_quote",
      description:
        "Update a Wise quote (e.g. attach a recipient via targetAccount, or change payOut). Returns the updated quote with refreshed paymentOptions.",
      inputSchema: {
        type: "object",
        properties: {
          profile_id: { type: "string", description: "Wise profile id" },
          quote_id: { type: "string", description: "Quote id to update" },
          targetAccount: { type: "number", description: "Recipient account id to attach" },
          payOut: { type: "string", description: "Payout method (e.g. BANK_TRANSFER, BALANCE, SWIFT)" },
          payIn: { type: "string", description: "Pay-in method (e.g. BALANCE, BANK_TRANSFER)" },
        },
        required: ["profile_id", "quote_id"],
      },
    },

    // ── Recipients ────────────────────────────────────────────────────────
    {
      name: "create_recipient",
      description:
        "Create a Wise recipient (payout account). Required `details` fields vary by currency / country — discover them with list_recipient_account_requirements first.",
      inputSchema: {
        type: "object",
        properties: {
          profile: { type: "number", description: "Wise profile id (sender)" },
          accountHolderName: { type: "string", description: "Full legal name on the destination account" },
          currency: { type: "string", description: "ISO-4217 destination currency" },
          type: {
            type: "string",
            description: "Account type, per requirements (e.g. iban, sort_code, aba, brazil, swift_code, email, ...).",
          },
          ownedByCustomer: { type: "boolean", description: "True if the recipient is the sender themselves" },
          details: {
            type: "object",
            description: "Currency-specific details (legalType, IBAN, accountNumber, BIC, etc) per requirements",
          },
        },
        required: ["profile", "accountHolderName", "currency", "type", "details"],
      },
    },
    {
      name: "get_recipient",
      description: "Fetch a Wise recipient by id.",
      inputSchema: {
        type: "object",
        properties: {
          recipient_id: { type: "string", description: "Recipient account id" },
        },
        required: ["recipient_id"],
      },
    },
    {
      name: "list_recipients",
      description: "List Wise recipients on a profile, optionally filtered by destination currency.",
      inputSchema: {
        type: "object",
        properties: {
          profile_id: { type: "string", description: "Wise profile id" },
          currency: { type: "string", description: "Optional ISO-4217 destination currency filter" },
        },
        required: ["profile_id"],
      },
    },
    {
      name: "delete_recipient",
      description: "Deactivate (soft-delete) a Wise recipient by id. The recipient is no longer usable for new transfers.",
      inputSchema: {
        type: "object",
        properties: {
          recipient_id: { type: "string", description: "Recipient account id" },
        },
        required: ["recipient_id"],
      },
    },
    {
      name: "list_recipient_account_requirements",
      description:
        "Discover required `details` fields for creating a recipient given a quote. Wise returns dynamic field schemas per currency / country / payout method (IBAN vs SWIFT vs local clearing, etc).",
      inputSchema: {
        type: "object",
        properties: {
          quote_id: { type: "string", description: "Quote id used to determine destination currency / payout method" },
        },
        required: ["quote_id"],
      },
    },

    // ── Transfers ─────────────────────────────────────────────────────────
    {
      name: "create_transfer",
      description:
        "Create a Wise transfer using a quote and a recipient. Requires a customerTransactionId for idempotency. The transfer is created in incomplete state — call fund_transfer to debit the source.",
      inputSchema: {
        type: "object",
        properties: {
          targetAccount: { type: "number", description: "Recipient account id (from create_recipient)" },
          quoteUuid: { type: "string", description: "Quote id (v2 quotes return uuid; pass it here)" },
          customerTransactionId: {
            type: "string",
            description: "Idempotency key (UUID). Agents control idempotency — do not reuse.",
          },
          details: {
            type: "object",
            description:
              "Transfer details — reference (statement reference), transferPurpose, sourceOfFunds, etc. Required fields depend on currency corridor.",
          },
        },
        required: ["targetAccount", "quoteUuid", "customerTransactionId"],
      },
    },
    {
      name: "get_transfer",
      description: "Fetch a Wise transfer by id. Returns status (incoming_payment_waiting, processing, outgoing_payment_sent, funds_refunded, etc).",
      inputSchema: {
        type: "object",
        properties: {
          transfer_id: { type: "string", description: "Transfer id" },
        },
        required: ["transfer_id"],
      },
    },
    {
      name: "list_transfers",
      description: "List Wise transfers on a profile with optional filters (status, date range, currency).",
      inputSchema: {
        type: "object",
        properties: {
          profile: { type: "string", description: "Wise profile id" },
          status: { type: "string", description: "Filter by status (e.g. incoming_payment_waiting, processing, outgoing_payment_sent, cancelled)" },
          sourceCurrency: { type: "string", description: "Filter by source currency" },
          targetCurrency: { type: "string", description: "Filter by target currency" },
          createdDateStart: { type: "string", description: "Lower bound on creation time (ISO 8601)" },
          createdDateEnd: { type: "string", description: "Upper bound on creation time (ISO 8601)" },
          offset: { type: "number", description: "Pagination offset" },
          limit: { type: "number", description: "Page size (default 100)" },
        },
        required: ["profile"],
      },
    },
    {
      name: "fund_transfer",
      description:
        "Fund a Wise transfer from a multi-currency balance. Equivalent to clicking 'Pay' in the dashboard. Use type=BALANCE for balance funding.",
      inputSchema: {
        type: "object",
        properties: {
          profile_id: { type: "string", description: "Wise profile id" },
          transfer_id: { type: "string", description: "Transfer id to fund" },
          type: {
            type: "string",
            description: "Funding source type (typically BALANCE). Other types may require additional setup.",
            default: "BALANCE",
          },
        },
        required: ["profile_id", "transfer_id"],
      },
    },
    {
      name: "cancel_transfer",
      description:
        "Cancel a Wise transfer that has not yet been processed (must still be in a cancellable state — incoming_payment_waiting, etc).",
      inputSchema: {
        type: "object",
        properties: {
          transfer_id: { type: "string", description: "Transfer id" },
        },
        required: ["transfer_id"],
      },
    },

    // ── Balances ──────────────────────────────────────────────────────────
    {
      name: "list_balances",
      description: "List balance accounts on a profile. Type defaults to STANDARD (multi-currency wallet).",
      inputSchema: {
        type: "object",
        properties: {
          profile_id: { type: "string", description: "Wise profile id" },
          types: { type: "string", description: "Comma-separated balance types (default STANDARD; SAVINGS also valid)" },
        },
        required: ["profile_id"],
      },
    },
    {
      name: "get_balance",
      description: "Fetch a single balance account by id.",
      inputSchema: {
        type: "object",
        properties: {
          profile_id: { type: "string", description: "Wise profile id" },
          balance_id: { type: "string", description: "Balance account id" },
        },
        required: ["profile_id", "balance_id"],
      },
    },
    {
      name: "create_balance_account",
      description: "Open a new currency balance account on a profile (e.g. open a EUR balance to hold euros).",
      inputSchema: {
        type: "object",
        properties: {
          profile_id: { type: "string", description: "Wise profile id" },
          currency: { type: "string", description: "ISO-4217 currency code for the new balance" },
          type: { type: "string", description: "Balance type (default STANDARD)", default: "STANDARD" },
          name: { type: "string", description: "Optional friendly name" },
        },
        required: ["profile_id", "currency"],
      },
    },

    // ── Webhooks ──────────────────────────────────────────────────────────
    {
      name: "list_webhooks",
      description: "List webhook subscriptions on a profile.",
      inputSchema: {
        type: "object",
        properties: {
          profile_id: { type: "string", description: "Wise profile id" },
        },
        required: ["profile_id"],
      },
    },
    {
      name: "create_webhook",
      description: "Create a webhook subscription on a profile. Wise will POST events of `trigger_on` type to `delivery.url`.",
      inputSchema: {
        type: "object",
        properties: {
          profile_id: { type: "string", description: "Wise profile id" },
          name: { type: "string", description: "Friendly name for the subscription" },
          trigger_on: {
            type: "string",
            description: "Event type (e.g. transfers#state-change, balances#credit, balances#update)",
          },
          delivery: {
            type: "object",
            description: "Delivery config: { version: '2.0.0', url: 'https://...' }",
          },
        },
        required: ["profile_id", "name", "trigger_on", "delivery"],
      },
    },
    {
      name: "delete_webhook",
      description: "Delete a webhook subscription from a profile.",
      inputSchema: {
        type: "object",
        properties: {
          profile_id: { type: "string", description: "Wise profile id" },
          subscription_id: { type: "string", description: "Webhook subscription id" },
        },
        required: ["profile_id", "subscription_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  function ok(result: unknown) {
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  try {
    switch (name) {
      // ── Profiles ──
      case "list_profiles":
        return ok(await wiseRequest("GET", "/v2/profiles"));
      case "get_profile": {
        const id = String(a.profile_id);
        return ok(await wiseRequest("GET", `/v2/profiles/${id}`));
      }

      // ── Quotes ──
      case "create_quote": {
        const profileId = String(a.profile_id);
        const { profile_id: _p, ...body } = a;
        void _p;
        return ok(await wiseRequest("POST", `/v3/profiles/${profileId}/quotes`, body));
      }
      case "get_quote": {
        const profileId = String(a.profile_id);
        const quoteId = String(a.quote_id);
        return ok(
          await wiseRequest("GET", `/v3/profiles/${profileId}/quotes/${quoteId}`),
        );
      }
      case "update_quote": {
        const profileId = String(a.profile_id);
        const quoteId = String(a.quote_id);
        const { profile_id: _p, quote_id: _q, ...body } = a;
        void _p;
        void _q;
        return ok(
          await wiseRequest(
            "PATCH",
            `/v3/profiles/${profileId}/quotes/${quoteId}`,
            body,
            { "Content-Type": "application/merge-patch+json" },
          ),
        );
      }

      // ── Recipients ──
      case "create_recipient":
        return ok(await wiseRequest("POST", "/v1/accounts", a));
      case "get_recipient": {
        const id = String(a.recipient_id);
        return ok(await wiseRequest("GET", `/v1/accounts/${id}`));
      }
      case "list_recipients": {
        const profileId = String(a.profile_id);
        const qs = buildQuery({ profile: profileId, currency: a.currency });
        return ok(await wiseRequest("GET", `/v2/accounts${qs}`));
      }
      case "delete_recipient": {
        const id = String(a.recipient_id);
        return ok(await wiseRequest("DELETE", `/v2/accounts/${id}`));
      }
      case "list_recipient_account_requirements": {
        const quoteId = String(a.quote_id);
        return ok(await wiseRequest("GET", `/v1/quotes/${quoteId}/account-requirements`));
      }

      // ── Transfers ──
      case "create_transfer":
        return ok(await wiseRequest("POST", "/v1/transfers", a));
      case "get_transfer": {
        const id = String(a.transfer_id);
        return ok(await wiseRequest("GET", `/v1/transfers/${id}`));
      }
      case "list_transfers": {
        const qs = buildQuery(a);
        return ok(await wiseRequest("GET", `/v1/transfers${qs}`));
      }
      case "fund_transfer": {
        const profileId = String(a.profile_id);
        const transferId = String(a.transfer_id);
        const type = (a.type as string) || "BALANCE";
        return ok(
          await wiseRequest(
            "POST",
            `/v3/profiles/${profileId}/transfers/${transferId}/payments`,
            { type },
          ),
        );
      }
      case "cancel_transfer": {
        const id = String(a.transfer_id);
        return ok(await wiseRequest("PUT", `/v1/transfers/${id}/cancel`));
      }

      // ── Balances ──
      case "list_balances": {
        const profileId = String(a.profile_id);
        const qs = buildQuery({ types: a.types ?? "STANDARD" });
        return ok(
          await wiseRequest("GET", `/v4/profiles/${profileId}/balances${qs}`),
        );
      }
      case "get_balance": {
        const profileId = String(a.profile_id);
        const balanceId = String(a.balance_id);
        return ok(
          await wiseRequest(
            "GET",
            `/v4/profiles/${profileId}/balances/${balanceId}`,
          ),
        );
      }
      case "create_balance_account": {
        const profileId = String(a.profile_id);
        const body = {
          currency: a.currency,
          type: a.type ?? "STANDARD",
          ...(a.name ? { name: a.name } : {}),
        };
        return ok(
          await wiseRequest(
            "POST",
            `/v4/profiles/${profileId}/balances`,
            body,
            { "X-idempotence-uuid": randomUUID() },
          ),
        );
      }

      // ── Webhooks ──
      case "list_webhooks": {
        const profileId = String(a.profile_id);
        return ok(
          await wiseRequest("GET", `/v3/profiles/${profileId}/subscriptions`),
        );
      }
      case "create_webhook": {
        const profileId = String(a.profile_id);
        const { profile_id: _p, ...body } = a;
        void _p;
        return ok(
          await wiseRequest(
            "POST",
            `/v3/profiles/${profileId}/subscriptions`,
            body,
          ),
        );
      }
      case "delete_webhook": {
        const profileId = String(a.profile_id);
        const subscriptionId = String(a.subscription_id);
        return ok(
          await wiseRequest(
            "DELETE",
            `/v3/profiles/${profileId}/subscriptions/${subscriptionId}`,
          ),
        );
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  if (process.argv.includes("--http") || process.env.MCP_HTTP === "true") {
    const { default: express } = await import("express");
    const app = express();
    app.use(express.json());
    const transports = new Map<string, StreamableHTTPServerTransport>();
    app.get("/health", (_req: unknown, res: { json: (body: unknown) => unknown }) =>
      res.json({ status: "ok", sessions: transports.size }),
    );
    app.post(
      "/mcp",
      async (
        req: { headers: Record<string, string | string[] | undefined>; body: unknown },
        res: { status: (code: number) => { json: (body: unknown) => unknown } },
      ) => {
        const sid = req.headers["mcp-session-id"] as string | undefined;
        if (sid && transports.has(sid)) {
          await transports.get(sid)!.handleRequest(req as never, res as never, req.body);
          return;
        }
        if (!sid && isInitializeRequest(req.body)) {
          const t = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id) => {
              transports.set(id, t);
            },
          });
          t.onclose = () => {
            if (t.sessionId) transports.delete(t.sessionId);
          };
          const s = new Server(
            { name: "mcp-wise", version: "0.1.0" },
            { capabilities: { tools: {} } },
          );
          (server as unknown as { _requestHandlers: Map<unknown, unknown> })._requestHandlers.forEach(
            (v, k) =>
              (s as unknown as { _requestHandlers: Map<unknown, unknown> })._requestHandlers.set(k, v),
          );
          (server as unknown as { _notificationHandlers?: Map<unknown, unknown> })._notificationHandlers?.forEach(
            (v, k) =>
              (s as unknown as { _notificationHandlers: Map<unknown, unknown> })._notificationHandlers.set(
                k,
                v,
              ),
          );
          await s.connect(t);
          await t.handleRequest(req as never, res as never, req.body);
          return;
        }
        res
          .status(400)
          .json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
      },
    );
    app.get(
      "/mcp",
      async (
        req: { headers: Record<string, string | string[] | undefined> },
        res: { status: (code: number) => { send: (body: string) => unknown } },
      ) => {
        const sid = req.headers["mcp-session-id"] as string;
        if (sid && transports.has(sid))
          await transports.get(sid)!.handleRequest(req as never, res as never);
        else res.status(400).send("Invalid session");
      },
    );
    app.delete(
      "/mcp",
      async (
        req: { headers: Record<string, string | string[] | undefined> },
        res: { status: (code: number) => { send: (body: string) => unknown } },
      ) => {
        const sid = req.headers["mcp-session-id"] as string;
        if (sid && transports.has(sid))
          await transports.get(sid)!.handleRequest(req as never, res as never);
        else res.status(400).send("Invalid session");
      },
    );
    const port = Number(process.env.MCP_PORT) || 3000;
    app.listen(port, () => {
      console.error(`MCP HTTP server on http://localhost:${port}/mcp`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch(console.error);
