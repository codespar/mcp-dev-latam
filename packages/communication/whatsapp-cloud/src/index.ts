#!/usr/bin/env node

/**
 * MCP Server for WhatsApp Cloud API — Meta's official Business API.
 *
 * Direct integration with Meta Graph API. No middleman. Distinct from the
 * wrapper providers in the catalog (Z-API, Evolution, Take Blip, Zenvia) which
 * all sit on top of this. Target: merchants with an approved WhatsApp Business
 * Account (WABA) who want Meta-direct pricing and full control.
 *
 * Tools (22):
 *   send_text_message        — simple text message
 *   send_template_message    — approved template (required for 24h+ business-initiated)
 *   send_media_message       — image, video, document, or audio
 *   send_interactive_message — buttons or list (generic)
 *   send_interactive_cta_url — interactive CTA URL button
 *   send_interactive_flow    — WhatsApp Flows message
 *   send_location_message    — latitude/longitude pin
 *   send_contacts_message    — vCard-style contact cards
 *   send_reaction_message    — emoji reaction to an inbound message
 *   send_typing_indicator    — show typing indicator on a received message
 *   mark_message_as_read     — mark an incoming message as read
 *   upload_media             — upload a file and get a media_id (multipart)
 *   retrieve_media_url       — resolve a media_id to a downloadable URL
 *   delete_media             — delete an uploaded media asset
 *   list_templates           — list templates on the WABA
 *   create_template          — submit a new template for Meta review
 *   delete_template          — delete a template by name
 *   get_business_profile     — read business profile on the phone number
 *   update_business_profile  — edit business profile fields
 *   list_phone_numbers       — list phone numbers on the WABA
 *   request_verification_code — request SMS/voice code to verify a phone number
 *   verify_code              — submit the received verification code
 *
 * Authentication
 *   Bearer token (permanent system-user access token).
 *     Authorization: Bearer <WHATSAPP_ACCESS_TOKEN>
 *
 * API surface
 *   Graph API base: https://graph.facebook.com/{version}
 *   Message + media endpoints are scoped to a phone_number_id.
 *   Template endpoints are scoped to a business_account_id.
 *
 * Environment
 *   WHATSAPP_ACCESS_TOKEN         required — Meta system-user token (secret)
 *   WHATSAPP_PHONE_NUMBER_ID      required — WABA phone number id
 *   WHATSAPP_BUSINESS_ACCOUNT_ID  required — WABA id (for template management)
 *   WHATSAPP_GRAPH_VERSION        optional — default v21.0
 *
 * Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "";
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

interface RequestOptions {
  multipart?: boolean;
}

async function whatsappRequest(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {}
): Promise<unknown> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${ACCESS_TOKEN}`,
    Accept: "application/json",
  };

  let payload: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (opts.multipart) {
      const form = new FormData();
      const b = body as Record<string, unknown>;
      for (const [k, v] of Object.entries(b)) {
        if (v === undefined || v === null) continue;
        if (k === "file" && typeof v === "object" && v !== null && "data" in (v as Record<string, unknown>)) {
          const f = v as { data: string; filename?: string; contentType?: string };
          const bytes = Buffer.from(f.data, "base64");
          const blob = new Blob([bytes], { type: f.contentType || "application/octet-stream" });
          form.append("file", blob, f.filename || "upload.bin");
        } else {
          form.append(k, String(v));
        }
      }
      payload = form;
      // fetch sets multipart boundary automatically
    } else {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
  }

  const res = await fetch(url, { method, headers, body: payload });
  if (!res.ok) {
    throw new Error(`WhatsApp Cloud API ${res.status}: ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

const server = new Server(
  { name: "mcp-whatsapp-cloud", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_text_message",
      description: "Send a plain text message. For business-initiated conversations outside the 24h customer-service window, use send_template_message instead.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient phone number in E.164 without + (e.g. 5511999999999)" },
          body: { type: "string", description: "Message text (UTF-8, up to 4096 chars)" },
          preview_url: { type: "boolean", description: "Enable URL preview for links in body (default false)" },
        },
        required: ["to", "body"],
      },
    },
    {
      name: "send_template_message",
      description: "Send an approved message template. Required for business-initiated conversations. Templates must be pre-approved by Meta via create_template.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient phone number in E.164 without +" },
          template_name: { type: "string", description: "Exact name of the approved template" },
          language_code: { type: "string", description: "BCP-47 language tag (e.g. en_US, pt_BR, es_MX)" },
          components: {
            type: "array",
            description: "Template component parameters (header, body, button). See Cloud API docs for shape.",
            items: { type: "object" },
          },
        },
        required: ["to", "template_name", "language_code"],
      },
    },
    {
      name: "send_media_message",
      description: "Send an image, video, document, or audio. Supply either `link` (public URL) or `id` (media_id from upload_media).",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient phone number in E.164 without +" },
          media_type: { type: "string", enum: ["image", "video", "document", "audio"], description: "Kind of media" },
          link: { type: "string", description: "Public HTTPS URL of the media. Use this OR id." },
          id: { type: "string", description: "Uploaded media_id from upload_media. Use this OR link." },
          caption: { type: "string", description: "Optional caption (image, video, document only)" },
          filename: { type: "string", description: "Optional filename (document only)" },
        },
        required: ["to", "media_type"],
      },
    },
    {
      name: "send_interactive_message",
      description: "Send an interactive message (reply buttons or list). Supply a fully-formed `interactive` object per Cloud API spec.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient phone number in E.164 without +" },
          interactive: {
            type: "object",
            description: "Interactive payload. For buttons: { type: 'button', body: { text }, action: { buttons: [...] } }. For list: { type: 'list', body: { text }, action: { button, sections } }.",
          },
        },
        required: ["to", "interactive"],
      },
    },
    {
      name: "send_interactive_cta_url",
      description: "Send an interactive message with a single CTA URL button. Opens the URL when the recipient taps it. Available without template approval inside the 24h window.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient phone number in E.164 without +" },
          body_text: { type: "string", description: "Main body text" },
          button_text: { type: "string", description: "Label shown on the CTA button (max 20 chars)" },
          url: { type: "string", description: "HTTPS URL the button opens" },
          header_text: { type: "string", description: "Optional header text" },
          footer_text: { type: "string", description: "Optional footer text" },
        },
        required: ["to", "body_text", "button_text", "url"],
      },
    },
    {
      name: "send_interactive_flow",
      description: "Send a WhatsApp Flow message. Flows are Meta's structured UI experiences (forms, appointment booking, etc.) rendered inside WhatsApp.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient phone number in E.164 without +" },
          flow_id: { type: "string", description: "ID of the approved Flow" },
          flow_token: { type: "string", description: "Opaque token your server correlates with this send" },
          flow_cta: { type: "string", description: "Label on the button that opens the flow (max 20 chars)" },
          body_text: { type: "string", description: "Body text above the CTA" },
          header_text: { type: "string", description: "Optional header text" },
          footer_text: { type: "string", description: "Optional footer text" },
          flow_action: { type: "string", enum: ["navigate", "data_exchange"], description: "Flow action type (default navigate)" },
          flow_action_payload: { type: "object", description: "Optional action payload: { screen, data }. Required for navigate." },
          mode: { type: "string", enum: ["draft", "published"], description: "Flow mode. Use draft while testing." },
        },
        required: ["to", "flow_id", "flow_token", "flow_cta", "body_text"],
      },
    },
    {
      name: "send_location_message",
      description: "Send a location pin with latitude/longitude and optional name/address.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient phone number in E.164 without +" },
          latitude: { type: "number", description: "Latitude" },
          longitude: { type: "number", description: "Longitude" },
          name: { type: "string", description: "Optional location name" },
          address: { type: "string", description: "Optional location address" },
        },
        required: ["to", "latitude", "longitude"],
      },
    },
    {
      name: "send_contacts_message",
      description: "Send one or more contact cards (vCard-like). Each contact includes name and at least one of phones, emails, addresses, urls, or org.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient phone number in E.164 without +" },
          contacts: {
            type: "array",
            description: "Array of contact objects per Cloud API spec (name, phones, emails, addresses, org, urls, birthday).",
            items: { type: "object" },
          },
        },
        required: ["to", "contacts"],
      },
    },
    {
      name: "send_reaction_message",
      description: "Send an emoji reaction on a previously received/sent message. Pass empty string for `emoji` to clear a reaction.",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient phone number in E.164 without +" },
          message_id: { type: "string", description: "wamid of the message being reacted to" },
          emoji: { type: "string", description: "Single unicode emoji. Empty string clears the reaction." },
        },
        required: ["to", "message_id", "emoji"],
      },
    },
    {
      name: "send_typing_indicator",
      description: "Show a typing indicator on a received message. Also marks the message as read. Indicator auto-clears after ~25s or when you reply.",
      inputSchema: {
        type: "object",
        properties: {
          message_id: { type: "string", description: "wamid of the inbound message to show the indicator on" },
        },
        required: ["message_id"],
      },
    },
    {
      name: "mark_message_as_read",
      description: "Mark an incoming message as read so the sender sees the blue double-check. Uses the wamid from the inbound webhook.",
      inputSchema: {
        type: "object",
        properties: {
          message_id: { type: "string", description: "Inbound message id (wamid.XXX) from the webhook" },
        },
        required: ["message_id"],
      },
    },
    {
      name: "upload_media",
      description: "Upload a media file and get back a media_id reusable in send_media_message. Multipart POST to /{phone_number_id}/media.",
      inputSchema: {
        type: "object",
        properties: {
          file_base64: { type: "string", description: "File contents, base64-encoded" },
          filename: { type: "string", description: "Filename (used for display and extension inference)" },
          mime_type: { type: "string", description: "MIME type (e.g. image/jpeg, video/mp4, application/pdf, audio/ogg)" },
        },
        required: ["file_base64", "filename", "mime_type"],
      },
    },
    {
      name: "retrieve_media_url",
      description: "Resolve a media_id to a short-lived downloadable URL. The URL itself still requires the Bearer token to fetch.",
      inputSchema: {
        type: "object",
        properties: {
          media_id: { type: "string", description: "Media id returned by upload_media or received in a webhook" },
        },
        required: ["media_id"],
      },
    },
    {
      name: "delete_media",
      description: "Delete an uploaded media asset by id.",
      inputSchema: {
        type: "object",
        properties: {
          media_id: { type: "string", description: "Media id to delete" },
        },
        required: ["media_id"],
      },
    },
    {
      name: "list_templates",
      description: "List message templates on the WhatsApp Business Account. Supports optional paging and name filter.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max templates per page (default 25)" },
          name: { type: "string", description: "Filter by exact template name" },
          status: { type: "string", description: "Filter by status (APPROVED, PENDING, REJECTED, PAUSED, DISABLED)" },
        },
      },
    },
    {
      name: "create_template",
      description: "Submit a new template for Meta review. Templates become usable only after approval (usually minutes to hours).",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Template name (lowercase, underscores, unique on WABA)" },
          language: { type: "string", description: "BCP-47 language tag (e.g. en_US, pt_BR)" },
          category: { type: "string", enum: ["AUTHENTICATION", "MARKETING", "UTILITY"], description: "Template category" },
          components: {
            type: "array",
            description: "Array of components: HEADER, BODY, FOOTER, BUTTONS. See Cloud API template docs.",
            items: { type: "object" },
          },
          allow_category_change: { type: "boolean", description: "Let Meta re-categorize if needed (default true recommended)" },
        },
        required: ["name", "language", "category", "components"],
      },
    },
    {
      name: "delete_template",
      description: "Delete a message template from the WABA by name. Optionally scope by hsm_id when two templates share a name across languages.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Template name to delete" },
          hsm_id: { type: "string", description: "Optional template id (when multiple languages share a name and only one should be deleted)" },
        },
        required: ["name"],
      },
    },
    {
      name: "get_business_profile",
      description: "Read the WhatsApp business profile (about, description, email, websites, vertical, address) for the configured phone number.",
      inputSchema: {
        type: "object",
        properties: {
          fields: { type: "string", description: "Comma-separated field list. Default: about,address,description,email,profile_picture_url,websites,vertical" },
        },
      },
    },
    {
      name: "update_business_profile",
      description: "Update the business profile on the configured phone number. Supply only the fields you want to change.",
      inputSchema: {
        type: "object",
        properties: {
          about: { type: "string", description: "About text (max 139 chars)" },
          address: { type: "string", description: "Physical address" },
          description: { type: "string", description: "Business description" },
          email: { type: "string", description: "Contact email" },
          vertical: { type: "string", description: "Business vertical (e.g. RETAIL, EDU, HEALTH, FINANCE, OTHER)" },
          websites: { type: "array", description: "Up to two URLs", items: { type: "string" } },
        },
      },
    },
    {
      name: "list_phone_numbers",
      description: "List all phone numbers registered under the WhatsApp Business Account, including display name, quality rating, and verification status.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max results per page (default 25)" },
        },
      },
    },
    {
      name: "request_verification_code",
      description: "Request Meta to send a verification code to the configured phone number via SMS or voice. Use before verify_code.",
      inputSchema: {
        type: "object",
        properties: {
          code_method: { type: "string", enum: ["SMS", "VOICE"], description: "Delivery method for the verification code" },
          language: { type: "string", description: "BCP-47 language tag for the voice/SMS copy (e.g. en_US, pt_BR)" },
        },
        required: ["code_method", "language"],
      },
    },
    {
      name: "verify_code",
      description: "Submit the verification code received via SMS/voice after request_verification_code. Completes registration.",
      inputSchema: {
        type: "object",
        properties: {
          code: { type: "string", description: "Verification code received (digits only, strip dashes)" },
        },
        required: ["code"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "send_text_message": {
        const body = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: a.to,
          type: "text",
          text: {
            body: a.body,
            preview_url: a.preview_url ?? false,
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${PHONE_NUMBER_ID}/messages`, body), null, 2) }] };
      }
      case "send_template_message": {
        const template: Record<string, unknown> = {
          name: a.template_name,
          language: { code: a.language_code },
        };
        if (a.components) template.components = a.components;
        const body = {
          messaging_product: "whatsapp",
          to: a.to,
          type: "template",
          template,
        };
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${PHONE_NUMBER_ID}/messages`, body), null, 2) }] };
      }
      case "send_media_message": {
        const mediaType = String(a.media_type);
        const mediaObj: Record<string, unknown> = {};
        if (a.id) mediaObj.id = a.id;
        if (a.link) mediaObj.link = a.link;
        if (a.caption && mediaType !== "audio") mediaObj.caption = a.caption;
        if (a.filename && mediaType === "document") mediaObj.filename = a.filename;
        const body = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: a.to,
          type: mediaType,
          [mediaType]: mediaObj,
        };
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${PHONE_NUMBER_ID}/messages`, body), null, 2) }] };
      }
      case "send_interactive_message": {
        const body = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: a.to,
          type: "interactive",
          interactive: a.interactive,
        };
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${PHONE_NUMBER_ID}/messages`, body), null, 2) }] };
      }
      case "send_interactive_cta_url": {
        const interactive: Record<string, unknown> = {
          type: "cta_url",
          body: { text: a.body_text },
          action: {
            name: "cta_url",
            parameters: {
              display_text: a.button_text,
              url: a.url,
            },
          },
        };
        if (a.header_text) interactive.header = { type: "text", text: a.header_text };
        if (a.footer_text) interactive.footer = { text: a.footer_text };
        const body = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: a.to,
          type: "interactive",
          interactive,
        };
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${PHONE_NUMBER_ID}/messages`, body), null, 2) }] };
      }
      case "send_interactive_flow": {
        const parameters: Record<string, unknown> = {
          flow_message_version: "3",
          flow_token: a.flow_token,
          flow_id: a.flow_id,
          flow_cta: a.flow_cta,
          flow_action: a.flow_action ?? "navigate",
        };
        if (a.mode) parameters.mode = a.mode;
        if (a.flow_action_payload) parameters.flow_action_payload = a.flow_action_payload;
        const interactive: Record<string, unknown> = {
          type: "flow",
          body: { text: a.body_text },
          action: {
            name: "flow",
            parameters,
          },
        };
        if (a.header_text) interactive.header = { type: "text", text: a.header_text };
        if (a.footer_text) interactive.footer = { text: a.footer_text };
        const body = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: a.to,
          type: "interactive",
          interactive,
        };
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${PHONE_NUMBER_ID}/messages`, body), null, 2) }] };
      }
      case "send_location_message": {
        const location: Record<string, unknown> = {
          latitude: a.latitude,
          longitude: a.longitude,
        };
        if (a.name) location.name = a.name;
        if (a.address) location.address = a.address;
        const body = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: a.to,
          type: "location",
          location,
        };
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${PHONE_NUMBER_ID}/messages`, body), null, 2) }] };
      }
      case "send_contacts_message": {
        const body = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: a.to,
          type: "contacts",
          contacts: a.contacts,
        };
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${PHONE_NUMBER_ID}/messages`, body), null, 2) }] };
      }
      case "send_reaction_message": {
        const body = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: a.to,
          type: "reaction",
          reaction: {
            message_id: a.message_id,
            emoji: a.emoji,
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${PHONE_NUMBER_ID}/messages`, body), null, 2) }] };
      }
      case "send_typing_indicator": {
        const body = {
          messaging_product: "whatsapp",
          status: "read",
          message_id: a.message_id,
          typing_indicator: { type: "text" },
        };
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${PHONE_NUMBER_ID}/messages`, body), null, 2) }] };
      }
      case "mark_message_as_read": {
        const body = {
          messaging_product: "whatsapp",
          status: "read",
          message_id: a.message_id,
        };
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${PHONE_NUMBER_ID}/messages`, body), null, 2) }] };
      }
      case "upload_media": {
        const body = {
          messaging_product: "whatsapp",
          type: a.mime_type,
          file: {
            data: a.file_base64,
            filename: a.filename,
            contentType: a.mime_type,
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${PHONE_NUMBER_ID}/media`, body, { multipart: true }), null, 2) }] };
      }
      case "retrieve_media_url":
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("GET", `/${a.media_id}`), null, 2) }] };
      case "delete_media":
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("DELETE", `/${a.media_id}`), null, 2) }] };
      case "list_templates": {
        const q = new URLSearchParams();
        if (a.limit !== undefined) q.set("limit", String(a.limit));
        if (a.name) q.set("name", String(a.name));
        if (a.status) q.set("status", String(a.status));
        const qs = q.toString();
        const path = `/${BUSINESS_ACCOUNT_ID}/message_templates${qs ? `?${qs}` : ""}`;
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("GET", path), null, 2) }] };
      }
      case "create_template": {
        const body: Record<string, unknown> = {
          name: a.name,
          language: a.language,
          category: a.category,
          components: a.components,
        };
        if (a.allow_category_change !== undefined) body.allow_category_change = a.allow_category_change;
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${BUSINESS_ACCOUNT_ID}/message_templates`, body), null, 2) }] };
      }
      case "delete_template": {
        const q = new URLSearchParams();
        q.set("name", String(a.name));
        if (a.hsm_id) q.set("hsm_id", String(a.hsm_id));
        const path = `/${BUSINESS_ACCOUNT_ID}/message_templates?${q.toString()}`;
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("DELETE", path), null, 2) }] };
      }
      case "get_business_profile": {
        const fields = a.fields ? String(a.fields) : "about,address,description,email,profile_picture_url,websites,vertical";
        const path = `/${PHONE_NUMBER_ID}/whatsapp_business_profile?fields=${encodeURIComponent(fields)}`;
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("GET", path), null, 2) }] };
      }
      case "update_business_profile": {
        const body: Record<string, unknown> = { messaging_product: "whatsapp" };
        for (const k of ["about", "address", "description", "email", "vertical", "websites"]) {
          if (a[k] !== undefined) body[k] = a[k];
        }
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${PHONE_NUMBER_ID}/whatsapp_business_profile`, body), null, 2) }] };
      }
      case "list_phone_numbers": {
        const q = new URLSearchParams();
        if (a.limit !== undefined) q.set("limit", String(a.limit));
        const qs = q.toString();
        const path = `/${BUSINESS_ACCOUNT_ID}/phone_numbers${qs ? `?${qs}` : ""}`;
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("GET", path), null, 2) }] };
      }
      case "request_verification_code": {
        const body = {
          code_method: a.code_method,
          language: a.language,
        };
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${PHONE_NUMBER_ID}/request_code`, body), null, 2) }] };
      }
      case "verify_code": {
        const body = { code: a.code };
        return { content: [{ type: "text", text: JSON.stringify(await whatsappRequest("POST", `/${PHONE_NUMBER_ID}/verify_code`, body), null, 2) }] };
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
        const s = new Server({ name: "mcp-whatsapp-cloud", version: "0.2.0" }, { capabilities: { tools: {} } });
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
