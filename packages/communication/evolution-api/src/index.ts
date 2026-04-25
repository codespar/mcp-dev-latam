#!/usr/bin/env node

/**
 * MCP Server for Evolution API — self-hosted WhatsApp API.
 *
 * Tools:
 * - send_text: Send a text message
 * - send_image: Send an image message
 * - send_document: Send a document
 * - get_instances: List all instances
 * - create_instance: Create a new WhatsApp instance
 * - get_qrcode: Get QR code for instance pairing
 * - get_contacts: Get contacts from an instance
 * - send_poll: Send a poll message
 * - get_messages: Get messages from a chat
 * - check_number: Check if a number is on WhatsApp
 * - create_group: Create a WhatsApp group
 * - get_group_info: Get group metadata and participants
 * - update_profile: Update instance profile (name, picture, status)
 * - set_presence: Set online/offline presence for an instance
 * - get_chat_history: Get full chat history with pagination
 * - logout_instance: Logout an instance (disconnects WhatsApp session)
 * - restart_instance: Restart an instance
 * - delete_instance: Delete an instance permanently
 * - connection_state: Get connection state of an instance
 * - leave_group: Leave a WhatsApp group
 * - update_group_participants: Add/remove/promote/demote participants in a group
 * - fetch_group_invite_code: Fetch invite code/link for a group
 * - mark_message_as_read: Mark messages in a chat as read
 * - archive_chat: Archive or unarchive a chat
 * - delete_message: Delete a message (for me or for everyone)
 *
 * Environment:
 *   EVOLUTION_API_URL — Base URL of self-hosted Evolution API
 *   EVOLUTION_API_KEY — API key for authentication
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_URL = process.env.EVOLUTION_API_URL || "";
const API_KEY = process.env.EVOLUTION_API_KEY || "";

async function evolutionRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": API_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Evolution API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-evolution-api", version: "0.2.1" },
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
          instance: { type: "string", description: "Instance name" },
          number: { type: "string", description: "Phone number with country code (e.g. 5511999999999)" },
          text: { type: "string", description: "Message text" },
        },
        required: ["instance", "number", "text"],
      },
    },
    {
      name: "send_image",
      description: "Send an image message via WhatsApp",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          number: { type: "string", description: "Phone number with country code" },
          mediaUrl: { type: "string", description: "Image URL" },
          caption: { type: "string", description: "Image caption" },
        },
        required: ["instance", "number", "mediaUrl"],
      },
    },
    {
      name: "send_document",
      description: "Send a document via WhatsApp",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          number: { type: "string", description: "Phone number with country code" },
          mediaUrl: { type: "string", description: "Document URL" },
          fileName: { type: "string", description: "File name" },
          caption: { type: "string", description: "Document caption" },
        },
        required: ["instance", "number", "mediaUrl"],
      },
    },
    {
      name: "get_instances",
      description: "List all WhatsApp instances",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_instance",
      description: "Create a new WhatsApp instance",
      inputSchema: {
        type: "object",
        properties: {
          instanceName: { type: "string", description: "Name for the instance" },
          qrcode: { type: "boolean", description: "Generate QR code on creation (default true)" },
        },
        required: ["instanceName"],
      },
    },
    {
      name: "get_qrcode",
      description: "Get QR code for instance pairing",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
        },
        required: ["instance"],
      },
    },
    {
      name: "get_contacts",
      description: "Get contacts from an instance",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
        },
        required: ["instance"],
      },
    },
    {
      name: "send_poll",
      description: "Send a poll message via WhatsApp",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          number: { type: "string", description: "Phone number with country code" },
          name: { type: "string", description: "Poll question" },
          options: {
            type: "array",
            items: { type: "string" },
            description: "Poll options (max 12)",
          },
          selectableCount: { type: "number", description: "Max selectable options (0 = unlimited)" },
        },
        required: ["instance", "number", "name", "options"],
      },
    },
    {
      name: "get_messages",
      description: "Get messages from a chat",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          remoteJid: { type: "string", description: "Chat JID (e.g. 5511999999999@s.whatsapp.net)" },
          limit: { type: "number", description: "Number of messages (default 20)" },
        },
        required: ["instance", "remoteJid"],
      },
    },
    {
      name: "check_number",
      description: "Check if a phone number is registered on WhatsApp",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          numbers: {
            type: "array",
            items: { type: "string" },
            description: "Phone numbers to check",
          },
        },
        required: ["instance", "numbers"],
      },
    },
    {
      name: "create_group",
      description: "Create a WhatsApp group",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          subject: { type: "string", description: "Group name/subject" },
          participants: {
            type: "array",
            items: { type: "string" },
            description: "Array of phone numbers to add (with country code)",
          },
          description: { type: "string", description: "Group description" },
        },
        required: ["instance", "subject", "participants"],
      },
    },
    {
      name: "get_group_info",
      description: "Get group metadata, participants, and settings",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          groupJid: { type: "string", description: "Group JID (e.g. 120363000000000000@g.us)" },
        },
        required: ["instance", "groupJid"],
      },
    },
    {
      name: "update_profile",
      description: "Update instance profile (name, status text, or picture)",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          name: { type: "string", description: "New profile name" },
          status: { type: "string", description: "New status text" },
          picture: { type: "string", description: "URL of profile picture" },
        },
        required: ["instance"],
      },
    },
    {
      name: "set_presence",
      description: "Set online/offline presence for an instance",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          presence: { type: "string", enum: ["available", "unavailable", "composing", "recording", "paused"], description: "Presence state" },
          number: { type: "string", description: "Target number (required for composing/recording)" },
        },
        required: ["instance", "presence"],
      },
    },
    {
      name: "get_chat_history",
      description: "Get full chat history with pagination support",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          remoteJid: { type: "string", description: "Chat JID (e.g. 5511999999999@s.whatsapp.net)" },
          limit: { type: "number", description: "Number of messages (default 50)" },
          offset: { type: "number", description: "Pagination offset (message index)" },
          fromMe: { type: "boolean", description: "Filter only sent messages" },
        },
        required: ["instance", "remoteJid"],
      },
    },
    {
      name: "logout_instance",
      description: "Logout an instance (disconnects the WhatsApp session without deleting the instance)",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
        },
        required: ["instance"],
      },
    },
    {
      name: "restart_instance",
      description: "Restart an instance",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
        },
        required: ["instance"],
      },
    },
    {
      name: "delete_instance",
      description: "Delete an instance permanently",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
        },
        required: ["instance"],
      },
    },
    {
      name: "connection_state",
      description: "Get the connection state of an instance (open, connecting, close)",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
        },
        required: ["instance"],
      },
    },
    {
      name: "leave_group",
      description: "Leave a WhatsApp group",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          groupJid: { type: "string", description: "Group JID (e.g. 120363000000000000@g.us)" },
        },
        required: ["instance", "groupJid"],
      },
    },
    {
      name: "update_group_participants",
      description: "Add, remove, promote, or demote participants in a WhatsApp group",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          groupJid: { type: "string", description: "Group JID (e.g. 120363000000000000@g.us)" },
          action: { type: "string", enum: ["add", "remove", "promote", "demote"], description: "Action to take on participants" },
          participants: {
            type: "array",
            items: { type: "string" },
            description: "Array of phone numbers (with country code)",
          },
        },
        required: ["instance", "groupJid", "action", "participants"],
      },
    },
    {
      name: "fetch_group_invite_code",
      description: "Fetch the invite code/link for a WhatsApp group",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          groupJid: { type: "string", description: "Group JID (e.g. 120363000000000000@g.us)" },
        },
        required: ["instance", "groupJid"],
      },
    },
    {
      name: "mark_message_as_read",
      description: "Mark one or more messages in a chat as read",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          readMessages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                remoteJid: { type: "string", description: "Chat JID" },
                fromMe: { type: "boolean", description: "Whether the message was sent by the instance" },
                id: { type: "string", description: "Message ID" },
              },
              required: ["remoteJid", "fromMe", "id"],
            },
            description: "List of messages to mark as read",
          },
        },
        required: ["instance", "readMessages"],
      },
    },
    {
      name: "archive_chat",
      description: "Archive or unarchive a chat",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          remoteJid: { type: "string", description: "Chat JID" },
          archive: { type: "boolean", description: "true to archive, false to unarchive" },
          lastMessage: {
            type: "object",
            description: "Last message key reference (optional)",
          },
        },
        required: ["instance", "remoteJid", "archive"],
      },
    },
    {
      name: "delete_message",
      description: "Delete a message for me or for everyone in a chat",
      inputSchema: {
        type: "object",
        properties: {
          instance: { type: "string", description: "Instance name" },
          remoteJid: { type: "string", description: "Chat JID" },
          id: { type: "string", description: "Message ID" },
          fromMe: { type: "boolean", description: "Whether the message was sent by the instance" },
          participant: { type: "string", description: "Participant JID (required for group messages)" },
        },
        required: ["instance", "remoteJid", "id", "fromMe"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "send_text":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("POST", `/message/sendText/${args?.instance}`, { number: args?.number, text: args?.text }), null, 2) }] };
      case "send_image":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("POST", `/message/sendMedia/${args?.instance}`, { number: args?.number, mediatype: "image", media: args?.mediaUrl, caption: args?.caption }), null, 2) }] };
      case "send_document":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("POST", `/message/sendMedia/${args?.instance}`, { number: args?.number, mediatype: "document", media: args?.mediaUrl, fileName: args?.fileName, caption: args?.caption }), null, 2) }] };
      case "get_instances":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("GET", "/instance/fetchInstances"), null, 2) }] };
      case "create_instance":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("POST", "/instance/create", args), null, 2) }] };
      case "get_qrcode":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("GET", `/instance/connect/${args?.instance}`), null, 2) }] };
      case "get_contacts":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("GET", `/chat/contacts/${args?.instance}`), null, 2) }] };
      case "send_poll":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("POST", `/message/sendPoll/${args?.instance}`, { number: args?.number, name: args?.name, values: args?.options, selectableCount: args?.selectableCount ?? 0 }), null, 2) }] };
      case "get_messages": {
        const body: Record<string, unknown> = { where: { key: { remoteJid: args?.remoteJid } } };
        if (args?.limit) body.limit = args.limit;
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("POST", `/chat/findMessages/${args?.instance}`, body), null, 2) }] };
      }
      case "check_number":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("POST", `/chat/whatsappNumbers/${args?.instance}`, { numbers: args?.numbers }), null, 2) }] };
      case "create_group":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("POST", `/group/create/${args?.instance}`, { subject: args?.subject, participants: args?.participants, description: args?.description }), null, 2) }] };
      case "get_group_info":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("GET", `/group/findGroupInfos/${args?.instance}?groupJid=${args?.groupJid}`), null, 2) }] };
      case "update_profile": {
        const profileData: Record<string, unknown> = {};
        if (args?.name) profileData.name = args.name;
        if (args?.status) profileData.status = args.status;
        if (args?.picture) profileData.picture = args.picture;
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("PUT", `/instance/updateProfile/${args?.instance}`, profileData), null, 2) }] };
      }
      case "set_presence":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("POST", `/chat/setPresence/${args?.instance}`, { presence: args?.presence, number: args?.number }), null, 2) }] };
      case "get_chat_history": {
        const body: Record<string, unknown> = {
          where: { key: { remoteJid: args?.remoteJid } },
        };
        if (args?.limit) body.limit = args.limit;
        if (args?.offset) body.offset = args.offset;
        if (args?.fromMe !== undefined) body.where = { ...(body.where as Record<string, unknown>), key: { remoteJid: args?.remoteJid, fromMe: args.fromMe } };
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("POST", `/chat/findMessages/${args?.instance}`, body), null, 2) }] };
      }
      case "logout_instance":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("DELETE", `/instance/logout/${args?.instance}`), null, 2) }] };
      case "restart_instance":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("POST", `/instance/restart/${args?.instance}`), null, 2) }] };
      case "delete_instance":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("DELETE", `/instance/delete/${args?.instance}`), null, 2) }] };
      case "connection_state":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("GET", `/instance/connectionState/${args?.instance}`), null, 2) }] };
      case "leave_group":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("DELETE", `/group/leaveGroup/${args?.instance}?groupJid=${args?.groupJid}`), null, 2) }] };
      case "update_group_participants":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("POST", `/group/updateParticipant/${args?.instance}?groupJid=${args?.groupJid}`, { action: args?.action, participants: args?.participants }), null, 2) }] };
      case "fetch_group_invite_code":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("GET", `/group/inviteCode/${args?.instance}?groupJid=${args?.groupJid}`), null, 2) }] };
      case "mark_message_as_read":
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("POST", `/chat/markMessageAsRead/${args?.instance}`, { readMessages: args?.readMessages }), null, 2) }] };
      case "archive_chat": {
        const body: Record<string, unknown> = {
          chat: args?.remoteJid,
          archive: args?.archive,
        };
        if (args?.lastMessage) body.lastMessage = args.lastMessage;
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("POST", `/chat/archiveChat/${args?.instance}`, body), null, 2) }] };
      }
      case "delete_message": {
        const body: Record<string, unknown> = {
          id: args?.id,
          remoteJid: args?.remoteJid,
          fromMe: args?.fromMe,
        };
        if (args?.participant) body.participant = args.participant;
        return { content: [{ type: "text", text: JSON.stringify(await evolutionRequest("DELETE", `/chat/deleteMessageForEveryone/${args?.instance}`, body), null, 2) }] };
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
        const s = new Server({ name: "mcp-evolution-api", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
