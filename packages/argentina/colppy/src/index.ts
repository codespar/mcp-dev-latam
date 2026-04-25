#!/usr/bin/env node

/**
 * MCP Server for Colppy — Argentine cloud accounting + AFIP invoicing.
 *
 * Tools:
 * - list_customers / create_customer / update_customer / delete_customer / get_customer_balance
 * - list_suppliers / create_supplier
 * - list_products / update_product / get_stock
 * - list_warehouses
 * - create_invoice / list_invoices / cancel_invoice / get_invoice_pdf
 * - create_receipt / list_receipts
 * - create_payment
 * - get_balance / list_accounts
 * - list_companies
 * - sales_report / expenses_report
 *
 * Environment:
 *   COLPPY_API_KEY    — API key
 *   COLPPY_COMPANY_ID — Company identifier
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.COLPPY_API_KEY || "";
const COMPANY_ID = process.env.COLPPY_COMPANY_ID || "";
const BASE_URL = "https://login.colppy.com/lib/frontera2";

async function colppyRequest(service: string, operation: string, params?: Record<string, unknown>): Promise<unknown> {
  const payload = {
    service,
    operation,
    parameters: {
      ...params,
      sespiKey: API_KEY,
      idEmpresa: COMPANY_ID,
    },
  };

  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Colppy API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-colppy", version: "0.2.0-alpha.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_customers",
      description: "List customers",
      inputSchema: {
        type: "object",
        properties: {
          filter: { type: "string", description: "Search filter (name or tax ID)" },
          offset: { type: "number", description: "Pagination offset" },
          limit: { type: "number", description: "Results limit" },
        },
      },
    },
    {
      name: "create_customer",
      description: "Create a customer",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Customer name or business name" },
          tax_id: { type: "string", description: "CUIT/CUIL/DNI number" },
          tax_id_type: { type: "string", description: "Document type (CUIT, CUIL, DNI)" },
          tax_category: { type: "string", description: "Tax category (RI, Monotributo, Exento, ConsumidorFinal)" },
          email: { type: "string", description: "Email address" },
          phone: { type: "string", description: "Phone number" },
          address: { type: "string", description: "Street address" },
        },
        required: ["name", "tax_id"],
      },
    },
    {
      name: "list_products",
      description: "List products and services",
      inputSchema: {
        type: "object",
        properties: {
          filter: { type: "string", description: "Search filter" },
          offset: { type: "number", description: "Pagination offset" },
          limit: { type: "number", description: "Results limit" },
        },
      },
    },
    {
      name: "create_invoice",
      description: "Create an invoice (integrates with AFIP for electronic invoicing)",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Customer ID" },
          invoice_type: { type: "string", description: "Invoice type (A, B, C)" },
          point_of_sale: { type: "number", description: "Punto de venta" },
          items: {
            type: "array",
            description: "Invoice items",
            items: {
              type: "object",
              properties: {
                product_id: { type: "string", description: "Product ID" },
                description: { type: "string", description: "Description" },
                quantity: { type: "number", description: "Quantity" },
                unit_price: { type: "number", description: "Unit price" },
                iva_rate: { type: "number", description: "IVA rate (21, 10.5, 27, 0)" },
              },
              required: ["description", "quantity", "unit_price"],
            },
          },
          currency: { type: "string", description: "Currency (ARS, USD)" },
        },
        required: ["customer_id", "invoice_type", "items"],
      },
    },
    {
      name: "list_invoices",
      description: "List invoices",
      inputSchema: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          customer_id: { type: "string", description: "Filter by customer" },
          status: { type: "string", description: "Filter by status" },
          offset: { type: "number", description: "Pagination offset" },
          limit: { type: "number", description: "Results limit" },
        },
      },
    },
    {
      name: "get_balance",
      description: "Get account balance summary",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Balance date (YYYY-MM-DD)" },
        },
      },
    },
    {
      name: "list_accounts",
      description: "List chart of accounts (plan de cuentas)",
      inputSchema: {
        type: "object",
        properties: {
          filter: { type: "string", description: "Search filter" },
        },
      },
    },
    {
      name: "create_payment",
      description: "Record a payment against an invoice",
      inputSchema: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "Invoice ID" },
          amount: { type: "number", description: "Payment amount" },
          payment_method: { type: "string", description: "Payment method (cash, bank_transfer, check, card)" },
          date: { type: "string", description: "Payment date (YYYY-MM-DD)" },
          reference: { type: "string", description: "Payment reference" },
        },
        required: ["invoice_id", "amount", "payment_method"],
      },
    },
    {
      name: "update_customer",
      description: "Update an existing customer's data",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Customer ID" },
          name: { type: "string", description: "Customer name or business name" },
          email: { type: "string", description: "Email address" },
          phone: { type: "string", description: "Phone number" },
          address: { type: "string", description: "Street address" },
          tax_category: { type: "string", description: "Tax category (RI, Monotributo, Exento, ConsumidorFinal)" },
        },
        required: ["customer_id"],
      },
    },
    {
      name: "delete_customer",
      description: "Delete a customer",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Customer ID" },
        },
        required: ["customer_id"],
      },
    },
    {
      name: "get_customer_balance",
      description: "Get the current account balance (cuenta corriente) for a customer",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Customer ID" },
          date: { type: "string", description: "As-of date (YYYY-MM-DD)" },
        },
        required: ["customer_id"],
      },
    },
    {
      name: "list_suppliers",
      description: "List suppliers (proveedores)",
      inputSchema: {
        type: "object",
        properties: {
          filter: { type: "string", description: "Search filter (name or tax ID)" },
          offset: { type: "number", description: "Pagination offset" },
          limit: { type: "number", description: "Results limit" },
        },
      },
    },
    {
      name: "create_supplier",
      description: "Create a supplier (proveedor)",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Supplier name or business name" },
          tax_id: { type: "string", description: "CUIT number" },
          tax_category: { type: "string", description: "Tax category (RI, Monotributo, Exento)" },
          email: { type: "string", description: "Email address" },
          phone: { type: "string", description: "Phone number" },
          address: { type: "string", description: "Street address" },
        },
        required: ["name", "tax_id"],
      },
    },
    {
      name: "cancel_invoice",
      description: "Cancel/void an invoice (anular comprobante)",
      inputSchema: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "Invoice ID" },
          reason: { type: "string", description: "Cancellation reason" },
        },
        required: ["invoice_id"],
      },
    },
    {
      name: "get_invoice_pdf",
      description: "Get the PDF representation of an invoice (returns URL or base64)",
      inputSchema: {
        type: "object",
        properties: {
          invoice_id: { type: "string", description: "Invoice ID" },
        },
        required: ["invoice_id"],
      },
    },
    {
      name: "create_receipt",
      description: "Create a receipt (recibo) — record cash/transfer received against one or more invoices",
      inputSchema: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "Customer ID" },
          date: { type: "string", description: "Receipt date (YYYY-MM-DD)" },
          amount: { type: "number", description: "Total receipt amount" },
          payment_method: { type: "string", description: "Payment method (cash, bank_transfer, check, card)" },
          invoice_ids: {
            type: "array",
            description: "Invoice IDs being paid",
            items: { type: "string" },
          },
          reference: { type: "string", description: "Receipt reference" },
        },
        required: ["customer_id", "amount", "payment_method"],
      },
    },
    {
      name: "list_receipts",
      description: "List receipts (recibos)",
      inputSchema: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          customer_id: { type: "string", description: "Filter by customer" },
          offset: { type: "number", description: "Pagination offset" },
          limit: { type: "number", description: "Results limit" },
        },
      },
    },
    {
      name: "get_stock",
      description: "Get current stock for a product across warehouses",
      inputSchema: {
        type: "object",
        properties: {
          product_id: { type: "string", description: "Product ID" },
          warehouse_id: { type: "string", description: "Optional warehouse (depósito) ID filter" },
        },
        required: ["product_id"],
      },
    },
    {
      name: "list_warehouses",
      description: "List warehouses (depósitos)",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "list_companies",
      description: "List companies (empresas) accessible to the current API user",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "sales_report",
      description: "Sales report by date range",
      inputSchema: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          customer_id: { type: "string", description: "Optional customer filter" },
        },
        required: ["date_from", "date_to"],
      },
    },
    {
      name: "expenses_report",
      description: "Expenses/purchases report by date range",
      inputSchema: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          supplier_id: { type: "string", description: "Optional supplier filter" },
        },
        required: ["date_from", "date_to"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_customers": {
        const params: Record<string, unknown> = {};
        if (args?.filter) params.filter = args.filter;
        if (args?.offset) params.offset = args.offset;
        if (args?.limit) params.limit = args.limit;
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("cliente", "listar", params), null, 2) }] };
      }
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("cliente", "crear", {
          razonSocial: args?.name,
          cuit: args?.tax_id,
          tipoDocumento: args?.tax_id_type,
          categoriaFiscal: args?.tax_category,
          email: args?.email,
          telefono: args?.phone,
          direccion: args?.address,
        }), null, 2) }] };
      case "list_products": {
        const params: Record<string, unknown> = {};
        if (args?.filter) params.filter = args.filter;
        if (args?.offset) params.offset = args.offset;
        if (args?.limit) params.limit = args.limit;
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("producto", "listar", params), null, 2) }] };
      }
      case "create_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("factura", "crear", {
          idCliente: args?.customer_id,
          tipoComprobante: args?.invoice_type,
          puntoVenta: args?.point_of_sale,
          items: args?.items,
          moneda: args?.currency,
        }), null, 2) }] };
      case "list_invoices": {
        const params: Record<string, unknown> = {};
        if (args?.date_from) params.fechaDesde = args.date_from;
        if (args?.date_to) params.fechaHasta = args.date_to;
        if (args?.customer_id) params.idCliente = args.customer_id;
        if (args?.status) params.estado = args.status;
        if (args?.offset) params.offset = args.offset;
        if (args?.limit) params.limit = args.limit;
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("factura", "listar", params), null, 2) }] };
      }
      case "get_balance": {
        const params: Record<string, unknown> = {};
        if (args?.date) params.fecha = args.date;
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("balance", "obtener", params), null, 2) }] };
      }
      case "list_accounts": {
        const params: Record<string, unknown> = {};
        if (args?.filter) params.filter = args.filter;
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("cuenta", "listar", params), null, 2) }] };
      }
      case "create_payment":
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("pago", "crear", {
          idFactura: args?.invoice_id,
          monto: args?.amount,
          metodoPago: args?.payment_method,
          fecha: args?.date,
          referencia: args?.reference,
        }), null, 2) }] };
      case "update_customer":
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("cliente", "modificar", {
          idCliente: args?.customer_id,
          razonSocial: args?.name,
          email: args?.email,
          telefono: args?.phone,
          direccion: args?.address,
          categoriaFiscal: args?.tax_category,
        }), null, 2) }] };
      case "delete_customer":
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("cliente", "eliminar", {
          idCliente: args?.customer_id,
        }), null, 2) }] };
      case "get_customer_balance": {
        const params: Record<string, unknown> = { idCliente: args?.customer_id };
        if (args?.date) params.fecha = args.date;
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("cliente", "saldo", params), null, 2) }] };
      }
      case "list_suppliers": {
        const params: Record<string, unknown> = {};
        if (args?.filter) params.filter = args.filter;
        if (args?.offset) params.offset = args.offset;
        if (args?.limit) params.limit = args.limit;
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("proveedor", "listar", params), null, 2) }] };
      }
      case "create_supplier":
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("proveedor", "crear", {
          razonSocial: args?.name,
          cuit: args?.tax_id,
          categoriaFiscal: args?.tax_category,
          email: args?.email,
          telefono: args?.phone,
          direccion: args?.address,
        }), null, 2) }] };
      case "cancel_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("factura", "anular", {
          idFactura: args?.invoice_id,
          motivo: args?.reason,
        }), null, 2) }] };
      case "get_invoice_pdf":
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("factura", "obtenerPDF", {
          idFactura: args?.invoice_id,
        }), null, 2) }] };
      case "create_receipt":
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("recibo", "crear", {
          idCliente: args?.customer_id,
          fecha: args?.date,
          monto: args?.amount,
          metodoPago: args?.payment_method,
          idsFactura: args?.invoice_ids,
          referencia: args?.reference,
        }), null, 2) }] };
      case "list_receipts": {
        const params: Record<string, unknown> = {};
        if (args?.date_from) params.fechaDesde = args.date_from;
        if (args?.date_to) params.fechaHasta = args.date_to;
        if (args?.customer_id) params.idCliente = args.customer_id;
        if (args?.offset) params.offset = args.offset;
        if (args?.limit) params.limit = args.limit;
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("recibo", "listar", params), null, 2) }] };
      }
      case "get_stock": {
        const params: Record<string, unknown> = { idProducto: args?.product_id };
        if (args?.warehouse_id) params.idDeposito = args.warehouse_id;
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("inventario", "stock", params), null, 2) }] };
      }
      case "list_warehouses":
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("deposito", "listar", {}), null, 2) }] };
      case "list_companies":
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("empresa", "listar", {}), null, 2) }] };
      case "sales_report": {
        const params: Record<string, unknown> = {
          fechaDesde: args?.date_from,
          fechaHasta: args?.date_to,
        };
        if (args?.customer_id) params.idCliente = args.customer_id;
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("reporte", "ventas", params), null, 2) }] };
      }
      case "expenses_report": {
        const params: Record<string, unknown> = {
          fechaDesde: args?.date_from,
          fechaHasta: args?.date_to,
        };
        if (args?.supplier_id) params.idProveedor = args.supplier_id;
        return { content: [{ type: "text", text: JSON.stringify(await colppyRequest("reporte", "compras", params), null, 2) }] };
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
        const s = new Server({ name: "mcp-colppy", version: "0.2.0-alpha.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
