#!/usr/bin/env node

/**
 * MCP Server for MoonPay — fiat-to-crypto on/off-ramp.
 *
 * MoonPay spans 100+ crypto assets and many geographies, with both buy
 * (fiat -> crypto) and sell (crypto -> fiat) flows. For LatAm, Pix is
 * supported as a BR onramp rail. Complementary to UnblockPay (BRL/MXN
 * <-> USDC) in the catalog: MoonPay is the broader-coverage, longer-tail
 * option for agents paying out in crypto or end users buying crypto with
 * local currency.
 *
 * Tools (20):
 *   get_buy_quote            — preview a fiat -> crypto exchange before committing
 *   create_buy_transaction   — create a buy transaction (fiat -> crypto)
 *   get_buy_transaction      — retrieve a buy transaction by id
 *   list_buy_transactions    — list buy transactions with filters
 *   get_sell_quote           — preview a crypto -> fiat exchange
 *   create_sell_transaction  — create a sell transaction (crypto -> fiat)
 *   get_sell_transaction     — retrieve a sell transaction by id
 *   refund_sell_transaction  — request a refund on an off-ramp transaction
 *   create_customer          — create a KYC'd end user
 *   get_customer             — retrieve a customer by id
 *   get_customer_kyc_status  — fetch KYC verification status for a customer
 *   list_customer_transactions — list all (buy + sell) transactions tied to a customer
 *   get_transaction_receipt  — fetch a tax-/audit-grade receipt for a completed transaction
 *   list_currencies          — list supported fiat + crypto assets (dynamic discovery)
 *   get_currency             — retrieve metadata for a single currency by code
 *   list_countries           — list supported countries with allowed flows (buy/sell) per geography
 *   list_payment_methods     — list payment methods supported for a fiat / country pair
 *   get_user_country         — IP-based geolocation + alpha-3 country code (compliance helper)
 *   sign_buy_url             — HMAC-sign a hosted-checkout buy widget URL with apiKey + params
 *   sign_sell_url            — HMAC-sign a hosted-checkout sell widget URL with apiKey + params
 *
 * Authentication
 *   REST API requests carry:
 *     Authorization: Api-Key <API_KEY>
 *   Sandbox vs production is selected by which key you pass; the base URL is the same.
 *
 *   Hosted widget URLs (buy.moonpay.com / sell.moonpay.com) are HMAC-SHA256
 *   signed using the publishable key + secret key (see sign_buy_url / sign_sell_url).
 *
 * Environment
 *   MOONPAY_API_KEY        — REST API key (required, secret)
 *   MOONPAY_PUBLISHABLE_KEY — publishable key for widget URLs (optional, used by sign_*_url)
 *   MOONPAY_SECRET_KEY     — secret key for HMAC signing widget URLs (optional, used by sign_*_url)
 *   MOONPAY_BASE_URL       — optional; defaults to https://api.moonpay.com
 *   MOONPAY_BUY_WIDGET_URL — optional; defaults to https://buy.moonpay.com
 *   MOONPAY_SELL_WIDGET_URL — optional; defaults to https://sell.moonpay.com
 *
 * Docs: https://dev.moonpay.com
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createHmac } from "node:crypto";

const API_KEY = process.env.MOONPAY_API_KEY || "";
const PUBLISHABLE_KEY = process.env.MOONPAY_PUBLISHABLE_KEY || "";
const SECRET_KEY = process.env.MOONPAY_SECRET_KEY || "";
const BASE_URL = process.env.MOONPAY_BASE_URL || "https://api.moonpay.com";
const BUY_WIDGET_URL = process.env.MOONPAY_BUY_WIDGET_URL || "https://buy.moonpay.com";
const SELL_WIDGET_URL = process.env.MOONPAY_SELL_WIDGET_URL || "https://sell.moonpay.com";

async function moonpayRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Api-Key ${API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`MoonPay API ${res.status}: ${err}`);
  }
  // Some endpoints (e.g. 204 No Content) may not return JSON.
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function qs(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  const search = new URLSearchParams();
  for (const [k, v] of entries) search.set(k, String(v));
  return `?${search.toString()}`;
}

/**
 * HMAC-SHA256 sign a MoonPay widget URL.
 *
 * MoonPay's hosted widget (buy.moonpay.com / sell.moonpay.com) requires that
 * the query string be signed with the merchant's secret key. The signature is
 * computed over the URL's query portion (including the leading `?`) and
 * appended as `&signature=<base64>`.
 *
 * Requires MOONPAY_PUBLISHABLE_KEY (added as `apiKey` param) and
 * MOONPAY_SECRET_KEY (used as the HMAC key) to be set.
 */
