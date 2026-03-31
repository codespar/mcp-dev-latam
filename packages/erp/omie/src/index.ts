#!/usr/bin/env node

/**
 * MCP Server for Omie — Brazilian ERP platform.
 *
 * NOTE: Omie uses JSON-RPC style requests. Every API call is a POST
 * with a JSON body containing: call, app_key, app_secret, and param.
 *
 * Tools:
 * - list_customers: List customers
 * - create_customer: Create a customer
 * - list_products: List products
 * - create_product: Create a product
 * - create_order: Create a sales order
 * - list_orders: List sales orders
 * - list_invoices: List invoices (NF)
 * - get_financial: List accounts receivable
 * - create_invoice: Consult a specific NF
 * - get_company_info: List companies
 *
 * Environment:
 *   OMIE_APP_KEY — Omie app key
 *   OMIE_APP_SECRET — Omie app secret
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const APP_KEY = process.env.OMIE_APP_KEY || "";
const APP_SECRET = process.env.OMIE_APP_SECRET || "";
const BASE_URL = "https://app.omie.com.br/api/v1";

async function omieRequest(path: string, call: string, param: unknown[]): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      call,
      app_key: APP_KEY,
      app_secret: APP_SECRET,
      param,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Omie API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-omie", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_customers",
      description: "List customers from Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          pagina: { type: "number", description: "Page number (default 1)" },
          registros_por_pagina: { type: "number", description: "Records per page (default 50)" },
          clientesFiltro: { type: "object", description: "Filter object (nome_fantasia, cnpj_cpf, etc.)" },
        },
      },
    },
    {
      name: "create_customer",
      description: "Create a customer in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          cnpj_cpf: { type: "string", description: "CPF or CNPJ" },
          razao_social: { type: "string", description: "Legal name" },
          nome_fantasia: { type: "string", description: "Trade name" },
          email: { type: "string", description: "Email address" },
          telefone1_numero: { type: "string", description: "Phone number" },
          endereco: { type: "string", description: "Street address" },
          endereco_numero: { type: "string", description: "Address number" },
          bairro: { type: "string", description: "Neighborhood" },
          cidade: { type: "string", description: "City" },
          estado: { type: "string", description: "State (UF)" },
          cep: { type: "string", description: "Postal code" },
        },
        required: ["cnpj_cpf", "razao_social"],
      },
    },
    {
      name: "list_products",
      description: "List products from Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          pagina: { type: "number", description: "Page number (default 1)" },
          registros_por_pagina: { type: "number", description: "Records per page (default 50)" },
          apenas_importado_api: { type: "string", enum: ["S", "N"], description: "Only API-imported products" },
        },
      },
    },
    {
      name: "create_product",
      description: "Create a product in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          descricao: { type: "string", description: "Product description" },
          codigo: { type: "string", description: "Product code (internal)" },
          unidade: { type: "string", description: "Unit of measure (UN, KG, etc.)" },
          ncm: { type: "string", description: "NCM code (tax classification)" },
          valor_unitario: { type: "number", description: "Unit price in BRL" },
        },
        required: ["descricao", "codigo", "unidade", "ncm", "valor_unitario"],
      },
    },
    {
      name: "create_order",
      description: "Create a sales order in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          codigo_cliente: { type: "number", description: "Omie customer ID" },
          codigo_pedido_integracao: { type: "string", description: "Integration order code (unique)" },
          data_previsao: { type: "string", description: "Expected date (DD/MM/YYYY)" },
          itens: { type: "array", description: "Array of order items (produto, quantidade, valor_unitario)" },
          frete: { type: "object", description: "Shipping details" },
        },
        required: ["codigo_cliente", "codigo_pedido_integracao", "data_previsao", "itens"],
      },
    },
    {
      name: "list_orders",
      description: "List sales orders from Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          pagina: { type: "number", description: "Page number (default 1)" },
          registros_por_pagina: { type: "number", description: "Records per page (default 50)" },
          etapa: { type: "string", description: "Order stage filter (10=Pedido, 20=Separar, 50=Faturar, 60=Faturado)" },
        },
      },
    },
    {
      name: "list_invoices",
      description: "List invoices (NF) from Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          pagina: { type: "number", description: "Page number (default 1)" },
          registros_por_pagina: { type: "number", description: "Records per page (default 50)" },
          dEmiInicial: { type: "string", description: "Start emission date (DD/MM/YYYY)" },
          dEmiFinal: { type: "string", description: "End emission date (DD/MM/YYYY)" },
        },
      },
    },
    {
      name: "get_financial",
      description: "List accounts receivable from Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          pagina: { type: "number", description: "Page number (default 1)" },
          registros_por_pagina: { type: "number", description: "Records per page (default 50)" },
          dDtEmiInicial: { type: "string", description: "Start emission date (DD/MM/YYYY)" },
          dDtEmiFinal: { type: "string", description: "End emission date (DD/MM/YYYY)" },
        },
      },
    },
    {
      name: "create_invoice",
      description: "Consult a specific NF by ID in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          nIdNF: { type: "number", description: "Omie NF ID" },
        },
        required: ["nIdNF"],
      },
    },
    {
      name: "get_company_info",
      description: "List companies registered in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          pagina: { type: "number", description: "Page number (default 1)" },
          registros_por_pagina: { type: "number", description: "Records per page (default 50)" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "list_customers":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/geral/clientes/", "ListarClientes", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
          ...(args?.clientesFiltro && { clientesFiltro: args.clientesFiltro }),
        }]), null, 2) }] };
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/geral/clientes/", "IncluirCliente", [args || {}]), null, 2) }] };
      case "list_products":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/geral/produtos/", "ListarProdutos", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
          ...(args?.apenas_importado_api && { apenas_importado_api: args.apenas_importado_api }),
        }]), null, 2) }] };
      case "create_product":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/geral/produtos/", "IncluirProduto", [args || {}]), null, 2) }] };
      case "create_order":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/produtos/pedido/", "IncluirPedido", [args || {}]), null, 2) }] };
      case "list_orders":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/produtos/pedido/", "ListarPedidos", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
          ...(args?.etapa && { etapa: args.etapa }),
        }]), null, 2) }] };
      case "list_invoices":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/produtos/nfconsultar/", "ListarNF", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
          ...(args?.dEmiInicial && { dEmiInicial: args.dEmiInicial }),
          ...(args?.dEmiFinal && { dEmiFinal: args.dEmiFinal }),
        }]), null, 2) }] };
      case "get_financial":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/financas/contareceber/", "ListarContasReceber", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
          ...(args?.dDtEmiInicial && { dDtEmiInicial: args.dDtEmiInicial }),
          ...(args?.dDtEmiFinal && { dDtEmiFinal: args.dDtEmiFinal }),
        }]), null, 2) }] };
      case "create_invoice":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/produtos/nfconsultar/", "ConsultarNF", [{
          nIdNF: args?.nIdNF,
        }]), null, 2) }] };
      case "get_company_info":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/geral/empresas/", "ListarEmpresas", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
        }]), null, 2) }] };
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!APP_KEY || !APP_SECRET) {
    console.error("OMIE_APP_KEY and OMIE_APP_SECRET environment variables are required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
