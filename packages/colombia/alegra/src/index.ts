#!/usr/bin/env node

/**
 * MCP Server for Alegra — cloud accounting for LATAM (Colombian-founded).
 *
 * Tools:
 * - create_invoice: Create an invoice
 * - get_invoice: Get invoice by ID
 * - list_invoices: List invoices
 * - void_invoice: Void/cancel an invoice
 * - get_invoice_pdf: Get invoice PDF URL
 * - send_invoice: Email an invoice to a contact
 * - create_contact: Create a contact (customer/supplier)
 * - update_contact: Update an existing contact
 * - delete_contact: Delete a contact
 * - list_contacts: List contacts
 * - create_item: Create a product/service item
 * - update_item: Update an existing item
 * - list_items: List items
 * - list_payments: List payments
 * - get_payment: Get payment by ID
 * - create_payment: Record a payment
 * - void_payment: Void a payment
 * - list_categories: List item categories (chart of accounts)
 * - list_bank_accounts: List bank accounts
 * - get_company: Get company profile information
 *
 * Environment:
 *   ALEGRA_EMAIL     — Account email
 *   ALEGRA_API_TOKEN — API token
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const EMAIL = process.env.ALEGRA_EMAIL || "";
const API_TOKEN = process.env.ALEGRA_API_TOKEN || "";
const BASE_URL = "https://api.alegra.com/api/v1";

async function alegraRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Basic ${Buffer.from(EMAIL + ":" + API_TOKEN).toString("base64")}`,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Alegra API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-alegra", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_invoice",
      description: "Create an invoice",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Invoice date (YYYY-MM-DD)" },
          due_date: { type: "string", description: "Due date (YYYY-MM-DD)" },
          client: { type: "number", description: "Client/contact ID" },
          items: {
            type: "array",
            description: "Invoice items",
            items: {
              type: "object",
              properties: {
                id: { type: "number", description: "Item ID" },
                description: { type: "string", description: "Description" },
                quantity: { type: "number", description: "Quantity" },
                price: { type: "number", description: "Unit price" },
                discount: { type: "number", description: "Discount percentage" },
                tax: {
                  type: "array",
                  description: "Tax IDs",
                  items: { type: "number" },
                },
              },
              required: ["quantity", "price"],
            },
          },
          observations: { type: "string", description: "Notes/observations" },
          currency: { type: "string", description: "Currency code (COP, USD, MXN)" },
          payment_method: { type: "string", description: "Payment method" },
          stamp: {
            type: "object",
            description: "E-invoicing stamp (for DIAN)",
            properties: {
              generate_stamp: { type: "boolean", description: "Generate electronic stamp" },
            },
          },
        },
        required: ["date", "due_date", "client", "items"],
      },
    },
    {
      name: "get_invoice",
      description: "Get invoice details by ID",
      inputSchema: {
        type: "object",
        properties: { invoiceId: { type: "number", description: "Invoice ID" } },
        required: ["invoiceId"],
      },
    },
    {
      name: "list_invoices",
      description: "List invoices",
      inputSchema: {
        type: "object",
        properties: {
          start: { type: "number", description: "Offset for pagination" },
          limit: { type: "number", description: "Results limit (max 30)" },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          status: { type: "string", description: "Filter by status (open, closed, void)" },
          client_id: { type: "number", description: "Filter by client ID" },
        },
      },
    },
    {
      name: "void_invoice",
      description: "Void/cancel an invoice",
      inputSchema: {
        type: "object",
        properties: {
          invoiceId: { type: "number", description: "Invoice ID" },
          reason: { type: "string", description: "Reason for void/annulment" },
        },
        required: ["invoiceId"],
      },
    },
    {
      name: "get_invoice_pdf",
      description: "Get invoice PDF download URL",
      inputSchema: {
        type: "object",
        properties: {
          invoiceId: { type: "number", description: "Invoice ID" },
        },
        required: ["invoiceId"],
      },
    },
    {
      name: "send_invoice",
      description: "Email an invoice to one or more recipients",
      inputSchema: {
        type: "object",
        properties: {
          invoiceId: { type: "number", description: "Invoice ID" },
          emails: {
            type: "array",
            description: "Recipient email addresses",
            items: { type: "string" },
          },
          cc: {
            type: "array",
            description: "CC recipients",
            items: { type: "string" },
          },
          subject: { type: "string", description: "Email subject" },
          body: { type: "string", description: "Email body/message" },
          send_copy_to_user: { type: "boolean", description: "Send a copy to the account user" },
        },
        required: ["invoiceId", "emails"],
      },
    },
    {
      name: "create_contact",
      description: "Create a contact (customer or supplier)",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Contact name" },
          identification: { type: "string", description: "Tax ID (NIT, CC, CE, RUT)" },
          email: { type: "string", description: "Email address" },
          phone_primary: { type: "string", description: "Primary phone" },
          address: { type: "string", description: "Address" },
          city: { type: "string", description: "City" },
          department: { type: "string", description: "Department/state" },
          type: { type: "string", description: "Contact type (client, provider)" },
          regime: { type: "string", description: "Tax regime (simplified, common)" },
        },
        required: ["name"],
      },
    },
    {
      name: "update_contact",
      description: "Update an existing contact",
      inputSchema: {
        type: "object",
        properties: {
          contactId: { type: "number", description: "Contact ID" },
          name: { type: "string", description: "Contact name" },
          identification: { type: "string", description: "Tax ID" },
          email: { type: "string", description: "Email address" },
          phone_primary: { type: "string", description: "Primary phone" },
          address: { type: "string", description: "Address" },
          city: { type: "string", description: "City" },
          department: { type: "string", description: "Department/state" },
          type: { type: "string", description: "Contact type (client, provider)" },
          regime: { type: "string", description: "Tax regime" },
        },
        required: ["contactId"],
      },
    },
    {
      name: "delete_contact",
      description: "Delete a contact",
      inputSchema: {
        type: "object",
        properties: {
          contactId: { type: "number", description: "Contact ID" },
        },
        required: ["contactId"],
      },
    },
    {
      name: "list_contacts",
      description: "List contacts",
      inputSchema: {
        type: "object",
        properties: {
          start: { type: "number", description: "Offset for pagination" },
          limit: { type: "number", description: "Results limit" },
          type: { type: "string", description: "Filter by type (client, provider)" },
          query: { type: "string", description: "Search query" },
        },
      },
    },
    {
      name: "create_item",
      description: "Create a product or service item",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Item name" },
          description: { type: "string", description: "Description" },
          reference: { type: "string", description: "Reference/SKU code" },
          price: { type: "number", description: "Price" },
          category: { type: "number", description: "Category ID" },
          inventory: {
            type: "object",
            description: "Inventory settings",
            properties: {
              unit: { type: "string", description: "Unit of measure" },
              initial_quantity: { type: "number", description: "Initial stock quantity" },
              unit_cost: { type: "number", description: "Unit cost" },
            },
          },
          tax: {
            type: "array",
            description: "Tax IDs",
            items: { type: "number" },
          },
          type: { type: "string", description: "Item type (product, service, kit)" },
        },
        required: ["name", "price"],
      },
    },
    {
      name: "update_item",
      description: "Update an existing item",
      inputSchema: {
        type: "object",
        properties: {
          itemId: { type: "number", description: "Item ID" },
          name: { type: "string", description: "Item name" },
          description: { type: "string", description: "Description" },
          reference: { type: "string", description: "Reference/SKU code" },
          price: { type: "number", description: "Price" },
          category: { type: "number", description: "Category ID" },
          tax: {
            type: "array",
            description: "Tax IDs",
            items: { type: "number" },
          },
          type: { type: "string", description: "Item type (product, service, kit)" },
        },
        required: ["itemId"],
      },
    },
    {
      name: "list_items",
      description: "List products and services",
      inputSchema: {
        type: "object",
        properties: {
          start: { type: "number", description: "Offset for pagination" },
          limit: { type: "number", description: "Results limit" },
          type: { type: "string", description: "Filter by type (product, service)" },
          query: { type: "string", description: "Search query" },
        },
      },
    },
    {
      name: "list_payments",
      description: "List payments",
      inputSchema: {
        type: "object",
        properties: {
          start: { type: "number", description: "Offset for pagination" },
          limit: { type: "number", description: "Results limit" },
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
      },
    },
    {
      name: "get_payment",
      description: "Get payment by ID",
      inputSchema: {
        type: "object",
        properties: { paymentId: { type: "number", description: "Payment ID" } },
        required: ["paymentId"],
      },
    },
    {
      name: "create_payment",
      description: "Record a payment",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Payment date (YYYY-MM-DD)" },
          amount: { type: "number", description: "Payment amount" },
          bank_account: { type: "number", description: "Bank account ID" },
          payment_method: { type: "string", description: "Payment method" },
          invoices: {
            type: "array",
            description: "Invoices to apply payment to",
            items: {
              type: "object",
              properties: {
                id: { type: "number", description: "Invoice ID" },
                amount: { type: "number", description: "Amount applied" },
              },
              required: ["id", "amount"],
            },
          },
          client: { type: "number", description: "Client ID" },
          observations: { type: "string", description: "Notes" },
        },
        required: ["date", "amount"],
      },
    },
    {
      name: "void_payment",
      description: "Void/annul a payment",
      inputSchema: {
        type: "object",
        properties: {
          paymentId: { type: "number", description: "Payment ID" },
        },
        required: ["paymentId"],
      },
    },
    {
      name: "list_categories",
      description: "List item categories (chart of accounts)",
      inputSchema: {
        type: "object",
        properties: {
          start: { type: "number", description: "Offset for pagination" },
          limit: { type: "number", description: "Results limit" },
          query: { type: "string", description: "Search query" },
        },
      },
    },
    {
      name: "list_bank_accounts",
      description: "List bank accounts",
      inputSchema: {
        type: "object",
        properties: {
          start: { type: "number", description: "Offset for pagination" },
          limit: { type: "number", description: "Results limit" },
          type: { type: "string", description: "Filter by account type" },
        },
      },
    },
    {
      name: "get_company",
      description: "Get company profile and settings",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_invoice": {
        const payload: any = {
          date: args?.date,
          dueDate: args?.due_date,
          client: args?.client,
          items: args?.items,
        };
        if (args?.observations) payload.observations = args.observations;
        if (args?.currency) payload.currency = args.currency;
        if (args?.payment_method) payload.paymentMethod = args.payment_method;
        if (args?.stamp) payload.stamp = args.stamp;
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("POST", "/invoices", payload), null, 2) }] };
      }
      case "get_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("GET", `/invoices/${args?.invoiceId}`), null, 2) }] };
      case "list_invoices": {
        const params = new URLSearchParams();
        if (args?.start) params.set("start", String(args.start));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.date_from) params.set("date", args.date_from);
        if (args?.date_to) params.set("date_end", args.date_to);
        if (args?.status) params.set("status", args.status);
        if (args?.client_id) params.set("client", String(args.client_id));
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("GET", `/invoices?${params}`), null, 2) }] };
      }
      case "void_invoice": {
        const payload: any = { status: "void" };
        if (args?.reason) payload.reason = args.reason;
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("PUT", `/invoices/${args?.invoiceId}/void`, payload), null, 2) }] };
      }
      case "get_invoice_pdf":
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("GET", `/invoices/${args?.invoiceId}/pdf`), null, 2) }] };
      case "send_invoice": {
        const payload: any = { emails: args?.emails };
        if (args?.cc) payload.copyTo = args.cc;
        if (args?.subject) payload.subject = args.subject;
        if (args?.body) payload.body = args.body;
        if (args?.send_copy_to_user !== undefined) payload.sendCopyToUser = args.send_copy_to_user;
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("POST", `/invoices/${args?.invoiceId}/email`, payload), null, 2) }] };
      }
      case "create_contact": {
        const payload: any = { name: args?.name };
        if (args?.identification) payload.identification = args.identification;
        if (args?.email) payload.email = args.email;
        if (args?.phone_primary) payload.phonePrimary = args.phone_primary;
        if (args?.address) payload.address = { address: args.address };
        if (args?.city) payload.address = { ...payload.address, city: args.city };
        if (args?.department) payload.address = { ...payload.address, department: args.department };
        if (args?.type) payload.type = args.type;
        if (args?.regime) payload.regime = args.regime;
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("POST", "/contacts", payload), null, 2) }] };
      }
      case "update_contact": {
        const payload: any = {};
        if (args?.name) payload.name = args.name;
        if (args?.identification) payload.identification = args.identification;
        if (args?.email) payload.email = args.email;
        if (args?.phone_primary) payload.phonePrimary = args.phone_primary;
        if (args?.address) payload.address = { address: args.address };
        if (args?.city) payload.address = { ...payload.address, city: args.city };
        if (args?.department) payload.address = { ...payload.address, department: args.department };
        if (args?.type) payload.type = args.type;
        if (args?.regime) payload.regime = args.regime;
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("PUT", `/contacts/${args?.contactId}`, payload), null, 2) }] };
      }
      case "delete_contact":
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("DELETE", `/contacts/${args?.contactId}`), null, 2) }] };
      case "list_contacts": {
        const params = new URLSearchParams();
        if (args?.start) params.set("start", String(args.start));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.type) params.set("type", args.type);
        if (args?.query) params.set("query", args.query);
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("GET", `/contacts?${params}`), null, 2) }] };
      }
      case "create_item": {
        const payload: any = {
          name: args?.name,
          price: [{ price: args?.price }],
        };
        if (args?.description) payload.description = args.description;
        if (args?.reference) payload.reference = args.reference;
        if (args?.category) payload.category = { id: args.category };
        if (args?.inventory) payload.inventory = args.inventory;
        if (args?.tax) payload.tax = args.tax;
        if (args?.type) payload.type = args.type;
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("POST", "/items", payload), null, 2) }] };
      }
      case "update_item": {
        const payload: any = {};
        if (args?.name) payload.name = args.name;
        if (args?.description) payload.description = args.description;
        if (args?.reference) payload.reference = args.reference;
        if (args?.price !== undefined) payload.price = [{ price: args.price }];
        if (args?.category) payload.category = { id: args.category };
        if (args?.tax) payload.tax = args.tax;
        if (args?.type) payload.type = args.type;
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("PUT", `/items/${args?.itemId}`, payload), null, 2) }] };
      }
      case "list_items": {
        const params = new URLSearchParams();
        if (args?.start) params.set("start", String(args.start));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.type) params.set("type", args.type);
        if (args?.query) params.set("query", args.query);
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("GET", `/items?${params}`), null, 2) }] };
      }
      case "list_payments": {
        const params = new URLSearchParams();
        if (args?.start) params.set("start", String(args.start));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.date_from) params.set("date", args.date_from);
        if (args?.date_to) params.set("date_end", args.date_to);
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("GET", `/payments?${params}`), null, 2) }] };
      }
      case "get_payment":
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("GET", `/payments/${args?.paymentId}`), null, 2) }] };
      case "create_payment": {
        const payload: any = {
          date: args?.date,
          amount: args?.amount,
        };
        if (args?.bank_account) payload.bankAccount = args.bank_account;
        if (args?.payment_method) payload.paymentMethod = args.payment_method;
        if (args?.invoices) payload.invoices = args.invoices;
        if (args?.client) payload.client = args.client;
        if (args?.observations) payload.observations = args.observations;
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("POST", "/payments", payload), null, 2) }] };
      }
      case "void_payment":
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("PUT", `/payments/${args?.paymentId}/void`, { status: "void" }), null, 2) }] };
      case "list_categories": {
        const params = new URLSearchParams();
        if (args?.start) params.set("start", String(args.start));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.query) params.set("query", args.query);
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("GET", `/categories?${params}`), null, 2) }] };
      }
      case "list_bank_accounts": {
        const params = new URLSearchParams();
        if (args?.start) params.set("start", String(args.start));
        if (args?.limit) params.set("limit", String(args.limit));
        if (args?.type) params.set("type", args.type);
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("GET", `/bank-accounts?${params}`), null, 2) }] };
      }
      case "get_company":
        return { content: [{ type: "text", text: JSON.stringify(await alegraRequest("GET", "/company"), null, 2) }] };
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
        const s = new Server({ name: "mcp-alegra", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
