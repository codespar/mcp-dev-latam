#!/usr/bin/env node

/**
 * MCP Server for Access Worldpay — global enterprise payment processor.
 *
 * Worldpay (acquired by Global Payments in January 2026) is one of the
 * largest card acquirers in the world and the default enterprise rail for
 * many EU/UK/US merchants. This server targets the *Access Worldpay* REST
 * surface — the modern HATEOAS-driven API — not the legacy FIS/WPG XML
 * gateway, Disputes Direct, or Worldpay for Platforms.
 *
 * Tools (22):
 *   Verifications
 *     verify_account            POST /verifications/accounts
 *   Payments
 *     authorize_payment         POST /payments/authorizations
 *     capture_payment           POST /payments/settlements  or  /payments/settlements/partials
 *     cancel_payment            POST /payments/cancellations
 *     refund_payment            POST /payments/settlements/refunds/full  or  .../partials
 *     reverse_payment           POST /payments/reversals
 *     get_payment               GET  /payments/events/{eventId}
 *     query_payment             GET  /payments/events?transactionReference=...
 *     list_payment_events       GET  /payments/events?merchant.entity=...
 *   Tokens
 *     create_token              POST /tokens
 *     get_token                 GET  /tokens/{tokenId}
 *     update_token              PUT  /tokens/{tokenId}
 *     delete_token              DELETE /tokens/{tokenId}
 *   3DS Authentication
 *     lookup_3ds                POST /verifications/customers/3ds/deviceDataCollection
 *     authenticate_3ds          POST /verifications/customers/3ds/authentication
 *     challenge_3ds             POST /verifications/customers/3ds/challenge
 *   Disputes
 *     get_dispute               GET  /disputes/{disputeId}
 *     accept_dispute            POST /disputes/{disputeId}/accepts
 *     defend_dispute            POST /disputes/{disputeId}/defences
 *     submit_dispute_evidence   POST /disputes/{disputeId}/evidence
 *   Reports
 *     get_reconciliation_batch  GET  /reports/reconciliations/batches/{batchId}
 *   Fraud
 *     fraud_screen              POST /fraudsight/assessment
 *
 * HATEOAS note
 *   Access Worldpay drives lifecycle actions via HATEOAS action links. The
 *   response from /payments/authorizations contains a link-data blob that
 *   the *real* capture/cancel/refund/reversal URLs embed as a path segment:
 *     POST /payments/settlements/{linkData}
 *     POST /payments/settlements/partials/{linkData}
 *     POST /payments/cancellations/{linkData}
 *     POST /payments/settlements/refunds/full/{linkData}
 *     POST /payments/settlements/refunds/partials/{linkData}
 *     POST /payments/reversals/{linkData}
 *   This server accepts an optional `linkData` argument on lifecycle tools.
 *   When provided it's appended to the path; when omitted, we POST to the
 *   bare resource (works if your onboarding is configured for
 *   transactionReference-addressable settlements). Prefer passing linkData.
 *
 * Authentication
 *   HTTP Basic with username:password (API credentials issued by Worldpay).
 *     Authorization: Basic base64(username:password)
 *   Each API family uses its own media type:
 *     payments       application/vnd.worldpay.payments-v7+json
 *     verifications  application/vnd.worldpay.verifications.accounts-v4+json
 *     tokens         application/vnd.worldpay.tokens-v3.hal+json
 *     fraudsight     application/vnd.worldpay.fraudsight-v1.hal+json
 *     disputes       application/vnd.worldpay.disputes-v1.hal+json
 *
 * Environment
 *   WORLDPAY_USERNAME     API username (Basic Auth)
 *   WORLDPAY_PASSWORD     API password (Basic Auth)
 *   WORLDPAY_ENTITY       Merchant entity identifier; auto-injected as
 *                         merchant.entity into every request body.
 *   WORLDPAY_ENV          sandbox | production. Defaults to sandbox.
 *   WORLDPAY_API_VERSION  Payments Content-Type version. Defaults to v7.
 *
 * Docs: https://docs.worldpay.com/access
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const USERNAME = process.env.WORLDPAY_USERNAME || "";
const PASSWORD = process.env.WORLDPAY_PASSWORD || "";
const ENTITY = process.env.WORLDPAY_ENTITY || "";
const ENV = (process.env.WORLDPAY_ENV || "sandbox").toLowerCase();
const API_VERSION = process.env.WORLDPAY_API_VERSION || "v7";

function baseUrl(): string {
  return ENV === "production"
    ? "https://access.worldpay.com"
    : "https://try.access.worldpay.com";
}

/** Media types per API family. */
const MEDIA_TYPES = {
  payments: `application/vnd.worldpay.payments-${API_VERSION}+json`,
  verifications: "application/vnd.worldpay.verifications.accounts-v4+json",
  tokens: "application/vnd.worldpay.tokens-v3.hal+json",
  fraudsight: "application/vnd.worldpay.fraudsight-v1.hal+json",
  disputes: "application/vnd.worldpay.disputes-v1.hal+json",
  reports: "application/vnd.worldpay.reports-v1.hal+json",
} as const;

