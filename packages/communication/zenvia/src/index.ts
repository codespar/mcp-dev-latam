#!/usr/bin/env node

/**
 * MCP Server for Zenvia — multi-channel messaging (SMS, WhatsApp, RCS, Email, Voice, Facebook).
 *
 * Tools:
 * - send_sms: Send an SMS message
 * - send_whatsapp: Send a WhatsApp message
 * - send_rcs: Send an RCS message
 * - send_email: Send a transactional email
 * - send_voice: Send a voice message (TTS or pre-recorded audio)
 * - send_facebook_message: Send a Facebook Messenger message
 * - get_message_status: Get message delivery status
 * - list_channels: List available messaging channels
 * - create_subscription: Create a webhook subscription for events
 * - list_subscriptions: List all webhook subscriptions
 * - delete_subscription: Delete a webhook subscription
 * - list_contacts: List contacts
 * - create_contact: Create a contact in the contact base
 * - delete_contact: Delete a contact
 * - send_template: Send a WhatsApp template message
 * - list_templates: List approved WhatsApp templates
 * - get_report_entries: Get message report entries by date range
 * - add_opt_out: Add a phone number to the opt-out list
 *
 * Environment:
 *   ZENVIA_API_TOKEN — API token from https://app.zenvia.com/
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_TOKEN = process.env.ZENVIA_API_TOKEN || "";
const BASE_URL = "https://api.zenvia.com/v2";

async function zenviaRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-TOKEN": API_TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Zenvia API ${res.status}: ${err}`);
  }
  // Some endpoints (DELETE) return empty
  const text = await res.text();
  return text ? JSON.parse(text) : { ok: true };
}

const server = new Server(
  { name: "mcp-zenvia", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_sms",
      description: "Send an SMS message",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Sender ID" },
          to: { type: "string", description: "Recipient phone number with country code (e.g. 5511999999999)" },
          text: { type: "string", description: "Message text" },
        },
        required: ["from", "to", "text"],
      },
    },
    {
      name: "send_whatsapp",
      description: "Send a WhatsApp message",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Sender ID (WhatsApp channel)" },
          to: { type: "string", description: "Recipient phone number with country code" },
          text: { type: "string", description: "Message text" },
        },
        required: ["from", "to", "text"],
      },
    },
    {
      name: "send_rcs",
      description: "Send an RCS (Rich Communication Services) message",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Sender ID (RCS channel)" },
          to: { type: "string", description: "Recipient phone number with country code" },
          text: { type: "string", description: "Message text" },
        },
        required: ["from", "to", "text"],
      },
    },
    {
      name: "send_email",
      description: "Send a transactional email",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Sender email address (verified domain)" },
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject" },
          html: { type: "string", description: "HTML body of the email" },
          text: { type: "string", description: "Plain text body (fallback)" },
        },
        required: ["from", "to", "subject"],
      },
    },
    {
      name: "send_voice",
      description: "Send a voice message via TTS or pre-recorded audio URL",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Sender ID (Voice channel)" },
          to: { type: "string", description: "Recipient phone number with country code" },
          text: { type: "string", description: "Text to be spoken (TTS) — use either text or audioUrl" },
          audioUrl: { type: "string", description: "URL of pre-recorded audio file — use either text or audioUrl" },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "send_facebook_message",
      description: "Send a Facebook Messenger message",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Sender ID (Facebook page)" },
          to: { type: "string", description: "Recipient PSID (page-scoped user ID)" },
          text: { type: "string", description: "Message text" },
        },
        required: ["from", "to", "text"],
      },
    },
    {
      name: "get_message_status",
      description: "Get message delivery status by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Message ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_channels",
      description: "List available messaging channels",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_subscription",
      description: "Create a webhook subscription for message events",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Webhook URL to receive events" },
          channel: { type: "string", enum: ["sms", "whatsapp", "rcs", "email", "voice", "facebook"], description: "Channel to subscribe to" },
          eventType: { type: "string", enum: ["MESSAGE", "MESSAGE_STATUS"], description: "Event type" },
        },
        required: ["url", "channel", "eventType"],
      },
    },
    {
      name: "list_subscriptions",
      description: "List all webhook subscriptions",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "delete_subscription",
      description: "Delete a webhook subscription by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Subscription ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "list_contacts",
      description: "List contacts from the contact base",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number" },
          size: { type: "number", description: "Page size" },
        },
      },
    },
    {
      name: "create_contact",
      description: "Create a contact in the contact base",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Contact full name" },
          phone: { type: "string", description: "Phone number with country code" },
          email: { type: "string", description: "Email address" },
          groupId: { type: "string", description: "Optional group ID to add the contact to" },
        },
        required: ["name"],
      },
    },
    {
      name: "delete_contact",
      description: "Delete a contact by ID",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Contact ID" },
        },
        required: ["id"],
      },
    },
    {
      name: "send_template",
      description: "Send a WhatsApp template message (pre-approved)",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "string", description: "Sender ID (WhatsApp channel)" },
          to: { type: "string", description: "Recipient phone number with country code" },
          templateId: { type: "string", description: "Approved template ID" },
          fields: {
            type: "object",
            description: "Template variable values (key-value map)",
          },
        },
        required: ["from", "to", "templateId"],
      },
    },
    {
      name: "list_templates",
      description: "List approved message templates (WhatsApp/SMS/RCS)",
      inputSchema: {
        type: "object",
        properties: {
          channel: { type: "string", enum: ["sms", "whatsapp", "rcs"], description: "Filter templates by channel" },
        },
      },
    },
    {
      name: "get_report_entries",
      description: "Get message report entries within a date range",
      inputSchema: {
        type: "object",
        properties: {
          channel: { type: "string", enum: ["sms", "whatsapp", "rcs", "email", "voice", "facebook"], description: "Channel to report on" },
          startDate: { type: "string", description: "ISO 8601 start date (e.g. 2026-04-01)" },
          endDate: { type: "string", description: "ISO 8601 end date (e.g. 2026-04-24)" },
        },
        required: ["channel", "startDate", "endDate"],
      },
    },
    {
      name: "add_opt_out",
      description: "Add a phone number to the opt-out list (suppresses future messages)",
      inputSchema: {
        type: "object",
        properties: {
          channel: { type: "string", enum: ["sms", "whatsapp", "rcs", "voice"], description: "Channel for the opt-out" },
          from: { type: "string", description: "Sender ID the opt-out applies to" },
          phone: { type: "string", description: "Phone number to opt out (with country code)" },
        },
        required: ["channel", "from", "phone"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "send_sms":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("POST", "/channels/sms/messages", { from: args?.from, to: args?.to, contents: [{ type: "text", text: args?.text }] }), null, 2) }] };
      case "send_whatsapp":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("POST", "/channels/whatsapp/messages", { from: args?.from, to: args?.to, contents: [{ type: "text", text: args?.text }] }), null, 2) }] };
      case "send_rcs":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("POST", "/channels/rcs/messages", { from: args?.from, to: args?.to, contents: [{ type: "text", text: args?.text }] }), null, 2) }] };
      case "send_email": {
        const contents: any[] = [];
        if (args?.html) contents.push({ type: "email", html: args.html, subject: args?.subject });
        else if (args?.text) contents.push({ type: "email", text: args.text, subject: args?.subject });
        else contents.push({ type: "email", subject: args?.subject });
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("POST", "/channels/email/messages", { from: args?.from, to: args?.to, contents }), null, 2) }] };
      }
      case "send_voice": {
        const contents: any[] = [];
        if (args?.audioUrl) contents.push({ type: "audio", url: args.audioUrl });
        else if (args?.text) contents.push({ type: "text", text: args.text });
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("POST", "/channels/voice/messages", { from: args?.from, to: args?.to, contents }), null, 2) }] };
      }
      case "send_facebook_message":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("POST", "/channels/facebook/messages", { from: args?.from, to: args?.to, contents: [{ type: "text", text: args?.text }] }), null, 2) }] };
      case "get_message_status":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("GET", `/reports/${args?.id}`), null, 2) }] };
      case "list_channels":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("GET", "/channels"), null, 2) }] };
      case "create_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("POST", "/subscriptions", { webhook: { url: args?.url }, criteria: { channel: args?.channel }, eventType: args?.eventType }), null, 2) }] };
      case "list_subscriptions":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("GET", "/subscriptions"), null, 2) }] };
      case "delete_subscription":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("DELETE", `/subscriptions/${args?.id}`), null, 2) }] };
      case "list_contacts": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.size) params.set("size", String(args.size));
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("GET", `/contacts?${params}`), null, 2) }] };
      }
      case "create_contact": {
        const body: any = { name: args?.name };
        if (args?.phone) body.phone = args.phone;
        if (args?.email) body.email = args.email;
        if (args?.groupId) body.groupId = args.groupId;
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("POST", "/contacts", body), null, 2) }] };
      }
      case "delete_contact":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("DELETE", `/contacts/${args?.id}`), null, 2) }] };
      case "send_template":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("POST", "/channels/whatsapp/messages", { from: args?.from, to: args?.to, contents: [{ type: "template", templateId: args?.templateId, fields: args?.fields || {} }] }), null, 2) }] };
      case "list_templates": {
        const params = new URLSearchParams();
        if (args?.channel) params.set("channel", String(args.channel));
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("GET", `/templates?${params}`), null, 2) }] };
      }
      case "get_report_entries": {
        const params = new URLSearchParams();
        params.set("startDate", String(args?.startDate));
        params.set("endDate", String(args?.endDate));
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("GET", `/reports/${args?.channel}/entries?${params}`), null, 2) }] };
      }
      case "add_opt_out":
        return { content: [{ type: "text", text: JSON.stringify(await zenviaRequest("POST", `/channels/${args?.channel}/senders/${args?.from}/opt-outs`, { phone: args?.phone }), null, 2) }] };
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
        const s = new Server({ name: "mcp-zenvia", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
