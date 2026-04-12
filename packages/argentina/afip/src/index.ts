#!/usr/bin/env node

/**
 * MCP Server for AFIP — Argentine tax authority, electronic invoicing (Factura Electrónica).
 *
 * Tools:
 * - create_invoice: Create an electronic invoice (Factura Electrónica)
 * - get_invoice: Get invoice details by type and number
 * - get_last_invoice_number: Get last authorized invoice number for a POS
 * - get_cae_status: Check CAE authorization status
 * - list_invoice_types: List available invoice types (A, B, C, etc.)
 * - list_tax_types: List available tax types (IVA, percepciones, etc.)
 * - get_server_status: Check AFIP web-service availability
 * - get_authorized_points_of_sale: List authorized puntos de venta
 *
 * Environment:
 *   AFIP_CERT_PATH — Path to AFIP certificate (.crt)
 *   AFIP_KEY_PATH  — Path to AFIP private key (.key)
 *   AFIP_CUIT      — CUIT number
 *   AFIP_ENV        — "production" or "homologation" (default: homologation)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CERT_PATH = process.env.AFIP_CERT_PATH || "";
const KEY_PATH = process.env.AFIP_KEY_PATH || "";
const CUIT = process.env.AFIP_CUIT || "";
const AFIP_ENV = process.env.AFIP_ENV || "homologation";
const BASE_URL = AFIP_ENV === "production"
  ? "https://servicios1.afip.gov.ar"
  : "https://wswhomo.afip.gov.ar";

async function afipRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  if (CUIT) headers["X-AFIP-CUIT"] = CUIT;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`AFIP API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-afip", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_invoice",
      description: "Create an electronic invoice (Factura Electrónica) via AFIP",
      inputSchema: {
        type: "object",
        properties: {
          point_of_sale: { type: "number", description: "Punto de venta number" },
          invoice_type: { type: "number", description: "Invoice type code (1=A, 6=B, 11=C, etc.)" },
          concept: { type: "number", description: "Concept (1=Products, 2=Services, 3=Both)" },
          doc_type: { type: "number", description: "Document type (80=CUIT, 86=CUIL, 96=DNI, 99=Consumer Final)" },
          doc_number: { type: "number", description: "Document number of the customer" },
          amount_total: { type: "number", description: "Total invoice amount" },
          amount_net: { type: "number", description: "Net taxable amount" },
          amount_iva: { type: "number", description: "IVA tax amount" },
          currency: { type: "string", description: "Currency code (PES=ARS, DOL=USD)" },
          items: {
            type: "array",
            description: "Invoice line items",
            items: {
              type: "object",
              properties: {
                description: { type: "string", description: "Item description" },
                quantity: { type: "number", description: "Quantity" },
                unit_price: { type: "number", description: "Unit price" },
                iva_rate: { type: "number", description: "IVA rate (21, 10.5, 27, 0)" },
              },
              required: ["description", "quantity", "unit_price"],
            },
          },
        },
        required: ["point_of_sale", "invoice_type", "concept", "doc_type", "doc_number", "amount_total"],
      },
    },
    {
      name: "get_invoice",
      description: "Get invoice details by type, point of sale, and number",
      inputSchema: {
        type: "object",
        properties: {
          point_of_sale: { type: "number", description: "Punto de venta number" },
          invoice_type: { type: "number", description: "Invoice type code" },
          invoice_number: { type: "number", description: "Invoice number" },
        },
        required: ["point_of_sale", "invoice_type", "invoice_number"],
      },
    },
    {
      name: "get_last_invoice_number",
      description: "Get last authorized invoice number for a point of sale and type",
      inputSchema: {
        type: "object",
        properties: {
          point_of_sale: { type: "number", description: "Punto de venta number" },
          invoice_type: { type: "number", description: "Invoice type code" },
        },
        required: ["point_of_sale", "invoice_type"],
      },
    },
    {
      name: "get_cae_status",
      description: "Check CAE authorization status for an invoice",
      inputSchema: {
        type: "object",
        properties: {
          point_of_sale: { type: "number", description: "Punto de venta number" },
          invoice_type: { type: "number", description: "Invoice type code" },
          invoice_number: { type: "number", description: "Invoice number" },
        },
        required: ["point_of_sale", "invoice_type", "invoice_number"],
      },
    },
    {
      name: "list_invoice_types",
      description: "List available invoice types (Factura A, B, C, etc.)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_tax_types",
      description: "List available tax types (IVA, percepciones, retenciones, etc.)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_server_status",
      description: "Check AFIP web-service availability (WSFE status)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_authorized_points_of_sale",
      description: "List authorized puntos de venta for the CUIT",
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
          point_of_sale: args?.point_of_sale,
          invoice_type: args?.invoice_type,
          concept: args?.concept,
          doc_type: args?.doc_type,
          doc_number: args?.doc_number,
          amount_total: args?.amount_total,
        };
        if (args?.amount_net) payload.amount_net = args.amount_net;
        if (args?.amount_iva) payload.amount_iva = args.amount_iva;
        if (args?.currency) payload.currency = args.currency;
        if (args?.items) payload.items = args.items;
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("POST", "/wsfe/invoices", payload), null, 2) }] };
      }
      case "get_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("GET", `/wsfe/invoices/${args?.invoice_type}/${args?.point_of_sale}/${args?.invoice_number}`), null, 2) }] };
      case "get_last_invoice_number":
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("GET", `/wsfe/last-invoice/${args?.invoice_type}/${args?.point_of_sale}`), null, 2) }] };
      case "get_cae_status":
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("GET", `/wsfe/cae-status/${args?.invoice_type}/${args?.point_of_sale}/${args?.invoice_number}`), null, 2) }] };
      case "list_invoice_types":
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("GET", "/wsfe/invoice-types"), null, 2) }] };
      case "list_tax_types":
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("GET", "/wsfe/tax-types"), null, 2) }] };
      case "get_server_status":
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("GET", "/wsfe/status"), null, 2) }] };
      case "get_authorized_points_of_sale":
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("GET", "/wsfe/points-of-sale"), null, 2) }] };
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
        const s = new Server({ name: "mcp-afip", version: "0.1.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
