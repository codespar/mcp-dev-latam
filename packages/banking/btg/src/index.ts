#!/usr/bin/env node

/**
 * MCP Server for BTG Pactual — Brazil's (and LatAm's) largest investment bank.
 *
 * BTG runs a digital banking + investments stack (BTG+) on top of an
 * institutional brokerage backbone. Counterparties integrate to BTG for the
 * combination of Pix/boleto rails *and* an investment-account API surface
 * (CDB, LCI, LCA, debêntures, funds) that retail banks don't expose:
 *
 *   Pix          — immediate cob (create, get)
 *   Cobrança     — boleto lifecycle
 *   Account      — balance, statement
 *   Investments  — positions, portfolio summary, funds list/subscribe/redeem
 *
 * Tools (12):
 *   get_oauth_token              — mint/return a cached OAuth bearer (exposed for inspection)
 *   create_pix_cob               — create an immediate Pix charge (cob) + QR
 *   get_pix_cob                  — retrieve a Pix immediate charge by txid
 *   create_boleto                — issue a boleto via BTG Cobrança
 *   get_boleto                   — retrieve a boleto
 *   get_account_balance          — account balance (BTG+ checking)
 *   get_account_statement        — account statement transactions
 *   list_investment_positions    — list CDB / LCI / LCA / debêntures positions
 *   get_portfolio_summary        — consolidated portfolio summary across asset classes
 *   list_funds_available         — list funds available on BTG's distribution platform
 *   subscribe_to_fund            — subscribe (aplicar) to a fund
 *   redeem_from_fund             — redeem (resgatar) from a fund
 *
 * Authentication
 *   OAuth 2.0 client_credentials + mandatory mTLS. BACEN requires mTLS for
 *   Pix v2, and BTG's Developer Portal enforces it across product families
 *   (banking + investments). This server loads the client cert + key from
 *   disk (paths via env) and routes all HTTPS requests through a Node
 *   https.Agent that presents them.
 *
 * Version: 0.1.0-alpha.1
 *   developer.btgpactual.com is contract-gated — full OpenAPI specs are only
 *   visible to onboarded counterparties. Endpoint paths below are best-guess
 *   based on (a) BACEN Pix v2 standard paths, (b) BTG public marketing pages,
 *   and (c) conventions shared with peers (Itaú, Santander, Bradesco).
 *   Every path that has not been byte-verified is marked TODO(verify).
 *   Consumers should treat 0.1.x as alpha and pin to exact versions.
 *
 * Environment
 *   BTG_CLIENT_ID      OAuth client id
 *   BTG_CLIENT_SECRET  OAuth client secret
 *   BTG_CERT_PATH      path to mTLS client cert (.crt/.pem)
 *   BTG_KEY_PATH       path to mTLS private key (.key/.pem)
 *   BTG_ENV            "sandbox" | "production" (default: sandbox)
 *
 * Docs: https://developer.btgpactual.com
 */

import { readFileSync } from "node:fs";
import { Agent as HttpsAgent } from "node:https";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.BTG_CLIENT_ID || "";
const CLIENT_SECRET = process.env.BTG_CLIENT_SECRET || "";
const CERT_PATH = process.env.BTG_CERT_PATH || "";
const KEY_PATH = process.env.BTG_KEY_PATH || "";
const BTG_ENV = (process.env.BTG_ENV || "sandbox").toLowerCase();

// TODO(verify): sandbox base URL. BTG publishes a separate sandbox subdomain
// to onboarded counterparties; the exact host is contract-gated.
const BASE_URL = BTG_ENV === "production"
  ? "https://api.btgpactual.com"
  : "https://sandbox.api.btgpactual.com";

