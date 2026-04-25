# @codespar/mcp-whatsapp-cloud

MCP server for the [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api) — Meta's official WhatsApp Business API, self-hosted on Meta infrastructure.

**Direct Meta integration.** No middleman, no provider markup. For merchants with an approved WhatsApp Business Account (WABA) who want Meta-direct pricing and full control over conversation, pricing category, and template lifecycle.

## WhatsApp servers in this catalog

| Server | What it is | When to pick it |
|--------|------------|-----------------|
| **whatsapp-cloud** (this) | Direct Meta Cloud API | Large merchants with approved WABA; lower cost at scale, no intermediary fees |
| z-api | Wrapper on top of Meta Cloud | Easy onboarding, instant QR-pair, extra helpers |
| evolution-api | Open-source wrapper | Self-hosted, community-driven |
| take-blip | Brazilian BSP wrapper | Enterprise Brazil, CCaaS features |
| zenvia | Brazilian BSP wrapper | Brazil omnichannel (SMS + WhatsApp) |

## Tools (22)

| Tool | Purpose |
|---|---|
| `send_text_message` | Send a plain text message. |
| `send_template_message` | Send an approved message template. |
| `send_media_message` | Send an image, video, document, or audio. |
| `send_interactive_message` | Send an interactive message (reply buttons or list). |
| `send_interactive_cta_url` | Send an interactive message with a single CTA URL button. |
| `send_interactive_flow` | Send a WhatsApp Flow message. |
| `send_location_message` | Send a location pin with latitude/longitude and optional name/address. |
| `send_contacts_message` | Send one or more contact cards (vCard-like). |
| `send_reaction_message` | Send an emoji reaction on a previously received/sent message. |
| `send_typing_indicator` | Show a typing indicator on a received message. |
| `mark_message_as_read` | Mark an incoming message as read so the sender sees the blue double-check. |
| `upload_media` | Upload a media file and get back a media_id reusable in send_media_message. |
| `retrieve_media_url` | Resolve a media_id to a short-lived downloadable URL. |
| `delete_media` | Delete an uploaded media asset by id. |
| `list_templates` | List message templates on the WhatsApp Business Account. |
| `create_template` | Submit a new template for Meta review. |
| `delete_template` | Delete a message template from the WABA by name. |
| `get_business_profile` | Read the WhatsApp business profile (about, description, email, websites, vertical, address) for the configu... |
| `update_business_profile` | Update the business profile on the configured phone number. |
| `list_phone_numbers` | List all phone numbers registered under the WhatsApp Business Account, including display name, quality rati... |
| `request_verification_code` | Request Meta to send a verification code to the configured phone number via SMS or voice. |
| `verify_code` | Submit the verification code received via SMS/voice after request_verification_code. |

## Install

```bash
npm install @codespar/mcp-whatsapp-cloud
```

## Environment

```bash
WHATSAPP_ACCESS_TOKEN="EAAG..."           # required (secret) — Meta system-user token
WHATSAPP_PHONE_NUMBER_ID="1234567890"     # required — WABA phone number id
WHATSAPP_BUSINESS_ACCOUNT_ID="9876543210" # required — WABA id (for templates)
WHATSAPP_GRAPH_VERSION="v21.0"            # optional — Meta bumps quarterly
```

## Authentication

Bearer token against the Graph API. Use a **permanent system-user token** from Meta Business Manager — user access tokens expire and will break production.

```
Authorization: Bearer <WHATSAPP_ACCESS_TOKEN>
```

## Messaging rules (important)

- **Customer-service window** — You can freely send any message type for 24h after the user last messaged you.
- **Business-initiated** — Outside that window you must send an approved **template**. Use `send_template_message` with a name + language + components.
- **Templates** — Create with `create_template`, wait for Meta approval (minutes to hours), then use.
- Phone numbers are **E.164 without the leading `+`** (e.g. `5511999999999`).

## Media

Two paths:

1. **Public URL** — pass `link` to `send_media_message`. Fastest, but Meta fetches on every send.
2. **Uploaded media_id** — call `upload_media` once, reuse `id` on subsequent sends. Recommended for catalog assets.

Uploaded media expires after ~30 days.

## Interactive messages

`send_interactive_message` expects a fully-formed `interactive` object. Example button payload:

```json
{
  "type": "button",
  "body": { "text": "Confirma seu pedido?" },
  "action": {
    "buttons": [
      { "type": "reply", "reply": { "id": "confirm", "title": "Confirmar" } },
      { "type": "reply", "reply": { "id": "cancel", "title": "Cancelar" } }
    ]
  }
}
```

See the [Cloud API interactive reference](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates) for list payloads.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-whatsapp-cloud

# HTTP (for server-to-server)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-whatsapp-cloud
```

## License

MIT