function signWidgetUrl(widgetBase: string, params: Record<string, unknown>): string {
  if (!PUBLISHABLE_KEY) throw new Error("MOONPAY_PUBLISHABLE_KEY is not set; cannot sign widget URL.");
  if (!SECRET_KEY) throw new Error("MOONPAY_SECRET_KEY is not set; cannot sign widget URL.");
  const merged: Record<string, unknown> = { apiKey: PUBLISHABLE_KEY, ...params };
  const entries = Object.entries(merged).filter(([, v]) => v !== undefined && v !== null && v !== "");
  const search = new URLSearchParams();
  for (const [k, v] of entries) {
    if (typeof v === "object") search.set(k, JSON.stringify(v));
    else search.set(k, String(v));
  }
  const query = `?${search.toString()}`;
  const signature = createHmac("sha256", SECRET_KEY).update(query).digest("base64");
  return `${widgetBase}${query}&signature=${encodeURIComponent(signature)}`;
}

const server = new Server(
  { name: "mcp-moonpay", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_buy_quote",
      description: "Preview a fiat -> crypto buy quote in real time. Use this before create_buy_transaction to show the end user the exact crypto amount, fees, and effective rate.",
      inputSchema: {
        type: "object",
        properties: {
          currencyCode: { type: "string", description: "Crypto currency code you want to buy (e.g. btc, eth, usdc, sol). Must be a code returned by list_currencies." },
          baseCurrencyCode: { type: "string", description: "Fiat currency you are paying with (e.g. usd, eur, brl, mxn)" },
          baseCurrencyAmount: { type: "number", description: "Amount in fiat to spend (major units). Either this or quoteCurrencyAmount must be supplied." },
          quoteCurrencyAmount: { type: "number", description: "Amount of crypto to receive (major units). Either this or baseCurrencyAmount must be supplied." },
          paymentMethod: { type: "string", description: "Optional payment method hint (e.g. credit_debit_card, sepa_bank_transfer, pix)" },
          areFeesIncluded: { type: "boolean", description: "If true, baseCurrencyAmount includes MoonPay fees." },
        },
        required: ["currencyCode", "baseCurrencyCode"],
      },
    },
    {
      name: "create_buy_transaction",
      description: "Create a buy transaction (fiat -> crypto). The returned object contains status plus — depending on method — redirect URL for hosted checkout, Pix QR data, or card auth next steps.",
      inputSchema: {
        type: "object",
        properties: {
          baseCurrencyAmount: { type: "number", description: "Fiat amount to charge (major units)" },
          baseCurrencyCode: { type: "string", description: "Fiat currency code (e.g. brl, usd)" },
          currencyCode: { type: "string", description: "Crypto currency code to receive (e.g. btc, usdc)" },
          walletAddress: { type: "string", description: "Destination crypto wallet address" },
          walletAddressTag: { type: "string", description: "Destination tag / memo (for chains that require it, e.g. XRP, XLM)" },
          customerId: { type: "string", description: "Existing MoonPay customer id (use create_customer first)" },
          externalCustomerId: { type: "string", description: "Your internal user id, propagated to MoonPay for reconciliation" },
          externalTransactionId: { type: "string", description: "Your internal transaction reference" },
          paymentMethod: { type: "string", description: "Payment method (e.g. credit_debit_card, sepa_bank_transfer, pix)" },
          returnUrl: { type: "string", description: "Browser redirect after hosted flow completes" },
          extraFields: { type: "object", description: "Additional provider-specific fields passed through as-is" },
        },
        required: ["baseCurrencyAmount", "baseCurrencyCode", "currencyCode", "walletAddress"],
      },
    },
    {
      name: "get_buy_transaction",
      description: "Retrieve a buy transaction (fiat -> crypto) by its MoonPay id. Returns current status and settlement detail.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "MoonPay transaction id" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_buy_transactions",
      description: "List buy transactions with optional filters. Used for reconciliation and agent-driven monitoring.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "Filter to a single MoonPay customer id" },
          externalCustomerId: { type: "string", description: "Filter to your internal user id" },
          status: { type: "string", description: "Filter by transaction status (e.g. pending, completed, failed)" },
          limit: { type: "number", description: "Max results to return" },
        },
      },
    },
    {
      name: "get_sell_quote",
      description: "Preview a crypto -> fiat sell quote in real time. Use this before create_sell_transaction to show the end user the exact fiat amount, fees, and effective rate.",
      inputSchema: {
        type: "object",
        properties: {
          currencyCode: { type: "string", description: "Crypto currency code you want to sell (e.g. btc, usdc)" },
          quoteCurrencyCode: { type: "string", description: "Fiat currency to receive (e.g. usd, eur, brl)" },
          baseCurrencyAmount: { type: "number", description: "Crypto amount to sell (major units). Either this or quoteCurrencyAmount must be supplied." },
          quoteCurrencyAmount: { type: "number", description: "Fiat amount to receive (major units). Either this or baseCurrencyAmount must be supplied." },
          payoutMethod: { type: "string", description: "Optional payout method hint (e.g. sepa_bank_transfer, credit_debit_card, pix)" },
        },
        required: ["currencyCode", "quoteCurrencyCode"],
      },
    },
    {
      name: "create_sell_transaction",
      description: "Create a sell transaction (crypto -> fiat). Used for agents that need to pay out in local fiat after receiving crypto.",
      inputSchema: {
        type: "object",
        properties: {
          baseCurrencyAmount: { type: "number", description: "Crypto amount to sell (major units)" },
          baseCurrencyCode: { type: "string", description: "Crypto currency code (e.g. btc, usdc)" },
          quoteCurrencyCode: { type: "string", description: "Fiat currency to receive (e.g. usd, brl)" },
          customerId: { type: "string", description: "MoonPay customer id receiving the fiat payout" },
          externalCustomerId: { type: "string", description: "Your internal user id" },
          externalTransactionId: { type: "string", description: "Your internal transaction reference" },
          payoutMethod: { type: "string", description: "Fiat payout method (e.g. sepa_bank_transfer, pix)" },
          bankAccount: { type: "object", description: "Destination bank account detail (country-specific fields)" },
          returnUrl: { type: "string", description: "Browser redirect after hosted flow completes" },
          extraFields: { type: "object", description: "Additional provider-specific fields passed through as-is" },
        },
        required: ["baseCurrencyAmount", "baseCurrencyCode", "quoteCurrencyCode"],
      },
    },
    {
      name: "get_sell_transaction",
      description: "Retrieve a sell transaction (crypto -> fiat) by its MoonPay id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "MoonPay sell transaction id" },
        },
        required: ["id"],
      },
    },
    {
      name: "refund_sell_transaction",
      description: "Request a refund on an off-ramp (sell) transaction. Used when the destination bank rejects payout or the user disputes the trade. Reason codes are MoonPay-defined.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "MoonPay sell transaction id to refund" },
          reason: { type: "string", description: "Reason code or free-text justification for the refund" },
          amount: { type: "number", description: "Optional partial refund amount (in the transaction's base/crypto currency). Omit for full refund." },
        },
        required: ["id"],
      },
    },
    {
      name: "create_customer",
      description: "Create a MoonPay customer (KYC'd end user). Required before creating transactions that must be tied to an identified individual.",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Customer email (used for MoonPay communications + KYC)" },
          firstName: { type: "string", description: "Legal first name" },
          lastName: { type: "string", description: "Legal last name" },
          dateOfBirth: { type: "string", description: "ISO date (YYYY-MM-DD)" },
          externalCustomerId: { type: "string", description: "Your internal user id for correlation" },
          address: {
            type: "object",
            description: "Residential address object",
            properties: {
              country: { type: "string", description: "ISO-3166 alpha-2 country code (e.g. BR, US, MX)" },
              state: { type: "string", description: "State / region code" },
              town: { type: "string", description: "City" },
              postCode: { type: "string", description: "Postal / ZIP code" },
              street: { type: "string", description: "Street address" },
              subStreet: { type: "string", description: "Unit / apt / complement" },
            },
          },
        },
        required: ["email"],
      },
    },
    {
      name: "get_customer",
      description: "Retrieve a MoonPay customer by id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "MoonPay customer id" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_customer_kyc_status",
      description: "Fetch KYC verification status (and any pending document requirements) for a MoonPay customer. Use to gate flows that require an approved customer before transacting.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "MoonPay customer id" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_customer_transactions",
      description: "List all transactions (buy + sell) tied to a single MoonPay customer. Convenience wrapper for unified history / reconciliation by user.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "MoonPay customer id" },
          status: { type: "string", description: "Optional status filter (e.g. pending, completed, failed)" },
          limit: { type: "number", description: "Max results to return" },
        },
        required: ["customerId"],
      },
    },
    {
      name: "get_transaction_receipt",
      description: "Fetch a tax-/audit-grade receipt for a completed buy or sell transaction. Useful for end-user reporting or accounting export.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "MoonPay transaction id (buy or sell)" },
          type: { type: "string", enum: ["buy", "sell"], description: "Whether the id refers to a buy or sell transaction. Defaults to buy." },
        },
        required: ["id"],
      },
    },
    {
      name: "list_currencies",
      description: "List supported currencies (fiat + crypto). Essential for agents: use this to discover currency codes dynamically rather than hard-coding, and to check which assets/fiats are currently enabled.",
      inputSchema: {
        type: "object",
        properties: {
          show: { type: "string", enum: ["enabled", "all"], description: "Filter to enabled currencies only, or return everything. Defaults to enabled on the API side." },
        },
      },
    },
    {
      name: "get_currency",
      description: "Retrieve metadata for a single currency (fiat or crypto) by its MoonPay code. Returns network, decimals, min/max amounts, fee structure.",
      inputSchema: {
        type: "object",
        properties: {
          currencyCode: { type: "string", description: "Currency code (e.g. btc, usdc, brl, usd)" },
        },
        required: ["currencyCode"],
      },
    },
    {
      name: "list_countries",
      description: "List countries supported by MoonPay along with which flows (buy / sell / NFT) are allowed per geography. Use this to gate UI before initiating a quote.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "list_payment_methods",
      description: "List payment methods supported for a given fiat currency / country combination (e.g. credit_debit_card, sepa_bank_transfer, pix). Use to populate checkout selectors dynamically.",
      inputSchema: {
        type: "object",
        properties: {
          currencyCode: { type: "string", description: "Fiat currency code (e.g. brl, usd, eur)" },
          country: { type: "string", description: "ISO-3166 alpha-2 country code (e.g. BR, US, MX)" },
        },
      },
    },
    {
      name: "get_user_country",
      description: "Resolve the caller's (or a given IP's) country via MoonPay's IP-address geolocation endpoint. Returns ISO alpha-2 + alpha-3 country, plus state for US. Compliance helper to gate flows by jurisdiction before quoting or creating a transaction.",
      inputSchema: {
        type: "object",
        properties: {
          ipAddress: { type: "string", description: "Optional IP to check. If omitted, MoonPay resolves from the request origin." },
        },
      },
    },
    {
      name: "sign_buy_url",
      description: "Build and HMAC-SHA256 sign a MoonPay buy widget URL (buy.moonpay.com). Returns a ready-to-redirect URL with the merchant's apiKey + signature appended. Requires MOONPAY_PUBLISHABLE_KEY and MOONPAY_SECRET_KEY in the environment. Use when embedding the hosted onramp in your own UI.",
      inputSchema: {
        type: "object",
        properties: {
          currencyCode: { type: "string", description: "Crypto currency code to buy (e.g. btc, usdc)" },
          baseCurrencyCode: { type: "string", description: "Fiat currency code (e.g. usd, brl)" },
          baseCurrencyAmount: { type: "number", description: "Pre-fill fiat amount" },
          quoteCurrencyAmount: { type: "number", description: "Pre-fill crypto amount" },
          walletAddress: { type: "string", description: "Pre-fill destination wallet address" },
          walletAddressTag: { type: "string", description: "Destination tag / memo for chains that require it" },
          email: { type: "string", description: "Pre-fill end-user email" },
          externalCustomerId: { type: "string", description: "Your internal user id, propagated to MoonPay" },
          externalTransactionId: { type: "string", description: "Your internal transaction reference" },
          redirectURL: { type: "string", description: "Where to redirect after the hosted flow completes" },
          paymentMethod: { type: "string", description: "Pre-select payment method (e.g. credit_debit_card, pix)" },
          theme: { type: "string", description: "Widget theme (light / dark)" },
          colorCode: { type: "string", description: "Hex accent color for the widget" },
          language: { type: "string", description: "BCP-47 language tag (e.g. en, pt-BR)" },
          showWalletAddressForm: { type: "boolean", description: "If true, force the widget to show the wallet form even when prefilled" },
          extraParams: { type: "object", description: "Additional widget parameters passed through as-is (object values are JSON-stringified)" },
        },
        required: ["currencyCode"],
      },
    },
    {
      name: "sign_sell_url",
      description: "Build and HMAC-SHA256 sign a MoonPay sell widget URL (sell.moonpay.com). Returns a ready-to-redirect URL with apiKey + signature appended. Requires MOONPAY_PUBLISHABLE_KEY and MOONPAY_SECRET_KEY in the environment.",
      inputSchema: {
        type: "object",
        properties: {
          baseCurrencyCode: { type: "string", description: "Crypto currency code being sold (e.g. btc, usdc)" },
          quoteCurrencyCode: { type: "string", description: "Fiat currency to receive (e.g. usd, brl)" },
          baseCurrencyAmount: { type: "number", description: "Pre-fill crypto amount" },
          quoteCurrencyAmount: { type: "number", description: "Pre-fill fiat amount" },
          refundWalletAddress: { type: "string", description: "Wallet to refund crypto to if the sell fails" },
          email: { type: "string", description: "Pre-fill end-user email" },
          externalCustomerId: { type: "string", description: "Your internal user id" },
          externalTransactionId: { type: "string", description: "Your internal transaction reference" },
          redirectURL: { type: "string", description: "Where to redirect after the hosted flow completes" },
          payoutMethod: { type: "string", description: "Pre-select payout method (e.g. sepa_bank_transfer, pix)" },
          theme: { type: "string", description: "Widget theme (light / dark)" },
          colorCode: { type: "string", description: "Hex accent color for the widget" },
          language: { type: "string", description: "BCP-47 language tag (e.g. en, pt-BR)" },
          extraParams: { type: "object", description: "Additional widget parameters passed through as-is (object values are JSON-stringified)" },
        },
        required: ["baseCurrencyCode"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "get_buy_quote": {
        const code = encodeURIComponent(String(a.currencyCode ?? ""));
        const query = qs({
          baseCurrencyCode: a.baseCurrencyCode,
          baseCurrencyAmount: a.baseCurrencyAmount,
          quoteCurrencyAmount: a.quoteCurrencyAmount,
          paymentMethod: a.paymentMethod,
          areFeesIncluded: a.areFeesIncluded,
        });
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v3/currencies/${code}/buy_quote${query}`), null, 2) }] };
      }
      case "create_buy_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("POST", "/v3/transactions", a), null, 2) }] };
      case "get_buy_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v1/transactions/${encodeURIComponent(String(a.id ?? ""))}`), null, 2) }] };
      case "list_buy_transactions": {
        const query = qs({
          customerId: a.customerId,
          externalCustomerId: a.externalCustomerId,
          status: a.status,
          limit: a.limit,
        });
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v1/transactions${query}`), null, 2) }] };
      }
      case "get_sell_quote": {
        const code = encodeURIComponent(String(a.currencyCode ?? ""));
        const query = qs({
          quoteCurrencyCode: a.quoteCurrencyCode,
          baseCurrencyAmount: a.baseCurrencyAmount,
          quoteCurrencyAmount: a.quoteCurrencyAmount,
          payoutMethod: a.payoutMethod,
        });
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v3/currencies/${code}/sell_quote${query}`), null, 2) }] };
      }
      case "create_sell_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("POST", "/v3/sell_transactions", a), null, 2) }] };
      case "get_sell_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v3/sell_transactions/${encodeURIComponent(String(a.id ?? ""))}`), null, 2) }] };
      case "refund_sell_transaction": {
        const id = encodeURIComponent(String(a.id ?? ""));
        const body: Record<string, unknown> = {};
        if (a.reason !== undefined) body.reason = a.reason;
        if (a.amount !== undefined) body.amount = a.amount;
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("POST", `/v3/sell_transactions/${id}/refund`, body), null, 2) }] };
      }
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("POST", "/v1/customers", a), null, 2) }] };
      case "get_customer":
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v1/customers/${encodeURIComponent(String(a.id ?? ""))}`), null, 2) }] };
      case "get_customer_kyc_status": {
        const id = encodeURIComponent(String(a.id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v1/customers/${id}/kyc_status`), null, 2) }] };
      }
      case "list_customer_transactions": {
        const id = encodeURIComponent(String(a.customerId ?? ""));
        const query = qs({ status: a.status, limit: a.limit });
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v1/customers/${id}/transactions${query}`), null, 2) }] };
      }
      case "get_transaction_receipt": {
        const id = encodeURIComponent(String(a.id ?? ""));
        const type = String(a.type ?? "buy");
        const path = type === "sell" ? `/v3/sell_transactions/${id}/receipt` : `/v1/transactions/${id}/receipt`;
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", path), null, 2) }] };
      }
      case "list_currencies": {
        const query = qs({ show: a.show });
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v3/currencies${query}`), null, 2) }] };
      }
      case "get_currency": {
        const code = encodeURIComponent(String(a.currencyCode ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v3/currencies/${code}`), null, 2) }] };
      }
      case "list_countries":
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v3/countries`), null, 2) }] };
      case "list_payment_methods": {
        const query = qs({ currencyCode: a.currencyCode, country: a.country });
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v3/payment_methods${query}`), null, 2) }] };
      }
      case "get_user_country": {
        const query = qs({ ipAddress: a.ipAddress });
        return { content: [{ type: "text", text: JSON.stringify(await moonpayRequest("GET", `/v4/ip_address${query}`), null, 2) }] };
      }
      case "sign_buy_url": {
        const { extraParams, ...rest } = a as { extraParams?: Record<string, unknown> } & Record<string, unknown>;
        const url = signWidgetUrl(BUY_WIDGET_URL, { ...rest, ...(extraParams ?? {}) });
        return { content: [{ type: "text", text: JSON.stringify({ url }, null, 2) }] };
      }
      case "sign_sell_url": {
        const { extraParams, ...rest } = a as { extraParams?: Record<string, unknown> } & Record<string, unknown>;
        const url = signWidgetUrl(SELL_WIDGET_URL, { ...rest, ...(extraParams ?? {}) });
        return { content: [{ type: "text", text: JSON.stringify({ url }, null, 2) }] };
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
        const s = new Server({ name: "mcp-moonpay", version: "0.2.1" }, { capabilities: { tools: {} } });
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
