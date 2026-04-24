#!/usr/bin/env node

/**
 * MCP Server for Z-API — WhatsApp messaging platform.
 *
 * Tools:
 * - send_text: Send a text message
 * - send_image: Send an image message
 * - send_document: Send a document
 * - send_audio: Send an audio message
 * - get_contacts: Get all contacts
 * - check_number: Check if a phone number has WhatsApp
 * - get_profile_picture: Get profile picture for a phone number
 * - get_messages: Get messages for a phone number
 * - send_button_list: Send a button list message
 * - get_status: Get instance connection status
 * - create_group: Create a WhatsApp group
 * - get_group_metadata: Get group metadata and participants
 * - add_group_participant: Add participant to a group
 * - remove_group_participant: Remove participant from a group
 * - send_location: Send a location message
 * - send_contact: Send a contact card
 * - add_label: Assign a label/tag to a chat
 * - get_labels: List all available labels
 * - read_message: Mark messages as read
 * - delete_message: Delete a message
 * - get_contact_metadata: Get metadata (name, picture, status) for a single contact
 * - add_contacts: Add one or more contacts to the WhatsApp address book
 * - list_chats: List chats with pagination
 * - mark_chat_as_read: Mark an entire chat as read or unread
 * - list_groups: List WhatsApp groups with pagination
 * - send_option_list: Send an interactive option list (WhatsApp native list)
 * - send_button_actions: Send interactive action buttons (CALL, URL, REPLY)
 *
 * Environment:
 *   ZAPI_INSTANCE_ID — Z-API instance ID
 *   ZAPI_TOKEN — Z-API instance token
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// --- Zod validation helpers ---
const phoneSchema = z.string().regex(/^\d{10,15}$/, "Phone must be 10-15 digits (with country code, e.g. 5511999999999)");

function validationError(msg: string) {
  return { content: [{ type: "text" as const, text: `Validation error: ${msg}` }], isError: true as const };
}

const DEMO_MODE = process.argv.includes("--demo") || process.env.MCP_DEMO === "true";

const DEMO_RESPONSES: Record<string, unknown> = {
  send_text: { messageId: "msg_demo_001", status: "sent", phone: "5511999990000", text: "Seu pedido #1234 foi enviado! Tracking: ME123456789BR", timestamp: "2026-04-12T10:35:00Z" },
  send_image: { messageId: "msg_demo_002", status: "sent", type: "image" },
  get_contacts: { contacts: [{ phone: "5511999990000", name: "João Silva", isMyContact: true }, { phone: "5511888880000", name: "Maria Santos", isMyContact: true }] },
  send_document: { messageId: "msg_demo_003", status: "sent", type: "document" },
  send_audio: { messageId: "msg_demo_004", status: "sent", type: "audio" },
  check_number: { exists: true, phone: "5511999990000" },
  get_status: { connected: true, phone: "5511999990000", instanceId: "demo_instance" },
  get_messages: { messages: [{ messageId: "msg_demo_010", from: "5511999990000", body: "Olá, tudo bem?", timestamp: "2026-04-12T10:00:00Z" }] },
};

const INSTANCE_ID = process.env.ZAPI_INSTANCE_ID || "";
const TOKEN = process.env.ZAPI_TOKEN || "";
const BASE_URL = `https://api.z-api.io/instances/${INSTANCE_ID}/token/${TOKEN}`;

async function zapiRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Z-API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-z-api", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_text",
      description: "Send a text message via WhatsApp",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code (e.g. 5511999999999)" },
          message: { type: "string", description: "Text message content" },
        },
        required: ["phone", "message"],
      },
    },
    {
      name: "send_image",
      description: "Send an image message via WhatsApp",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code" },
          image: { type: "string", description: "Image URL" },
          caption: { type: "string", description: "Image caption" },
        },
        required: ["phone", "image"],
      },
    },
    {
      name: "send_document",
      description: "Send a document via WhatsApp",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code" },
          document: { type: "string", description: "Document URL" },
          fileName: { type: "string", description: "File name to display" },
        },
        required: ["phone", "document"],
      },
    },
    {
      name: "send_audio",
      description: "Send an audio message via WhatsApp",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code" },
          audio: { type: "string", description: "Audio URL (MP3 or OGG)" },
        },
        required: ["phone", "audio"],
      },
    },
    {
      name: "get_contacts",
      description: "Get all WhatsApp contacts",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "check_number",
      description: "Check if a phone number has WhatsApp",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code" },
        },
        required: ["phone"],
      },
    },
    {
      name: "get_profile_picture",
      description: "Get profile picture URL for a phone number",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code" },
        },
        required: ["phone"],
      },
    },
    {
      name: "get_messages",
      description: "Get messages for a phone number",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code" },
        },
        required: ["phone"],
      },
    },
    {
      name: "send_button_list",
      description: "Send a button list message via WhatsApp",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code" },
          message: { type: "string", description: "Message text" },
          buttonList: { type: "object", description: "Button list configuration with title and buttons array" },
        },
        required: ["phone", "message", "buttonList"],
      },
    },
    {
      name: "get_status",
      description: "Get WhatsApp instance connection status",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_group",
      description: "Create a WhatsApp group",
      inputSchema: {
        type: "object",
        properties: {
          groupName: { type: "string", description: "Name of the group" },
          phones: { type: "array", items: { type: "string" }, description: "Array of phone numbers to add" },
        },
        required: ["groupName", "phones"],
      },
    },
    {
      name: "get_group_metadata",
      description: "Get group metadata and participants",
      inputSchema: {
        type: "object",
        properties: {
          groupId: { type: "string", description: "Group ID (e.g. 5511999999999-group)" },
        },
        required: ["groupId"],
      },
    },
    {
      name: "add_group_participant",
      description: "Add a participant to a WhatsApp group",
      inputSchema: {
        type: "object",
        properties: {
          groupId: { type: "string", description: "Group ID" },
          phone: { type: "string", description: "Phone number to add" },
        },
        required: ["groupId", "phone"],
      },
    },
    {
      name: "remove_group_participant",
      description: "Remove a participant from a WhatsApp group",
      inputSchema: {
        type: "object",
        properties: {
          groupId: { type: "string", description: "Group ID" },
          phone: { type: "string", description: "Phone number to remove" },
        },
        required: ["groupId", "phone"],
      },
    },
    {
      name: "send_location",
      description: "Send a location message via WhatsApp",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code" },
          latitude: { type: "number", description: "Latitude" },
          longitude: { type: "number", description: "Longitude" },
          name: { type: "string", description: "Location name" },
          address: { type: "string", description: "Location address" },
        },
        required: ["phone", "latitude", "longitude"],
      },
    },
    {
      name: "send_contact",
      description: "Send a contact card via WhatsApp",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code" },
          contactName: { type: "string", description: "Contact display name" },
          contactPhone: { type: "string", description: "Contact phone number" },
        },
        required: ["phone", "contactName", "contactPhone"],
      },
    },
    {
      name: "add_label",
      description: "Assign a label/tag to a chat",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code" },
          labelId: { type: "string", description: "Label ID to assign" },
        },
        required: ["phone", "labelId"],
      },
    },
    {
      name: "get_labels",
      description: "List all available labels/tags",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "read_message",
      description: "Mark messages as read",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code" },
          messageId: { type: "string", description: "Message ID to mark as read" },
        },
        required: ["phone", "messageId"],
      },
    },
    {
      name: "delete_message",
      description: "Delete a message",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code" },
          messageId: { type: "string", description: "Message ID to delete" },
          owner: { type: "boolean", description: "Whether the message was sent by you (true) or received (false)" },
        },
        required: ["phone", "messageId", "owner"],
      },
    },
    {
      name: "get_contact_metadata",
      description: "Get metadata (name, WhatsApp display name, profile picture, status) for a single contact",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code (DDI DDD NUMBER)" },
        },
        required: ["phone"],
      },
    },
    {
      name: "add_contacts",
      description: "Add one or more contacts to the WhatsApp address book. Accepts an array of contacts.",
      inputSchema: {
        type: "object",
        properties: {
          contacts: {
            type: "array",
            description: "Array of contacts to add",
            items: {
              type: "object",
              properties: {
                firstName: { type: "string", description: "First name (required)" },
                lastName: { type: "string", description: "Last name (optional)" },
                phone: { type: "string", description: "Phone number with country code" },
              },
              required: ["firstName", "phone"],
            },
          },
        },
        required: ["contacts"],
      },
    },
    {
      name: "list_chats",
      description: "List all WhatsApp chats with pagination",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number (starts at 1)" },
          pageSize: { type: "number", description: "Number of chats per page" },
        },
        required: ["page", "pageSize"],
      },
    },
    {
      name: "mark_chat_as_read",
      description: "Mark an entire chat as read or unread",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code" },
          action: { type: "string", enum: ["read", "unread"], description: "Action to perform" },
        },
        required: ["phone", "action"],
      },
    },
    {
      name: "list_groups",
      description: "List all WhatsApp groups with pagination",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number (starts at 1)" },
          pageSize: { type: "number", description: "Number of groups per page" },
        },
        required: ["page", "pageSize"],
      },
    },
    {
      name: "send_option_list",
      description: "Send an interactive option list (WhatsApp native list). Does NOT work in groups.",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code" },
          message: { type: "string", description: "Main message text" },
          optionList: {
            type: "object",
            description: "Option list config",
            properties: {
              title: { type: "string", description: "List title" },
              buttonLabel: { type: "string", description: "Label for the button that opens the list" },
              options: {
                type: "array",
                description: "Selectable options",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "Option title" },
                    description: { type: "string", description: "Option description (optional)" },
                    id: { type: "string", description: "Option identifier (optional)" },
                  },
                  required: ["title"],
                },
              },
            },
            required: ["title", "buttonLabel", "options"],
          },
          delayMessage: { type: "number", description: "Delay between 1-15 seconds before sending (optional)" },
        },
        required: ["phone", "message", "optionList"],
      },
    },
    {
      name: "send_button_actions",
      description: "Send interactive action buttons (CALL, URL, REPLY). Do not mix REPLY with CALL/URL in the same message.",
      inputSchema: {
        type: "object",
        properties: {
          phone: { type: "string", description: "Phone number with country code" },
          message: { type: "string", description: "Message text" },
          title: { type: "string", description: "Optional title" },
          footer: { type: "string", description: "Optional footer" },
          buttonActions: {
            type: "array",
            description: "Array of button action objects. Each has type (CALL|URL|REPLY), label, and type-specific fields (phone, url, id).",
            items: { type: "object" },
          },
        },
        required: ["phone", "message", "buttonActions"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (DEMO_MODE) {
    return { content: [{ type: "text", text: JSON.stringify(DEMO_RESPONSES[name] || { demo: true, tool: name }, null, 2) }] };
  }

  // --- Input validation ---
  try {
    const toolsWithPhone = [
      "send_text", "send_image", "send_document", "send_audio",
      "check_number", "get_profile_picture", "get_messages",
      "send_button_list", "send_location", "send_contact",
      "add_label", "read_message", "delete_message",
      "get_contact_metadata", "mark_chat_as_read",
      "send_option_list", "send_button_actions",
    ];
    if (toolsWithPhone.includes(name) && args?.phone) {
      const r = phoneSchema.safeParse(args.phone);
      if (!r.success) return validationError(r.error.issues[0].message);
    }
    if (name === "send_contact" && args?.contactPhone) {
      const r = phoneSchema.safeParse(args.contactPhone);
      if (!r.success) return validationError(r.error.issues[0].message);
    }
    if (name === "add_group_participant" && args?.phone) {
      const r = phoneSchema.safeParse(args.phone);
      if (!r.success) return validationError(r.error.issues[0].message);
    }
    if (name === "remove_group_participant" && args?.phone) {
      const r = phoneSchema.safeParse(args.phone);
      if (!r.success) return validationError(r.error.issues[0].message);
    }
  } catch (e) {
    // Validation should not block — fall through on unexpected errors
  }

  try {
    switch (name) {
      case "send_text":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/send-text", args), null, 2) }] };
      case "send_image":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/send-image", args), null, 2) }] };
      case "send_document":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/send-document", args), null, 2) }] };
      case "send_audio":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/send-audio", args), null, 2) }] };
      case "get_contacts":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("GET", "/contacts"), null, 2) }] };
      case "check_number":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("GET", `/phone-exists/${args?.phone}`), null, 2) }] };
      case "get_profile_picture":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("GET", `/profile-picture/${args?.phone}`), null, 2) }] };
      case "get_messages":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("GET", `/messages/${args?.phone}`), null, 2) }] };
      case "send_button_list":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/send-button-list", args), null, 2) }] };
      case "get_status":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("GET", "/status"), null, 2) }] };
      case "create_group":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/create-group", args), null, 2) }] };
      case "get_group_metadata":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("GET", `/group-metadata/${args?.groupId}`), null, 2) }] };
      case "add_group_participant":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/add-participant", args), null, 2) }] };
      case "remove_group_participant":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/remove-participant", args), null, 2) }] };
      case "send_location":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/send-location", args), null, 2) }] };
      case "send_contact":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/send-contact", args), null, 2) }] };
      case "add_label":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/tag", args), null, 2) }] };
      case "get_labels":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("GET", "/tags"), null, 2) }] };
      case "read_message":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/read-message", args), null, 2) }] };
      case "delete_message":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/delete-message", args), null, 2) }] };
      case "get_contact_metadata":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("GET", `/contacts/${args?.phone}`), null, 2) }] };
      case "add_contacts":
        // Z-API expects the array as the top-level body
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/contacts/add", (args as any)?.contacts ?? []), null, 2) }] };
      case "list_chats": {
        const page = (args as any)?.page;
        const pageSize = (args as any)?.pageSize;
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("GET", `/chats?page=${page}&pageSize=${pageSize}`), null, 2) }] };
      }
      case "mark_chat_as_read":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/modify-chat", args), null, 2) }] };
      case "list_groups": {
        const page = (args as any)?.page;
        const pageSize = (args as any)?.pageSize;
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("GET", `/groups?page=${page}&pageSize=${pageSize}`), null, 2) }] };
      }
      case "send_option_list":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/send-option-list", args), null, 2) }] };
      case "send_button_actions":
        return { content: [{ type: "text", text: JSON.stringify(await zapiRequest("POST", "/send-button-actions", args), null, 2) }] };
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
        const s = new Server({ name: "mcp-z-api", version: "0.2.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
