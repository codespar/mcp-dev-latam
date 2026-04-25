#!/usr/bin/env node

/**
 * MCP Server for Unico — the Brazilian identity verification leader.
 *
 * Unico offers three separately-contracted products:
 *   - IDCloud  — CPF/CNPJ validation, document OCR, authenticity checks
 *   - IDPay    — face biometrics (match, liveness) for login / payment auth
 *   - IDCheck  — KYC-as-a-service (PEP, watchlists, court records)
 *
 * Tools (18):
 *   validate_cpf                  — IDCloud: CPF status (REGULAR/SUSPENSA/TITULAR FALECIDO) + name
 *   validate_cnpj                 — IDCloud: CNPJ status, partners, situation
 *   extract_document              — IDCloud: OCR + field extraction from RG/CNH/Passport/CPF image
 *   verify_document_authenticity  — IDCloud: tamper detection + authenticity score
 *   face_match                    — IDPay: biometric comparison between selfie and document photo
 *   liveness_check                — IDPay: confirms the subject is physically present (not a photo/screen)
 *   check_pep                     — IDCheck: Politically Exposed Person lookup
 *   check_watchlists              — IDCheck: OFAC, Interpol, sanctions screening
 *   court_records_search          — IDCheck: Brazilian judicial records
 *   get_process_status            — IDCheck: poll a single verification-process status / verdict
 *   batch_get_process_status      — IDCheck: batch status lookup (up to 100 process_ids per call)
 *   upload_process_document       — IDCheck: upload front/back/selfie image to a running process
 *   get_extracted_data            — IDCheck: fetch the OCR + structured fields produced by a process
 *   get_unico_score               — IDCheck: Unico Score (fraud risk score 0-1000) for a CPF
 *   connect_portability_check     — Connect: cross-tenant portability — has this CPF been verified elsewhere?
 *   register_webhook              — Webhooks: subscribe a callback URL for process events
 *   list_webhooks                 — Webhooks: list registered webhook subscriptions
 *   delete_webhook                — Webhooks: remove a subscription
 *
 * Not every merchant has every product. Agents should call only what's enabled
 * on the merchant's Unico contract; disabled products return 403 from the API.
 *
 * Authentication
 *   OAuth 2.0 Client Credentials. The server POSTs to the Unico auth endpoint
 *   with Basic auth (client_id:client_secret) and caches the bearer token in
 *   memory until one minute before expiry.
 *
 * Environment
 *   UNICO_CLIENT_ID      OAuth client_id
 *   UNICO_CLIENT_SECRET  OAuth client_secret
 *   UNICO_ENV            'sandbox' | 'production' (default: sandbox)
 *   UNICO_BASE_URL       Optional API base URL override (default: https://api.unico.co)
 *   UNICO_AUTH_URL       Optional auth base URL override  (default: https://auth.unico.co)
 *
 * Status
 *   Shipped as 0.1.0-alpha.1 — Unico's REST contract is gated behind their
 *   developer portal (devcenter.unico.io). Tool names + shapes are stable,
 *   but exact paths may shift once we validate against live credentials.
 *
 * Docs: https://devcenter.unico.io
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.UNICO_CLIENT_ID || "";
const CLIENT_SECRET = process.env.UNICO_CLIENT_SECRET || "";
const ENV = (process.env.UNICO_ENV || "sandbox").toLowerCase();
const BASE_URL = process.env.UNICO_BASE_URL || "https://api.unico.co";
const AUTH_URL = process.env.UNICO_AUTH_URL || "https://auth.unico.co";

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
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${AUTH_URL}/oauth2/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Unico OAuth ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

async function unicoRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "X-Unico-Env": ENV,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`Unico API ${res.status}: ${await res.text()}`);
  }
  if (res.status === 204) return { ok: true };
  const text = await res.text();
  if (!text) return { ok: true };
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const server = new Server(
  { name: "mcp-unico", version: "0.2.0-alpha.2" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "validate_cpf",
      description: "IDCloud: validate a Brazilian CPF with Receita Federal. Returns { valid, status (REGULAR | SUSPENSA | TITULAR FALECIDO | CANCELADA | NULA | PENDENTE), name, situation }. Optional birthdate enables a cross-check against the CPF registry.",
      inputSchema: {
        type: "object",
        properties: {
          cpf: { type: "string", description: "CPF digits only (11 chars) or formatted XXX.XXX.XXX-XX" },
          birthdate: { type: "string", description: "Optional. ISO-8601 date (YYYY-MM-DD) to cross-check against RF records" },
        },
        required: ["cpf"],
      },
    },
    {
      name: "validate_cnpj",
      description: "IDCloud: validate a Brazilian CNPJ with Receita Federal. Returns company status (ATIVA, BAIXADA, SUSPENSA, INAPTA), legal name, trade name, partners (QSA), address, and primary CNAE.",
      inputSchema: {
        type: "object",
        properties: {
          cnpj: { type: "string", description: "CNPJ digits only (14 chars) or formatted XX.XXX.XXX/XXXX-XX" },
        },
        required: ["cnpj"],
      },
    },
    {
      name: "extract_document",
      description: "IDCloud: OCR + structured field extraction from a Brazilian ID document image. Returns typed fields (name, document number, issuer, birthdate, parents, etc.) plus extraction confidence.",
      inputSchema: {
        type: "object",
        properties: {
          image_base64: { type: "string", description: "Base64-encoded document image (front; back via image_back_base64). JPEG or PNG." },
          image_back_base64: { type: "string", description: "Optional base64-encoded image of the document back (required for CNH and some RG variants)." },
          document_type: {
            type: "string",
            enum: ["RG", "CNH", "PASSPORT", "CPF", "RNE", "CTPS"],
            description: "Document type. RG = Registro Geral, CNH = driver's license, RNE = resident foreign national, CTPS = work card.",
          },
        },
        required: ["image_base64", "document_type"],
      },
    },
    {
      name: "verify_document_authenticity",
      description: "IDCloud: tamper / forgery detection on a document image. Returns an authenticity score (0-1), a categorical verdict (AUTHENTIC | SUSPICIOUS | FRAUDULENT), and a list of detected anomalies (e.g. font mismatch, copy-paste edits, printed-on-screen capture).",
      inputSchema: {
        type: "object",
        properties: {
          image_base64: { type: "string", description: "Base64-encoded document image" },
          type: {
            type: "string",
            enum: ["RG", "CNH", "PASSPORT", "CPF", "RNE", "CTPS"],
            description: "Document type being verified",
          },
        },
        required: ["image_base64", "type"],
      },
    },
    {
      name: "face_match",
      description: "IDPay: biometric 1:1 comparison between a live selfie and a document photo. Returns a similarity score (0-1) and a boolean match verdict at Unico's production-tuned threshold.",
      inputSchema: {
        type: "object",
        properties: {
          selfie_image_base64: { type: "string", description: "Base64-encoded live selfie image" },
          document_image_base64: { type: "string", description: "Base64-encoded document photo (or a cropped face region from a document)" },
        },
        required: ["selfie_image_base64", "document_image_base64"],
      },
    },
    {
      name: "liveness_check",
      description: "IDPay: passive liveness detection. Confirms the captured subject is a physically present person, not a printed photo, screen replay, mask, or deepfake. Returns { is_live, score, signals[] }.",
      inputSchema: {
        type: "object",
        properties: {
          image_base64: { type: "string", description: "Base64-encoded still image (passive liveness)" },
          video_base64: { type: "string", description: "Optional base64-encoded short video for active/challenge-based liveness" },
        },
      },
    },
    {
      name: "check_pep",
      description: "IDCheck: Politically Exposed Person screening. Pass cpf (preferred) or name; returns matches with role, jurisdiction, and source. A subject is PEP if they currently hold — or held in the last 5 years — a prominent public function per Bacen Circular 3,978/2020.",
      inputSchema: {
        type: "object",
        properties: {
          cpf: { type: "string", description: "CPF digits only. Preferred for precise matching." },
          name: { type: "string", description: "Full name. Use when CPF is unavailable; fuzzy-matched." },
        },
      },
    },
    {
      name: "check_watchlists",
      description: "IDCheck: global sanctions / adverse-media screening. Covers OFAC (US Treasury), UN, EU, HMT (UK), Interpol Red Notices, and curated adverse-media sources. Pass cpf or name; returns hits with list name, entry date, and risk level.",
      inputSchema: {
        type: "object",
        properties: {
          cpf: { type: "string", description: "CPF digits only" },
          name: { type: "string", description: "Full name" },
          country: { type: "string", description: "Optional ISO-3166 alpha-2 country code to scope results" },
        },
      },
    },
    {
      name: "court_records_search",
      description: "IDCheck: Brazilian judicial-records search. Covers federal and state courts (TRFs, TJs), labor courts (TRTs), and superior courts (STJ, STF). Returns case list with court, class, status, and filing date. Compliance-grade, not for scraping.",
      inputSchema: {
        type: "object",
        properties: {
          cpf: { type: "string", description: "CPF digits only (for individuals)" },
          cnpj: { type: "string", description: "CNPJ digits only (for legal entities)" },
          name: { type: "string", description: "Full name or razão social" },
          scope: {
            type: "string",
            enum: ["federal", "state", "labor", "superior", "all"],
            description: "Court-system scope (default: all)",
          },
        },
      },
    },
    {
      name: "get_process_status",
      description: "IDCheck: poll the status of a verification process previously created via the Unico Web/Mobile SDK or API. Returns { status (CREATED | IN_PROGRESS | FINISHED | EXPIRED | CANCELED), verdict, finished_at, score, reasons[] }. Use this to drive your KYC state machine after the user finishes the SDK capture flow.",
      inputSchema: {
        type: "object",
        properties: {
          process_id: { type: "string", description: "The process identifier returned by Unico when the verification was created (also called id_processo)." },
        },
        required: ["process_id"],
      },
    },
    {
      name: "batch_get_process_status",
      description: "IDCheck: batch status lookup. Send up to 100 process_ids per call and receive the same status payload as get_process_status for each. Use this for nightly reconciliation jobs or backfill, not for hot-path polling.",
      inputSchema: {
        type: "object",
        properties: {
          process_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of Unico process_ids (max 100). Order is preserved in the response.",
            maxItems: 100,
          },
        },
        required: ["process_ids"],
      },
    },
    {
      name: "upload_process_document",
      description: "IDCheck: upload a captured image to a running verification process. Use the appropriate document_side (FRONT, BACK, SELFIE) to match the process template. The image is consumed by Unico's OCR + biometric pipeline; results show up via get_process_status / get_extracted_data once processing finishes.",
      inputSchema: {
        type: "object",
        properties: {
          process_id: { type: "string", description: "Target verification process_id" },
          document_side: {
            type: "string",
            enum: ["FRONT", "BACK", "SELFIE"],
            description: "Which slot this image fills: document front, document back, or selfie capture.",
          },
          image_base64: { type: "string", description: "Base64-encoded JPEG/PNG image (max 8 MB)." },
        },
        required: ["process_id", "document_side", "image_base64"],
      },
    },
    {
      name: "get_extracted_data",
      description: "IDCheck: fetch the structured OCR result for a finished process — typed fields (name, document number, issuer, birthdate, etc.) plus per-field confidence and the raw text blocks. Returns 409 if the process has not yet reached FINISHED.",
      inputSchema: {
        type: "object",
        properties: {
          process_id: { type: "string", description: "Verification process_id whose OCR output you want." },
        },
        required: ["process_id"],
      },
    },
    {
      name: "get_unico_score",
      description: "IDCheck: Unico Score — Brazil's identity-fraud risk score (0-1000, higher = lower risk) computed from Unico's cross-tenant graph of biometric and document events. Returns { score, band (VERY_LOW | LOW | MEDIUM | HIGH | VERY_HIGH), reasons[], computed_at }. Score availability requires a Score-tier contract.",
      inputSchema: {
        type: "object",
        properties: {
          cpf: { type: "string", description: "CPF digits only or formatted XXX.XXX.XXX-XX" },
        },
        required: ["cpf"],
      },
    },
    {
      name: "connect_portability_check",
      description: "Connect: cross-tenant portability check. Asks Unico's network whether the given CPF has already completed a high-assurance verification at another participating tenant within the lookback window. Lets you skip a full KYC re-capture when a prior verification is recent enough. Returns { has_prior_verification, last_verified_at, assurance_level, source_anonymized_id }.",
      inputSchema: {
        type: "object",
        properties: {
          cpf: { type: "string", description: "CPF digits only" },
          max_age_days: { type: "number", description: "Optional. Reject prior verifications older than this many days (default 90)." },
        },
        required: ["cpf"],
      },
    },
    {
      name: "register_webhook",
      description: "Webhooks: subscribe a callback URL to receive Unico process events (process.created, process.finished, process.expired, score.updated). Returns the webhook_id to use with delete_webhook. The endpoint must be HTTPS and respond 2xx within 10 s.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "HTTPS callback URL (must be publicly reachable)." },
          events: {
            type: "array",
            items: { type: "string", enum: ["process.created", "process.finished", "process.expired", "score.updated"] },
            description: "Event types to subscribe to. Defaults to all if omitted.",
          },
          secret: { type: "string", description: "Optional shared secret. Unico will sign each delivery with HMAC-SHA256 in the X-Unico-Signature header." },
        },
        required: ["url"],
      },
    },
    {
      name: "list_webhooks",
      description: "Webhooks: list all webhook subscriptions registered for this tenant. Returns each webhook's id, url, subscribed events, created_at, and last_delivery_status.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "delete_webhook",
      description: "Webhooks: remove a webhook subscription. Idempotent — deleting an unknown id returns 204.",
      inputSchema: {
        type: "object",
        properties: {
          webhook_id: { type: "string", description: "The webhook_id returned by register_webhook / list_webhooks." },
        },
        required: ["webhook_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "validate_cpf":
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("POST", "/idcloud/v1/cpf", args), null, 2) }] };
      case "validate_cnpj":
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("POST", "/idcloud/v1/cnpj", args), null, 2) }] };
      case "extract_document":
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("POST", "/idcloud/v1/documents/extract", args), null, 2) }] };
      case "verify_document_authenticity":
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("POST", "/idcloud/v1/documents/verify", args), null, 2) }] };
      case "face_match":
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("POST", "/idpay/v1/face-match", args), null, 2) }] };
      case "liveness_check":
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("POST", "/idpay/v1/liveness", args), null, 2) }] };
      case "check_pep":
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("POST", "/idcheck/v1/pep", args), null, 2) }] };
      case "check_watchlists":
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("POST", "/idcheck/v1/watchlists", args), null, 2) }] };
      case "court_records_search":
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("POST", "/idcheck/v1/judicial", args), null, 2) }] };
      case "get_process_status": {
        const pid = encodeURIComponent(String((args as { process_id: string }).process_id));
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("GET", `/idcheck/v1/processes/${pid}`), null, 2) }] };
      }
      case "batch_get_process_status":
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("POST", "/idcheck/v1/processes/batch-status", args), null, 2) }] };
      case "upload_process_document": {
        const pid = encodeURIComponent(String((args as { process_id: string }).process_id));
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("POST", `/idcheck/v1/processes/${pid}/documents`, args), null, 2) }] };
      }
      case "get_extracted_data": {
        const pid = encodeURIComponent(String((args as { process_id: string }).process_id));
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("GET", `/idcheck/v1/processes/${pid}/extracted-data`), null, 2) }] };
      }
      case "get_unico_score":
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("POST", "/idcheck/v1/score", args), null, 2) }] };
      case "connect_portability_check":
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("POST", "/connect/v1/portability/check", args), null, 2) }] };
      case "register_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("POST", "/v1/webhooks", args), null, 2) }] };
      case "list_webhooks":
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("GET", "/v1/webhooks"), null, 2) }] };
      case "delete_webhook": {
        const wid = encodeURIComponent(String((args as { webhook_id: string }).webhook_id));
        return { content: [{ type: "text", text: JSON.stringify(await unicoRequest("DELETE", `/v1/webhooks/${wid}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-unico", version: "0.2.0-alpha.2" }, { capabilities: { tools: {} } });
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
