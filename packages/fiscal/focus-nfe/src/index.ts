#!/usr/bin/env node

/**
 * MCP Server for Focus NFe — Brazilian fiscal document emission.
 *
 * Tools:
 * NFe:
 * - create_nfe: Create and emit an NFe (nota fiscal eletronica)
 * - get_nfe: Get NFe details by reference
 * - cancel_nfe: Cancel an NFe
 * - get_nfe_pdf: Get NFe PDF (DANFE) download URL
 * - send_correction_letter: Send NFe correction letter (Carta de Correcao / CCe)
 * NFSe:
 * - create_nfse: Create and emit an NFSe (nota fiscal de servico)
 * - get_nfse: Get NFSe details by reference
 * - cancel_nfse: Cancel an NFSe
 * NFCe:
 * - create_nfce: Create and emit an NFCe (nota fiscal do consumidor)
 * - get_nfce: Get NFCe details by reference
 * - cancel_nfce: Cancel an NFCe
 * CTe (transport):
 * - create_cte: Create and emit a CTe (conhecimento de transporte eletronico)
 * - get_cte: Get CTe details by reference
 * - cancel_cte: Cancel a CTe
 * MDFe (manifest):
 * - create_mdfe: Create and emit an MDFe (manifesto eletronico de documentos fiscais)
 * - close_mdfe: Close/finalize an MDFe (encerramento)
 * Webhooks:
 * - register_webhook: Register a webhook trigger (gatilho) for fiscal events
 * - list_webhooks: List registered webhooks
 * - delete_webhook: Delete a registered webhook
 *
 * Environment:
 *   FOCUS_NFE_TOKEN — API token from https://focusnfe.com.br/
 *   FOCUS_NFE_SANDBOX — "true" to use homologation (default: false)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const TOKEN = process.env.FOCUS_NFE_TOKEN || "";
const BASE_URL = process.env.FOCUS_NFE_SANDBOX === "true"
  ? "https://homologacao.focusnfe.com.br/v2"
  : "https://api.focusnfe.com.br/v2";

async function focusNfeRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Basic " + btoa(`${TOKEN}:`),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Focus NFe API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-focus-nfe", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_nfe",
      description: "Create and emit an NFe (nota fiscal eletronica)",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Unique reference ID for this NFe" },
          natureza_operacao: { type: "string", description: "Operation nature (e.g. 'Venda de mercadoria')" },
          forma_pagamento: { type: "string", description: "Payment form code" },
          tipo_documento: { type: "number", description: "Document type (0=entrada, 1=saida)" },
          cnpj_emitente: { type: "string", description: "Emitter CNPJ" },
          nome_destinatario: { type: "string", description: "Recipient name" },
          cpf_destinatario: { type: "string", description: "Recipient CPF" },
          cnpj_destinatario: { type: "string", description: "Recipient CNPJ" },
          items: {
            type: "array",
            description: "NFe items",
            items: {
              type: "object",
              properties: {
                numero_item: { type: "number", description: "Item number" },
                codigo_produto: { type: "string", description: "Product code" },
                descricao: { type: "string", description: "Product description" },
                quantidade_comercial: { type: "number", description: "Quantity" },
                valor_unitario_comercial: { type: "number", description: "Unit value" },
                ncm: { type: "string", description: "NCM code" },
                cfop: { type: "string", description: "CFOP code" },
              },
            },
          },
        },
        required: ["ref", "natureza_operacao", "tipo_documento", "cnpj_emitente", "items"],
      },
    },
    {
      name: "get_nfe",
      description: "Get NFe details and status by reference",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "NFe reference ID" },
          completa: { type: "number", description: "Set to 1 for full detail (default 0)" },
        },
        required: ["ref"],
      },
    },
    {
      name: "cancel_nfe",
      description: "Cancel an authorized NFe (within 24h of emission)",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "NFe reference ID" },
          justificativa: { type: "string", description: "Cancellation reason (15-255 chars)" },
        },
        required: ["ref", "justificativa"],
      },
    },
    {
      name: "get_nfe_pdf",
      description: "Get NFe PDF (DANFE) download URL",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "NFe reference ID" },
        },
        required: ["ref"],
      },
    },
    {
      name: "send_correction_letter",
      description: "Send a correction letter (Carta de Correcao / CCe) for an authorized NFe",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "NFe reference ID" },
          correcao: { type: "string", description: "Correction text (15-1000 chars, cannot change tax values, parties, dates, or quantities)" },
        },
        required: ["ref", "correcao"],
      },
    },
    {
      name: "create_nfse",
      description: "Create and emit an NFSe (nota fiscal de servico)",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Unique reference ID for this NFSe" },
          razao_social: { type: "string", description: "Company name" },
          cnpj: { type: "string", description: "CNPJ of emitter" },
          inscricao_municipal: { type: "string", description: "Municipal registration" },
          servico: {
            type: "object",
            description: "Service details",
            properties: {
              valor_servicos: { type: "number", description: "Service value" },
              discriminacao: { type: "string", description: "Service description" },
              codigo_tributacao_municipio: { type: "string", description: "Municipal tax code" },
              item_lista_servico: { type: "string", description: "Service list item code" },
              aliquota: { type: "number", description: "ISS tax rate" },
            },
          },
          tomador: {
            type: "object",
            description: "Service taker (client) info",
            properties: {
              cpf: { type: "string", description: "Client CPF" },
              cnpj: { type: "string", description: "Client CNPJ" },
              razao_social: { type: "string", description: "Client name" },
              email: { type: "string", description: "Client email" },
            },
          },
        },
        required: ["ref", "cnpj", "servico"],
      },
    },
    {
      name: "get_nfse",
      description: "Get NFSe details and status by reference",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "NFSe reference ID" },
        },
        required: ["ref"],
      },
    },
    {
      name: "cancel_nfse",
      description: "Cancel an authorized NFSe",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "NFSe reference ID" },
          justificativa: { type: "string", description: "Cancellation reason" },
        },
        required: ["ref", "justificativa"],
      },
    },
    {
      name: "create_nfce",
      description: "Create and emit an NFCe (nota fiscal do consumidor eletronica)",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Unique reference ID for this NFCe" },
          natureza_operacao: { type: "string", description: "Operation nature" },
          cnpj_emitente: { type: "string", description: "Emitter CNPJ" },
          items: {
            type: "array",
            description: "NFCe items (same structure as NFe items)",
          },
          forma_pagamento: {
            type: "array",
            description: "Payment methods",
            items: {
              type: "object",
              properties: {
                forma_pagamento: { type: "string", description: "Payment form code (01=dinheiro, 03=cartao credito, etc.)" },
                valor_pagamento: { type: "number", description: "Payment value" },
              },
            },
          },
        },
        required: ["ref", "natureza_operacao", "cnpj_emitente", "items"],
      },
    },
    {
      name: "get_nfce",
      description: "Get NFCe details and status by reference",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "NFCe reference ID" },
        },
        required: ["ref"],
      },
    },
    {
      name: "cancel_nfce",
      description: "Cancel an authorized NFCe",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "NFCe reference ID" },
          justificativa: { type: "string", description: "Cancellation reason (15-255 chars)" },
        },
        required: ["ref", "justificativa"],
      },
    },
    {
      name: "create_cte",
      description: "Create and emit a CTe (conhecimento de transporte eletronico) for cargo transport",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Unique reference ID for this CTe" },
          natureza_operacao: { type: "string", description: "Operation nature (e.g. 'Prestacao de servico de transporte')" },
          cnpj_emitente: { type: "string", description: "Transport carrier CNPJ" },
          modal: { type: "string", description: "Transport modal (01=Rodoviario, 02=Aereo, 03=Aquaviario, 04=Ferroviario, 05=Dutoviario, 06=Multimodal)" },
          tipo_servico: { type: "number", description: "Service type (0=Normal, 1=Subcontratacao, 2=Redespacho, 3=Redespacho Intermediario, 4=Servico Vinculado Multimodal)" },
          remetente: { type: "object", description: "Sender info (cnpj/cpf, razao_social, endereco)" },
          destinatario: { type: "object", description: "Recipient info (cnpj/cpf, razao_social, endereco)" },
          valor_total: { type: "number", description: "Total transport service value" },
        },
        required: ["ref", "cnpj_emitente", "modal"],
      },
    },
    {
      name: "get_cte",
      description: "Get CTe details and status by reference",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "CTe reference ID" },
        },
        required: ["ref"],
      },
    },
    {
      name: "cancel_cte",
      description: "Cancel an authorized CTe",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "CTe reference ID" },
          justificativa: { type: "string", description: "Cancellation reason (15-255 chars)" },
        },
        required: ["ref", "justificativa"],
      },
    },
    {
      name: "create_mdfe",
      description: "Create and emit an MDFe (manifesto eletronico de documentos fiscais) for cargo transport manifest",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "Unique reference ID for this MDFe" },
          cnpj_emitente: { type: "string", description: "Emitter CNPJ" },
          modal: { type: "string", description: "Transport modal (1=Rodoviario, 2=Aereo, 3=Aquaviario, 4=Ferroviario)" },
          uf_inicio: { type: "string", description: "State of loading start (2 letters)" },
          uf_fim: { type: "string", description: "State of unloading end (2 letters)" },
          documentos_fiscais_vinculados: {
            type: "array",
            description: "Linked fiscal documents (NFe/CTe chaves) grouped per municipio de descarga",
          },
          rodoviario: { type: "object", description: "Road transport info: placa, renavam, ciot, condutores" },
        },
        required: ["ref", "cnpj_emitente", "modal", "uf_inicio", "uf_fim"],
      },
    },
    {
      name: "close_mdfe",
      description: "Close/finalize an MDFe (encerramento) after trip completion",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string", description: "MDFe reference ID" },
          uf_encerramento: { type: "string", description: "State of closing (2 letters)" },
          codigo_municipio_encerramento: { type: "string", description: "IBGE municipality code for closing" },
        },
        required: ["ref"],
      },
    },
    {
      name: "register_webhook",
      description: "Register a webhook trigger (gatilho) that notifies your URL when fiscal document events occur",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "HTTPS URL to receive event notifications" },
          cnpj: { type: "string", description: "CNPJ to filter events (optional, omit for all CNPJs on the token)" },
        },
        required: ["url"],
      },
    },
    {
      name: "list_webhooks",
      description: "List all registered webhooks (gatilhos)",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "delete_webhook",
      description: "Delete a registered webhook by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Webhook (gatilho) ID" },
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
      case "create_nfe": {
        const ref = args?.ref;
        const body = { ...args } as Record<string, unknown>;
        delete body.ref;
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("POST", `/nfe?ref=${ref}`, body), null, 2) }] };
      }
      case "get_nfe": {
        const completa = args?.completa === 1 ? "?completa=1" : "";
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("GET", `/nfe/${args?.ref}${completa}`), null, 2) }] };
      }
      case "cancel_nfe":
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("DELETE", `/nfe/${args?.ref}`, { justificativa: args?.justificativa }), null, 2) }] };
      case "get_nfe_pdf":
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("GET", `/nfe/${args?.ref}.json`), null, 2) }] };
      case "send_correction_letter":
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("POST", `/nfe/${args?.ref}/carta_correcao`, { correcao: args?.correcao }), null, 2) }] };
      case "create_nfse": {
        const ref = args?.ref;
        const body = { ...args } as Record<string, unknown>;
        delete body.ref;
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("POST", `/nfse?ref=${ref}`, body), null, 2) }] };
      }
      case "get_nfse":
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("GET", `/nfse/${args?.ref}`), null, 2) }] };
      case "cancel_nfse":
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("DELETE", `/nfse/${args?.ref}`, { justificativa: args?.justificativa }), null, 2) }] };
      case "create_nfce": {
        const ref = args?.ref;
        const body = { ...args } as Record<string, unknown>;
        delete body.ref;
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("POST", `/nfce?ref=${ref}`, body), null, 2) }] };
      }
      case "get_nfce":
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("GET", `/nfce/${args?.ref}`), null, 2) }] };
      case "cancel_nfce":
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("DELETE", `/nfce/${args?.ref}`, { justificativa: args?.justificativa }), null, 2) }] };
      case "create_cte": {
        const ref = args?.ref;
        const body = { ...args } as Record<string, unknown>;
        delete body.ref;
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("POST", `/cte?ref=${ref}`, body), null, 2) }] };
      }
      case "get_cte":
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("GET", `/cte/${args?.ref}`), null, 2) }] };
      case "cancel_cte":
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("DELETE", `/cte/${args?.ref}`, { justificativa: args?.justificativa }), null, 2) }] };
      case "create_mdfe": {
        const ref = args?.ref;
        const body = { ...args } as Record<string, unknown>;
        delete body.ref;
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("POST", `/mdfe?ref=${ref}`, body), null, 2) }] };
      }
      case "close_mdfe": {
        const body = { ...args } as Record<string, unknown>;
        delete body.ref;
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("POST", `/mdfe/${args?.ref}/encerramento`, body), null, 2) }] };
      }
      case "register_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("POST", `/gatilhos`, args), null, 2) }] };
      case "list_webhooks":
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("GET", `/gatilhos`), null, 2) }] };
      case "delete_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await focusNfeRequest("DELETE", `/gatilhos/${args?.id}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-focus-nfe", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
