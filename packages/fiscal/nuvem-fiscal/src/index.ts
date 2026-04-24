#!/usr/bin/env node

/**
 * MCP Server for Nuvem Fiscal — Brazilian fiscal document platform.
 *
 * Tools (24 total):
 * - create_nfe: Create a NF-e (nota fiscal eletrônica)
 * - get_nfe: Get NF-e details by ID
 * - cancel_nfe: Cancel a NF-e
 * - get_nfe_events: Get events for a NF-e
 * - send_correction_letter_nfe: Send NF-e carta de correção (CCe)
 * - get_nfe_batch: Get NF-e batch (lote) status by ID
 * - create_nfse: Create a NFS-e (nota fiscal de serviço)
 * - get_nfse: Get NFS-e details by ID
 * - cancel_nfse: Cancel a NFS-e
 * - create_nfce: Create a NFC-e (nota fiscal de consumidor)
 * - cancel_nfce: Cancel a NFC-e
 * - create_cte: Create a CT-e (conhecimento de transporte eletrônico)
 * - get_cte: Get CT-e details by ID
 * - cancel_cte: Cancel a CT-e
 * - send_correction_letter_cte: Send CT-e carta de correção
 * - create_mdfe: Create a MDF-e (manifesto de documentos fiscais)
 * - get_mdfe: Get MDF-e details by ID
 * - cancel_mdfe: Cancel a MDF-e
 * - close_mdfe: Close (encerrar) a MDF-e
 * - consult_cnpj: Consult company data by CNPJ
 * - consult_cep: Consult address by CEP
 * - register_company: Register a company
 * - list_empresas: List registered companies
 * - upload_certificate: Upload A1 digital certificate for a company
 *
 * Environment:
 *   NUVEM_FISCAL_CLIENT_ID — OAuth2 client ID
 *   NUVEM_FISCAL_CLIENT_SECRET — OAuth2 client secret
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
  create_nfe: { id: "nfe_demo_001", status: "autorizada", numero: 1234, serie: 1, chave: "35260412345678000190550010000012341000000001", valorTotal: 150.00, dataEmissao: "2026-04-12T10:30:00Z", xml_url: "https://api.nuvemfiscal.com.br/demo/nfe.xml", pdf_url: "https://api.nuvemfiscal.com.br/demo/danfe.pdf" },
  consult_cnpj: { cnpj: "12345678000190", razaoSocial: "Demo Comércio LTDA", nomeFantasia: "Demo Shop", situacao: "ATIVA", uf: "SP" },
  get_nfe: { id: "nfe_demo_001", status: "autorizada", numero: 1234, serie: 1, chave: "35260412345678000190550010000012341000000001", valorTotal: 150.00 },
  cancel_nfe: { id: "nfe_demo_001", status: "cancelada", protocolo: "135260000000001" },
  create_nfse: { id: "nfse_demo_001", status: "autorizada", numero: 567, valorServico: 500.00, dataEmissao: "2026-04-12T10:30:00Z" },
  consult_cep: { cep: "01001000", logradouro: "Praça da Sé", bairro: "Sé", cidade: "São Paulo", uf: "SP" },
};

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
      scope: "nfe nfse nfce cte mdfe empresa cnpj cep",
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
  { name: "mcp-nuvem-fiscal", version: "0.2.0" },
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
    {
      name: "create_cte",
      description: "Create a CT-e (conhecimento de transporte eletrônico)",
      inputSchema: {
        type: "object",
        properties: {
          ambiente: { type: "number", enum: [1, 2], description: "1=Produção, 2=Homologação" },
          tipo: { type: "number", enum: [0, 1, 2, 3], description: "0=Normal, 1=Complementar, 2=Anulação, 3=Substituto" },
          emitente: { type: "object", description: "Issuer data (CNPJ, IE, address)" },
          remetente: { type: "object", description: "Sender data (CPF/CNPJ, address)" },
          destinatario: { type: "object", description: "Recipient data (CPF/CNPJ, address)" },
          valores: { type: "object", description: "Service values (total, receive, taxes)" },
          modal: { type: "string", enum: ["rodoviario", "aereo", "aquaviario", "ferroviario", "dutoviario"], description: "Transport mode" },
        },
        required: ["ambiente", "emitente", "remetente", "destinatario", "valores"],
      },
    },
    {
      name: "get_cte",
      description: "Get CT-e details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "CT-e ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_cte",
      description: "Cancel a CT-e",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "CT-e ID" },
          justificativa: { type: "string", description: "Cancellation reason (min 15 chars)" },
        },
        required: ["id", "justificativa"],
      },
    },
    {
      name: "create_mdfe",
      description: "Create a MDF-e (manifesto de documentos fiscais eletrônico)",
      inputSchema: {
        type: "object",
        properties: {
          ambiente: { type: "number", enum: [1, 2], description: "1=Produção, 2=Homologação" },
          emitente: { type: "object", description: "Issuer data (CNPJ, IE, address)" },
          modal: { type: "string", enum: ["rodoviario", "aereo", "aquaviario", "ferroviario"], description: "Transport mode" },
          documentos: { type: "array", description: "Array of linked documents (NF-e/CT-e keys)" },
          percurso: { type: "array", description: "Route UFs (array of state codes)" },
          veiculos: { type: "object", description: "Vehicle data (plate, RNTRC, etc.)" },
        },
        required: ["ambiente", "emitente", "modal", "documentos"],
      },
    },
    {
      name: "get_nfe_events",
      description: "Get events for a NF-e (cancellations, corrections, etc.)",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "NF-e ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_nfce",
      description: "Cancel a NFC-e (nota fiscal de consumidor eletrônica)",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "NFC-e ID" },
          justificativa: { type: "string", description: "Cancellation reason (min 15 chars)" },
        },
        required: ["id", "justificativa"],
      },
    },
    {
      name: "send_correction_letter_nfe",
      description: "Send a carta de correção eletrônica (CCe) for a NF-e. Used to correct minor errors without cancelling.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "NF-e ID" },
          correcao: { type: "string", description: "Correction text (min 15 chars, max 1000)" },
          sequencia: { type: "number", description: "Sequence number (1-20), defaults to 1" },
        },
        required: ["id", "correcao"],
      },
    },
    {
      name: "send_correction_letter_cte",
      description: "Send a carta de correção for a CT-e. Used to correct minor errors without cancelling.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "CT-e ID" },
          correcoes: { type: "array", description: "Array of corrections (grupoAlterado, campoAlterado, valorAlterado, nroItemAlterado)" },
          sequencia: { type: "number", description: "Sequence number (1-20), defaults to 1" },
        },
        required: ["id", "correcoes"],
      },
    },
    {
      name: "get_nfe_batch",
      description: "Get NF-e batch (lote) status by batch ID. Use for batch emissions.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Batch (lote) ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_mdfe",
      description: "Get MDF-e details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "MDF-e ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "cancel_mdfe",
      description: "Cancel a MDF-e (manifesto)",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "MDF-e ID" },
          justificativa: { type: "string", description: "Cancellation reason (min 15 chars)" },
        },
        required: ["id", "justificativa"],
      },
    },
    {
      name: "close_mdfe",
      description: "Close (encerrar) a MDF-e at route end. Required after delivery completion.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "MDF-e ID" },
          uf: { type: "string", description: "UF code where manifesto is being closed (e.g. 'SP')" },
          municipio: { type: "string", description: "IBGE code of closing municipality" },
          dataEncerramento: { type: "string", description: "Closing date (ISO 8601)" },
        },
        required: ["id", "uf", "municipio"],
      },
    },
    {
      name: "list_empresas",
      description: "List all companies (empresas) registered in the account.",
      inputSchema: {
        type: "object",
        properties: {
          top: { type: "number", description: "Maximum number of records to return" },
          skip: { type: "number", description: "Number of records to skip (pagination)" },
          cpf_cnpj: { type: "string", description: "Filter by CPF or CNPJ" },
        },
      },
    },
    {
      name: "upload_certificate",
      description: "Upload or update an A1 digital certificate (.pfx, base64) for an empresa. Required to emit fiscal documents.",
      inputSchema: {
        type: "object",
        properties: {
          cpf_cnpj: { type: "string", description: "Company CPF or CNPJ (identifier)" },
          certificado: { type: "string", description: "Certificate .pfx file encoded as base64" },
          senha: { type: "string", description: "Certificate password" },
        },
        required: ["cpf_cnpj", "certificado", "senha"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (DEMO_MODE) {
    return { content: [{ type: "text", text: JSON.stringify(DEMO_RESPONSES[name] || { demo: true, tool: name }, null, 2) }] };
  }

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
      case "create_cte":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("POST", "/cte", args), null, 2) }] };
      case "get_cte":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("GET", `/cte/${args?.id}`), null, 2) }] };
      case "cancel_cte":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("POST", `/cte/${args?.id}/cancelamento`, { justificativa: args?.justificativa }), null, 2) }] };
      case "create_mdfe":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("POST", "/mdfe", args), null, 2) }] };
      case "get_nfe_events":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("GET", `/nfe/${args?.id}/eventos`), null, 2) }] };
      case "cancel_nfce":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("POST", `/nfce/${args?.id}/cancelamento`, { justificativa: args?.justificativa }), null, 2) }] };
      case "send_correction_letter_nfe":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("POST", `/nfe/${args?.id}/carta-correcao`, { correcao: args?.correcao, sequencia: args?.sequencia ?? 1 }), null, 2) }] };
      case "send_correction_letter_cte":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("POST", `/cte/${args?.id}/carta-correcao`, { correcoes: args?.correcoes, sequencia: args?.sequencia ?? 1 }), null, 2) }] };
      case "get_nfe_batch":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("GET", `/nfe/lotes/${args?.id}`), null, 2) }] };
      case "get_mdfe":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("GET", `/mdfe/${args?.id}`), null, 2) }] };
      case "cancel_mdfe":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("POST", `/mdfe/${args?.id}/cancelamento`, { justificativa: args?.justificativa }), null, 2) }] };
      case "close_mdfe":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("POST", `/mdfe/${args?.id}/encerramento`, { uf: args?.uf, municipio: args?.municipio, dataEncerramento: args?.dataEncerramento }), null, 2) }] };
      case "list_empresas": {
        const q = new URLSearchParams();
        if (args?.top !== undefined) q.set("$top", String(args.top));
        if (args?.skip !== undefined) q.set("$skip", String(args.skip));
        if (args?.cpf_cnpj) q.set("cpf_cnpj", String(args.cpf_cnpj));
        const qs = q.toString();
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("GET", `/empresas${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "upload_certificate":
        return { content: [{ type: "text", text: JSON.stringify(await nuvemFiscalRequest("PUT", `/empresas/${args?.cpf_cnpj}/certificado`, { certificado: args?.certificado, senha: args?.senha }), null, 2) }] };
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
        const s = new Server({ name: "mcp-nuvem-fiscal", version: "0.2.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
