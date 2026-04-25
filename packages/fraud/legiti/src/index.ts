#!/usr/bin/env node

/**
 * MCP Server for Legiti — Brazilian fraud prevention (ticketing + ecommerce).
 *
 * Fourth entry in the CodeSpar `fraud` category. Legiti (formerly Inspetor,
 * São Paulo) sits in the mid-size tier of the BR fraud stack: smaller public
 * footprint than ClearSale, more vertical depth than Konduto for ticketing /
 * events, and a simpler API surface than Sift.
 *
 * Shape of the product:
 *   1. A **Collection API** that captures state changes on primary entities
 *      (accounts, events, sales, transfers) plus meaningful user activity
 *      (login/logout, password recovery/reset). Every state change is a
 *      separate endpoint that feeds the ML model continuously.
 *   2. A single-shot **Evaluation API** (`POST /evaluation`) that, given a
 *      sale id + card + CPF + event_date_id, returns a synchronous decision:
 *      `approve`, `reject`, or `manual`.
 *   3. A v2 order surface (`POST /v2/order`, `PUT /v2/order`,
 *      `POST /v2/order/mark_fraudulent`) that unifies send-for-evaluation,
 *      status update, and chargeback feedback — this is what newer
 *      integrations use.
 *
 * Positioning vs. other fraud servers in the CodeSpar catalog:
 *   ClearSale — BR pioneer (2001), large chargeback history db, manual review
 *   Konduto   — BR, API-first, behavioral device intelligence
 *   Legiti    — BR, ticketing-native, simpler surface, sync evaluation
 *   Sift      — global, multi-abuse-type ML, enterprise workflows
 *
 * Merchants frequently bundle 2-3 of these for best-of-breed scoring.
 *
 * Tools (18):
 *   evaluate_order            — POST /v2/order; send an order and get the decision
 *   update_order              — PUT /v2/order; notify Legiti of order status changes
 *   mark_order_fraudulent     — POST /v2/order/mark_fraudulent; chargeback feedback
 *   mark_dispute_resolution   — POST /v2/order/mark_dispute_resolution; resolve a chargeback dispute (won/lost)
 *   evaluate_sale             — POST /evaluation; legacy single-shot sale evaluation
 *   track_account             — POST /account; account created/updated/deleted
 *   track_signup              — POST /account; account creation specifically (convenience over track_account)
 *   track_account_update      — POST /account; account update specifically (convenience over track_account)
 *   track_event               — POST /event; event (concert/show) created/updated
 *   track_event_view          — POST /event_view; user viewed/browsed an event page
 *   track_sale                — POST /sale; sale created/updated
 *   track_payment             — POST /payment; payment attempt / authorization / capture / refund
 *   track_auth                — POST /auth; login/logout/password recovery/reset
 *   track_login               — POST /auth; login attempts specifically (convenience over track_auth)
 *   track_logout              — POST /auth; logout specifically
 *   track_password_recovery   — POST /auth; password recovery request specifically
 *   get_decision              — GET /v2/order/{sale_id}; fetch the latest decision + score for an order
 *   update_decision_status    — POST /v2/order/decision; manually override a decision (accept/decline a manual review)
 *
 * Authentication
 *   Bearer token (JWT-format). Passed as `Authorization: Bearer <LEGITI_API_KEY>`.
 *   Legiti issues separate sandbox and production keys — the sandbox key tags
 *   requests as test so they do NOT train the ML model. Always develop with
 *   the sandbox key.
 *
 * Environment
 *   LEGITI_API_KEY   — JWT bearer token (required, secret)
 *   LEGITI_BASE_URL  — optional; defaults to https://collection-prod.inspcdn.net.
 *                      Legiti issues customer-specific base URLs — override per contract.
 *
 * Alpha note
 *   Shipped as 0.2.0-alpha.1. Legiti's public docs are smaller than ClearSale's
 *   or Konduto's — the v2 order family (order / order PUT / mark_fraudulent /
 *   mark_dispute_resolution / decision) is referenced in public integration
 *   guides at docs.legiti.com; the legacy /evaluation endpoint and the
 *   Collection API (account, event, event_view, sale, payment, auth) are
 *   documented in the open-source github.com/legiti/docs-backend repo. No
 *   public custom-rules surface exists, so the original category spec's
 *   create/list/update/delete rule tools are not shipped. Endpoints and
 *   request shapes for some Decision API surfaces (get_decision,
 *   update_decision_status) are inferred from contract-gated docs and may
 *   shift before stable.
 *
 * Docs: https://docs.legiti.com
 * Open-source docs: https://github.com/legiti/docs-backend
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.LEGITI_API_KEY || "";
const BASE_URL = process.env.LEGITI_BASE_URL || "https://collection-prod.inspcdn.net";

async function legitiRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Legiti API ${res.status}: ${err}`);
  }
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const server = new Server(
  { name: "mcp-legiti", version: "0.2.0-alpha.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "evaluate_order",
      description: "Submit an order to Legiti for real-time fraud evaluation via the v2 order endpoint. Returns a decision (approve / reject / manual) synchronously — response may take up to ~20s. Include as much context as possible: account, payment (tokenized card bin+last4), CPF, billing/shipping, and for ticketing flows the event_date_id / sale_items.",
      inputSchema: {
        type: "object",
        properties: {
          sale_id: { type: "string", description: "Merchant-side sale/order id (must be unique and stable — used to correlate future status updates and chargebacks)" },
          account_id: { type: "string", description: "Id of the account attempting the purchase" },
          sale_datetime: { type: "number", description: "Unix timestamp (seconds) for when the sale occurred" },
          sale_total_value: { type: "number", description: "Total monetary value of the sale in BRL (major units, e.g. 199.90)" },
          first_six_digits_cc: { type: "string", description: "First six digits of the credit card (BIN). Never pass the full PAN." },
          last_four_digits_cc: { type: "string", description: "Last four digits of the credit card" },
          holder_cpf: { type: "string", description: "Card holder's CPF. Dots and dashes are tolerated but not required." },
          event_date_id: { type: "string", description: "Ticketing-specific: the primary event datetime id associated with the sale. If a sale has multiple tickets across event dates, pass the main one." },
          sale_items: {
            type: "array",
            description: "Line items (e.g. tickets). Each item typically has { item_id, event_date_id, unit_price, quantity }.",
            items: { type: "object" },
          },
          billing_address: { type: "object", description: "Billing address: { street, number, city, state, zip_code, country }" },
          shipping_address: { type: "object", description: "Shipping address: same schema as billing_address" },
          ip: { type: "string", description: "Buyer's IP at order time (IPv4 or IPv6)" },
          request_evaluation: { type: "boolean", description: "If true, Legiti returns a synchronous decision in the response. Default true." },
        },
        required: ["sale_id", "account_id", "sale_datetime", "sale_total_value", "first_six_digits_cc", "last_four_digits_cc", "holder_cpf"],
      },
    },
    {
      name: "update_order",
      description: "Notify Legiti of a status change on an existing order (e.g. payment captured, shipped, cancelled, refunded). Feeds the ML model — required for ongoing decision quality. Use mark_order_fraudulent for confirmed chargebacks instead.",
      inputSchema: {
        type: "object",
        properties: {
          sale_id: { type: "string", description: "Merchant-side sale id used in evaluate_order" },
          status: { type: "string", description: "New status (e.g. 'paid', 'shipped', 'cancelled', 'refunded', 'delivered')" },
          status_datetime: { type: "number", description: "Unix timestamp (seconds) for when the status changed" },
          reason: { type: "string", description: "Optional free-text reason for the status change" },
        },
        required: ["sale_id", "status"],
      },
    },
    {
      name: "mark_order_fraudulent",
      description: "Report a confirmed chargeback / fraud outcome back to Legiti. This is Legiti's primary ML feedback channel — unreported chargebacks degrade future decision quality for similar buyers. Call this after the issuer confirms the chargeback, not on mere suspicion.",
      inputSchema: {
        type: "object",
        properties: {
          sale_id: { type: "string", description: "Merchant-side sale id the chargeback applies to" },
          chargeback_datetime: { type: "number", description: "Unix timestamp (seconds) of chargeback confirmation" },
          chargeback_reason: { type: "string", description: "Issuer/acquirer reason code or free-text reason" },
          amount: { type: "number", description: "Chargeback amount in BRL (major units). Defaults to the original sale total if omitted." },
        },
        required: ["sale_id"],
      },
    },
    {
      name: "evaluate_sale",
      description: "Legacy single-shot sale evaluation via POST /evaluation. Synchronous — returns { inspetor_decision: 'approve' | 'reject' | 'manual' }. Prefer evaluate_order (v2) for new integrations; use this when you only have the minimal required fields or for feature parity with older Legiti/Inspetor integrations.",
      inputSchema: {
        type: "object",
        properties: {
          sale_id: { type: "string", description: "Unique identifier for the sale within your platform" },
          account_id: { type: "string", description: "Id of the account attempting the purchase" },
          sale_datetime: { type: "number", description: "Unix timestamp (seconds) of the sale" },
          event_date_id: { type: "string", description: "Event datetime id associated with the sale (ticketing flows)" },
          sale_total_value: { type: "number", description: "Total monetary value of the sale in BRL" },
          first_six_digits_cc: { type: "string", description: "First six digits of the credit card (BIN)" },
          last_four_digits_cc: { type: "string", description: "Last four digits of the credit card" },
          holder_cpf: { type: "string", description: "Card holder's CPF (dots/dashes optional)" },
        },
        required: ["sale_id", "account_id", "sale_datetime", "event_date_id", "sale_total_value", "first_six_digits_cc", "last_four_digits_cc", "holder_cpf"],
      },
    },
    {
      name: "track_account",
      description: "Notify Legiti of an account lifecycle event (created / updated / deleted). Legiti's ML model treats the Account as a primary entity and needs every state change to score future sales accurately.",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "update", "delete"], description: "Lifecycle action being reported" },
          account_id: { type: "string", description: "Merchant-side account id (unique, stable)" },
          account_email: { type: "string", description: "Account email address" },
          account_name: { type: "string", description: "Account holder name" },
          account_phone: { type: "string", description: "Account phone number (E.164 recommended)" },
          account_cpf: { type: "string", description: "Account CPF / tax id" },
          account_address: { type: "object", description: "Account address: { street, number, city, state, zip_code, country }" },
          timestamp: { type: "number", description: "Unix timestamp (seconds) when this action occurred" },
        },
        required: ["action", "account_id"],
      },
    },
    {
      name: "track_event",
      description: "Notify Legiti of an Event (concert, show, match, session) lifecycle change. Events are primary entities in Legiti's ticketing-native model — scoring for ticket sales depends on up-to-date event metadata (date, venue, capacity, price tiers).",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "update", "delete"], description: "Lifecycle action" },
          event_id: { type: "string", description: "Merchant-side event id (unique, stable)" },
          event_name: { type: "string", description: "Event name" },
          event_category: { type: "string", description: "Category (concert, sports, theater, conference, etc.)" },
          event_dates: {
            type: "array",
            description: "Datetimes when this event takes place. Each item: { event_date_id, datetime (unix seconds), venue, capacity }.",
            items: { type: "object" },
          },
          timestamp: { type: "number", description: "Unix timestamp (seconds) when this action occurred" },
        },
        required: ["action", "event_id"],
      },
    },
    {
      name: "track_sale",
      description: "Notify Legiti of a Sale state change (created / updated). For initial sale creation without asking for a decision, set request_evaluation=false on evaluate_order instead. Use this for post-creation updates that aren't status transitions (e.g. sale items added/removed before capture).",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "update"], description: "Lifecycle action" },
          sale_id: { type: "string", description: "Merchant-side sale id" },
          account_id: { type: "string", description: "Associated account id" },
          sale_datetime: { type: "number", description: "Unix timestamp (seconds) of the sale" },
          sale_total_value: { type: "number", description: "Total monetary value in BRL" },
          sale_items: {
            type: "array",
            description: "Line items: { item_id, event_date_id, unit_price, quantity }",
            items: { type: "object" },
          },
          payment: { type: "object", description: "Payment details: { method ('credit'|'debit'|'boleto'|'pix'), first_six_digits_cc, last_four_digits_cc, installments, holder_cpf }" },
          timestamp: { type: "number", description: "Unix timestamp (seconds) of this state change" },
        },
        required: ["action", "sale_id", "account_id"],
      },
    },
    {
      name: "track_auth",
      description: "Notify Legiti of an authentication or password event (login attempt, logout, password recovery request, password reset). Login/logout and password activity are strong signals for account-takeover fraud — feed every attempt, successful or failed.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["login", "logout", "password_recovery", "password_reset"],
            description: "Auth action type. 'login' covers both successful and attempted logins (differentiate via the `success` field).",
          },
          account_id: { type: "string", description: "Account id involved. For failed login attempts where the account is unknown, pass the attempted identifier (email/username)." },
          success: { type: "boolean", description: "For login: true if authentication succeeded. For password_reset: true if the reset completed. Ignored for logout and password_recovery." },
          ip: { type: "string", description: "Client IP observed for this auth action" },
          user_agent: { type: "string", description: "Browser/app User-Agent observed for this auth action" },
          timestamp: { type: "number", description: "Unix timestamp (seconds) when the action occurred" },
        },
        required: ["action", "account_id"],
      },
    },
    {
      name: "track_login",
      description: "Notify Legiti of a login attempt (successful or failed). Convenience wrapper over track_auth that hard-codes action='login'. Failed logins are critical signal for ATO (account-takeover) — feed every attempt, including the ones blocked by your auth layer.",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Account id involved. For failed attempts where the account doesn't exist, pass the attempted identifier (email/username)." },
          success: { type: "boolean", description: "true if authentication succeeded, false otherwise. Default true." },
          ip: { type: "string", description: "Client IP for this login attempt" },
          user_agent: { type: "string", description: "Browser/app User-Agent for this login attempt" },
          timestamp: { type: "number", description: "Unix timestamp (seconds) of the attempt" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "track_logout",
      description: "Notify Legiti of a logout event. Convenience wrapper over track_auth with action='logout'. Useful for session-duration features in ATO models.",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Account id logging out" },
          ip: { type: "string", description: "Client IP at logout" },
          user_agent: { type: "string", description: "Browser/app User-Agent at logout" },
          timestamp: { type: "number", description: "Unix timestamp (seconds) of the logout" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "track_signup",
      description: "Notify Legiti of a new account creation. Convenience wrapper over track_account with action='create'. Send this at the moment the account is provisioned — Legiti uses signup recency as a fraud signal.",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Merchant-side account id (unique, stable)" },
          account_email: { type: "string", description: "Account email address" },
          account_name: { type: "string", description: "Account holder name" },
          account_phone: { type: "string", description: "Account phone number (E.164 recommended)" },
          account_cpf: { type: "string", description: "Account CPF / tax id" },
          account_address: { type: "object", description: "Account address: { street, number, city, state, zip_code, country }" },
          ip: { type: "string", description: "Client IP at signup" },
          user_agent: { type: "string", description: "Browser/app User-Agent at signup" },
          timestamp: { type: "number", description: "Unix timestamp (seconds) when the signup happened" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "track_account_update",
      description: "Notify Legiti of an account profile change (email, phone, CPF, address). Convenience wrapper over track_account with action='update'. Pass any fields that changed — omitted fields are not interpreted as cleared.",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Merchant-side account id" },
          account_email: { type: "string", description: "New account email (if changed)" },
          account_name: { type: "string", description: "New account name (if changed)" },
          account_phone: { type: "string", description: "New account phone (if changed)" },
          account_cpf: { type: "string", description: "New account CPF (if changed)" },
          account_address: { type: "object", description: "New account address (if changed)" },
          timestamp: { type: "number", description: "Unix timestamp (seconds) of the update" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "track_password_recovery",
      description: "Notify Legiti of a password recovery request (the 'forgot password' click). Convenience wrapper over track_auth with action='password_recovery'. Recovery floods are a strong ATO signal.",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Account id (or attempted identifier) requesting recovery" },
          ip: { type: "string", description: "Client IP for the recovery request" },
          user_agent: { type: "string", description: "Browser/app User-Agent for the recovery request" },
          timestamp: { type: "number", description: "Unix timestamp (seconds) of the request" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "track_event_view",
      description: "Notify Legiti that a user viewed an event/show page. Browse signal — feeds Legiti's session model so the eventual evaluate_order has context for 'did this buyer actually look at the show before buying tickets?'. Optional but recommended for ticketing flows.",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Account id viewing the event (omit for anonymous browsers)" },
          event_id: { type: "string", description: "Merchant-side event id being viewed" },
          event_date_id: { type: "string", description: "Specific event datetime being viewed (if a multi-date event)" },
          ip: { type: "string", description: "Client IP at view time" },
          user_agent: { type: "string", description: "Browser/app User-Agent at view time" },
          referrer: { type: "string", description: "HTTP referrer for the view" },
          timestamp: { type: "number", description: "Unix timestamp (seconds) of the view" },
        },
        required: ["event_id"],
      },
    },
    {
      name: "track_payment",
      description: "Notify Legiti of a payment-method-level event (authorization attempt, capture, refund, void). Distinct from track_sale, which is order-level. Use this when you process payments separately from sale state — e.g. multi-installment captures or refund flows.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["authorize", "capture", "refund", "void"],
            description: "Payment action being reported",
          },
          sale_id: { type: "string", description: "Associated sale id" },
          payment_id: { type: "string", description: "Merchant-side payment id (unique within the sale)" },
          method: { type: "string", description: "Payment method ('credit'|'debit'|'boleto'|'pix')" },
          first_six_digits_cc: { type: "string", description: "First six digits of the card (BIN), if card payment" },
          last_four_digits_cc: { type: "string", description: "Last four digits of the card, if card payment" },
          installments: { type: "number", description: "Number of installments (credit only)" },
          amount: { type: "number", description: "Payment amount in BRL (major units)" },
          status: { type: "string", description: "Resulting status ('approved'|'declined'|'pending')" },
          decline_reason: { type: "string", description: "Acquirer/issuer decline reason, if applicable" },
          timestamp: { type: "number", description: "Unix timestamp (seconds) of this payment action" },
        },
        required: ["action", "sale_id"],
      },
    },
    {
      name: "get_decision",
      description: "Fetch the latest Legiti decision for an order. Returns the decision (approve / reject / manual), score, and the contributing reason codes. Useful for re-checking a sale after async re-scoring or for audit/UI display.",
      inputSchema: {
        type: "object",
        properties: {
          sale_id: { type: "string", description: "Merchant-side sale id used in evaluate_order" },
        },
        required: ["sale_id"],
      },
    },
    {
      name: "update_decision_status",
      description: "Manually override Legiti's decision for an order — typically used to accept or decline a sale that landed in 'manual' review after analyst inspection. The override is recorded as feedback for the ML model.",
      inputSchema: {
        type: "object",
        properties: {
          sale_id: { type: "string", description: "Merchant-side sale id to override" },
          status: {
            type: "string",
            enum: ["accept", "decline"],
            description: "Manual decision: 'accept' (release the order) or 'decline' (reject the order)",
          },
          analyst_id: { type: "string", description: "Optional id/name of the analyst making the decision (for audit)" },
          reason: { type: "string", description: "Optional free-text justification for the override" },
          timestamp: { type: "number", description: "Unix timestamp (seconds) of the override" },
        },
        required: ["sale_id", "status"],
      },
    },
    {
      name: "mark_dispute_resolution",
      description: "Report the outcome of a chargeback dispute back to Legiti — i.e. whether the merchant won or lost the chargeback case after representation. Complements mark_order_fraudulent (which reports the chargeback itself). Disputes won are valuable counter-signal.",
      inputSchema: {
        type: "object",
        properties: {
          sale_id: { type: "string", description: "Merchant-side sale id the dispute applies to" },
          resolution: {
            type: "string",
            enum: ["won", "lost"],
            description: "'won' = chargeback reversed in merchant's favor; 'lost' = chargeback upheld",
          },
          resolution_datetime: { type: "number", description: "Unix timestamp (seconds) when the dispute was resolved" },
          resolution_reason: { type: "string", description: "Optional reason / case notes from the acquirer" },
        },
        required: ["sale_id", "resolution"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "evaluate_order":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/v2/order", args), null, 2) }] };
      case "update_order":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("PUT", "/v2/order", args), null, 2) }] };
      case "mark_order_fraudulent":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/v2/order/mark_fraudulent", args), null, 2) }] };
      case "evaluate_sale":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/evaluation", args), null, 2) }] };
      case "track_account":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/account", args), null, 2) }] };
      case "track_event":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/event", args), null, 2) }] };
      case "track_sale":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/sale", args), null, 2) }] };
      case "track_auth":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/auth", args), null, 2) }] };
      case "track_login":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/auth", { ...(args as Record<string, unknown>), action: "login" }), null, 2) }] };
      case "track_logout":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/auth", { ...(args as Record<string, unknown>), action: "logout" }), null, 2) }] };
      case "track_signup":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/account", { ...(args as Record<string, unknown>), action: "create" }), null, 2) }] };
      case "track_account_update":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/account", { ...(args as Record<string, unknown>), action: "update" }), null, 2) }] };
      case "track_password_recovery":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/auth", { ...(args as Record<string, unknown>), action: "password_recovery" }), null, 2) }] };
      case "track_event_view":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/event_view", args), null, 2) }] };
      case "track_payment":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/payment", args), null, 2) }] };
      case "get_decision": {
        const a = args as { sale_id?: string };
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("GET", `/v2/order/${encodeURIComponent(a.sale_id ?? "")}`), null, 2) }] };
      }
      case "update_decision_status":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/v2/order/decision", args), null, 2) }] };
      case "mark_dispute_resolution":
        return { content: [{ type: "text", text: JSON.stringify(await legitiRequest("POST", "/v2/order/mark_dispute_resolution", args), null, 2) }] };
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
        const s = new Server({ name: "mcp-legiti", version: "0.2.0-alpha.1" }, { capabilities: { tools: {} } });
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
