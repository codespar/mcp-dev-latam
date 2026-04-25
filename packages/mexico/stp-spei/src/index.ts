#!/usr/bin/env node

/**
 * MCP Server for STP/SPEI — Mexican instant bank transfers (equivalent to Brazil's PIX).
 *
 * Tools (18):
 * - create_transfer: Create a SPEI transfer
 * - get_transfer: Get transfer by ID
 * - list_transfers: List transfers with filters
 * - cancel_transfer: Cancel a pending orden by clave_rastreo
 * - get_balance: Get account balance
 * - list_account_balances: List balances for all accounts
 * - validate_account: Validate a CLABE account
 * - validate_clabe: Local CLABE structural + checksum validation
 * - list_banks: List participating banks
 * - lookup_bank_by_code: Look up bank by ABM/SPEI code
 * - get_cep: Get CEP (Comprobante Electrónico de Pago)
 * - register_beneficiary: Register a beneficiary account
 * - create_refund: Create a SPEI refund (devolución)
 * - list_refunds: List devoluciones by date range
 * - conciliation_report: Get transactions report by date for reconciliation
 * - register_webhook: Register a notification webhook URL
 * - list_webhooks: List registered webhooks
 * - delete_webhook: Delete a registered webhook
 *
 * Environment:
 *   STP_API_KEY — API key for authentication
 *   STP_COMPANY — Company identifier
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.STP_API_KEY || "";
const COMPANY = process.env.STP_COMPANY || "";
const BASE_URL = "https://demo.stpmex.com:7024/speiws/rest";

async function stpRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  if (COMPANY) headers["X-Company"] = COMPANY;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`STP API ${res.status}: ${err}`);
  }
  return res.json();
}

// Local CLABE checksum (mod-97 weighted) — no API call required.
function clabeChecksum(clabe: string): { valid: boolean; bankCode: string; plaza: string; account: string; checkDigit: string; computed: number } {
  if (!/^\d{18}$/.test(clabe)) {
    return { valid: false, bankCode: "", plaza: "", account: "", checkDigit: "", computed: -1 };
  }
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7];
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += (parseInt(clabe[i], 10) * weights[i]) % 10;
  const computed = (10 - (sum % 10)) % 10;
  const checkDigit = clabe[17];
  return {
    valid: computed === parseInt(checkDigit, 10),
    bankCode: clabe.substring(0, 3),
    plaza: clabe.substring(3, 6),
    account: clabe.substring(6, 17),
    checkDigit,
    computed,
  };
}

const server = new Server(
  { name: "mcp-stp-spei", version: "0.2.0-alpha.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_transfer",
      description: "Create a SPEI transfer",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Transfer amount in MXN" },
          beneficiary_name: { type: "string", description: "Beneficiary name" },
          beneficiary_clabe: { type: "string", description: "Beneficiary CLABE (18 digits)" },
          beneficiary_rfc: { type: "string", description: "Beneficiary RFC (tax ID)" },
          concept: { type: "string", description: "Transfer concept/description" },
          reference: { type: "string", description: "Numeric reference (up to 7 digits)" },
          sender_clabe: { type: "string", description: "Sender CLABE account" },
          sender_name: { type: "string", description: "Sender name" },
          sender_rfc: { type: "string", description: "Sender RFC" },
        },
        required: ["amount", "beneficiary_name", "beneficiary_clabe", "concept", "reference"],
      },
    },
    {
      name: "get_transfer",
      description: "Get transfer details by ID",
      inputSchema: {
        type: "object",
        properties: { transferId: { type: "string", description: "Transfer ID or tracking key" } },
        required: ["transferId"],
      },
    },
    {
      name: "list_transfers",
      description: "List transfers with filters",
      inputSchema: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYYMMDD)" },
          date_to: { type: "string", description: "End date (YYYYMMDD)" },
          status: { type: "string", description: "Transfer status filter" },
          limit: { type: "number", description: "Results limit" },
        },
      },
    },
    {
      name: "cancel_transfer",
      description: "Cancel a pending SPEI orden by clave_rastreo (only works while orden is pending)",
      inputSchema: {
        type: "object",
        properties: {
          tracking_key: { type: "string", description: "Clave de rastreo of the orden to cancel" },
          reason: { type: "string", description: "Cancellation reason / motivo" },
        },
        required: ["tracking_key"],
      },
    },
    {
      name: "get_balance",
      description: "Get account balance",
      inputSchema: {
        type: "object",
        properties: {
          account: { type: "string", description: "Account CLABE (optional, uses default)" },
        },
      },
    },
    {
      name: "list_account_balances",
      description: "List balances for all company accounts",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "validate_account",
      description: "Validate a CLABE account number against the receiving bank (online check)",
      inputSchema: {
        type: "object",
        properties: {
          clabe: { type: "string", description: "CLABE account number (18 digits)" },
          beneficiary_name: { type: "string", description: "Expected beneficiary name" },
        },
        required: ["clabe"],
      },
    },
    {
      name: "validate_clabe",
      description: "Validate CLABE structure and checksum locally (no API call). Returns bank code, plaza, account, and check digit",
      inputSchema: {
        type: "object",
        properties: {
          clabe: { type: "string", description: "CLABE account number (18 digits)" },
        },
        required: ["clabe"],
      },
    },
    {
      name: "list_banks",
      description: "List participating SPEI banks",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "lookup_bank_by_code",
      description: "Look up a participating bank by its ABM/SPEI code (first 3 digits of CLABE)",
      inputSchema: {
        type: "object",
        properties: {
          bank_code: { type: "string", description: "ABM/SPEI bank code (3 digits)" },
        },
        required: ["bank_code"],
      },
    },
    {
      name: "get_cep",
      description: "Get CEP (Comprobante Electronico de Pago) for transfer validation",
      inputSchema: {
        type: "object",
        properties: {
          tracking_key: { type: "string", description: "Transfer tracking key" },
          date: { type: "string", description: "Transfer date (YYYYMMDD)" },
          sender_clabe: { type: "string", description: "Sender CLABE" },
          beneficiary_clabe: { type: "string", description: "Beneficiary CLABE" },
          amount: { type: "number", description: "Transfer amount" },
        },
        required: ["tracking_key", "date"],
      },
    },
    {
      name: "register_beneficiary",
      description: "Register a beneficiary account",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Beneficiary name" },
          clabe: { type: "string", description: "Beneficiary CLABE (18 digits)" },
          rfc: { type: "string", description: "Beneficiary RFC" },
          email: { type: "string", description: "Beneficiary email" },
          bank_code: { type: "string", description: "Bank code" },
        },
        required: ["name", "clabe"],
      },
    },
    {
      name: "create_refund",
      description: "Create a SPEI refund/devolución for a previously received transfer",
      inputSchema: {
        type: "object",
        properties: {
          original_tracking_key: { type: "string", description: "Clave de rastreo of the original orden being refunded" },
          amount: { type: "number", description: "Refund amount in MXN" },
          concept: { type: "string", description: "Refund concept/description" },
          reference: { type: "string", description: "Numeric reference (up to 7 digits)" },
          reason_code: { type: "string", description: "Devolución reason code (e.g. 02 = cuenta inexistente)" },
        },
        required: ["original_tracking_key", "amount"],
      },
    },
    {
      name: "list_refunds",
      description: "List devoluciones (refunds) by date range",
      inputSchema: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYYMMDD)" },
          date_to: { type: "string", description: "End date (YYYYMMDD)" },
          status: { type: "string", description: "Refund status filter" },
        },
      },
    },
    {
      name: "conciliation_report",
      description: "Get transactions reconciliation report by date (all received + sent ordenes)",
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "Operation date (YYYYMMDD)" },
          account: { type: "string", description: "Account CLABE filter" },
          direction: { type: "string", description: "Direction filter: enviada | recibida" },
        },
        required: ["date"],
      },
    },
    {
      name: "register_webhook",
      description: "Register a webhook URL to receive STP event notifications",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Webhook URL (HTTPS)" },
          events: {
            type: "array",
            items: { type: "string" },
            description: "Event types to subscribe to (e.g. orden.recibida, orden.liquidada, devolucion)",
          },
          secret: { type: "string", description: "Optional shared secret for signature verification" },
        },
        required: ["url"],
      },
    },
    {
      name: "list_webhooks",
      description: "List registered webhooks for the company",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "delete_webhook",
      description: "Delete a registered webhook by ID",
      inputSchema: {
        type: "object",
        properties: {
          webhook_id: { type: "string", description: "Webhook ID to delete" },
        },
        required: ["webhook_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_transfer": {
        const payload: any = {
          monto: args?.amount,
          nombreBeneficiario: args?.beneficiary_name,
          cuentaBeneficiario: args?.beneficiary_clabe,
          conceptoPago: args?.concept,
          referenciaNumerica: args?.reference,
          empresa: COMPANY,
        };
        if (args?.beneficiary_rfc) payload.rfcCurpBeneficiario = args.beneficiary_rfc;
        if (args?.sender_clabe) payload.cuentaOrdenante = args.sender_clabe;
        if (args?.sender_name) payload.nombreOrdenante = args.sender_name;
        if (args?.sender_rfc) payload.rfcCurpOrdenante = args.sender_rfc;
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("PUT", "/ordenPago/registra", payload), null, 2) }] };
      }
      case "get_transfer":
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("POST", "/ordenPago/consulta", { claveRastreo: args?.transferId, empresa: COMPANY }), null, 2) }] };
      case "list_transfers": {
        const body: any = { empresa: COMPANY };
        if (args?.date_from) body.fechaInicio = args.date_from;
        if (args?.date_to) body.fechaFin = args.date_to;
        if (args?.status) body.estado = args.status;
        if (args?.limit) body.limite = args.limit;
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("POST", "/ordenPago/lista", body), null, 2) }] };
      }
      case "cancel_transfer": {
        const body: any = { claveRastreo: args?.tracking_key, empresa: COMPANY };
        if (args?.reason) body.motivo = args.reason;
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("POST", "/ordenPago/cancela", body), null, 2) }] };
      }
      case "get_balance": {
        const body: any = { empresa: COMPANY };
        if (args?.account) body.cuenta = args.account;
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("POST", "/ordenPago/saldo", body), null, 2) }] };
      }
      case "list_account_balances":
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("POST", "/ordenPago/saldos", { empresa: COMPANY }), null, 2) }] };
      case "validate_account": {
        const body: any = { cuenta: args?.clabe };
        if (args?.beneficiary_name) body.nombre = args.beneficiary_name;
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("POST", "/ordenPago/validaCuenta", body), null, 2) }] };
      }
      case "validate_clabe": {
        const result = clabeChecksum(String(args?.clabe || ""));
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "list_banks":
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("GET", "/ordenPago/bancos"), null, 2) }] };
      case "lookup_bank_by_code": {
        const code = String(args?.bank_code || "");
        const banks = (await stpRequest("GET", "/ordenPago/bancos")) as any;
        const list: any[] = Array.isArray(banks) ? banks : (banks?.bancos ?? banks?.data ?? []);
        const match = list.find((b: any) => String(b?.codigo ?? b?.code ?? b?.claveSpei ?? "") === code) || null;
        return { content: [{ type: "text", text: JSON.stringify({ bank_code: code, match }, null, 2) }] };
      }
      case "get_cep": {
        const body: any = {
          claveRastreo: args?.tracking_key,
          fecha: args?.date,
        };
        if (args?.sender_clabe) body.cuentaOrdenante = args.sender_clabe;
        if (args?.beneficiary_clabe) body.cuentaBeneficiario = args.beneficiary_clabe;
        if (args?.amount) body.monto = args.amount;
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("POST", "/ordenPago/cep", body), null, 2) }] };
      }
      case "register_beneficiary": {
        const payload: any = {
          nombre: args?.name,
          cuenta: args?.clabe,
          empresa: COMPANY,
        };
        if (args?.rfc) payload.rfcCurp = args.rfc;
        if (args?.email) payload.email = args.email;
        if (args?.bank_code) payload.banco = args.bank_code;
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("PUT", "/ordenPago/registraBeneficiario", payload), null, 2) }] };
      }
      case "create_refund": {
        const payload: any = {
          claveRastreoOriginal: args?.original_tracking_key,
          monto: args?.amount,
          empresa: COMPANY,
        };
        if (args?.concept) payload.conceptoPago = args.concept;
        if (args?.reference) payload.referenciaNumerica = args.reference;
        if (args?.reason_code) payload.codigoMotivo = args.reason_code;
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("PUT", "/ordenPago/devolucion", payload), null, 2) }] };
      }
      case "list_refunds": {
        const body: any = { empresa: COMPANY };
        if (args?.date_from) body.fechaInicio = args.date_from;
        if (args?.date_to) body.fechaFin = args.date_to;
        if (args?.status) body.estado = args.status;
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("POST", "/ordenPago/devoluciones", body), null, 2) }] };
      }
      case "conciliation_report": {
        const body: any = { empresa: COMPANY, fechaOperacion: args?.date };
        if (args?.account) body.cuenta = args.account;
        if (args?.direction) body.tipo = args.direction;
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("POST", "/ordenPago/conciliacion", body), null, 2) }] };
      }
      case "register_webhook": {
        const payload: any = { empresa: COMPANY, url: args?.url };
        if (Array.isArray(args?.events)) payload.eventos = args.events;
        if (args?.secret) payload.secreto = args.secret;
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("PUT", "/webhooks/registra", payload), null, 2) }] };
      }
      case "list_webhooks":
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("POST", "/webhooks/lista", { empresa: COMPANY }), null, 2) }] };
      case "delete_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await stpRequest("POST", "/webhooks/elimina", { empresa: COMPANY, id: args?.webhook_id }), null, 2) }] };
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
        const s = new Server({ name: "mcp-stp-spei", version: "0.2.0-alpha.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
