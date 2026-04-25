#!/usr/bin/env node

/**
 * MCP Server for Rapyd — global collect + disburse platform.
 *
 * Rapyd exposes one API that covers 100+ countries across LatAm, Asia, Africa,
 * and Europe. The server prioritizes the endpoints most useful for autonomous
 * agents: hosted checkout, direct payments, refunds, payouts (including cash
 * pickup and wallet top-up), dynamic method discovery, and Rapyd's managed
 * wallet infrastructure.
 *
 * Tools (22):
 *   create_checkout_page             — POST   /v1/checkout
 *   create_payment                   — POST   /v1/payments
 *   get_payment                      — GET    /v1/payments/{id}
 *   list_payments                    — GET    /v1/payments
 *   update_payment                   — POST   /v1/payments/{id}
 *   cancel_payment                   — DELETE /v1/payments/{id}
 *   create_refund                    — POST   /v1/refunds
 *   create_payment_method            — POST   /v1/customers/{cus}/payment_methods
 *   delete_payment_method            — DELETE /v1/customers/{cus}/payment_methods/{pmt}
 *   create_payout                    — POST   /v1/payouts
 *   get_payout                       — GET    /v1/payouts/{id}
 *   list_payouts                     — GET    /v1/payouts
 *   cancel_payout                    — DELETE /v1/payouts/{id}
 *   confirm_payout                   — POST   /v1/payouts/confirm/{id}
 *   list_payment_methods_by_country  — GET    /v1/payment_methods/country?country=X&currency=Y
 *   list_payout_methods_by_country   — GET    /v1/payouts/supported_types?beneficiary_country=X
 *   create_wallet                    — POST   /v1/user
 *   get_wallet                       — GET    /v1/user/{id}
 *   update_wallet                    — PUT    /v1/user
 *   list_wallets                     — GET    /v1/user
 *   wallet_contact_verify            — POST   /v1/users/{id}/contacts/{contact}/verify
 *   transfer_between_wallets         — POST   /v1/account/transfer
 *
 * Authentication
 *   Rapyd HMAC-SHA256. Every request carries:
 *     access_key : public access key
 *     salt       : random 8-16 char string per request
 *     timestamp  : Unix time in seconds (must be within 60s of server time)
 *     signature  : see recipe below
 *     Content-Type: application/json
 *     idempotency: unique per request (we auto-generate)
 *
 *   Signature recipe (exact, per docs.rapyd.net/en/request-signatures.html):
 *     toSign    = http_method_lowercase + url_path + salt + timestamp + access_key + secret_key + body_string
 *     hmac      = HMAC-SHA256(secret_key, toSign)
 *     hex       = hmac.digest('hex')
 *     signature = Buffer.from(hex).toString('base64')
 *
 *   Notes:
 *     - body_string is the serialized JSON body with no whitespace, or "" (not "{}") when empty.
 *     - url_path starts with /v1 and includes query string if any.
 *
 * Environment
 *   RAPYD_ACCESS_KEY — access key (required)
 *   RAPYD_SECRET_KEY — secret key (required, never transmitted)
 *   RAPYD_ENV        — 'sandbox' (default) or 'production'
 *
 * Docs: https://docs.rapyd.net
 */

import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ACCESS_KEY = process.env.RAPYD_ACCESS_KEY || "";
const SECRET_KEY = process.env.RAPYD_SECRET_KEY || "";
const RAPYD_ENV = (process.env.RAPYD_ENV || "sandbox").toLowerCase();
const BASE_URL = RAPYD_ENV === "production"
  ? "https://api.rapyd.net"
  : "https://sandboxapi.rapyd.net";

