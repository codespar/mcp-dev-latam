#!/usr/bin/env node

/**
 * MCP Server for Take Blip — Brazilian chatbot and messaging platform.
 *
 * Tools (18):
 * - send_message: Send a message to a contact
 * - get_contacts: List contacts
 * - create_contact: Create a contact
 * - update_contact: Merge/update a contact
 * - delete_contact: Delete a contact
 * - get_contact: Get a single contact by identity
 * - get_threads: Get message threads
 * - get_thread: Get a thread between bot and an identity
 * - send_notification: Send a notification/broadcast message
 * - get_analytics: Get chatbot analytics
 * - create_broadcast: Create a broadcast list and send
 * - get_chatbot_flow: Get chatbot flow configuration
 * - create_ticket: Open a support ticket / human handoff
 * - close_ticket: Close an open ticket
 * - list_tickets: List tickets in a queue
 * - track_event: Track a custom analytics event
 * - set_bot_resource: Set a bot resource (variable / bucket value)
 * - get_bot_resource: Get a bot resource (variable / bucket value)
 *
 * Environment:
 *   TAKE_BLIP_BOT_ID — Bot identifier
 *   TAKE_BLIP_ACCESS_KEY — Bot access key
 *
 * Note: Take Blip uses a JSON-based messaging protocol (LIME/BLiP HTTP API).
 * Requests go as POST to /commands with type/method/uri in body.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BOT_ID = process.env.TAKE_BLIP_BOT_ID || "";
const ACCESS_KEY = process.env.TAKE_BLIP_ACCESS_KEY || "";
const BASE_URL = "https://msging.net";

function getAuthKey(): string {
  const raw = `${BOT_ID}:${ACCESS_KEY}`;
  return btoa(raw);
}

async function blipCommand(id: string, method: string, uri: string, type?: string, resource?: unknown): Promise<unknown> {
  const body: Record<string, unknown> = { id, method, uri };
  if (type) body.type = type;
  if (resource) body.resource = resource;

  const res = await fetch(`${BASE_URL}/commands`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Key ${getAuthKey()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Take Blip API ${res.status}: ${err}`);
  }
  return res.json();
}

async function blipMessage(to: string, type: string, content: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Key ${getAuthKey()}`,
    },
    body: JSON.stringify({ id: crypto.randomUUID(), to, type, content }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Take Blip API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-take-blip", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_message",
      description: "Send a message to a contact via Take Blip",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient identity (e.g., 5511999999999@wa.gw.msging.net)" },
          content: { type: "string", description: "Message text content" },
          type: { type: "string", description: "Content type (default: text/plain)", enum: ["text/plain", "application/json"] },
        },
        required: ["to", "content"],
      },
    },
    {
      name: "get_contacts",
      description: "List contacts in Take Blip",
      inputSchema: {
        type: "object",
        properties: {
          skip: { type: "number", description: "Number of contacts to skip" },
          take: { type: "number", description: "Number of contacts to return (default 20)" },
        },
      },
    },
    {
      name: "create_contact",
      description: "Create a contact in Take Blip",
      inputSchema: {
        type: "object",
        properties: {
          identity: { type: "string", description: "Contact identity (e.g., 5511999999999@wa.gw.msging.net)" },
          name: { type: "string", description: "Contact name" },
          email: { type: "string", description: "Contact email" },
          phoneNumber: { type: "string", description: "Phone number" },
          group: { type: "string", description: "Contact group" },
        },
        required: ["identity", "name"],
      },
    },
    {
      name: "get_threads",
      description: "Get message threads (recent conversations)",
      inputSchema: {
        type: "object",
        properties: {
          skip: { type: "number", description: "Number of threads to skip" },
          take: { type: "number", description: "Number of threads to return" },
        },
      },
    },
    {
      name: "send_notification",
      description: "Send a notification message to a contact",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient identity" },
          templateName: { type: "string", description: "Message template name" },
          templateNamespace: { type: "string", description: "Template namespace" },
          parameters: {
            type: "array",
            description: "Template parameters",
            items: { type: "string" },
          },
        },
        required: ["to", "templateName"],
      },
    },
    {
      name: "get_analytics",
      description: "Get chatbot analytics and metrics",
      inputSchema: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "Start date (YYYY-MM-DD)" },
          endDate: { type: "string", description: "End date (YYYY-MM-DD)" },
          event: { type: "string", description: "Event category to track" },
        },
        required: ["startDate", "endDate"],
      },
    },
    {
      name: "create_broadcast",
      description: "Create a broadcast distribution list and send messages",
      inputSchema: {
        type: "object",
        properties: {
          listName: { type: "string", description: "Distribution list name" },
          recipients: {
            type: "array",
            description: "List of recipient identities",
            items: { type: "string" },
          },
          message: { type: "string", description: "Message content to broadcast" },
        },
        required: ["listName", "recipients", "message"],
      },
    },
    {
      name: "get_chatbot_flow",
      description: "Get chatbot flow/builder configuration",
      inputSchema: {
        type: "object",
        properties: {
          flowId: { type: "string", description: "Flow ID (optional, returns default flow if omitted)" },
        },
      },
    },
    {
      name: "update_contact",
      description: "Merge/update fields on an existing contact",
      inputSchema: {
        type: "object",
        properties: {
          identity: { type: "string", description: "Contact identity (e.g., 5511999999999@wa.gw.msging.net)" },
          name: { type: "string", description: "Contact name" },
          email: { type: "string", description: "Contact email" },
          phoneNumber: { type: "string", description: "Phone number" },
          group: { type: "string", description: "Contact group" },
          extras: { type: "object", description: "Custom extras key/value object" },
        },
        required: ["identity"],
      },
    },
    {
      name: "delete_contact",
      description: "Delete a contact by identity",
      inputSchema: {
        type: "object",
        properties: {
          identity: { type: "string", description: "Contact identity" },
        },
        required: ["identity"],
      },
    },
    {
      name: "get_contact",
      description: "Get a single contact by identity",
      inputSchema: {
        type: "object",
        properties: {
          identity: { type: "string", description: "Contact identity" },
        },
        required: ["identity"],
      },
    },
    {
      name: "get_thread",
      description: "Get the message thread between the bot and a specific identity",
      inputSchema: {
        type: "object",
        properties: {
          identity: { type: "string", description: "Contact identity" },
          take: { type: "number", description: "Number of messages to return (default 20)" },
        },
        required: ["identity"],
      },
    },
    {
      name: "create_ticket",
      description: "Open a support ticket / human handoff for a contact",
      inputSchema: {
        type: "object",
        properties: {
          customerIdentity: { type: "string", description: "Contact identity to open ticket for" },
          team: { type: "string", description: "Agent team / queue name" },
        },
        required: ["customerIdentity"],
      },
    },
    {
      name: "close_ticket",
      description: "Close an open support ticket",
      inputSchema: {
        type: "object",
        properties: {
          ticketId: { type: "string", description: "Ticket id to close" },
        },
        required: ["ticketId"],
      },
    },
    {
      name: "list_tickets",
      description: "List tickets, optionally filtering by status",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Ticket status filter (e.g., Open, Waiting, Closed)" },
          skip: { type: "number", description: "Pagination skip" },
          take: { type: "number", description: "Pagination take (default 20)" },
        },
      },
    },
    {
      name: "track_event",
      description: "Track a custom analytics event in the bot event tracker",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Event category" },
          action: { type: "string", description: "Event action" },
          extras: { type: "object", description: "Additional event metadata" },
          contactIdentity: { type: "string", description: "Contact identity associated with the event" },
        },
        required: ["category", "action"],
      },
    },
    {
      name: "set_bot_resource",
      description: "Set a bot resource value (used as bot variables / state via /resources bucket)",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Resource name (key)" },
          value: { description: "Resource value (string, number, object)" },
          type: { type: "string", description: "MIME type (default text/plain; use application/json for objects)" },
        },
        required: ["name", "value"],
      },
    },
    {
      name: "get_bot_resource",
      description: "Get a bot resource value by name (variable / state)",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Resource name (key)" },
        },
        required: ["name"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "send_message": {
        const contentType = args?.type || "text/plain";
        const content = contentType === "text/plain" ? args?.content : JSON.parse(String(args?.content));
        return { content: [{ type: "text", text: JSON.stringify(await blipMessage(String(args?.to), String(contentType), content), null, 2) }] };
      }
      case "get_contacts": {
        const skip = args?.skip ? `$skip=${args.skip}&` : "";
        const take = args?.take ? `$take=${args.take}` : "$take=20";
        return { content: [{ type: "text", text: JSON.stringify(await blipCommand(crypto.randomUUID(), "get", `/contacts?${skip}${take}`), null, 2) }] };
      }
      case "create_contact": {
        const resource = {
          identity: args?.identity,
          name: args?.name,
          email: args?.email,
          phoneNumber: args?.phoneNumber,
          group: args?.group,
        };
        return { content: [{ type: "text", text: JSON.stringify(await blipCommand(crypto.randomUUID(), "set", "/contacts", "application/vnd.lime.contact+json", resource), null, 2) }] };
      }
      case "get_threads": {
        const skip = args?.skip ? `$skip=${args.skip}&` : "";
        const take = args?.take ? `$take=${args.take}` : "$take=20";
        return { content: [{ type: "text", text: JSON.stringify(await blipCommand(crypto.randomUUID(), "get", `/threads?${skip}${take}`), null, 2) }] };
      }
      case "send_notification": {
        const template: Record<string, unknown> = {
          name: args?.templateName,
          namespace: args?.templateNamespace,
          language: { code: "pt_BR", policy: "deterministic" },
        };
        if (args?.parameters) {
          template.components = [{ type: "body", parameters: (args.parameters as string[]).map((p: string) => ({ type: "text", text: p })) }];
        }
        return { content: [{ type: "text", text: JSON.stringify(await blipMessage(String(args?.to), "application/json", template), null, 2) }] };
      }
      case "get_analytics": {
        const uri = `/event-track/${args?.event || ""}?startDate=${args?.startDate}&endDate=${args?.endDate}`;
        return { content: [{ type: "text", text: JSON.stringify(await blipCommand(crypto.randomUUID(), "get", uri), null, 2) }] };
      }
      case "create_broadcast": {
        // Create the distribution list
        const listIdentity = `${args?.listName}@broadcast.msging.net`;
        await blipCommand(crypto.randomUUID(), "set", "/lists", "application/vnd.iris.distribution-list+json", { identity: listIdentity });
        // Add recipients
        for (const recipient of (args?.recipients as string[]) || []) {
          await blipCommand(crypto.randomUUID(), "set", `/lists/${listIdentity}/recipients`, "application/vnd.lime.identity", recipient);
        }
        // Send message
        const result = await blipMessage(listIdentity, "text/plain", args?.message);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "get_chatbot_flow": {
        const uri = args?.flowId ? `/buckets/blip_portal:builder_working_flow_${args.flowId}` : "/buckets/blip_portal:builder_working_flow";
        return { content: [{ type: "text", text: JSON.stringify(await blipCommand(crypto.randomUUID(), "get", uri), null, 2) }] };
      }
      case "update_contact": {
        const resource: Record<string, unknown> = { identity: args?.identity };
        if (args?.name) resource.name = args.name;
        if (args?.email) resource.email = args.email;
        if (args?.phoneNumber) resource.phoneNumber = args.phoneNumber;
        if (args?.group) resource.group = args.group;
        if (args?.extras) resource.extras = args.extras;
        return { content: [{ type: "text", text: JSON.stringify(await blipCommand(crypto.randomUUID(), "merge", "/contacts", "application/vnd.lime.contact+json", resource), null, 2) }] };
      }
      case "delete_contact": {
        return { content: [{ type: "text", text: JSON.stringify(await blipCommand(crypto.randomUUID(), "delete", `/contacts/${encodeURIComponent(String(args?.identity))}`), null, 2) }] };
      }
      case "get_contact": {
        return { content: [{ type: "text", text: JSON.stringify(await blipCommand(crypto.randomUUID(), "get", `/contacts/${encodeURIComponent(String(args?.identity))}`), null, 2) }] };
      }
      case "get_thread": {
        const take = args?.take ? `$take=${args.take}` : "$take=20";
        return { content: [{ type: "text", text: JSON.stringify(await blipCommand(crypto.randomUUID(), "get", `/threads/${encodeURIComponent(String(args?.identity))}?${take}`), null, 2) }] };
      }
      case "create_ticket": {
        const resource: Record<string, unknown> = { customerIdentity: args?.customerIdentity };
        if (args?.team) resource.team = args.team;
        return { content: [{ type: "text", text: JSON.stringify(await blipCommand(crypto.randomUUID(), "set", "/tickets", "application/vnd.iris.ticket+json", resource), null, 2) }] };
      }
      case "close_ticket": {
        return { content: [{ type: "text", text: JSON.stringify(await blipCommand(crypto.randomUUID(), "set", `/tickets/${encodeURIComponent(String(args?.ticketId))}/change-status`, "application/vnd.iris.ticket+json", { status: "ClosedAttendant" }), null, 2) }] };
      }
      case "list_tickets": {
        const filters: string[] = [];
        if (args?.status) filters.push(`$filter=${encodeURIComponent(`status eq '${args.status}'`)}`);
        if (args?.skip) filters.push(`$skip=${args.skip}`);
        filters.push(args?.take ? `$take=${args.take}` : "$take=20");
        return { content: [{ type: "text", text: JSON.stringify(await blipCommand(crypto.randomUUID(), "get", `/tickets?${filters.join("&")}`), null, 2) }] };
      }
      case "track_event": {
        const resource: Record<string, unknown> = { category: args?.category, action: args?.action };
        if (args?.extras) resource.extras = args.extras;
        if (args?.contactIdentity) resource.contactIdentity = args.contactIdentity;
        return { content: [{ type: "text", text: JSON.stringify(await blipCommand(crypto.randomUUID(), "set", "/event-track", "application/vnd.iris.eventTrack+json", resource), null, 2) }] };
      }
      case "set_bot_resource": {
        const type = String(args?.type || (typeof args?.value === "object" ? "application/json" : "text/plain"));
        return { content: [{ type: "text", text: JSON.stringify(await blipCommand(crypto.randomUUID(), "set", `/resources/${encodeURIComponent(String(args?.name))}`, type, args?.value), null, 2) }] };
      }
      case "get_bot_resource": {
        return { content: [{ type: "text", text: JSON.stringify(await blipCommand(crypto.randomUUID(), "get", `/resources/${encodeURIComponent(String(args?.name))}`), null, 2) }] };
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
    app.get("/health", (_req: any, res: any) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: any, res: any) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req, res, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-take-blip", version: "0.2.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
