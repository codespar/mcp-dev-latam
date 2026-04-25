#!/usr/bin/env node

/**
 * MCP Server for Persona — modern developer-first identity verification & KYC.
 *
 * Persona is the programmable identity layer favoured by modern startups and
 * fintechs that want great DX and template-driven workflows. Core flow:
 *
 *   create_inquiry (off a configured inquiry template) → user completes the
 *   Persona-hosted flow (doc + selfie + whatever the template specifies) →
 *   poll retrieve_inquiry → optionally approve_inquiry / decline_inquiry →
 *   pull per-verification detail via list_reports / retrieve_report. Accounts
 *   persist end-user records across inquiries; Cases track ongoing
 *   investigations (e.g. periodic re-verification).
 *
 * Tools (20):
 *   create_inquiry      — start a verification session off an inquiry template
 *   retrieve_inquiry    — poll status + embedded verifications
 *   list_inquiries      — filter by reference-id / status
 *   approve_inquiry     — mark inquiry approved (your decision, stored on Persona)
 *   decline_inquiry     — mark inquiry declined
 *   resume_inquiry      — generate a one-time link to resume a paused inquiry
 *   redact_inquiry      — GDPR redaction (DELETE)
 *   create_account      — create a persistent end-user account
 *   retrieve_account    — fetch an account by id
 *   update_account      — patch account attributes
 *   list_accounts       — list / search accounts
 *   list_reports        — list individual verification reports
 *   retrieve_report     — fetch a single report's full detail
 *   run_report          — create & run a standalone report (watchlist/KYB/etc)
 *   create_case         — open an investigation case
 *   retrieve_case       — fetch a case by id
 *   list_cases          — list cases, filterable by status / assignee
 *   add_case_tag        — tag a case
 *   list_templates      — list inquiry templates
 *   list_webhooks       — list configured webhook subscriptions
 *
 * Authentication
 *   Authorization: Bearer <PERSONA_API_KEY>
 *   Persona-Version: 2023-01-05        (override via PERSONA_API_VERSION)
 *
 * Environment
 *   PERSONA_API_KEY       — API key (required, secret)
 *   PERSONA_API_VERSION   — API version pin (optional; default 2023-01-05)
 *
 * JSON:API envelope
 *   All POST bodies wrap the caller's fields as `{ data: { attributes: {...} } }`.
 *   The helper handles this — tool inputs mirror the `attributes` shape.
 *
 * Docs: https://docs.withpersona.com/reference
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.PERSONA_API_KEY || "";
const API_VERSION = process.env.PERSONA_API_VERSION || "2023-01-05";
const BASE_URL = "https://api.withpersona.com/api/v1";

type RequestOpts = { query?: Record<string, string | undefined> };

async function personaRequest(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOpts = {},
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${API_KEY}`,
    "Accept": "application/json",
    "Persona-Version": API_VERSION,
  };

  let url = `${BASE_URL}${path}`;
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  let payload: string | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    // JSON:API envelope: wrap caller's fields as { data: { attributes: {...} } }
    payload = JSON.stringify({ data: { attributes: body } });
  }

  const res = await fetch(url, { method, headers, body: payload });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Persona API ${res.status}: ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const server = new Server(
  { name: "mcp-persona", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_inquiry",
      description: "Create a Persona inquiry — a verification session bound to an inquiry template you configured in the Persona dashboard. The template defines which verifications run (document, selfie, database, phone, etc). Returns an inquiry id and (for hosted flows) a one-time link for the end user.",
      inputSchema: {
        type: "object",
        properties: {
          "inquiry-template-id": { type: "string", description: "Inquiry template id (itmpl_...) from your Persona dashboard. Defines what runs in the flow." },
          "inquiry-template-version-id": { type: "string", description: "Optional pin to a specific template version (itmplv_...)." },
          "reference-id": { type: "string", description: "Your internal user id. Echoed back on webhooks and filterable via list_inquiries." },
          "account-id": { type: "string", description: "Optional existing Persona account id (act_...) to attach the inquiry to." },
          "redirect-uri": { type: "string", description: "URL to redirect the user to after completing the flow." },
          "note": { type: "string", description: "Internal note shown in the Persona dashboard." },
          "fields": {
            type: "object",
            description: "Prefilled fields for the inquiry (e.g. { name-first, name-last, birthdate, address-street-1, address-city, address-subdivision, address-postal-code, address-country-code, email-address, phone-number }). Keys follow Persona's kebab-case convention.",
            additionalProperties: true,
          },
        },
        required: ["inquiry-template-id"],
      },
    },
    {
      name: "retrieve_inquiry",
      description: "Retrieve an inquiry by id. Response includes overall status ('created' | 'pending' | 'completed' | 'expired' | 'failed' | 'needs_review' | 'approved' | 'declined') and embedded verifications / reports. Poll this to track progress.",
      inputSchema: {
        type: "object",
        properties: {
          inquiry_id: { type: "string", description: "Persona inquiry id (inq_...)." },
        },
        required: ["inquiry_id"],
      },
    },
    {
      name: "list_inquiries",
      description: "List inquiries, filterable by reference-id (your internal user id) or status. Useful for reconciling state or finding a user's inquiry history.",
      inputSchema: {
        type: "object",
        properties: {
          "filter[reference-id]": { type: "string", description: "Filter by your internal user id passed at inquiry creation." },
          "filter[status]": { type: "string", description: "Filter by inquiry status (e.g. 'completed', 'approved', 'declined', 'needs_review')." },
          "filter[account-id]": { type: "string", description: "Filter by Persona account id." },
          "page[size]": { type: "string", description: "Page size (max per Persona docs)." },
          "page[after]": { type: "string", description: "Cursor for pagination." },
          "page[before]": { type: "string", description: "Cursor for pagination." },
        },
      },
    },
    {
      name: "approve_inquiry",
      description: "Mark an inquiry as approved. This records your final decision on the Persona inquiry — useful for dashboard reporting and Persona's feedback loop. Does NOT itself gate the user; you must still enforce the decision in your app.",
      inputSchema: {
        type: "object",
        properties: {
          inquiry_id: { type: "string", description: "Persona inquiry id (inq_...)." },
          comment: { type: "string", description: "Optional free-text note for the approval." },
        },
        required: ["inquiry_id"],
      },
    },
    {
      name: "decline_inquiry",
      description: "Mark an inquiry as declined. Records your final reject decision on the Persona inquiry for reporting and feedback.",
      inputSchema: {
        type: "object",
        properties: {
          inquiry_id: { type: "string", description: "Persona inquiry id (inq_...)." },
          comment: { type: "string", description: "Optional free-text reason for the decline." },
        },
        required: ["inquiry_id"],
      },
    },
    {
      name: "redact_inquiry",
      description: "Redact an inquiry (GDPR right-to-erasure). Scrubs PII, captured images, and verification detail for this inquiry on Persona's side. Irreversible.",
      inputSchema: {
        type: "object",
        properties: {
          inquiry_id: { type: "string", description: "Persona inquiry id (inq_...) to redact." },
        },
        required: ["inquiry_id"],
      },
    },
    {
      name: "create_account",
      description: "Create a persistent Persona account — a long-lived end-user record that multiple inquiries can attach to. Enables re-use of previously verified fields and longitudinal fraud signals across sessions.",
      inputSchema: {
        type: "object",
        properties: {
          "reference-id": { type: "string", description: "Your internal user id." },
          "name-first": { type: "string" },
          "name-middle": { type: "string" },
          "name-last": { type: "string" },
          "email-address": { type: "string" },
          "phone-number": { type: "string" },
          "birthdate": { type: "string", description: "YYYY-MM-DD" },
          "address-street-1": { type: "string" },
          "address-street-2": { type: "string" },
          "address-city": { type: "string" },
          "address-subdivision": { type: "string", description: "State / province code." },
          "address-postal-code": { type: "string" },
          "address-country-code": { type: "string", description: "ISO-3166 alpha-2, e.g. US, BR, MX." },
          "social-security-number": { type: "string", description: "Sensitive. Persona stores tokenised." },
          "tags": { type: "array", items: { type: "string" } },
        },
      },
    },
    {
      name: "retrieve_account",
      description: "Retrieve a Persona account by id, including summary PII and linked inquiries / verifications.",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Persona account id (act_...)." },
        },
        required: ["account_id"],
      },
    },
    {
      name: "list_reports",
      description: "List reports — individual verification artifacts (e.g. watchlist, adverse media, business lookup). Filterable by account and type. Each report is a standalone verification separate from inquiry-flow verifications.",
      inputSchema: {
        type: "object",
        properties: {
          "filter[account-id]": { type: "string", description: "Filter by Persona account id." },
          "filter[report-type]": { type: "string", description: "Filter by report type (e.g. 'report/watchlist', 'report/adverse-media', 'report/business')." },
          "page[size]": { type: "string" },
          "page[after]": { type: "string" },
        },
      },
    },
    {
      name: "retrieve_report",
      description: "Retrieve a single report by id — returns the full verification detail (matches, scores, raw source data).",
      inputSchema: {
        type: "object",
        properties: {
          report_id: { type: "string", description: "Persona report id (rep_...)." },
        },
        required: ["report_id"],
      },
    },
    {
      name: "create_case",
      description: "Open a case — a workspace for an ongoing investigation tied to one or more inquiries / accounts. Useful for manual review, periodic re-verification, or flagged users that need operator follow-up.",
      inputSchema: {
        type: "object",
        properties: {
          "case-template-id": { type: "string", description: "Case template id (ctmpl_...) from your Persona dashboard." },
          "name": { type: "string", description: "Short human-readable case name." },
          "status": { type: "string", description: "Initial status (e.g. 'Open')." },
          "priority": { type: "string", description: "Priority label (e.g. 'low', 'medium', 'high')." },
          "assignee-id": { type: "string", description: "Persona user id of the assignee." },
          "fields": { type: "object", description: "Additional case fields (keys follow the template schema).", additionalProperties: true },
        },
        required: ["case-template-id"],
      },
    },
    {
      name: "resume_inquiry",
      description: "Resume a paused inquiry — returns a fresh one-time session token / link so the end user can continue a flow that was abandoned or needs additional steps (e.g. after a 'pending' webhook).",
      inputSchema: {
        type: "object",
        properties: {
          inquiry_id: { type: "string", description: "Persona inquiry id (inq_...) to resume." },
        },
        required: ["inquiry_id"],
      },
    },
    {
      name: "update_account",
      description: "Patch attributes on an existing Persona account (e.g. update address, phone, tags). Use this to keep a persistent end-user record in sync with your system of record.",
      inputSchema: {
        type: "object",
        properties: {
          account_id: { type: "string", description: "Persona account id (act_...)." },
          "name-first": { type: "string" },
          "name-middle": { type: "string" },
          "name-last": { type: "string" },
          "email-address": { type: "string" },
          "phone-number": { type: "string" },
          "birthdate": { type: "string", description: "YYYY-MM-DD" },
          "address-street-1": { type: "string" },
          "address-street-2": { type: "string" },
          "address-city": { type: "string" },
          "address-subdivision": { type: "string" },
          "address-postal-code": { type: "string" },
          "address-country-code": { type: "string" },
          "tags": { type: "array", items: { type: "string" } },
        },
        required: ["account_id"],
      },
    },
    {
      name: "list_accounts",
      description: "List Persona accounts, filterable by reference-id (your internal user id) or email. Useful for looking up a persistent end-user record before creating duplicates.",
      inputSchema: {
        type: "object",
        properties: {
          "filter[reference-id]": { type: "string", description: "Filter by your internal user id." },
          "filter[email-address]": { type: "string", description: "Filter by email." },
          "filter[phone-number]": { type: "string", description: "Filter by phone number (E.164)." },
          "page[size]": { type: "string" },
          "page[after]": { type: "string" },
          "page[before]": { type: "string" },
        },
      },
    },
    {
      name: "run_report",
      description: "Create and run a standalone Persona report — not tied to an inquiry flow. Use for ad-hoc watchlist screening, adverse media, business (KYB) lookups, address verification, or profile checks against a known identity. Pass the appropriate `report-type` plus the query fields the report needs.",
      inputSchema: {
        type: "object",
        properties: {
          "report-type": { type: "string", description: "Report type identifier, e.g. 'report/watchlist', 'report/adverse-media', 'report/business', 'report/address', 'report/profile'." },
          "account-id": { type: "string", description: "Optional Persona account id (act_...) to attach the report to." },
          "name-first": { type: "string" },
          "name-middle": { type: "string" },
          "name-last": { type: "string" },
          "birthdate": { type: "string", description: "YYYY-MM-DD (for profile / watchlist)." },
          "business-name": { type: "string", description: "Legal business name (for KYB / report/business)." },
          "country-code": { type: "string", description: "ISO-3166 alpha-2 country code." },
          "address-street-1": { type: "string" },
          "address-street-2": { type: "string" },
          "address-city": { type: "string" },
          "address-subdivision": { type: "string" },
          "address-postal-code": { type: "string" },
          "phone-number": { type: "string" },
          "email-address": { type: "string" },
          "tax-identification-number": { type: "string", description: "SSN / EIN / tax id, depending on jurisdiction." },
        },
        required: ["report-type"],
      },
    },
    {
      name: "retrieve_case",
      description: "Retrieve a case by id — full detail including status, assignee, linked objects, attached fields, and tags.",
      inputSchema: {
        type: "object",
        properties: {
          case_id: { type: "string", description: "Persona case id (case_...)." },
        },
        required: ["case_id"],
      },
    },
    {
      name: "list_cases",
      description: "List investigation cases, filterable by status, assignee, or priority. Useful for operator dashboards or batch automation over the review queue.",
      inputSchema: {
        type: "object",
        properties: {
          "filter[status]": { type: "string", description: "Filter by case status (e.g. 'Open', 'Waiting on Customer', 'Closed')." },
          "filter[assignee-id]": { type: "string", description: "Filter by assignee Persona user id." },
          "filter[priority]": { type: "string", description: "Filter by priority label." },
          "page[size]": { type: "string" },
          "page[after]": { type: "string" },
          "page[before]": { type: "string" },
        },
      },
    },
    {
      name: "add_case_tag",
      description: "Add a tag to a case. Tags are operator-facing labels useful for grouping / filtering investigations (e.g. 'high-risk', 'manual-review', 'compliance-2026-q2').",
      inputSchema: {
        type: "object",
        properties: {
          case_id: { type: "string", description: "Persona case id (case_...)." },
          "tag-name": { type: "string", description: "Tag name to add. Created on-the-fly if it doesn't exist." },
        },
        required: ["case_id", "tag-name"],
      },
    },
    {
      name: "list_templates",
      description: "List inquiry templates configured in your Persona dashboard — returns each template's id (itmpl_...), name, and active version. Use this to discover available templates before calling create_inquiry.",
      inputSchema: {
        type: "object",
        properties: {
          "page[size]": { type: "string" },
          "page[after]": { type: "string" },
          "page[before]": { type: "string" },
        },
      },
    },
    {
      name: "list_webhooks",
      description: "List configured webhook subscriptions (Persona calls them 'Webhook subscriptions'). Each entry shows the URL, subscribed event types, and enabled state. Use this to audit delivery endpoints for inquiry / verification / case events.",
      inputSchema: {
        type: "object",
        properties: {
          "page[size]": { type: "string" },
          "page[after]": { type: "string" },
          "page[before]": { type: "string" },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "create_inquiry":
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("POST", "/inquiries", a), null, 2) }] };
      case "retrieve_inquiry":
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("GET", `/inquiries/${a.inquiry_id}`), null, 2) }] };
      case "list_inquiries": {
        const query: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(a)) {
          if (v !== undefined && v !== null) query[k] = String(v);
        }
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("GET", "/inquiries", undefined, { query }), null, 2) }] };
      }
      case "approve_inquiry": {
        const { inquiry_id, ...rest } = a;
        const body = Object.keys(rest).length ? rest : undefined;
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("POST", `/inquiries/${inquiry_id}/approve`, body), null, 2) }] };
      }
      case "decline_inquiry": {
        const { inquiry_id, ...rest } = a;
        const body = Object.keys(rest).length ? rest : undefined;
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("POST", `/inquiries/${inquiry_id}/decline`, body), null, 2) }] };
      }
      case "redact_inquiry":
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("DELETE", `/inquiries/${a.inquiry_id}`), null, 2) }] };
      case "create_account":
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("POST", "/accounts", a), null, 2) }] };
      case "retrieve_account":
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("GET", `/accounts/${a.account_id}`), null, 2) }] };
      case "list_reports": {
        const query: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(a)) {
          if (v !== undefined && v !== null) query[k] = String(v);
        }
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("GET", "/reports", undefined, { query }), null, 2) }] };
      }
      case "retrieve_report":
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("GET", `/reports/${a.report_id}`), null, 2) }] };
      case "create_case":
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("POST", "/cases", a), null, 2) }] };
      case "resume_inquiry":
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("POST", `/inquiries/${a.inquiry_id}/resume`), null, 2) }] };
      case "update_account": {
        const { account_id, ...rest } = a;
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("PATCH", `/accounts/${account_id}`, rest), null, 2) }] };
      }
      case "list_accounts": {
        const query: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(a)) {
          if (v !== undefined && v !== null) query[k] = String(v);
        }
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("GET", "/accounts", undefined, { query }), null, 2) }] };
      }
      case "run_report":
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("POST", "/reports", a), null, 2) }] };
      case "retrieve_case":
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("GET", `/cases/${a.case_id}`), null, 2) }] };
      case "list_cases": {
        const query: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(a)) {
          if (v !== undefined && v !== null) query[k] = String(v);
        }
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("GET", "/cases", undefined, { query }), null, 2) }] };
      }
      case "add_case_tag": {
        const { case_id, ...rest } = a;
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("POST", `/cases/${case_id}/add-tag`, rest), null, 2) }] };
      }
      case "list_templates": {
        const query: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(a)) {
          if (v !== undefined && v !== null) query[k] = String(v);
        }
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("GET", "/inquiry-templates", undefined, { query }), null, 2) }] };
      }
      case "list_webhooks": {
        const query: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(a)) {
          if (v !== undefined && v !== null) query[k] = String(v);
        }
        return { content: [{ type: "text", text: JSON.stringify(await personaRequest("GET", "/webhooks", undefined, { query }), null, 2) }] };
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
        const s = new Server({ name: "mcp-persona", version: "0.2.1" }, { capabilities: { tools: {} } });
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
