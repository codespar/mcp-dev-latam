# @codespar/mcp-sendgrid

MCP server for [SendGrid](https://sendgrid.com) — global transactional and marketing email.

SendGrid is Twilio-owned (acquired 2019). Together with [`@codespar/mcp-twilio`](../twilio) this package closes the messaging loop:

- **Twilio** — SMS, WhatsApp, Voice, Verify
- **SendGrid** — email (transactional + marketing)

Agents building commerce notification flows — order confirmations, shipping updates, abandoned-cart nudges, promos — can now cover every channel through two packages.

## Tools (20)

| Tool | Purpose |
|---|---|
| `send_mail` | Send an email via POST /mail/send. |
| `send_template` | Convenience wrapper for POST /mail/send with a dynamic template. |
| `add_contact` | Upsert contacts in Marketing Campaigns via PUT /marketing/contacts. |
| `list_contacts` | List Marketing Campaigns contacts via GET /marketing/contacts. |
| `delete_contact` | Delete contacts by id via DELETE /marketing/contacts?ids=.... |
| `search_contacts` | Search contacts with an SGQL query via POST /marketing/contacts/search. |
| `get_contact` | Retrieve a single Marketing Campaigns contact by id via GET /marketing/contacts/{id}. |
| `list_lists` | List all Marketing Campaigns contact lists via GET /marketing/lists. |
| `create_list` | Create a Marketing Campaigns contact list via POST /marketing/lists. |
| `delete_list` | Delete a Marketing Campaigns contact list via DELETE /marketing/lists/{id}. |
| `list_templates` | List transactional templates via GET /templates. |
| `create_template` | Create a transactional template via POST /templates. |
| `list_suppressions` | List all suppressed recipients for an unsubscribe group via GET /asm/groups/{group_id}/suppressions. |
| `add_suppression` | Add recipients to a suppression group via POST /asm/groups/{group_id}/suppressions. |
| `list_unsubscribe_groups` | List all unsubscribe groups on the account via GET /asm/groups. |
| `get_bounces` | Retrieve bounced recipients via GET /suppression/bounces. |
| `delete_bounce` | Remove a bounced address from the bounce suppression list via DELETE /suppression/bounces/{email}. |
| `cancel_scheduled_send` | Cancel or pause a scheduled send by batch_id via POST /user/scheduled_sends. |
| `get_event_webhook_settings` | Retrieve the Event Webhook configuration via GET /user/webhooks/event/settings. |
| `get_stats` | Global email stats via GET /stats. |

## Install

```bash
npm install @codespar/mcp-sendgrid
```

## Environment

```bash
SENDGRID_API_KEY="SG...."         # required (secret)
SENDGRID_FROM_EMAIL="no-reply@yourdomain.com"   # optional default sender
```

The `SENDGRID_FROM_EMAIL` must be either a Verified Sender or belong to an authenticated domain.

## Authentication

Bearer-token auth. The server handles this automatically.

```
Authorization: Bearer <SENDGRID_API_KEY>
```

## API surface

- Base URL: `https://api.sendgrid.com/v3`
- All requests/responses are `application/json`
- `POST /mail/send` returns `202 Accepted` on success (no body)

## Send with a dynamic template

```json
{
  "to": "buyer@example.com",
  "template_id": "d-abc123...",
  "dynamic_template_data": {
    "order_id": "1001",
    "total_brl": "R$ 249,90",
    "tracking_url": "https://example.com/track/1001"
  }
}
```

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-sendgrid

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-sendgrid
```

## Pairs with

- [`@codespar/mcp-twilio`](../twilio) — SMS, WhatsApp, Voice, Verify, Lookup

## License

MIT
