#!/usr/bin/env node

/**
 * MCP Server for Bling — Brazilian ERP platform (API v3).
 *
 * Tools:
 *  Products & catalog
 *   - list_products, get_product, create_product
 *   - list_categories, create_category
 *  Sales
 *   - list_orders_with_items, list_orders, get_order, create_order
 *   - list_order_statuses
 *  Proposals
 *   - list_proposals, get_proposal, create_proposal
 *   - update_proposal, delete_proposal, update_proposal_status
 *  Purchasing
 *   - list_purchase_orders, create_purchase_order
 *  Contacts
 *   - list_contacts, create_contact, get_contact, update_contact
 *  Invoices (fiscal)
 *   - list_invoices, create_invoice, send_invoice
 *   - create_service_invoice (NFS-e)
 *  Inventory
 *   - get_stock, update_stock, create_stock_movement
 *   - list_warehouses, create_warehouse
 *  Finance
 *   - list_accounts_receivable, create_account_receivable
 *   - list_accounts_payable, create_account_payable
 *   - list_payment_methods
 *  Integration
 *   - subscribe_webhook, unsubscribe_webhook
 *
 * Environment:
 *   BLING_ACCESS_TOKEN — OAuth2 access token
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ACCESS_TOKEN = process.env.BLING_ACCESS_TOKEN || "";
const BASE_URL = process.env.BLING_BASE_URL || "https://www.bling.com.br/Api/v3";

// Bling order `situacao.valor` code for a canceled order.
const CANCELED_STATUS = 2;

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
  // 204 No Content
  if (res.status === 204) return { success: true };
  const text = await res.text();
  if (!text) return { success: true };
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

function text(data: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new Server(
  { name: "mcp-bling", version: "0.2.1" },
  { capabilities: { tools: {} }, instructions: MANAGED_TIER_HINT }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ---------------- Products ----------------
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
      name: "get_product",
      description: "Get full details of a product by ID, including variations, stock info, dimensions, pricing, and supplier data",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "number", description: "Product ID" },
        },
        required: ["productId"],
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

    // ---------------- Categories ----------------
    {
      name: "list_categories",
      description: "List product categories in Bling",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          limit: { type: "number", description: "Items per page" },
        },
      },
    },
    {
      name: "create_category",
      description: "Create a product category in Bling",
      inputSchema: {
        type: "object",
        properties: {
          descricao: { type: "string", description: "Category description/name" },
          categoriaPai: {
            type: "object",
            description: "Parent category (optional)",
            properties: { id: { type: "number" } },
          },
        },
        required: ["descricao"],
      },
    },

    // ---------------- Sales orders ----------------
    {
      name: "list_orders_with_items",
      description: "Fetch sales orders with full line items (SKUs, qty, prices) for a date range, one summary page (up to 100 orders) at a time. Check hasMore and call again with nextPage until hasMore=false.",
      inputSchema: {
        type: "object",
        properties: {
          dataInicial:     { type: "string",  description: "Start date (YYYY-MM-DD)" },
          dataFinal:       { type: "string",  description: "End date (YYYY-MM-DD)" },
          excludeCanceled: { type: "boolean", description: "Exclude canceled orders. Default true." },
          page:            { type: "number",  description: "Which summary page to fetch (default 1). Increment until hasMore=false." },
          pageSize:        { type: "number",  description: "Orders fetched (and detailed) per call (default 25, max 100). Lower it if a client times out on dense pages." },
        },
        required: ["dataInicial", "dataFinal"],
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
      name: "get_order",
      description: "Get a single sales order by ID, including full line items (products, SKUs, quantities, prices)",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "number", description: "Sales order ID" },
        },
        required: ["orderId"],
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
            properties: { id: { type: "number", description: "Contact ID" } },
          },
          itens: {
            type: "array",
            description: "Order items",
            items: {
              type: "object",
              properties: {
                produto: { type: "object", properties: { id: { type: "number" } } },
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

    // ---------------- Purchase orders ----------------
    {
      name: "list_purchase_orders",
      description: "List purchase orders (pedidos de compras) in Bling",
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
      name: "create_purchase_order",
      description: "Create a purchase order (pedido de compra) in Bling",
      inputSchema: {
        type: "object",
        properties: {
          fornecedor: {
            type: "object",
            description: "Supplier contact",
            properties: { id: { type: "number", description: "Supplier contact ID" } },
          },
          itens: {
            type: "array",
            description: "Purchase items",
            items: {
              type: "object",
              properties: {
                produto: { type: "object", properties: { id: { type: "number" } } },
                quantidade: { type: "number" },
                valor: { type: "number" },
                desconto: { type: "number" },
              },
            },
          },
          observacoes: { type: "string", description: "Order notes" },
          data: { type: "string", description: "Order date (YYYY-MM-DD)" },
        },
        required: ["fornecedor", "itens"],
      },
    },

    // ---------------- Contacts ----------------
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
      name: "get_contact",
      description: "Get a single contact by ID",
      inputSchema: {
        type: "object",
        properties: {
          contactId: { type: "number", description: "Contact ID" },
        },
        required: ["contactId"],
      },
    },
    {
      name: "update_contact",
      description: "Update an existing contact",
      inputSchema: {
        type: "object",
        properties: {
          contactId: { type: "number", description: "Contact ID" },
          nome: { type: "string", description: "Contact name" },
          email: { type: "string", description: "Email address" },
          telefone: { type: "string", description: "Phone number" },
          celular: { type: "string", description: "Mobile phone" },
          numeroDocumento: { type: "string", description: "CPF or CNPJ" },
        },
        required: ["contactId"],
      },
    },

    // ---------------- Invoices ----------------
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
      name: "send_invoice",
      description: "Send/emit an already-created NF-e to SEFAZ",
      inputSchema: {
        type: "object",
        properties: {
          invoiceId: { type: "number", description: "NF-e ID in Bling" },
        },
        required: ["invoiceId"],
      },
    },
    {
      name: "create_service_invoice",
      description: "Create a service invoice (NFS-e) in Bling",
      inputSchema: {
        type: "object",
        properties: {
          contato: {
            type: "object",
            description: "Customer contact",
            properties: { id: { type: "number" } },
          },
          descricaoServicos: { type: "string", description: "Service description" },
          valorServicos: { type: "number", description: "Service value" },
          codigoServico: { type: "string", description: "Municipal service code" },
          data: { type: "string", description: "Issue date (YYYY-MM-DD)" },
          observacoes: { type: "string", description: "Notes" },
        },
        required: ["contato", "descricaoServicos", "valorServicos"],
      },
    },

    // ---------------- Inventory ----------------
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
    {
      name: "create_stock_movement",
      description: "Register a stock-in or stock-out movement for a product (alias of update_stock with explicit direction)",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "number", description: "Product ID" },
          depositoId: { type: "number", description: "Warehouse ID" },
          direction: { type: "string", enum: ["in", "out"], description: "in=entry (E), out=exit (S)" },
          quantidade: { type: "number", description: "Quantity" },
          preco: { type: "number", description: "Unit price (optional)" },
          observacoes: { type: "string", description: "Notes" },
        },
        required: ["productId", "depositoId", "direction", "quantidade"],
      },
    },

    // ---------------- Warehouses (Depositos) ----------------
    {
      name: "list_warehouses",
      description: "List warehouses (depósitos) in Bling",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          limit: { type: "number", description: "Items per page" },
        },
      },
    },
    {
      name: "create_warehouse",
      description: "Create a warehouse (depósito) in Bling",
      inputSchema: {
        type: "object",
        properties: {
          descricao: { type: "string", description: "Warehouse name/description" },
          situacao: { type: "number", description: "1=Active, 0=Inactive" },
          padrao: { type: "boolean", description: "Set as default warehouse" },
        },
        required: ["descricao"],
      },
    },

    // ---------------- Accounts receivable / payable ----------------
    {
      name: "list_accounts_receivable",
      description: "List accounts receivable (contas a receber)",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          limit: { type: "number", description: "Items per page" },
          situacao: { type: "number", description: "Status filter" },
          dataInicial: { type: "string", description: "Start date (YYYY-MM-DD)" },
          dataFinal: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
      },
    },
    {
      name: "create_account_receivable",
      description: "Create an account receivable (conta a receber)",
      inputSchema: {
        type: "object",
        properties: {
          contato: { type: "object", properties: { id: { type: "number" } } },
          vencimento: { type: "string", description: "Due date (YYYY-MM-DD)" },
          valor: { type: "number", description: "Amount" },
          historico: { type: "string", description: "Description / memo" },
          formaPagamento: {
            type: "object",
            description: "Payment method",
            properties: { id: { type: "number" } },
          },
        },
        required: ["contato", "vencimento", "valor"],
      },
    },
    {
      name: "list_accounts_payable",
      description: "List accounts payable (contas a pagar)",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          limit: { type: "number", description: "Items per page" },
          situacao: { type: "number", description: "Status filter" },
          dataInicial: { type: "string", description: "Start date (YYYY-MM-DD)" },
          dataFinal: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
      },
    },
    {
      name: "create_account_payable",
      description: "Create an account payable (conta a pagar)",
      inputSchema: {
        type: "object",
        properties: {
          contato: { type: "object", properties: { id: { type: "number" } } },
          vencimento: { type: "string", description: "Due date (YYYY-MM-DD)" },
          valor: { type: "number", description: "Amount" },
          historico: { type: "string", description: "Description / memo" },
          formaPagamento: {
            type: "object",
            description: "Payment method",
            properties: { id: { type: "number" } },
          },
        },
        required: ["contato", "vencimento", "valor"],
      },
    },

    // ---------------- Payment methods ----------------
    {
      name: "list_payment_methods",
      description: "List payment methods (formas de pagamento)",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          limit: { type: "number", description: "Items per page" },
        },
      },
    },

    // ---------------- Order statuses (Situações) ----------------
    {
      name: "list_order_statuses",
      description: "Get names and details for one or more order status IDs (situações). Pass an array of IDs to resolve them all at once.",
      inputSchema: {
        type: "object",
        properties: {
          ids: {
            type: "array",
            items: { type: "number" },
            description: "Array of situacao IDs to look up, e.g. [6, 9, 12, 280721]",
          },
        },
        required: ["ids"],
      },
    },

    // ---------------- Stores (Lojas / Canais de venda) ----------------
    {
      name: "list_stores",
      description: "List all stores/sales channels (lojas) in Bling, including their IDs and names",
      inputSchema: {
        type: "object",
        properties: {
          page:  { type: "number", description: "Page number" },
          limit: { type: "number", description: "Items per page" },
        },
      },
    },

    // ---------------- Webhooks ----------------
    {
      name: "subscribe_webhook",
      description: "Register a webhook (notificação) to receive Bling events",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Target URL to receive callbacks" },
          descricao: { type: "string", description: "Webhook description" },
          modulo: { type: "string", description: "Module to listen to (e.g., pedido.venda)" },
          ativo: { type: "boolean", description: "Whether the webhook is active" },
        },
        required: ["url", "modulo"],
      },
    },
    {
      name: "unsubscribe_webhook",
      description: "Remove a previously registered webhook",
      inputSchema: {
        type: "object",
        properties: {
          webhookId: { type: "number", description: "Webhook ID to delete" },
        },
        required: ["webhookId"],
      },
    },

    // ---------------- Proposals ----------------    
    {
      name: "list_proposals",
      description: "List commercial proposals (propostas comerciais / orçamentos) in Bling",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          limit: { type: "number", description: "Items per page" },
          situacao: { type: "string", description: "Filter by status (e.g., Rascunho, Aguardando, Aprovado, Concluído)" },
          expandContact: { type: "boolean", description: "If true, resolve contact names inline (default: false)" },
        },
      },
    },
    {
      name: "get_proposal",
      description: "Get a single commercial proposal by ID",
      inputSchema: {
        type: "object",
        properties: {
          proposalId: { type: "number", description: "Proposal ID" },
        },
        required: ["proposalId"],
      },
    },
    {
      name: "create_proposal",
      description: "Create a commercial proposal (proposta comercial / orçamento)",
      inputSchema: {
        type: "object",
        properties: {
          contato: { type: "object", description: "Customer contact", properties: { id: { type: "number" } } },
          itens: {
            type: "array", description: "Proposal items",
            items: {
              type: "object",
              properties: {
                produto: { type: "object", properties: { id: { type: "number" } } },
                quantidade: { type: "number" },
                valor: { type: "number" },
                desconto: { type: "number" },
              },
            },
          },
          parcelas: {
            type: "array", description: "Payment installments",
            items: {
              type: "object",
              properties: {
                dataVencimento: { type: "string" },
                valor: { type: "number" },
                formaPagamento: { type: "object", properties: { id: { type: "number" } } },
              },
            },
          },
          observacoes: { type: "string", description: "Notes" },
          desconto: { type: "number", description: "Discount" },
          data: { type: "string", description: "Proposal date (YYYY-MM-DD)" },
        },
        required: ["itens", "parcelas"],
      },
    },
    {
      name: "update_proposal",
      description: "Update an existing commercial proposal",
      inputSchema: {
        type: "object",
        properties: {
          proposalId: { type: "number", description: "Proposal ID" },
          contato: { type: "object", description: "Customer contact", properties: { id: { type: "number" } } },
          itens: {
            type: "array", description: "Proposal items",
            items: {
              type: "object",
              properties: {
                produto: { type: "object", properties: { id: { type: "number" } } },
                quantidade: { type: "number" },
                valor: { type: "number" },
                desconto: { type: "number" },
              },
            },
          },
          parcelas: {
            type: "array", description: "Payment installments",
            items: {
              type: "object",
              properties: {
                dataVencimento: { type: "string" },
                valor: { type: "number" },
                formaPagamento: { type: "object", properties: { id: { type: "number" } } },
              },
            },
          },
          observacoes: { type: "string", description: "Notes" },
          desconto: { type: "number", description: "Discount" },
        },
        required: ["proposalId"],
      },
    },
    {
      name: "delete_proposal",
      description: "Delete a commercial proposal",
      inputSchema: {
        type: "object",
        properties: {
          proposalId: { type: "number", description: "Proposal ID" },
        },
        required: ["proposalId"],
      },
    },
    {
      name: "update_proposal_status",
      description: "Update proposal status (e.g., Rascunho, Aguardando, Aprovado, Concluído, Cancelado)",
      inputSchema: {
        type: "object",
        properties: {
          proposalId: { type: "number", description: "Proposal ID" },
          situacao: { type: "string", description: "New status (e.g., Rascunho, Aguardando, Aprovado, Concluído, Cancelado)" },
        },
        required: ["proposalId", "situacao"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a: any = args || {};

  try {
    switch (name) {
      // ---- Products ----
      case "list_products": {
        const p = new URLSearchParams();
        if (a.page) p.set("pagina", String(a.page));
        if (a.limit) p.set("limite", String(a.limit));
        if (a.name) p.set("nome", String(a.name));
        if (a.code) p.set("codigo", String(a.code));
        if (a.type) p.set("tipo", String(a.type));
        return text(await blingRequest("GET", `/produtos?${p}`));
      }
      case "get_product":
        return text(await blingRequest("GET", `/produtos/${a.productId}`));
      case "create_product":
        return text(await blingRequest("POST", "/produtos", a));

      // ---- Categories ----
      case "list_categories": {
        const p = new URLSearchParams();
        if (a.page) p.set("pagina", String(a.page));
        if (a.limit) p.set("limite", String(a.limit));
        return text(await blingRequest("GET", `/categorias/produtos?${p}`));
      }
      case "create_category":
        return text(await blingRequest("POST", "/categorias/produtos", a));

      // ---- Sales orders ----
      case "list_orders_with_items": {
        // Fetches ONE summary page (up to 100 orders) and the line-item details
        // for the orders on it. Call repeatedly incrementing `page` until
        // hasMore=false — each call costs a single summary request, so paging a
        // large range is O(pages), not O(pages × batches).
        if (!a.dataInicial || !a.dataFinal) {
          throw new Error("dataInicial and dataFinal are required (YYYY-MM-DD).");
        }
        const excludeCanceled = a.excludeCanceled !== false;
        const page            = (a.page as number) || 1;
        // Orders fetched (and detailed) per call. Bounds per-call latency so a
        // dense page can't blow the MCP client timeout: the detail phase runs
        // 2-at-a-time with a 700ms gap, so ~25 orders ≈ 9s, 100 ≈ 35s.
        const pageSize        = Math.min(Math.max(Math.trunc(Number(a.pageSize)) || 25, 1), 100);
        const DELAY           = 700; // ms between detail pairs — stays under 3 req/sec

        // 1. Fetch just this page of order summaries (not the whole range).
        const p = new URLSearchParams();
        p.set("pagina", String(page));
        p.set("limite", String(pageSize));
        p.set("dataInicial", String(a.dataInicial));
        p.set("dataFinal",   String(a.dataFinal));
        const res: any = await blingRequest("GET", `/pedidos/vendas?${p}`);
        const summaries: any[] = res?.data ?? [];
        // A full page implies there may be another; a short page is the last one.
        const hasMore = summaries.length === pageSize;

        const chunk = excludeCanceled
          ? summaries.filter((o: any) => o?.situacao?.valor !== CANCELED_STATUS)
          : summaries;

        // 2. Fetch details for this page (2 at a time to stay under the rate limit).
        const results: any[] = [];
        for (let i = 0; i < chunk.length; i += 2) {
          const pair = chunk.slice(i, i + 2);
          const details = await Promise.allSettled(
            pair.map((o: any) => blingRequest("GET", `/pedidos/vendas/${o.id}`))
          );
          for (let j = 0; j < pair.length; j++) {
            const order  = pair[j];
            const detail = details[j];
            results.push({
              id:      order.id,
              numero:  order.numero,
              data:    order.data,
              loja_id: order?.loja?.id,
              total:   order.total,
              itens:   detail.status === "fulfilled"
                ? ((detail.value as any)?.data?.itens ?? []).map((it: any) => ({
                    sku:       it.codigo || "SIN_SKU",
                    descricao: it.descricao || "",
                    qty:       it.quantidade,
                    valor:     it.valor,
                  }))
                : [],
            });
          }
          if (i + 2 < chunk.length) await new Promise(r => setTimeout(r, DELAY));
        }

        return text({
          page,
          pageSize,
          fetchedOnPage: chunk.length,
          hasMore,
          nextPage: hasMore ? page + 1 : null,
          orders: results,
        });
      }

      case "list_orders": {
        const p = new URLSearchParams();
        if (a.page) p.set("pagina", String(a.page));
        if (a.limit) p.set("limite", String(a.limit));
        if (a.situacao) p.set("idsSituacoes[]", String(a.situacao));
        if (a.dataInicial) p.set("dataInicial", String(a.dataInicial));
        if (a.dataFinal) p.set("dataFinal", String(a.dataFinal));
        return text(await blingRequest("GET", `/pedidos/vendas?${p}`));
      }
      case "get_order":
        return text(await blingRequest("GET", `/pedidos/vendas/${a.orderId}`));
      case "create_order":
        return text(await blingRequest("POST", "/pedidos/vendas", a));

      // ---- Purchase orders ----
      case "list_purchase_orders": {
        const p = new URLSearchParams();
        if (a.page) p.set("pagina", String(a.page));
        if (a.limit) p.set("limite", String(a.limit));
        if (a.situacao) p.set("idsSituacoes[]", String(a.situacao));
        if (a.dataInicial) p.set("dataInicial", String(a.dataInicial));
        if (a.dataFinal) p.set("dataFinal", String(a.dataFinal));
        return text(await blingRequest("GET", `/pedidos/compras?${p}`));
      }
      case "create_purchase_order":
        return text(await blingRequest("POST", "/pedidos/compras", a));

      // ---- Contacts ----
      case "list_contacts": {
        const p = new URLSearchParams();
        if (a.page) p.set("pagina", String(a.page));
        if (a.limit) p.set("limite", String(a.limit));
        if (a.nome) p.set("nome", String(a.nome));
        if (a.tipo) p.set("tipoPessoa", String(a.tipo));
        return text(await blingRequest("GET", `/contatos?${p}`));
      }
      case "create_contact":
        return text(await blingRequest("POST", "/contatos", a));
      case "get_contact":
        return text(await blingRequest("GET", `/contatos/${a.contactId}`));
      case "update_contact": {
        const { contactId, ...rest } = a;
        return text(await blingRequest("PUT", `/contatos/${contactId}`, rest));
      }

      // ---- Invoices ----
      case "list_invoices": {
        const p = new URLSearchParams();
        if (a.page) p.set("pagina", String(a.page));
        if (a.limit) p.set("limite", String(a.limit));
        if (a.situacao) p.set("situacao", String(a.situacao));
        return text(await blingRequest("GET", `/nfe?${p}`));
      }
      case "create_invoice":
        return text(await blingRequest("POST", "/nfe", a));
      case "send_invoice":
        return text(await blingRequest("POST", `/nfe/${a.invoiceId}/enviar`));
      case "create_service_invoice":
        return text(await blingRequest("POST", "/nfse", a));

      // ---- Inventory ----
      case "get_stock":
        return text(await blingRequest("GET", `/estoques/saldos?idsProdutos[]=${a.productId}`));
      case "update_stock":
        return text(await blingRequest("POST", `/estoques`, {
          produto: { id: a.productId },
          deposito: { id: a.depositoId },
          operacao: a.operacao,
          quantidade: a.quantidade,
          observacoes: a.observacoes,
        }));
      case "create_stock_movement":
        return text(await blingRequest("POST", `/estoques`, {
          produto: { id: a.productId },
          deposito: { id: a.depositoId },
          operacao: a.direction === "in" ? "E" : "S",
          quantidade: a.quantidade,
          preco: a.preco,
          observacoes: a.observacoes,
        }));

      // ---- Warehouses ----
      case "list_warehouses": {
        const p = new URLSearchParams();
        if (a.page) p.set("pagina", String(a.page));
        if (a.limit) p.set("limite", String(a.limit));
        return text(await blingRequest("GET", `/depositos?${p}`));
      }
      case "create_warehouse":
        return text(await blingRequest("POST", "/depositos", a));

      // ---- Accounts receivable / payable ----
      case "list_accounts_receivable": {
        const p = new URLSearchParams();
        if (a.page) p.set("pagina", String(a.page));
        if (a.limit) p.set("limite", String(a.limit));
        if (a.situacao) p.set("situacoes[]", String(a.situacao));
        if (a.dataInicial) p.set("dataEmissaoInicial", String(a.dataInicial));
        if (a.dataFinal) p.set("dataEmissaoFinal", String(a.dataFinal));
        return text(await blingRequest("GET", `/contas/receber?${p}`));
      }
      case "create_account_receivable":
        return text(await blingRequest("POST", "/contas/receber", a));
      case "list_accounts_payable": {
        const p = new URLSearchParams();
        if (a.page) p.set("pagina", String(a.page));
        if (a.limit) p.set("limite", String(a.limit));
        if (a.situacao) p.set("situacoes[]", String(a.situacao));
        if (a.dataInicial) p.set("dataEmissaoInicial", String(a.dataInicial));
        if (a.dataFinal) p.set("dataEmissaoFinal", String(a.dataFinal));
        return text(await blingRequest("GET", `/contas/pagar?${p}`));
      }
      case "create_account_payable":
        return text(await blingRequest("POST", "/contas/pagar", a));

      // ---- Payment methods ----
      case "list_payment_methods": {
        const p = new URLSearchParams();
        if (a.page) p.set("pagina", String(a.page));
        if (a.limit) p.set("limite", String(a.limit));
        return text(await blingRequest("GET", `/formas-pagamentos?${p}`));
      }

      // ---- Order statuses ----
      case "list_order_statuses": {
        const ids: number[] = a.ids || [];
        const results = await Promise.allSettled(
          ids.map((id: number) => blingRequest("GET", `/situacoes/${id}`))
        );
        const data = results.map((r, i) =>
          r.status === "fulfilled"
            ? (r.value as any)?.data
            : { id: ids[i], error: (r.reason as Error)?.message }
        );
        return text({ data });
      }

      // ---- Stores ----
      case "list_stores": {
        const p = new URLSearchParams();
        if (a.page)  p.set("pagina", String(a.page));
        if (a.limit) p.set("limite", String(a.limit));
        return text(await blingRequest("GET", `/canais-venda?${p}`));
      }

      // ---- Webhooks ----
      case "subscribe_webhook":
        return text(await blingRequest("POST", "/notificacoes", a));
      case "unsubscribe_webhook":
        return text(await blingRequest("DELETE", `/notificacoes/${a.webhookId}`));

      // ---- Proposals ----
      case "list_proposals": {
        const p = new URLSearchParams();
        if (a.page) p.set("pagina", String(a.page));
        if (a.limit) p.set("limite", String(a.limit));
        if (a.situacao) p.set("situacao", String(a.situacao));
        const result: any = await blingRequest("GET", `/propostas-comerciais?${p}`);
        // Expand contact names if requested
        if (a.expandContact === true && result?.data?.length > 0) {
          const rawIds = result.data.map((prop: any) => prop.contato?.id).filter((id: any) => id != null);
          const contactIds = Array.from(new Set(rawIds)) as number[];
          const contacts: Record<number, string> = {};
          for (const id of contactIds) {
            try {
              const c: any = await blingRequest("GET", `/contatos/${id}`);
              if (c?.data?.nome) contacts[id] = c.data.nome;
            } catch { /* skip failed contact lookups */ }
          }
          for (const prop of result.data) {
            const cid = prop.contato?.id;
            if (cid && contacts[cid]) prop.contato.nome = contacts[cid];
          }
        }
        return text(result);
      }
      case "get_proposal":
        return text(await blingRequest("GET", `/propostas-comerciais/${a.proposalId}`));
      case "create_proposal":
        return text(await blingRequest("POST", "/propostas-comerciais", a));
      case "update_proposal": {
        const { proposalId, ...rest } = a;
        return text(await blingRequest("PUT", `/propostas-comerciais/${proposalId}`, rest));
      }
      case "delete_proposal":
        return text(await blingRequest("DELETE", `/propostas-comerciais/${a.proposalId}`));
      case "update_proposal_status": {
        const { proposalId, situacao, ...rest } = a;
        return text(await blingRequest("PATCH", `/propostas-comerciais/${proposalId}/situacoes`, { situacao }));
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
        const s = new Server({ name: "mcp-bling", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
