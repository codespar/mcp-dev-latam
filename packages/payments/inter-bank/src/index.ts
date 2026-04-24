#!/usr/bin/env node

/**
 * MCP Server for Banco Inter — digital bank with developer API.
 *
 * Tools:
 * - create_boleto: Create boleto bancario
 * - get_boleto: Get boleto by ID
 * - list_boletos: List boletos with filters
 * - cancel_boleto: Cancel/write-off a boleto
 * - get_boleto_pdf: Download boleto PDF (base64)
 * - create_pix: Create PIX payment
 * - get_pix: Get PIX transaction by ID
 * - list_pix: List PIX transactions
 * - create_pix_cob: Create PIX immediate charge (cob) with txid
 * - get_pix_cob: Retrieve PIX immediate charge by txid
 * - list_pix_cob: List PIX immediate charges
 * - create_pix_cobv: Create PIX due charge (cobv) with dueDate
 * - get_pix_cobv: Retrieve PIX due charge by txid
 * - create_pix_devolucao: Create PIX return (devolução) for a received e2eId
 * - list_pix_keys: List PIX keys registered for the account
 * - get_balance: Get account balance
 * - get_statement: Get account statement
 * - get_statement_enriched: Get enriched statement with detailed transaction info
 * - get_statement_pdf: Download account statement as PDF (base64)
 * - create_transfer: Create TED/internal transfer
 * - get_webhook: Get configured webhooks
 * - create_webhook: Register webhook for notifications
 *
 * Environment:
 *   INTER_CLIENT_ID     — OAuth2 client ID
 *   INTER_CLIENT_SECRET — OAuth2 client secret
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.INTER_CLIENT_ID || "";
const CLIENT_SECRET = process.env.INTER_CLIENT_SECRET || "";
const BASE_URL = "https://cdpj.partners.bancointer.com.br";
const TOKEN_URL = `${BASE_URL}/oauth/v2/token`;

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(scope: string): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Banco Inter OAuth ${res.status}: ${err}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function interRequest(method: string, path: string, scope: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken(scope);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Banco Inter API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-inter-bank", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_boleto",
      description: "Create a boleto bancario (bank slip)",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Boleto amount in BRL" },
          due_date: { type: "string", description: "Due date (YYYY-MM-DD)" },
          payer_name: { type: "string", description: "Payer full name" },
          payer_cpf_cnpj: { type: "string", description: "Payer CPF or CNPJ" },
          payer_address: { type: "string", description: "Payer street address" },
          payer_city: { type: "string", description: "Payer city" },
          payer_state: { type: "string", description: "Payer state (UF)" },
          payer_zip: { type: "string", description: "Payer ZIP code (CEP)" },
          description: { type: "string", description: "Boleto description" },
        },
        required: ["amount", "due_date", "payer_name", "payer_cpf_cnpj"],
      },
    },
    {
      name: "get_boleto",
      description: "Get boleto details by ID",
      inputSchema: {
        type: "object",
        properties: { boletoId: { type: "string", description: "Boleto ID" } },
        required: ["boletoId"],
      },
    },
    {
      name: "list_boletos",
      description: "List boletos with filters",
      inputSchema: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          status: { type: "string", enum: ["EMITIDO", "A_RECEBER", "ATRASADO", "VENCIDO", "EXPIRADO", "PAGO", "CANCELADO"], description: "Boleto status" },
          page: { type: "number", description: "Page number" },
          size: { type: "number", description: "Page size" },
        },
        required: ["date_from", "date_to"],
      },
    },
    {
      name: "cancel_boleto",
      description: "Cancel (write-off) a boleto",
      inputSchema: {
        type: "object",
        properties: {
          boletoId: { type: "string", description: "Boleto ID to cancel" },
          reason: { type: "string", enum: ["ACERTOS", "APEDIDODOCLIENTE", "DEVOLUCAO", "PAGODIRETOAOCLIENTE", "SUBSTITUICAO"], description: "Cancellation reason" },
        },
        required: ["boletoId", "reason"],
      },
    },
    {
      name: "get_boleto_pdf",
      description: "Download boleto PDF (returns base64 payload)",
      inputSchema: {
        type: "object",
        properties: { boletoId: { type: "string", description: "Boleto ID (codigoSolicitacao)" } },
        required: ["boletoId"],
      },
    },
    {
      name: "create_pix",
      description: "Create a PIX payment",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Payment amount in BRL" },
          pix_key: { type: "string", description: "Recipient PIX key" },
          description: { type: "string", description: "Payment description" },
        },
        required: ["amount", "pix_key"],
      },
    },
    {
      name: "get_pix",
      description: "Get PIX transaction details by ID",
      inputSchema: {
        type: "object",
        properties: { pixId: { type: "string", description: "PIX transaction ID (e2eId)" } },
        required: ["pixId"],
      },
    },
    {
      name: "list_pix",
      description: "List PIX transactions",
      inputSchema: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          page: { type: "number", description: "Page number" },
          size: { type: "number", description: "Page size" },
        },
        required: ["date_from", "date_to"],
      },
    },
    {
      name: "create_pix_cob",
      description: "Create PIX immediate charge (cob) with txid — returns BR Code/copia-e-cola",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Unique txid (26-35 alphanumeric chars). Omit to let Inter generate." },
          amount: { type: "number", description: "Charge amount in BRL" },
          expiration: { type: "number", description: "Expiration in seconds (default 3600)" },
          payer_cpf: { type: "string", description: "Payer CPF (optional)" },
          payer_cnpj: { type: "string", description: "Payer CNPJ (optional)" },
          payer_name: { type: "string", description: "Payer name (optional)" },
          description: { type: "string", description: "Charge description (solicitacaoPagador)" },
        },
        required: ["amount"],
      },
    },
    {
      name: "get_pix_cob",
      description: "Retrieve PIX immediate charge by txid",
      inputSchema: {
        type: "object",
        properties: { txid: { type: "string", description: "Charge txid" } },
        required: ["txid"],
      },
    },
    {
      name: "list_pix_cob",
      description: "List PIX immediate charges within a time range (with optional end_to_end_id filters)",
      inputSchema: {
        type: "object",
        properties: {
          inicio: { type: "string", description: "Start timestamp (ISO 8601, e.g. 2024-01-01T00:00:00Z)" },
          fim: { type: "string", description: "End timestamp (ISO 8601)" },
          cpf: { type: "string", description: "Filter by payer CPF" },
          cnpj: { type: "string", description: "Filter by payer CNPJ" },
          status: { type: "string", enum: ["ATIVA", "CONCLUIDA", "REMOVIDA_PELO_USUARIO_RECEBEDOR", "REMOVIDA_PELO_PSP"], description: "Filter by charge status" },
          paginaAtual: { type: "number", description: "Page index" },
          itensPorPagina: { type: "number", description: "Items per page" },
        },
        required: ["inicio", "fim"],
      },
    },
    {
      name: "create_pix_cobv",
      description: "Create PIX due charge (cobv) with dueDate — boleto-like PIX with expiration date",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Unique txid (26-35 alphanumeric chars)" },
          amount: { type: "number", description: "Charge amount in BRL" },
          due_date: { type: "string", description: "Due date (YYYY-MM-DD)" },
          validity_after_due: { type: "number", description: "Days valid after due date (default 30)" },
          payer_cpf: { type: "string", description: "Payer CPF (optional)" },
          payer_cnpj: { type: "string", description: "Payer CNPJ (optional)" },
          payer_name: { type: "string", description: "Payer name" },
          payer_address: { type: "string", description: "Payer street address" },
          payer_city: { type: "string", description: "Payer city" },
          payer_state: { type: "string", description: "Payer state (UF)" },
          payer_zip: { type: "string", description: "Payer ZIP (CEP)" },
          description: { type: "string", description: "Charge description (solicitacaoPagador)" },
        },
        required: ["txid", "amount", "due_date", "payer_name"],
      },
    },
    {
      name: "get_pix_cobv",
      description: "Retrieve PIX due charge (cobv) by txid",
      inputSchema: {
        type: "object",
        properties: { txid: { type: "string", description: "Due charge txid" } },
        required: ["txid"],
      },
    },
    {
      name: "create_pix_devolucao",
      description: "Create PIX return (devolução) for a received transaction",
      inputSchema: {
        type: "object",
        properties: {
          e2eId: { type: "string", description: "End-to-end ID of the received PIX transaction" },
          devolucao_id: { type: "string", description: "Unique return ID (max 35 alphanumeric chars)" },
          amount: { type: "number", description: "Return amount in BRL (may be partial)" },
          description: { type: "string", description: "Return description" },
        },
        required: ["e2eId", "devolucao_id", "amount"],
      },
    },
    {
      name: "list_pix_keys",
      description: "List PIX keys (chaves) registered to the Inter account",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_balance",
      description: "Get account balance",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_statement",
      description: "Get account statement for a date range",
      inputSchema: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          page: { type: "number", description: "Page number" },
          size: { type: "number", description: "Page size" },
        },
        required: ["date_from", "date_to"],
      },
    },
    {
      name: "get_statement_enriched",
      description: "Get enriched statement with detailed transaction info (counterparty, category, Pix details)",
      inputSchema: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
          page: { type: "number", description: "Page number" },
          size: { type: "number", description: "Page size" },
          tipoOperacao: { type: "string", enum: ["C", "D"], description: "C=Credit, D=Debit" },
          tipoTransacao: { type: "string", description: "Transaction type filter (e.g. PIX, BOLETO, TED, TARIFA)" },
        },
        required: ["date_from", "date_to"],
      },
    },
    {
      name: "get_statement_pdf",
      description: "Download account statement as PDF (base64 payload) for a date range",
      inputSchema: {
        type: "object",
        properties: {
          date_from: { type: "string", description: "Start date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "End date (YYYY-MM-DD)" },
        },
        required: ["date_from", "date_to"],
      },
    },
    {
      name: "create_transfer",
      description: "Create a TED or internal transfer",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["TED", "PIX"], description: "Transfer type" },
          amount: { type: "number", description: "Transfer amount in BRL" },
          recipient_name: { type: "string", description: "Recipient name" },
          recipient_cpf_cnpj: { type: "string", description: "Recipient CPF or CNPJ" },
          recipient_bank: { type: "string", description: "Recipient bank code (ISPB)" },
          recipient_branch: { type: "string", description: "Recipient branch number" },
          recipient_account: { type: "string", description: "Recipient account number" },
          recipient_account_type: { type: "string", enum: ["CONTA_CORRENTE", "CONTA_POUPANCA", "CONTA_PAGAMENTO"], description: "Account type" },
          description: { type: "string", description: "Transfer description" },
        },
        required: ["type", "amount", "recipient_name", "recipient_cpf_cnpj"],
      },
    },
    {
      name: "get_webhook",
      description: "Get configured webhooks",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["boleto", "pix"], description: "Webhook type" },
        },
      },
    },
    {
      name: "create_webhook",
      description: "Register a webhook for notifications",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["boleto", "pix"], description: "Webhook type" },
          url: { type: "string", description: "Webhook callback URL" },
        },
        required: ["type", "url"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_boleto": {
        const payload: any = {
          seuNumero: Date.now().toString(),
          valorNominal: args?.amount,
          dataVencimento: args?.due_date,
          numDiasAgenda: 30,
          pagador: {
            nome: args?.payer_name,
            cpfCnpj: args?.payer_cpf_cnpj,
            endereco: args?.payer_address || "",
            cidade: args?.payer_city || "",
            uf: args?.payer_state || "",
            cep: args?.payer_zip || "",
          },
        };
        if (args?.description) payload.descricao = args.description;
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("POST", "/cobranca/v3/cobrancas", "boleto-cobranca.write", payload), null, 2) }] };
      }
      case "get_boleto":
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("GET", `/cobranca/v3/cobrancas/${args?.boletoId}`, "boleto-cobranca.read"), null, 2) }] };
      case "list_boletos": {
        const params = new URLSearchParams();
        params.set("dataInicial", String(args?.date_from));
        params.set("dataFinal", String(args?.date_to));
        if (args?.status) params.set("situacao", String(args.status));
        if (args?.page) params.set("paginaAtual", String(args.page));
        if (args?.size) params.set("itensPorPagina", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("GET", `/cobranca/v3/cobrancas?${params}`, "boleto-cobranca.read"), null, 2) }] };
      }
      case "cancel_boleto":
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("POST", `/cobranca/v3/cobrancas/${args?.boletoId}/cancelar`, "boleto-cobranca.write", { motivoCancelamento: args?.reason }), null, 2) }] };
      case "get_boleto_pdf":
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("GET", `/cobranca/v3/cobrancas/${args?.boletoId}/pdf`, "boleto-cobranca.read"), null, 2) }] };
      case "create_pix": {
        const payload: any = {
          valor: args?.amount,
          chave: args?.pix_key,
        };
        if (args?.description) payload.descricao = args.description;
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("POST", "/pix/v2/pix", "pix.write", payload), null, 2) }] };
      }
      case "get_pix":
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("GET", `/pix/v2/pix/${args?.pixId}`, "pix.read"), null, 2) }] };
      case "list_pix": {
        const params = new URLSearchParams();
        params.set("dataInicial", String(args?.date_from));
        params.set("dataFinal", String(args?.date_to));
        if (args?.page) params.set("paginaAtual", String(args.page));
        if (args?.size) params.set("itensPorPagina", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("GET", `/pix/v2/pix?${params}`, "pix.read"), null, 2) }] };
      }
      case "create_pix_cob": {
        const payload: any = {
          calendario: { expiracao: args?.expiration ?? 3600 },
          valor: { original: typeof args?.amount === "number" ? args.amount.toFixed(2) : String(args?.amount) },
          chave: args?.pix_key || process.env.INTER_PIX_KEY || "",
          solicitacaoPagador: args?.description,
        };
        if (args?.payer_cpf) payload.devedor = { cpf: args.payer_cpf, nome: args?.payer_name };
        else if (args?.payer_cnpj) payload.devedor = { cnpj: args.payer_cnpj, nome: args?.payer_name };
        const method = args?.txid ? "PUT" : "POST";
        const path = args?.txid ? `/pix/v2/cob/${args.txid}` : "/pix/v2/cob";
        return { content: [{ type: "text", text: JSON.stringify(await interRequest(method, path, "cob.write", payload), null, 2) }] };
      }
      case "get_pix_cob":
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("GET", `/pix/v2/cob/${args?.txid}`, "cob.read"), null, 2) }] };
      case "list_pix_cob": {
        const params = new URLSearchParams();
        params.set("inicio", String(args?.inicio));
        params.set("fim", String(args?.fim));
        if (args?.cpf) params.set("cpf", String(args.cpf));
        if (args?.cnpj) params.set("cnpj", String(args.cnpj));
        if (args?.status) params.set("status", String(args.status));
        if (args?.paginaAtual !== undefined) params.set("paginacao.paginaAtual", String(args.paginaAtual));
        if (args?.itensPorPagina !== undefined) params.set("paginacao.itensPorPagina", String(args.itensPorPagina));
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("GET", `/pix/v2/cob?${params}`, "cob.read"), null, 2) }] };
      }
      case "create_pix_cobv": {
        const payload: any = {
          calendario: {
            dataDeVencimento: args?.due_date,
            validadeAposVencimento: args?.validity_after_due ?? 30,
          },
          valor: { original: typeof args?.amount === "number" ? args.amount.toFixed(2) : String(args?.amount) },
          chave: args?.pix_key || process.env.INTER_PIX_KEY || "",
          devedor: {
            nome: args?.payer_name,
            logradouro: args?.payer_address || "",
            cidade: args?.payer_city || "",
            uf: args?.payer_state || "",
            cep: args?.payer_zip || "",
          },
          solicitacaoPagador: args?.description,
        };
        if (args?.payer_cpf) payload.devedor.cpf = args.payer_cpf;
        else if (args?.payer_cnpj) payload.devedor.cnpj = args.payer_cnpj;
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("PUT", `/pix/v2/cobv/${args?.txid}`, "cobv.write", payload), null, 2) }] };
      }
      case "get_pix_cobv":
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("GET", `/pix/v2/cobv/${args?.txid}`, "cobv.read"), null, 2) }] };
      case "create_pix_devolucao": {
        const payload: any = {
          valor: typeof args?.amount === "number" ? args.amount.toFixed(2) : String(args?.amount),
        };
        if (args?.description) payload.descricao = args.description;
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("PUT", `/pix/v2/pix/${args?.e2eId}/devolucao/${args?.devolucao_id}`, "pix.write", payload), null, 2) }] };
      }
      case "list_pix_keys":
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("GET", "/banking/v2/pix", "pagamento-pix.read"), null, 2) }] };
      case "get_balance":
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("GET", "/banking/v2/saldo", "extrato.read"), null, 2) }] };
      case "get_statement": {
        const params = new URLSearchParams();
        params.set("dataInicial", String(args?.date_from));
        params.set("dataFinal", String(args?.date_to));
        if (args?.page) params.set("paginaAtual", String(args.page));
        if (args?.size) params.set("itensPorPagina", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("GET", `/banking/v2/extrato?${params}`, "extrato.read"), null, 2) }] };
      }
      case "get_statement_enriched": {
        const params = new URLSearchParams();
        params.set("dataInicio", String(args?.date_from));
        params.set("dataFim", String(args?.date_to));
        if (args?.page) params.set("pagina", String(args.page));
        if (args?.size) params.set("tamanhoPagina", String(args.size));
        if (args?.tipoOperacao) params.set("tipoOperacao", String(args.tipoOperacao));
        if (args?.tipoTransacao) params.set("tipoTransacao", String(args.tipoTransacao));
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("GET", `/banking/v2/extrato/completo?${params}`, "extrato.read"), null, 2) }] };
      }
      case "get_statement_pdf": {
        const params = new URLSearchParams();
        params.set("dataInicio", String(args?.date_from));
        params.set("dataFim", String(args?.date_to));
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("GET", `/banking/v2/extrato/exportar?${params}`, "extrato.read"), null, 2) }] };
      }
      case "create_transfer": {
        const payload: any = {
          tipo: args?.type,
          valor: args?.amount,
          nome: args?.recipient_name,
          cpfCnpj: args?.recipient_cpf_cnpj,
        };
        if (args?.recipient_bank) payload.codBanco = args.recipient_bank;
        if (args?.recipient_branch) payload.agencia = args.recipient_branch;
        if (args?.recipient_account) payload.conta = args.recipient_account;
        if (args?.recipient_account_type) payload.tipoConta = args.recipient_account_type;
        if (args?.description) payload.descricao = args.description;
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("POST", "/banking/v2/ted", "pagamento-ted.write", payload), null, 2) }] };
      }
      case "get_webhook": {
        const webhookType = args?.type || "boleto";
        const scope = webhookType === "pix" ? "webhook-pix.read" : "webhook-boleto.read";
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("GET", `/webhooks/${webhookType}`, scope), null, 2) }] };
      }
      case "create_webhook": {
        const webhookType = args?.type;
        const scope = webhookType === "pix" ? "webhook-pix.write" : "webhook-boleto.write";
        return { content: [{ type: "text", text: JSON.stringify(await interRequest("PUT", `/webhooks/${webhookType}`, scope, { webhookUrl: args?.url }), null, 2) }] };
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
        const s = new Server({ name: "mcp-inter-bank", version: "0.2.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
