#!/usr/bin/env node

/**
 * MCP Server for Tiny ERP — Brazilian ERP platform.
 *
 * Tools:
 * - list_products: List products
 * - get_product: Get product details
 * - update_stock: Adjust product stock balance
 * - list_categories: List product category tree
 * - list_warehouses: List stock warehouses (depósitos)
 * - list_price_lists: List price lists (listas de preços)
 * - list_orders: List sales orders
 * - get_order: Get order details
 * - update_order_status: Change sales order status (e.g. cancel)
 * - list_contacts: List contacts
 * - get_contact: Get contact details
 * - create_invoice: Create a fiscal invoice (NF-e) from an order
 * - get_invoice: Get invoice details
 * - list_invoices: List fiscal invoices with filters
 * - get_invoice_xml: Get the XML payload of an issued invoice
 * - get_invoice_link: Get DANFE PDF link for an invoice
 * - send_invoice_email: Email an issued invoice to recipient
 * - get_stock: Get stock for a product
 * - list_accounts_payable: List accounts payable
 * - list_accounts_receivable: List accounts receivable
 * - get_account_receivable: Get a single account receivable
 *
 * Environment:
 *   TINY_API_TOKEN — API token from Tiny ERP
 *
 * Note: Tiny uses format=json parameter and token in each request body/query.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_TOKEN = process.env.TINY_API_TOKEN || "";
const BASE_URL = "https://api.tiny.com.br/api2";

async function tinyRequest(endpoint: string, extraParams?: Record<string, string>): Promise<unknown> {
  const params = new URLSearchParams({
    token: API_TOKEN,
    formato: "json",
    ...extraParams,
  });
  const res = await fetch(`${BASE_URL}/${endpoint}?${params}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Tiny API ${res.status}: ${err}`);
  }
  return res.json();
}

async function tinyRequestWithBody(endpoint: string, body: Record<string, string>): Promise<unknown> {
  const params = new URLSearchParams({
    token: API_TOKEN,
    formato: "json",
    ...body,
  });
  const res = await fetch(`${BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Tiny API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-tiny", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_products",
      description: "List products in Tiny ERP",
      inputSchema: {
        type: "object",
        properties: {
          pesquisa: { type: "string", description: "Search term (name, code, or barcode)" },
          pagina: { type: "number", description: "Page number (default 1)" },
        },
      },
    },
    {
      name: "get_product",
      description: "Get product details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Product ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_orders",
      description: "List sales orders in Tiny ERP",
      inputSchema: {
        type: "object",
        properties: {
          situacao: { type: "string", description: "Filter by status (aberto, aprovado, faturado, etc.)" },
          dataInicial: { type: "string", description: "Start date (DD/MM/YYYY)" },
          dataFinal: { type: "string", description: "End date (DD/MM/YYYY)" },
          pagina: { type: "number", description: "Page number" },
        },
      },
    },
    {
      name: "get_order",
      description: "Get order details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Order ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_contacts",
      description: "List contacts in Tiny ERP",
      inputSchema: {
        type: "object",
        properties: {
          pesquisa: { type: "string", description: "Search term (name, CPF/CNPJ)" },
          pagina: { type: "number", description: "Page number" },
        },
      },
    },
    {
      name: "get_contact",
      description: "Get contact details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Contact ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_invoice",
      description: "Create a fiscal invoice (NF-e) from an order in Tiny",
      inputSchema: {
        type: "object",
        properties: {
          idPedido: { type: "number", description: "Sales order ID" },
          modelo: { type: "string", enum: ["NFe", "NFCe"], description: "Invoice model (default NFe)" },
        },
        required: ["idPedido"],
      },
    },
    {
      name: "get_invoice",
      description: "Get invoice details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Invoice ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_stock",
      description: "Get current stock for a product",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Product ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_accounts_payable",
      description: "List accounts payable in Tiny ERP",
      inputSchema: {
        type: "object",
        properties: {
          situacao: { type: "string", enum: ["aberto", "pago", "cancelado", "parcial"], description: "Filter by status" },
          dataInicial: { type: "string", description: "Start date (DD/MM/YYYY)" },
          dataFinal: { type: "string", description: "End date (DD/MM/YYYY)" },
          pagina: { type: "number", description: "Page number" },
        },
      },
    },
    {
      name: "update_stock",
      description: "Update (adjust) product stock balance — credit or debit a quantity for a deposit",
      inputSchema: {
        type: "object",
        properties: {
          idProduto: { type: "number", description: "Product ID" },
          tipo: { type: "string", enum: ["E", "S", "B"], description: "E=entry, S=exit, B=balance" },
          quantidade: { type: "number", description: "Quantity" },
          precoUnitario: { type: "number", description: "Unit price (optional)" },
          observacoes: { type: "string", description: "Notes (optional)" },
          deposito: { type: "string", description: "Warehouse name (optional, default 'geral')" },
        },
        required: ["idProduto", "tipo", "quantidade"],
      },
    },
    {
      name: "list_categories",
      description: "List product categories as a tree in Tiny ERP",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_warehouses",
      description: "List stock warehouses (depósitos) configured in Tiny ERP",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_price_lists",
      description: "List price lists (listas de preços) configured in Tiny ERP",
      inputSchema: {
        type: "object",
        properties: {
          pagina: { type: "number", description: "Page number" },
        },
      },
    },
    {
      name: "update_order_status",
      description: "Change a sales order's status — useful for cancelling or marking as approved/billed",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Order ID" },
          situacao: {
            type: "string",
            description: "New status code (e.g. 'cancelado', 'aprovado', 'faturado', 'em separacao')",
          },
        },
        required: ["id", "situacao"],
      },
    },
    {
      name: "list_invoices",
      description: "List fiscal invoices (NF-e/NFC-e) in Tiny ERP",
      inputSchema: {
        type: "object",
        properties: {
          dataInicial: { type: "string", description: "Start date (DD/MM/YYYY)" },
          dataFinal: { type: "string", description: "End date (DD/MM/YYYY)" },
          situacao: { type: "string", description: "Status filter (e.g. emitida, autorizada, cancelada)" },
          numero: { type: "string", description: "Invoice number" },
          cliente: { type: "string", description: "Customer name (search)" },
          pagina: { type: "number", description: "Page number" },
        },
      },
    },
    {
      name: "get_invoice_xml",
      description: "Get the XML payload of an issued invoice (NF-e)",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Invoice ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_invoice_link",
      description: "Get the DANFE PDF/link for an issued invoice",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Invoice ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "send_invoice_email",
      description: "Email an issued invoice to a recipient",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Invoice ID" },
          email: { type: "string", description: "Recipient email (optional, defaults to contact email)" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_accounts_receivable",
      description: "List accounts receivable in Tiny ERP",
      inputSchema: {
        type: "object",
        properties: {
          situacao: { type: "string", enum: ["aberto", "pago", "cancelado", "parcial"], description: "Filter by status" },
          dataInicial: { type: "string", description: "Start date (DD/MM/YYYY)" },
          dataFinal: { type: "string", description: "End date (DD/MM/YYYY)" },
          cliente: { type: "string", description: "Customer name (search)" },
          pagina: { type: "number", description: "Page number" },
        },
      },
    },
    {
      name: "get_account_receivable",
      description: "Get a single accounts-receivable record by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Account receivable ID" },
        },
        required: ["id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_products": {
        const params: Record<string, string> = {};
        if (args?.pesquisa) params.pesquisa = String(args.pesquisa);
        if (args?.pagina) params.pagina = String(args.pagina);
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("produtos.pesquisa.php", params), null, 2) }] };
      }
      case "get_product":
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("produto.obter.php", { id: String(args?.id) }), null, 2) }] };
      case "list_orders": {
        const params: Record<string, string> = {};
        if (args?.situacao) params.situacao = String(args.situacao);
        if (args?.dataInicial) params.dataInicial = String(args.dataInicial);
        if (args?.dataFinal) params.dataFinal = String(args.dataFinal);
        if (args?.pagina) params.pagina = String(args.pagina);
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("pedidos.pesquisa.php", params), null, 2) }] };
      }
      case "get_order":
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("pedido.obter.php", { id: String(args?.id) }), null, 2) }] };
      case "list_contacts": {
        const params: Record<string, string> = {};
        if (args?.pesquisa) params.pesquisa = String(args.pesquisa);
        if (args?.pagina) params.pagina = String(args.pagina);
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("contatos.pesquisa.php", params), null, 2) }] };
      }
      case "get_contact":
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("contato.obter.php", { id: String(args?.id) }), null, 2) }] };
      case "create_invoice": {
        const params: Record<string, string> = {
          idPedido: String(args?.idPedido),
        };
        if (args?.modelo) params.modelo = String(args.modelo);
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequestWithBody("gerar.nota.fiscal.pedido.php", params), null, 2) }] };
      }
      case "get_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("nota.fiscal.obter.php", { id: String(args?.id) }), null, 2) }] };
      case "get_stock":
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("produto.obter.estoque.php", { id: String(args?.id) }), null, 2) }] };
      case "list_accounts_payable": {
        const params: Record<string, string> = {};
        if (args?.situacao) params.situacao = String(args.situacao);
        if (args?.dataInicial) params.dataInicial = String(args.dataInicial);
        if (args?.dataFinal) params.dataFinal = String(args.dataFinal);
        if (args?.pagina) params.pagina = String(args.pagina);
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("contas.pagar.pesquisa.php", params), null, 2) }] };
      }
      case "update_stock": {
        const estoque: Record<string, unknown> = {
          idProduto: args?.idProduto,
          tipo: args?.tipo,
          quantidade: args?.quantidade,
        };
        if (args?.precoUnitario !== undefined) estoque.precoUnitario = args.precoUnitario;
        if (args?.observacoes) estoque.observacoes = args.observacoes;
        if (args?.deposito) estoque.deposito = args.deposito;
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequestWithBody("produto.atualizar.estoque.php", { estoque: JSON.stringify({ estoque }) }), null, 2) }] };
      }
      case "list_categories":
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("produtos.categorias.arvore.php"), null, 2) }] };
      case "list_warehouses":
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("lista.depositos.php"), null, 2) }] };
      case "list_price_lists": {
        const params: Record<string, string> = {};
        if (args?.pagina) params.pagina = String(args.pagina);
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("lista.precos.pesquisa.php", params), null, 2) }] };
      }
      case "update_order_status":
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequestWithBody("alterar.situacao.pedido.php", { id: String(args?.id), situacao: String(args?.situacao) }), null, 2) }] };
      case "list_invoices": {
        const params: Record<string, string> = {};
        if (args?.dataInicial) params.dataInicial = String(args.dataInicial);
        if (args?.dataFinal) params.dataFinal = String(args.dataFinal);
        if (args?.situacao) params.situacao = String(args.situacao);
        if (args?.numero) params.numero = String(args.numero);
        if (args?.cliente) params.cliente = String(args.cliente);
        if (args?.pagina) params.pagina = String(args.pagina);
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("notas.fiscais.pesquisa.php", params), null, 2) }] };
      }
      case "get_invoice_xml":
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("nota.fiscal.obter.xml.php", { id: String(args?.id) }), null, 2) }] };
      case "get_invoice_link":
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("nota.fiscal.obter.link.php", { id: String(args?.id) }), null, 2) }] };
      case "send_invoice_email": {
        const params: Record<string, string> = { id: String(args?.id) };
        if (args?.email) params.email = String(args.email);
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequestWithBody("nota.fiscal.enviar.email.php", params), null, 2) }] };
      }
      case "list_accounts_receivable": {
        const params: Record<string, string> = {};
        if (args?.situacao) params.situacao = String(args.situacao);
        if (args?.dataInicial) params.dataInicial = String(args.dataInicial);
        if (args?.dataFinal) params.dataFinal = String(args.dataFinal);
        if (args?.cliente) params.cliente = String(args.cliente);
        if (args?.pagina) params.pagina = String(args.pagina);
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("contas.receber.pesquisa.php", params), null, 2) }] };
      }
      case "get_account_receivable":
        return { content: [{ type: "text", text: JSON.stringify(await tinyRequest("conta.receber.obter.php", { id: String(args?.id) }), null, 2) }] };
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
        const s = new Server({ name: "mcp-tiny", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
