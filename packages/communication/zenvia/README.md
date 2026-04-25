# @codespar/mcp-zenvia

> MCP server for **Zenvia** — multichannel messaging (SMS, WhatsApp, RCS)

[![npm](https://img.shields.io/npm/v/@codespar/mcp-zenvia)](https://www.npmjs.com/package/@codespar/mcp-zenvia)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zenvia": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-zenvia"],
      "env": {
        "ZENVIA_API_TOKEN": "your-token"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add zenvia -- npx @codespar/mcp-zenvia
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "zenvia": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-zenvia"],
      "env": {
        "ZENVIA_API_TOKEN": "your-token"
      }
    }
  }
}
```

## Tools (18)

| Tool | Purpose |
|---|---|
| `send_sms` | Send an SMS message |
| `send_whatsapp` | Send a WhatsApp message |
| `send_rcs` | Send an RCS (Rich Communication Services) message |
| `send_email` | Send a transactional email |
| `send_voice` | Send a voice message via TTS or pre-recorded audio URL |
| `send_facebook_message` | Send a Facebook Messenger message |
| `get_message_status` | Get message delivery status by ID |
| `list_channels` | List available messaging channels |
| `create_subscription` | Create a webhook subscription for message events |
| `list_subscriptions` | List all webhook subscriptions |
| `delete_subscription` | Delete a webhook subscription by ID |
| `list_contacts` | List contacts from the contact base |
| `create_contact` | Create a contact in the contact base |
| `delete_contact` | Delete a contact by ID |
| `send_template` | Send a WhatsApp template message (pre-approved) |
| `list_templates` | List approved message templates (WhatsApp/SMS/RCS) |
| `get_report_entries` | Get message report entries within a date range |
| `add_opt_out` | Add a phone number to the opt-out list (suppresses future messages) |

## Authentication

Zenvia uses an API token passed via the `X-API-TOKEN` header.

## Sandbox / Testing

Zenvia provides a sandbox via the dashboard for testing messages.

### Get your credentials

1. Go to [Zenvia](https://app.zenvia.com)
2. Create an account
3. Get your API token from the dashboard
4. Set the `ZENVIA_API_TOKEN` environment variable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ZENVIA_API_TOKEN` | Yes | API token from Zenvia dashboard |

## Roadmap

### v0.2 (planned)
- `create_contact_list` — Create a contact list for campaigns
- `send_batch` — Send batch messages to a contact list
- `get_report` — Get message delivery reports
- `create_flow` — Create a conversational flow
- `list_templates` — List approved message templates

### v0.3 (planned)
- `chatbot_integration` — Integrate with Zenvia chatbot builder
- `analytics_dashboard` — Get channel analytics and metrics

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Zenvia Website](https://zenvia.com)
- [Zenvia API Documentation](https://zenvia.github.io/zenvia-openapi-spec)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