type ApiFamily = keyof typeof MEDIA_TYPES;

async function worldpayRequest(
  method: string,
  path: string,
  body?: unknown,
  family: ApiFamily = "payments",
): Promise<unknown> {
  const basic = Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64");
  const mediaType = MEDIA_TYPES[family];
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": mediaType,
      "Accept": mediaType,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Worldpay API ${res.status}: ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : { status: res.status };
}

/** Inject merchant.entity into a payload if the caller did not supply one. */
function withEntity(body: Record<string, unknown> | undefined): Record<string, unknown> {
  const b: Record<string, unknown> = { ...(body ?? {}) };
  if (ENTITY) {
    const existing = (b.merchant as Record<string, unknown> | undefined) ?? {};
    if (!existing.entity) {
      b.merchant = { ...existing, entity: ENTITY };
    }
  }
  return b;
}

/** Append a HATEOAS linkData segment when present. */
function pathWithLink(base: string, linkData?: string): string {
  if (!linkData) return base;
  return `${base}/${encodeURIComponent(linkData)}`;
}

const server = new Server(
  { name: "mcp-worldpay", version: "0.2.0-alpha.2" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "verify_account",
      description: "Run an AVS/CVC account verification on a card without charging it. Returns the verification outcome and a card-on-file or one-time verification record. merchant.entity is injected automatically.",
      inputSchema: {
        type: "object",
        properties: {
          transactionReference: { type: "string", description: "Unique merchant-side reference for this verification" },
          verificationType: { type: "string", enum: ["cardOnFile", "oneTime"], description: "cardOnFile stores the card as a CIT; oneTime verifies without storing" },
          paymentInstrument: {
            type: "object",
            description: "Card data — prefer a token (type=token) over raw PAN (type=card/plain).",
          },
          narrative: {
            type: "object",
            description: "Descriptor shown on the cardholder statement.",
            properties: { line1: { type: "string" } },
          },
        },
        required: ["transactionReference", "verificationType", "paymentInstrument"],
      },
    },
    {
      name: "authorize_payment",
      description: "Authorize a card payment. Returns an outcome plus HATEOAS action links (settle, cancel, refund, reverse). Extract the linkData from those links and pass it to capture_payment / cancel_payment / refund_payment / reverse_payment.",
      inputSchema: {
        type: "object",
        properties: {
          transactionReference: { type: "string", description: "Unique merchant-side reference (idempotency key)" },
          instruction: {
            type: "object",
            description: "The payment instruction: narrative, value {currency, amount}, paymentInstrument, optional debtAddress, etc.",
            properties: {
              narrative: { type: "object", properties: { line1: { type: "string" } } },
              value: {
                type: "object",
                properties: {
                  currency: { type: "string", description: "ISO-4217 (e.g. USD, GBP, EUR, BRL)" },
                  amount: { type: "number", description: "Minor units (e.g. cents)" },
                },
                required: ["currency", "amount"],
              },
              paymentInstrument: { type: "object", description: "Card / token / network-token / APM instrument" },
            },
            required: ["narrative", "value", "paymentInstrument"],
          },
          channel: { type: "string", enum: ["ecom", "moto"], description: "Transaction channel" },
          customer: { type: "object", description: "Optional customer data for 3DS / risk scoring" },
        },
        required: ["transactionReference", "instruction"],
      },
    },
    {
      name: "capture_payment",
      description: "Capture (settle) an authorized payment. Omit amount for a full settlement; pass amount+currency for a partial settlement. Pass linkData from the authorization's action link (_links.payments:settle.href segment) for HATEOAS-correct routing.",
      inputSchema: {
        type: "object",
        properties: {
          linkData: { type: "string", description: "The opaque link-data segment from _links.payments:settle.href (or payments:partialSettle.href) in the authorization response" },
          amount: { type: "number", description: "Partial capture amount in minor units. Omit for full capture." },
          currency: { type: "string", description: "ISO-4217. Required when amount is set." },
          reference: { type: "string", description: "Optional merchant-side reference for the capture" },
        },
      },
    },
    {
      name: "cancel_payment",
      description: "Void an authorization that has not yet been captured. Pass linkData from _links.payments:cancel.href.",
      inputSchema: {
        type: "object",
        properties: {
          linkData: { type: "string", description: "Opaque link-data segment from _links.payments:cancel.href" },
          reference: { type: "string", description: "Optional merchant-side cancel reference" },
        },
      },
    },
    {
      name: "refund_payment",
      description: "Refund a captured payment. Omit amount for a full refund; pass amount+currency for a partial refund. Pass linkData from _links.payments:refund.href or _links.payments:partialRefund.href.",
      inputSchema: {
        type: "object",
        properties: {
          linkData: { type: "string", description: "Opaque link-data segment from the refund action link" },
          amount: { type: "number", description: "Partial refund amount in minor units. Omit for full refund." },
          currency: { type: "string", description: "ISO-4217. Required when amount is set." },
          reference: { type: "string", description: "Optional merchant-side refund reference" },
        },
      },
    },
    {
      name: "reverse_payment",
      description: "Reverse a payment atomically — voids if not yet captured, refunds if already captured. Pass linkData from _links.payments:reverse.href.",
      inputSchema: {
        type: "object",
        properties: {
          linkData: { type: "string", description: "Opaque link-data segment from _links.payments:reverse.href" },
          reference: { type: "string", description: "Optional merchant-side reversal reference" },
        },
      },
    },
    {
      name: "get_payment",
      description: "Retrieve the detail of a payment event by its Worldpay eventId.",
      inputSchema: {
        type: "object",
        properties: {
          eventId: { type: "string", description: "Worldpay event identifier" },
        },
        required: ["eventId"],
      },
    },
    {
      name: "create_token",
      description: "Tokenize a card for reuse (card-on-file). Returns a token you can pass as the paymentInstrument on subsequent authorizations.",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string", description: "Friendly description (e.g. 'Visa ending 4242')" },
          paymentInstrument: {
            type: "object",
            description: "Card details to tokenize (type=card/plain with cardNumber, expiryDate, etc.)",
          },
          namespace: { type: "string", description: "Token namespace; defaults to your entity-level namespace" },
          tokenPaymentInstrument: { type: "object", description: "Alternative: re-tokenize an existing token (network-token conversion)" },
        },
        required: ["paymentInstrument"],
      },
    },
    {
      name: "get_token",
      description: "Retrieve a stored card token's metadata (bin, scheme, last4, cardHolderName, expiryDate, etc.). Does not return the raw PAN.",
      inputSchema: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "The token identifier returned by create_token" },
        },
        required: ["tokenId"],
      },
    },
    {
      name: "update_token",
      description: "Update metadata on a stored card token (e.g. expiryDate after an account-updater refresh, cardHolderName, description).",
      inputSchema: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "The token identifier returned by create_token" },
          description: { type: "string", description: "New friendly description" },
          tokenExpiryDateTime: { type: "string", description: "RFC-3339 expiration for the token itself" },
          paymentInstrument: { type: "object", description: "Updated card fields (cardHolderName, expiryDate, billingAddress, etc.)" },
        },
        required: ["tokenId"],
      },
    },
    {
      name: "delete_token",
      description: "Delete a stored card token.",
      inputSchema: {
        type: "object",
        properties: {
          tokenId: { type: "string", description: "The token identifier returned by create_token" },
        },
        required: ["tokenId"],
      },
    },
    {
      name: "query_payment",
      description: "Look up a payment by the merchant-side transactionReference you assigned on authorize_payment. Returns the matching payment event(s).",
      inputSchema: {
        type: "object",
        properties: {
          transactionReference: { type: "string", description: "The merchant-side reference passed on authorize_payment" },
        },
        required: ["transactionReference"],
      },
    },
    {
      name: "list_payment_events",
      description: "List recent payment events for the configured merchant entity. Useful for transaction reports and reconciliation.",
      inputSchema: {
        type: "object",
        properties: {
          fromDate: { type: "string", description: "ISO-8601 lower bound (inclusive)" },
          toDate: { type: "string", description: "ISO-8601 upper bound (exclusive)" },
          pageSize: { type: "number", description: "Results per page" },
          pageNumber: { type: "number", description: "Page number (1-based)" },
        },
      },
    },
    {
      name: "lookup_3ds",
      description: "Step 1 of 3DS2 — submit device-data-collection (DDC) output to Worldpay to determine whether a challenge is required. Returns either a frictionless result or a challenge lookup reference.",
      inputSchema: {
        type: "object",
        properties: {
          transactionReference: { type: "string", description: "Unique merchant-side reference, typically the same as the eventual authorize_payment call" },
          instruction: {
            type: "object",
            description: "3DS lookup payload — value, paymentInstrument (token or card), and any collected deviceData.",
          },
          channel: { type: "string", enum: ["ecom"], description: "3DS only applies to ecom" },
          deviceData: { type: "object", description: "DDC output (browser fingerprint, collectionReference, etc.)" },
        },
        required: ["transactionReference", "instruction"],
      },
    },
    {
      name: "authenticate_3ds",
      description: "Step 2 of 3DS2 — authenticate the cardholder. Returns either an authenticated payload (frictionless) or a challenge URL the user must complete. Pass the result into authorize_payment.customer.authentication.",
      inputSchema: {
        type: "object",
        properties: {
          transactionReference: { type: "string", description: "Unique merchant-side reference" },
          instruction: { type: "object", description: "Same shape as authorize_payment.instruction (value, paymentInstrument)" },
          authentication: {
            type: "object",
            description: "3DS authentication request — typically { version: '2.2.0', channel: 'browser', challenge: { windowSize, preference, ... } }",
          },
          customer: { type: "object", description: "Customer risk data (email, phone, shippingAddress, account)" },
          channel: { type: "string", enum: ["ecom"] },
        },
        required: ["transactionReference", "instruction", "authentication"],
      },
    },
    {
      name: "challenge_3ds",
      description: "Step 3 of 3DS2 — post the CReq back after the issuer challenge window closes, to retrieve the final authentication outcome.",
      inputSchema: {
        type: "object",
        properties: {
          transactionReference: { type: "string", description: "Unique merchant-side reference" },
          challenge: {
            type: "object",
            description: "Challenge-result payload — typically { reference, transactionId, cres } returned from the issuer after challenge completion.",
          },
        },
        required: ["transactionReference", "challenge"],
      },
    },
    {
      name: "get_dispute",
      description: "Retrieve a dispute's current state, evidence requirements, deadlines, and HATEOAS action links.",
      inputSchema: {
        type: "object",
        properties: {
          disputeId: { type: "string", description: "Worldpay dispute identifier" },
        },
        required: ["disputeId"],
      },
    },
    {
      name: "defend_dispute",
      description: "Open a defence on a dispute — signals intent to defend before submit_dispute_evidence. Some reason codes require an explicit defence before evidence can be uploaded.",
      inputSchema: {
        type: "object",
        properties: {
          disputeId: { type: "string", description: "Worldpay dispute identifier" },
          reference: { type: "string", description: "Optional internal reference" },
        },
        required: ["disputeId"],
      },
    },
    {
      name: "get_reconciliation_batch",
      description: "Retrieve a reconciliation batch (daily settlement file equivalent) — lists all settled transactions, fees, and net amount for a given batch.",
      inputSchema: {
        type: "object",
        properties: {
          batchId: { type: "string", description: "Reconciliation batch identifier" },
        },
        required: ["batchId"],
      },
    },
    {
      name: "accept_dispute",
      description: "Accept a dispute (forfeit the chargeback). Use when you do not plan to defend.",
      inputSchema: {
        type: "object",
        properties: {
          disputeId: { type: "string", description: "Worldpay dispute identifier" },
          reference: { type: "string", description: "Optional internal reference for the acceptance" },
        },
        required: ["disputeId"],
      },
    },
    {
      name: "submit_dispute_evidence",
      description: "Submit evidence to defend a dispute. Pass the evidence payload (document references, rebuttal text, etc.) in the body.",
      inputSchema: {
        type: "object",
        properties: {
          disputeId: { type: "string", description: "Worldpay dispute identifier" },
          evidence: {
            type: "object",
            description: "Evidence payload — structure is dispute-reason-specific. Typically { rebuttalNarrative, supportingDocuments: [{documentId, ...}] }.",
          },
        },
        required: ["disputeId", "evidence"],
      },
    },
    {
      name: "fraud_screen",
      description: "Run a standalone FraudSight assessment on a payment method (no authorization). Returns a score and recommendation.",
      inputSchema: {
        type: "object",
        properties: {
          transactionReference: { type: "string", description: "Unique merchant-side reference" },
          instruction: {
            type: "object",
            description: "Same shape as authorize_payment.instruction (value, paymentInstrument, etc.) plus risk-signal fields (customer, shippingAddress, etc.)",
          },
          channel: { type: "string", enum: ["ecom", "moto"] },
          customer: { type: "object", description: "Customer risk-signal bundle (authentication, email, phone, ip, device)" },
        },
        required: ["transactionReference", "instruction"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "verify_account": {
        const body = withEntity(a);
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("POST", "/verifications/accounts", body, "verifications"), null, 2) }],
        };
      }

      case "authorize_payment": {
        const body = withEntity(a);
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("POST", "/payments/authorizations", body, "payments"), null, 2) }],
        };
      }

      case "capture_payment": {
        const linkData = a.linkData as string | undefined;
        const amount = a.amount as number | undefined;
        const currency = a.currency as string | undefined;
        const reference = a.reference as string | undefined;
        const isPartial = amount !== undefined;
        const base = isPartial ? "/payments/settlements/partials" : "/payments/settlements";
        const path = pathWithLink(base, linkData);
        const body: Record<string, unknown> | undefined = isPartial
          ? { value: { currency, amount }, ...(reference ? { reference } : {}) }
          : reference ? { reference } : undefined;
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("POST", path, body, "payments"), null, 2) }],
        };
      }

      case "cancel_payment": {
        const linkData = a.linkData as string | undefined;
        const reference = a.reference as string | undefined;
        const path = pathWithLink("/payments/cancellations", linkData);
        const body = reference ? { reference } : undefined;
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("POST", path, body, "payments"), null, 2) }],
        };
      }

      case "refund_payment": {
        const linkData = a.linkData as string | undefined;
        const amount = a.amount as number | undefined;
        const currency = a.currency as string | undefined;
        const reference = a.reference as string | undefined;
        const isPartial = amount !== undefined;
        const base = isPartial
          ? "/payments/settlements/refunds/partials"
          : "/payments/settlements/refunds/full";
        const path = pathWithLink(base, linkData);
        const body: Record<string, unknown> | undefined = isPartial
          ? { value: { currency, amount }, ...(reference ? { reference } : {}) }
          : reference ? { reference } : undefined;
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("POST", path, body, "payments"), null, 2) }],
        };
      }

      case "reverse_payment": {
        const linkData = a.linkData as string | undefined;
        const reference = a.reference as string | undefined;
        const path = pathWithLink("/payments/reversals", linkData);
        const body = reference ? { reference } : undefined;
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("POST", path, body, "payments"), null, 2) }],
        };
      }

      case "get_payment": {
        const eventId = encodeURIComponent(String(a.eventId ?? ""));
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("GET", `/payments/events/${eventId}`, undefined, "payments"), null, 2) }],
        };
      }

      case "create_token": {
        const body = withEntity(a);
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("POST", "/tokens", body, "tokens"), null, 2) }],
        };
      }

      case "delete_token": {
        const tokenId = encodeURIComponent(String(a.tokenId ?? ""));
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("DELETE", `/tokens/${tokenId}`, undefined, "tokens"), null, 2) }],
        };
      }

      case "get_token": {
        const tokenId = encodeURIComponent(String(a.tokenId ?? ""));
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("GET", `/tokens/${tokenId}`, undefined, "tokens"), null, 2) }],
        };
      }

      case "update_token": {
        const tokenId = encodeURIComponent(String(a.tokenId ?? ""));
        const { tokenId: _ignored, ...rest } = a;
        void _ignored;
        const body = withEntity(rest as Record<string, unknown>);
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("PUT", `/tokens/${tokenId}`, body, "tokens"), null, 2) }],
        };
      }

      case "query_payment": {
        const ref = encodeURIComponent(String(a.transactionReference ?? ""));
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("GET", `/payments/events?transactionReference=${ref}`, undefined, "payments"), null, 2) }],
        };
      }

      case "list_payment_events": {
        const params = new URLSearchParams();
        if (ENTITY) params.set("merchant.entity", ENTITY);
        if (a.fromDate) params.set("fromDate", String(a.fromDate));
        if (a.toDate) params.set("toDate", String(a.toDate));
        if (a.pageSize !== undefined) params.set("pageSize", String(a.pageSize));
        if (a.pageNumber !== undefined) params.set("pageNumber", String(a.pageNumber));
        const qs = params.toString();
        const path = qs ? `/payments/events?${qs}` : `/payments/events`;
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("GET", path, undefined, "payments"), null, 2) }],
        };
      }

      case "lookup_3ds": {
        const body = withEntity(a);
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("POST", "/verifications/customers/3ds/deviceDataCollection", body, "payments"), null, 2) }],
        };
      }

      case "authenticate_3ds": {
        const body = withEntity(a);
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("POST", "/verifications/customers/3ds/authentication", body, "payments"), null, 2) }],
        };
      }

      case "challenge_3ds": {
        const body = withEntity(a);
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("POST", "/verifications/customers/3ds/challenge", body, "payments"), null, 2) }],
        };
      }

      case "get_dispute": {
        const disputeId = encodeURIComponent(String(a.disputeId ?? ""));
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("GET", `/disputes/${disputeId}`, undefined, "disputes"), null, 2) }],
        };
      }

      case "defend_dispute": {
        const disputeId = encodeURIComponent(String(a.disputeId ?? ""));
        const reference = a.reference as string | undefined;
        const body = reference ? { reference } : undefined;
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("POST", `/disputes/${disputeId}/defences`, body, "disputes"), null, 2) }],
        };
      }

      case "get_reconciliation_batch": {
        const batchId = encodeURIComponent(String(a.batchId ?? ""));
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("GET", `/reports/reconciliations/batches/${batchId}`, undefined, "reports"), null, 2) }],
        };
      }

      case "accept_dispute": {
        const disputeId = encodeURIComponent(String(a.disputeId ?? ""));
        const reference = a.reference as string | undefined;
        const body = reference ? { reference } : undefined;
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("POST", `/disputes/${disputeId}/accepts`, body, "disputes"), null, 2) }],
        };
      }

      case "submit_dispute_evidence": {
        const disputeId = encodeURIComponent(String(a.disputeId ?? ""));
        const evidence = (a.evidence as Record<string, unknown> | undefined) ?? {};
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("POST", `/disputes/${disputeId}/evidence`, evidence, "disputes"), null, 2) }],
        };
      }

      case "fraud_screen": {
        const body = withEntity(a);
        return {
          content: [{ type: "text", text: JSON.stringify(await worldpayRequest("POST", "/fraudsight/assessment", body, "fraudsight"), null, 2) }],
        };
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
        const s = new Server({ name: "mcp-worldpay", version: "0.2.0-alpha.2" }, { capabilities: { tools: {} } });
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
