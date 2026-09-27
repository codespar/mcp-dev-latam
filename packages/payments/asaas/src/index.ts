#!/usr/bin/env node

/**
 * MCP Server for Asaas — Brazilian billing automation platform.
 *
 * Tools:
 * - create_payment: Create a payment (Pix, boleto, or credit card)
 * - get_payment: Get payment details and status
 * - list_payments: List payments with filters
 * - get_pix_qrcode: Get Pix QR code for a payment
 * - get_boleto: Get boleto digitable line and PDF
 * - create_customer: Create a customer
 * - list_customers: List customers
 * - create_subscription: Create a recurring subscription
 * - list_subscriptions: List subscriptions with filters
 * - cancel_subscription: Cancel a subscription by ID
 * - get_balance: Get account balance
 * - create_transfer: Create a bank transfer (Pix out)
 * - get_webhook_events: List webhook events
 * - create_subaccount: Create a subaccount (split)
 * - get_installments: Get installment details for a payment
 * - create_pix_qrcode: Generate PIX QR code for receiving payments
 * - list_transfers: List transfers with filters
 * - create_notification: Create webhook notification config
 * - list_notifications: List notification configs
 * - get_customer: Get customer details by ID
 * - update_payment: Update a pending payment
 * - delete_payment: Delete a payment
 * - refund_payment: Refund a received payment
 * - get_subscription: Get subscription details by ID
 *
 * Environment:
 *   ASAAS_API_KEY — API key from https://www.asaas.com/
 *   ASAAS_SANDBOX — "true" to use sandbox (default: false)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// --- Zod validation helpers ---
const cpfOrCnpjSchema = z.string().regex(/^\d{11}(\d{3})?$/, "Must be a valid CPF (11 digits) or CNPJ (14 digits)");
const emailSchema = z.string().email("Invalid email format");
const positiveAmountSchema = z.number().positive("Amount must be greater than 0");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format");
const cepSchema = z.string().regex(/^\d{8}$/, "CEP must be 8 digits");

function validationError(msg: string) {
  return { content: [{ type: "text" as const, text: `Validation error: ${msg}` }], isError: true as const };
}

const DEMO_MODE = process.argv.includes("--demo") || process.env.MCP_DEMO === "true";

let createPaymentCallCounter = 0;
const installmentLedger = new Map<string, { value: number; installments: number; installmentValue: number; dueDate: string }>();

/**
 * Reset the in-process demo state (call counter + installment ledger).
 *
 * Exported for unit-test isolation — call from `beforeEach` so test
 * order doesn't affect fixture ids or ledger contents. Not part of
 * the MCP wire surface; no production caller invokes it.
 */
export function resetDemoState(): void {
  createPaymentCallCounter = 0;
  installmentLedger.clear();
}

const DEMO_RESPONSES: Record<string, unknown> = {
  get_pix_qrcode: { encodedImage: "data:image/png;base64,iVBOR...(truncated)", payload: "00020126580014br.gov.bcb.pix0136demo-pix-key", expirationDate: "2026-04-15T23:59:59Z" },
  create_customer: { id: "cus_demo_001", name: "João Silva", email: "joao@demo.com", cpfCnpj: "12345678901" },
  get_balance: { balance: 15420.50, statistics: { income: 28500.00, expense: 13079.50 } },
  get_payment: { id: "pay_demo_001", status: "RECEIVED", billingType: "PIX", value: 150.00, customer: "cus_demo_001", dueDate: "2026-04-15" },
  list_payments: { totalCount: 1, data: [{ id: "pay_demo_001", status: "RECEIVED", billingType: "PIX", value: 150.00, customer: "cus_demo_001" }] },
  list_customers: { totalCount: 1, data: [{ id: "cus_demo_001", name: "João Silva", email: "joao@demo.com", cpfCnpj: "12345678901" }] },
  create_subscription: { id: "sub_demo_001", status: "ACTIVE", billingType: "PIX", value: 99.90, cycle: "MONTHLY", nextDueDate: "2026-05-15" },
  create_transfer: { id: "txn_demo_001", value: 500.00, status: "PENDING", pixAddressKey: "demo@pix.com" },
  list_transfers: { totalCount: 1, data: [{ id: "txn_demo_001", value: 500.00, status: "DONE" }] },
};

