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
 * - create_service_order: Create a service order (OS)
 * - list_service_orders: List service orders
 * - create_purchase_order: Create a purchase order
 * - list_purchase_orders: List purchase orders
 * - get_bank_accounts: List registered bank accounts
 * - create_account_payable: Create accounts payable entry (AP)
 * - list_accounts_payable: List accounts payable
 * - pay_account_payable: Settle/record payment on an AP title
 * - list_dre: List DRE (income statement) accounts
 * - get_bank_statement: Bank statement for a period
 * - list_categories: List chart of accounts categories
 * - list_departments: List departments
 * - list_projects: List projects
 * - create_cash_entry: Create a bank account ledger entry (lançamento)
 * - list_financial_movements: List unified financial movements (AP/AR/CC)
 * - create_stock_adjustment: Create an inventory adjustment (entry/exit/balance)
 * - get_stock_position: Get current stock position / balance
 * - update_sales_order: Alter an existing sales order
 * - get_sales_order: Consult a specific sales order
 * - invoice_sales_order: Generate an invoice (NF) from a sales order
 *
 * Environment:
 *   OMIE_APP_KEY — Omie app key
 *   OMIE_APP_SECRET — Omie app secret
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const DEMO_MODE = process.argv.includes("--demo") || process.env.MCP_DEMO === "true";

