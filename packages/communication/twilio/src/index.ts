#!/usr/bin/env node

/**
 * MCP Server for Twilio — the global standard for programmable messaging + voice.
 *
 * One server covering Twilio's three most-used products:
 *   - Programmable Messaging (SMS + WhatsApp, same API, `whatsapp:` prefix)
 *   - Programmable Voice (outbound calls, hangup, redirect)
 *   - Verify (2FA one-time codes) + Lookups (phone validation)
 *
 * Fills the global-messaging gap in a catalog otherwise tilted to BR-specific
 * providers (Z-API, Take Blip, Zenvia, Evolution API). Twilio ships in 180+
 * countries on day one.
 *
 * Tools (22):
 *   send_message                  — send SMS or WhatsApp (prefix `To` with `whatsapp:+E164`)
 *   get_message                   — retrieve a message by SID
 *   list_messages                 — list messages with optional To/From/DateSent filters
 *   delete_message                — delete a message from history
 *   make_call                     — place an outbound voice call driven by a TwiML Url
 *   get_call                      — retrieve a call by SID
 *   update_call                   — hang up or redirect an in-progress call
 *   list_recordings               — list call recordings (optionally filtered by CallSid)
 *   start_verification            — send a Verify (2FA) code via sms / whatsapp / call
 *   check_verification            — check a Verify (2FA) code
 *   create_verify_service         — provision a new Verify Service (VA...)
 *   lookup_phone                  — validate + format + classify a phone number
 *   list_incoming_numbers         — list provisioned Twilio phone numbers
 *   buy_phone_number              — provision a new phone number
 *   create_conversation           — create a Conversation (Conversations API)
 *   list_conversations            — list Conversations
 *   add_conversation_participant  — add an SMS / WhatsApp / chat participant to a Conversation
 *   send_conversation_message     — post a message into a Conversation
 *   list_messaging_services       — list Messaging Services (MG...)
 *   execute_studio_flow           — trigger a Studio Flow execution for a contact
 *   create_taskrouter_task        — create a TaskRouter task on a Workspace
 *   list_taskrouter_workers       — list TaskRouter Workers on a Workspace
 *
 * Authentication
 *   HTTP Basic with AccountSid:AuthToken.
 *     Authorization: Basic <base64(AccountSid:AuthToken)>
 *
 * API surface
 *   Accounts API      : https://api.twilio.com/2010-04-01/Accounts/{AccountSid}
 *   Verify API        : https://verify.twilio.com/v2
 *   Lookups API       : https://lookups.twilio.com/v2
 *   Conversations API : https://conversations.twilio.com/v1
 *   Messaging API     : https://messaging.twilio.com/v1
 *   Studio API        : https://studio.twilio.com/v2
 *   TaskRouter API    : https://taskrouter.twilio.com/v1
 *
 *   Request bodies are application/x-www-form-urlencoded. Responses are JSON
 *   (Accounts endpoints use the `.json` suffix).
 *
 * Environment
 *   TWILIO_ACCOUNT_SID             required — Account SID (AC...)
 *   TWILIO_AUTH_TOKEN              required — Auth Token (secret)
 *   TWILIO_MESSAGING_SERVICE_SID   optional — default sender for send_message (MG...)
 *
 * Docs: https://www.twilio.com/docs/api
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const DEFAULT_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID || "";
const ACCOUNTS_BASE = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}`;

async function twilioRequest(
  method: string,
  fullUrlOrPath: string,
  body?: Record<string, unknown>
): Promise<unknown> {
  const url = fullUrlOrPath.startsWith("https://")
    ? fullUrlOrPath
    : `${ACCOUNTS_BASE}${fullUrlOrPath}`;

  const basic = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64");
  const headers: Record<string, string> = {
    "Authorization": `Basic ${basic}`,
    "Accept": "application/json",
  };

  let encodedBody: string | undefined;
  if (body && Object.keys(body).length > 0) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        for (const item of v) params.append(k, String(item));
      } else {
        params.append(k, String(v));
      }
    }
    encodedBody = params.toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const res = await fetch(url, { method, headers, body: encodedBody });
  if (!res.ok) {
    throw new Error(`Twilio API ${res.status}: ${await res.text()}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
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
  { name: "mcp-twilio", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_message",
      description: "Send an SMS or WhatsApp message. For WhatsApp, prefix `To` (and `From`) with `whatsapp:+E164`. Supply either `From` (a Twilio phone number) OR `MessagingServiceSid` (a Messaging Service). If neither is given, falls back to env TWILIO_MESSAGING_SERVICE_SID.",
      inputSchema: {
        type: "object",
        properties: {
          To: { type: "string", description: "Destination in E.164 (e.g. +5511999999999) or `whatsapp:+E164` for WhatsApp" },
          From: { type: "string", description: "Twilio phone number in E.164, or `whatsapp:+E164` for WhatsApp. Omit if using MessagingServiceSid." },
          MessagingServiceSid: { type: "string", description: "Messaging Service SID (MG...). Overrides env default. Omit if using From." },
          Body: { type: "string", description: "Message text (UTF-8)" },
          MediaUrl: { type: "array", items: { type: "string" }, description: "Optional list of media URLs (MMS / WhatsApp media)" },
          StatusCallback: { type: "string", description: "Webhook URL Twilio calls on delivery-status transitions" },
        },
        required: ["To", "Body"],
      },
    },
    {
      name: "get_message",
      description: "Retrieve a message resource by SID (SM... or MM...).",
      inputSchema: {
        type: "object",
        properties: {
          Sid: { type: "string", description: "Message SID" },
        },
        required: ["Sid"],
      },
    },
    {
      name: "list_messages",
      description: "List messages with optional filters. Returns Twilio's paginated list; pass PageSize to cap.",
      inputSchema: {
        type: "object",
        properties: {
          To: { type: "string", description: "Filter by destination (E.164 or whatsapp:+E164)" },
          From: { type: "string", description: "Filter by sender" },
          DateSent: { type: "string", description: "Filter by exact send date (YYYY-MM-DD). Use DateSentAfter / DateSentBefore for ranges." },
          DateSentAfter: { type: "string", description: "Return messages sent on/after this date (YYYY-MM-DD)" },
          DateSentBefore: { type: "string", description: "Return messages sent on/before this date (YYYY-MM-DD)" },
          PageSize: { type: "number", description: "Max rows per page (default 50, max 1000)" },
        },
      },
    },
    {
      name: "delete_message",
      description: "Delete a message from history. Irreversible.",
      inputSchema: {
        type: "object",
        properties: {
          Sid: { type: "string", description: "Message SID" },
        },
        required: ["Sid"],
      },
    },
    {
      name: "make_call",
      description: "Place an outbound voice call. Twilio fetches TwiML from `Url` on connect to drive the call.",
      inputSchema: {
        type: "object",
        properties: {
          To: { type: "string", description: "Destination number in E.164" },
          From: { type: "string", description: "Twilio-provisioned caller ID in E.164" },
          Url: { type: "string", description: "HTTP(S) URL returning TwiML that drives the call" },
          Method: { type: "string", enum: ["GET", "POST"], description: "HTTP method Twilio uses to fetch Url (default POST)" },
          StatusCallback: { type: "string", description: "Webhook URL for call-status events" },
          StatusCallbackEvent: { type: "array", items: { type: "string" }, description: "Events to subscribe to: initiated, ringing, answered, completed" },
        },
        required: ["To", "From", "Url"],
      },
    },
    {
      name: "get_call",
      description: "Retrieve a call resource by SID (CA...).",
      inputSchema: {
        type: "object",
        properties: {
          Sid: { type: "string", description: "Call SID" },
        },
        required: ["Sid"],
      },
    },
    {
      name: "update_call",
      description: "Modify an in-progress call. Set Status='completed' to hang up, or pass a new Url to redirect the call to fresh TwiML.",
      inputSchema: {
        type: "object",
        properties: {
          Sid: { type: "string", description: "Call SID" },
          Status: { type: "string", enum: ["canceled", "completed"], description: "canceled (before answered) or completed (hang up)" },
          Url: { type: "string", description: "New TwiML URL — redirects the live call" },
          Method: { type: "string", enum: ["GET", "POST"], description: "HTTP method for the new Url" },
        },
        required: ["Sid"],
      },
    },
    {
      name: "start_verification",
      description: "Start a Verify (2FA) challenge. Sends a one-time code to `To` via the chosen channel. Requires a Verify Service SID (VA...).",
      inputSchema: {
        type: "object",
        properties: {
          ServiceSid: { type: "string", description: "Verify Service SID (VA...)" },
          To: { type: "string", description: "Destination in E.164 (or email for email channel)" },
          Channel: { type: "string", enum: ["sms", "whatsapp", "call", "email"], description: "Delivery channel" },
          Locale: { type: "string", description: "Message locale (e.g. pt-br, en, es)" },
        },
        required: ["ServiceSid", "To", "Channel"],
      },
    },
    {
      name: "check_verification",
      description: "Check a Verify (2FA) code against a Service SID. Returns status=approved when the code matches.",
      inputSchema: {
        type: "object",
        properties: {
          ServiceSid: { type: "string", description: "Verify Service SID (VA...)" },
          To: { type: "string", description: "Destination that received the code" },
          Code: { type: "string", description: "Code the user entered" },
        },
        required: ["ServiceSid", "To", "Code"],
      },
    },
    {
      name: "lookup_phone",
      description: "Validate and normalize a phone number via Lookups v2. Optional `Fields` lets you request carrier info, line_type_intelligence, caller_name, identity_match, etc.",
      inputSchema: {
        type: "object",
        properties: {
          PhoneNumber: { type: "string", description: "Number to look up (E.164 recommended; Lookups v2 will format if possible)" },
          Fields: { type: "string", description: "Comma-separated list of add-ons (e.g. `line_type_intelligence,caller_name`). Billed per field." },
          CountryCode: { type: "string", description: "ISO-3166 alpha-2. Required only if PhoneNumber is not in E.164." },
        },
        required: ["PhoneNumber"],
      },
    },
    {
      name: "list_incoming_numbers",
      description: "List Twilio-provisioned phone numbers on this account. Filter by PhoneNumber (partial), FriendlyName, or Beta.",
      inputSchema: {
        type: "object",
        properties: {
          PhoneNumber: { type: "string", description: "Filter by partial phone number match" },
          FriendlyName: { type: "string", description: "Filter by friendly name" },
          PageSize: { type: "number", description: "Max rows per page (default 50, max 1000)" },
        },
      },
    },
    {
      name: "buy_phone_number",
      description: "Provision a new phone number. Supply either a specific `PhoneNumber` (from AvailablePhoneNumbers search) or an `AreaCode` to let Twilio pick one.",
      inputSchema: {
        type: "object",
        properties: {
          PhoneNumber: { type: "string", description: "Exact E.164 number to buy (from AvailablePhoneNumbers search)" },
          AreaCode: { type: "string", description: "Area code — Twilio picks any available number in it" },
          FriendlyName: { type: "string", description: "Friendly label" },
          VoiceUrl: { type: "string", description: "TwiML URL for incoming calls" },
          SmsUrl: { type: "string", description: "TwiML URL for incoming SMS" },
          StatusCallback: { type: "string", description: "Webhook URL for number status events" },
        },
      },
    },
    {
      name: "list_recordings",
      description: "List call recordings on this account. Optionally filter by CallSid, or by DateCreated range. Returns Twilio's paginated list.",
      inputSchema: {
        type: "object",
        properties: {
          CallSid: { type: "string", description: "Restrict to recordings produced by this Call SID (CA...)" },
          DateCreatedAfter: { type: "string", description: "Return recordings created on/after this date (YYYY-MM-DD)" },
          DateCreatedBefore: { type: "string", description: "Return recordings created on/before this date (YYYY-MM-DD)" },
          PageSize: { type: "number", description: "Max rows per page (default 50, max 1000)" },
        },
      },
    },
    {
      name: "create_verify_service",
      description: "Create a Verify Service (VA...). A service groups verification attempts and holds per-service config (code length, friendly name).",
      inputSchema: {
        type: "object",
        properties: {
          FriendlyName: { type: "string", description: "Human-readable name for the service (e.g. your app name)" },
          CodeLength: { type: "number", description: "OTP code length, 4-10 (default 6)" },
          LookupEnabled: { type: "boolean", description: "Run Lookup on targets before sending (blocks invalid numbers)" },
          DefaultTemplateSid: { type: "string", description: "Default message template SID" },
        },
        required: ["FriendlyName"],
      },
    },
    {
      name: "create_conversation",
      description: "Create a Twilio Conversation. Conversations host multi-channel (SMS / WhatsApp / chat) threads with server-side history.",
      inputSchema: {
        type: "object",
        properties: {
          FriendlyName: { type: "string", description: "Human-readable label for the conversation" },
          UniqueName: { type: "string", description: "Developer-defined unique identifier (alternative addressable key)" },
          MessagingServiceSid: { type: "string", description: "Messaging Service SID (MG...) used for outbound SMS/WhatsApp in this conversation" },
          Attributes: { type: "string", description: "JSON string of custom attributes stored on the conversation" },
        },
      },
    },
    {
      name: "list_conversations",
      description: "List Conversations. Returns a paginated list; pass PageSize to cap.",
      inputSchema: {
        type: "object",
        properties: {
          StartDate: { type: "string", description: "Only include conversations created on/after this ISO-8601 date" },
          EndDate: { type: "string", description: "Only include conversations created on/before this ISO-8601 date" },
          State: { type: "string", enum: ["active", "inactive", "closed"], description: "Filter by conversation state" },
          PageSize: { type: "number", description: "Max rows per page (default 50, max 1000)" },
        },
      },
    },
    {
      name: "add_conversation_participant",
      description: "Add a participant to a Conversation. For SMS / WhatsApp, pass MessagingBinding.Address (+E164 or whatsapp:+E164) + MessagingBinding.ProxyAddress (your Twilio number). For chat participants, pass Identity.",
      inputSchema: {
        type: "object",
        properties: {
          ConversationSid: { type: "string", description: "Conversation SID (CH...) or UniqueName" },
          Identity: { type: "string", description: "Chat identity (use for in-app chat participants)" },
          "MessagingBinding.Address": { type: "string", description: "Participant's address: +E164 for SMS, whatsapp:+E164 for WhatsApp" },
          "MessagingBinding.ProxyAddress": { type: "string", description: "Your Twilio number the participant messages with (E.164 or whatsapp:+E164)" },
          Attributes: { type: "string", description: "JSON string of custom participant attributes" },
        },
        required: ["ConversationSid"],
      },
    },
    {
      name: "send_conversation_message",
      description: "Post a message into a Conversation. Fanned out to all participants via their channel (SMS / WhatsApp / chat).",
      inputSchema: {
        type: "object",
        properties: {
          ConversationSid: { type: "string", description: "Conversation SID (CH...) or UniqueName" },
          Body: { type: "string", description: "Message text (UTF-8)" },
          Author: { type: "string", description: "Identity of the author (defaults to `system` if omitted)" },
          MediaSid: { type: "string", description: "Media SID (ME...) from a prior MCS upload" },
          Attributes: { type: "string", description: "JSON string of custom message attributes" },
        },
        required: ["ConversationSid"],
      },
    },
    {
      name: "list_messaging_services",
      description: "List Messaging Services (MG...). A Messaging Service bundles sender pools, templates, and routing rules.",
      inputSchema: {
        type: "object",
        properties: {
          PageSize: { type: "number", description: "Max rows per page (default 50, max 1000)" },
        },
      },
    },
    {
      name: "execute_studio_flow",
      description: "Trigger a Studio Flow Execution for a contact. Studio flows are visual IVR / workflow builders — this kicks one off for a specific To/From pair.",
      inputSchema: {
        type: "object",
        properties: {
          FlowSid: { type: "string", description: "Studio Flow SID (FW...)" },
          To: { type: "string", description: "Contact address (E.164 or whatsapp:+E164)" },
          From: { type: "string", description: "Your Twilio number (E.164 or whatsapp:+E164)" },
          Parameters: { type: "string", description: "JSON string of variables injected into the flow's execution context" },
        },
        required: ["FlowSid", "To", "From"],
      },
    },
    {
      name: "create_taskrouter_task",
      description: "Create a TaskRouter Task on a Workspace. TaskRouter routes work (calls, chats, tickets) to eligible Workers based on attributes.",
      inputSchema: {
        type: "object",
        properties: {
          WorkspaceSid: { type: "string", description: "TaskRouter Workspace SID (WS...)" },
          Attributes: { type: "string", description: "JSON string of task attributes used for routing (e.g. {\"selected_language\":\"pt-br\"})" },
          WorkflowSid: { type: "string", description: "Workflow SID (WW...) that decides how this task is routed" },
          TaskChannel: { type: "string", description: "Task channel unique_name or SID (e.g. voice, chat, sms, default)" },
          Priority: { type: "number", description: "Priority (higher = more urgent)" },
          Timeout: { type: "number", description: "Seconds before the task times out (default 86400)" },
        },
        required: ["WorkspaceSid"],
      },
    },
    {
      name: "list_taskrouter_workers",
      description: "List Workers on a TaskRouter Workspace. Optionally filter by ActivityName, Available, or TargetWorkersExpression.",
      inputSchema: {
        type: "object",
        properties: {
          WorkspaceSid: { type: "string", description: "TaskRouter Workspace SID (WS...)" },
          ActivityName: { type: "string", description: "Filter by activity name (e.g. Available, Idle, Offline)" },
          Available: { type: "string", description: "Filter by availability: 'true' or 'false'" },
          TargetWorkersExpression: { type: "string", description: "TaskRouter expression to filter workers (e.g. languages HAS \"pt-br\")" },
          PageSize: { type: "number", description: "Max rows per page (default 50, max 1000)" },
        },
        required: ["WorkspaceSid"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "send_message": {
        const body: Record<string, unknown> = {
          To: a.To,
          Body: a.Body,
        };
        if (a.From) body.From = a.From;
        else if (a.MessagingServiceSid) body.MessagingServiceSid = a.MessagingServiceSid;
        else if (DEFAULT_MESSAGING_SERVICE_SID) body.MessagingServiceSid = DEFAULT_MESSAGING_SERVICE_SID;
        if (a.MediaUrl) body.MediaUrl = a.MediaUrl;
        if (a.StatusCallback) body.StatusCallback = a.StatusCallback;
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("POST", "/Messages.json", body), null, 2) }] };
      }
      case "get_message":
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("GET", `/Messages/${a.Sid}.json`), null, 2) }] };
      case "list_messages": {
        const q = buildQuery({
          To: a.To,
          From: a.From,
          DateSent: a.DateSent,
          "DateSent>": a.DateSentAfter,
          "DateSent<": a.DateSentBefore,
          PageSize: a.PageSize,
        });
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("GET", `/Messages.json${q}`), null, 2) }] };
      }
      case "delete_message":
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("DELETE", `/Messages/${a.Sid}.json`), null, 2) }] };
      case "make_call": {
        const body: Record<string, unknown> = {
          To: a.To,
          From: a.From,
          Url: a.Url,
        };
        if (a.Method) body.Method = a.Method;
        if (a.StatusCallback) body.StatusCallback = a.StatusCallback;
        if (a.StatusCallbackEvent) body.StatusCallbackEvent = a.StatusCallbackEvent;
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("POST", "/Calls.json", body), null, 2) }] };
      }
      case "get_call":
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("GET", `/Calls/${a.Sid}.json`), null, 2) }] };
      case "update_call": {
        const body: Record<string, unknown> = {};
        if (a.Status) body.Status = a.Status;
        if (a.Url) body.Url = a.Url;
        if (a.Method) body.Method = a.Method;
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("POST", `/Calls/${a.Sid}.json`, body), null, 2) }] };
      }
      case "start_verification": {
        const body: Record<string, unknown> = {
          To: a.To,
          Channel: a.Channel,
        };
        if (a.Locale) body.Locale = a.Locale;
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("POST", `https://verify.twilio.com/v2/Services/${a.ServiceSid}/Verifications`, body), null, 2) }] };
      }
      case "check_verification": {
        const body: Record<string, unknown> = {
          To: a.To,
          Code: a.Code,
        };
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("POST", `https://verify.twilio.com/v2/Services/${a.ServiceSid}/VerificationCheck`, body), null, 2) }] };
      }
      case "lookup_phone": {
        const q = buildQuery({ Fields: a.Fields, CountryCode: a.CountryCode });
        const number = encodeURIComponent(String(a.PhoneNumber ?? ""));
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("GET", `https://lookups.twilio.com/v2/PhoneNumbers/${number}${q}`), null, 2) }] };
      }
      case "list_incoming_numbers": {
        const q = buildQuery({
          PhoneNumber: a.PhoneNumber,
          FriendlyName: a.FriendlyName,
          PageSize: a.PageSize,
        });
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("GET", `/IncomingPhoneNumbers.json${q}`), null, 2) }] };
      }
      case "buy_phone_number": {
        const body: Record<string, unknown> = {};
        if (a.PhoneNumber) body.PhoneNumber = a.PhoneNumber;
        if (a.AreaCode) body.AreaCode = a.AreaCode;
        if (a.FriendlyName) body.FriendlyName = a.FriendlyName;
        if (a.VoiceUrl) body.VoiceUrl = a.VoiceUrl;
        if (a.SmsUrl) body.SmsUrl = a.SmsUrl;
        if (a.StatusCallback) body.StatusCallback = a.StatusCallback;
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("POST", "/IncomingPhoneNumbers.json", body), null, 2) }] };
      }
      case "list_recordings": {
        const q = buildQuery({
          CallSid: a.CallSid,
          "DateCreated>": a.DateCreatedAfter,
          "DateCreated<": a.DateCreatedBefore,
          PageSize: a.PageSize,
        });
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("GET", `/Recordings.json${q}`), null, 2) }] };
      }
      case "create_verify_service": {
        const body: Record<string, unknown> = { FriendlyName: a.FriendlyName };
        if (a.CodeLength !== undefined) body.CodeLength = a.CodeLength;
        if (a.LookupEnabled !== undefined) body.LookupEnabled = a.LookupEnabled;
        if (a.DefaultTemplateSid) body.DefaultTemplateSid = a.DefaultTemplateSid;
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("POST", "https://verify.twilio.com/v2/Services", body), null, 2) }] };
      }
      case "create_conversation": {
        const body: Record<string, unknown> = {};
        if (a.FriendlyName) body.FriendlyName = a.FriendlyName;
        if (a.UniqueName) body.UniqueName = a.UniqueName;
        if (a.MessagingServiceSid) body.MessagingServiceSid = a.MessagingServiceSid;
        if (a.Attributes) body.Attributes = a.Attributes;
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("POST", "https://conversations.twilio.com/v1/Conversations", body), null, 2) }] };
      }
      case "list_conversations": {
        const q = buildQuery({
          StartDate: a.StartDate,
          EndDate: a.EndDate,
          State: a.State,
          PageSize: a.PageSize,
        });
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("GET", `https://conversations.twilio.com/v1/Conversations${q}`), null, 2) }] };
      }
      case "add_conversation_participant": {
        const body: Record<string, unknown> = {};
        if (a.Identity) body.Identity = a.Identity;
        if (a["MessagingBinding.Address"]) body["MessagingBinding.Address"] = a["MessagingBinding.Address"];
        if (a["MessagingBinding.ProxyAddress"]) body["MessagingBinding.ProxyAddress"] = a["MessagingBinding.ProxyAddress"];
        if (a.Attributes) body.Attributes = a.Attributes;
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("POST", `https://conversations.twilio.com/v1/Conversations/${a.ConversationSid}/Participants`, body), null, 2) }] };
      }
      case "send_conversation_message": {
        const body: Record<string, unknown> = {};
        if (a.Body) body.Body = a.Body;
        if (a.Author) body.Author = a.Author;
        if (a.MediaSid) body.MediaSid = a.MediaSid;
        if (a.Attributes) body.Attributes = a.Attributes;
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("POST", `https://conversations.twilio.com/v1/Conversations/${a.ConversationSid}/Messages`, body), null, 2) }] };
      }
      case "list_messaging_services": {
        const q = buildQuery({ PageSize: a.PageSize });
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("GET", `https://messaging.twilio.com/v1/Services${q}`), null, 2) }] };
      }
      case "execute_studio_flow": {
        const body: Record<string, unknown> = {
          To: a.To,
          From: a.From,
        };
        if (a.Parameters) body.Parameters = a.Parameters;
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("POST", `https://studio.twilio.com/v2/Flows/${a.FlowSid}/Executions`, body), null, 2) }] };
      }
      case "create_taskrouter_task": {
        const body: Record<string, unknown> = {};
        if (a.Attributes) body.Attributes = a.Attributes;
        if (a.WorkflowSid) body.WorkflowSid = a.WorkflowSid;
        if (a.TaskChannel) body.TaskChannel = a.TaskChannel;
        if (a.Priority !== undefined) body.Priority = a.Priority;
        if (a.Timeout !== undefined) body.Timeout = a.Timeout;
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("POST", `https://taskrouter.twilio.com/v1/Workspaces/${a.WorkspaceSid}/Tasks`, body), null, 2) }] };
      }
      case "list_taskrouter_workers": {
        const q = buildQuery({
          ActivityName: a.ActivityName,
          Available: a.Available,
          TargetWorkersExpression: a.TargetWorkersExpression,
          PageSize: a.PageSize,
        });
        return { content: [{ type: "text", text: JSON.stringify(await twilioRequest("GET", `https://taskrouter.twilio.com/v1/Workspaces/${a.WorkspaceSid}/Workers${q}`), null, 2) }] };
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
        const s = new Server({ name: "mcp-twilio", version: "0.2.1" }, { capabilities: { tools: {} } });
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