// Lazy-load the mTLS agent so `--help` / schema introspection doesn't crash
// when certs are missing. Banking ops that actually hit the wire will fail
// loudly with a clear message if certs are unset.
let mtlsAgent: HttpsAgent | null = null;
function getMtlsAgent(): HttpsAgent {
  if (mtlsAgent) return mtlsAgent;
  if (!CERT_PATH || !KEY_PATH) {
    throw new Error(
      "BTG mTLS certificates are required. Set BTG_CERT_PATH and BTG_KEY_PATH " +
      "to the client cert and private-key files issued by BTG's Developer Portal."
    );
  }
  mtlsAgent = new HttpsAgent({
    cert: readFileSync(CERT_PATH),
    key: readFileSync(KEY_PATH),
    keepAlive: true,
  });
  return mtlsAgent;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }
  // TODO(verify): token path. BTG commonly exposes /auth/oauth/v2/token or
  // /api/oauth/token; client-assertion JWT is preferred for high-trust flows
  // but Basic auth is accepted for client_credentials in sandbox.
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetchWithMtls(`${BASE_URL}/auth/oauth/v2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`BTG OAuth ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

// Node's global fetch honours a Dispatcher via the `dispatcher` option, but
// the ergonomic cross-runtime path is to pass an https.Agent through the
// undocumented `agent` field. On Node 20+ with undici this is ignored, so we
// fall back to node:https manually when mTLS is required.
async function fetchWithMtls(
  url: string,
  init: { method: string; headers?: Record<string, string>; body?: string }
): Promise<{ ok: boolean; status: number; text: () => Promise<string>; json: () => Promise<unknown> }> {
  const agent = getMtlsAgent();
  const { request } = await import("node:https");
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = request(
      {
        agent,
        method: init.method,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        headers: init.headers ?? {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text: async () => buf.toString("utf8"),
            json: async () => JSON.parse(buf.toString("utf8")),
          });
        });
      }
    );
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

