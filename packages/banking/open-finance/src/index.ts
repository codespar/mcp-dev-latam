#!/usr/bin/env node

/**
 * MCP Server for Open Finance Brasil — open banking standard.
 *
 * Tools:
 * - list_accounts: List customer accounts
 * - get_account_balance: Get account balance
 * - list_transactions: List account transactions
 * - get_account_overdraft_limits: Get account overdraft limits
 * - get_consent: Get consent details
 * - create_consent: Create a new consent request
 * - revoke_consent: Revoke an existing consent
 * - list_credit_cards: List credit card accounts
 * - get_credit_card_bills: Get credit card bills
 * - get_credit_card_transactions: Get credit card transactions
 * - list_loans: List loan contracts
 * - get_loan_payments: Get loan payment schedule
 * - list_financings: List financing contracts
 * - list_investments: List investment products
 * - create_payment_consent: Create payment-initiation consent
 * - create_payment: Initiate a payment
 * - get_personal_qualifications: Get personal customer qualifications
 * - get_business_qualifications: Get business customer qualifications
 *
 * Environment:
 *   OPEN_FINANCE_BASE_URL — Institution API base URL
 *   OPEN_FINANCE_CLIENT_ID — OAuth2 client ID
 *   OPEN_FINANCE_CLIENT_SECRET — OAuth2 client secret
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = process.env.OPEN_FINANCE_BASE_URL || "";
const CLIENT_ID = process.env.OPEN_FINANCE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.OPEN_FINANCE_CLIENT_SECRET || "";

let accessToken = "";
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const res = await fetch(`${BASE_URL}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "openid accounts credit-cards-accounts resources consents investments loans financings customers payments",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Open Finance OAuth ${res.status}: ${err}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

async function openFinanceRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Open Finance API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-open-finance", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_accounts",
      description: "List customer bank accounts via Open Finance",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Consent ID (required for data access)" },
          page: { type: "number", description: "Page number" },
          pageSize: { type: "number", description: "Items per page" },
        },
        required: ["consentId"],
      },
    },
    {
      name: "get_account_balance",
      description: "Get account balance via Open Finance",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Consent ID" },
          accountId: { type: "string", description: "Account ID" },
        },
        required: ["consentId", "accountId"],
      },
    },
    {
      name: "list_transactions",
      description: "List account transactions via Open Finance",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Consent ID" },
          accountId: { type: "string", description: "Account ID" },
          fromDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
          toDate: { type: "string", description: "End date (YYYY-MM-DD)" },
          page: { type: "number", description: "Page number" },
          pageSize: { type: "number", description: "Items per page" },
        },
        required: ["consentId", "accountId"],
      },
    },
    {
      name: "get_account_overdraft_limits",
      description: "Get account overdraft (limites) via Open Finance",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Consent ID" },
          accountId: { type: "string", description: "Account ID" },
        },
        required: ["consentId", "accountId"],
      },
    },
    {
      name: "get_consent",
      description: "Get consent details by ID",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Consent ID" },
        },
        required: ["consentId"],
      },
    },
    {
      name: "create_consent",
      description: "Create a new consent request for data access",
      inputSchema: {
        type: "object",
        properties: {
          permissions: {
            type: "array",
            description: "Requested permissions (e.g., ACCOUNTS_READ, ACCOUNTS_BALANCES_READ, ACCOUNTS_TRANSACTIONS_READ)",
            items: { type: "string" },
          },
          expirationDateTime: { type: "string", description: "Consent expiration (ISO 8601)" },
          transactionFromDateTime: { type: "string", description: "Transaction data start (ISO 8601)" },
          transactionToDateTime: { type: "string", description: "Transaction data end (ISO 8601)" },
        },
        required: ["permissions", "expirationDateTime"],
      },
    },
    {
      name: "revoke_consent",
      description: "Revoke an existing consent (data or payment)",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Consent ID to revoke" },
          consentType: { type: "string", enum: ["data", "payment"], description: "Consent type (default: data)" },
        },
        required: ["consentId"],
      },
    },
    {
      name: "list_credit_cards",
      description: "List credit card accounts via Open Finance",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Consent ID" },
          page: { type: "number", description: "Page number" },
          pageSize: { type: "number", description: "Items per page" },
        },
        required: ["consentId"],
      },
    },
    {
      name: "get_credit_card_bills",
      description: "Get credit card bills (faturas) via Open Finance",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Consent ID" },
          creditCardAccountId: { type: "string", description: "Credit card account ID" },
          fromDueDate: { type: "string", description: "Start due date (YYYY-MM-DD)" },
          toDueDate: { type: "string", description: "End due date (YYYY-MM-DD)" },
          page: { type: "number", description: "Page number" },
          pageSize: { type: "number", description: "Items per page" },
        },
        required: ["consentId", "creditCardAccountId"],
      },
    },
    {
      name: "get_credit_card_transactions",
      description: "Get credit card transactions via Open Finance",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Consent ID" },
          creditCardAccountId: { type: "string", description: "Credit card account ID" },
          fromDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
          toDate: { type: "string", description: "End date (YYYY-MM-DD)" },
          page: { type: "number", description: "Page number" },
          pageSize: { type: "number", description: "Items per page" },
        },
        required: ["consentId", "creditCardAccountId"],
      },
    },
    {
      name: "list_loans",
      description: "List loan contracts (empréstimos) via Open Finance",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Consent ID" },
          page: { type: "number", description: "Page number" },
          pageSize: { type: "number", description: "Items per page" },
        },
        required: ["consentId"],
      },
    },
    {
      name: "get_loan_payments",
      description: "Get loan payment schedule via Open Finance",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Consent ID" },
          contractId: { type: "string", description: "Loan contract ID" },
          page: { type: "number", description: "Page number" },
          pageSize: { type: "number", description: "Items per page" },
        },
        required: ["consentId", "contractId"],
      },
    },
    {
      name: "list_financings",
      description: "List financing contracts (financiamentos) via Open Finance",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Consent ID" },
          page: { type: "number", description: "Page number" },
          pageSize: { type: "number", description: "Items per page" },
        },
        required: ["consentId"],
      },
    },
    {
      name: "list_investments",
      description: "List investment products via Open Finance",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Consent ID" },
          investmentType: { type: "string", enum: ["BANK_FIXED_INCOMES", "CREDIT_FIXED_INCOMES", "VARIABLE_INCOMES", "TREASURE_TITLES", "FUNDS"], description: "Investment type filter" },
          page: { type: "number", description: "Page number" },
          pageSize: { type: "number", description: "Items per page" },
        },
        required: ["consentId"],
      },
    },
    {
      name: "create_payment_consent",
      description: "Create payment-initiation consent (e.g., PIX) via Open Finance",
      inputSchema: {
        type: "object",
        properties: {
          loggedUserCpf: { type: "string", description: "Logged user CPF" },
          creditorName: { type: "string", description: "Creditor name" },
          creditorCpfCnpj: { type: "string", description: "Creditor CPF/CNPJ" },
          paymentAmount: { type: "string", description: "Payment amount (e.g., '100.00')" },
          paymentCurrency: { type: "string", description: "ISO 4217 currency (default: BRL)" },
          localInstrument: { type: "string", enum: ["MANU", "DICT", "QRDN", "QRES", "INIC"], description: "PIX local instrument (default: DICT)" },
          paymentType: { type: "string", enum: ["PIX", "TED", "TEF", "BOLETO"], description: "Payment type (default: PIX)" },
          expirationDateTime: { type: "string", description: "Consent expiration (ISO 8601)" },
        },
        required: ["loggedUserCpf", "creditorName", "creditorCpfCnpj", "paymentAmount"],
      },
    },
    {
      name: "create_payment",
      description: "Initiate a payment using an authorized payment consent",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Authorized payment consent ID" },
          creditorAccountIspb: { type: "string", description: "Creditor account ISPB" },
          creditorAccountIssuer: { type: "string", description: "Creditor account issuer (agência)" },
          creditorAccountNumber: { type: "string", description: "Creditor account number" },
          creditorAccountType: { type: "string", enum: ["CACC", "SLRY", "SVGS", "TRAN"], description: "Creditor account type" },
          paymentAmount: { type: "string", description: "Payment amount (e.g., '100.00')" },
          paymentCurrency: { type: "string", description: "ISO 4217 currency (default: BRL)" },
          remittanceInformation: { type: "string", description: "Free-text remittance info" },
          qrCode: { type: "string", description: "PIX QR Code payload (optional)" },
          proxy: { type: "string", description: "PIX key/proxy (optional)" },
        },
        required: ["consentId", "creditorAccountIspb", "creditorAccountIssuer", "creditorAccountNumber", "creditorAccountType", "paymentAmount"],
      },
    },
    {
      name: "get_personal_qualifications",
      description: "Get personal customer qualifications (income, occupation) via Open Finance",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Consent ID" },
        },
        required: ["consentId"],
      },
    },
    {
      name: "get_business_qualifications",
      description: "Get business customer qualifications via Open Finance",
      inputSchema: {
        type: "object",
        properties: {
          consentId: { type: "string", description: "Consent ID" },
        },
        required: ["consentId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = rawArgs as Record<string, unknown> | undefined;

  try {
    switch (name) {
      case "list_accounts": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.pageSize) params.set("page-size", String(args.pageSize));
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("GET", `/open-banking/accounts/v2/accounts?${params}`), null, 2) }] };
      }
      case "get_account_balance":
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("GET", `/open-banking/accounts/v2/accounts/${args?.accountId}/balances`), null, 2) }] };
      case "list_transactions": {
        const params = new URLSearchParams();
        if (args?.fromDate) params.set("fromBookingDate", String(args.fromDate));
        if (args?.toDate) params.set("toBookingDate", String(args.toDate));
        if (args?.page) params.set("page", String(args.page));
        if (args?.pageSize) params.set("page-size", String(args.pageSize));
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("GET", `/open-banking/accounts/v2/accounts/${args?.accountId}/transactions?${params}`), null, 2) }] };
      }
      case "get_account_overdraft_limits":
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("GET", `/open-banking/accounts/v2/accounts/${args?.accountId}/overdraft-limits`), null, 2) }] };
      case "get_consent":
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("GET", `/open-banking/consents/v2/consents/${args?.consentId}`), null, 2) }] };
      case "create_consent": {
        const payload = {
          data: {
            permissions: args?.permissions,
            expirationDateTime: args?.expirationDateTime,
            transactionFromDateTime: args?.transactionFromDateTime,
            transactionToDateTime: args?.transactionToDateTime,
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("POST", "/open-banking/consents/v2/consents", payload), null, 2) }] };
      }
      case "revoke_consent": {
        const consentType = (args?.consentType as string) || "data";
        const path = consentType === "payment"
          ? `/open-banking/payments/v3/consents/${args?.consentId}`
          : `/open-banking/consents/v2/consents/${args?.consentId}`;
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("DELETE", path), null, 2) }] };
      }
      case "list_credit_cards": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.pageSize) params.set("page-size", String(args.pageSize));
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("GET", `/open-banking/credit-cards-accounts/v2/accounts?${params}`), null, 2) }] };
      }
      case "get_credit_card_bills": {
        const params = new URLSearchParams();
        if (args?.fromDueDate) params.set("fromDueDate", String(args.fromDueDate));
        if (args?.toDueDate) params.set("toDueDate", String(args.toDueDate));
        if (args?.page) params.set("page", String(args.page));
        if (args?.pageSize) params.set("page-size", String(args.pageSize));
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("GET", `/open-banking/credit-cards-accounts/v2/accounts/${args?.creditCardAccountId}/bills?${params}`), null, 2) }] };
      }
      case "get_credit_card_transactions": {
        const params = new URLSearchParams();
        if (args?.fromDate) params.set("fromTransactionDate", String(args.fromDate));
        if (args?.toDate) params.set("toTransactionDate", String(args.toDate));
        if (args?.page) params.set("page", String(args.page));
        if (args?.pageSize) params.set("page-size", String(args.pageSize));
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("GET", `/open-banking/credit-cards-accounts/v2/accounts/${args?.creditCardAccountId}/transactions?${params}`), null, 2) }] };
      }
      case "list_loans": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.pageSize) params.set("page-size", String(args.pageSize));
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("GET", `/open-banking/loans/v2/contracts?${params}`), null, 2) }] };
      }
      case "get_loan_payments": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.pageSize) params.set("page-size", String(args.pageSize));
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("GET", `/open-banking/loans/v2/contracts/${args?.contractId}/payments?${params}`), null, 2) }] };
      }
      case "list_financings": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.pageSize) params.set("page-size", String(args.pageSize));
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("GET", `/open-banking/financings/v2/contracts?${params}`), null, 2) }] };
      }
      case "list_investments": {
        const investmentType = (args?.investmentType as string) || "BANK_FIXED_INCOMES";
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.pageSize) params.set("page-size", String(args.pageSize));
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("GET", `/open-banking/investments/v1/${investmentType.toLowerCase().replace(/_/g, "-")}?${params}`), null, 2) }] };
      }
      case "create_payment_consent": {
        const payload = {
          data: {
            loggedUser: { document: { identification: args?.loggedUserCpf, rel: "CPF" } },
            creditor: {
              personType: String(args?.creditorCpfCnpj).length > 11 ? "PESSOA_JURIDICA" : "PESSOA_NATURAL",
              cpfCnpj: args?.creditorCpfCnpj,
              name: args?.creditorName,
            },
            payment: {
              type: (args?.paymentType as string) || "PIX",
              currency: (args?.paymentCurrency as string) || "BRL",
              amount: args?.paymentAmount,
              details: { localInstrument: (args?.localInstrument as string) || "DICT" },
            },
            expirationDateTime: args?.expirationDateTime,
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("POST", "/open-banking/payments/v3/consents", payload), null, 2) }] };
      }
      case "create_payment": {
        const payload = {
          data: {
            consentId: args?.consentId,
            creditorAccount: {
              ispb: args?.creditorAccountIspb,
              issuer: args?.creditorAccountIssuer,
              number: args?.creditorAccountNumber,
              accountType: args?.creditorAccountType,
            },
            payment: {
              currency: (args?.paymentCurrency as string) || "BRL",
              amount: args?.paymentAmount,
            },
            remittanceInformation: args?.remittanceInformation,
            qrCode: args?.qrCode,
            proxy: args?.proxy,
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("POST", "/open-banking/payments/v3/pix/payments", payload), null, 2) }] };
      }
      case "get_personal_qualifications":
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("GET", "/open-banking/customers/v2/personal/qualifications"), null, 2) }] };
      case "get_business_qualifications":
        return { content: [{ type: "text", text: JSON.stringify(await openFinanceRequest("GET", "/open-banking/customers/v2/business/qualifications"), null, 2) }] };
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
        const s = new Server({ name: "mcp-open-finance", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
