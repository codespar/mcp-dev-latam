#!/usr/bin/env node

/**
 * MCP Server for Safrapay — Banco Safra's acquirer.
 *
 * Safrapay targets mid-to-large BR merchants and Safra's private-banking
 * clientele. It is a B2B-banking crossover: the acquirer is owned by a
 * tier-1 private bank, so onboarding and settlement live inside the Safra
 * relationship rather than a standalone PSP stack.
 *
 * The public-facing API is operated by Aditum on behalf of Safra and is
 * documented at https://safrapay-docs.aditum.com.br. The platform splits
 * into four products on separate hosts: gateway (payments), portal
 * (management), reconciliation, and webhook.
 *
 * Tools (22):
 *   authorize_payment        — authorize a credit-card payment (preauth or auth+capture)
 *   capture_payment          — capture a previously authorized payment
 *   cancel_payment           — cancel / void an authorized-but-uncaptured payment
 *   refund_payment           — full or partial refund of a captured payment
 *   create_pix               — create a Pix charge, returns QR + copy-paste payload
 *   create_boleto            — create a boleto charge
 *   get_payment              — retrieve a charge by id
 *   tokenize_card            — PCI-safe card tokenization (persistent or temporary)
 *   delete_card_token        — revoke a stored card token
 *   create_split_rule        — configure split distribution for a charge
 *   get_statement            — digital statement (Safrapay differentiator)
 *   list_transactions        — list charges with filters
 *   search_by_merchant_order — look up charges by merchant order id
 *   query_chargeback         — retrieve chargeback details by charge id
 *   query_installments       — simulate installment plan (fees, amounts per n)
 *   authenticate_3ds         — kick off 3DS authentication before authorize_payment
 *   create_recurrence        — create a recurring-billing subscription
 *   get_recurrence           — retrieve a recurrence by id
 *   cancel_recurrence        — cancel an active recurrence
 *   get_settlement_report    — reconciliation host settlement report
 *   create_payment_link      — create a hosted-checkout payment link
 *   register_webhook         — bulk-register webhook subscriptions
 *
 * Authentication
 *   Gateway uses a two-step bootstrap. POST /v2/merchant/auth with headers
 *   `Authorization: <BCRYPT(CNPJ+MerchantToken)>` and `merchantCredential: <CNPJ>`
 *   returns a JWT access token. Subsequent calls send `Authorization: Bearer <jwt>`.
 *   The server caches the JWT in memory until 60 s before expiry.
 *
 *   NOTE: The BCRYPT input concatenation shape is not fully specified in the
 *   public docs. This implementation hashes `${CNPJ}${MerchantToken}` which is
 *   a reasonable best-guess; confirm against a live sandbox merchant before
 *   flipping this package from 0.1.0-alpha.1 to 0.1.0.
 *
 * Environment
 *   SAFRAPAY_CLIENT_ID      Merchant CNPJ (sent as merchantCredential header)
 *   SAFRAPAY_CLIENT_SECRET  MerchantToken used to compute the BCRYPT header
 *   SAFRAPAY_MERCHANT_ID    Safrapay merchant id (body field where applicable)
 *   SAFRAPAY_ENV            'sandbox' (default) or 'production'
 *
 * Docs: https://developers.safrapay.com.br (portal, contract-gated)
 *       https://safrapay-docs.aditum.com.br (public endpoint map)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createHash } from "node:crypto";

const CLIENT_ID = process.env.SAFRAPAY_CLIENT_ID || ""; // merchant CNPJ
const CLIENT_SECRET = process.env.SAFRAPAY_CLIENT_SECRET || ""; // MerchantToken
const MERCHANT_ID = process.env.SAFRAPAY_MERCHANT_ID || "";
const ENV = (process.env.SAFRAPAY_ENV || "sandbox").toLowerCase();

const HOSTS = ENV === "production"
  ? {
      gateway: "https://payment.aditum.com.br",
      portal: "https://portal-api.aditum.com.br",
      reconciliation: "https://reconciliation-api.aditum.com.br",
      webhook: "https://webhook.aditum.com.br",
    }
  : {
      gateway: "https://payment-dev.aditum.com.br",
      portal: "https://portal-dev.aditum.com.br",
      reconciliation: "https://reconciliation-dev.aditum.com.br",
      webhook: "https://webhook-dev.aditum.com.br",
    };

type HostKey = keyof typeof HOSTS;

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

/**
 * Compute the BCRYPT-style auth header for the gateway bootstrap call.
 *
 * The public docs describe this as "BCRYPT (code generated containing CNPJ
 * and MerchantToken)". Because the exact input shape isn't published, we
 * hash `${CNPJ}${MerchantToken}` with SHA-256 as a placeholder and flag the
 * package 0.1.0-alpha.1. Swap this for the real BCRYPT recipe once you have
 * a sandbox merchant.
 */
