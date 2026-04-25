#!/usr/bin/env node

/**
 * MCP Server for AFIP — Argentine tax authority, electronic invoicing (Factura Electrónica).
 *
 * Tools (WSFE / WS_SR_PADRON):
 * - create_invoice: Create an electronic invoice (FECAESolicitar — single)
 * - create_invoice_batch: Create up to 250 invoices in a single CAE request (FECAESolicitar — batch)
 * - create_credit_note: Issue a credit note (Nota de Crédito A/B/C)
 * - create_debit_note: Issue a debit note (Nota de Débito A/B/C)
 * - cancel_invoice: Cancel/void an authorized invoice where applicable (FECancel)
 * - get_invoice: Get invoice details (FECompConsultar)
 * - get_invoice_total_x_request: Max records per request (FECompTotXRequest)
 * - get_last_invoice_number: Last authorized invoice number (FECompUltimoAutorizado)
 * - get_cae_status: Check CAE authorization status
 * - list_invoice_types: Invoice types (FEParamGetTiposCbte)
 * - list_concept_types: Concept types (FEParamGetTiposConcepto)
 * - list_doc_types: Document types (FEParamGetTiposDoc)
 * - list_iva_types: IVA aliquots (FEParamGetTiposIva)
 * - list_currency_types: Currencies (FEParamGetTiposMonedas)
 * - list_tax_types: Tax types (FEParamGetTiposTributos)
 * - get_currency_rate: FX rate for a currency (FEParamGetCotizacion)
 * - get_server_status: AFIP web-service availability
 * - get_authorized_points_of_sale: List authorized puntos de venta
 * - lookup_taxpayer: Padrón lookup by CUIT (A4/A5/A13)
 * - get_registration_certificate: Constancia de inscripción for a CUIT
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
  { name: "mcp-afip", version: "0.2.0-alpha.2" },
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
    {
      name: "create_invoice_batch",
      description: "Create a batch of invoices in a single CAE request (FECAESolicitar, up to 250)",
      inputSchema: {
        type: "object",
        properties: {
          point_of_sale: { type: "number", description: "Punto de venta number" },
          invoice_type: { type: "number", description: "Invoice type code (1=A, 6=B, 11=C, etc.)" },
          invoices: {
            type: "array",
            description: "Invoice records (max 250 per request)",
            items: {
              type: "object",
              properties: {
                concept: { type: "number", description: "Concept (1=Products, 2=Services, 3=Both)" },
                doc_type: { type: "number", description: "Document type" },
                doc_number: { type: "number", description: "Document number" },
                invoice_number: { type: "number", description: "CbteDesde/CbteHasta number" },
                amount_total: { type: "number", description: "Total amount" },
                amount_net: { type: "number", description: "Net taxable amount" },
                amount_iva: { type: "number", description: "IVA amount" },
                currency: { type: "string", description: "Currency code (PES=ARS, DOL=USD)" },
              },
              required: ["concept", "doc_type", "doc_number", "invoice_number", "amount_total"],
            },
          },
        },
        required: ["point_of_sale", "invoice_type", "invoices"],
      },
    },
    {
      name: "create_credit_note",
      description: "Issue a credit note (Nota de Crédito A/B/C: types 3, 8, 13) referencing an original invoice",
      inputSchema: {
        type: "object",
        properties: {
          point_of_sale: { type: "number", description: "Punto de venta number" },
          note_type: { type: "number", description: "Credit note type (3=A, 8=B, 13=C)" },
          concept: { type: "number", description: "Concept (1=Products, 2=Services, 3=Both)" },
          doc_type: { type: "number", description: "Customer document type" },
          doc_number: { type: "number", description: "Customer document number" },
          amount_total: { type: "number", description: "Total amount" },
          amount_net: { type: "number", description: "Net taxable amount" },
          amount_iva: { type: "number", description: "IVA amount" },
          currency: { type: "string", description: "Currency code" },
          related_invoice: {
            type: "object",
            description: "Original invoice reference (CbtesAsoc)",
            properties: {
              invoice_type: { type: "number", description: "Original invoice type" },
              point_of_sale: { type: "number", description: "Original punto de venta" },
              invoice_number: { type: "number", description: "Original invoice number" },
            },
            required: ["invoice_type", "point_of_sale", "invoice_number"],
          },
        },
        required: ["point_of_sale", "note_type", "concept", "doc_type", "doc_number", "amount_total", "related_invoice"],
      },
    },
    {
      name: "create_debit_note",
      description: "Issue a debit note (Nota de Débito A/B/C: types 2, 7, 12) referencing an original invoice",
      inputSchema: {
        type: "object",
        properties: {
          point_of_sale: { type: "number", description: "Punto de venta number" },
          note_type: { type: "number", description: "Debit note type (2=A, 7=B, 12=C)" },
          concept: { type: "number", description: "Concept (1=Products, 2=Services, 3=Both)" },
          doc_type: { type: "number", description: "Customer document type" },
          doc_number: { type: "number", description: "Customer document number" },
          amount_total: { type: "number", description: "Total amount" },
          amount_net: { type: "number", description: "Net taxable amount" },
          amount_iva: { type: "number", description: "IVA amount" },
          currency: { type: "string", description: "Currency code" },
          related_invoice: {
            type: "object",
            description: "Original invoice reference (CbtesAsoc)",
            properties: {
              invoice_type: { type: "number", description: "Original invoice type" },
              point_of_sale: { type: "number", description: "Original punto de venta" },
              invoice_number: { type: "number", description: "Original invoice number" },
            },
            required: ["invoice_type", "point_of_sale", "invoice_number"],
          },
        },
        required: ["point_of_sale", "note_type", "concept", "doc_type", "doc_number", "amount_total", "related_invoice"],
      },
    },
    {
      name: "cancel_invoice",
      description: "Cancel/void an authorized invoice (FECancel — limited to certain types/conditions)",
      inputSchema: {
        type: "object",
        properties: {
          point_of_sale: { type: "number", description: "Punto de venta number" },
          invoice_type: { type: "number", description: "Invoice type code" },
          invoice_number: { type: "number", description: "Invoice number" },
          reason: { type: "string", description: "Optional cancellation reason" },
        },
        required: ["point_of_sale", "invoice_type", "invoice_number"],
      },
    },
    {
      name: "get_invoice_total_x_request",
      description: "Max number of records allowed per FECAESolicitar request (FECompTotXRequest)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_concept_types",
      description: "List available concept types (FEParamGetTiposConcepto: 1=Products, 2=Services, 3=Both)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_doc_types",
      description: "List document/identifier types (FEParamGetTiposDoc: 80=CUIT, 86=CUIL, 96=DNI, 99=Consumer Final)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_iva_types",
      description: "List IVA tax aliquots (FEParamGetTiposIva: 21%, 10.5%, 27%, 0%, etc.)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_currency_types",
      description: "List supported currencies (FEParamGetTiposMonedas)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_currency_rate",
      description: "Get FX rate (cotización) for a currency vs ARS (FEParamGetCotizacion)",
      inputSchema: {
        type: "object",
        properties: {
          currency: { type: "string", description: "Currency code (e.g. DOL for USD)" },
          date: { type: "string", description: "Optional date YYYYMMDD; defaults to last business day" },
        },
        required: ["currency"],
      },
    },
    {
      name: "lookup_taxpayer",
      description: "Padrón lookup by CUIT (WS_SR_PADRON A4/A5/A13 — fiscal status, name, address)",
      inputSchema: {
        type: "object",
        properties: {
          cuit: { type: "string", description: "CUIT/CUIL to query (11 digits)" },
          scope: { type: "string", description: "Padrón scope: A4, A5, or A13 (default A5)" },
        },
        required: ["cuit"],
      },
    },
    {
      name: "get_registration_certificate",
      description: "Get constancia de inscripción (registration certificate) for a CUIT",
      inputSchema: {
        type: "object",
        properties: {
          cuit: { type: "string", description: "CUIT/CUIL (11 digits)" },
        },
        required: ["cuit"],
      },
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
      case "create_invoice_batch": {
        const payload: any = {
          point_of_sale: args?.point_of_sale,
          invoice_type: args?.invoice_type,
          invoices: args?.invoices,
        };
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("POST", "/wsfe/invoices/batch", payload), null, 2) }] };
      }
      case "create_credit_note": {
        const payload: any = {
          point_of_sale: args?.point_of_sale,
          note_type: args?.note_type,
          concept: args?.concept,
          doc_type: args?.doc_type,
          doc_number: args?.doc_number,
          amount_total: args?.amount_total,
          related_invoice: args?.related_invoice,
        };
        if (args?.amount_net) payload.amount_net = args.amount_net;
        if (args?.amount_iva) payload.amount_iva = args.amount_iva;
        if (args?.currency) payload.currency = args.currency;
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("POST", "/wsfe/credit-notes", payload), null, 2) }] };
      }
      case "create_debit_note": {
        const payload: any = {
          point_of_sale: args?.point_of_sale,
          note_type: args?.note_type,
          concept: args?.concept,
          doc_type: args?.doc_type,
          doc_number: args?.doc_number,
          amount_total: args?.amount_total,
          related_invoice: args?.related_invoice,
        };
        if (args?.amount_net) payload.amount_net = args.amount_net;
        if (args?.amount_iva) payload.amount_iva = args.amount_iva;
        if (args?.currency) payload.currency = args.currency;
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("POST", "/wsfe/debit-notes", payload), null, 2) }] };
      }
      case "cancel_invoice": {
        const payload: any = {
          point_of_sale: args?.point_of_sale,
          invoice_type: args?.invoice_type,
          invoice_number: args?.invoice_number,
        };
        if (args?.reason) payload.reason = args.reason;
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("POST", "/wsfe/cancel", payload), null, 2) }] };
      }
      case "get_invoice_total_x_request":
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("GET", "/wsfe/total-x-request"), null, 2) }] };
      case "list_concept_types":
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("GET", "/wsfe/concept-types"), null, 2) }] };
      case "list_doc_types":
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("GET", "/wsfe/doc-types"), null, 2) }] };
      case "list_iva_types":
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("GET", "/wsfe/iva-types"), null, 2) }] };
      case "list_currency_types":
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("GET", "/wsfe/currency-types"), null, 2) }] };
      case "get_currency_rate": {
        const qs = args?.date ? `?date=${encodeURIComponent(String(args.date))}` : "";
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("GET", `/wsfe/currency-rate/${encodeURIComponent(String(args?.currency))}${qs}`), null, 2) }] };
      }
      case "lookup_taxpayer": {
        const scope = (args?.scope as string) || "A5";
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("GET", `/padron/${encodeURIComponent(scope)}/${encodeURIComponent(String(args?.cuit))}`), null, 2) }] };
      }
      case "get_registration_certificate":
        return { content: [{ type: "text", text: JSON.stringify(await afipRequest("GET", `/padron/constancia/${encodeURIComponent(String(args?.cuit))}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-afip", version: "0.2.0-alpha.2" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
