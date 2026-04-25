#!/usr/bin/env node

/**
 * MCP Server for Siigo — Colombian accounting + DIAN e-invoicing.
 *
 * Tools:
 * - create_invoice: Create an invoice (DIAN electronic invoice)
 * - get_invoice: Get invoice by ID
 * - list_invoices: List invoices
 * - get_invoice_pdf: Get the PDF for an invoice
 * - create_credit_note: Create a credit note
 * - get_credit_note: Get credit note by ID
 * - list_credit_notes: List credit notes
 * - list_customers: List customers
 * - create_customer: Create a customer
 * - update_customer: Update an existing customer
 * - delete_customer: Delete a customer
 * - list_products: List products
 * - create_product: Create a product
 * - update_product: Update an existing product
 * - delete_product: Delete a product
 * - create_purchase: Create a purchase document
 * - list_purchases: List purchase documents
 * - list_document_types: List document types (by document type)
 * - list_users: List Siigo users
 * - list_warehouses: List warehouses (bodegas)
 * - list_taxes: List available tax types
 * - list_payment_methods: List payment methods
 *
 * Environment:
 *   SIIGO_API_KEY      — API key
 *   SIIGO_ACCESS_TOKEN — Access token (Bearer)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ACCESS_TOKEN = process.env.SIIGO_ACCESS_TOKEN || "";
const BASE_URL = "https://api.siigo.com/v1";

async function siigoRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Authorization": `Bearer ${ACCESS_TOKEN}`,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Siigo API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-siigo", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_invoice",
      description: "Create an invoice (DIAN electronic invoice)",
      inputSchema: {
        type: "object",
        properties: {
          document: {
            type: "object",
            description: "Document type",
            properties: { id: { type: "number", description: "Document type ID" } },
            required: ["id"],
          },
          date: { type: "string", description: "Invoice date (YYYY-MM-DD)" },
          customer: {
            type: "object",
            description: "Customer reference",
            properties: {
              identification: { type: "string", description: "Customer NIT or CC" },
              branch_office: { type: "number", description: "Branch office (default 0)" },
            },
            required: ["identification"],
          },
          items: {
            type: "array",
            description: "Invoice items",
            items: {
              type: "object",
              properties: {
                code: { type: "string", description: "Product code" },
                description: { type: "string", description: "Description" },
                quantity: { type: "number", description: "Quantity" },
                price: { type: "number", description: "Unit price" },
                discount: { type: "number", description: "Discount percentage" },
                taxes: {
                  type: "array",
                  description: "Taxes",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "number", description: "Tax ID" },
                      name: { type: "string", description: "Tax name" },
                      percentage: { type: "number", description: "Tax percentage" },
                    },
                  },
                },
              },
              required: ["code", "quantity", "price"],
            },
          },
          payments: {
            type: "array",
            description: "Payment methods",
            items: {
              type: "object",
              properties: {
                id: { type: "number", description: "Payment method ID" },
                value: { type: "number", description: "Payment amount" },
              },
              required: ["id", "value"],
            },
          },
        },
        required: ["document", "date", "customer", "items", "payments"],
      },
    },
    {
      name: "get_invoice",
      description: "Get invoice details by ID",
      inputSchema: {
        type: "object",
        properties: { invoiceId: { type: "string", description: "Invoice ID" } },
        required: ["invoiceId"],
      },
    },
    {
      name: "list_invoices",
      description: "List invoices",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          page_size: { type: "number", description: "Page size (max 100)" },
          date_start: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_end: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
      },
    },
    {
      name: "create_credit_note",
      description: "Create a credit note against an invoice",
      inputSchema: {
        type: "object",
        properties: {
          document: {
            type: "object",
            description: "Document type",
            properties: { id: { type: "number", description: "Document type ID for credit notes" } },
            required: ["id"],
          },
          date: { type: "string", description: "Credit note date (YYYY-MM-DD)" },
          customer: {
            type: "object",
            description: "Customer reference",
            properties: { identification: { type: "string", description: "Customer NIT or CC" } },
            required: ["identification"],
          },
          items: {
            type: "array",
            description: "Items to credit",
            items: {
              type: "object",
              properties: {
                code: { type: "string", description: "Product code" },
                quantity: { type: "number", description: "Quantity" },
                price: { type: "number", description: "Unit price" },
              },
              required: ["code", "quantity", "price"],
            },
          },
          reason: { type: "string", description: "Reason for the credit note" },
        },
        required: ["document", "date", "customer", "items"],
      },
    },
    {
      name: "list_customers",
      description: "List customers",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          page_size: { type: "number", description: "Page size" },
          identification: { type: "string", description: "Filter by NIT/CC" },
        },
      },
    },
    {
      name: "create_customer",
      description: "Create a customer",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Customer type (Customer, Supplier, Other)" },
          person_type: { type: "string", description: "Person type (Person, Company)" },
          id_type: { type: "string", description: "ID type (13=CC, 31=NIT, 22=CE)" },
          identification: { type: "string", description: "NIT or CC number" },
          name: { type: "array", description: "Name array [first_name, last_name]", items: { type: "string" } },
          commercial_name: { type: "string", description: "Commercial/business name" },
          contacts: {
            type: "array",
            description: "Contact info",
            items: {
              type: "object",
              properties: {
                first_name: { type: "string", description: "First name" },
                last_name: { type: "string", description: "Last name" },
                email: { type: "string", description: "Email" },
                phone: { type: "string", description: "Phone" },
              },
            },
          },
          address: {
            type: "object",
            description: "Address",
            properties: {
              address: { type: "string", description: "Street address" },
              city: { type: "object", properties: { country_code: { type: "string" }, state_code: { type: "string" }, city_code: { type: "string" } } },
            },
          },
        },
        required: ["type", "person_type", "id_type", "identification", "name"],
      },
    },
    {
      name: "list_products",
      description: "List products",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          page_size: { type: "number", description: "Page size" },
          code: { type: "string", description: "Filter by product code" },
        },
      },
    },
    {
      name: "create_product",
      description: "Create a product",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Product code" },
          name: { type: "string", description: "Product name" },
          account_group: { type: "number", description: "Account group ID" },
          type: { type: "string", description: "Product type (Product, Service)" },
          stock_control: { type: "boolean", description: "Enable stock control" },
          unit: { type: "string", description: "Unit of measure" },
          taxes: {
            type: "array",
            description: "Tax configuration",
            items: {
              type: "object",
              properties: {
                id: { type: "number", description: "Tax ID" },
              },
            },
          },
          prices: {
            type: "array",
            description: "Price list",
            items: {
              type: "object",
              properties: {
                currency_code: { type: "string", description: "Currency (COP)" },
                price_list: { type: "array", items: { type: "object", properties: { position: { type: "number" }, value: { type: "number" } } } },
              },
            },
          },
        },
        required: ["code", "name"],
      },
    },
    {
      name: "get_invoice_pdf",
      description: "Get the PDF document for an invoice",
      inputSchema: {
        type: "object",
        properties: { invoiceId: { type: "string", description: "Invoice ID" } },
        required: ["invoiceId"],
      },
    },
    {
      name: "get_credit_note",
      description: "Get a credit note by ID",
      inputSchema: {
        type: "object",
        properties: { creditNoteId: { type: "string", description: "Credit note ID" } },
        required: ["creditNoteId"],
      },
    },
    {
      name: "list_credit_notes",
      description: "List credit notes",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          page_size: { type: "number", description: "Page size (max 100)" },
          date_start: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_end: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
      },
    },
    {
      name: "update_customer",
      description: "Update an existing customer",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "Customer ID" },
          commercial_name: { type: "string", description: "Commercial/business name" },
          name: { type: "array", description: "Name array [first_name, last_name]", items: { type: "string" } },
          contacts: {
            type: "array",
            description: "Contact info",
            items: {
              type: "object",
              properties: {
                first_name: { type: "string", description: "First name" },
                last_name: { type: "string", description: "Last name" },
                email: { type: "string", description: "Email" },
                phone: { type: "string", description: "Phone" },
              },
            },
          },
          address: {
            type: "object",
            description: "Address",
            properties: {
              address: { type: "string", description: "Street address" },
              city: { type: "object", properties: { country_code: { type: "string" }, state_code: { type: "string" }, city_code: { type: "string" } } },
            },
          },
        },
        required: ["customerId"],
      },
    },
    {
      name: "delete_customer",
      description: "Delete a customer",
      inputSchema: {
        type: "object",
        properties: { customerId: { type: "string", description: "Customer ID" } },
        required: ["customerId"],
      },
    },
    {
      name: "update_product",
      description: "Update an existing product",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", description: "Product ID" },
          code: { type: "string", description: "Product code" },
          name: { type: "string", description: "Product name" },
          account_group: { type: "number", description: "Account group ID" },
          type: { type: "string", description: "Product type (Product, Service)" },
          stock_control: { type: "boolean", description: "Enable stock control" },
          unit: { type: "string", description: "Unit of measure" },
          taxes: {
            type: "array",
            description: "Tax configuration",
            items: { type: "object", properties: { id: { type: "number", description: "Tax ID" } } },
          },
          prices: {
            type: "array",
            description: "Price list",
            items: {
              type: "object",
              properties: {
                currency_code: { type: "string", description: "Currency (COP)" },
                price_list: { type: "array", items: { type: "object", properties: { position: { type: "number" }, value: { type: "number" } } } },
              },
            },
          },
        },
        required: ["productId"],
      },
    },
    {
      name: "delete_product",
      description: "Delete a product",
      inputSchema: {
        type: "object",
        properties: { productId: { type: "string", description: "Product ID" } },
        required: ["productId"],
      },
    },
    {
      name: "create_purchase",
      description: "Create a purchase document",
      inputSchema: {
        type: "object",
        properties: {
          document: {
            type: "object",
            description: "Document type",
            properties: { id: { type: "number", description: "Document type ID for purchases" } },
            required: ["id"],
          },
          date: { type: "string", description: "Purchase date (YYYY-MM-DD)" },
          supplier: {
            type: "object",
            description: "Supplier reference",
            properties: { identification: { type: "string", description: "Supplier NIT or CC" } },
            required: ["identification"],
          },
          cost_center: { type: "number", description: "Cost center ID" },
          provider_invoice: {
            type: "object",
            description: "Provider invoice info",
            properties: {
              prefix: { type: "string", description: "Invoice prefix" },
              number: { type: "string", description: "Invoice number" },
            },
          },
          items: {
            type: "array",
            description: "Purchase items",
            items: {
              type: "object",
              properties: {
                code: { type: "string", description: "Product code" },
                description: { type: "string", description: "Description" },
                quantity: { type: "number", description: "Quantity" },
                price: { type: "number", description: "Unit price" },
                taxes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { id: { type: "number" }, name: { type: "string" }, percentage: { type: "number" } },
                  },
                },
              },
              required: ["code", "quantity", "price"],
            },
          },
          payments: {
            type: "array",
            description: "Payment methods",
            items: {
              type: "object",
              properties: {
                id: { type: "number", description: "Payment method ID" },
                value: { type: "number", description: "Payment amount" },
              },
              required: ["id", "value"],
            },
          },
        },
        required: ["document", "date", "supplier", "items", "payments"],
      },
    },
    {
      name: "list_purchases",
      description: "List purchase documents",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          page_size: { type: "number", description: "Page size (max 100)" },
          date_start: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_end: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
      },
    },
    {
      name: "list_document_types",
      description: "List document types (e.g., FV for invoice, NC for credit note, FC for purchase)",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "Document type code: FV (invoice), NC (credit note), FC (purchase), RC (receipt), etc." },
        },
      },
    },
    {
      name: "list_users",
      description: "List Siigo users (sellers)",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          page_size: { type: "number", description: "Page size" },
        },
      },
    },
    {
      name: "list_warehouses",
      description: "List warehouses (bodegas)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_taxes",
      description: "List available tax types",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_payment_methods",
      description: "List available payment methods",
      inputSchema: { type: "object", properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("POST", "/invoices", {
          document: args?.document,
          date: args?.date,
          customer: args?.customer,
          items: args?.items,
          payments: args?.payments,
        }), null, 2) }] };
      case "get_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("GET", `/invoices/${args?.invoiceId}`), null, 2) }] };
      case "list_invoices": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.page_size) params.set("page_size", String(args.page_size));
        if (args?.date_start) params.set("date_start", args.date_start);
        if (args?.date_end) params.set("date_end", args.date_end);
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("GET", `/invoices?${params}`), null, 2) }] };
      }
      case "create_credit_note":
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("POST", "/credit-notes", {
          document: args?.document,
          date: args?.date,
          customer: args?.customer,
          items: args?.items,
          reason: args?.reason,
        }), null, 2) }] };
      case "list_customers": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.page_size) params.set("page_size", String(args.page_size));
        if (args?.identification) params.set("identification", args.identification);
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("GET", `/customers?${params}`), null, 2) }] };
      }
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("POST", "/customers", {
          type: args?.type,
          person_type: args?.person_type,
          id_type: args?.id_type,
          identification: args?.identification,
          name: args?.name,
          commercial_name: args?.commercial_name,
          contacts: args?.contacts,
          address: args?.address,
        }), null, 2) }] };
      case "list_products": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.page_size) params.set("page_size", String(args.page_size));
        if (args?.code) params.set("code", args.code);
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("GET", `/products?${params}`), null, 2) }] };
      }
      case "create_product":
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("POST", "/products", {
          code: args?.code,
          name: args?.name,
          account_group: args?.account_group,
          type: args?.type,
          stock_control: args?.stock_control,
          unit: args?.unit,
          taxes: args?.taxes,
          prices: args?.prices,
        }), null, 2) }] };
      case "get_invoice_pdf":
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("GET", `/invoices/${args?.invoiceId}/pdf`), null, 2) }] };
      case "get_credit_note":
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("GET", `/credit-notes/${args?.creditNoteId}`), null, 2) }] };
      case "list_credit_notes": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.page_size) params.set("page_size", String(args.page_size));
        if (args?.date_start) params.set("date_start", args.date_start);
        if (args?.date_end) params.set("date_end", args.date_end);
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("GET", `/credit-notes?${params}`), null, 2) }] };
      }
      case "update_customer":
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("PUT", `/customers/${args?.customerId}`, {
          commercial_name: args?.commercial_name,
          name: args?.name,
          contacts: args?.contacts,
          address: args?.address,
        }), null, 2) }] };
      case "delete_customer":
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("DELETE", `/customers/${args?.customerId}`), null, 2) }] };
      case "update_product":
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("PUT", `/products/${args?.productId}`, {
          code: args?.code,
          name: args?.name,
          account_group: args?.account_group,
          type: args?.type,
          stock_control: args?.stock_control,
          unit: args?.unit,
          taxes: args?.taxes,
          prices: args?.prices,
        }), null, 2) }] };
      case "delete_product":
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("DELETE", `/products/${args?.productId}`), null, 2) }] };
      case "create_purchase":
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("POST", "/purchases", {
          document: args?.document,
          date: args?.date,
          supplier: args?.supplier,
          cost_center: args?.cost_center,
          provider_invoice: args?.provider_invoice,
          items: args?.items,
          payments: args?.payments,
        }), null, 2) }] };
      case "list_purchases": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.page_size) params.set("page_size", String(args.page_size));
        if (args?.date_start) params.set("date_start", args.date_start);
        if (args?.date_end) params.set("date_end", args.date_end);
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("GET", `/purchases?${params}`), null, 2) }] };
      }
      case "list_document_types": {
        const params = new URLSearchParams();
        if (args?.type) params.set("type", args.type);
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("GET", qs ? `/document-types?${qs}` : "/document-types"), null, 2) }] };
      }
      case "list_users": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.page_size) params.set("page_size", String(args.page_size));
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("GET", qs ? `/users?${qs}` : "/users"), null, 2) }] };
      }
      case "list_warehouses":
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("GET", "/warehouses"), null, 2) }] };
      case "list_taxes":
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("GET", "/taxes"), null, 2) }] };
      case "list_payment_methods":
        return { content: [{ type: "text", text: JSON.stringify(await siigoRequest("GET", "/payment-types"), null, 2) }] };
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
        const s = new Server({ name: "mcp-siigo", version: "0.2.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
