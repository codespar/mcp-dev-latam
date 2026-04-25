#!/usr/bin/env node

/**
 * MCP Server for QuickBooks Online (Intuit).
 *
 * QuickBooks is the most-used small-business accounting platform in the US/UK
 * and the global default for SMB ERP. LatAm SaaS companies that invoice
 * international customers — or subsidiaries of US parent companies — almost
 * universally keep their books in QuickBooks, which is why this belongs in
 * the catalog alongside BR/LatAm ERPs (Omie, Conta Azul, Alegra, Bling, Tiny).
 *
 * Tools (22):
 *   create_customer               — POST /customer
 *   update_customer               — POST /customer (sparse update)
 *   get_customer                  — GET /customer/{id}
 *   list_customers                — query SELECT * FROM Customer
 *   create_invoice                — POST /invoice
 *   update_invoice                — POST /invoice (sparse update)
 *   void_invoice                  — POST /invoice?operation=void
 *   delete_invoice                — POST /invoice?operation=delete
 *   get_invoice                   — GET /invoice/{id}
 *   send_invoice                  — POST /invoice/{id}/send
 *   create_payment                — POST /payment
 *   get_payment                   — GET /payment/{id}
 *   create_item                   — POST /item
 *   list_items                    — query SELECT * FROM Item
 *   create_bill                   — POST /bill
 *   list_bills                    — query SELECT * FROM Bill
 *   create_vendor                 — POST /vendor
 *   list_vendors                  — query SELECT * FROM Vendor
 *   create_estimate               — POST /estimate
 *   create_sales_receipt          — POST /salesreceipt
 *   list_accounts                 — query SELECT * FROM Account
 *   get_profit_and_loss_report    — GET /reports/ProfitAndLoss
 *
 * Authentication
 *   OAuth2 authorization_code flow. Access tokens expire in 1hr; refresh
 *   tokens last 100 days. This server assumes a valid QB_ACCESS_TOKEN is
 *   already issued — token acquisition/refresh belong in your agent's
 *   credential manager, not in the MCP scaffold.
 *
 * Environment
 *   QB_ACCESS_TOKEN    OAuth2 bearer token (required, secret)
 *   QB_REALM_ID        company id / realmId (required)
 *   QB_ENV             'sandbox' (default) | 'production'
 *   QB_MINOR_VERSION   API minor version (default '70')
 *
 * Docs: https://developer.intuit.com/app/developer/qbo/docs/api
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ACCESS_TOKEN = process.env.QB_ACCESS_TOKEN || "";
const REALM_ID = process.env.QB_REALM_ID || "";
const QB_ENV = (process.env.QB_ENV || "sandbox").toLowerCase();
const MINOR_VERSION = process.env.QB_MINOR_VERSION || "70";

const BASE_URL =
  QB_ENV === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";

async function qbRequest(
  method: string,
  path: string,
  body?: unknown,
  opts: { query?: Record<string, string | number | undefined> } = {}
): Promise<unknown> {
  const params = new URLSearchParams();
  params.set("minorversion", MINOR_VERSION);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    }
  }
  const url = `${BASE_URL}/v3/company/${REALM_ID}${path}?${params.toString()}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
      "Accept": "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`QuickBooks API ${res.status}: ${await res.text()}`);
  }
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const server = new Server(
  { name: "mcp-quickbooks", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_customer",
      description: "Create a customer in QuickBooks Online. DisplayName is required and must be unique.",
      inputSchema: {
        type: "object",
        properties: {
          DisplayName: { type: "string", description: "Unique display name" },
          GivenName: { type: "string" },
          FamilyName: { type: "string" },
          CompanyName: { type: "string" },
          PrimaryEmailAddr: {
            type: "object",
            properties: { Address: { type: "string" } },
          },
          PrimaryPhone: {
            type: "object",
            properties: { FreeFormNumber: { type: "string" } },
          },
          BillAddr: {
            type: "object",
            description: "Billing address",
            properties: {
              Line1: { type: "string" },
              City: { type: "string" },
              CountrySubDivisionCode: { type: "string", description: "State/province code" },
              PostalCode: { type: "string" },
              Country: { type: "string" },
            },
          },
        },
        required: ["DisplayName"],
      },
    },
    {
      name: "update_customer",
      description: "Update a customer. QBO uses sparse update: pass Id, SyncToken, sparse=true, plus any fields to change.",
      inputSchema: {
        type: "object",
        properties: {
          Id: { type: "string", description: "Customer.Id" },
          SyncToken: { type: "string", description: "Current SyncToken from the customer record" },
          sparse: { type: "boolean", description: "Set true to sparse-update (recommended)" },
          DisplayName: { type: "string" },
          GivenName: { type: "string" },
          FamilyName: { type: "string" },
          CompanyName: { type: "string" },
          Active: { type: "boolean" },
          PrimaryEmailAddr: {
            type: "object",
            properties: { Address: { type: "string" } },
          },
          PrimaryPhone: {
            type: "object",
            properties: { FreeFormNumber: { type: "string" } },
          },
          BillAddr: {
            type: "object",
            properties: {
              Line1: { type: "string" },
              City: { type: "string" },
              CountrySubDivisionCode: { type: "string" },
              PostalCode: { type: "string" },
              Country: { type: "string" },
            },
          },
        },
        required: ["Id", "SyncToken"],
      },
    },
    {
      name: "get_customer",
      description: "Retrieve a customer by QuickBooks entity id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "QuickBooks Customer.Id" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_customers",
      description: "Query customers using QBO's SQL-like query language. Example: \"SELECT * FROM Customer WHERE Active = true MAXRESULTS 50\". If query is omitted, returns all customers.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "QBO query string. Default: 'SELECT * FROM Customer'",
          },
        },
      },
    },
    {
      name: "create_invoice",
      description: "Create an invoice. CustomerRef and at least one Line item (SalesItemLineDetail with ItemRef) are required.",
      inputSchema: {
        type: "object",
        properties: {
          CustomerRef: {
            type: "object",
            properties: { value: { type: "string", description: "Customer.Id" } },
            required: ["value"],
          },
          Line: {
            type: "array",
            description: "Invoice line items",
            items: {
              type: "object",
              properties: {
                Amount: { type: "number" },
                DetailType: { type: "string", description: "Typically 'SalesItemLineDetail'" },
                Description: { type: "string" },
                SalesItemLineDetail: {
                  type: "object",
                  properties: {
                    ItemRef: {
                      type: "object",
                      properties: { value: { type: "string", description: "Item.Id" } },
                    },
                    Qty: { type: "number" },
                    UnitPrice: { type: "number" },
                  },
                },
              },
            },
          },
          TxnDate: { type: "string", description: "Transaction date (YYYY-MM-DD)" },
          DueDate: { type: "string", description: "Due date (YYYY-MM-DD)" },
          CurrencyRef: {
            type: "object",
            properties: { value: { type: "string", description: "ISO-4217 (e.g. USD, BRL)" } },
          },
          BillEmail: {
            type: "object",
            properties: { Address: { type: "string" } },
          },
          PrivateNote: { type: "string" },
          CustomerMemo: {
            type: "object",
            properties: { value: { type: "string" } },
          },
        },
        required: ["CustomerRef", "Line"],
      },
    },
    {
      name: "update_invoice",
      description: "Update an invoice. QBO uses sparse update: pass Id, SyncToken, sparse=true, plus any fields to change.",
      inputSchema: {
        type: "object",
        properties: {
          Id: { type: "string", description: "Invoice.Id" },
          SyncToken: { type: "string", description: "Current SyncToken from the invoice record" },
          sparse: { type: "boolean", description: "Set true to sparse-update (recommended)" },
          TxnDate: { type: "string", description: "Transaction date (YYYY-MM-DD)" },
          DueDate: { type: "string", description: "Due date (YYYY-MM-DD)" },
          CustomerMemo: {
            type: "object",
            properties: { value: { type: "string" } },
          },
          PrivateNote: { type: "string" },
          BillEmail: {
            type: "object",
            properties: { Address: { type: "string" } },
          },
          Line: {
            type: "array",
            description: "Full Line array replaces existing lines (even with sparse=true for Line).",
            items: { type: "object" },
          },
        },
        required: ["Id", "SyncToken"],
      },
    },
    {
      name: "void_invoice",
      description: "Void an invoice. The invoice stays in QBO with zero amount. Requires Id and SyncToken.",
      inputSchema: {
        type: "object",
        properties: {
          Id: { type: "string", description: "Invoice.Id" },
          SyncToken: { type: "string", description: "Current SyncToken" },
        },
        required: ["Id", "SyncToken"],
      },
    },
    {
      name: "delete_invoice",
      description: "Delete an invoice. Permanently removes the invoice. Requires Id and SyncToken.",
      inputSchema: {
        type: "object",
        properties: {
          Id: { type: "string", description: "Invoice.Id" },
          SyncToken: { type: "string", description: "Current SyncToken" },
        },
        required: ["Id", "SyncToken"],
      },
    },
    {
      name: "get_invoice",
      description: "Retrieve an invoice by QuickBooks entity id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "QuickBooks Invoice.Id" },
        },
        required: ["id"],
      },
    },
    {
      name: "send_invoice",
      description: "Email an invoice to the customer. If sendTo is omitted, uses BillEmail on the invoice.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "QuickBooks Invoice.Id" },
          sendTo: { type: "string", description: "Optional override email address" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_payment",
      description: "Record a customer payment against one or more invoices. TotalAmt and CustomerRef are required.",
      inputSchema: {
        type: "object",
        properties: {
          CustomerRef: {
            type: "object",
            properties: { value: { type: "string", description: "Customer.Id" } },
            required: ["value"],
          },
          TotalAmt: { type: "number", description: "Payment amount" },
          CurrencyRef: {
            type: "object",
            properties: { value: { type: "string", description: "ISO-4217" } },
          },
          PaymentMethodRef: {
            type: "object",
            properties: { value: { type: "string", description: "PaymentMethod.Id" } },
          },
          TxnDate: { type: "string", description: "Payment date (YYYY-MM-DD)" },
          Line: {
            type: "array",
            description: "Invoice allocations",
            items: {
              type: "object",
              properties: {
                Amount: { type: "number" },
                LinkedTxn: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      TxnId: { type: "string", description: "Invoice.Id" },
                      TxnType: { type: "string", description: "Typically 'Invoice'" },
                    },
                  },
                },
              },
            },
          },
        },
        required: ["CustomerRef", "TotalAmt"],
      },
    },
    {
      name: "get_payment",
      description: "Retrieve a payment by QuickBooks entity id.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "QuickBooks Payment.Id" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_item",
      description: "Create a product or service item. Name, Type, and IncomeAccountRef (for Service/Inventory) are required.",
      inputSchema: {
        type: "object",
        properties: {
          Name: { type: "string" },
          Type: { type: "string", enum: ["Service", "Inventory", "NonInventory"] },
          UnitPrice: { type: "number" },
          Description: { type: "string" },
          IncomeAccountRef: {
            type: "object",
            properties: { value: { type: "string", description: "Account.Id of income account" } },
          },
          ExpenseAccountRef: {
            type: "object",
            properties: { value: { type: "string" } },
          },
          AssetAccountRef: {
            type: "object",
            description: "Required for Inventory type",
            properties: { value: { type: "string" } },
          },
          Taxable: { type: "boolean" },
          Sku: { type: "string" },
        },
        required: ["Name", "Type"],
      },
    },
    {
      name: "list_items",
      description: "Query items using QBO's SQL-like query language. Default: 'SELECT * FROM Item'.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "QBO query string" },
        },
      },
    },
    {
      name: "create_bill",
      description: "Create a bill (AP / money owed to a vendor). VendorRef and at least one Line (AccountBasedExpenseLineDetail or ItemBasedExpenseLineDetail) are required.",
      inputSchema: {
        type: "object",
        properties: {
          VendorRef: {
            type: "object",
            properties: { value: { type: "string", description: "Vendor.Id" } },
            required: ["value"],
          },
          Line: {
            type: "array",
            description: "Bill line items",
            items: {
              type: "object",
              properties: {
                Amount: { type: "number" },
                DetailType: { type: "string", description: "'AccountBasedExpenseLineDetail' or 'ItemBasedExpenseLineDetail'" },
                Description: { type: "string" },
                AccountBasedExpenseLineDetail: {
                  type: "object",
                  properties: {
                    AccountRef: {
                      type: "object",
                      properties: { value: { type: "string", description: "Expense Account.Id" } },
                    },
                  },
                },
                ItemBasedExpenseLineDetail: {
                  type: "object",
                  properties: {
                    ItemRef: {
                      type: "object",
                      properties: { value: { type: "string", description: "Item.Id" } },
                    },
                    Qty: { type: "number" },
                    UnitPrice: { type: "number" },
                  },
                },
              },
            },
          },
          TxnDate: { type: "string", description: "Bill date (YYYY-MM-DD)" },
          DueDate: { type: "string", description: "Due date (YYYY-MM-DD)" },
          CurrencyRef: {
            type: "object",
            properties: { value: { type: "string", description: "ISO-4217" } },
          },
          PrivateNote: { type: "string" },
        },
        required: ["VendorRef", "Line"],
      },
    },
    {
      name: "list_bills",
      description: "Query bills using QBO's SQL-like query language. Default: 'SELECT * FROM Bill'.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "QBO query string" },
        },
      },
    },
    {
      name: "create_vendor",
      description: "Create a vendor (supplier). DisplayName is required and must be unique.",
      inputSchema: {
        type: "object",
        properties: {
          DisplayName: { type: "string", description: "Unique display name" },
          CompanyName: { type: "string" },
          GivenName: { type: "string" },
          FamilyName: { type: "string" },
          PrimaryEmailAddr: {
            type: "object",
            properties: { Address: { type: "string" } },
          },
          PrimaryPhone: {
            type: "object",
            properties: { FreeFormNumber: { type: "string" } },
          },
          BillAddr: {
            type: "object",
            properties: {
              Line1: { type: "string" },
              City: { type: "string" },
              CountrySubDivisionCode: { type: "string" },
              PostalCode: { type: "string" },
              Country: { type: "string" },
            },
          },
          TaxIdentifier: { type: "string", description: "Tax ID / EIN / CNPJ" },
        },
        required: ["DisplayName"],
      },
    },
    {
      name: "list_vendors",
      description: "Query vendors using QBO's SQL-like query language. Default: 'SELECT * FROM Vendor'.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "QBO query string" },
        },
      },
    },
    {
      name: "create_estimate",
      description: "Create an estimate (quote). CustomerRef and Line items required. Estimates can later be converted to invoices.",
      inputSchema: {
        type: "object",
        properties: {
          CustomerRef: {
            type: "object",
            properties: { value: { type: "string", description: "Customer.Id" } },
            required: ["value"],
          },
          Line: {
            type: "array",
            description: "Estimate line items (same shape as invoice lines)",
            items: {
              type: "object",
              properties: {
                Amount: { type: "number" },
                DetailType: { type: "string", description: "Typically 'SalesItemLineDetail'" },
                Description: { type: "string" },
                SalesItemLineDetail: {
                  type: "object",
                  properties: {
                    ItemRef: {
                      type: "object",
                      properties: { value: { type: "string", description: "Item.Id" } },
                    },
                    Qty: { type: "number" },
                    UnitPrice: { type: "number" },
                  },
                },
              },
            },
          },
          TxnDate: { type: "string", description: "Estimate date (YYYY-MM-DD)" },
          ExpirationDate: { type: "string", description: "Estimate expiry (YYYY-MM-DD)" },
          CurrencyRef: {
            type: "object",
            properties: { value: { type: "string", description: "ISO-4217" } },
          },
          BillEmail: {
            type: "object",
            properties: { Address: { type: "string" } },
          },
          CustomerMemo: {
            type: "object",
            properties: { value: { type: "string" } },
          },
        },
        required: ["CustomerRef", "Line"],
      },
    },
    {
      name: "create_sales_receipt",
      description: "Create a sales receipt (paid-on-the-spot sale — combines invoice + payment). CustomerRef and Line items required.",
      inputSchema: {
        type: "object",
        properties: {
          CustomerRef: {
            type: "object",
            properties: { value: { type: "string", description: "Customer.Id" } },
            required: ["value"],
          },
          Line: {
            type: "array",
            description: "Sales receipt line items (same shape as invoice lines)",
            items: {
              type: "object",
              properties: {
                Amount: { type: "number" },
                DetailType: { type: "string", description: "Typically 'SalesItemLineDetail'" },
                Description: { type: "string" },
                SalesItemLineDetail: {
                  type: "object",
                  properties: {
                    ItemRef: {
                      type: "object",
                      properties: { value: { type: "string", description: "Item.Id" } },
                    },
                    Qty: { type: "number" },
                    UnitPrice: { type: "number" },
                  },
                },
              },
            },
          },
          TxnDate: { type: "string", description: "Receipt date (YYYY-MM-DD)" },
          PaymentMethodRef: {
            type: "object",
            properties: { value: { type: "string", description: "PaymentMethod.Id" } },
          },
          DepositToAccountRef: {
            type: "object",
            properties: { value: { type: "string", description: "Account.Id where funds are deposited" } },
          },
          CurrencyRef: {
            type: "object",
            properties: { value: { type: "string", description: "ISO-4217" } },
          },
          PrivateNote: { type: "string" },
        },
        required: ["CustomerRef", "Line"],
      },
    },
    {
      name: "list_accounts",
      description: "Query the chart of accounts using QBO's SQL-like query language. Default: 'SELECT * FROM Account'.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "QBO query string" },
        },
      },
    },
    {
      name: "get_profit_and_loss_report",
      description: "Run a Profit and Loss report for a date range.",
      inputSchema: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "YYYY-MM-DD" },
          end_date: { type: "string", description: "YYYY-MM-DD" },
          accounting_method: {
            type: "string",
            enum: ["Cash", "Accrual"],
            description: "Default: Accrual",
          },
          summarize_column_by: {
            type: "string",
            description: "Total | Month | Quarter | Year | Customers | Vendors | Classes | Days | Week",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args || {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "create_customer":
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("POST", "/customer", a), null, 2) },
          ],
        };

      case "update_customer": {
        const body = { sparse: true, ...a };
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("POST", "/customer", body), null, 2) },
          ],
        };
      }

      case "get_customer": {
        const id = a.id as string;
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("GET", `/customer/${id}`), null, 2) },
          ],
        };
      }

      case "list_customers": {
        const query = (a.query as string) || "SELECT * FROM Customer";
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("GET", "/query", undefined, { query: { query } }), null, 2) },
          ],
        };
      }

      case "create_invoice":
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("POST", "/invoice", a), null, 2) },
          ],
        };

      case "update_invoice": {
        const body = { sparse: true, ...a };
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("POST", "/invoice", body), null, 2) },
          ],
        };
      }

      case "void_invoice": {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await qbRequest("POST", "/invoice", a, { query: { operation: "void" } }),
                null,
                2
              ),
            },
          ],
        };
      }

      case "delete_invoice": {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await qbRequest("POST", "/invoice", a, { query: { operation: "delete" } }),
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_invoice": {
        const id = a.id as string;
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("GET", `/invoice/${id}`), null, 2) },
          ],
        };
      }

      case "send_invoice": {
        const id = a.id as string;
        const sendTo = a.sendTo as string | undefined;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await qbRequest("POST", `/invoice/${id}/send`, undefined, {
                  query: sendTo ? { sendTo } : {},
                }),
                null,
                2
              ),
            },
          ],
        };
      }

      case "create_payment":
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("POST", "/payment", a), null, 2) },
          ],
        };

      case "get_payment": {
        const id = a.id as string;
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("GET", `/payment/${id}`), null, 2) },
          ],
        };
      }

      case "create_item":
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("POST", "/item", a), null, 2) },
          ],
        };

      case "list_items": {
        const query = (a.query as string) || "SELECT * FROM Item";
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("GET", "/query", undefined, { query: { query } }), null, 2) },
          ],
        };
      }

      case "create_bill":
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("POST", "/bill", a), null, 2) },
          ],
        };

      case "list_bills": {
        const query = (a.query as string) || "SELECT * FROM Bill";
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("GET", "/query", undefined, { query: { query } }), null, 2) },
          ],
        };
      }

      case "create_vendor":
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("POST", "/vendor", a), null, 2) },
          ],
        };

      case "list_vendors": {
        const query = (a.query as string) || "SELECT * FROM Vendor";
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("GET", "/query", undefined, { query: { query } }), null, 2) },
          ],
        };
      }

      case "create_estimate":
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("POST", "/estimate", a), null, 2) },
          ],
        };

      case "create_sales_receipt":
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("POST", "/salesreceipt", a), null, 2) },
          ],
        };

      case "list_accounts": {
        const query = (a.query as string) || "SELECT * FROM Account";
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("GET", "/query", undefined, { query: { query } }), null, 2) },
          ],
        };
      }

      case "get_profit_and_loss_report": {
        const query: Record<string, string | undefined> = {
          start_date: a.start_date as string | undefined,
          end_date: a.end_date as string | undefined,
          accounting_method: a.accounting_method as string | undefined,
          summarize_column_by: a.summarize_column_by as string | undefined,
        };
        return {
          content: [
            { type: "text", text: JSON.stringify(await qbRequest("GET", "/reports/ProfitAndLoss", undefined, { query }), null, 2) },
          ],
        };
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
        const s = new Server({ name: "mcp-quickbooks", version: "0.2.1" }, { capabilities: { tools: {} } });
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
