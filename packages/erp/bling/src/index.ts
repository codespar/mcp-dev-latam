#!/usr/bin/env node

/**
 * MCP Server for Bling — Brazilian ERP platform.
 *
 * Tools:
 * - list_products: List products
 * - create_product: Create a product
 * - list_orders: List sales orders
 * - create_order: Create a sales order
 * - list_contacts: List contacts (customers/suppliers)
 * - create_contact: Create a contact
 * - list_invoices: List fiscal invoices (NF-e)
 * - create_invoice: Create a fiscal invoice
 * - get_stock: Get stock/inventory for a product
 * - update_stock: Update stock for a product
 *
 * Environment:
 *   BLING_ACCESS_TOKEN — OAuth2 access token
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ACCESS_TOKEN = process.env.BLING_ACCESS_TOKEN || "";
const BASE_URL = "https://www.bling.com.br/Api/v3";

async function blingRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ACCESS_TOKEN}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Bling API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-bling", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_products",
      description: "List products in Bling",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number (default 1)" },
          limit: { type: "number", description: "Items per page (default 100, max 100)" },
          name: { type: "string", description: "Filter by product name" },
          code: { type: "string", description: "Filter by product code" },
          type: { type: "string", enum: ["P", "S", "K"], description: "P=Product, S=Service, K=Kit" },
        },
      },
    },
    {
      name: "create_product",
      description: "Create a product in Bling",
      inputSchema: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Product name" },
          codigo: { type: "string", description: "Product code/SKU" },
          preco: { type: "number", description: "Sale price" },
          precoCusto: { type: "number", description: "Cost price" },
          tipo: { type: "string", enum: ["P", "S", "K"], description: "P=Product, S=Service, K=Kit" },
          situacao: { type: "string", enum: ["A", "I"], description: "A=Active, I=Inactive" },
          formato: { type: "string", enum: ["S", "E", "V"], description: "S=Simple, E=With variations, V=Variation" },
          unidade: { type: "string", description: "Unit of measure (UN, KG, etc.)" },
          pesoLiquido: { type: "number", description: "Net weight in kg" },
          pesoBruto: { type: "number", description: "Gross weight in kg" },
        },
        required: ["nome", "preco", "tipo", "formato"],
      },
    },
    {
      name: "list_orders",
      description: "List sales orders in Bling",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          limit: { type: "number", description: "Items per page" },
          situacao: { type: "number", description: "Filter by status ID" },
          dataInicial: { type: "string", description: "Start date (YYYY-MM-DD)" },
          dataFinal: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
      },
    },
    {
      name: "create_order",
      description: "Create a sales order in Bling",
      inputSchema: {
        type: "object",
        properties: {
          contato: {
            type: "object",
            description: "Customer contact",
            properties: {
              id: { type: "number", description: "Contact ID" },
            },
          },
          itens: {
            type: "array",
            description: "Order items",
            items: {
              type: "object",
              properties: {
                produto: {
                  type: "object",
                  properties: { id: { type: "number" } },
                },
                quantidade: { type: "number" },
                valor: { type: "number" },
                desconto: { type: "number" },
              },
            },
          },
          observacoes: { type: "string", description: "Order notes" },
          data: { type: "string", description: "Order date (YYYY-MM-DD)" },
        },
        required: ["contato", "itens"],
      },
    },
    {
      name: "list_contacts",
      description: "List contacts (customers/suppliers) in Bling",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          limit: { type: "number", description: "Items per page" },
          nome: { type: "string", description: "Filter by name" },
          tipo: { type: "string", enum: ["F", "J"], description: "F=Individual, J=Legal entity" },
        },
      },
    },
    {
      name: "create_contact",
      description: "Create a contact in Bling",
      inputSchema: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Contact name" },
          tipo: { type: "string", enum: ["F", "J"], description: "F=Individual, J=Legal entity" },
          numeroDocumento: { type: "string", description: "CPF or CNPJ" },
          email: { type: "string", description: "Email address" },
          telefone: { type: "string", description: "Phone number" },
          celular: { type: "string", description: "Mobile phone" },
        },
        required: ["nome", "tipo"],
      },
    },
    {
      name: "list_invoices",
      description: "List fiscal invoices (NF-e) in Bling",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          limit: { type: "number", description: "Items per page" },
          situacao: { type: "number", description: "Filter by status" },
        },
      },
    },
    {
      name: "create_invoice",
      description: "Create a fiscal invoice (NF-e) from an order",
      inputSchema: {
        type: "object",
        properties: {
          pedidoVendaId: { type: "number", description: "Sales order ID to generate invoice from" },
          tipo: { type: "number", description: "Invoice type (1=Saida, 0=Entrada)" },
          naturezaOperacao: { type: "string", description: "Operation nature (e.g., Venda de mercadoria)" },
        },
        required: ["pedidoVendaId"],
      },
    },
    {
      name: "get_stock",
      description: "Get stock/inventory for a product",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "number", description: "Product ID" },
        },
        required: ["productId"],
      },
    },
    {
      name: "update_stock",
      description: "Update stock for a product at a warehouse",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "number", description: "Product ID" },
          depositoId: { type: "number", description: "Warehouse/deposit ID" },
          operacao: { type: "string", enum: ["B", "E", "S"], description: "B=Balance, E=Entry, S=Exit" },
          quantidade: { type: "number", description: "Quantity" },
          observacoes: { type: "string", description: "Notes" },
        },
        required: ["productId", "depositoId", "operacao", "quantidade"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_products": {
        const params = new URLSearchParams();
        if (args?.page) params.set("pagina", String(args.page));
        if (args?.limit) params.set("limite", String(args.limit));
        if (args?.name) params.set("nome", String(args.name));
        if (args?.code) params.set("codigo", String(args.code));
        if (args?.type) params.set("tipo", String(args.type));
        return { content: [{ type: "text", text: JSON.stringify(await blingRequest("GET", `/produtos?${params}`), null, 2) }] };
      }
      case "create_product":
        return { content: [{ type: "text", text: JSON.stringify(await blingRequest("POST", "/produtos", args), null, 2) }] };
      case "list_orders": {
        const params = new URLSearchParams();
        if (args?.page) params.set("pagina", String(args.page));
        if (args?.limit) params.set("limite", String(args.limit));
        if (args?.situacao) params.set("idsSituacoes[]", String(args.situacao));
        if (args?.dataInicial) params.set("dataInicial", String(args.dataInicial));
        if (args?.dataFinal) params.set("dataFinal", String(args.dataFinal));
        return { content: [{ type: "text", text: JSON.stringify(await blingRequest("GET", `/pedidos/vendas?${params}`), null, 2) }] };
      }
      case "create_order":
        return { content: [{ type: "text", text: JSON.stringify(await blingRequest("POST", "/pedidos/vendas", args), null, 2) }] };
      case "list_contacts": {
        const params = new URLSearchParams();
        if (args?.page) params.set("pagina", String(args.page));
        if (args?.limit) params.set("limite", String(args.limit));
        if (args?.nome) params.set("nome", String(args.nome));
        if (args?.tipo) params.set("tipoPessoa", String(args.tipo));
        return { content: [{ type: "text", text: JSON.stringify(await blingRequest("GET", `/contatos?${params}`), null, 2) }] };
      }
      case "create_contact":
        return { content: [{ type: "text", text: JSON.stringify(await blingRequest("POST", "/contatos", args), null, 2) }] };
      case "list_invoices": {
        const params = new URLSearchParams();
        if (args?.page) params.set("pagina", String(args.page));
        if (args?.limit) params.set("limite", String(args.limit));
        if (args?.situacao) params.set("situacao", String(args.situacao));
        return { content: [{ type: "text", text: JSON.stringify(await blingRequest("GET", `/nfe?${params}`), null, 2) }] };
      }
      case "create_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await blingRequest("POST", "/nfe", args), null, 2) }] };
      case "get_stock":
        return { content: [{ type: "text", text: JSON.stringify(await blingRequest("GET", `/estoques/saldos?idsProdutos[]=${args?.productId}`), null, 2) }] };
      case "update_stock":
        return { content: [{ type: "text", text: JSON.stringify(await blingRequest("POST", `/estoques`, {
          produto: { id: args?.productId },
          deposito: { id: args?.depositoId },
          operacao: args?.operacao,
          quantidade: args?.quantidade,
          observacoes: args?.observacoes,
        }), null, 2) }] };
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!ACCESS_TOKEN) {
    console.error("BLING_ACCESS_TOKEN environment variable is required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
