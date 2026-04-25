#!/usr/bin/env node

/**
 * MCP Server for NuPay — Nubank's merchant checkout rail.
 *
 * NuPay is Nubank's answer to PayPal/Shop Pay for Brazil: a wallet-backed
 * checkout that leverages Nubank's 100M+ BR customer distribution. Agents
 * create a payment, the shopper confirms inside the Nubank app (push +
 * biometric) or via Pix, and funds settle to the merchant. Pre-authorized
 * flows (CIBA/OTP) unlock recurrence and true one-click for repeat buyers.
 *
 * Tools (22):
 *   create_payment           — POST   /v1/checkouts/payments
 *   get_payment              — GET    /v1/checkouts/payments/{id}
 *   get_payment_status       — GET    /v1/checkouts/payments/{id}/status
 *   list_payments_by_date    — GET    /v1/checkouts/payments?startDate&endDate
 *   cancel_payment           — POST   /v1/checkouts/payments/{id}/cancel
 *   create_refund            — POST   /v1/checkouts/payments/{id}/refunds
 *   get_refund               — GET    /v1/checkouts/payments/{id}/refunds/{refundId}
 *   list_refunds             — GET    /v1/checkouts/payments/{id}/refunds
 *   create_recipient         — POST   /v1/recipients
 *   get_recipient            — GET    /v1/recipients/{referenceId}
 *   update_recipient         — PUT    /v1/recipients/{referenceId}
 *   delete_recipient         — DELETE /v1/recipients/{referenceId}
 *   list_recipients          — GET    /v1/recipients
 *   list_settlements         — GET    /v1/settlements?startDate&endDate
 *   get_settlement           — GET    /v1/settlements/{settlementId}
 *   query_payment_conditions — POST   /v2/checkouts/payment-conditions
 *   create_preauth_payment   — POST   /v1/checkouts/payments (Bearer-auth variant for recurrence)
 *   backchannel_start        — POST   /v1/backchannel/authentication  (CIBA/OTP kickoff)
 *   backchannel_complete     — POST   /v1/backchannel/authentication/complete (OTP validation)
 *   backchannel_resend_otp   — POST   /v1/backchannel/authentication/otp/resend
 *   exchange_token           — POST   /v1/token  (authorization_code or refresh_token)
 *   revoke_token             — POST   /v1/token/revoke (invalidate access/refresh token)
 *
 * Authentication
 *   Two flows:
 *
 *   1. Standard merchant API (payments, refunds, recipients, payment-conditions):
 *      X-Merchant-Key + X-Merchant-Token headers. No token exchange required —
 *      credentials are set statically per merchant.
 *
 *   2. Pre-authorized / recurrence (OAuth2 + CIBA/OTP):
 *      Exchange at POST /v1/token with JWT client_assertion for a short-lived
 *      access_token (5 min). Pass it via Authorization: Bearer. Use
 *      refresh_token for long-lived recurrence. JWT signing is the caller's
 *      responsibility — exchange_token expects an already-signed assertion.
 *
 * Environment
 *   NUPAY_MERCHANT_KEY    X-Merchant-Key (required for standard flow)
 *   NUPAY_MERCHANT_TOKEN  X-Merchant-Token (required for standard flow)
 *   NUPAY_CLIENT_ID       OAuth client_id (optional; pre-auth only)
 *   NUPAY_CLIENT_SECRET   OAuth client_secret (optional; pre-auth only)
 *   NUPAY_ENV             sandbox | production (default sandbox)
 *
 * Base URLs (per OpenAPI at docs.nupaybusiness.com.br):
 *   sandbox    API:  https://sandbox-api.spinpay.com.br
 *              Auth: https://sandbox-authentication.spinpay.com.br/api
 *   production API:  https://api.spinpay.com.br
 *              Auth: https://authentication.spinpay.com.br/api
 *
 * Docs: https://docs.nupaybusiness.com.br
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const MERCHANT_KEY = process.env.NUPAY_MERCHANT_KEY || "";
const MERCHANT_TOKEN = process.env.NUPAY_MERCHANT_TOKEN || "";
const ENV = (process.env.NUPAY_ENV || "sandbox").toLowerCase();

const API_BASE = ENV === "production"
  ? "https://api.spinpay.com.br"
  : "https://sandbox-api.spinpay.com.br";

const AUTH_BASE = ENV === "production"
  ? "https://authentication.spinpay.com.br/api"
  : "https://sandbox-authentication.spinpay.com.br/api";

type Json = Record<string, unknown>;

async function nupayRequest(
  method: string,
  path: string,
  body?: unknown,
  opts: { bearer?: string; auth?: boolean } = {}
): Promise<unknown> {
  const base = opts.auth ? AUTH_BASE : API_BASE;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (opts.bearer) {
    headers["Authorization"] = `Bearer ${opts.bearer}`;
  } else {
    headers["X-Merchant-Key"] = MERCHANT_KEY;
    headers["X-Merchant-Token"] = MERCHANT_TOKEN;
  }
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`NuPay API ${res.status}: ${text}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

async function nupayFormRequest(
  path: string,
  form: Record<string, string>
): Promise<unknown> {
  const body = new URLSearchParams(form).toString();
  const res = await fetch(`${AUTH_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`NuPay Auth ${res.status}: ${text}`);
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

const server = new Server(
  { name: "mcp-nupay", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_payment",
      description: "Create a NuPay checkout payment. Returns pspReferenceId + the redirect/QR payload the shopper needs to complete the charge (NuPay wallet push or Pix). Use merchant-key auth.",
      inputSchema: {
        type: "object",
        properties: {
          merchantOrderReference: { type: "string", description: "Merchant-side order id (unique per merchant)" },
          referenceId: { type: "string", description: "E-commerce payment reference id (unique per merchant)" },
          amount: {
            type: "object",
            description: "Payment amount object",
            properties: {
              value: { type: "number", description: "Amount in cents (BRL)" },
              currency: { type: "string", description: "ISO-4217, e.g. BRL" },
            },
            required: ["value", "currency"],
          },
          shopper: {
            type: "object",
            description: "Customer identity",
            properties: {
              name: { type: "string" },
              document: { type: "string", description: "CPF digits only" },
              documentType: { type: "string", enum: ["CPF", "CNPJ"] },
              email: { type: "string" },
              phone: { type: "string" },
              ip: { type: "string", description: "Shopper IP for fraud scoring" },
              locale: { type: "string", description: "e.g. pt-BR" },
            },
            required: ["name", "document", "documentType", "email"],
          },
          items: {
            type: "array",
            description: "Line items purchased",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                value: { type: "number", description: "Unit price in cents" },
                quantity: { type: "number" },
              },
              required: ["description", "value", "quantity"],
            },
          },
          paymentMethod: {
            type: "object",
            description: "Method selection",
            properties: {
              type: { type: "string", description: "e.g. NUPAY, PIX" },
              authorization: { type: "string", description: "Authorization mode for NuPay (e.g. CIBA, OTP, REDIRECT)" },
            },
            required: ["type"],
          },
          installments: { type: "number", description: "Installment count (pre-authorized only)" },
          paymentFlow: {
            type: "object",
            description: "Return / cancel URLs for redirect flows",
            properties: {
              returnUrl: { type: "string" },
              cancelUrl: { type: "string" },
            },
          },
          callbackUrl: { type: "string", description: "HTTPS webhook URL for status notifications" },
          delayToAutoCancel: { type: "number", description: "Minutes before auto-cancel. Default 30." },
          merchantName: { type: "string" },
          storeName: { type: "string" },
          shipping: { type: "object", description: "Shipping address + method" },
          billingAddress: { type: "object", description: "Billing address" },
          recipients: { type: "array", description: "Up to 10 final beneficiaries (regulatory split)" },
          referenceDate: { type: "string", description: "ISO-8601 timestamp" },
        },
        required: ["merchantOrderReference", "referenceId", "amount", "shopper", "items", "paymentMethod"],
      },
    },
    {
      name: "get_payment",
      description: "Retrieve full payment details (amount, shopper, items, current status, timestamps) by pspReferenceId. Use this for richer detail than get_payment_status.",
      inputSchema: {
        type: "object",
        properties: {
          pspReferenceId: { type: "string", description: "NuPay-assigned payment id" },
        },
        required: ["pspReferenceId"],
      },
    },
    {
      name: "get_payment_status",
      description: "Retrieve a payment's status by pspReferenceId.",
      inputSchema: {
        type: "object",
        properties: {
          pspReferenceId: { type: "string", description: "NuPay-assigned payment id" },
        },
        required: ["pspReferenceId"],
      },
    },
    {
      name: "list_payments_by_date",
      description: "List payments created within a date range. Supports cursor pagination via limit + offset. Useful for reconciliation and reporting.",
      inputSchema: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "ISO-8601 start (inclusive)" },
          endDate: { type: "string", description: "ISO-8601 end (inclusive)" },
          status: { type: "string", description: "Optional filter (e.g. AUTHORIZED, SETTLED, CANCELED, REFUNDED)" },
          limit: { type: "number", description: "Page size (default 50)" },
          offset: { type: "number", description: "Page offset" },
        },
        required: ["startDate", "endDate"],
      },
    },
    {
      name: "cancel_payment",
      description: "Cancel a payment that has not yet been captured/settled.",
      inputSchema: {
        type: "object",
        properties: {
          pspReferenceId: { type: "string", description: "NuPay-assigned payment id" },
        },
        required: ["pspReferenceId"],
      },
    },
    {
      name: "create_refund",
      description: "Refund a settled payment (full or partial). Idempotent via transactionRefundId.",
      inputSchema: {
        type: "object",
        properties: {
          pspReferenceId: { type: "string", description: "NuPay-assigned payment id" },
          transactionRefundId: { type: "string", description: "Merchant-side unique refund id" },
          amount: {
            type: "object",
            description: "Refund value + currency",
            properties: {
              value: { type: "number", description: "Amount in cents" },
              currency: { type: "string", description: "e.g. BRL" },
            },
            required: ["value", "currency"],
          },
          notes: { type: "string", description: "Free-text reason" },
        },
        required: ["pspReferenceId", "transactionRefundId", "amount"],
      },
    },
    {
      name: "get_refund",
      description: "Retrieve refund status by pspReferenceId + refundId.",
      inputSchema: {
        type: "object",
        properties: {
          pspReferenceId: { type: "string" },
          refundId: { type: "string", description: "NuPay-assigned refund id" },
        },
        required: ["pspReferenceId", "refundId"],
      },
    },
    {
      name: "list_refunds",
      description: "List all refunds issued against a given payment.",
      inputSchema: {
        type: "object",
        properties: {
          pspReferenceId: { type: "string", description: "NuPay-assigned payment id" },
        },
        required: ["pspReferenceId"],
      },
    },
    {
      name: "create_recipient",
      description: "Register a final beneficiary (required for regulatory split payments). Up to 10 recipients can later be attached to a payment.",
      inputSchema: {
        type: "object",
        properties: {
          referenceId: { type: "string", description: "Merchant-side stable beneficiary id (1-50 chars, alphanumeric plus . - _)" },
          country: { type: "string", description: "ISO 3166-1 alpha-2 (BR, MX, CO, US, HK, KY, PA, CH, Other)" },
          name: { type: "string", description: "Business or full name" },
          document: { type: "string", description: "11-digit CPF, 14-digit CNPJ, or max 50 chars for Other" },
          documentType: { type: "string", enum: ["CPF", "CNPJ", "Other"] },
        },
        required: ["referenceId", "country", "name", "document", "documentType"],
      },
    },
    {
      name: "get_recipient",
      description: "Retrieve a registered recipient by referenceId.",
      inputSchema: {
        type: "object",
        properties: {
          referenceId: { type: "string" },
        },
        required: ["referenceId"],
      },
    },
    {
      name: "update_recipient",
      description: "Update a registered final beneficiary (name, document, country, type). referenceId is the path key and cannot be changed.",
      inputSchema: {
        type: "object",
        properties: {
          referenceId: { type: "string", description: "Existing recipient referenceId" },
          country: { type: "string", description: "ISO 3166-1 alpha-2" },
          name: { type: "string" },
          document: { type: "string" },
          documentType: { type: "string", enum: ["CPF", "CNPJ", "Other"] },
        },
        required: ["referenceId"],
      },
    },
    {
      name: "delete_recipient",
      description: "Remove a registered recipient. Will fail if the recipient is currently attached to in-flight payments.",
      inputSchema: {
        type: "object",
        properties: {
          referenceId: { type: "string", description: "Recipient referenceId to delete" },
        },
        required: ["referenceId"],
      },
    },
    {
      name: "list_recipients",
      description: "List registered recipients (final beneficiaries) for the merchant. Supports pagination.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Page size (default 50)" },
          offset: { type: "number", description: "Page offset" },
        },
      },
    },
    {
      name: "list_settlements",
      description: "List settlement reports (payouts to the merchant bank account) within a date range. Use for reconciliation.",
      inputSchema: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "ISO-8601 start (inclusive)" },
          endDate: { type: "string", description: "ISO-8601 end (inclusive)" },
          limit: { type: "number" },
          offset: { type: "number" },
        },
        required: ["startDate", "endDate"],
      },
    },
    {
      name: "get_settlement",
      description: "Retrieve a single settlement (payout batch) including the list of underlying transactions.",
      inputSchema: {
        type: "object",
        properties: {
          settlementId: { type: "string", description: "NuPay-assigned settlement id" },
        },
        required: ["settlementId"],
      },
    },
    {
      name: "query_payment_conditions",
      description: "Query available installment/payment conditions for a given amount and (optionally) shopper CPF. Use before rendering checkout so the agent can pick the best offer.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Purchase value in cents" },
          document: { type: "string", description: "Shopper CPF (required outside pre-authorized flow)" },
          paymentMethods: { type: "array", description: "Optional — scope conditions to specific methods" },
        },
        required: ["amount"],
      },
    },
    {
      name: "create_preauth_payment",
      description: "Create a NuPay payment using a pre-authorized Bearer access_token (pre-auth / recurrence flow). Same body as create_payment, but auth is Bearer instead of merchant-key. Use after exchange_token.",
      inputSchema: {
        type: "object",
        properties: {
          access_token: { type: "string", description: "Bearer access_token from exchange_token" },
          payment: { type: "object", description: "Same body as create_payment" },
        },
        required: ["access_token", "payment"],
      },
    },
    {
      name: "backchannel_start",
      description: "Start a CIBA / OTP pre-authorization for a shopper. Sends a push to Nubank app (CIBA) or triggers an OTP SMS. Returns an auth_req_id/ticket to complete later.",
      inputSchema: {
        type: "object",
        properties: {
          parameters: {
            type: "string",
            description: "Query-string-encoded params: login_hint (CPF), client_assertion_type, client_assertion (signed JWT), client_notification_token, scope (e.g. 'openid charge'), auth_method ('otp' or omit for CIBA)",
          },
        },
        required: ["parameters"],
      },
    },
    {
      name: "backchannel_complete",
      description: "Complete a CIBA/OTP flow by submitting the OTP the shopper received. Returns the access_token once validated.",
      inputSchema: {
        type: "object",
        properties: {
          parameters: { type: "string", description: "Query-string with login_hint, client_assertion_type, client_assertion" },
          ticket: { type: "string", description: "Authorization ticket from backchannel_start" },
          otp: { type: "string", description: "One-time password provided by the shopper" },
        },
        required: ["parameters", "ticket", "otp"],
      },
    },
    {
      name: "backchannel_resend_otp",
      description: "Resend the OTP to the shopper for an in-flight authorization ticket.",
      inputSchema: {
        type: "object",
        properties: {
          parameters: { type: "string", description: "Query-string with login_hint, client_assertion_type, client_assertion" },
          ticket: { type: "string", description: "Authorization ticket from backchannel_start" },
        },
        required: ["parameters", "ticket"],
      },
    },
    {
      name: "exchange_token",
      description: "Exchange an authorization_code or refresh_token at POST /v1/token. Expects an already-signed JWT client_assertion. Returns access_token (5 min) + refresh_token for recurrence. Access tokens are scoped (openid, charge, refund, payment_conditions).",
      inputSchema: {
        type: "object",
        properties: {
          grant_type: { type: "string", enum: ["authorization_code", "refresh_token"] },
          client_assertion: { type: "string", description: "Signed JWT assertion" },
          client_assertion_type: {
            type: "string",
            description: "Always 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'",
          },
          code: { type: "string", description: "Authorization code (when grant_type=authorization_code)" },
          code_verifier: { type: "string", description: "PKCE verifier (when grant_type=authorization_code)" },
          redirect_uri: { type: "string", description: "Redirect URI used at /v1/authorize (when grant_type=authorization_code)" },
          refresh_token: { type: "string", description: "Refresh token (when grant_type=refresh_token)" },
          scope: { type: "string", description: "Space-separated scopes (openid charge refund payment_conditions)" },
        },
        required: ["grant_type", "client_assertion", "client_assertion_type"],
      },
    },
    {
      name: "revoke_token",
      description: "Revoke an issued access_token or refresh_token at POST /v1/token/revoke. Use to terminate a recurrence mandate or after card-token deletion. Form-encoded; expects a signed JWT client_assertion.",
      inputSchema: {
        type: "object",
        properties: {
          token: { type: "string", description: "The access_token or refresh_token to revoke" },
          token_type_hint: { type: "string", enum: ["access_token", "refresh_token"], description: "Optional hint" },
          client_assertion: { type: "string", description: "Signed JWT assertion" },
          client_assertion_type: {
            type: "string",
            description: "Always 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'",
          },
        },
        required: ["token", "client_assertion", "client_assertion_type"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = (rawArgs ?? {}) as Json;

  const ok = (data: unknown) => ({
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  });

  try {
    switch (name) {
      case "create_payment":
        return ok(await nupayRequest("POST", "/v1/checkouts/payments", args));

      case "get_payment": {
        const id = String(args.pspReferenceId);
        return ok(await nupayRequest("GET", `/v1/checkouts/payments/${encodeURIComponent(id)}`));
      }

      case "get_payment_status": {
        const id = String(args.pspReferenceId);
        return ok(await nupayRequest("GET", `/v1/checkouts/payments/${encodeURIComponent(id)}/status`));
      }

      case "list_payments_by_date": {
        const qs = buildQuery({
          startDate: args.startDate,
          endDate: args.endDate,
          status: args.status,
          limit: args.limit,
          offset: args.offset,
        });
        return ok(await nupayRequest("GET", `/v1/checkouts/payments${qs}`));
      }

      case "cancel_payment": {
        const id = String(args.pspReferenceId);
        return ok(await nupayRequest("POST", `/v1/checkouts/payments/${encodeURIComponent(id)}/cancel`, {}));
      }

      case "create_refund": {
        const id = String(args.pspReferenceId);
        const body: Json = {
          transactionRefundId: args.transactionRefundId,
          amount: args.amount,
        };
        if (args.notes !== undefined) body.notes = args.notes;
        return ok(await nupayRequest("POST", `/v1/checkouts/payments/${encodeURIComponent(id)}/refunds`, body));
      }

      case "get_refund": {
        const id = String(args.pspReferenceId);
        const rid = String(args.refundId);
        return ok(await nupayRequest("GET", `/v1/checkouts/payments/${encodeURIComponent(id)}/refunds/${encodeURIComponent(rid)}`));
      }

      case "list_refunds": {
        const id = String(args.pspReferenceId);
        return ok(await nupayRequest("GET", `/v1/checkouts/payments/${encodeURIComponent(id)}/refunds`));
      }

      case "create_recipient":
        return ok(await nupayRequest("POST", "/v1/recipients", args));

      case "get_recipient": {
        const ref = String(args.referenceId);
        return ok(await nupayRequest("GET", `/v1/recipients/${encodeURIComponent(ref)}`));
      }

      case "update_recipient": {
        const ref = String(args.referenceId);
        const body: Json = {};
        for (const k of ["country", "name", "document", "documentType"] as const) {
          if (args[k] !== undefined) body[k] = args[k];
        }
        return ok(await nupayRequest("PUT", `/v1/recipients/${encodeURIComponent(ref)}`, body));
      }

      case "delete_recipient": {
        const ref = String(args.referenceId);
        return ok(await nupayRequest("DELETE", `/v1/recipients/${encodeURIComponent(ref)}`));
      }

      case "list_recipients": {
        const qs = buildQuery({ limit: args.limit, offset: args.offset });
        return ok(await nupayRequest("GET", `/v1/recipients${qs}`));
      }

      case "list_settlements": {
        const qs = buildQuery({
          startDate: args.startDate,
          endDate: args.endDate,
          limit: args.limit,
          offset: args.offset,
        });
        return ok(await nupayRequest("GET", `/v1/settlements${qs}`));
      }

      case "get_settlement": {
        const sid = String(args.settlementId);
        return ok(await nupayRequest("GET", `/v1/settlements/${encodeURIComponent(sid)}`));
      }

      case "query_payment_conditions":
        return ok(await nupayRequest("POST", "/v2/checkouts/payment-conditions", args));

      case "create_preauth_payment": {
        const token = String(args.access_token);
        const payment = args.payment as Json;
        return ok(await nupayRequest("POST", "/v1/checkouts/payments", payment, { bearer: token }));
      }

      case "backchannel_start":
        return ok(await nupayRequest("POST", "/v1/backchannel/authentication", args, { auth: true }));

      case "backchannel_complete":
        return ok(await nupayRequest("POST", "/v1/backchannel/authentication/complete", args, { auth: true }));

      case "backchannel_resend_otp":
        return ok(await nupayRequest("POST", "/v1/backchannel/authentication/otp/resend", args, { auth: true }));

      case "exchange_token": {
        const form: Record<string, string> = {
          grant_type: String(args.grant_type),
          client_assertion: String(args.client_assertion),
          client_assertion_type: String(args.client_assertion_type),
        };
        for (const k of ["code", "code_verifier", "redirect_uri", "refresh_token", "scope"] as const) {
          const v = args[k];
          if (v !== undefined && v !== null) form[k] = String(v);
        }
        return ok(await nupayFormRequest("/v1/token", form));
      }

      case "revoke_token": {
        const form: Record<string, string> = {
          token: String(args.token),
          client_assertion: String(args.client_assertion),
          client_assertion_type: String(args.client_assertion_type),
        };
        if (args.token_type_hint !== undefined && args.token_type_hint !== null) {
          form.token_type_hint = String(args.token_type_hint);
        }
        return ok(await nupayFormRequest("/v1/token/revoke", form));
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
    app.get("/health", (_req: unknown, res: { json: (body: unknown) => unknown }) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: { headers: Record<string, string | string[] | undefined>; body: unknown }, res: { status: (code: number) => { json: (body: unknown) => unknown } }) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req as never, res as never, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-nupay", version: "0.2.1" }, { capabilities: { tools: {} } });
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
