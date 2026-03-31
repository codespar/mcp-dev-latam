#!/usr/bin/env node

/**
 * MCP Server for Nuvem Fiscal — Brazilian fiscal document platform.
 *
 * Tools:
 * - create_nfe: Create a NF-e (nota fiscal eletrônica)
 * - get_nfe: Get NF-e details by ID
 * - cancel_nfe: Cancel a NF-e
 * - create_nfse: Create a NFS-e (nota fiscal de serviço)
 * - get_nfse: Get NFS-e details by ID
 * - cancel_nfse: Cancel a NFS-e
 * - create_nfce: Create a NFC-e (nota fiscal de consumidor)
 * - consult_cnpj: Consult company data by CNPJ
 * - consult_cep: Consult address by CEP
 * - register_company: Register a company
 *
 * Environment:
 *   NUVEM_FISCAL_CLIENT_ID — OAuth2 client ID
 *   NUVEM_FISCAL_CLIENT_SECRET — OAuth2 client secret
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.NUVEM_FISCAL_CLIENT_ID || "";
const CLIENT_SECRET = process.env.NUVEM_FISCAL_CLIENT_SECRET || "";
const BASE_URL = "https://api.nuvemfiscal.com.br";

let cachedToken: { access_token: string; expires_at: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires_at) {
    return cachedToken.access_token;
  }

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "nfe nfse nfce empresa cnpj cep",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OAuth token request failed ${res.status}: ${err}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.access_token;
}

async function nuvemFiscalRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Nuvem Fiscal API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-nuvem-fiscal", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_nfe",
      description: "Create a NF-e (nota fiscal eletrônica)",
      inputSchema: {
        type: "object",
        properties: {
          ambiente: { type: "number", enum: [1, 2], description: "1=Produção, 2=Homologação" },
          natureza_operacao: { type: "string", description: "Nature of the operation (e.g. 'Venda de mercadoria')" },
          emitente: { type: "object", description: "Issuer data (CNPJ, IE, address, etc.)" },
          destinatario: { type: "object", description: "Recipient data (CPF/CNPJ, address, etc.)" },
          itens: { type: "array", description: "Array of items (product, quantity, value, taxes)" },
          pagamento: { type: "object", description: "Payment information" },
        },
        required: ["ambiente", "natureza_operacao", "emitente", "destinatario", "itens", "pagamento"],
      },
    },
    {
      name: "get_nfe",
      description: "Get NF-e details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "NF-e ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_nfe",
      description: "Cancel a NF-e",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "NF-e ID" },
          justificativa: { type: "string", description: "Cancellation reason (min 15 chars)" },
        },
        required: ["id", "justificativa"],
      },
    },
    {
      name: "create_nfse",
      description: "Create a NFS-e (nota fiscal de serviço eletrônica)",
      inputSchema: {
        type: "object",
        properties: {
          ambiente: { type: "number", enum: [1, 2], description: "1=Produção, 2=Homologação" },
          prestador: { type: "object", description: "Service provider data (CNPJ, IM, address)" },
          tomador: { type: "object", description: "Service taker data (CPF/CNPJ, address)" },
          servico: { type: "object", description: "Service details (code, description, value, taxes)" },
        },
        required: ["ambiente", "prestador", "tomador", "servico"],
      },
    },
    {
      name: "get_nfse",
      description: "Get NFS-e details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "NFS-e ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_nfse",
      description: "Cancel a NFS-e",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "NFS-e ID" },
          justificativa: { type: "string", description: "Cancellation reason" },
        },
        required: ["id", "justificativa"],
      },
    },
    {
      name: "create_nfce",
      description: "Create a NFC-e (nota fiscal de consumidor eletrônica)",
      inputSchema: {
        type: "object",
        properties: {
          ambiente: { type: "number", enum: [1, 2], description: "1=Produção, 2=Homologação" },
          emitente: { type: "object", description: "Issuer data (CNPJ, IE, address)" },
          itens: { type: "array", description: "Array of items (product, quantity, value, taxes)" },
          pagamento: { type: "object", description: "Payment information" },
        },
        required: ["ambiente", "emitente", "itens", "pagamento"],
      },
    },
    {
      name: "consult_cnpj",
      description: "Consult company data by CNPJ number",
      inputSchema: {
        type: "object",
        properties: {
          cnpj: { type: "string", description: "CNPJ number (14 digits, numbers only)" },
        },
        required: ["cnpj"],
      },
    },
    {
      name: "consult_cep",
      description: "Consult address by CEP (postal code)",
      inputSchema: {
        type: "object",
        properties: {
          cep: { type: "string", description: "CEP number (8 digits, numbers only)" },
        },
        required: ["cep"],
      },
    },
    {
      name: "register_company",
      description: "Register a company in Nuvem Fiscal",
      inputSchema: {
        type: "object",
        properties: {
          cpf_cnpj: { type: "string", description: "CPF or CNPJ of the company" },
          nome_razao_social: { type: "string", description: "Company legal name" },
          nome_fantasia: { type: "string", description: "Trade name" },
          inscricao_estadual: { type: "string", description: "State registration (IE)" },
          inscricao_municipal: { type: "string", description: "Municipal registration (IM)" },
          endereco: { type: "object", description: "Address data (logradouro, numero, bairro, cidade, uf, cep)" },
        },
        required: ["cpf_cnpj", "nome_razao_social"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_nfe":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("POST", "/nfe", args), null, 2) }] };
      case "get_nfe":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("GET", `/nfe/${args?.id}`), null, 2) }] };
      case "cancel_nfe":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("POST", `/nfe/${args?.id}/cancelamento`, { justificativa: args?.justificativa }), null, 2) }] };
      case "create_nfse":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("POST", "/nfse", args), null, 2) }] };
      case "get_nfse":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("GET", `/nfse/${args?.id}`), null, 2) }] };
      case "cancel_nfse":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("POST", `/nfse/${args?.id}/cancelamento`, { justificativa: args?.justificativa }), null, 2) }] };
      case "create_nfce":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("POST", "/nfce", args), null, 2) }] };
      case "consult_cnpj":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("GET", `/cnpj/${args?.cnpj}`), null, 2) }] };
      case "consult_cep":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("GET", `/cep/${args?.cep}`), null, 2) }] };
      case "register_company":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("POST", "/empresas", args), null, 2) }] };
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("NUVEM_FISCAL_CLIENT_ID and NUVEM_FISCAL_CLIENT_SECRET environment variables are required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
