#!/usr/bin/env node

/**
 * MCP Server for SendGrid — global transactional + marketing email.
 *
 * SendGrid is Twilio-owned (acquired 2019). Together with @codespar/mcp-twilio
 * this package closes the messaging loop for agents:
 *   - Twilio   → SMS, WhatsApp, Voice, Verify
 *   - SendGrid → email (transactional + marketing)
 *
 * One server covering SendGrid's most-used surfaces:
 *   - Mail Send (v3 /mail/send, including dynamic templates)
 *   - Marketing Campaigns contacts (add / list / delete / search)
 *   - Transactional templates (list / create)
 *   - Suppressions per unsubscribe group (list / add)
 *   - Global stats (sent / delivered / opens / clicks)
 *
 * Tools (20):
 *   send_mail                    — POST /mail/send (personalizations, content, attachments)
 *   send_template                — POST /mail/send using a dynamic template_id
 *   add_contact                  — PUT  /marketing/contacts (upsert, async job)
 *   list_contacts                — GET  /marketing/contacts
 *   get_contact                  — GET  /marketing/contacts/{id}
 *   delete_contact               — DELETE /marketing/contacts?ids=...
 *   search_contacts              — POST /marketing/contacts/search (SGQL)
 *   list_lists                   — GET  /marketing/lists
 *   create_list                  — POST /marketing/lists
 *   delete_list                  — DELETE /marketing/lists/{id}
 *   list_templates               — GET  /templates?generations=dynamic
 *   create_template              — POST /templates
 *   list_unsubscribe_groups      — GET  /asm/groups
 *   list_suppressions            — GET  /asm/groups/{group_id}/suppressions
 *   add_suppression              — POST /asm/groups/{group_id}/suppressions
 *   get_bounces                  — GET  /suppression/bounces
 *   delete_bounce                — DELETE /suppression/bounces/{email}
 *   cancel_scheduled_send        — POST /user/scheduled_sends (cancel/pause by batch_id)
 *   get_event_webhook_settings   — GET  /user/webhooks/event/settings
 *   get_stats                    — GET  /stats?start_date=X&end_date=Y
 *
 * Authentication
 *   Authorization: Bearer <SENDGRID_API_KEY>
 *
 * API surface
 *   Base URL: https://api.sendgrid.com/v3
 *   Request/response: application/json
 *
 * Environment
 *   SENDGRID_API_KEY     required — API key (secret)
 *   SENDGRID_FROM_EMAIL  optional — default `from.email` for send_mail / send_template
 *
 * Docs: https://www.twilio.com/docs/sendgrid/api-reference
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_KEY = process.env.SENDGRID_API_KEY || "";
const DEFAULT_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "";
const BASE_URL = "https://api.sendgrid.com/v3";

async function sendgridRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${API_KEY}`,
    "Accept": "application/json",
  };

  let encodedBody: string | undefined;
  if (body !== undefined && body !== null) {
    encodedBody = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, { method, headers, body: encodedBody });
  if (!res.ok) {
    throw new Error(`SendGrid API ${res.status}: ${await res.text()}`);
  }
  const text = await res.text();
  if (!text) return { status: res.status };
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, status: res.status };
  }
}

function buildQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

const server = new Server(
  { name: "mcp-sendgrid", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_mail",
      description: "Send an email via POST /mail/send. Supply at least one `personalization` with `to` recipients, a `from` address (falls back to SENDGRID_FROM_EMAIL), and either `content` blocks or a `template_id` with `dynamic_template_data`. Returns 202 on success.",
      inputSchema: {
        type: "object",
        properties: {
          personalizations: {
            type: "array",
            description: "Array of personalization objects. Each has `to` (array of {email,name}), optional `cc`, `bcc`, `subject`, `dynamic_template_data`, `substitutions`.",
            items: { type: "object" },
          },
          from: {
            type: "object",
            description: "Sender. { email, name? }. If omitted, SENDGRID_FROM_EMAIL is used.",
          },
          reply_to: { type: "object", description: "Optional reply-to. { email, name? }" },
          subject: { type: "string", description: "Global subject (overridden by personalization.subject)" },
          content: {
            type: "array",
            description: "Content blocks: [{ type: 'text/plain' | 'text/html', value }]. Omit if using template_id.",
            items: { type: "object" },
          },
          attachments: {
            type: "array",
            description: "Attachments: [{ content (base64), type, filename, disposition?, content_id? }]",
            items: { type: "object" },
          },
          template_id: { type: "string", description: "Dynamic template id (starts with `d-`). Use with dynamic_template_data on each personalization." },
          categories: { type: "array", items: { type: "string" }, description: "Up to 10 category tags for analytics" },
          send_at: { type: "number", description: "Unix timestamp to schedule send (must be within 72h)" },
          asm: { type: "object", description: "Unsubscribe group settings: { group_id, groups_to_display? }" },
          mail_settings: { type: "object", description: "e.g. { sandbox_mode: { enable: true } }" },
          tracking_settings: { type: "object", description: "Click / open / subscription tracking config" },
        },
        required: ["personalizations"],
      },
    },
    {
      name: "send_template",
      description: "Convenience wrapper for POST /mail/send with a dynamic template. Equivalent to send_mail with `template_id` set. Supply `to`, `template_id`, and `dynamic_template_data`; content is rendered from the template.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email (single address). Use send_mail for multiple/complex personalizations." },
          to_name: { type: "string", description: "Optional recipient display name" },
          from: { type: "object", description: "Sender { email, name? }. Falls back to SENDGRID_FROM_EMAIL." },
          template_id: { type: "string", description: "Dynamic template id (starts with `d-`)" },
          dynamic_template_data: { type: "object", description: "Handlebars variables substituted into the template" },
          subject: { type: "string", description: "Optional subject override (usually set inside the template)" },
        },
        required: ["to", "template_id"],
      },
    },
    {
      name: "add_contact",
      description: "Upsert contacts in Marketing Campaigns via PUT /marketing/contacts. Matches on email. Returns a job_id — ingestion is async. Optionally assign to list_ids.",
      inputSchema: {
        type: "object",
        properties: {
          list_ids: { type: "array", items: { type: "string" }, description: "Optional list UUIDs to add these contacts to" },
          contacts: {
            type: "array",
            description: "Contacts to upsert. Each: { email (required), first_name?, last_name?, phone_number?, country?, city?, custom_fields? }",
            items: { type: "object" },
          },
        },
        required: ["contacts"],
      },
    },
    {
      name: "list_contacts",
      description: "List Marketing Campaigns contacts via GET /marketing/contacts. Returns up to 50 sample contacts; for full export use a Contacts Export job.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "delete_contact",
      description: "Delete contacts by id via DELETE /marketing/contacts?ids=.... Pass a comma-separated list of contact UUIDs, or set delete_all_contacts=true to wipe all contacts (irreversible).",
      inputSchema: {
        type: "object",
        properties: {
          ids: { type: "string", description: "Comma-separated list of contact UUIDs to delete" },
          delete_all_contacts: { type: "boolean", description: "If true, deletes ALL contacts. Ignores `ids`." },
        },
      },
    },
    {
      name: "search_contacts",
      description: "Search contacts with an SGQL query via POST /marketing/contacts/search. Example: `email LIKE '%@codespar.com' AND CONTAINS(list_ids, 'abc-123')`.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "SGQL WHERE clause (SendGrid SQL-like syntax)" },
        },
        required: ["query"],
      },
    },
    {
      name: "get_contact",
      description: "Retrieve a single Marketing Campaigns contact by id via GET /marketing/contacts/{id}. Returns full contact record including custom fields and list_ids.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Contact UUID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_lists",
      description: "List all Marketing Campaigns contact lists via GET /marketing/lists. Returns list UUIDs, names, and contact_count. Supports pagination.",
      inputSchema: {
        type: "object",
        properties: {
          page_size: { type: "number", description: "Results per page (default 100, max 1000)" },
          page_token: { type: "string", description: "Pagination token from previous response" },
        },
      },
    },
    {
      name: "create_list",
      description: "Create a Marketing Campaigns contact list via POST /marketing/lists. Returns the new list UUID. Use the id with add_contact's list_ids to populate it.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "List name (max 100 chars, must be unique)" },
        },
        required: ["name"],
      },
    },
    {
      name: "delete_list",
      description: "Delete a Marketing Campaigns contact list via DELETE /marketing/lists/{id}. Contacts are NOT deleted by default — set delete_contacts=true to also remove contacts that belong ONLY to this list.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "List UUID" },
          delete_contacts: { type: "boolean", description: "If true, also delete contacts that are exclusive to this list (async job)" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_templates",
      description: "List transactional templates via GET /templates. By default returns dynamic templates (recommended); set generations='legacy' for legacy.",
      inputSchema: {
        type: "object",
        properties: {
          generations: { type: "string", enum: ["dynamic", "legacy", "legacy,dynamic"], description: "Template generation filter (default `dynamic`)" },
          page_size: { type: "number", description: "Results per page (1-200, default 10)" },
          page_token: { type: "string", description: "Pagination token from previous response" },
        },
      },
    },
    {
      name: "create_template",
      description: "Create a transactional template via POST /templates. Returns a template_id. Add versions separately via /templates/{id}/versions.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Template name (max 100 chars)" },
          generation: { type: "string", enum: ["dynamic", "legacy"], description: "Template generation (recommend `dynamic`)" },
        },
        required: ["name"],
      },
    },
    {
      name: "list_suppressions",
      description: "List all suppressed recipients for an unsubscribe group via GET /asm/groups/{group_id}/suppressions. Returns an array of email strings.",
      inputSchema: {
        type: "object",
        properties: {
          group_id: { type: "number", description: "Unsubscribe group id" },
        },
        required: ["group_id"],
      },
    },
    {
      name: "add_suppression",
      description: "Add recipients to a suppression group via POST /asm/groups/{group_id}/suppressions. Future mail in this group will be blocked for these addresses.",
      inputSchema: {
        type: "object",
        properties: {
          group_id: { type: "number", description: "Unsubscribe group id" },
          recipient_emails: { type: "array", items: { type: "string" }, description: "Emails to suppress" },
        },
        required: ["group_id", "recipient_emails"],
      },
    },
    {
      name: "list_unsubscribe_groups",
      description: "List all unsubscribe groups on the account via GET /asm/groups. Returns [{id, name, description, is_default, unsubscribes}]. Use the id with list_suppressions / add_suppression.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "number", description: "Optional: filter by a single group id" },
        },
      },
    },
    {
      name: "get_bounces",
      description: "Retrieve bounced recipients via GET /suppression/bounces. Returns [{email, created, reason, status}]. Filter by time window with start_time/end_time (Unix seconds).",
      inputSchema: {
        type: "object",
        properties: {
          start_time: { type: "number", description: "Unix timestamp (seconds) lower bound" },
          end_time: { type: "number", description: "Unix timestamp (seconds) upper bound" },
          limit: { type: "number", description: "Max results to return" },
          offset: { type: "number", description: "Offset for pagination" },
        },
      },
    },
    {
      name: "delete_bounce",
      description: "Remove a bounced address from the bounce suppression list via DELETE /suppression/bounces/{email}. Call this after the recipient confirms the underlying issue (e.g. mailbox full) is resolved.",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Bounced email address to clear" },
        },
        required: ["email"],
      },
    },
    {
      name: "cancel_scheduled_send",
      description: "Cancel or pause a scheduled send by batch_id via POST /user/scheduled_sends. A send_mail call with `send_at` + `batch_id` can be aborted until the send runs. Set status to 'cancel' or 'pause'.",
      inputSchema: {
        type: "object",
        properties: {
          batch_id: { type: "string", description: "The batch_id that was attached to the scheduled /mail/send call" },
          status: { type: "string", enum: ["cancel", "pause"], description: "`cancel` aborts; `pause` holds the batch (can be resumed by deleting the status)" },
        },
        required: ["batch_id", "status"],
      },
    },
    {
      name: "get_event_webhook_settings",
      description: "Retrieve the Event Webhook configuration via GET /user/webhooks/event/settings. Returns {url, enabled, delivered, open, click, bounce, dropped, spam_report, unsubscribe, ...} — useful to verify which SendGrid events are being forwarded.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_stats",
      description: "Global email stats via GET /stats. Returns sent/delivered/opens/clicks/bounces/spam_reports aggregated between start_date and end_date.",
      inputSchema: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "YYYY-MM-DD (required)" },
          end_date: { type: "string", description: "YYYY-MM-DD (default: today)" },
          aggregated_by: { type: "string", enum: ["day", "week", "month"], description: "Bucket size (default day)" },
          categories: { type: "string", description: "Optional category filter (comma-separated if multiple)" },
        },
        required: ["start_date"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "send_mail": {
        const body: Record<string, unknown> = {
          personalizations: a.personalizations,
        };
        if (a.from) body.from = a.from;
        else if (DEFAULT_FROM_EMAIL) body.from = { email: DEFAULT_FROM_EMAIL };
        if (a.reply_to) body.reply_to = a.reply_to;
        if (a.subject) body.subject = a.subject;
        if (a.content) body.content = a.content;
        if (a.attachments) body.attachments = a.attachments;
        if (a.template_id) body.template_id = a.template_id;
        if (a.categories) body.categories = a.categories;
        if (a.send_at) body.send_at = a.send_at;
        if (a.asm) body.asm = a.asm;
        if (a.mail_settings) body.mail_settings = a.mail_settings;
        if (a.tracking_settings) body.tracking_settings = a.tracking_settings;
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("POST", "/mail/send", body), null, 2) }] };
      }
      case "send_template": {
        const to: Record<string, unknown> = { email: a.to };
        if (a.to_name) to.name = a.to_name;
        const personalization: Record<string, unknown> = { to: [to] };
        if (a.dynamic_template_data) personalization.dynamic_template_data = a.dynamic_template_data;
        if (a.subject) personalization.subject = a.subject;
        const body: Record<string, unknown> = {
          personalizations: [personalization],
          template_id: a.template_id,
        };
        if (a.from) body.from = a.from;
        else if (DEFAULT_FROM_EMAIL) body.from = { email: DEFAULT_FROM_EMAIL };
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("POST", "/mail/send", body), null, 2) }] };
      }
      case "add_contact": {
        const body: Record<string, unknown> = { contacts: a.contacts };
        if (a.list_ids) body.list_ids = a.list_ids;
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("PUT", "/marketing/contacts", body), null, 2) }] };
      }
      case "list_contacts":
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("GET", "/marketing/contacts"), null, 2) }] };
      case "delete_contact": {
        const q = buildQuery({
          ids: a.ids,
          delete_all_contacts: a.delete_all_contacts ? "true" : undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("DELETE", `/marketing/contacts${q}`), null, 2) }] };
      }
      case "search_contacts":
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("POST", "/marketing/contacts/search", { query: a.query }), null, 2) }] };
      case "get_contact":
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("GET", `/marketing/contacts/${a.id}`), null, 2) }] };
      case "list_lists": {
        const q = buildQuery({
          page_size: a.page_size,
          page_token: a.page_token,
        });
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("GET", `/marketing/lists${q}`), null, 2) }] };
      }
      case "create_list":
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("POST", "/marketing/lists", { name: a.name }), null, 2) }] };
      case "delete_list": {
        const q = buildQuery({
          delete_contacts: a.delete_contacts ? "true" : undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("DELETE", `/marketing/lists/${a.id}${q}`), null, 2) }] };
      }
      case "list_templates": {
        const q = buildQuery({
          generations: a.generations ?? "dynamic",
          page_size: a.page_size,
          page_token: a.page_token,
        });
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("GET", `/templates${q}`), null, 2) }] };
      }
      case "create_template": {
        const body: Record<string, unknown> = { name: a.name };
        if (a.generation) body.generation = a.generation;
        else body.generation = "dynamic";
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("POST", "/templates", body), null, 2) }] };
      }
      case "list_suppressions":
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("GET", `/asm/groups/${a.group_id}/suppressions`), null, 2) }] };
      case "add_suppression":
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("POST", `/asm/groups/${a.group_id}/suppressions`, { recipient_emails: a.recipient_emails }), null, 2) }] };
      case "list_unsubscribe_groups": {
        const q = buildQuery({ id: a.id });
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("GET", `/asm/groups${q}`), null, 2) }] };
      }
      case "get_bounces": {
        const q = buildQuery({
          start_time: a.start_time,
          end_time: a.end_time,
          limit: a.limit,
          offset: a.offset,
        });
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("GET", `/suppression/bounces${q}`), null, 2) }] };
      }
      case "delete_bounce":
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("DELETE", `/suppression/bounces/${encodeURIComponent(String(a.email))}`), null, 2) }] };
      case "cancel_scheduled_send":
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("POST", "/user/scheduled_sends", { batch_id: a.batch_id, status: a.status }), null, 2) }] };
      case "get_event_webhook_settings":
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("GET", "/user/webhooks/event/settings"), null, 2) }] };
      case "get_stats": {
        const q = buildQuery({
          start_date: a.start_date,
          end_date: a.end_date,
          aggregated_by: a.aggregated_by,
          categories: a.categories,
        });
        return { content: [{ type: "text", text: JSON.stringify(await sendgridRequest("GET", `/stats${q}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-sendgrid", version: "0.2.1" }, { capabilities: { tools: {} } });
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