async function rapydRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const httpMethod = method.toLowerCase();
  const salt = randomBytes(8).toString("hex"); // 16 hex chars, within recommended 8-16 range
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // body_string: compact JSON, empty string when body missing or literal "{}"
  let bodyString = body ? JSON.stringify(body) : "";
  if (bodyString === "{}") bodyString = "";

  const toSign = httpMethod + path + salt + timestamp + ACCESS_KEY + SECRET_KEY + bodyString;
  const hmac = createHmac("sha256", SECRET_KEY).update(toSign).digest("hex");
  const signature = Buffer.from(hmac).toString("base64");

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "access_key": ACCESS_KEY,
      "salt": salt,
      "timestamp": timestamp,
      "signature": signature,
      "idempotency": randomUUID(),
    },
    body: bodyString || undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Rapyd API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-rapyd", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_checkout_page",
      description: "Create a Rapyd hosted checkout page. Returns a redirect_url the payer opens in a browser. Rapyd renders the appropriate local methods (cards, cash pickup, bank transfer, wallets) for the country + currency combination, so one call supports 100+ countries.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in major units of the currency (e.g. 100 = 100 USD)" },
          currency: { type: "string", description: "ISO-4217 currency code (USD, EUR, MXN, BRL, INR, NGN, etc)" },
          country: { type: "string", description: "ISO-3166 alpha-2 country code of the buyer (US, MX, BR, IN, NG, etc)" },
          complete_checkout_url: { type: "string", description: "URL Rapyd redirects the payer to after a successful payment" },
          cancel_checkout_url: { type: "string", description: "URL Rapyd redirects the payer to if they cancel" },
          merchant_reference_id: { type: "string", description: "Merchant-side order id (appears in reports)" },
          customer: { type: "string", description: "Rapyd customer id (cus_xxx). Optional — omit to let Rapyd create a one-off customer." },
          payment_method_type: { type: "string", description: "Optional: restrict to a single method type (e.g. 'mx_oxxo_cash'). Omit for Rapyd to show all eligible methods." },
          payment_method_types_include: { type: "array", items: { type: "string" }, description: "Whitelist of method types to show" },
          payment_method_types_exclude: { type: "array", items: { type: "string" }, description: "Blacklist of method types to hide" },
          description: { type: "string", description: "Human-readable description shown on the page" },
          language: { type: "string", description: "ISO-639 language code for the hosted page (en, es, pt, ...)" },
        },
        required: ["amount", "currency", "country"],
      },
    },
    {
      name: "create_payment",
      description: "Create a direct payment with a fully-specified payment_method. Use when you already have a payment_method id/token or when you want server-to-server flow without the hosted page. For voucher/cash methods the response contains redirect/display data.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in major units" },
          currency: { type: "string", description: "ISO-4217 currency code" },
          payment_method: {
            type: "object",
            description: "Payment method object. Either { type: 'xxx_method_name', fields: {...} } for one-shot use, or { type: 'card', id: 'pmt_xxx' } for a saved method.",
          },
          customer: { type: "string", description: "Rapyd customer id (cus_xxx). Optional." },
          capture: { type: "boolean", description: "Card only: false for auth-only, true (default) for auth+capture" },
          description: { type: "string", description: "Description" },
          merchant_reference_id: { type: "string", description: "Merchant-side order id" },
          complete_payment_url: { type: "string", description: "Return URL for redirect-based methods" },
          error_payment_url: { type: "string", description: "Return URL on redirect failure" },
          metadata: { type: "object", description: "Arbitrary key-value metadata" },
          ewallet: { type: "string", description: "Rapyd ewallet id (ewallet_xxx) to credit on successful capture" },
        },
        required: ["amount", "currency", "payment_method"],
      },
    },
    {
      name: "get_payment",
      description: "Retrieve a payment by Rapyd payment id (payment_xxx). Returns status, amount, method, and any next-action data.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Rapyd payment id (payment_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_payment",
      description: "Cancel a payment that has not yet been captured/completed. For auth-only card payments this voids the auth; for pending redirect payments it cancels the expectation.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Rapyd payment id (payment_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_refund",
      description: "Refund a completed payment. Omit amount for a full refund or set amount for partial.",
      inputSchema: {
        type: "object",
        properties: {
          payment: { type: "string", description: "Original Rapyd payment id (payment_xxx)" },
          amount: { type: "number", description: "Partial refund amount in major units. Omit for a full refund." },
          currency: { type: "string", description: "Currency of the refund. Must match the original payment currency." },
          reason: { type: "string", description: "Optional human-readable reason" },
          metadata: { type: "object", description: "Arbitrary key-value metadata" },
          receipt_email: { type: "string", description: "Email to send the refund receipt to" },
        },
        required: ["payment"],
      },
    },
    {
      name: "create_payout",
      description: "Create a payout (disbursement) to a beneficiary. Rapyd supports bank transfer, wallet top-up, and cash pickup (OXXO Pay, 7-Eleven, etc). Use list_payout_methods_by_country first to find the right payout_method_type for the destination country.",
      inputSchema: {
        type: "object",
        properties: {
          sender_country: { type: "string", description: "ISO-3166 alpha-2 country code of the sending account (e.g. US)" },
          sender_currency: { type: "string", description: "ISO-4217 currency code of the sending account" },
          beneficiary_country: { type: "string", description: "ISO-3166 alpha-2 country code of the beneficiary" },
          payout_currency: { type: "string", description: "ISO-4217 currency code of the payout" },
          payout_amount: { type: "number", description: "Payout amount in major units of payout_currency" },
          payout_method_type: { type: "string", description: "Rapyd payout method type (e.g. 'mx_cash_oxxopay_payout', 'in_hdfc_bank', 'ph_gcash_ewallet'). Discover via list_payout_methods_by_country." },
          sender: {
            type: "object",
            description: "Sender object. Shape depends on sender country — typically includes first_name, last_name, company_name (for business senders), identification_type, identification_value, address fields.",
          },
          beneficiary: {
            type: "object",
            description: "Beneficiary object. Shape depends on beneficiary country and payout_method_type — typically includes name, account_number or card_number, identification fields, and address fields.",
          },
          description: { type: "string", description: "Purpose / memo shown to the beneficiary where supported" },
          merchant_reference_id: { type: "string", description: "Merchant-side payout reference" },
          statement_descriptor: { type: "string", description: "Descriptor shown on the beneficiary's statement where supported" },
          ewallet: { type: "string", description: "Rapyd ewallet id to debit as the payout source" },
          metadata: { type: "object", description: "Arbitrary key-value metadata" },
        },
        required: ["sender_country", "sender_currency", "beneficiary_country", "payout_currency", "payout_amount", "payout_method_type", "sender", "beneficiary"],
      },
    },
    {
      name: "get_payout",
      description: "Retrieve a payout by Rapyd payout id (payout_xxx).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Rapyd payout id (payout_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "confirm_payout",
      description: "Second step of Rapyd's two-step payout approval. After create_payout returns a payout in 'Created' state, call confirm_payout to release funds. Used when your Rapyd account requires dual-approval.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Rapyd payout id (payout_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_payment_methods_by_country",
      description: "List all inbound (collect) payment methods Rapyd supports for a given country + currency. Use to dynamically discover local methods (OXXO in MX, Pix in BR, UPI in IN, MoMo in GH) rather than hard-coding.",
      inputSchema: {
        type: "object",
        properties: {
          country: { type: "string", description: "ISO-3166 alpha-2 country code (MX, BR, IN, GH, PH, etc)" },
          currency: { type: "string", description: "ISO-4217 currency code (optional). Narrows the list to methods that settle in this currency." },
        },
        required: ["country"],
      },
    },
    {
      name: "list_payout_methods_by_country",
      description: "List all outbound (disburse) payout method types Rapyd supports for a given beneficiary country. Returns the payout_method_type strings you pass to create_payout and the required beneficiary/sender field shapes for each.",
      inputSchema: {
        type: "object",
        properties: {
          beneficiary_country: { type: "string", description: "ISO-3166 alpha-2 country code of the beneficiary" },
          beneficiary_entity_type: { type: "string", enum: ["individual", "company"], description: "Narrow to person vs business beneficiaries" },
          payout_currency: { type: "string", description: "Narrow to methods that settle in this ISO-4217 currency" },
          sender_country: { type: "string", description: "ISO-3166 alpha-2 country code of the sender" },
          sender_currency: { type: "string", description: "ISO-4217 sender currency" },
          sender_entity_type: { type: "string", enum: ["individual", "company"], description: "Sender entity type" },
        },
        required: ["beneficiary_country"],
      },
    },
    {
      name: "create_wallet",
      description: "Create a Rapyd managed wallet (user) for an end user. Rapyd's wallet differentiator: the merchant holds a master account and provisions sub-wallets per end user, enabling marketplace balances, creator payouts, and cross-border P2P without opening bank accounts per user. Returns an ewallet id (ewallet_xxx).",
      inputSchema: {
        type: "object",
        properties: {
          first_name: { type: "string", description: "User first name" },
          last_name: { type: "string", description: "User last name" },
          email: { type: "string", description: "User email (unique per wallet)" },
          ewallet_reference_id: { type: "string", description: "Merchant-side stable reference id for this wallet" },
          phone_number: { type: "string", description: "E.164 phone number" },
          type: { type: "string", enum: ["person", "company", "client"], description: "Wallet type. 'person' for end consumers, 'company' for business users, 'client' for merchant-owned master sub-accounts." },
          contact: {
            type: "object",
            description: "Full contact object with address fields, date_of_birth, identification_type, identification_number, nationality, etc. Required fields depend on country and type.",
          },
          metadata: { type: "object", description: "Arbitrary key-value metadata" },
        },
        required: ["first_name", "last_name", "email"],
      },
    },
    {
      name: "list_payments",
      description: "List payments with optional filters. Returns a paginated slice — use starting_after / ending_before cursors for the next page. Handy for reconciliation and dashboards.",
      inputSchema: {
        type: "object",
        properties: {
          created_after: { type: "string", description: "Cursor — return items created after this payment id (payment_xxx)" },
          created_before: { type: "string", description: "Cursor — return items created before this payment id (payment_xxx)" },
          ending_before: { type: "string", description: "Legacy cursor alias (return items before this id)" },
          starting_after: { type: "string", description: "Legacy cursor alias (return items after this id)" },
          limit: { type: "number", description: "Page size (1-100). Default 10." },
          customer: { type: "string", description: "Filter by Rapyd customer id (cus_xxx)" },
          merchant_reference_id: { type: "string", description: "Filter by merchant-side order id" },
          invoice: { type: "string", description: "Filter by Rapyd invoice id" },
          subscription: { type: "string", description: "Filter by Rapyd subscription id" },
          group: { type: "boolean", description: "Group payments by group_payment id when true" },
        },
      },
    },
    {
      name: "update_payment",
      description: "Update metadata / descriptor / receipt details on an existing payment. Does not mutate amount or method. Use metadata to attach your system's order ids after the fact.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Rapyd payment id (payment_xxx)" },
          description: { type: "string", description: "Replace the payment description" },
          metadata: { type: "object", description: "Replace the payment metadata (key-value)" },
          receipt_email: { type: "string", description: "Email used for a refund/receipt notification" },
          statement_descriptor: { type: "string", description: "Descriptor shown on the payer's statement where supported" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_payment_method",
      description: "Save a reusable payment method (card token, bank account, wallet) against a Rapyd customer. Returns a payment_method id (pmt_xxx) you can pass to create_payment.payment_method.id for subsequent charges — e.g. one-click checkout or subscription billing.",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Rapyd customer id (cus_xxx) the method will attach to" },
          type: { type: "string", description: "Payment method type (e.g. 'us_visa_card', 'br_credit_card', 'gb_directdebit_bank')" },
          fields: { type: "object", description: "Method-specific fields — e.g. { number, expiration_month, expiration_year, cvv, name } for cards" },
          metadata: { type: "object", description: "Arbitrary key-value metadata" },
          address: { type: "object", description: "Optional billing address object (name, line_1, city, country, zip, ...)" },
        },
        required: ["customer", "type"],
      },
    },
    {
      name: "delete_payment_method",
      description: "Remove a saved payment method from a Rapyd customer.",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Rapyd customer id (cus_xxx)" },
          payment_method: { type: "string", description: "Rapyd payment method id (pmt_xxx)" },
        },
        required: ["customer", "payment_method"],
      },
    },
    {
      name: "list_payouts",
      description: "List payouts (disbursements) with optional filters. Returns a paginated slice — use starting_after / ending_before cursors. Handy for reconciliation of seller/creator settlement runs.",
      inputSchema: {
        type: "object",
        properties: {
          ending_before: { type: "string", description: "Cursor — return items before this payout id (payout_xxx)" },
          starting_after: { type: "string", description: "Cursor — return items after this payout id (payout_xxx)" },
          limit: { type: "number", description: "Page size (1-100). Default 10." },
          status: { type: "string", description: "Filter by payout status (Created / Confirmed / Completed / Error / Cancelled)" },
          beneficiary: { type: "string", description: "Filter by beneficiary id" },
          payout_currency: { type: "string", description: "Filter by payout currency (ISO-4217)" },
          sender_currency: { type: "string", description: "Filter by sender currency (ISO-4217)" },
        },
      },
    },
    {
      name: "cancel_payout",
      description: "Cancel a payout that is still in 'Created' state (before confirm_payout releases funds). Fails for payouts already Confirmed/Completed.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Rapyd payout id (payout_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_wallet",
      description: "Retrieve a Rapyd ewallet (user) by id. Returns profile, contact list, and balances per currency.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Rapyd ewallet id (ewallet_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "update_wallet",
      description: "Update profile fields on a Rapyd ewallet (user). Pass the ewallet id plus only the fields you want to change. Contact-level edits (address, identification) go through the contact endpoints — this updates user-level fields.",
      inputSchema: {
        type: "object",
        properties: {
          ewallet: { type: "string", description: "Rapyd ewallet id (ewallet_xxx)" },
          first_name: { type: "string", description: "Updated first name" },
          last_name: { type: "string", description: "Updated last name" },
          email: { type: "string", description: "Updated email" },
          phone_number: { type: "string", description: "Updated E.164 phone" },
          ewallet_reference_id: { type: "string", description: "Updated merchant-side reference id" },
          metadata: { type: "object", description: "Replace the wallet metadata (key-value)" },
        },
        required: ["ewallet"],
      },
    },
    {
      name: "list_wallets",
      description: "List Rapyd ewallets under the merchant account. Supports pagination via starting_after / ending_before cursors. Use to enumerate sub-wallets for marketplaces or creator platforms.",
      inputSchema: {
        type: "object",
        properties: {
          ending_before: { type: "string", description: "Cursor — return items before this ewallet id (ewallet_xxx)" },
          starting_after: { type: "string", description: "Cursor — return items after this ewallet id (ewallet_xxx)" },
          limit: { type: "number", description: "Page size (1-100). Default 10." },
          type: { type: "string", enum: ["person", "company", "client"], description: "Filter by wallet type" },
          phone_number: { type: "string", description: "Find wallets by E.164 phone" },
          email: { type: "string", description: "Find wallets by email" },
          ewallet_reference_id: { type: "string", description: "Find wallets by merchant-side reference id" },
        },
      },
    },
    {
      name: "wallet_contact_verify",
      description: "Submit a verification token (usually received via SMS/email) to verify a wallet contact's identity. Part of Rapyd's KYC flow — required before the wallet can transact at higher tiers in several countries.",
      inputSchema: {
        type: "object",
        properties: {
          ewallet: { type: "string", description: "Rapyd ewallet id (ewallet_xxx)" },
          contact: { type: "string", description: "Rapyd contact id (cont_xxx) belonging to the wallet" },
          token: { type: "string", description: "Verification token delivered to the contact's channel" },
        },
        required: ["ewallet", "contact", "token"],
      },
    },
    {
      name: "transfer_between_wallets",
      description: "Move funds between two Rapyd ewallets (source_ewallet → destination_ewallet). Used for marketplace settlement (buyer wallet → seller wallet), creator payouts, internal rebalancing. Requires transfer acceptance on the destination side in some flows.",
      inputSchema: {
        type: "object",
        properties: {
          source_ewallet: { type: "string", description: "Source Rapyd ewallet id (ewallet_xxx)" },
          destination_ewallet: { type: "string", description: "Destination Rapyd ewallet id (ewallet_xxx)" },
          amount: { type: "number", description: "Amount in major units of currency" },
          currency: { type: "string", description: "ISO-4217 currency code. Both wallets must hold a balance in this currency." },
          metadata: { type: "object", description: "Arbitrary key-value metadata" },
        },
        required: ["source_ewallet", "destination_ewallet", "amount", "currency"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_checkout_page":
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("POST", "/v1/checkout", args), null, 2) }] };
      case "create_payment":
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("POST", "/v1/payments", args), null, 2) }] };
      case "get_payment":
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("GET", `/v1/payments/${args?.id}`), null, 2) }] };
      case "cancel_payment":
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("DELETE", `/v1/payments/${args?.id}`), null, 2) }] };
      case "create_refund":
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("POST", "/v1/refunds", args), null, 2) }] };
      case "create_payout":
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("POST", "/v1/payouts", args), null, 2) }] };
      case "get_payout":
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("GET", `/v1/payouts/${args?.id}`), null, 2) }] };
      case "confirm_payout":
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("POST", `/v1/payouts/confirm/${args?.id}`), null, 2) }] };
      case "list_payment_methods_by_country": {
        const country = encodeURIComponent(String(args?.country ?? ""));
        const currency = args?.currency ? `&currency=${encodeURIComponent(String(args.currency))}` : "";
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("GET", `/v1/payment_methods/country?country=${country}${currency}`), null, 2) }] };
      }
      case "list_payout_methods_by_country": {
        const params = new URLSearchParams();
        params.set("beneficiary_country", String(args?.beneficiary_country ?? ""));
        if (args?.beneficiary_entity_type) params.set("beneficiary_entity_type", String(args.beneficiary_entity_type));
        if (args?.payout_currency) params.set("payout_currency", String(args.payout_currency));
        if (args?.sender_country) params.set("sender_country", String(args.sender_country));
        if (args?.sender_currency) params.set("sender_currency", String(args.sender_currency));
        if (args?.sender_entity_type) params.set("sender_entity_type", String(args.sender_entity_type));
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("GET", `/v1/payouts/supported_types?${params.toString()}`), null, 2) }] };
      }
      case "list_payments": {
        const params = new URLSearchParams();
        if (args?.created_after) params.set("created_after", String(args.created_after));
        if (args?.created_before) params.set("created_before", String(args.created_before));
        if (args?.ending_before) params.set("ending_before", String(args.ending_before));
        if (args?.starting_after) params.set("starting_after", String(args.starting_after));
        if (args?.limit !== undefined) params.set("limit", String(args.limit));
        if (args?.customer) params.set("customer", String(args.customer));
        if (args?.merchant_reference_id) params.set("merchant_reference_id", String(args.merchant_reference_id));
        if (args?.invoice) params.set("invoice", String(args.invoice));
        if (args?.subscription) params.set("subscription", String(args.subscription));
        if (args?.group !== undefined) params.set("group", String(args.group));
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("GET", `/v1/payments${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "update_payment": {
        const { id, ...rest } = (args ?? {}) as { id?: string; [k: string]: unknown };
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("POST", `/v1/payments/${id}`, rest), null, 2) }] };
      }
      case "create_payment_method": {
        const { customer, ...rest } = (args ?? {}) as { customer?: string; [k: string]: unknown };
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("POST", `/v1/customers/${customer}/payment_methods`, rest), null, 2) }] };
      }
      case "delete_payment_method":
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("DELETE", `/v1/customers/${args?.customer}/payment_methods/${args?.payment_method}`), null, 2) }] };
      case "list_payouts": {
        const params = new URLSearchParams();
        if (args?.ending_before) params.set("ending_before", String(args.ending_before));
        if (args?.starting_after) params.set("starting_after", String(args.starting_after));
        if (args?.limit !== undefined) params.set("limit", String(args.limit));
        if (args?.status) params.set("status", String(args.status));
        if (args?.beneficiary) params.set("beneficiary", String(args.beneficiary));
        if (args?.payout_currency) params.set("payout_currency", String(args.payout_currency));
        if (args?.sender_currency) params.set("sender_currency", String(args.sender_currency));
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("GET", `/v1/payouts${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "cancel_payout":
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("DELETE", `/v1/payouts/${args?.id}`), null, 2) }] };
      case "create_wallet":
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("POST", "/v1/user", args), null, 2) }] };
      case "get_wallet":
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("GET", `/v1/user/${args?.id}`), null, 2) }] };
      case "update_wallet":
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("PUT", "/v1/user", args), null, 2) }] };
      case "list_wallets": {
        const params = new URLSearchParams();
        if (args?.ending_before) params.set("ending_before", String(args.ending_before));
        if (args?.starting_after) params.set("starting_after", String(args.starting_after));
        if (args?.limit !== undefined) params.set("limit", String(args.limit));
        if (args?.type) params.set("type", String(args.type));
        if (args?.phone_number) params.set("phone_number", String(args.phone_number));
        if (args?.email) params.set("email", String(args.email));
        if (args?.ewallet_reference_id) params.set("ewallet_reference_id", String(args.ewallet_reference_id));
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("GET", `/v1/user${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "wallet_contact_verify": {
        const { ewallet, contact, token } = (args ?? {}) as { ewallet?: string; contact?: string; token?: string };
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("POST", `/v1/users/${ewallet}/contacts/${contact}/verify`, { token }), null, 2) }] };
      }
      case "transfer_between_wallets":
        return { content: [{ type: "text", text: JSON.stringify(await rapydRequest("POST", "/v1/account/transfer", args), null, 2) }] };
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
        const s = new Server({ name: "mcp-rapyd", version: "0.2.1" }, { capabilities: { tools: {} } });
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
