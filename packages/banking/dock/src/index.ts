#!/usr/bin/env node
/**
 * DEPRECATED (2026-09-27): no live endpoint. api.dock.tech does not resolve.
 * No tool reaches a service. Override the host with
 * DOCK_BASE_URL if you have a working endpoint.
 *
 * MCP Server for Dock — Brazilian Banking-as-a-Service (BaaS).
 *
 * Dock is Matera's main competitor in BR BaaS. Together they power most
 * Brazilian fintechs. Dock's surface is broader than Matera's: accounts,
 * Pix, and card issuing (debit / credit / prepaid) are all first-class.
 * Card issuing is the key differentiator vs Matera — Dock is historically
 * a card-issuing platform that expanded into full BaaS.
 *
 * Tools (20) — Banking + Pix + Card Issuing + Webhooks:
 *   create_account          — POST   /accounts (digital account for an end user)
 *   get_account             — GET    /accounts/{id}
 *   list_accounts           — GET    /accounts
 *   freeze_account          — POST   /accounts/{id}/freeze
 *   unfreeze_account        — POST   /accounts/{id}/unfreeze
 *   send_pix                — POST   /pix/payments (outbound Pix transfer)
 *   get_pix                 — GET    /pix/payments/{endToEndId}
 *   create_pix_qr_static    — POST   /pix/qrcodes/static
 *   create_pix_qr_dynamic   — POST   /pix/qrcodes/dynamic
 *   refund_pix              — POST   /pix/payments/{endToEndId}/refund
 *   resolve_dict_key        — GET    /pix/dict/{key}
 *   issue_card              — POST   /cards (Dock's core differentiator)
 *   get_card                — GET    /cards/{id}
 *   block_card              — POST   /cards/{id}/block
 *   unblock_card            — POST   /cards/{id}/unblock
 *   change_card_status      — PATCH  /cards/{id}/status
 *   list_transactions       — GET    /accounts/{id}/transactions
 *   get_transaction         — GET    /transactions/{id}
 *   create_webhook          — POST   /webhooks
 *   list_webhooks           — GET    /webhooks
 *
 * -------------------------------------------------------------------------
 * ALPHA STATUS — endpoint paths below are NOT verified against a live sandbox.
 *
 * Dock's developer portal (https://developers.dock.tech) redirects to a
 * ReadMe.com login gate. Public docs are not accessible without a Dock
 * merchant contract. The paths below follow standard BR BaaS conventions
 * (matching Matera's shape and BCB's Pix spec) and are best-guesses.
 *
 * The 10 tool names + input schemas are the stable public contract. Only
 * the internal `dockRequest(method, path, body)` calls will change when
 * the sandbox verifies the exact paths.
 * -------------------------------------------------------------------------
 *
 * Authentication
 *   OAuth 2.0 Client Credentials. POST /oauth/token with Basic auth
 *   (client_id:client_secret) + grant_type=client_credentials. Bearer
 *   token cached in memory until a minute before expiry.
 *
 * Environment
 *   DOCK_CLIENT_ID      OAuth2 client_id
 *   DOCK_CLIENT_SECRET  OAuth2 client_secret
 *   DOCK_ENV            "sandbox" | "production" (default: sandbox)
 *
 * Docs: https://developers.dock.tech (gated — requires merchant login)
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const CLIENT_ID = process.env.DOCK_CLIENT_ID || "";
const CLIENT_SECRET = process.env.DOCK_CLIENT_SECRET || "";
const DOCK_ENV = (process.env.DOCK_ENV || "sandbox").toLowerCase();
const BASE_URL =
  process.env.DOCK_BASE_URL ||
  (DOCK_ENV === "production"
    ? "https://api.dock.tech"
    : "https://sandbox.api.dock.tech");

let tokenCache: { accessToken: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  // TODO(verify): Dock's exact token path is unconfirmed behind the doc gate.
  // `/oauth/token` and `/oauth2/token` are the standard candidates.
  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Dock OAuth ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

async function dockRequest(method: string, path: string, body?: unknown): Promise<unknown> {
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
    throw new Error(`Dock API ${res.status}: ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// Managed-tier pointer surfaced to the agent via MCP `instructions`.
// Informational only — nothing CodeSpar-hosted is called (MIT-safe).
const MANAGED_TIER_HINT =
  "This open-source CodeSpar server calls the provider's API directly. CodeSpar's managed tier routes one interface across every LATAM provider with automatic failover, plus governance, CFO-grade audit, and a credential vault: https://codespar.dev/agents (npx -y @codespar/mcp serve).";

const server = new Server(
  { name: "mcp-dock", version: "0.2.0" },
  { capabilities: { tools: {} }, instructions: MANAGED_TIER_HINT },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_account",
      description: "Create a digital account for an end user (CPF holder) on Dock. Returns the account id, agency, and account number. Account holds funds that can be moved via Pix or spent via issued cards.",
      inputSchema: {
        type: "object",
        properties: {
          holder: {
            type: "object",
            description: "Account holder identity",
            properties: {
              cpf: { type: "string", description: "11-digit CPF" },
              name: { type: "string", description: "Full name" },
              birth_date: { type: "string", description: "ISO-8601 date" },
              email: { type: "string" },
              phone: { type: "string", description: "E.164 phone number" },
              mother_name: { type: "string", description: "Required by BCB onboarding rules" },
            },
            required: ["cpf", "name"],
          },
          account_type: {
            type: "string",
            enum: ["PAYMENT", "CHECKING", "SAVINGS"],
            description: "Type of account to open",
          },
          external_id: { type: "string", description: "Merchant-side account identifier for reconciliation" },
        },
        required: ["holder"],
      },
    },
    {
      name: "get_account",
      description: "Retrieve a Dock account by id. Returns balance, status, holder info, and account coordinates (agency / account number).",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Dock account id returned by create_account" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "send_pix",
      description: "Initiate an outbound Pix transfer from a Dock account to any Pix key in BR. Returns endToEndId once the BCB SPI confirms.",
      inputSchema: {
        type: "object",
        properties: {
          debtor_account_id: { type: "string", description: "Source account id on Dock" },
          creditor_pix_key: { type: "string", description: "Destination Pix key (CPF/CNPJ/email/phone/random UUID)" },
          amount: { type: "number", description: "Amount in BRL (decimal, e.g. 10.50)" },
          description: { type: "string", description: "Message shown to recipient (optional)" },
          idempotency_key: { type: "string", description: "Merchant-side unique id to prevent double-send on retry" },
        },
        required: ["debtor_account_id", "creditor_pix_key", "amount"],
      },
    },
    {
      name: "get_pix",
      description: "Retrieve an outbound Pix payment by endToEndId.",
      inputSchema: {
        type: "object",
        properties: {
          end_to_end_id: { type: "string", description: "32-char BCB endToEndId" },
        },
        required: ["end_to_end_id"],
      },
    },
    {
      name: "create_pix_qr_static",
      description: "Create a static Pix QR (reusable, tied to a merchant Pix key). Returns EMV copy-paste payload and QR image. Use for points-of-sale or donations where the same QR is shown to many payers.",
      inputSchema: {
        type: "object",
        properties: {
          pix_key: { type: "string", description: "Merchant Pix key" },
          amount: { type: "number", description: "Amount in BRL. Omit for open-amount QR." },
          description: { type: "string", description: "Free-text description shown to payer" },
          merchant_name: { type: "string" },
          merchant_city: { type: "string" },
          txid: { type: "string", description: "Optional merchant txid (26-35 alphanumerics)" },
        },
        required: ["pix_key"],
      },
    },
    {
      name: "create_pix_qr_dynamic",
      description: "Create a dynamic Pix QR (single-use, expiring). Returns txid, EMV payload, and QR image. Preferred for e-commerce checkouts and invoices.",
      inputSchema: {
        type: "object",
        properties: {
          pix_key: { type: "string", description: "Merchant Pix key that receives settlement" },
          amount: { type: "number", description: "Amount in BRL" },
          description: { type: "string", description: "Description shown to payer" },
          expiration: { type: "number", description: "QR lifetime in seconds (e.g. 3600 = 1h)" },
          debtor: {
            type: "object",
            properties: {
              cpf: { type: "string" },
              cnpj: { type: "string" },
              name: { type: "string" },
            },
          },
          txid: { type: "string", description: "Optional merchant txid" },
        },
        required: ["pix_key", "amount", "expiration"],
      },
    },
    {
      name: "refund_pix",
      description: "Refund (devolução) a Pix payment. Supports full or partial amount. Use BCB MED reason codes when applicable.",
      inputSchema: {
        type: "object",
        properties: {
          end_to_end_id: { type: "string", description: "endToEndId of the payment to refund" },
          amount: { type: "number", description: "Refund amount in BRL. Must be <= original." },
          reason: { type: "string", description: "Reason (BCB MED code or free text)" },
        },
        required: ["end_to_end_id", "amount", "reason"],
      },
    },
    {
      name: "resolve_dict_key",
      description: "Resolve a Pix DICT key to the account holder's identity and ISPB/branch/account. Use before sending large transfers to verify the counterparty. DICT queries are rate-limited and logged by BCB.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string", description: "Pix key to resolve (CPF/CNPJ/email/phone/random)" },
        },
        required: ["key"],
      },
    },
    {
      name: "issue_card",
      description: "Issue a card (debit / credit / prepaid / virtual) against a Dock account. Card issuing is Dock's historical core product and the main differentiator vs Matera. Returns card id, PAN masked, CVV (if virtual), and shipping status.",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Dock account id the card is bound to" },
          card_type: {
            type: "string",
            enum: ["DEBIT", "CREDIT", "PREPAID", "VIRTUAL"],
            description: "Type of card to issue",
          },
          network: {
            type: "string",
            enum: ["VISA", "MASTERCARD", "ELO"],
            description: "Card network (BIN must be pre-provisioned with Dock for the given network)",
          },
          holder_name: { type: "string", description: "Name to emboss on the card (physical) or shown in-app (virtual)" },
          shipping_address: {
            type: "object",
            description: "Required for physical cards",
            properties: {
              street: { type: "string" },
              number: { type: "string" },
              complement: { type: "string" },
              neighborhood: { type: "string" },
              city: { type: "string" },
              state: { type: "string", description: "2-letter UF" },
              zip_code: { type: "string" },
            },
          },
          external_id: { type: "string", description: "Merchant-side card identifier for reconciliation" },
        },
        required: ["account_id", "card_type", "network", "holder_name"],
      },
    },
    {
      name: "get_card",
      description: "Retrieve a card by id. Returns card status (ACTIVE / BLOCKED / CANCELED), masked PAN, expiry, and limits.",
      inputSchema: {
        type: "object",
        properties: {
          card_id: { type: "string", description: "Dock card id returned by issue_card" },
        },
        required: ["card_id"],
      },
    },
    {
      name: "list_accounts",
      description: "List Dock accounts under the merchant. Supports pagination and filtering by holder document or status.",
      inputSchema: {
        type: "object",
        properties: {
          cpf: { type: "string", description: "Filter by holder CPF (11 digits)" },
          status: { type: "string", enum: ["ACTIVE", "FROZEN", "CLOSED"], description: "Filter by account status" },
          page: { type: "number", description: "Page number (1-based)" },
          page_size: { type: "number", description: "Results per page (default 20, max 100)" },
        },
      },
    },
    {
      name: "freeze_account",
      description: "Freeze (block) a Dock account. Pix outflows and card spend are halted but balance is preserved. Used for fraud holds, KYC re-verification, or judicial blocks.",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Dock account id" },
          reason: { type: "string", description: "Reason code or free-text justification (logged for audit)" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "unfreeze_account",
      description: "Unfreeze a previously frozen Dock account, restoring Pix and card operations.",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Dock account id" },
          reason: { type: "string", description: "Reason for the unblock (optional, logged)" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "block_card",
      description: "Block a card temporarily (reversible). Use for lost-card or fraud-suspected flows. Card status goes to BLOCKED — declines all authorizations until unblocked. Different from change_card_status which permanently cancels.",
      inputSchema: {
        type: "object",
        properties: {
          card_id: { type: "string", description: "Dock card id" },
          reason: { type: "string", description: "Reason: LOST, STOLEN, SUSPECTED_FRAUD, CARDHOLDER_REQUEST" },
        },
        required: ["card_id"],
      },
    },
    {
      name: "unblock_card",
      description: "Unblock a card that was previously blocked (reversible). Restores card to ACTIVE status. Cannot be used on permanently CANCELED cards.",
      inputSchema: {
        type: "object",
        properties: {
          card_id: { type: "string", description: "Dock card id" },
        },
        required: ["card_id"],
      },
    },
    {
      name: "change_card_status",
      description: "Change a card's lifecycle status: ACTIVE / BLOCKED / CANCELED. Use CANCELED for permanent termination (replacement card, account closure). Status transitions are constrained — see Dock issuing docs.",
      inputSchema: {
        type: "object",
        properties: {
          card_id: { type: "string", description: "Dock card id" },
          status: {
            type: "string",
            enum: ["ACTIVE", "BLOCKED", "CANCELED"],
            description: "Target status",
          },
          reason: { type: "string", description: "Reason code or free text" },
        },
        required: ["card_id", "status"],
      },
    },
    {
      name: "list_transactions",
      description: "List transactions on a Dock account (Pix in/out, card auths, fees, transfers). Supports date range and pagination. Returns ordered by timestamp desc.",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Dock account id" },
          start_date: { type: "string", description: "ISO-8601 date or datetime (inclusive)" },
          end_date: { type: "string", description: "ISO-8601 date or datetime (inclusive)" },
          type: { type: "string", description: "Filter by transaction type (PIX_IN, PIX_OUT, CARD_AUTH, FEE, etc.)" },
          page: { type: "number", description: "Page number (1-based)" },
          page_size: { type: "number", description: "Results per page (default 50, max 200)" },
        },
        required: ["account_id"],
      },
    },
    {
      name: "get_transaction",
      description: "Retrieve a single transaction by id. Returns full detail including counterparty, fees, and originating event (Pix endToEndId, card auth code, etc.).",
      inputSchema: {
        type: "object",
        properties: {
          transaction_id: { type: "string", description: "Dock transaction id" },
        },
        required: ["transaction_id"],
      },
    },
    {
      name: "create_webhook",
      description: "Register a webhook endpoint to receive Dock event notifications (account.*, pix.*, card.*, transaction.*). Dock signs payloads with HMAC; verify the signature on receipt.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "HTTPS endpoint that will receive POSTed events" },
          events: {
            type: "array",
            items: { type: "string" },
            description: "Event types to subscribe to (e.g. ['pix.received','card.authorized']). Use ['*'] for all.",
          },
          secret: { type: "string", description: "Optional shared secret used for HMAC signature verification" },
          description: { type: "string", description: "Free-text label" },
        },
        required: ["url", "events"],
      },
    },
    {
      name: "list_webhooks",
      description: "List all webhook endpoints registered for the merchant. Returns id, url, subscribed events, and active status.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;
  try {
    switch (name) {
      case "create_account":
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("POST", "/accounts", a), null, 2) }] };
      case "get_account": {
        const id = encodeURIComponent(String(a.account_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("GET", `/accounts/${id}`), null, 2) }] };
      }
      // TODO(verify): BCB canonical outbound-Pix path is `/pix/payments`.
      // Dock likely wraps it but the exact wrapper is unverified.
      case "send_pix":
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("POST", "/pix/payments", a), null, 2) }] };
      case "get_pix": {
        const e2e = encodeURIComponent(String(a.end_to_end_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("GET", `/pix/payments/${e2e}`), null, 2) }] };
      }
      case "create_pix_qr_static":
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("POST", "/pix/qrcodes/static", a), null, 2) }] };
      case "create_pix_qr_dynamic":
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("POST", "/pix/qrcodes/dynamic", a), null, 2) }] };
      // TODO(verify): BCB spec names refunds `/pix/{e2eid}/devolucao/{id}`.
      // `/pix/payments/{e2eid}/refund` here is a plausible Dock wrapper.
      case "refund_pix": {
        const e2e = encodeURIComponent(String(a.end_to_end_id ?? ""));
        const body: Record<string, unknown> = { amount: a.amount, reason: a.reason };
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("POST", `/pix/payments/${e2e}/refund`, body), null, 2) }] };
      }
      // TODO(verify): DICT lookup wrapper path is unverified behind the Dock
      // doc gate; `/pix/dict/{key}` follows the standard BR BaaS convention.
      case "resolve_dict_key": {
        const key = encodeURIComponent(String(a.key ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("GET", `/pix/dict/${key}`), null, 2) }] };
      }
      case "issue_card":
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("POST", "/cards", a), null, 2) }] };
      case "get_card": {
        const id = encodeURIComponent(String(a.card_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("GET", `/cards/${id}`), null, 2) }] };
      }
      // TODO(verify): list_accounts wrapper path; `/accounts?cpf=&status=&page=` is the standard shape.
      case "list_accounts": {
        const qs = new URLSearchParams();
        if (a.cpf) qs.set("cpf", String(a.cpf));
        if (a.status) qs.set("status", String(a.status));
        if (a.page) qs.set("page", String(a.page));
        if (a.page_size) qs.set("page_size", String(a.page_size));
        const q = qs.toString();
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("GET", `/accounts${q ? `?${q}` : ""}`), null, 2) }] };
      }
      case "freeze_account": {
        const id = encodeURIComponent(String(a.account_id ?? ""));
        const body: Record<string, unknown> = {};
        if (a.reason) body.reason = a.reason;
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("POST", `/accounts/${id}/freeze`, body), null, 2) }] };
      }
      case "unfreeze_account": {
        const id = encodeURIComponent(String(a.account_id ?? ""));
        const body: Record<string, unknown> = {};
        if (a.reason) body.reason = a.reason;
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("POST", `/accounts/${id}/unfreeze`, body), null, 2) }] };
      }
      case "block_card": {
        const id = encodeURIComponent(String(a.card_id ?? ""));
        const body: Record<string, unknown> = {};
        if (a.reason) body.reason = a.reason;
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("POST", `/cards/${id}/block`, body), null, 2) }] };
      }
      case "unblock_card": {
        const id = encodeURIComponent(String(a.card_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("POST", `/cards/${id}/unblock`, {}), null, 2) }] };
      }
      case "change_card_status": {
        const id = encodeURIComponent(String(a.card_id ?? ""));
        const body: Record<string, unknown> = { status: a.status };
        if (a.reason) body.reason = a.reason;
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("PATCH", `/cards/${id}/status`, body), null, 2) }] };
      }
      // TODO(verify): transactions list path; `/accounts/{id}/transactions` is conventional but Dock may use a top-level `/transactions?account_id=`.
      case "list_transactions": {
        const id = encodeURIComponent(String(a.account_id ?? ""));
        const qs = new URLSearchParams();
        if (a.start_date) qs.set("start_date", String(a.start_date));
        if (a.end_date) qs.set("end_date", String(a.end_date));
        if (a.type) qs.set("type", String(a.type));
        if (a.page) qs.set("page", String(a.page));
        if (a.page_size) qs.set("page_size", String(a.page_size));
        const q = qs.toString();
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("GET", `/accounts/${id}/transactions${q ? `?${q}` : ""}`), null, 2) }] };
      }
      case "get_transaction": {
        const id = encodeURIComponent(String(a.transaction_id ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("GET", `/transactions/${id}`), null, 2) }] };
      }
      case "create_webhook":
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("POST", "/webhooks", a), null, 2) }] };
      case "list_webhooks":
        return { content: [{ type: "text", text: JSON.stringify(await dockRequest("GET", "/webhooks"), null, 2) }] };
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
    app.get("/health", (_req, res) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req, res) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) {
        await transports.get(sid)!.handleRequest(req, res, req.body);
        return;
      }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-dock", version: "0.2.0" }, { capabilities: { tools: {} } });
        (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v));
        (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v));
        await s.connect(t);
        await t.handleRequest(req, res, req.body);
        return;
      }
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
    });
    app.get("/mcp", async (req, res) => { const sid = req.headers["mcp-session-id"] as string | undefined; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req, res); else res.status(400).send("Invalid session"); });
    app.delete("/mcp", async (req, res) => { const sid = req.headers["mcp-session-id"] as string | undefined; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req, res); else res.status(400).send("Invalid session"); });
    const port = Number(process.env.MCP_PORT) || 3000;
    app.listen(port, () => { console.error(`MCP HTTP server on http://localhost:${port}/mcp`); });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}
main().catch(console.error);
