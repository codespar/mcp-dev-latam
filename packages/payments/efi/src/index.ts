#!/usr/bin/env node

/**
 * MCP Server for EFI (Gerencianet) — Pix, charges, and carnets.
 *
 * Tools:
 * - create_cob: Create a Pix immediate charge (cobranca)
 * - get_cob: Get Pix charge details by txid
 * - list_cobs: List Pix charges with filters
 * - create_cobv: Create a Pix due charge (cobranca com vencimento)
 * - get_cobv: Get Pix due charge details by txid
 * - update_cobv: Update an existing Pix due charge (cobv)
 * - create_devolucao: Request a Pix devolution (refund) on a received Pix
 * - get_devolucao: Get details of a Pix devolution
 * - list_pix_received: List received Pix transactions (recebidos)
 * - create_charge: Create a billing charge (boleto/credit card)
 * - get_charge: Get charge details by ID
 * - create_carnet: Create a carnet (payment booklet)
 * - get_pix_key: Get Pix key details
 * - create_pix_evp: Create a random Pix key (EVP)
 * - delete_pix_key: Delete a registered Pix key (DICT)
 * - register_webhook: Register a webhook URL for a Pix key
 * - list_webhooks: List registered webhooks
 * - delete_webhook: Delete the webhook registered to a Pix key
 *
 * Environment:
 *   EFI_CLIENT_ID — OAuth2 client ID from https://app.efipay.com.br/
 *   EFI_CLIENT_SECRET — OAuth2 client secret
 *   EFI_SANDBOX — "true" to use sandbox (default: false)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.EFI_CLIENT_ID || "";
const CLIENT_SECRET = process.env.EFI_CLIENT_SECRET || "";
const BASE_URL = process.env.EFI_SANDBOX === "true"
  ? "https://pix-h.api.efipay.com.br"
  : "https://pix.api.efipay.com.br";

let accessToken = "";
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Basic " + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`),
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`EFI OAuth ${res.status}: ${err}`);
  }
  const data = await res.json() as { access_token: string; expires_in: number };
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return accessToken;
}

async function efiRequest(method: string, path: string, body?: unknown): Promise<unknown> {
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
    throw new Error(`EFI API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-efi", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_cob",
      description: "Create an immediate Pix charge (cobranca imediata)",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Transaction ID (26-35 chars, alphanumeric)" },
          calendario: {
            type: "object",
            description: "Expiration settings",
            properties: {
              expiracao: { type: "number", description: "Expiration in seconds (default 3600)" },
            },
          },
          valor: {
            type: "object",
            description: "Charge value",
            properties: {
              original: { type: "string", description: "Amount as string (e.g. '10.00')" },
            },
            required: ["original"],
          },
          chave: { type: "string", description: "Pix key of the receiver" },
          devedor: {
            type: "object",
            description: "Debtor info",
            properties: {
              cpf: { type: "string", description: "Debtor CPF" },
              nome: { type: "string", description: "Debtor name" },
            },
          },
          solicitacaoPagador: { type: "string", description: "Message to payer" },
        },
        required: ["valor", "chave"],
      },
    },
    {
      name: "get_cob",
      description: "Get Pix charge details by txid",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Transaction ID" },
        },
        required: ["txid"],
      },
    },
    {
      name: "list_cobs",
      description: "List Pix charges by date range",
      inputSchema: {
        type: "object",
        properties: {
          inicio: { type: "string", description: "Start date (ISO 8601)" },
          fim: { type: "string", description: "End date (ISO 8601)" },
          status: { type: "string", enum: ["ATIVA", "CONCLUIDA", "REMOVIDA_PELO_USUARIO_RECEBEDOR", "REMOVIDA_PELO_PSP"], description: "Filter by status" },
        },
        required: ["inicio", "fim"],
      },
    },
    {
      name: "create_charge",
      description: "Create a billing charge (boleto or credit card)",
      inputSchema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "Charge items",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Item name" },
                value: { type: "number", description: "Item value in cents" },
                amount: { type: "number", description: "Quantity" },
              },
              required: ["name", "value", "amount"],
            },
          },
        },
        required: ["items"],
      },
    },
    {
      name: "get_charge",
      description: "Get charge details by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Charge ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "create_carnet",
      description: "Create a carnet (payment booklet with multiple parcels)",
      inputSchema: {
        type: "object",
        properties: {
          items: {
            type: "array",
            description: "Carnet items",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Item name" },
                value: { type: "number", description: "Item value in cents" },
                amount: { type: "number", description: "Quantity" },
              },
              required: ["name", "value", "amount"],
            },
          },
          customer: {
            type: "object",
            description: "Customer info",
            properties: {
              name: { type: "string", description: "Customer name" },
              cpf: { type: "string", description: "Customer CPF" },
            },
            required: ["name", "cpf"],
          },
          expire_at: { type: "string", description: "First parcel due date (YYYY-MM-DD)" },
          repeats: { type: "number", description: "Number of parcels" },
        },
        required: ["items", "customer", "expire_at", "repeats"],
      },
    },
    {
      name: "get_pix_key",
      description: "Get details of a registered Pix key",
      inputSchema: {
        type: "object",
        properties: {
          chave: { type: "string", description: "Pix key value" },
        },
        required: ["chave"],
      },
    },
    {
      name: "create_pix_evp",
      description: "Create a random Pix key (EVP/alias)",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_cobv",
      description: "Create a Pix due charge (cobranca com vencimento). If txid omitted, server-generated.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Transaction ID (26-35 chars). If provided, PUT is used." },
          calendario: {
            type: "object",
            description: "Calendar settings",
            properties: {
              dataDeVencimento: { type: "string", description: "Due date (YYYY-MM-DD)" },
              validadeAposVencimento: { type: "number", description: "Days valid after due date" },
            },
            required: ["dataDeVencimento"],
          },
          valor: {
            type: "object",
            description: "Charge value with optional juros/multa/desconto",
            properties: {
              original: { type: "string", description: "Amount as string (e.g. '100.00')" },
            },
            required: ["original"],
          },
          chave: { type: "string", description: "Pix key of the receiver" },
          devedor: {
            type: "object",
            description: "Debtor info (CPF or CNPJ required)",
            properties: {
              cpf: { type: "string", description: "Debtor CPF" },
              cnpj: { type: "string", description: "Debtor CNPJ" },
              nome: { type: "string", description: "Debtor name" },
            },
            required: ["nome"],
          },
          solicitacaoPagador: { type: "string", description: "Message to payer" },
        },
        required: ["calendario", "valor", "chave", "devedor"],
      },
    },
    {
      name: "get_cobv",
      description: "Get Pix due charge (cobv) details by txid",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Transaction ID" },
        },
        required: ["txid"],
      },
    },
    {
      name: "update_cobv",
      description: "Update an existing Pix due charge (cobv) by txid",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Transaction ID of the cobv to update" },
          calendario: { type: "object", description: "Calendar settings to update" },
          valor: { type: "object", description: "Charge value to update" },
          devedor: { type: "object", description: "Debtor info to update" },
          solicitacaoPagador: { type: "string", description: "Message to payer" },
          status: { type: "string", enum: ["REMOVIDA_PELO_USUARIO_RECEBEDOR"], description: "Set to remove the cobv" },
        },
        required: ["txid"],
      },
    },
    {
      name: "create_devolucao",
      description: "Request a Pix devolution (refund) on a received Pix transaction",
      inputSchema: {
        type: "object",
        properties: {
          e2eId: { type: "string", description: "End-to-end Pix ID of the original transaction" },
          id: { type: "string", description: "Devolution ID (client-generated, up to 35 chars)" },
          valor: { type: "string", description: "Refund amount as string (e.g. '10.00')" },
          natureza: { type: "string", enum: ["ORIGINAL", "RETIRADA"], description: "Refund nature" },
          descricao: { type: "string", description: "Refund description" },
        },
        required: ["e2eId", "id", "valor"],
      },
    },
    {
      name: "get_devolucao",
      description: "Get details of a Pix devolution by e2eId and devolution id",
      inputSchema: {
        type: "object",
        properties: {
          e2eId: { type: "string", description: "End-to-end Pix ID" },
          id: { type: "string", description: "Devolution ID" },
        },
        required: ["e2eId", "id"],
      },
    },
    {
      name: "list_pix_received",
      description: "List received Pix transactions (recebidos) by date range",
      inputSchema: {
        type: "object",
        properties: {
          inicio: { type: "string", description: "Start date (ISO 8601)" },
          fim: { type: "string", description: "End date (ISO 8601)" },
          txid: { type: "string", description: "Filter by txid" },
          cpf: { type: "string", description: "Filter by payer CPF" },
          cnpj: { type: "string", description: "Filter by payer CNPJ" },
        },
        required: ["inicio", "fim"],
      },
    },
    {
      name: "delete_pix_key",
      description: "Delete a registered Pix key (DICT)",
      inputSchema: {
        type: "object",
        properties: {
          chave: { type: "string", description: "Pix key value to delete" },
        },
        required: ["chave"],
      },
    },
    {
      name: "register_webhook",
      description: "Register a webhook URL for a given Pix key",
      inputSchema: {
        type: "object",
        properties: {
          chave: { type: "string", description: "Pix key to attach the webhook to" },
          webhookUrl: { type: "string", description: "HTTPS URL to receive webhook events" },
        },
        required: ["chave", "webhookUrl"],
      },
    },
    {
      name: "list_webhooks",
      description: "List registered webhooks by date range",
      inputSchema: {
        type: "object",
        properties: {
          inicio: { type: "string", description: "Start date (ISO 8601)" },
          fim: { type: "string", description: "End date (ISO 8601)" },
        },
        required: ["inicio", "fim"],
      },
    },
    {
      name: "delete_webhook",
      description: "Delete the webhook registered for a Pix key",
      inputSchema: {
        type: "object",
        properties: {
          chave: { type: "string", description: "Pix key whose webhook should be removed" },
        },
        required: ["chave"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_cob": {
        const txid = args?.txid;
        const body = { ...args } as Record<string, unknown>;
        delete body.txid;
        const path = txid ? `/v2/cob/${txid}` : "/v2/cob";
        const method = txid ? "PUT" : "POST";
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest(method, path, body), null, 2) }] };
      }
      case "get_cob":
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("GET", `/v2/cob/${args?.txid}`), null, 2) }] };
      case "list_cobs": {
        const params = new URLSearchParams();
        params.set("inicio", String(args?.inicio));
        params.set("fim", String(args?.fim));
        if (args?.status) params.set("status", String(args.status));
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("GET", `/v2/cob?${params}`), null, 2) }] };
      }
      case "create_charge":
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("POST", "/v1/charge", args), null, 2) }] };
      case "get_charge":
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("GET", `/v1/charge/${args?.id}`), null, 2) }] };
      case "create_carnet":
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("POST", "/v1/carnet", args), null, 2) }] };
      case "get_pix_key":
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("GET", `/v2/gn/pix/keys/${args?.chave}`), null, 2) }] };
      case "create_pix_evp":
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("POST", "/v2/gn/evp"), null, 2) }] };
      case "create_cobv": {
        const txid = args?.txid;
        const body = { ...args } as Record<string, unknown>;
        delete body.txid;
        const path = txid ? `/v2/cobv/${txid}` : "/v2/cobv";
        const method = txid ? "PUT" : "POST";
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest(method, path, body), null, 2) }] };
      }
      case "get_cobv":
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("GET", `/v2/cobv/${args?.txid}`), null, 2) }] };
      case "update_cobv": {
        const body = { ...args } as Record<string, unknown>;
        delete body.txid;
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("PATCH", `/v2/cobv/${args?.txid}`, body), null, 2) }] };
      }
      case "create_devolucao": {
        const body = { valor: args?.valor } as Record<string, unknown>;
        if (args?.natureza) body.natureza = args.natureza;
        if (args?.descricao) body.descricao = args.descricao;
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("PUT", `/v2/pix/${args?.e2eId}/devolucao/${args?.id}`, body), null, 2) }] };
      }
      case "get_devolucao":
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("GET", `/v2/pix/${args?.e2eId}/devolucao/${args?.id}`), null, 2) }] };
      case "list_pix_received": {
        const params = new URLSearchParams();
        params.set("inicio", String(args?.inicio));
        params.set("fim", String(args?.fim));
        if (args?.txid) params.set("txid", String(args.txid));
        if (args?.cpf) params.set("cpf", String(args.cpf));
        if (args?.cnpj) params.set("cnpj", String(args.cnpj));
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("GET", `/v2/pix?${params}`), null, 2) }] };
      }
      case "delete_pix_key":
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("DELETE", `/v2/gn/pix/keys/${args?.chave}`), null, 2) }] };
      case "register_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("PUT", `/v2/webhook/${args?.chave}`, { webhookUrl: args?.webhookUrl }), null, 2) }] };
      case "list_webhooks": {
        const params = new URLSearchParams();
        params.set("inicio", String(args?.inicio));
        params.set("fim", String(args?.fim));
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("GET", `/v2/webhook?${params}`), null, 2) }] };
      }
      case "delete_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await efiRequest("DELETE", `/v2/webhook/${args?.chave}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-efi", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