function computeAuthHeader(): string {
  return createHash("sha256").update(`${CLIENT_ID}${CLIENT_SECRET}`).digest("hex");
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }
  const res = await fetch(`${HOSTS.gateway}/v2/merchant/auth`, {
    method: "POST",
    headers: {
      "Authorization": computeAuthHeader(),
      "merchantCredential": CLIENT_ID,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`Safrapay auth ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    accessToken?: string;
    access_token?: string;
    expiresIn?: number;
    expires_in?: number;
  };
  const accessToken = data.accessToken || data.access_token;
  const expiresIn = data.expiresIn || data.expires_in || 1800; // default 30 min per docs
  if (!accessToken) {
    throw new Error("Safrapay auth: no access token in response");
  }
  tokenCache = {
    accessToken,
    expiresAt: now + expiresIn * 1000,
  };
  return accessToken;
}

async function safrapayRequest(
  method: string,
  path: string,
  body?: unknown,
  host: HostKey = "gateway",
): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${HOSTS[host]}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Safrapay API ${res.status} ${method} ${path}: ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const server = new Server(
  { name: "mcp-safrapay", version: "0.2.0-alpha.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "authorize_payment",
      description: "Authorize a credit-card payment on Safrapay. Set preauth=true to authorize only (use capture_payment later); false to authorize+capture atomically.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in cents" },
          currency: { type: "string", description: "ISO-4217 currency code (default BRL)" },
          order_id: { type: "string", description: "Merchant-side order identifier" },
          installments: { type: "number", description: "Number of installments (1 = à vista)" },
          preauth: { type: "boolean", description: "true = pre-authorization only; false = auth + capture" },
          soft_descriptor: { type: "string", description: "Statement descriptor" },
          customer: {
            type: "object",
            description: "Customer identity",
            properties: {
              customer_id: { type: "string" },
              name: { type: "string" },
              email: { type: "string" },
              document_type: { type: "string", enum: ["CPF", "CNPJ"] },
              document_number: { type: "string" },
              phone: { type: "string" },
            },
            required: ["name", "document_type", "document_number"],
          },
          card: {
            type: "object",
            description: "Card data. Prefer card_token from tokenize_card over raw PAN.",
            properties: {
              card_token: { type: "string", description: "Token from tokenize_card" },
              number: { type: "string", description: "PAN; never log" },
              holder_name: { type: "string" },
              expiration_month: { type: "string" },
              expiration_year: { type: "string" },
              security_code: { type: "string" },
              brand: { type: "string" },
            },
          },
        },
        required: ["amount", "order_id", "customer", "card"],
      },
    },
    {
      name: "capture_payment",
      description: "Capture a previously authorized (pre-auth) payment.",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Safrapay chargeId from authorize_payment" },
          amount: { type: "number", description: "Amount to capture in cents. Omit to capture the full authorized amount." },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "cancel_payment",
      description: "Cancel (void) an authorized-but-uncaptured payment. Also used for full refund of a captured payment in Safrapay.",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Safrapay chargeId" },
          reason: { type: "string", description: "Optional cancellation reason" },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "refund_payment",
      description: "Refund a captured payment. Pass amount for a partial refund; omit for full. Safrapay routes both through /v2/charge/cancelation with an amount field.",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Safrapay chargeId" },
          amount: { type: "number", description: "Refund amount in cents. Omit for full refund." },
          reason: { type: "string", description: "Optional refund reason" },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "create_pix",
      description: "Create a Pix charge. Returns qr_code (EMV copy-paste payload), qr_code_image, and chargeId.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in cents" },
          order_id: { type: "string", description: "Merchant-side order identifier" },
          expires_in: { type: "number", description: "QR code lifetime in seconds" },
          customer: {
            type: "object",
            description: "Payer identity (CPF/CNPJ required by BCB)",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              document_type: { type: "string", enum: ["CPF", "CNPJ"] },
              document_number: { type: "string" },
            },
            required: ["document_type", "document_number"],
          },
          description: { type: "string", description: "Free-text description shown to payer" },
        },
        required: ["amount", "order_id", "customer"],
      },
    },
    {
      name: "create_boleto",
      description: "Create a boleto charge. Returns boleto PDF URL, barcode, digitable line, and expiration date.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in cents" },
          order_id: { type: "string", description: "Merchant-side order identifier" },
          expiration_date: { type: "string", description: "YYYY-MM-DD" },
          instructions: { type: "string", description: "Free-text instructions printed on the boleto" },
          customer: {
            type: "object",
            description: "Payer identity",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              document_type: { type: "string", enum: ["CPF", "CNPJ"] },
              document_number: { type: "string" },
              address: {
                type: "object",
                properties: {
                  street: { type: "string" },
                  number: { type: "string" },
                  complement: { type: "string" },
                  district: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string" },
                  postal_code: { type: "string" },
                },
              },
            },
            required: ["name", "document_type", "document_number"],
          },
        },
        required: ["amount", "order_id", "expiration_date", "customer"],
      },
    },
    {
      name: "get_payment",
      description: "Retrieve a charge by Safrapay chargeId. Works for credit, Pix, and boleto.",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Safrapay chargeId" },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "tokenize_card",
      description: "Tokenize a card for PCI-safe reuse. Set temporary=true for a single-use token (POST /v2/temporary/card); false for a persistent card-on-file (POST /v2/card).",
      inputSchema: {
        type: "object",
        properties: {
          card_number: { type: "string", description: "PAN; never log this value" },
          holder_name: { type: "string" },
          expiration_month: { type: "string" },
          expiration_year: { type: "string" },
          security_code: { type: "string" },
          brand: { type: "string", description: "Visa, Mastercard, Elo, Amex, Hipercard" },
          customer_id: { type: "string", description: "Customer id to associate the token with (persistent tokens only)" },
          temporary: { type: "boolean", description: "true = single-use; false (default) = persistent" },
        },
        required: ["card_number", "holder_name", "expiration_month", "expiration_year"],
      },
    },
    {
      name: "create_split_rule",
      description: "Configure split distribution for an existing charge. Each rule routes a portion of the charge to a receiver (onboard receivers via the Portal first).",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Safrapay chargeId to split" },
          rules: {
            type: "array",
            description: "Split rules",
            items: {
              type: "object",
              properties: {
                receiver_id: { type: "string", description: "Safrapay receiverId" },
                amount: { type: "number", description: "Fixed amount in cents to route to this receiver" },
                percentage: { type: "number", description: "Percentage (0-100) of the charge to route to this receiver" },
                liable: { type: "boolean", description: "true if this receiver is liable for chargebacks" },
                charge_processing_fee: { type: "boolean", description: "true if this receiver absorbs the processing fee" },
              },
              required: ["receiver_id"],
            },
          },
        },
        required: ["charge_id", "rules"],
      },
    },
    {
      name: "get_statement",
      description: "Retrieve the digital statement (extrato). A Safrapay differentiator, reflecting the Banco Safra bank-account integration.",
      inputSchema: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date, YYYY-MM-DD" },
          end_date: { type: "string", description: "End date, YYYY-MM-DD" },
          account_id: { type: "string", description: "Optional Safra account id if the merchant has multiple" },
        },
        required: ["start_date", "end_date"],
      },
    },
    {
      name: "list_transactions",
      description: "List charges with optional filters.",
      inputSchema: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "YYYY-MM-DD" },
          end_date: { type: "string", description: "YYYY-MM-DD" },
          status: { type: "string", description: "Filter by charge status" },
          payment_type: { type: "string", enum: ["credit", "pix", "boleto"], description: "Filter by payment method" },
          page: { type: "number", description: "Page number (starts at 1)" },
          page_size: { type: "number", description: "Page size" },
        },
      },
    },
    {
      name: "delete_card_token",
      description: "Revoke a stored card token. For persistent card-on-file tokens created via tokenize_card (temporary=false). DELETE /v2/card/{cardId}.",
      inputSchema: {
        type: "object",
        properties: {
          card_id: { type: "string", description: "Safrapay card token id to revoke" },
        },
        required: ["card_id"],
      },
    },
    {
      name: "search_by_merchant_order",
      description: "Look up charges by the merchant-side order identifier (the order_id supplied at creation). Useful when the Safrapay chargeId was lost but the merchant order id is known.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "Merchant-side order identifier" },
          page: { type: "number", description: "Page number (starts at 1)" },
          page_size: { type: "number", description: "Page size" },
        },
        required: ["order_id"],
      },
    },
    {
      name: "query_chargeback",
      description: "Retrieve chargeback (contestacao) detail for a charge: reason code, acquirer deadline, dispute amount, evidence status.",
      inputSchema: {
        type: "object",
        properties: {
          charge_id: { type: "string", description: "Safrapay chargeId under dispute" },
        },
        required: ["charge_id"],
      },
    },
    {
      name: "query_installments",
      description: "Simulate an installment plan for a given amount. Returns the per-installment amount, buyer-fee, and total for each available installment count.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in cents" },
          brand: { type: "string", description: "Card brand (Visa, Mastercard, Elo, Amex, Hipercard)" },
          max_installments: { type: "number", description: "Cap the plan at N installments (Safrapay defaults to merchant config)" },
        },
        required: ["amount"],
      },
    },
    {
      name: "authenticate_3ds",
      description: "Kick off 3-D Secure authentication before authorize_payment. Returns a challenge URL / eci / cavv / xid to pass back into authorize_payment for a liability-shifted transaction.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in cents" },
          order_id: { type: "string", description: "Merchant-side order identifier" },
          card_token: { type: "string", description: "Token from tokenize_card — preferred over raw PAN" },
          return_url: { type: "string", description: "URL the issuer ACS redirects back to after challenge" },
          customer: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              document_type: { type: "string", enum: ["CPF", "CNPJ"] },
              document_number: { type: "string" },
              phone: { type: "string" },
            },
            required: ["name", "document_type", "document_number"],
          },
        },
        required: ["amount", "order_id", "return_url", "customer"],
      },
    },
    {
      name: "create_recurrence",
      description: "Create a recurring-billing subscription. Safrapay will charge card_token on the configured interval until cancel_recurrence or end_date. POST /v2/recurrence.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Per-cycle amount in cents" },
          interval: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"], description: "Billing interval" },
          interval_count: { type: "number", description: "Number of intervals between charges (e.g. 1 monthly, 3 monthly = quarterly)" },
          start_date: { type: "string", description: "First charge date, YYYY-MM-DD" },
          end_date: { type: "string", description: "Optional last charge date, YYYY-MM-DD" },
          card_token: { type: "string", description: "Persistent card token from tokenize_card" },
          customer: {
            type: "object",
            properties: {
              customer_id: { type: "string" },
              name: { type: "string" },
              email: { type: "string" },
              document_type: { type: "string", enum: ["CPF", "CNPJ"] },
              document_number: { type: "string" },
            },
            required: ["name", "document_type", "document_number"],
          },
          soft_descriptor: { type: "string", description: "Statement descriptor" },
        },
        required: ["amount", "interval", "start_date", "card_token", "customer"],
      },
    },
    {
      name: "get_recurrence",
      description: "Retrieve a recurrence by id: schedule, next-charge date, charge history, status.",
      inputSchema: {
        type: "object",
        properties: {
          recurrence_id: { type: "string", description: "Safrapay recurrenceId" },
        },
        required: ["recurrence_id"],
      },
    },
    {
      name: "cancel_recurrence",
      description: "Cancel an active recurrence. Future charges will stop; already-charged cycles are untouched.",
      inputSchema: {
        type: "object",
        properties: {
          recurrence_id: { type: "string", description: "Safrapay recurrenceId" },
          reason: { type: "string", description: "Optional cancellation reason" },
        },
        required: ["recurrence_id"],
      },
    },
    {
      name: "get_settlement_report",
      description: "Retrieve a settlement (liquidacao) report from the reconciliation host. Groups captured charges by settlement date so merchants can tie payouts to charges.",
      inputSchema: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Settlement start date, YYYY-MM-DD" },
          end_date: { type: "string", description: "Settlement end date, YYYY-MM-DD" },
          payment_type: { type: "string", enum: ["credit", "pix", "boleto"], description: "Optional filter by payment method" },
          page: { type: "number", description: "Page number (starts at 1)" },
          page_size: { type: "number", description: "Page size" },
        },
        required: ["start_date", "end_date"],
      },
    },
    {
      name: "create_payment_link",
      description: "Create a hosted-checkout payment link. Returns a short URL the merchant shares with the payer; Safrapay hosts the checkout and accepts credit/Pix/boleto per configuration.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in cents" },
          order_id: { type: "string", description: "Merchant-side order identifier" },
          description: { type: "string", description: "Description shown on the hosted page" },
          expires_at: { type: "string", description: "ISO-8601 link expiration timestamp" },
          max_installments: { type: "number", description: "Cap installments at N for this link" },
          accepted_methods: {
            type: "array",
            description: "Payment methods accepted on the hosted page",
            items: { type: "string", enum: ["credit", "pix", "boleto"] },
          },
          customer: {
            type: "object",
            description: "Optional pre-filled payer identity",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
              document_type: { type: "string", enum: ["CPF", "CNPJ"] },
              document_number: { type: "string" },
            },
          },
        },
        required: ["amount", "order_id"],
      },
    },
    {
      name: "register_webhook",
      description: "Bulk-register webhook subscriptions on the Safrapay webhook product. Sends to POST /v1/webhook/bulk on the webhook host.",
      inputSchema: {
        type: "object",
        properties: {
          subscriptions: {
            type: "array",
            description: "One or more webhook subscriptions",
            items: {
              type: "object",
              properties: {
                url: { type: "string", description: "HTTPS endpoint that Safrapay will POST events to" },
                events: {
                  type: "array",
                  description: "Event types to subscribe to (e.g. charge.authorized, charge.captured, pix.paid, boleto.paid)",
                  items: { type: "string" },
                },
                secret: { type: "string", description: "Shared secret used to sign webhook payloads" },
              },
              required: ["url", "events"],
            },
          },
        },
        required: ["subscriptions"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "authorize_payment": {
        const a = args as Record<string, unknown>;
        const body = { ...a, merchantId: MERCHANT_ID };
        const path = a.preauth === true ? "/v2/charge/preauthorization" : "/v2/charge/authorization";
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("POST", path, body), null, 2) }] };
      }
      case "capture_payment": {
        const a = args as { charge_id: string; amount?: number };
        const body: Record<string, unknown> = {};
        if (a.amount !== undefined) body.amount = a.amount;
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("PUT", `/v2/charge/capture/${a.charge_id}`, body), null, 2) }] };
      }
      case "cancel_payment": {
        const a = args as { charge_id: string; reason?: string };
        const body: Record<string, unknown> = {};
        if (a.reason) body.reason = a.reason;
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("PUT", `/v2/charge/cancelation/${a.charge_id}`, body), null, 2) }] };
      }
      case "refund_payment": {
        const a = args as { charge_id: string; amount?: number; reason?: string };
        const body: Record<string, unknown> = {};
        if (a.amount !== undefined) body.amount = a.amount;
        if (a.reason) body.reason = a.reason;
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("PUT", `/v2/charge/cancelation/${a.charge_id}`, body), null, 2) }] };
      }
      case "create_pix": {
        const body = { ...(args as Record<string, unknown>), merchantId: MERCHANT_ID };
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("POST", "/v2/charge/pix", body), null, 2) }] };
      }
      case "create_boleto": {
        const body = { ...(args as Record<string, unknown>), merchantId: MERCHANT_ID };
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("POST", "/v2/charge/boleto", body), null, 2) }] };
      }
      case "get_payment": {
        const a = args as { charge_id: string };
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("GET", `/v2/charge/${a.charge_id}`), null, 2) }] };
      }
      case "tokenize_card": {
        const a = args as Record<string, unknown>;
        const temporary = a.temporary === true;
        const body = { ...a };
        delete body.temporary;
        const path = temporary ? "/v2/temporary/card" : "/v2/card";
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("POST", path, body), null, 2) }] };
      }
      case "create_split_rule": {
        const a = args as { charge_id: string; rules: unknown[] };
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("PUT", `/v2/charge/split/${a.charge_id}`, { rules: a.rules }), null, 2) }] };
      }
      case "get_statement": {
        const a = args as Record<string, unknown>;
        const params = new URLSearchParams();
        if (a.start_date) params.set("startDate", String(a.start_date));
        if (a.end_date) params.set("endDate", String(a.end_date));
        if (a.account_id) params.set("accountId", String(a.account_id));
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("GET", `/v2/Account/Movement/Extract?${params}`), null, 2) }] };
      }
      case "list_transactions": {
        const a = args as Record<string, unknown>;
        const params = new URLSearchParams();
        if (a.start_date) params.set("startDate", String(a.start_date));
        if (a.end_date) params.set("endDate", String(a.end_date));
        if (a.status) params.set("status", String(a.status));
        if (a.payment_type) params.set("paymentType", String(a.payment_type));
        if (a.page) params.set("page", String(a.page));
        if (a.page_size) params.set("pageSize", String(a.page_size));
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("GET", `/v2/charges?${params}`), null, 2) }] };
      }
      case "delete_card_token": {
        const a = args as { card_id: string };
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("DELETE", `/v2/card/${a.card_id}`), null, 2) }] };
      }
      case "search_by_merchant_order": {
        const a = args as Record<string, unknown>;
        const params = new URLSearchParams();
        if (a.order_id) params.set("orderId", String(a.order_id));
        if (a.page) params.set("page", String(a.page));
        if (a.page_size) params.set("pageSize", String(a.page_size));
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("GET", `/v2/charges?${params}`), null, 2) }] };
      }
      case "query_chargeback": {
        const a = args as { charge_id: string };
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("GET", `/v2/chargeback/${a.charge_id}`), null, 2) }] };
      }
      case "query_installments": {
        const a = args as Record<string, unknown>;
        const params = new URLSearchParams();
        if (a.amount !== undefined) params.set("amount", String(a.amount));
        if (a.brand) params.set("brand", String(a.brand));
        if (a.max_installments !== undefined) params.set("maxInstallments", String(a.max_installments));
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("GET", `/v2/installments?${params}`), null, 2) }] };
      }
      case "authenticate_3ds": {
        const body = { ...(args as Record<string, unknown>), merchantId: MERCHANT_ID };
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("POST", "/v2/charge/3ds/authentication", body), null, 2) }] };
      }
      case "create_recurrence": {
        const body = { ...(args as Record<string, unknown>), merchantId: MERCHANT_ID };
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("POST", "/v2/recurrence", body), null, 2) }] };
      }
      case "get_recurrence": {
        const a = args as { recurrence_id: string };
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("GET", `/v2/recurrence/${a.recurrence_id}`), null, 2) }] };
      }
      case "cancel_recurrence": {
        const a = args as { recurrence_id: string; reason?: string };
        const body: Record<string, unknown> = {};
        if (a.reason) body.reason = a.reason;
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("PUT", `/v2/recurrence/cancelation/${a.recurrence_id}`, body), null, 2) }] };
      }
      case "get_settlement_report": {
        const a = args as Record<string, unknown>;
        const params = new URLSearchParams();
        if (a.start_date) params.set("startDate", String(a.start_date));
        if (a.end_date) params.set("endDate", String(a.end_date));
        if (a.payment_type) params.set("paymentType", String(a.payment_type));
        if (a.page) params.set("page", String(a.page));
        if (a.page_size) params.set("pageSize", String(a.page_size));
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("GET", `/v1/settlement?${params}`, undefined, "reconciliation"), null, 2) }] };
      }
      case "create_payment_link": {
        const body = { ...(args as Record<string, unknown>), merchantId: MERCHANT_ID };
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("POST", "/v2/paymentlink", body), null, 2) }] };
      }
      case "register_webhook": {
        return { content: [{ type: "text", text: JSON.stringify(await safrapayRequest("POST", "/v1/webhook/bulk", args, "webhook"), null, 2) }] };
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
        const s = new Server({ name: "mcp-safrapay", version: "0.2.0-alpha.1" }, { capabilities: { tools: {} } });
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