/**
 * Stateful demo handler for `create_payment`.
 *
 * Issues a distinct fixture id per call within one process. When
 * `billingType: CREDIT_CARD` is paired with `installments`, the response
 * includes `installmentValue = value / installments` (rounded to two
 * decimals) and the same `installments` count, and the call is recorded
 * in `installmentLedger` so a subsequent `get_installments` call against
 * the same id can echo back the matching schedule.
 *
 * Exported for unit-test access; not part of the MCP wire surface.
 */
export function createPaymentDemoResponse(args: any): Record<string, unknown> {
  createPaymentCallCounter += 1;
  const padded = String(createPaymentCallCounter).padStart(3, "0");
  const id = "pay_demo_" + padded;
  const billingType: string = args?.billingType ?? "PIX";
  const value: number = typeof args?.value === "number" ? args.value : 150.00;
  const customer: string = args?.customer ?? "cus_demo_001";
  const dueDate: string = args?.dueDate ?? "2026-04-15";
  // Accept any finite number >= 2 and floor it (so 6.5 → 6). Reject
  // NaN, Infinity, non-numbers, zero, and negatives — those all fall
  // through to the single-payment branch silently rather than crashing
  // the demo.
  const rawInstallments: unknown = args?.installments;
  const installments: number | undefined =
    typeof rawInstallments === "number" && Number.isFinite(rawInstallments) && rawInstallments >= 2
      ? Math.floor(rawInstallments)
      : undefined;

  const base: Record<string, unknown> = {
    id,
    status: "PENDING",
    billingType,
    value,
    customer,
    dueDate,
    invoiceUrl: "https://sandbox.asaas.com/i/" + id,
  };

  if (billingType === "CREDIT_CARD" && installments && value > 0) {
    const installmentValue = Math.round((value / installments) * 100) / 100;
    installmentLedger.set(id, { value, installments, installmentValue, dueDate });
    base.installments = installments;
    base.installmentValue = installmentValue;
  }

  return base;
}

/**
 * Stateful demo handler for `get_installments`.
 *
 * Three paths, evaluated in order:
 *   1. `id` resolves in the in-process ledger (registered by a prior
 *      `createPaymentDemoResponse` call with installment intent) →
 *      echoes back the recorded schedule (one entry per installment,
 *      evenly priced).
 *   2. Otherwise, if `value` + `installments` (>=2, value > 0) are
 *      supplied → preview path: returns a hypothetical schedule
 *      without creating a payment. Lets an agent ask "what would 6x
 *      on R$4.800 look like?" before committing. If `id` was also
 *      supplied but did not resolve (1), the preview path still
 *      runs — graceful degradation rather than failing the call.
 *   3. Otherwise → single-installment fallback so callers without
 *      prior state still get a structured response instead of a
 *      generic placeholder.
 *
 * Exported for unit-test access; not part of the MCP wire surface.
 */
export function getInstallmentsDemoResponse(args: any): Record<string, unknown> {
  const id: string | undefined = typeof args?.id === "string" ? args.id : undefined;
  const previewValue: number | undefined =
    typeof args?.value === "number" && Number.isFinite(args.value) && args.value > 0
      ? args.value
      : undefined;
  const previewInstallments: number | undefined =
    typeof args?.installments === "number" && Number.isFinite(args.installments) && args.installments >= 2
      ? Math.floor(args.installments)
      : undefined;

  if (id) {
    const ledger = installmentLedger.get(id);
    if (ledger) {
      const installments = Array.from({ length: ledger.installments }, (_, i) => ({
        number: i + 1,
        value: ledger.installmentValue,
        dueDate: ledger.dueDate,
        status: "PENDING",
      }));
      return { id, totalValue: ledger.value, installmentCount: ledger.installments, installments };
    }
  }

  if (previewValue !== undefined && previewInstallments !== undefined) {
    const installmentValue = Math.round((previewValue / previewInstallments) * 100) / 100;
    const installments = Array.from({ length: previewInstallments }, (_, i) => ({
      number: i + 1,
      value: installmentValue,
      status: "PREVIEW",
    }));
    return {
      preview: true,
      totalValue: previewValue,
      installmentCount: previewInstallments,
      installmentValue,
      installments,
    };
  }

  return {
    id: id ?? "pay_demo_001",
    totalValue: 150.00,
    installmentCount: 1,
    installments: [{ number: 1, value: 150.00, dueDate: "2026-04-15", status: "PENDING" }],
  };
}

const API_KEY = process.env.ASAAS_API_KEY || "";
const BASE_URL = process.env.ASAAS_BASE_URL || (process.env.ASAAS_SANDBOX === "true"
  ? "https://sandbox.asaas.com/api/v3"
  : "https://api.asaas.com/v3");

