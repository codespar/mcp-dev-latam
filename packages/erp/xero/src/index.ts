#!/usr/bin/env node

/**
 * MCP Server for Xero — global cloud accounting platform.
 *
 * Xero is the #2 global ERP for SMBs and the leader in UK/AU/NZ, with
 * growing US presence. Together with QuickBooks, the two cover ~80% of
 * global SMB accounting. This server exposes Xero's Accounting API so
 * agents can manage contacts, issue invoices, record payments, and pull
 * financial reports for companies operating outside (or alongside) Brazil.
 *
 * Tools (24):
 *   create_contact           — POST /Contacts
 *   get_contact              — GET  /Contacts/{ContactID}
 *   list_contacts            — GET  /Contacts (optional where clause)
 *   update_contact           — POST /Contacts/{ContactID}
 *   archive_contact          — POST /Contacts/{ContactID} (ContactStatus=ARCHIVED)
 *   create_invoice           — POST /Invoices
 *   get_invoice              — GET  /Invoices/{InvoiceID}
 *   list_invoices            — GET  /Invoices (optional where clause)
 *   update_invoice           — POST /Invoices/{InvoiceID}
 *   void_invoice             — POST /Invoices/{InvoiceID} (Status=VOIDED)
 *   email_invoice            — POST /Invoices/{InvoiceID}/Email
 *   create_payment           — PUT  /Payments
 *   get_payment              — GET  /Payments/{PaymentID}
 *   list_payments            — GET  /Payments
 *   create_bank_transaction  — PUT  /BankTransactions
 *   list_bank_transactions   — GET  /BankTransactions
 *   create_item              — POST /Items
 *   list_items               — GET  /Items
 *   list_accounts            — GET  /Accounts
 *   list_organisations       — GET  /Organisation
 *   list_tax_rates           — GET  /TaxRates
 *   create_credit_note       — PUT  /CreditNotes
 *   list_credit_notes        — GET  /CreditNotes
 *   get_balance_sheet        — GET  /Reports/BalanceSheet
 *
 * Authentication
 *   OAuth2 Bearer. Every request sends:
 *     Authorization: Bearer <XERO_ACCESS_TOKEN>
 *     Xero-tenant-id: <XERO_TENANT_ID>
 *     Accept: application/json
 *     Content-Type: application/json  (on writes)
 *
 * This server assumes a pre-issued access token. Refresh-token rotation
 * is the caller's responsibility (handle it in your OAuth proxy / secrets
 * layer). When the token expires, requests return 401 and tools surface
 * the Xero error verbatim.
 *
 * Environment
 *   XERO_ACCESS_TOKEN  — OAuth2 bearer access token (secret, required)
 *   XERO_TENANT_ID     — Xero tenant/organization id (required)
 *
 * Docs: https://developer.xero.com/documentation/api/accounting
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ACCESS_TOKEN = process.env.XERO_ACCESS_TOKEN || "";
const TENANT_ID = process.env.XERO_TENANT_ID || "";
const BASE_URL = "https://api.xero.com/api.xro/2.0";

async function xeroRequest(
  method: string,
  path: string,
  body?: unknown,
  opts?: { query?: Record<string, string | undefined> }
): Promise<unknown> {
  const query = opts?.query
    ? "?" +
      Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    "Xero-tenant-id": TENANT_ID,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE_URL}${path}${query}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Xero API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-xero", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_contact",
      description: "Create a Xero contact (customer or supplier — Xero uses one unified Contact object with IsCustomer/IsSupplier flags inferred from transactions).",
      inputSchema: {
        type: "object",
        properties: {
          Name: { type: "string", description: "Full name of the contact. Required and must be unique within the tenant." },
          FirstName: { type: "string", description: "Contact first name (for individuals)." },
          LastName: { type: "string", description: "Contact last name (for individuals)." },
          EmailAddress: { type: "string", description: "Primary email address." },
          ContactNumber: { type: "string", description: "External system identifier (max 50 chars)." },
          AccountNumber: { type: "string", description: "Merchant-side account number for this contact." },
          TaxNumber: { type: "string", description: "Tax number (VAT, ABN, GST, EIN, etc.) — country-dependent." },
          Addresses: { type: "array", description: "Array of address objects with AddressType (POBOX/STREET), AddressLine1..4, City, Region, PostalCode, Country." },
          Phones: { type: "array", description: "Array of phone objects with PhoneType (DEFAULT/DDI/MOBILE/FAX), PhoneNumber, PhoneAreaCode, PhoneCountryCode." },
          IsCustomer: { type: "boolean", description: "Hint that this contact is a customer." },
          IsSupplier: { type: "boolean", description: "Hint that this contact is a supplier." },
          DefaultCurrency: { type: "string", description: "ISO-4217 currency code used as default on invoices for this contact." },
        },
        required: ["Name"],
      },
    },
    {
      name: "get_contact",
      description: "Retrieve a single Xero contact by ContactID (UUID).",
      inputSchema: {
        type: "object",
        properties: {
          ContactID: { type: "string", description: "Xero Contact UUID." },
        },
        required: ["ContactID"],
      },
    },
    {
      name: "list_contacts",
      description: "List Xero contacts. Supports Xero's where clause for server-side filtering (e.g. 'Name==\"ACME Ltd\"', 'IsCustomer==true').",
      inputSchema: {
        type: "object",
        properties: {
          where: { type: "string", description: "Xero where clause, e.g. 'Name.Contains(\"ACME\")' or 'IsCustomer==true'." },
          order: { type: "string", description: "Ordering clause, e.g. 'Name ASC' or 'UpdatedDateUTC DESC'." },
          page: { type: "number", description: "Page number (100 contacts per page)." },
          includeArchived: { type: "boolean", description: "If true, include archived contacts in results." },
        },
      },
    },
    {
      name: "create_invoice",
      description: "Create an invoice in Xero. Type ACCREC = accounts-receivable (sales invoice to a customer), ACCPAY = accounts-payable (bill from a supplier). Default Status=DRAFT; set AUTHORISED to issue immediately.",
      inputSchema: {
        type: "object",
        properties: {
          Type: { type: "string", enum: ["ACCREC", "ACCPAY"], description: "ACCREC (sales/AR) or ACCPAY (bill/AP)." },
          Contact: {
            type: "object",
            description: "Contact reference — provide ContactID of an existing contact.",
            properties: {
              ContactID: { type: "string", description: "Xero Contact UUID." },
            },
            required: ["ContactID"],
          },
          LineItems: {
            type: "array",
            description: "Array of line items. Each: Description, Quantity, UnitAmount, AccountCode (or ItemCode), TaxType, DiscountRate.",
          },
          Date: { type: "string", description: "Invoice date, YYYY-MM-DD." },
          DueDate: { type: "string", description: "Payment due date, YYYY-MM-DD." },
          InvoiceNumber: { type: "string", description: "Optional merchant invoice number. If omitted, Xero auto-numbers (ACCREC only)." },
          Reference: { type: "string", description: "ACCREC only — free-text reference visible on invoice." },
          CurrencyCode: { type: "string", description: "ISO-4217 currency code. Defaults to organization base currency." },
          Status: { type: "string", enum: ["DRAFT", "SUBMITTED", "AUTHORISED"], description: "DRAFT (default), SUBMITTED (awaiting approval), or AUTHORISED (live/issued)." },
          LineAmountTypes: { type: "string", enum: ["Exclusive", "Inclusive", "NoTax"], description: "Whether LineItem UnitAmount is tax-exclusive, tax-inclusive, or tax-free." },
        },
        required: ["Type", "Contact", "LineItems"],
      },
    },
    {
      name: "get_invoice",
      description: "Retrieve a single invoice by InvoiceID (UUID) or InvoiceNumber.",
      inputSchema: {
        type: "object",
        properties: {
          InvoiceID: { type: "string", description: "Xero Invoice UUID or InvoiceNumber (e.g. INV-0042)." },
        },
        required: ["InvoiceID"],
      },
    },
    {
      name: "list_invoices",
      description: "List invoices with optional Xero where-clause filtering. Common filters: Status==\"AUTHORISED\", Type==\"ACCREC\", Contact.ContactID==guid(\"...\"), Date>=DateTime(2026,1,1).",
      inputSchema: {
        type: "object",
        properties: {
          where: { type: "string", description: "Xero where clause, e.g. 'Status==\"AUTHORISED\" AND Type==\"ACCREC\"'." },
          order: { type: "string", description: "Ordering, e.g. 'Date DESC'." },
          page: { type: "number", description: "Page number (100 invoices per page)." },
          statuses: { type: "string", description: "Comma-separated statuses filter, e.g. 'DRAFT,AUTHORISED'." },
        },
      },
    },
    {
      name: "email_invoice",
      description: "Email an AUTHORISED invoice to the contact's email address on file. Xero uses the default invoice email template. No body required.",
      inputSchema: {
        type: "object",
        properties: {
          InvoiceID: { type: "string", description: "Xero Invoice UUID. Invoice must be AUTHORISED and contact must have an EmailAddress." },
        },
        required: ["InvoiceID"],
      },
    },
    {
      name: "create_payment",
      description: "Record a payment against an invoice or credit note. Reduces the invoice's AmountDue and posts to the specified bank/payment account.",
      inputSchema: {
        type: "object",
        properties: {
          Invoice: {
            type: "object",
            description: "Invoice reference — provide InvoiceID.",
            properties: { InvoiceID: { type: "string", description: "Xero Invoice UUID." } },
            required: ["InvoiceID"],
          },
          Account: {
            type: "object",
            description: "Bank/payment account reference — provide AccountID or Code (e.g. '090' for a bank account).",
            properties: {
              AccountID: { type: "string", description: "Xero Account UUID." },
              Code: { type: "string", description: "Account code (alternative to AccountID)." },
            },
          },
          Date: { type: "string", description: "Payment date, YYYY-MM-DD." },
          Amount: { type: "number", description: "Payment amount in invoice currency." },
          Reference: { type: "string", description: "Free-text reference (bank ref, check number, etc)." },
          CurrencyRate: { type: "number", description: "FX rate if invoice currency differs from org base currency." },
        },
        required: ["Invoice", "Account", "Amount"],
      },
    },
    {
      name: "create_item",
      description: "Create a Xero inventory/product item. Items can be sales-only, purchase-only, or tracked inventory (requires IsTrackedAsInventory + InventoryAssetAccountCode).",
      inputSchema: {
        type: "object",
        properties: {
          Code: { type: "string", description: "User-defined item code (required, unique within tenant)." },
          Name: { type: "string", description: "Item display name." },
          Description: { type: "string", description: "Sales description shown on invoices." },
          PurchaseDescription: { type: "string", description: "Purchase description shown on bills." },
          SalesDetails: {
            type: "object",
            description: "Sales pricing: UnitPrice, AccountCode (revenue account), TaxType.",
          },
          PurchaseDetails: {
            type: "object",
            description: "Purchase pricing: UnitPrice, AccountCode (expense account), TaxType.",
          },
          IsSold: { type: "boolean", description: "True if item is available for sale (appears on invoices)." },
          IsPurchased: { type: "boolean", description: "True if item is available for purchase (appears on bills)." },
          IsTrackedAsInventory: { type: "boolean", description: "True to track stock on hand — requires InventoryAssetAccountCode." },
          InventoryAssetAccountCode: { type: "string", description: "Inventory asset account code (required when IsTrackedAsInventory is true)." },
        },
        required: ["Code"],
      },
    },
    {
      name: "list_items",
      description: "List all items/products in the Xero tenant. Supports where clause, e.g. 'IsSold==true'.",
      inputSchema: {
        type: "object",
        properties: {
          where: { type: "string", description: "Xero where clause, e.g. 'IsSold==true'." },
          order: { type: "string", description: "Ordering, e.g. 'Code ASC'." },
        },
      },
    },
    {
      name: "list_accounts",
      description: "List the Xero chart of accounts. Use this to discover AccountCodes/AccountIDs needed for invoice line items and payments.",
      inputSchema: {
        type: "object",
        properties: {
          where: { type: "string", description: "Xero where clause, e.g. 'Class==\"REVENUE\"' or 'Type==\"BANK\"'." },
          order: { type: "string", description: "Ordering, e.g. 'Code ASC'." },
        },
      },
    },
    {
      name: "update_contact",
      description: "Update an existing Xero contact. POSTs to /Contacts/{ContactID}. Only include fields you want changed; Xero merges updates.",
      inputSchema: {
        type: "object",
        properties: {
          ContactID: { type: "string", description: "Xero Contact UUID to update." },
          Name: { type: "string", description: "Updated name (must remain unique within tenant)." },
          FirstName: { type: "string", description: "Contact first name." },
          LastName: { type: "string", description: "Contact last name." },
          EmailAddress: { type: "string", description: "Primary email address." },
          ContactNumber: { type: "string", description: "External system identifier." },
          AccountNumber: { type: "string", description: "Merchant-side account number." },
          TaxNumber: { type: "string", description: "Tax number (VAT/ABN/GST/EIN)." },
          Addresses: { type: "array", description: "Addresses array (replaces existing)." },
          Phones: { type: "array", description: "Phones array (replaces existing)." },
          DefaultCurrency: { type: "string", description: "ISO-4217 default currency." },
        },
        required: ["ContactID"],
      },
    },
    {
      name: "archive_contact",
      description: "Archive a Xero contact by setting ContactStatus=ARCHIVED. Archived contacts are hidden from default lists but history is preserved.",
      inputSchema: {
        type: "object",
        properties: {
          ContactID: { type: "string", description: "Xero Contact UUID to archive." },
        },
        required: ["ContactID"],
      },
    },
    {
      name: "update_invoice",
      description: "Update an existing invoice. POSTs to /Invoices/{InvoiceID}. DRAFT/SUBMITTED invoices are fully editable; AUTHORISED invoices have limited editable fields (Reference, DueDate, etc).",
      inputSchema: {
        type: "object",
        properties: {
          InvoiceID: { type: "string", description: "Xero Invoice UUID to update." },
          LineItems: { type: "array", description: "Replacement line items array." },
          Date: { type: "string", description: "Invoice date YYYY-MM-DD." },
          DueDate: { type: "string", description: "Payment due date YYYY-MM-DD." },
          Reference: { type: "string", description: "Free-text reference." },
          Status: { type: "string", enum: ["DRAFT", "SUBMITTED", "AUTHORISED", "VOIDED"], description: "New invoice status." },
          LineAmountTypes: { type: "string", enum: ["Exclusive", "Inclusive", "NoTax"], description: "Tax treatment for line amounts." },
          InvoiceNumber: { type: "string", description: "Merchant invoice number." },
        },
        required: ["InvoiceID"],
      },
    },
    {
      name: "void_invoice",
      description: "Void an invoice by setting Status=VOIDED. Only DRAFT, SUBMITTED, or AUTHORISED invoices with zero payments can be voided.",
      inputSchema: {
        type: "object",
        properties: {
          InvoiceID: { type: "string", description: "Xero Invoice UUID to void." },
        },
        required: ["InvoiceID"],
      },
    },
    {
      name: "get_payment",
      description: "Retrieve a single payment by PaymentID.",
      inputSchema: {
        type: "object",
        properties: {
          PaymentID: { type: "string", description: "Xero Payment UUID." },
        },
        required: ["PaymentID"],
      },
    },
    {
      name: "list_payments",
      description: "List payments recorded in Xero. Supports where-clause filtering (e.g. 'Status==\"AUTHORISED\"', 'Date>=DateTime(2026,1,1)').",
      inputSchema: {
        type: "object",
        properties: {
          where: { type: "string", description: "Xero where clause." },
          order: { type: "string", description: "Ordering, e.g. 'Date DESC'." },
          page: { type: "number", description: "Page number (100 per page)." },
        },
      },
    },
    {
      name: "create_bank_transaction",
      description: "Create a bank transaction (SPEND = money out, RECEIVE = money in) directly on a bank account — for transactions without a matching invoice/bill (fees, transfers, one-off expenses).",
      inputSchema: {
        type: "object",
        properties: {
          Type: { type: "string", enum: ["SPEND", "RECEIVE", "SPEND-OVERPAYMENT", "RECEIVE-OVERPAYMENT", "SPEND-PREPAYMENT", "RECEIVE-PREPAYMENT", "SPEND-TRANSFER", "RECEIVE-TRANSFER"], description: "Transaction type. SPEND/RECEIVE are the common values." },
          Contact: {
            type: "object",
            description: "Contact reference — provide ContactID.",
            properties: { ContactID: { type: "string", description: "Xero Contact UUID." } },
            required: ["ContactID"],
          },
          BankAccount: {
            type: "object",
            description: "Bank account reference — provide AccountID or Code.",
            properties: {
              AccountID: { type: "string", description: "Xero Account UUID (Type=BANK)." },
              Code: { type: "string", description: "Account code (alternative to AccountID)." },
            },
          },
          LineItems: { type: "array", description: "Array of line items (Description, Quantity, UnitAmount, AccountCode, TaxType)." },
          Date: { type: "string", description: "Transaction date YYYY-MM-DD." },
          Reference: { type: "string", description: "Free-text reference." },
          IsReconciled: { type: "boolean", description: "Mark as reconciled on creation." },
          CurrencyCode: { type: "string", description: "ISO-4217 currency code." },
          LineAmountTypes: { type: "string", enum: ["Exclusive", "Inclusive", "NoTax"], description: "Line amount tax treatment." },
        },
        required: ["Type", "Contact", "BankAccount", "LineItems"],
      },
    },
    {
      name: "list_bank_transactions",
      description: "List bank transactions (spend/receive entries on bank accounts). Supports where-clause filtering by BankAccount.AccountID, Type, Date, etc.",
      inputSchema: {
        type: "object",
        properties: {
          where: { type: "string", description: "Xero where clause, e.g. 'BankAccount.AccountID==guid(\"...\")'." },
          order: { type: "string", description: "Ordering, e.g. 'Date DESC'." },
          page: { type: "number", description: "Page number (100 per page)." },
        },
      },
    },
    {
      name: "list_organisations",
      description: "Retrieve the Xero organisation(s) the access token has access to — returns name, base currency, country, fiscal year start, tax settings, and edition.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "list_tax_rates",
      description: "List tax rates configured in the Xero tenant. Use the returned TaxType codes on invoice/bill line items. Supports where clause like 'Status==\"ACTIVE\"'.",
      inputSchema: {
        type: "object",
        properties: {
          where: { type: "string", description: "Xero where clause, e.g. 'Status==\"ACTIVE\"'." },
          order: { type: "string", description: "Ordering, e.g. 'Name ASC'." },
        },
      },
    },
    {
      name: "create_credit_note",
      description: "Create a credit note. Type ACCRECCREDIT = credit to a customer (offsets an AR invoice), ACCPAYCREDIT = credit from a supplier (offsets an AP bill).",
      inputSchema: {
        type: "object",
        properties: {
          Type: { type: "string", enum: ["ACCRECCREDIT", "ACCPAYCREDIT"], description: "ACCRECCREDIT (customer credit) or ACCPAYCREDIT (supplier credit)." },
          Contact: {
            type: "object",
            description: "Contact reference — provide ContactID.",
            properties: { ContactID: { type: "string", description: "Xero Contact UUID." } },
            required: ["ContactID"],
          },
          LineItems: { type: "array", description: "Array of line items (Description, Quantity, UnitAmount, AccountCode, TaxType)." },
          Date: { type: "string", description: "Credit note date YYYY-MM-DD." },
          Status: { type: "string", enum: ["DRAFT", "SUBMITTED", "AUTHORISED"], description: "Credit note status. Defaults to DRAFT." },
          CreditNoteNumber: { type: "string", description: "Merchant credit note number (auto-assigned for ACCRECCREDIT if omitted)." },
          Reference: { type: "string", description: "Free-text reference." },
          CurrencyCode: { type: "string", description: "ISO-4217 currency." },
          LineAmountTypes: { type: "string", enum: ["Exclusive", "Inclusive", "NoTax"], description: "Line amount tax treatment." },
        },
        required: ["Type", "Contact", "LineItems"],
      },
    },
    {
      name: "list_credit_notes",
      description: "List credit notes. Supports where-clause filtering by Type, Status, Contact.ContactID, Date.",
      inputSchema: {
        type: "object",
        properties: {
          where: { type: "string", description: "Xero where clause, e.g. 'Type==\"ACCRECCREDIT\" AND Status==\"AUTHORISED\"'." },
          order: { type: "string", description: "Ordering, e.g. 'Date DESC'." },
          page: { type: "number", description: "Page number (100 per page)." },
        },
      },
    },
    {
      name: "get_balance_sheet",
      description: "Retrieve the Balance Sheet report for the tenant. Returns assets, liabilities, and equity grouped by account as of a given date.",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Report date YYYY-MM-DD. Defaults to today." },
          periods: { type: "number", description: "Number of comparison periods (1-11)." },
          timeframe: { type: "string", enum: ["MONTH", "QUARTER", "YEAR"], description: "Period size when 'periods' > 0." },
          trackingOptionID1: { type: "string", description: "Tracking category option to filter the report." },
          trackingOptionID2: { type: "string", description: "Second tracking category option." },
          standardLayout: { type: "boolean", description: "If true, return the standard (non-customised) layout." },
          paymentsOnly: { type: "boolean", description: "Cash-basis report if true (ignore accrual)." },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "create_contact":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("POST", "/Contacts", { Contacts: [a] }), null, 2) }] };
      case "get_contact":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("GET", `/Contacts/${a.ContactID}`), null, 2) }] };
      case "list_contacts":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("GET", "/Contacts", undefined, {
          query: {
            where: a.where as string | undefined,
            order: a.order as string | undefined,
            page: a.page !== undefined ? String(a.page) : undefined,
            includeArchived: a.includeArchived !== undefined ? String(a.includeArchived) : undefined,
          },
        }), null, 2) }] };
      case "create_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("POST", "/Invoices", { Invoices: [a] }), null, 2) }] };
      case "get_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("GET", `/Invoices/${a.InvoiceID}`), null, 2) }] };
      case "list_invoices":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("GET", "/Invoices", undefined, {
          query: {
            where: a.where as string | undefined,
            order: a.order as string | undefined,
            page: a.page !== undefined ? String(a.page) : undefined,
            Statuses: a.statuses as string | undefined,
          },
        }), null, 2) }] };
      case "email_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("POST", `/Invoices/${a.InvoiceID}/Email`, {}), null, 2) }] };
      case "create_payment":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("PUT", "/Payments", { Payments: [a] }), null, 2) }] };
      case "create_item":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("POST", "/Items", { Items: [a] }), null, 2) }] };
      case "list_items":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("GET", "/Items", undefined, {
          query: { where: a.where as string | undefined, order: a.order as string | undefined },
        }), null, 2) }] };
      case "list_accounts":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("GET", "/Accounts", undefined, {
          query: { where: a.where as string | undefined, order: a.order as string | undefined },
        }), null, 2) }] };
      case "update_contact": {
        const { ContactID, ...rest } = a;
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("POST", `/Contacts/${ContactID}`, { Contacts: [rest] }), null, 2) }] };
      }
      case "archive_contact":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("POST", `/Contacts/${a.ContactID}`, { Contacts: [{ ContactStatus: "ARCHIVED" }] }), null, 2) }] };
      case "update_invoice": {
        const { InvoiceID, ...rest } = a;
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("POST", `/Invoices/${InvoiceID}`, { Invoices: [rest] }), null, 2) }] };
      }
      case "void_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("POST", `/Invoices/${a.InvoiceID}`, { Invoices: [{ Status: "VOIDED" }] }), null, 2) }] };
      case "get_payment":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("GET", `/Payments/${a.PaymentID}`), null, 2) }] };
      case "list_payments":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("GET", "/Payments", undefined, {
          query: {
            where: a.where as string | undefined,
            order: a.order as string | undefined,
            page: a.page !== undefined ? String(a.page) : undefined,
          },
        }), null, 2) }] };
      case "create_bank_transaction":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("PUT", "/BankTransactions", { BankTransactions: [a] }), null, 2) }] };
      case "list_bank_transactions":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("GET", "/BankTransactions", undefined, {
          query: {
            where: a.where as string | undefined,
            order: a.order as string | undefined,
            page: a.page !== undefined ? String(a.page) : undefined,
          },
        }), null, 2) }] };
      case "list_organisations":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("GET", "/Organisation"), null, 2) }] };
      case "list_tax_rates":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("GET", "/TaxRates", undefined, {
          query: { where: a.where as string | undefined, order: a.order as string | undefined },
        }), null, 2) }] };
      case "create_credit_note":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("PUT", "/CreditNotes", { CreditNotes: [a] }), null, 2) }] };
      case "list_credit_notes":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("GET", "/CreditNotes", undefined, {
          query: {
            where: a.where as string | undefined,
            order: a.order as string | undefined,
            page: a.page !== undefined ? String(a.page) : undefined,
          },
        }), null, 2) }] };
      case "get_balance_sheet":
        return { content: [{ type: "text", text: JSON.stringify(await xeroRequest("GET", "/Reports/BalanceSheet", undefined, {
          query: {
            date: a.date as string | undefined,
            periods: a.periods !== undefined ? String(a.periods) : undefined,
            timeframe: a.timeframe as string | undefined,
            trackingOptionID1: a.trackingOptionID1 as string | undefined,
            trackingOptionID2: a.trackingOptionID2 as string | undefined,
            standardLayout: a.standardLayout !== undefined ? String(a.standardLayout) : undefined,
            paymentsOnly: a.paymentsOnly !== undefined ? String(a.paymentsOnly) : undefined,
          },
        }), null, 2) }] };
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
        const s = new Server({ name: "mcp-xero", version: "0.2.1" }, { capabilities: { tools: {} } });
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
