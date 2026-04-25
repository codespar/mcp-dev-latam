#!/usr/bin/env node

/**
 * MCP Server for Mercado Pago — payment gateway for LATAM.
 *
 * Payments & checkout:
 * - create_payment, get_payment, search_payments, create_refund
 * - create_preference, get_preference
 * - create_pix_payment, create_card_token
 *
 * Customers & merchant ops:
 * - create_customer, list_customers
 * - get_merchant_order, search_merchant_orders, get_balance
 * - create_store, list_stores, create_pos
 *
 * Payment methods & metadata:
 * - get_payment_methods, get_payment_method_details
 * - get_payment_methods_by_site, get_identification_types
 *
 * Subscriptions (preapprovals):
 * - create_subscription, get_subscription, update_subscription, cancel_subscription
 *
 * Marketplace (split payments & seller onboarding):
 * - oauth_token_exchange, create_advanced_payment, get_advanced_payment
 *
 * Disputes & reconciliation:
 * - get_chargeback, upload_chargeback_evidence
 * - create_settlement_report
 *
 * Environment:
 *   MERCADO_PAGO_ACCESS_TOKEN — Access token for API authentication
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || "";
const BASE_URL = "https://api.mercadopago.com";

async function mpRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ACCESS_TOKEN) headers["Authorization"] = `Bearer ${ACCESS_TOKEN}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mercado Pago API ${res.status}: ${err}`);
  }
  const text = await res.text();
  if (!text) return { status: res.status };
  try { return JSON.parse(text); } catch { return { status: res.status, body: text }; }
}

async function mpFormRequest(path: string, form: Record<string, string>): Promise<unknown> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(form)) if (v !== undefined && v !== null) params.set(k, v);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
    body: params.toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mercado Pago API ${res.status}: ${err}`);
  }
  return res.json();
}

async function mpMultipartRequest(
  path: string,
  files: Array<{ filename: string; content_base64: string; mime_type: string }>,
): Promise<unknown> {
  const form = new FormData();
  for (const f of files) {
    const bytes = Buffer.from(f.content_base64, "base64");
    const blob = new Blob([bytes], { type: f.mime_type });
    form.append("files[]", blob, f.filename);
  }
  const headers: Record<string, string> = {};
  if (ACCESS_TOKEN) headers["Authorization"] = `Bearer ${ACCESS_TOKEN}`;
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: form as any });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Mercado Pago API ${res.status}: ${err}`);
  }
  const text = await res.text();
  if (!text) return { status: res.status };
  try { return JSON.parse(text); } catch { return { status: res.status, body: text }; }
}

const server = new Server(
  { name: "mcp-mercado-pago", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_payment",
      description: "Create a new payment",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Payment amount" },
          description: { type: "string", description: "Payment description" },
          payment_method_id: { type: "string", description: "Payment method ID (e.g. pix, credit_card, bolbradesco)" },
          payer_email: { type: "string", description: "Payer email address" },
          installments: { type: "number", description: "Number of installments (default 1)" },
          token: { type: "string", description: "Card token (for credit card payments)" },
        },
        required: ["amount", "description", "payment_method_id", "payer_email"],
      },
    },
    {
      name: "get_payment",
      description: "Get payment details by ID",
      inputSchema: {
        type: "object",
        properties: { paymentId: { type: "string", description: "Payment ID" } },
        required: ["paymentId"],
      },
    },
    {
      name: "search_payments",
      description: "Search payments with filters",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "approved", "authorized", "in_process", "in_mediation", "rejected", "cancelled", "refunded", "charged_back"], description: "Payment status" },
          date_from: { type: "string", description: "Start date (ISO 8601)" },
          date_to: { type: "string", description: "End date (ISO 8601)" },
          sort: { type: "string", enum: ["date_created", "date_approved", "date_last_updated", "money_release_date"], description: "Sort field" },
          criteria: { type: "string", enum: ["asc", "desc"], description: "Sort direction" },
          limit: { type: "number", description: "Results limit" },
          offset: { type: "number", description: "Results offset" },
        },
      },
    },
    {
      name: "create_refund",
      description: "Refund a payment (full or partial)",
      inputSchema: {
        type: "object",
        properties: {
          paymentId: { type: "string", description: "Payment ID to refund" },
          amount: { type: "number", description: "Refund amount (omit for full refund)" },
        },
        required: ["paymentId"],
      },
    },
    {
      name: "create_preference",
      description: "Create a checkout preference for Checkout Pro",
      inputSchema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "Items to sell",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Item title" },
                quantity: { type: "number", description: "Quantity" },
                unit_price: { type: "number", description: "Unit price" },
                currency_id: { type: "string", description: "Currency (e.g. BRL)" },
              },
              required: ["title", "quantity", "unit_price"],
            },
          },
          back_urls: {
            type: "object",
            description: "Redirect URLs after payment",
            properties: {
              success: { type: "string", description: "URL on success" },
              failure: { type: "string", description: "URL on failure" },
              pending: { type: "string", description: "URL on pending" },
            },
          },
          auto_return: { type: "string", enum: ["approved", "all"], description: "Auto-return mode" },
        },
        required: ["items"],
      },
    },
    {
      name: "get_preference",
      description: "Get checkout preference by ID",
      inputSchema: {
        type: "object",
        properties: { preferenceId: { type: "string", description: "Preference ID" } },
        required: ["preferenceId"],
      },
    },
    {
      name: "create_customer",
      description: "Create a customer",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Customer email" },
          first_name: { type: "string", description: "First name" },
          last_name: { type: "string", description: "Last name" },
        },
        required: ["email"],
      },
    },
    {
      name: "list_customers",
      description: "List customers",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Filter by email" },
          limit: { type: "number", description: "Results limit" },
          offset: { type: "number", description: "Results offset" },
        },
      },
    },
    {
      name: "get_payment_methods",
      description: "List available payment methods",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_pix_payment",
      description: "Create a PIX payment",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Payment amount" },
          description: { type: "string", description: "Payment description" },
          payer_email: { type: "string", description: "Payer email" },
          payer_first_name: { type: "string", description: "Payer first name" },
          payer_last_name: { type: "string", description: "Payer last name" },
          payer_cpf: { type: "string", description: "Payer CPF (identification number)" },
        },
        required: ["amount", "description", "payer_email"],
      },
    },
    {
      name: "get_merchant_order",
      description: "Get merchant order by ID",
      inputSchema: {
        type: "object",
        properties: { orderId: { type: "string", description: "Merchant order ID" } },
        required: ["orderId"],
      },
    },
    {
      name: "get_balance",
      description: "Get account balance",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_subscription",
      description: "Create a recurring subscription (preapproval)",
      inputSchema: {
        type: "object",
        properties: {
          payer_email: { type: "string", description: "Payer email" },
          reason: { type: "string", description: "Subscription reason/title" },
          auto_recurring: {
            type: "object",
            description: "Recurring configuration",
            properties: {
              frequency: { type: "number", description: "Frequency value (e.g. 1)" },
              frequency_type: { type: "string", enum: ["days", "months"], description: "Frequency unit" },
              transaction_amount: { type: "number", description: "Amount per period" },
              currency_id: { type: "string", description: "Currency (e.g. BRL)" },
              start_date: { type: "string", description: "Start date (ISO 8601)" },
              end_date: { type: "string", description: "End date (ISO 8601)" },
            },
            required: ["frequency", "frequency_type", "transaction_amount", "currency_id"],
          },
          back_url: { type: "string", description: "Return URL after authorization" },
          external_reference: { type: "string", description: "External reference ID" },
        },
        required: ["payer_email", "reason", "auto_recurring"],
      },
    },
    {
      name: "get_subscription",
      description: "Get subscription (preapproval) details by ID",
      inputSchema: {
        type: "object",
        properties: {
          preapproval_id: { type: "string", description: "Preapproval/subscription ID" },
        },
        required: ["preapproval_id"],
      },
    },
    {
      name: "cancel_subscription",
      description: "Cancel a subscription (preapproval)",
      inputSchema: {
        type: "object",
        properties: {
          preapproval_id: { type: "string", description: "Preapproval/subscription ID" },
        },
        required: ["preapproval_id"],
      },
    },
    {
      name: "create_card_token",
      description: "Tokenize a card for secure payments",
      inputSchema: {
        type: "object",
        properties: {
          card_number: { type: "string", description: "Card number" },
          expiration_month: { type: "string", description: "Expiration month (MM)" },
          expiration_year: { type: "string", description: "Expiration year (YYYY)" },
          security_code: { type: "string", description: "CVV security code" },
          cardholder: {
            type: "object",
            description: "Cardholder info",
            properties: {
              name: { type: "string", description: "Name as on card" },
              identification: {
                type: "object",
                properties: {
                  type: { type: "string", description: "Document type (e.g. CPF)" },
                  number: { type: "string", description: "Document number" },
                },
              },
            },
          },
        },
        required: ["card_number", "expiration_month", "expiration_year", "security_code", "cardholder"],
      },
    },
    {
      name: "get_payment_method_details",
      description: "Get details of a specific payment method by ID",
      inputSchema: {
        type: "object",
        properties: {
          payment_method_id: { type: "string", description: "Payment method ID (e.g. visa, pix, bolbradesco)" },
        },
        required: ["payment_method_id"],
      },
    },
    {
      name: "create_store",
      description: "Create a store (physical location or POS group)",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Store name" },
          business_hours: {
            type: "object",
            description: "Business hours configuration",
            properties: {
              monday: { type: "array", items: { type: "object", properties: { open: { type: "string" }, close: { type: "string" } } } },
              tuesday: { type: "array", items: { type: "object", properties: { open: { type: "string" }, close: { type: "string" } } } },
              wednesday: { type: "array", items: { type: "object", properties: { open: { type: "string" }, close: { type: "string" } } } },
              thursday: { type: "array", items: { type: "object", properties: { open: { type: "string" }, close: { type: "string" } } } },
              friday: { type: "array", items: { type: "object", properties: { open: { type: "string" }, close: { type: "string" } } } },
              saturday: { type: "array", items: { type: "object", properties: { open: { type: "string" }, close: { type: "string" } } } },
              sunday: { type: "array", items: { type: "object", properties: { open: { type: "string" }, close: { type: "string" } } } },
            },
          },
          location: {
            type: "object",
            description: "Store location",
            properties: {
              street_name: { type: "string" },
              street_number: { type: "string" },
              city_name: { type: "string" },
              state_name: { type: "string" },
              zip_code: { type: "string" },
              latitude: { type: "number" },
              longitude: { type: "number" },
            },
          },
          external_id: { type: "string", description: "External reference ID" },
        },
        required: ["name"],
      },
    },
    {
      name: "list_stores",
      description: "List stores",
      inputSchema: {
        type: "object",
        properties: {
          external_id: { type: "string", description: "Filter by external ID" },
          limit: { type: "number", description: "Results limit" },
          offset: { type: "number", description: "Results offset" },
        },
      },
    },
    {
      name: "create_pos",
      description: "Create a point of sale (POS) linked to a store",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "POS name" },
          store_id: { type: "string", description: "Store ID to link this POS to" },
          fixed_amount: { type: "boolean", description: "Whether the POS has a fixed amount" },
          category: { type: "number", description: "MCC category code" },
          external_id: { type: "string", description: "External reference ID" },
          external_store_id: { type: "string", description: "External store reference" },
        },
        required: ["name", "external_id"],
      },
    },
    {
      name: "update_subscription",
      description: "Update a subscription (preapproval) — amount, status, reason, card token, etc.",
      inputSchema: {
        type: "object",
        properties: {
          preapproval_id: { type: "string", description: "Preapproval/subscription ID" },
          reason: { type: "string", description: "New subscription reason/title" },
          external_reference: { type: "string", description: "New external reference" },
          status: { type: "string", enum: ["paused", "authorized", "cancelled"], description: "New subscription status" },
          card_token_id: { type: "string", description: "New card token to charge" },
          auto_recurring: {
            type: "object",
            description: "Updated recurring configuration",
            properties: {
              transaction_amount: { type: "number", description: "New amount per period" },
              currency_id: { type: "string", description: "Currency (e.g. BRL)" },
            },
          },
        },
        required: ["preapproval_id"],
      },
    },
    {
      name: "oauth_token_exchange",
      description: "Exchange an authorization code for a seller access token (marketplace onboarding). Also supports refresh_token grant.",
      inputSchema: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "Marketplace application client_id" },
          client_secret: { type: "string", description: "Marketplace application client_secret" },
          grant_type: { type: "string", enum: ["authorization_code", "refresh_token"], description: "OAuth grant type (default authorization_code)" },
          code: { type: "string", description: "Authorization code returned from /authorization (required for authorization_code)" },
          redirect_uri: { type: "string", description: "Redirect URI registered with the app (required for authorization_code)" },
          refresh_token: { type: "string", description: "Refresh token (required for refresh_token grant)" },
          code_verifier: { type: "string", description: "PKCE code verifier (optional)" },
        },
        required: ["client_id", "client_secret"],
      },
    },
    {
      name: "create_advanced_payment",
      description: "Create a marketplace split payment with per-recipient disbursements (application_fee, money_release_days, collector_id per seller)",
      inputSchema: {
        type: "object",
        properties: {
          description: { type: "string", description: "Payment description" },
          external_reference: { type: "string", description: "External reference ID" },
          binary_mode: { type: "boolean", description: "If true, payment is approved or rejected (no pending)" },
          capture: { type: "boolean", description: "Whether to capture the payment immediately" },
          payer: {
            type: "object",
            description: "Buyer information",
            properties: {
              email: { type: "string" },
              first_name: { type: "string" },
              last_name: { type: "string" },
              identification: {
                type: "object",
                properties: { type: { type: "string" }, number: { type: "string" } },
              },
              type: { type: "string", description: "Payer type (e.g. customer, guest)" },
              id: { type: "string", description: "Mercado Pago customer ID" },
            },
          },
          payments: {
            type: "array",
            description: "Buyer's payment methods covering the total amount",
            items: {
              type: "object",
              properties: {
                payment_method_id: { type: "string" },
                payment_type_id: { type: "string" },
                token: { type: "string" },
                installments: { type: "number" },
                transaction_amount: { type: "number" },
                issuer_id: { type: "string" },
              },
            },
          },
          disbursements: {
            type: "array",
            description: "Split rules per seller",
            items: {
              type: "object",
              properties: {
                amount: { type: "number", description: "Amount destined to this seller" },
                external_reference: { type: "string", description: "Per-disbursement external reference" },
                collector_id: { type: "string", description: "Seller's Mercado Pago user ID" },
                application_fee: { type: "number", description: "Marketplace commission on this disbursement" },
                money_release_days: { type: "number", description: "Days to release money to the seller after approval" },
              },
              required: ["amount", "collector_id"],
            },
          },
          additional_info: { type: "object", description: "Additional info (items, shipments, payer details)" },
        },
        required: ["payer", "payments", "disbursements"],
      },
    },
    {
      name: "get_advanced_payment",
      description: "Get an advanced (split) payment by ID",
      inputSchema: {
        type: "object",
        properties: {
          advanced_payment_id: { type: "string", description: "Advanced payment ID" },
        },
        required: ["advanced_payment_id"],
      },
    },
    {
      name: "get_chargeback",
      description: "Get chargeback details by ID",
      inputSchema: {
        type: "object",
        properties: {
          chargeback_id: { type: "string", description: "Chargeback ID (or payment ID)" },
        },
        required: ["chargeback_id"],
      },
    },
    {
      name: "upload_chargeback_evidence",
      description: "Upload documentation/evidence for a chargeback dispute. Accepts one or more files as base64 content.",
      inputSchema: {
        type: "object",
        properties: {
          chargeback_id: { type: "string", description: "Chargeback ID" },
          files: {
            type: "array",
            description: "Files to upload (.jpg, .png, .pdf; 10MB total max)",
            items: {
              type: "object",
              properties: {
                filename: { type: "string", description: "File name with extension" },
                content_base64: { type: "string", description: "File content encoded as base64" },
                mime_type: { type: "string", description: "MIME type (e.g. image/png, application/pdf)" },
              },
              required: ["filename", "content_base64", "mime_type"],
            },
          },
        },
        required: ["chargeback_id", "files"],
      },
    },
    {
      name: "get_identification_types",
      description: "Get document/identification types available per country (CPF, CNPJ, DNI, RUT, etc.). Use the seller's access token — response is country-scoped.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_payment_methods_by_site",
      description: "List available payment methods for a specific Mercado Pago site (MLB=Brazil, MLA=Argentina, MLM=Mexico, MLC=Chile, MCO=Colombia, MPE=Peru, MLU=Uruguay)",
      inputSchema: {
        type: "object",
        properties: {
          site_id: { type: "string", enum: ["MLB", "MLA", "MLM", "MLC", "MCO", "MPE", "MLU"], description: "Marketplace site ID" },
        },
        required: ["site_id"],
      },
    },
    {
      name: "create_settlement_report",
      description: "Manually generate a settlement (account money) report for a date range. Returns 202; poll the report list endpoint to download when ready.",
      inputSchema: {
        type: "object",
        properties: {
          begin_date: { type: "string", description: "Start date, ISO 8601 UTC (e.g. 2026-04-01T00:00:00Z)" },
          end_date: { type: "string", description: "End date, ISO 8601 UTC (e.g. 2026-04-30T23:59:59Z)" },
        },
        required: ["begin_date", "end_date"],
      },
    },
    {
      name: "search_merchant_orders",
      description: "Search merchant orders with filters (last 90 days). Useful for reconciliation of Checkout Pro / Bricks flows.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Order status (e.g. opened, closed, expired)" },
          preference_id: { type: "string", description: "Filter by preference ID" },
          external_reference: { type: "string", description: "Filter by external reference" },
          application_id: { type: "string", description: "Filter by application ID" },
          payer_id: { type: "string", description: "Filter by payer (buyer) user ID" },
          sponsor_id: { type: "string", description: "Filter by marketplace sponsor user ID" },
          limit: { type: "number", description: "Results limit" },
          offset: { type: "number", description: "Results offset" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_payment": {
        const payload: any = {
          transaction_amount: args?.amount,
          description: args?.description,
          payment_method_id: args?.payment_method_id,
          payer: { email: args?.payer_email },
        };
        if (args?.installments) payload.installments = args.installments;
        if (args?.token) payload.token = args.token;
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("POST", "/v1/payments", payload), null, 2) }] };
      }
      case "get_payment":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("GET", `/v1/payments/${args?.paymentId}`), null, 2) }] };
      case "search_payments": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.date_from) params.set("begin_date", String(args.date_from));
        if (args?.date_to) params.set("end_date", String(args.date_to));
        if (args?.sort) params.set("sort", String(args.sort));
        if (args?.criteria) params.set("criteria", String(args.criteria));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("GET", `/v1/payments/search?${params}`), null, 2) }] };
      }
      case "create_refund": {
        const body = args?.amount ? { amount: args.amount } : undefined;
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("POST", `/v1/payments/${args?.paymentId}/refunds`, body), null, 2) }] };
      }
      case "create_preference":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("POST", "/checkout/preferences", {
          items: args?.items,
          back_urls: args?.back_urls,
          auto_return: args?.auto_return,
        }), null, 2) }] };
      case "get_preference":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("GET", `/checkout/preferences/${args?.preferenceId}`), null, 2) }] };
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("POST", "/v1/customers", {
          email: args?.email,
          first_name: args?.first_name,
          last_name: args?.last_name,
        }), null, 2) }] };
      case "list_customers": {
        const params = new URLSearchParams();
        if (args?.email) params.set("email", String(args.email));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("GET", `/v1/customers/search?${params}`), null, 2) }] };
      }
      case "get_payment_methods":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("GET", "/v1/payment_methods"), null, 2) }] };
      case "create_pix_payment": {
        const payload: any = {
          transaction_amount: args?.amount,
          description: args?.description,
          payment_method_id: "pix",
          payer: {
            email: args?.payer_email,
            first_name: args?.payer_first_name,
            last_name: args?.payer_last_name,
          },
        };
        if (args?.payer_cpf) {
          payload.payer.identification = { type: "CPF", number: args.payer_cpf };
        }
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("POST", "/v1/payments", payload), null, 2) }] };
      }
      case "get_merchant_order":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("GET", `/merchant_orders/${args?.orderId}`), null, 2) }] };
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("GET", "/users/me/mercadopago_account/balance"), null, 2) }] };
      case "create_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("POST", "/preapproval", {
          payer_email: args?.payer_email,
          reason: args?.reason,
          auto_recurring: args?.auto_recurring,
          back_url: args?.back_url,
          external_reference: args?.external_reference,
        }), null, 2) }] };
      case "get_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("GET", `/preapproval/${args?.preapproval_id}`), null, 2) }] };
      case "cancel_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("PUT", `/preapproval/${args?.preapproval_id}`, { status: "cancelled" }), null, 2) }] };
      case "create_card_token":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("POST", "/v1/card_tokens", {
          card_number: args?.card_number,
          expiration_month: args?.expiration_month,
          expiration_year: args?.expiration_year,
          security_code: args?.security_code,
          cardholder: args?.cardholder,
        }), null, 2) }] };
      case "get_payment_method_details":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("GET", `/v1/payment_methods/${args?.payment_method_id}`), null, 2) }] };
      case "create_store":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("POST", "/users/me/stores", {
          name: args?.name,
          business_hours: args?.business_hours,
          location: args?.location,
          external_id: args?.external_id,
        }), null, 2) }] };
      case "list_stores": {
        const params = new URLSearchParams();
        if (args?.external_id) params.set("external_id", String(args.external_id));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("GET", `/users/me/stores/search?${params}`), null, 2) }] };
      }
      case "create_pos":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("POST", "/pos", {
          name: args?.name,
          store_id: args?.store_id,
          fixed_amount: args?.fixed_amount,
          category: args?.category,
          external_id: args?.external_id,
          external_store_id: args?.external_store_id,
        }), null, 2) }] };
      case "update_subscription": {
        const payload: any = {};
        if (args?.reason !== undefined) payload.reason = args.reason;
        if (args?.external_reference !== undefined) payload.external_reference = args.external_reference;
        if (args?.status !== undefined) payload.status = args.status;
        if (args?.card_token_id !== undefined) payload.card_token_id = args.card_token_id;
        if (args?.auto_recurring !== undefined) payload.auto_recurring = args.auto_recurring;
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("PUT", `/preapproval/${args?.preapproval_id}`, payload), null, 2) }] };
      }
      case "oauth_token_exchange": {
        const form: Record<string, string> = {
          client_id: String(args?.client_id ?? ""),
          client_secret: String(args?.client_secret ?? ""),
          grant_type: String(args?.grant_type ?? "authorization_code"),
        };
        if (args?.code) form.code = String(args.code);
        if (args?.redirect_uri) form.redirect_uri = String(args.redirect_uri);
        if (args?.refresh_token) form.refresh_token = String(args.refresh_token);
        if (args?.code_verifier) form.code_verifier = String(args.code_verifier);
        return { content: [{ type: "text", text: JSON.stringify(await mpFormRequest("/oauth/token", form), null, 2) }] };
      }
      case "create_advanced_payment": {
        const payload: any = {
          payer: args?.payer,
          payments: args?.payments,
          disbursements: args?.disbursements,
        };
        if (args?.description !== undefined) payload.description = args.description;
        if (args?.external_reference !== undefined) payload.external_reference = args.external_reference;
        if (args?.binary_mode !== undefined) payload.binary_mode = args.binary_mode;
        if (args?.capture !== undefined) payload.capture = args.capture;
        if (args?.additional_info !== undefined) payload.additional_info = args.additional_info;
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("POST", "/v1/advanced_payments", payload), null, 2) }] };
      }
      case "get_advanced_payment":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("GET", `/v1/advanced_payments/${args?.advanced_payment_id}`), null, 2) }] };
      case "get_chargeback":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("GET", `/v1/chargebacks/${args?.chargeback_id}`), null, 2) }] };
      case "upload_chargeback_evidence": {
        const files = Array.isArray(args?.files) ? args.files : [];
        return { content: [{ type: "text", text: JSON.stringify(await mpMultipartRequest(`/v1/chargebacks/${args?.chargeback_id}/documentation`, files), null, 2) }] };
      }
      case "get_identification_types":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("GET", "/v1/identification_types"), null, 2) }] };
      case "get_payment_methods_by_site":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("GET", `/sites/${args?.site_id}/payment_methods`), null, 2) }] };
      case "create_settlement_report":
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("POST", "/v1/account/settlement_report", {
          begin_date: args?.begin_date,
          end_date: args?.end_date,
        }), null, 2) }] };
      case "search_merchant_orders": {
        const params = new URLSearchParams();
        if (args?.status) params.set("status", String(args.status));
        if (args?.preference_id) params.set("preference_id", String(args.preference_id));
        if (args?.external_reference) params.set("external_reference", String(args.external_reference));
        if (args?.application_id) params.set("application_id", String(args.application_id));
        if (args?.payer_id) params.set("payer.id", String(args.payer_id));
        if (args?.sponsor_id) params.set("sponsor.id", String(args.sponsor_id));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await mpRequest("GET", `/merchant_orders/search?${params}`), null, 2) }] };
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
    app.get("/health", (_req: any, res: any) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: any, res: any) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req, res, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-mercado-pago", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