async function btgRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetchWithMtls(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "x-btg-correlation-id": `mcp-${Date.now()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`BTG API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-btg", version: "0.1.0-alpha.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_oauth_token",
      description: "Mint or return a cached OAuth2 client_credentials bearer token for the BTG Developer Portal. Exposed so agents can inspect token freshness; normal tool calls obtain tokens implicitly.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_pix_cob",
      description: "Create an immediate Pix charge (cob) with QR code. Returns the txid, copy-paste EMV payload, and location URL. BACEN Pix v2 standard surface.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Amount in BRL major units, e.g. '99.90'" },
          payer: {
            type: "object",
            description: "Payer identification (recommended for cob; required for cobv)",
            properties: {
              document: { type: "string", description: "CPF or CNPJ digits only" },
              name: { type: "string" },
            },
          },
          expires_in: { type: "number", description: "QR lifetime in seconds (default 3600)" },
          description: { type: "string", description: "Payer-visible description (max 140 chars)" },
          additional_info: { type: "array", description: "Optional free-text key/value info shown to the payer" },
        },
        required: ["amount"],
      },
    },
    {
      name: "get_pix_cob",
      description: "Retrieve an immediate Pix charge (cob) by its txid.",
      inputSchema: {
        type: "object",
        properties: {
          txid: { type: "string", description: "Pix charge txid (BACEN-format alphanumeric, 26-35 chars)" },
        },
        required: ["txid"],
      },
    },
    {
      name: "create_boleto",
      description: "Issue a boleto via BTG Cobrança. Returns nosso_numero, linha_digitável, barcode, and PDF URL.",
      inputSchema: {
        type: "object",
        properties: {
          amount: { type: "string", description: "Amount in BRL major units, e.g. '150.00'" },
          due_date: { type: "string", description: "Due date ISO-8601 (YYYY-MM-DD)" },
          payer: {
            type: "object",
            description: "Payer (sacado) data",
            properties: {
              name: { type: "string" },
              document: { type: "string", description: "CPF or CNPJ digits only" },
              address: {
                type: "object",
                properties: {
                  street: { type: "string" },
                  number: { type: "string" },
                  complement: { type: "string" },
                  district: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string", description: "2-letter UF code" },
                  postal_code: { type: "string", description: "CEP digits only" },
                },
              },
            },
            required: ["name", "document"],
          },
          our_number: { type: "string", description: "Nosso_numero. Omit to have BTG assign one." },
          instructions: { type: "array", description: "Free-text instructions printed on the boleto", items: { type: "string" } },
          fine: { type: "object", description: "Multa (fine after due date): { percentage?, amount?, days_after_due? }" },
          interest: { type: "object", description: "Juros (daily interest after due date): { percentage?, amount? }" },
        },
        required: ["amount", "due_date", "payer"],
      },
    },
    {
      name: "get_boleto",
      description: "Retrieve a boleto by its BTG identifier (id or nosso_numero).",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Boleto id or nosso_numero" },
        },
        required: ["id"],
      },
    },
    {
      name: "get_account_balance",
      description: "Retrieve the available balance for a BTG+ checking account (conta corrente). Returns available, blocked, and total balances in BRL.",
      inputSchema: {
        type: "object",
        properties: {
          account: { type: "string", description: "Agência-conta identifier of the BTG+ account" },
        },
        required: ["account"],
      },
    },
    {
      name: "get_account_statement",
      description: "Retrieve account statement transactions for a given period. Paginated.",
      inputSchema: {
        type: "object",
        properties: {
          account: { type: "string", description: "Agência-conta identifier of the BTG+ account" },
          from: { type: "string", description: "Start date ISO-8601 (YYYY-MM-DD)" },
          to: { type: "string", description: "End date ISO-8601 (YYYY-MM-DD)" },
          page: { type: "number", description: "Page number (1-indexed)" },
          page_size: { type: "number", description: "Items per page (default 50)" },
        },
        required: ["account", "from", "to"],
      },
    },
    {
      name: "list_investment_positions",
      description: "List the counterparty's investment positions held at BTG, scoped to fixed-income asset classes (CDB, LCI, LCA, LF, LFSN, debêntures, CRI, CRA). Each position includes issuer, indexer (CDI/IPCA/Prefixado), gross value, net value (after IR/IOF), and maturity.",
      inputSchema: {
        type: "object",
        properties: {
          account: { type: "string", description: "Investment account identifier (BTG investor code, distinct from checking agência-conta)" },
          asset_class: { type: "string", description: "Optional filter: CDB | LCI | LCA | LF | LFSN | DEBENTURE | CRI | CRA" },
          maturity_from: { type: "string", description: "Optional maturity filter — earliest YYYY-MM-DD" },
          maturity_to: { type: "string", description: "Optional maturity filter — latest YYYY-MM-DD" },
        },
        required: ["account"],
      },
    },
    {
      name: "get_portfolio_summary",
      description: "Consolidated portfolio summary across all asset classes held at BTG (fixed income, funds, equities, treasury, crypto). Returns gross value, net value, % allocation per class, and total IR/IOF estimate.",
      inputSchema: {
        type: "object",
        properties: {
          account: { type: "string", description: "Investment account identifier (BTG investor code)" },
          reference_date: { type: "string", description: "Optional reference date YYYY-MM-DD; defaults to D-1 close" },
        },
        required: ["account"],
      },
    },
    {
      name: "list_funds_available",
      description: "List funds available for distribution on BTG's platform. Returns fund CNPJ, name, manager, class (Renda Fixa | Multimercado | Ações | Cambial | Previdência | FIDC | FII), benchmark, fee schedule, minimum subscription, and liquidity (cotização / liquidação D+n).",
      inputSchema: {
        type: "object",
        properties: {
          asset_class: { type: "string", description: "Optional filter: RF | MM | ACOES | CAMBIAL | PREV | FIDC | FII" },
          manager: { type: "string", description: "Optional manager name filter" },
          min_subscription_max: { type: "string", description: "Optional cap on minimum subscription (BRL major units)" },
          page: { type: "number" },
          page_size: { type: "number" },
        },
      },
    },
    {
      name: "subscribe_to_fund",
      description: "Subscribe (aplicar) to a fund on BTG's distribution platform. Settlement follows the fund's cotização/liquidação rule (typically D+0 cotização, D+1 liquidação for RF; D+30 for some FIDC). Requires a suitability profile on file.",
      inputSchema: {
        type: "object",
        properties: {
          account: { type: "string", description: "Investment account identifier (BTG investor code)" },
          fund_cnpj: { type: "string", description: "CNPJ of the fund (digits only)" },
          amount: { type: "string", description: "Subscription amount in BRL major units, e.g. '5000.00'" },
          source_account: { type: "string", description: "BTG+ checking account to debit (agência-conta)" },
          idempotency_key: { type: "string", description: "Counterparty-side idempotency key (UUID recommended)" },
        },
        required: ["account", "fund_cnpj", "amount", "source_account", "idempotency_key"],
      },
    },
    {
      name: "redeem_from_fund",
      description: "Redeem (resgatar) from a fund. Total or partial. Settlement follows the fund's cotização/liquidação rule. Returns the request id, redemption type (total/parcial), and projected liquidation date.",
      inputSchema: {
        type: "object",
        properties: {
          account: { type: "string", description: "Investment account identifier (BTG investor code)" },
          fund_cnpj: { type: "string", description: "CNPJ of the fund (digits only)" },
          amount: { type: "string", description: "Redemption amount in BRL major units. Omit for total redemption." },
          redemption_type: { type: "string", description: "TOTAL | PARCIAL — defaults to PARCIAL when amount is given, TOTAL otherwise" },
          destination_account: { type: "string", description: "BTG+ checking account to credit (agência-conta)" },
          idempotency_key: { type: "string", description: "Counterparty-side idempotency key (UUID recommended)" },
        },
        required: ["account", "fund_cnpj", "destination_account", "idempotency_key"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "get_oauth_token": {
        const token = await getAccessToken();
        return { content: [{ type: "text", text: JSON.stringify({ access_token: token, expires_at: tokenCache?.expiresAt }, null, 2) }] };
      }
      case "create_pix_cob": {
        // TODO(verify): path. BACEN Pix v2 standard is POST /pix/v2/cob;
        // BTG may also expose it under /cobrancas/v2/cob.
        return { content: [{ type: "text", text: JSON.stringify(await btgRequest("POST", "/pix/v2/cob", a), null, 2) }] };
      }
      case "get_pix_cob": {
        const txid = encodeURIComponent(String(a.txid ?? ""));
        // TODO(verify): path. BACEN Pix v2 standard is GET /pix/v2/cob/{txid}.
        return { content: [{ type: "text", text: JSON.stringify(await btgRequest("GET", `/pix/v2/cob/${txid}`), null, 2) }] };
      }
      case "create_boleto": {
        // TODO(verify): path. BTG Cobrança v1 is commonly /cobranca/v1/boletos for onboarded counterparties.
        return { content: [{ type: "text", text: JSON.stringify(await btgRequest("POST", "/cobranca/v1/boletos", a), null, 2) }] };
      }
      case "get_boleto": {
        const id = encodeURIComponent(String(a.id ?? ""));
        // TODO(verify): path.
        return { content: [{ type: "text", text: JSON.stringify(await btgRequest("GET", `/cobranca/v1/boletos/${id}`), null, 2) }] };
      }
      case "get_account_balance": {
        const account = encodeURIComponent(String(a.account ?? ""));
        // TODO(verify): path. BTG+ commonly exposes /accounts/v1/{account}/balance.
        return { content: [{ type: "text", text: JSON.stringify(await btgRequest("GET", `/accounts/v1/${account}/balance`), null, 2) }] };
      }
      case "get_account_statement": {
        const account = encodeURIComponent(String(a.account ?? ""));
        const params = new URLSearchParams();
        params.set("dataInicio", String(a.from ?? ""));
        params.set("dataFim", String(a.to ?? ""));
        if (a.page !== undefined) params.set("pagina", String(a.page));
        if (a.page_size !== undefined) params.set("tamanhoPagina", String(a.page_size));
        // TODO(verify): path. Commonly /accounts/v1/{account}/statement.
        return { content: [{ type: "text", text: JSON.stringify(await btgRequest("GET", `/accounts/v1/${account}/statement?${params}`), null, 2) }] };
      }
      case "list_investment_positions": {
        const account = encodeURIComponent(String(a.account ?? ""));
        const params = new URLSearchParams();
        if (a.asset_class !== undefined) params.set("classe", String(a.asset_class));
        if (a.maturity_from !== undefined) params.set("vencimentoInicio", String(a.maturity_from));
        if (a.maturity_to !== undefined) params.set("vencimentoFim", String(a.maturity_to));
        const qs = params.toString();
        // TODO(verify): path. BTG investments likely surface under
        // /investments/v1/accounts/{account}/positions or /portfolio/v1/posicoes.
        return { content: [{ type: "text", text: JSON.stringify(await btgRequest("GET", `/investments/v1/accounts/${account}/positions${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "get_portfolio_summary": {
        const account = encodeURIComponent(String(a.account ?? ""));
        const qs = a.reference_date ? `?dataReferencia=${encodeURIComponent(String(a.reference_date))}` : "";
        // TODO(verify): path. Often /investments/v1/accounts/{account}/portfolio
        // or /portfolio/v1/{account}/resumo.
        return { content: [{ type: "text", text: JSON.stringify(await btgRequest("GET", `/investments/v1/accounts/${account}/portfolio${qs}`), null, 2) }] };
      }
      case "list_funds_available": {
        const params = new URLSearchParams();
        if (a.asset_class !== undefined) params.set("classe", String(a.asset_class));
        if (a.manager !== undefined) params.set("gestora", String(a.manager));
        if (a.min_subscription_max !== undefined) params.set("aplicacaoMinimaMax", String(a.min_subscription_max));
        if (a.page !== undefined) params.set("pagina", String(a.page));
        if (a.page_size !== undefined) params.set("tamanhoPagina", String(a.page_size));
        const qs = params.toString();
        // TODO(verify): path. BTG funds platform likely under /funds/v1/catalog
        // or /investments/v1/funds.
        return { content: [{ type: "text", text: JSON.stringify(await btgRequest("GET", `/funds/v1/catalog${qs ? `?${qs}` : ""}`), null, 2) }] };
      }
      case "subscribe_to_fund": {
        const account = encodeURIComponent(String(a.account ?? ""));
        const body = {
          fundoCnpj: a.fund_cnpj,
          valor: a.amount,
          contaOrigem: a.source_account,
          idempotencyKey: a.idempotency_key,
        };
        // TODO(verify): path. Likely /funds/v1/subscriptions or
        // /investments/v1/accounts/{account}/funds/aplicar.
        return { content: [{ type: "text", text: JSON.stringify(await btgRequest("POST", `/investments/v1/accounts/${account}/funds/subscriptions`, body), null, 2) }] };
      }
      case "redeem_from_fund": {
        const account = encodeURIComponent(String(a.account ?? ""));
        const body: Record<string, unknown> = {
          fundoCnpj: a.fund_cnpj,
          contaDestino: a.destination_account,
          idempotencyKey: a.idempotency_key,
        };
        if (a.amount !== undefined) body.valor = a.amount;
        if (a.redemption_type !== undefined) body.tipoResgate = a.redemption_type;
        else body.tipoResgate = a.amount === undefined ? "TOTAL" : "PARCIAL";
        // TODO(verify): path. Likely /funds/v1/redemptions or
        // /investments/v1/accounts/{account}/funds/resgatar.
        return { content: [{ type: "text", text: JSON.stringify(await btgRequest("POST", `/investments/v1/accounts/${account}/funds/redemptions`, body), null, 2) }] };
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
    app.get("/health", (_req: unknown, res: { json: (body: unknown) => unknown }) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: { headers: Record<string, string | string[] | undefined>; body: unknown }, res: { status: (code: number) => { json: (body: unknown) => unknown } }) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req as never, res as never, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-btg", version: "0.1.0-alpha.1" }, { capabilities: { tools: {} } });
        (server as unknown as { _requestHandlers: Map<unknown, unknown> })._requestHandlers.forEach((v, k) => (s as unknown as { _requestHandlers: Map<unknown, unknown> })._requestHandlers.set(k, v));
        (server as unknown as { _notificationHandlers?: Map<unknown, unknown> })._notificationHandlers?.forEach((v, k) => (s as unknown as { _notificationHandlers: Map<unknown, unknown> })._notificationHandlers.set(k, v));
        await s.connect(t);
        await t.handleRequest(req as never, res as never, req.body); return;
      }
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
    });
    app.get("/mcp", async (req: { headers: Record<string, string | string[] | undefined> }, res: { status: (code: number) => { send: (body: string) => unknown } }) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req as never, res as never); else res.status(400).send("Invalid session"); });
    app.delete("/mcp", async (req: { headers: Record<string, string | string[] | undefined> }, res: { status: (code: number) => { send: (body: string) => unknown } }) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req as never, res as never); else res.status(400).send("Invalid session"); });
    const port = Number(process.env.MCP_PORT) || 3000;
    app.listen(port, () => { console.error(`MCP HTTP server on http://localhost:${port}/mcp`); });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch(console.error);
