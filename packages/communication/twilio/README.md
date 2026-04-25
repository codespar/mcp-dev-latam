# @codespar/mcp-twilio

MCP server for [Twilio](https://www.twilio.com) — the global standard for programmable messaging and voice.

SMS, WhatsApp, and Voice across 180+ countries. Verify (2FA) and Lookup (phone validation) included. Fills the global messaging gap in a catalog otherwise tilted to Brazil-specific providers (Z-API, Take Blip, Zenvia, Evolution API).

## Tools (22)

| Tool | Purpose |
|---|---|
| `send_message` | Send an SMS or WhatsApp message. |
| `get_message` | Retrieve a message resource by SID (SM... |
| `list_messages` | List messages with optional filters. |
| `delete_message` | Delete a message from history. |
| `make_call` | Place an outbound voice call. |
| `get_call` | Retrieve a call resource by SID (CA...). |
| `update_call` | Modify an in-progress call. |
| `start_verification` | Start a Verify (2FA) challenge. |
| `check_verification` | Check a Verify (2FA) code against a Service SID. |
| `lookup_phone` | Validate and normalize a phone number via Lookups v2. |
| `list_incoming_numbers` | List Twilio-provisioned phone numbers on this account. |
| `buy_phone_number` | Provision a new phone number. |
| `list_recordings` | List call recordings on this account. |
| `create_verify_service` | Create a Verify Service (VA...). |
| `create_conversation` | Create a Twilio Conversation. |
| `list_conversations` | List Conversations. |
| `add_conversation_participant` | Add a participant to a Conversation. |
| `send_conversation_message` | Post a message into a Conversation. |
| `list_messaging_services` | List Messaging Services (MG...). |
| `execute_studio_flow` | Trigger a Studio Flow Execution for a contact. |
| `create_taskrouter_task` | Create a TaskRouter Task on a Workspace. |
| `list_taskrouter_workers` | List Workers on a TaskRouter Workspace. |

## Install

```bash
npm install @codespar/mcp-twilio
```

## Environment

```bash
TWILIO_ACCOUNT_SID="AC..."             # required
TWILIO_AUTH_TOKEN="..."                # required (secret)
TWILIO_MESSAGING_SERVICE_SID="MG..."   # optional; default sender for send_message
```

## Authentication

HTTP Basic auth with `AccountSid:AuthToken`. The server handles this automatically — you only configure the env vars.

```
Authorization: Basic <base64(AccountSid:AuthToken)>
```

## API surface

- Main Accounts API: `https://api.twilio.com/2010-04-01/Accounts/{AccountSid}` — Messages, Calls, IncomingPhoneNumbers
- Verify API: `https://verify.twilio.com/v2` — 2FA flows (requires a Verify Service SID passed per call)
- Lookups API: `https://lookups.twilio.com/v2` — phone number validation / carrier / line type

Request bodies are `application/x-www-form-urlencoded`; responses are JSON (endpoints use the `.json` suffix on the Accounts API).

## WhatsApp

Use the same `send_message` tool, but prefix numbers with `whatsapp:`:

```json
{ "To": "whatsapp:+5511999999999", "From": "whatsapp:+14155238886", "Body": "Olá" }
```

Sandbox numbers or approved WhatsApp-enabled senders work the same way.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-twilio

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-twilio
```

## License

MIT
