#!/usr/bin/env node

/**
 * MCP Server for Take Blip — Brazilian chatbot and messaging platform.
 *
 * Tools:
 * - send_message: Send a message to a contact
 * - get_contacts: List contacts
 * - create_contact: Create a contact
 * - get_threads: Get message threads
 * - send_notification: Send a notification/broadcast message
 * - get_analytics: Get chatbot analytics
 * - create_broadcast: Create a broadcast list and send
 * - get_chatbot_flow: Get chatbot flow configuration
 *
 * Environment:
 *   TAKE_BLIP_BOT_ID — Bot identifier
 *   TAKE_BLIP_ACCESS_KEY — Bot access key
 *
 * Note: Take Blip uses a JSON-based messaging protocol.
 * Requests go as POST to /commands with type/method/uri in body.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
  { name: "mcp-take-blip", version: "0.1.0" },
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
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!BOT_ID || !ACCESS_KEY) {
    console.error("TAKE_BLIP_BOT_ID and TAKE_BLIP_ACCESS_KEY environment variables are required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