async function asaasRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "access_token": API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Asaas API ${res.status}: ${err}`);
  }
  return res.json();
}

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new Server(
  { name: "mcp-asaas", version: "0.1.0" },
  { capabilities: { tools: {} }, instructions: MANAGED_TIER_HINT }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_payment",
      description: "Create a payment in Asaas (Pix, boleto, or credit card). Pass `installments` (>=2) with `billingType: CREDIT_CARD` to split the value into equal monthly installments.",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Customer ID (cus_xxx)" },
          billingType: { type: "string", enum: ["BOLETO", "CREDIT_CARD", "PIX"], description: "Payment method" },
          value: { type: "number", description: "Total amount in BRL" },
          dueDate: { type: "string", description: "Due date of the first installment (YYYY-MM-DD)" },
          description: { type: "string", description: "Payment description" },
          installments: { type: "number", minimum: 2, description: "Number of equal installments (>=2). Only valid with billingType: CREDIT_CARD." },
        },
        required: ["customer", "billingType", "value", "dueDate"],
      },
    },
    {
      name: "get_payment",
      description: "Get payment details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payment ID (pay_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_payments",
      description: "List payments with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Filter by customer ID" },
          status: { type: "string", enum: ["PENDING", "RECEIVED", "CONFIRMED", "OVERDUE", "REFUNDED"], description: "Filter by status" },
          limit: { type: "number", description: "Number of results (default 10)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "get_pix_qrcode",
      description: "Get Pix QR code for a payment (returns payload and image)",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payment ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_boleto",
      description: "Get boleto digitable line and barcode for a payment",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payment ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_customer",
      description: "Create a customer in Asaas",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer name" },
          cpfCnpj: { type: "string", description: "CPF or CNPJ (numbers only)" },
          email: { type: "string", description: "Email address" },
          phone: { type: "string", description: "Phone number" },
        },
        required: ["name", "cpfCnpj"],
      },
    },
    {
      name: "list_customers",
      description: "List customers with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Filter by name" },
          cpfCnpj: { type: "string", description: "Filter by CPF/CNPJ" },
          limit: { type: "number", description: "Number of results" },
        },
      },
    },
    {
      name: "create_subscription",
      description: "Create a recurring subscription",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Customer ID" },
          billingType: { type: "string", enum: ["BOLETO", "CREDIT_CARD", "PIX"], description: "Payment method" },
          value: { type: "number", description: "Amount per cycle" },
          cycle: { type: "string", enum: ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUALLY", "YEARLY"], description: "Billing cycle" },
          nextDueDate: { type: "string", description: "First due date (YYYY-MM-DD)" },
          description: { type: "string", description: "Subscription description" },
        },
        required: ["customer", "billingType", "value", "cycle", "nextDueDate"],
      },
    },
    {
      name: "get_balance",
      description: "Get current account balance",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_subscriptions",
      description: "List subscriptions with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Filter by customer ID" },
          status: { type: "string", enum: ["ACTIVE", "INACTIVE", "EXPIRED"], description: "Filter by status" },
          limit: { type: "number", description: "Number of results (default 10)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "cancel_subscription",
      description: "Cancel a subscription by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Subscription ID (sub_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_webhook_events",
      description: "List webhook events (payment confirmations, transfers, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          event: { type: "string", description: "Filter by event type (e.g. PAYMENT_CONFIRMED, PAYMENT_RECEIVED)" },
          limit: { type: "number", description: "Number of results (default 10)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "create_subaccount",
      description: "Create a subaccount for payment splitting",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Subaccount name" },
          email: { type: "string", description: "Email address" },
          cpfCnpj: { type: "string", description: "CPF or CNPJ (numbers only)" },
          companyType: { type: "string", enum: ["MEI", "LIMITED", "INDIVIDUAL", "ASSOCIATION"], description: "Company type" },
          phone: { type: "string", description: "Phone number" },
          mobilePhone: { type: "string", description: "Mobile phone number" },
          postalCode: { type: "string", description: "Postal code (CEP)" },
          address: { type: "string", description: "Street address" },
          addressNumber: { type: "string", description: "Address number" },
          province: { type: "string", description: "Neighborhood" },
        },
        required: ["name", "email", "cpfCnpj"],
      },
    },
    {
      name: "get_installments",
      description: "Get installment details. Pass `id` to look up an existing payment's installment schedule, OR pass `value` + `installments` (>=2) to preview a hypothetical schedule without creating a payment. If both are supplied, the `id` look-up runs first; when the id resolves to a recorded schedule it wins, otherwise the preview path is attempted with `value` + `installments`.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payment ID (pay_xxx) — look-up path" },
          value: { type: "number", description: "Total amount in BRL — preview path" },
          installments: { type: "number", minimum: 2, description: "Number of equal installments (>=2) — preview path" },
        },
      },
    },
    {
      name: "create_transfer",
      description: "Create a bank transfer (Pix out or TED)",
      inputSchema: {
        type: "object",
        properties: {
          value: { type: "number", description: "Amount in BRL" },
          pixAddressKey: { type: "string", description: "Pix key (CPF, email, phone, or random)" },
          pixAddressKeyType: { type: "string", enum: ["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"], description: "Pix key type" },
          description: { type: "string", description: "Transfer description" },
        },
        required: ["value"],
      },
    },
    {
      name: "create_pix_qrcode",
      description: "Generate a static PIX QR code for receiving payments",
      inputSchema: {
        type: "object",
        properties: {
          addressKey: { type: "string", description: "Pix key to receive payment" },
          description: { type: "string", description: "QR code description" },
          value: { type: "number", description: "Fixed amount (omit for open value)" },
          format: { type: "string", enum: ["ALL", "IMAGE", "PAYLOAD"], description: "Response format" },
          expirationDate: { type: "string", description: "Expiration date (YYYY-MM-DD)" },
          expirationSeconds: { type: "number", description: "Expiration in seconds" },
          allowsMultiplePayments: { type: "boolean", description: "Whether multiple payments are allowed" },
        },
        required: ["addressKey"],
      },
    },
    {
      name: "list_transfers",
      description: "List transfers with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["BANK_ACCOUNT_TRANSFER", "ASAAS_ACCOUNT_TRANSFER"], description: "Filter by transfer type" },
          status: { type: "string", enum: ["PENDING", "BANK_PROCESSING", "DONE", "CANCELLED", "FAILED"], description: "Filter by status" },
          limit: { type: "number", description: "Number of results (default 10)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "create_notification",
      description: "Create a webhook notification configuration",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Webhook URL to receive notifications" },
          email: { type: "string", description: "Email for notifications" },
          enabled: { type: "boolean", description: "Whether the notification is enabled" },
          interrupted: { type: "boolean", description: "Whether the notification is interrupted" },
          apiVersion: { type: "number", description: "API version (3)" },
          authToken: { type: "string", description: "Authentication token for webhook validation" },
        },
        required: ["url", "enabled"],
      },
    },
    {
      name: "list_notifications",
      description: "List webhook notification configurations",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (default 10)" },
          offset: { type: "number", description: "Pagination offset" },
        },
      },
    },
    {
      name: "get_customer",
      description: "Get customer details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Customer ID (cus_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "update_payment",
      description: "Update a pending payment",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payment ID (pay_xxx)" },
          value: { type: "number", description: "Updated amount in BRL" },
          dueDate: { type: "string", description: "Updated due date (YYYY-MM-DD)" },
          description: { type: "string", description: "Updated description" },
        },
        required: ["id"],
      },
    },
    {
      name: "delete_payment",
      description: "Delete a payment by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payment ID (pay_xxx)" },
        },
        required: ["id"],
      },
    },
    {
      name: "refund_payment",
      description: "Refund a received payment",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Payment ID (pay_xxx)" },
          value: { type: "number", description: "Refund amount (omit for full refund)" },
          description: { type: "string", description: "Refund reason" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_subscription",
      description: "Get subscription details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Subscription ID (sub_xxx)" },
        },
        required: ["id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (DEMO_MODE) {
    if (name === "create_payment") {
      return { content: [{ type: "text", text: JSON.stringify(createPaymentDemoResponse(args), null, 2) }] };
    }
    if (name === "get_installments") {
      return { content: [{ type: "text", text: JSON.stringify(getInstallmentsDemoResponse(args), null, 2) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(DEMO_RESPONSES[name] || { demo: true, tool: name }, null, 2) }] };
  }

  // --- Input validation ---
  try {
    if (name === "create_payment") {
      const r = positiveAmountSchema.safeParse(args?.value);
      if (!r.success) return validationError(r.error.issues[0].message);
      if (args?.dueDate) {
        const d = dateSchema.safeParse(args.dueDate);
        if (!d.success) return validationError(d.error.issues[0].message);
      }
    }
    if (name === "create_customer") {
      if (args?.cpfCnpj) {
        const r = cpfOrCnpjSchema.safeParse(args.cpfCnpj);
        if (!r.success) return validationError(r.error.issues[0].message);
      }
      if (args?.email) {
        const r = emailSchema.safeParse(args.email);
        if (!r.success) return validationError(r.error.issues[0].message);
      }
    }
    if (name === "create_subscription") {
      const r = positiveAmountSchema.safeParse(args?.value);
      if (!r.success) return validationError(r.error.issues[0].message);
      if (args?.nextDueDate) {
        const d = dateSchema.safeParse(args.nextDueDate);
        if (!d.success) return validationError(d.error.issues[0].message);
      }
    }
    if (name === "create_subaccount") {
      if (args?.cpfCnpj) {
        const r = cpfOrCnpjSchema.safeParse(args.cpfCnpj);
        if (!r.success) return validationError(r.error.issues[0].message);
      }
      if (args?.email) {
        const r = emailSchema.safeParse(args.email);
        if (!r.success) return validationError(r.error.issues[0].message);
      }
      if (args?.postalCode) {
        const r = cepSchema.safeParse(args.postalCode);
        if (!r.success) return validationError(r.error.issues[0].message);
      }
    }
    if (name === "create_transfer") {
      const r = positiveAmountSchema.safeParse(args?.value);
      if (!r.success) return validationError(r.error.issues[0].message);
    }
  } catch (e) {
    // Validation should not block — fall through on unexpected errors
  }

  try {
    switch (name) {
      case "create_payment":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("POST", "/payments", args), null, 2) }] };
      case "get_payment":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("GET", `/payments/${args?.id}`), null, 2) }] };
      case "list_payments": {
        const params = new URLSearchParams();
        if (args?.customer) params.set("customer", String(args.customer));
        if (args?.status) params.set("status", String(args.status));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("GET", `/payments?${params}`), null, 2) }] };
      }
      case "get_pix_qrcode":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("GET", `/payments/${args?.id}/pixQrCode`), null, 2) }] };
      case "get_boleto":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("GET", `/payments/${args?.id}/identificationField`), null, 2) }] };
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("POST", "/customers", args), null, 2) }] };
      case "list_customers": {
        const params = new URLSearchParams();
        if (args?.name) params.set("name", String(args.name));
        if (args?.cpfCnpj) params.set("cpfCnpj", String(args.cpfCnpj));
        if (args?.limit) params.set("limit", String(args.limit));
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("GET", `/customers?${params}`), null, 2) }] };
      }
      case "create_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("POST", "/subscriptions", args), null, 2) }] };
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("GET", "/finance/balance"), null, 2) }] };
      case "list_subscriptions": {
        const params = new URLSearchParams();
        if (args?.customer) params.set("customer", String(args.customer));
        if (args?.status) params.set("status", String(args.status));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("GET", `/subscriptions?${params}`), null, 2) }] };
      }
      case "cancel_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("DELETE", `/subscriptions/${args?.id}`), null, 2) }] };
      case "get_webhook_events": {
        const params = new URLSearchParams();
        if (args?.event) params.set("event", String(args.event));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("GET", `/webhook/events?${params}`), null, 2) }] };
      }
      case "create_subaccount":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("POST", "/accounts", args), null, 2) }] };
      case "get_installments":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("GET", `/payments/${args?.id}/installments`), null, 2) }] };
      case "create_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("POST", "/transfers", args), null, 2) }] };
      case "create_pix_qrcode":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("POST", "/pix/qrCodes/static", args), null, 2) }] };
      case "list_transfers": {
        const params = new URLSearchParams();
        if (args?.type) params.set("type", String(args.type));
        if (args?.status) params.set("status", String(args.status));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("GET", `/transfers?${params}`), null, 2) }] };
      }
      case "create_notification":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("POST", "/webhook", args), null, 2) }] };
      case "list_notifications": {
        const params = new URLSearchParams();
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.offset) params.set("offset", String(args.offset));
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("GET", `/webhook?${params}`), null, 2) }] };
      }
      case "get_customer":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("GET", `/customers/${args?.id}`), null, 2) }] };
      case "update_payment": {
        const { id, ...updateBody } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("PUT", `/payments/${id}`, updateBody), null, 2) }] };
      }
      case "delete_payment":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("DELETE", `/payments/${args?.id}`), null, 2) }] };
      case "refund_payment":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("POST", `/payments/${args?.id}/refund`, args?.value ? { value: args.value, description: args?.description } : undefined), null, 2) }] };
      case "get_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await asaasRequest("GET", `/subscriptions/${args?.id}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-asaas", version: "0.1.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
