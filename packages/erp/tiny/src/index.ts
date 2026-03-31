#!/usr/bin/env node

/**
 * MCP Server for Tiny ERP — Brazilian ERP platform.
 *
 * Tools:
 * - list_products: List products
 * - get_product: Get product details
 * - list_orders: List sales orders
 * - get_order: Get order details
 * - list_contacts: List contacts
 * - get_contact: Get contact details
 * - create_invoice: Create a fiscal invoice (NF-e)
 * - get_invoice: Get invoice details
 * - get_stock: Get stock for a product
 * - list_accounts_payable: List accounts payable
 *
 * Environment:
 *   TINY_API_TOKEN — API token from Tiny ERP
 *
 * Note: Tiny uses format=json parameter and token in each request body/query.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
  { name: "mcp-tiny", version: "0.1.0" },
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
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!API_TOKEN) {
    console.error("TINY_API_TOKEN environment variable is required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
