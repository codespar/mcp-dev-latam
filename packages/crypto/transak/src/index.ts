#!/usr/bin/env node

/**
 * MCP Server for Transak — fiat-to-crypto on/off-ramp.
 *
 * Transak is a global fiat<>crypto on/off-ramp covering ~170 countries with
 * multi-chain support (Ethereum, Solana, Polygon, BSC, Bitcoin, and more).
 * It is the natural peer/alternative to MoonPay. Agents use Transak to (a)
 * let a buyer fund an on-chain purchase with local fiat (card, bank transfer,
 * Apple/Google Pay, UPI, Pix where available), or (b) sell crypto back into
 * fiat payouts. Bundling MoonPay + Transak enables best-rate routing across
 * corridors — each has partner lists, pricing, and country coverage the
 * other doesn't.
 *
 * Tools (18):
 *   create_order              — POST /api/v2/orders  — create a BUY (fiat→crypto) or SELL (crypto→fiat) order
 *   get_order                 — GET  /api/v2/orders/{id}
 *   list_orders               — GET  /api/v2/orders with filters (status, walletAddress, partnerOrderId, dates)
 *   update_order              — PATCH /api/v2/orders/{id} — update post-creation order fields
 *   cancel_order              — POST /api/v2/orders/{id}/cancel
 *   get_quote                 — GET  /api/v1/pricing/public/quotes (public, no auth; takes partnerApiKey)
 *   get_order_limits          — GET  /api/v2/currencies/min-max (min/max by fiat+crypto+country)
 *   list_fiat_currencies      — GET  /api/v2/currencies/fiat-currencies (public)
 *   list_crypto_currencies    — GET  /api/v2/currencies/crypto-currencies (public)
 *   list_payment_methods      — GET  /api/v2/currencies/payment-methods?fiatCurrency=X (public)
 *   list_countries            — GET  /api/v2/countries (public)
 *   list_network_fees         — GET  /api/v2/currencies/network-fees (public)
 *   get_partner_account       — GET  /api/v2/partner/me — partner profile / account info
 *   get_partner_balance       — GET  /api/v2/partner/balance — partner liquidity / settlement balance
 *   refresh_access_token      — POST /api/v2/refresh-token — mint a short-lived access-token
 *   get_kyc_status            — GET  /api/v2/users/kyc-status — KYC status by partnerCustomerId or email
 *   get_user_limits           — GET  /api/v2/users/limits — per-user KYC-tier transaction limits
 *   verify_webhook_signature  — local HMAC-SHA256 verification helper (no API call)
 *
 * Authentication
 *   Transak's Partner API expects two headers on authenticated endpoints:
 *     api-secret  : the partner API secret (from the partner dashboard)
 *     access-token: a short-lived token minted by POSTing api-secret to the
 *                   partner refresh-token endpoint. This server sends api-secret
 *                   directly; if your partner tier requires an access-token,
 *                   call refresh_access_token (or mint one out-of-band) and set
 *                   it via TRANSAK_ACCESS_TOKEN — it will be added automatically
 *                   when present.
 *   Public endpoints (quotes, currencies, payment-methods, countries, network
 *   fees, order-limits) need no auth beyond partnerApiKey on /quotes.
 *
 * Webhook verification
 *   Transak signs partner webhooks with HMAC-SHA256 using the partner API
 *   secret as the key and the raw request body as the message. Use
 *   verify_webhook_signature with the raw body and the value of the
 *   `x-transak-signature` (or `signature`) header.
 *
 * Environment
 *   TRANSAK_API_KEY          — partner API key (required; used as partnerApiKey)
 *   TRANSAK_API_SECRET       — partner API secret (required; sent as api-secret header)
 *   TRANSAK_ACCESS_TOKEN     — optional short-lived access token (sent as access-token header)
 *   TRANSAK_ENV              — 'staging' (default) | 'production'
 *
 * Docs: https://docs.transak.com/reference
 *
 * NOTE: this package is 0.1.0-alpha.2 because several partner-order endpoint
 * paths were not independently verifiable against public docs at authoring
 * time. The public currency/quote/country endpoints were confirmed live.
 * Treat partner-order paths as the documented defaults and expect minor path
 * tweaks once you pair against a real partner dashboard.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createHmac, timingSafeEqual } from "node:crypto";

const API_KEY = process.env.TRANSAK_API_KEY || "";
const API_SECRET = process.env.TRANSAK_API_SECRET || "";
const ACCESS_TOKEN = process.env.TRANSAK_ACCESS_TOKEN || "";
const ENV = (process.env.TRANSAK_ENV || "staging").toLowerCase();
const BASE_URL = ENV === "production" ? "https://api.transak.com" : "https://api-stg.transak.com";

type TransakRequestOpts = { requiresAuth?: boolean };

async function transakRequest(
  method: string,
  path: string,
  body?: unknown,
  opts: TransakRequestOpts = {}
): Promise<unknown> {
  const { requiresAuth = true } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (requiresAuth) {
    if (API_SECRET) headers["api-secret"] = API_SECRET;
    if (ACCESS_TOKEN) headers["access-token"] = ACCESS_TOKEN;
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Transak API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-transak", version: "0.2.0-alpha.2" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_order",
      description: "Create a Transak order. Use isBuyOrSell='BUY' to onramp (fiat→crypto, funds delivered to walletAddress) or 'SELL' to offramp (crypto→fiat, payout to the linked bank account). Returns the order object with status, a widget/redirect URL if required, and the partner-side id.",
      inputSchema: {
        type: "object",
        properties: {
          walletAddress: { type: "string", description: "Destination (BUY) or source (SELL) crypto wallet address" },
          fiatCurrency: { type: "string", description: "ISO-4217 fiat currency code (USD, EUR, BRL, GBP, INR, etc)" },
          fiatAmount: { type: "number", description: "Fiat amount in major units. Either fiatAmount or cryptoAmount must be set." },
          cryptoCurrency: { type: "string", description: "Crypto ticker (ETH, USDC, USDT, BTC, SOL, MATIC, etc)" },
          cryptoAmount: { type: "number", description: "Crypto amount. Either fiatAmount or cryptoAmount must be set." },
          network: { type: "string", description: "Blockchain network (ethereum, polygon, bsc, solana, bitcoin, arbitrum, optimism, base, etc)" },
          isBuyOrSell: { type: "string", enum: ["BUY", "SELL"], description: "BUY = fiat→crypto onramp; SELL = crypto→fiat offramp" },
          email: { type: "string", description: "Buyer email (used for KYC + receipt)" },
          paymentMethod: { type: "string", description: "Method id from list_payment_methods (credit_debit_card, apple_pay, google_pay, sepa_bank_transfer, pix, upi, etc)" },
          partnerOrderId: { type: "string", description: "Merchant-side stable order id (echoed back on webhooks)" },
          partnerCustomerId: { type: "string", description: "Merchant-side stable user id (for returning users)" },
          redirectURL: { type: "string", description: "URL Transak redirects to after the hosted flow completes" },
          themeColor: { type: "string", description: "Optional hex color (no #) for hosted widget branding" },
        },
        required: ["walletAddress", "fiatCurrency", "cryptoCurrency", "network", "isBuyOrSell", "email", "partnerOrderId"],
      },
    },
    {
      name: "get_order",
      description: "Get a Transak order by its Transak order id. Returns full status, fiat/crypto amounts, fees, tx hash (once on-chain), and current state.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Transak order id (UUID)" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_orders",
      description: "List Transak orders for the partner account. Filter by status, walletAddress, partnerOrderId, isBuyOrSell, or createdAt date range. Use this to reconcile webhook-driven state, run sweeps on pending orders, or pull a partner-period statement.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by status (AWAITING_PAYMENT_FROM_USER, PAYMENT_DONE_MARKED_BY_USER, PROCESSING, COMPLETED, CANCELLED, FAILED, EXPIRED, REFUNDED, ON_HOLD_PENDING_DELIVERY_FROM_TRANSAK)" },
          walletAddress: { type: "string", description: "Filter by destination/source wallet address" },
          partnerOrderId: { type: "string", description: "Filter by merchant-side order id" },
          isBuyOrSell: { type: "string", enum: ["BUY", "SELL"], description: "Filter to BUY (onramp) or SELL (offramp) orders only" },
          limit: { type: "number", description: "Max rows to return" },
          startDate: { type: "string", description: "ISO-8601 lower bound (createdAt)" },
          endDate: { type: "string", description: "ISO-8601 upper bound (createdAt)" },
        },
      },
    },
    {
      name: "update_order",
      description: "Update a Transak order after creation. Used for partner-side post-creation actions such as marking a SELL crypto deposit transaction hash, attaching/changing the partnerCustomerId, refreshing the redirectURL, or correcting the buyer email before KYC. Only mutable fields are accepted; immutable fields (amount, currency, network) require a fresh order.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Transak order id to update" },
          transactionHash: { type: "string", description: "On-chain tx hash for SELL orders (buyer's crypto deposit to Transak)" },
          partnerCustomerId: { type: "string", description: "New/corrected merchant-side user id" },
          email: { type: "string", description: "Updated buyer email (only before KYC submission)" },
          redirectURL: { type: "string", description: "Updated post-flow redirect URL" },
          status: { type: "string", description: "Partner-set status when applicable (e.g. PAYMENT_DONE_MARKED_BY_USER)" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_order",
      description: "Cancel a Transak order. Only works while the order is in a cancellable state (awaiting payment / pending). Completed or in-flight on-chain orders cannot be cancelled.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Transak order id to cancel" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_quote",
      description: "Get a fiat↔crypto price quote (public, no auth). Returns the rate, fees, min/max, delivery network, and the exact cryptoAmount the buyer receives for a given fiatAmount (or vice versa). Use this before calling create_order to show the user a price they can confirm.",
      inputSchema: {
        type: "object",
        properties: {
          fiatCurrency: { type: "string", description: "ISO-4217 fiat code (USD, EUR, BRL, GBP, INR, ...)" },
          cryptoCurrency: { type: "string", description: "Crypto ticker (ETH, USDC, BTC, SOL, ...)" },
          network: { type: "string", description: "Blockchain network (ethereum, polygon, solana, ...)" },
          fiatAmount: { type: "number", description: "Fiat amount. Either fiatAmount or cryptoAmount." },
          cryptoAmount: { type: "number", description: "Crypto amount. Either fiatAmount or cryptoAmount." },
          isBuyOrSell: { type: "string", enum: ["BUY", "SELL"], description: "BUY or SELL" },
          paymentMethod: { type: "string", description: "Optional payment method id to price that specific rail" },
        },
        required: ["fiatCurrency", "cryptoCurrency", "network", "isBuyOrSell"],
      },
    },
    {
      name: "get_order_limits",
      description: "Get the min and max trade amount for a fiat+crypto+country combination — what's the smallest USD a US buyer can spend on USDC/Polygon, and what's the cap before extra KYC kicks in? Public endpoint. Pair with get_quote so you can prevalidate amount before opening the widget.",
      inputSchema: {
        type: "object",
        properties: {
          fiatCurrency: { type: "string", description: "ISO-4217 fiat code (USD, EUR, BRL, ...)" },
          cryptoCurrency: { type: "string", description: "Crypto ticker (ETH, USDC, BTC, ...)" },
          network: { type: "string", description: "Blockchain network (ethereum, polygon, solana, ...)" },
          countryCode: { type: "string", description: "ISO 3166-1 alpha-2 country code (US, GB, BR, IN, ...)" },
          paymentMethod: { type: "string", description: "Optional payment method id for rail-specific limits" },
          isBuyOrSell: { type: "string", enum: ["BUY", "SELL"], description: "BUY or SELL — limits differ between onramp and offramp" },
        },
        required: ["fiatCurrency", "cryptoCurrency", "isBuyOrSell"],
      },
    },
    {
      name: "list_fiat_currencies",
      description: "List all fiat currencies Transak supports, with per-currency payment methods, limits, and country restrictions. Public endpoint — safe to call without credentials. Use as a discovery step before rendering a funding flow.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_crypto_currencies",
      description: "List all crypto assets Transak supports, including network, decimals, pay-in/pay-out eligibility, and jurisdictional restrictions (US state blocklists etc). Public endpoint.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_payment_methods",
      description: "List payment methods available for a given fiat currency (card, Apple Pay, Google Pay, SEPA, UPI, Pix, wire, etc) with min/max amounts and processing time. Public endpoint. Use to dynamically build a funding-method picker per corridor.",
      inputSchema: {
        type: "object",
        properties: {
          fiatCurrency: { type: "string", description: "ISO-4217 fiat code (USD, EUR, BRL, ...)" },
        },
        required: ["fiatCurrency"],
      },
    },
    {
      name: "list_countries",
      description: "List the countries Transak serves, with allowed fiat currencies, payment methods, and KYC requirements per country. Optionally filter by fiatCurrency to see only countries where that fiat is supported. Public endpoint — call this as a discovery step before showing a country picker.",
      inputSchema: {
        type: "object",
        properties: {
          fiatCurrency: { type: "string", description: "Optional ISO-4217 fiat code to restrict to countries supporting that fiat" },
        },
      },
    },
    {
      name: "list_network_fees",
      description: "List the network/gas fees Transak charges (or estimates) per crypto+network combination. Useful for showing buyers the all-in landed cost or for choosing the cheapest network when an asset is multi-chain (e.g. USDC on Polygon vs Ethereum). Public endpoint.",
      inputSchema: {
        type: "object",
        properties: {
          cryptoCurrency: { type: "string", description: "Optional crypto ticker filter (USDC, ETH, ...)" },
          network: { type: "string", description: "Optional network filter (ethereum, polygon, solana, ...)" },
        },
      },
    },
    {
      name: "get_partner_account",
      description: "Get the authenticated partner's account profile (name, api key info, configured webhooks, default currencies). Useful for debugging which partner credentials the server is using.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_partner_balance",
      description: "Get the partner's settlement balance(s) — Transak holds partner liquidity per fiat to fund SELL payouts and reserves earned commissions until they settle. Returns balances broken down by currency, available vs pending, and last-settlement timestamp. Use this to monitor funding levels before promoting a high-volume corridor.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "refresh_access_token",
      description: "Mint a fresh short-lived access-token from the partner api-secret. Some Partner API tiers require this token (sent as the access-token header) on order/user endpoints. The token is short-lived (~minutes); cache it and refresh on 401. Returns { accessToken, expiresAt }.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_kyc_status",
      description: "Get the KYC status of a buyer the partner has previously sent through Transak. Look up by partnerCustomerId (preferred — your stable id) or email. Returns kycStatus (NOT_SUBMITTED, IN_REVIEW, APPROVED, REJECTED, EXPIRED), tier, country, and the timestamps. Use this to skip re-KYC for returning buyers and unlock higher limits.",
      inputSchema: {
        type: "object",
        properties: {
          partnerCustomerId: { type: "string", description: "Your merchant-side stable user id" },
          email: { type: "string", description: "Buyer email (alternative to partnerCustomerId)" },
        },
      },
    },
    {
      name: "get_user_limits",
      description: "Get the current per-user transaction limits granted by Transak based on the user's KYC tier and country (daily, weekly, monthly, lifetime caps in fiat). Look up by partnerCustomerId or email. Use before quoting big-ticket purchases so you can warn a buyer they'll need a tier-up flow first.",
      inputSchema: {
        type: "object",
        properties: {
          partnerCustomerId: { type: "string", description: "Your merchant-side stable user id" },
          email: { type: "string", description: "Buyer email (alternative to partnerCustomerId)" },
          fiatCurrency: { type: "string", description: "Optional fiat to denominate the limits in (defaults to user's home fiat)" },
        },
      },
    },
    {
      name: "verify_webhook_signature",
      description: "Locally verify the HMAC-SHA256 signature on a Transak webhook delivery. Transak signs the raw request body with the partner api-secret as the HMAC key; the signature is delivered in the x-transak-signature header (sometimes also `signature`). Pass the raw body string + the header value and this returns { valid: boolean }. Does NOT call Transak — pure local crypto. Always use this before trusting webhook contents.",
      inputSchema: {
        type: "object",
        properties: {
          rawBody: { type: "string", description: "The raw, unparsed webhook request body (bytes-as-utf8 string). Must be the EXACT bytes Transak sent — do not JSON.parse-then-stringify, or the signature will mismatch." },
          signature: { type: "string", description: "Hex-encoded signature from the x-transak-signature (or `signature`) header" },
          secret: { type: "string", description: "Optional override for the partner api-secret (defaults to TRANSAK_API_SECRET env var)" },
        },
        required: ["rawBody", "signature"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_order": {
        const body: Record<string, unknown> = { ...args, partnerApiKey: API_KEY };
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("POST", "/api/v2/orders", body), null, 2) }] };
      }
      case "get_order":
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("GET", `/api/v2/orders/${encodeURIComponent(String(args?.id ?? ""))}`), null, 2) }] };
      case "list_orders": {
        const qs = new URLSearchParams();
        if (args?.status) qs.set("status", String(args.status));
        if (args?.walletAddress) qs.set("walletAddress", String(args.walletAddress));
        if (args?.partnerOrderId) qs.set("partnerOrderId", String(args.partnerOrderId));
        if (args?.isBuyOrSell) qs.set("isBuyOrSell", String(args.isBuyOrSell));
        if (args?.limit !== undefined) qs.set("limit", String(args.limit));
        if (args?.startDate) qs.set("startDate", String(args.startDate));
        if (args?.endDate) qs.set("endDate", String(args.endDate));
        const q = qs.toString();
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("GET", `/api/v2/orders${q ? `?${q}` : ""}`), null, 2) }] };
      }
      case "update_order": {
        const id = encodeURIComponent(String(args?.id ?? ""));
        const body: Record<string, unknown> = { ...args };
        delete body.id;
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("PATCH", `/api/v2/orders/${id}`, body), null, 2) }] };
      }
      case "cancel_order":
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("POST", `/api/v2/orders/${encodeURIComponent(String(args?.id ?? ""))}/cancel`), null, 2) }] };
      case "get_quote": {
        const qs = new URLSearchParams();
        qs.set("partnerApiKey", API_KEY);
        qs.set("fiatCurrency", String(args?.fiatCurrency ?? ""));
        qs.set("cryptoCurrency", String(args?.cryptoCurrency ?? ""));
        qs.set("network", String(args?.network ?? ""));
        qs.set("isBuyOrSell", String(args?.isBuyOrSell ?? "BUY"));
        if (args?.fiatAmount !== undefined) qs.set("fiatAmount", String(args.fiatAmount));
        if (args?.cryptoAmount !== undefined) qs.set("cryptoAmount", String(args.cryptoAmount));
        if (args?.paymentMethod) qs.set("paymentMethod", String(args.paymentMethod));
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("GET", `/api/v1/pricing/public/quotes?${qs.toString()}`, undefined, { requiresAuth: false }), null, 2) }] };
      }
      case "get_order_limits": {
        const qs = new URLSearchParams();
        qs.set("partnerApiKey", API_KEY);
        qs.set("fiatCurrency", String(args?.fiatCurrency ?? ""));
        qs.set("cryptoCurrency", String(args?.cryptoCurrency ?? ""));
        qs.set("isBuyOrSell", String(args?.isBuyOrSell ?? "BUY"));
        if (args?.network) qs.set("network", String(args.network));
        if (args?.countryCode) qs.set("countryCode", String(args.countryCode));
        if (args?.paymentMethod) qs.set("paymentMethod", String(args.paymentMethod));
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("GET", `/api/v2/currencies/min-max?${qs.toString()}`, undefined, { requiresAuth: false }), null, 2) }] };
      }
      case "list_fiat_currencies":
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("GET", "/api/v2/currencies/fiat-currencies", undefined, { requiresAuth: false }), null, 2) }] };
      case "list_crypto_currencies":
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("GET", "/api/v2/currencies/crypto-currencies", undefined, { requiresAuth: false }), null, 2) }] };
      case "list_payment_methods": {
        const fiat = encodeURIComponent(String(args?.fiatCurrency ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("GET", `/api/v2/currencies/payment-methods?fiatCurrency=${fiat}`, undefined, { requiresAuth: false }), null, 2) }] };
      }
      case "list_countries": {
        const qs = new URLSearchParams();
        if (args?.fiatCurrency) qs.set("fiatCurrency", String(args.fiatCurrency));
        const q = qs.toString();
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("GET", `/api/v2/countries${q ? `?${q}` : ""}`, undefined, { requiresAuth: false }), null, 2) }] };
      }
      case "list_network_fees": {
        const qs = new URLSearchParams();
        if (args?.cryptoCurrency) qs.set("cryptoCurrency", String(args.cryptoCurrency));
        if (args?.network) qs.set("network", String(args.network));
        const q = qs.toString();
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("GET", `/api/v2/currencies/network-fees${q ? `?${q}` : ""}`, undefined, { requiresAuth: false }), null, 2) }] };
      }
      case "get_partner_account":
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("GET", "/api/v2/partner/me"), null, 2) }] };
      case "get_partner_balance":
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("GET", "/api/v2/partner/balance"), null, 2) }] };
      case "refresh_access_token":
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("POST", "/api/v2/refresh-token", { apiKey: API_KEY }), null, 2) }] };
      case "get_kyc_status": {
        const qs = new URLSearchParams();
        if (args?.partnerCustomerId) qs.set("partnerCustomerId", String(args.partnerCustomerId));
        if (args?.email) qs.set("email", String(args.email));
        const q = qs.toString();
        if (!q) throw new Error("get_kyc_status: provide partnerCustomerId or email");
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("GET", `/api/v2/users/kyc-status?${q}`), null, 2) }] };
      }
      case "get_user_limits": {
        const qs = new URLSearchParams();
        if (args?.partnerCustomerId) qs.set("partnerCustomerId", String(args.partnerCustomerId));
        if (args?.email) qs.set("email", String(args.email));
        if (args?.fiatCurrency) qs.set("fiatCurrency", String(args.fiatCurrency));
        const q = qs.toString();
        if (!args?.partnerCustomerId && !args?.email) throw new Error("get_user_limits: provide partnerCustomerId or email");
        return { content: [{ type: "text", text: JSON.stringify(await transakRequest("GET", `/api/v2/users/limits?${q}`), null, 2) }] };
      }
      case "verify_webhook_signature": {
        const rawBody = String(args?.rawBody ?? "");
        const signature = String(args?.signature ?? "").trim();
        const secret = String(args?.secret ?? API_SECRET);
        if (!secret) throw new Error("verify_webhook_signature: no secret available (set TRANSAK_API_SECRET or pass secret)");
        const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
        let valid = false;
        try {
          const a = Buffer.from(expected, "hex");
          const b = Buffer.from(signature, "hex");
          valid = a.length === b.length && timingSafeEqual(a, b);
        } catch {
          valid = false;
        }
        return { content: [{ type: "text", text: JSON.stringify({ valid, expected }, null, 2) }] };
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
        const s = new Server({ name: "mcp-transak", version: "0.2.0-alpha.2" }, { capabilities: { tools: {} } });
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