const DEMO_RESPONSES: Record<string, unknown> = {
  create_order: { nCodPed: 12345, cCodIntPed: "PED-DEMO-001", cNumPedido: "001234", dDtPrevisao: "2026-04-15", nValorTotal: 150.00, cStatusPedido: "Faturado", items: [{ cDescricao: "Produto Demo", nQuantidade: 1, nValorUnitario: 150.00 }] },
  list_customers: { clientes_cadastro: [{ codigo_cliente: 1001, razao_social: "Demo Comércio LTDA", cnpj_cpf: "12345678000190", email: "contato@demo.com" }], pagina: 1, total_de_paginas: 1, registros: 1, total_de_registros: 1 },
  create_customer: { codigo_cliente: 1001, codigo_cliente_integracao: "CLI-DEMO-001", codigo_status: "0", descricao_status: "Cliente incluído com sucesso" },
  list_orders: { pedido_venda_produto: [{ cabecalho: { nCodPed: 12345, cNumPedido: "001234", nValorTotal: 150.00, cStatusPedido: "Faturado" } }], pagina: 1, total_de_paginas: 1, registros: 1 },
  list_products: { produto_servico_cadastro: [{ codigo_produto: 2001, descricao: "Produto Demo", valor_unitario: 150.00, codigo: "PROD-001" }], pagina: 1, total_de_paginas: 1, registros: 1 },
  get_financial: { conta_receber_cadastro: [{ codigo_lancamento: 3001, valor_documento: 150.00, status_titulo: "Liquidado", data_vencimento: "15/04/2026" }], pagina: 1, total_de_paginas: 1 },
  get_bank_accounts: { ListarContasCorrentes: [{ nCodCC: 4001, cDescricao: "Conta Demo Banco do Brasil", cCodBanco: "001" }] },
};

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
  { name: "mcp-omie", version: "0.2.1" },
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
    {
      name: "create_service_order",
      description: "Create a service order (OS) in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          codigo_cliente: { type: "number", description: "Omie customer ID" },
          codigo_pedido_integracao: { type: "string", description: "Integration order code (unique)" },
          data_previsao: { type: "string", description: "Expected date (DD/MM/YYYY)" },
          servicos: { type: "array", description: "Array of services (descricao, valor_unitario, quantidade)" },
          observacoes: { type: "string", description: "Order notes/observations" },
        },
        required: ["codigo_cliente", "codigo_pedido_integracao", "data_previsao", "servicos"],
      },
    },
    {
      name: "list_service_orders",
      description: "List service orders (OS) from Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          pagina: { type: "number", description: "Page number (default 1)" },
          registros_por_pagina: { type: "number", description: "Records per page (default 50)" },
          etapa: { type: "string", description: "Order stage filter (10=OS, 20=Executar, 50=Faturar, 60=Faturado)" },
        },
      },
    },
    {
      name: "create_purchase_order",
      description: "Create a purchase order in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          codigo_fornecedor: { type: "number", description: "Omie supplier ID" },
          codigo_pedido_integracao: { type: "string", description: "Integration order code (unique)" },
          data_previsao: { type: "string", description: "Expected date (DD/MM/YYYY)" },
          itens: { type: "array", description: "Array of items (produto, quantidade, valor_unitario)" },
          observacoes: { type: "string", description: "Order notes/observations" },
        },
        required: ["codigo_fornecedor", "codigo_pedido_integracao", "data_previsao", "itens"],
      },
    },
    {
      name: "list_purchase_orders",
      description: "List purchase orders from Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          pagina: { type: "number", description: "Page number (default 1)" },
          registros_por_pagina: { type: "number", description: "Records per page (default 50)" },
          etapa: { type: "string", description: "Order stage filter (10=Pedido, 50=Receber, 60=Recebido)" },
        },
      },
    },
    {
      name: "get_bank_accounts",
      description: "List registered bank accounts in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          pagina: { type: "number", description: "Page number (default 1)" },
          registros_por_pagina: { type: "number", description: "Records per page (default 50)" },
        },
      },
    },
    {
      name: "create_account_payable",
      description: "Create an accounts payable (AP) entry in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          codigo_lancamento_integracao: { type: "string", description: "Integration code (unique)" },
          codigo_cliente_fornecedor: { type: "number", description: "Omie supplier ID" },
          data_vencimento: { type: "string", description: "Due date (DD/MM/YYYY)" },
          valor_documento: { type: "number", description: "Document value in BRL" },
          codigo_categoria: { type: "string", description: "Category code (chart of accounts)" },
          data_previsao: { type: "string", description: "Expected payment date (DD/MM/YYYY)" },
          id_conta_corrente: { type: "number", description: "Bank account ID" },
          numero_documento: { type: "string", description: "Document/invoice number" },
          observacao: { type: "string", description: "Notes" },
        },
        required: ["codigo_lancamento_integracao", "codigo_cliente_fornecedor", "data_vencimento", "valor_documento", "codigo_categoria"],
      },
    },
    {
      name: "list_accounts_payable",
      description: "List accounts payable (AP) titles in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          pagina: { type: "number", description: "Page number (default 1)" },
          registros_por_pagina: { type: "number", description: "Records per page (default 50)" },
          dDtVencDe: { type: "string", description: "Due date from (DD/MM/YYYY)" },
          dDtVencAte: { type: "string", description: "Due date to (DD/MM/YYYY)" },
          status_titulo: { type: "string", description: "Title status (ABERTO, LIQUIDADO, etc.)" },
        },
      },
    },
    {
      name: "pay_account_payable",
      description: "Settle / record payment (baixa) for an AP title in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          codigo_lancamento: { type: "number", description: "Omie AP title ID" },
          codigo_lancamento_integracao: { type: "string", description: "Integration code (alternative to codigo_lancamento)" },
          codigo_baixa: { type: "string", description: "Settlement integration code (unique)" },
          valor: { type: "number", description: "Paid amount in BRL" },
          data: { type: "string", description: "Payment date (DD/MM/YYYY)" },
          codigo_conta_corrente: { type: "number", description: "Bank account ID used for the payment" },
          observacao: { type: "string", description: "Payment notes" },
        },
        required: ["codigo_baixa", "valor", "data", "codigo_conta_corrente"],
      },
    },
    {
      name: "list_dre",
      description: "List DRE (income statement) chart of accounts in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          apenasContasAtivas: { type: "string", enum: ["S", "N"], description: "Only active accounts (S/N, default S)" },
        },
      },
    },
    {
      name: "get_bank_statement",
      description: "Retrieve bank account statement (extrato) for a period from Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          nCodCC: { type: "number", description: "Bank account ID" },
          cCodIntCC: { type: "string", description: "Bank account integration code (alternative to nCodCC)" },
          dPeriodoInicial: { type: "string", description: "Start date (DD/MM/YYYY)" },
          dPeriodoFinal: { type: "string", description: "End date (DD/MM/YYYY)" },
          cExibirApenasSaldo: { type: "string", enum: ["S", "N"], description: "Show only balances (S/N)" },
        },
        required: ["dPeriodoInicial", "dPeriodoFinal"],
      },
    },
    {
      name: "list_categories",
      description: "List chart of accounts categories in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          pagina: { type: "number", description: "Page number (default 1)" },
          registros_por_pagina: { type: "number", description: "Records per page (default 50)" },
        },
      },
    },
    {
      name: "list_departments",
      description: "List departments (cost centers) in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          pagina: { type: "number", description: "Page number (default 1)" },
          registros_por_pagina: { type: "number", description: "Records per page (default 50)" },
        },
      },
    },
    {
      name: "list_projects",
      description: "List projects in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          pagina: { type: "number", description: "Page number (default 1)" },
          registros_por_pagina: { type: "number", description: "Records per page (default 50)" },
          apenas_importado_api: { type: "string", enum: ["S", "N"], description: "Only API-imported projects" },
        },
      },
    },
    {
      name: "create_cash_entry",
      description: "Create a bank account ledger entry (lançamento de conta corrente) in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          cabecalho: {
            type: "object",
            description: "Entry header: { cCodIntLanc, nCodCC, dDtLanc, nValorLanc, cNatureza (E=entrada, S=saida), cTipo (DEB/CRE), cHistorico }",
          },
          detalhes: {
            type: "object",
            description: "Entry details: { cCodCateg, nCodCliente, cObs, nCodProjeto, nCodDepto }",
          },
        },
        required: ["cabecalho"],
      },
    },
    {
      name: "list_financial_movements",
      description: "List unified financial movements (AP + AR + CC) in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          nPagina: { type: "number", description: "Page number (default 1)" },
          nRegPorPagina: { type: "number", description: "Records per page (default 50)" },
          dDtPagtoDe: { type: "string", description: "Payment date from (DD/MM/YYYY)" },
          dDtPagtoAte: { type: "string", description: "Payment date to (DD/MM/YYYY)" },
          cNatureza: { type: "string", enum: ["R", "P", "T"], description: "Nature (R=receivable, P=payable, T=all)" },
          cStatus: { type: "string", description: "Status (ABERTO, LIQUIDADO, VENCIDO, etc.)" },
        },
      },
    },
    {
      name: "create_stock_adjustment",
      description: "Create an inventory adjustment (entry/exit/balance) in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          codigo_produto: { type: "number", description: "Omie product ID" },
          codigo_produto_integracao: { type: "string", description: "Product integration code (alternative)" },
          codigo_local_estoque: { type: "number", description: "Warehouse location ID" },
          tipo_ajuste: { type: "string", enum: ["ENT", "SAI", "SLD", "TRF"], description: "Adjustment type: ENT (entry), SAI (exit), SLD (balance), TRF (transfer)" },
          quantidade: { type: "number", description: "Quantity" },
          valor: { type: "number", description: "Unit value in BRL" },
          data_ajuste: { type: "string", description: "Adjustment date (DD/MM/YYYY)" },
          codigo_motivo: { type: "number", description: "Reason code" },
          observacao: { type: "string", description: "Notes" },
        },
        required: ["tipo_ajuste", "quantidade", "data_ajuste"],
      },
    },
    {
      name: "get_stock_position",
      description: "Get current stock position / balance in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          nPagina: { type: "number", description: "Page number (default 1)" },
          nRegPorPagina: { type: "number", description: "Records per page (default 50)" },
          dDataPosicao: { type: "string", description: "Position reference date (DD/MM/YYYY)" },
          cExibirTodos: { type: "string", enum: ["S", "N"], description: "Include items with zero stock (S/N)" },
          codigo_local_estoque: { type: "number", description: "Filter by warehouse location ID" },
        },
      },
    },
    {
      name: "update_sales_order",
      description: "Alter an existing sales order in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          cabecalho: { type: "object", description: "Order header: { codigo_pedido, codigo_pedido_integracao, codigo_cliente, data_previsao, etapa, ... }" },
          itens: { type: "array", description: "Updated order items" },
          observacoes: { type: "object", description: "Order observations" },
          informacoes_adicionais: { type: "object", description: "Additional info (codigo_vendedor, etc.)" },
          frete: { type: "object", description: "Shipping details" },
        },
        required: ["cabecalho"],
      },
    },
    {
      name: "get_sales_order",
      description: "Consult a specific sales order by ID or integration code in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          codigo_pedido: { type: "number", description: "Omie order ID" },
          codigo_pedido_integracao: { type: "string", description: "Integration order code (alternative)" },
        },
      },
    },
    {
      name: "invoice_sales_order",
      description: "Generate an invoice (NF) from an existing sales order in Omie ERP",
      inputSchema: {
        type: "object",
        properties: {
          nCodPed: { type: "number", description: "Omie order ID" },
          cCodIntPed: { type: "string", description: "Integration order code (alternative)" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = rawArgs as Record<string, unknown> | undefined;

  if (DEMO_MODE) {
    return { content: [{ type: "text", text: JSON.stringify(DEMO_RESPONSES[name] || { demo: true, tool: name }, null, 2) }] };
  }

  try {
    switch (name) {
      case "list_customers":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/geral/clientes/", "ListarClientes", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
          ...(args?.clientesFiltro ? { clientesFiltro: args.clientesFiltro } : {}),
        }]), null, 2) }] };
      case "create_customer":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/geral/clientes/", "IncluirCliente", [args || {}]), null, 2) }] };
      case "list_products":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/geral/produtos/", "ListarProdutos", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
          ...(args?.apenas_importado_api ? { apenas_importado_api: args.apenas_importado_api } : {}),
        }]), null, 2) }] };
      case "create_product":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/geral/produtos/", "IncluirProduto", [args || {}]), null, 2) }] };
      case "create_order":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/produtos/pedido/", "IncluirPedido", [args || {}]), null, 2) }] };
      case "list_orders":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/produtos/pedido/", "ListarPedidos", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
          ...(args?.etapa ? { etapa: args.etapa } : {}),
        }]), null, 2) }] };
      case "list_invoices":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/produtos/nfconsultar/", "ListarNF", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
          ...(args?.dEmiInicial ? { dEmiInicial: args.dEmiInicial } : {}),
          ...(args?.dEmiFinal ? { dEmiFinal: args.dEmiFinal } : {}),
        }]), null, 2) }] };
      case "get_financial":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/financas/contareceber/", "ListarContasReceber", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
          ...(args?.dDtEmiInicial ? { dDtEmiInicial: args.dDtEmiInicial } : {}),
          ...(args?.dDtEmiFinal ? { dDtEmiFinal: args.dDtEmiFinal } : {}),
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
      case "create_service_order":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/servicos/os/", "IncluirOS", [args || {}]), null, 2) }] };
      case "list_service_orders":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/servicos/os/", "ListarOS", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
          ...(args?.etapa ? { etapa: args.etapa } : {}),
        }]), null, 2) }] };
      case "create_purchase_order":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/produtos/pedidocompra/", "IncluirPedidoCompra", [args || {}]), null, 2) }] };
      case "list_purchase_orders":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/produtos/pedidocompra/", "ListarPedidosCompra", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
          ...(args?.etapa ? { etapa: args.etapa } : {}),
        }]), null, 2) }] };
      case "get_bank_accounts":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/geral/contacorrente/", "ListarContasCorrentes", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
        }]), null, 2) }] };
      case "create_account_payable":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/financas/contapagar/", "IncluirContaPagar", [args || {}]), null, 2) }] };
      case "list_accounts_payable":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/financas/contapagar/", "ListarContasPagar", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
          ...(args?.dDtVencDe ? { dDtVencDe: args.dDtVencDe } : {}),
          ...(args?.dDtVencAte ? { dDtVencAte: args.dDtVencAte } : {}),
          ...(args?.status_titulo ? { status_titulo: args.status_titulo } : {}),
        }]), null, 2) }] };
      case "pay_account_payable":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/financas/contapagar/", "LancarPagamento", [args || {}]), null, 2) }] };
      case "list_dre":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/geral/dre/", "ListarCadastroDRE", [{
          apenasContasAtivas: args?.apenasContasAtivas || "S",
        }]), null, 2) }] };
      case "get_bank_statement":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/financas/extrato/", "ListarExtrato", [{
          ...(args?.nCodCC ? { nCodCC: args.nCodCC } : {}),
          ...(args?.cCodIntCC ? { cCodIntCC: args.cCodIntCC } : {}),
          dPeriodoInicial: args?.dPeriodoInicial,
          dPeriodoFinal: args?.dPeriodoFinal,
          ...(args?.cExibirApenasSaldo ? { cExibirApenasSaldo: args.cExibirApenasSaldo } : {}),
        }]), null, 2) }] };
      case "list_categories":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/geral/categorias/", "ListarCategorias", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
        }]), null, 2) }] };
      case "list_departments":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/geral/departamentos/", "ListarDepartamentos", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
        }]), null, 2) }] };
      case "list_projects":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/geral/projetos/", "ListarProjetos", [{
          pagina: args?.pagina || 1,
          registros_por_pagina: args?.registros_por_pagina || 50,
          ...(args?.apenas_importado_api ? { apenas_importado_api: args.apenas_importado_api } : {}),
        }]), null, 2) }] };
      case "create_cash_entry":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/financas/contacorrentelancamentos/", "IncluirLancCC", [args || {}]), null, 2) }] };
      case "list_financial_movements":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/financas/mf/", "ListarMovimentos", [{
          nPagina: args?.nPagina || 1,
          nRegPorPagina: args?.nRegPorPagina || 50,
          ...(args?.dDtPagtoDe ? { dDtPagtoDe: args.dDtPagtoDe } : {}),
          ...(args?.dDtPagtoAte ? { dDtPagtoAte: args.dDtPagtoAte } : {}),
          ...(args?.cNatureza ? { cNatureza: args.cNatureza } : {}),
          ...(args?.cStatus ? { cStatus: args.cStatus } : {}),
        }]), null, 2) }] };
      case "create_stock_adjustment":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/estoque/ajuste/", "IncluirAjusteEstoque", [args || {}]), null, 2) }] };
      case "get_stock_position":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/estoque/consulta/", "ListarPosEstoque", [{
          nPagina: args?.nPagina || 1,
          nRegPorPagina: args?.nRegPorPagina || 50,
          ...(args?.dDataPosicao ? { dDataPosicao: args.dDataPosicao } : {}),
          ...(args?.cExibirTodos ? { cExibirTodos: args.cExibirTodos } : {}),
          ...(args?.codigo_local_estoque ? { codigo_local_estoque: args.codigo_local_estoque } : {}),
        }]), null, 2) }] };
      case "update_sales_order":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/produtos/pedido/", "AlterarPedidoVenda", [args || {}]), null, 2) }] };
      case "get_sales_order":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/produtos/pedido/", "ConsultarPedido", [{
          ...(args?.codigo_pedido ? { codigo_pedido: args.codigo_pedido } : {}),
          ...(args?.codigo_pedido_integracao ? { codigo_pedido_integracao: args.codigo_pedido_integracao } : {}),
        }]), null, 2) }] };
      case "invoice_sales_order":
        return { content: [{ type: "text", text: JSON.stringify(await omieRequest("/produtos/pedidovendafat/", "FaturarPedidoVenda", [{
          ...(args?.nCodPed ? { nCodPed: args.nCodPed } : {}),
          ...(args?.cCodIntPed ? { cCodIntPed: args.cCodIntPed } : {}),
        }]), null, 2) }] };
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
        const s = new Server({ name: "mcp-omie", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
