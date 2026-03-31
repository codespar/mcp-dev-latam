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
 *
 * Environment:
 *   ZAPI_INSTANCE_ID — Z-API instance ID
 *   ZAPI_TOKEN — Z-API instance token
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

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
  { name: "mcp-z-api", version: "0.1.0" },
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
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

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
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (!INSTANCE_ID || !TOKEN) {
    console.error("ZAPI_INSTANCE_ID and ZAPI_TOKEN environment variables are required");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
