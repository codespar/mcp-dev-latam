# @codespar/mcp-z-api

> MCP server for **Z-API** — WhatsApp messaging platform

[![npm](https://img.shields.io/npm/v/@codespar/mcp-z-api)](https://www.npmjs.com/package/@codespar/mcp-z-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "z-api": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-z-api"],
      "env": {
        "ZAPI_INSTANCE_ID": "your-instance-id",
        "ZAPI_TOKEN": "your-token"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add z-api -- npx @codespar/mcp-z-api
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "z-api": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-z-api"],
      "env": {
        "ZAPI_INSTANCE_ID": "your-instance-id",
        "ZAPI_TOKEN": "your-token"
      }
    }
  }
}
```

## Tools (27)

| Tool | Purpose |
|---|---|
| `send_text` | Send a text message via WhatsApp |
| `send_image` | Send an image message via WhatsApp |
| `send_document` | Send a document via WhatsApp |
| `send_audio` | Send an audio message via WhatsApp |
| `get_contacts` | Get all WhatsApp contacts |
| `check_number` | Check if a phone number has WhatsApp |
| `get_profile_picture` | Get profile picture URL for a phone number |
| `get_messages` | Get messages for a phone number |
| `send_button_list` | Send a button list message via WhatsApp |
| `get_status` | Get WhatsApp instance connection status |
| `create_group` | Create a WhatsApp group |
| `get_group_metadata` | Get group metadata and participants |
| `add_group_participant` | Add a participant to a WhatsApp group |
| `remove_group_participant` | Remove a participant from a WhatsApp group |
| `send_location` | Send a location message via WhatsApp |
| `send_contact` | Send a contact card via WhatsApp |
| `add_label` | Assign a label/tag to a chat |
| `get_labels` | List all available labels/tags |
| `read_message` | Mark messages as read |
| `delete_message` | Delete a message |
| `get_contact_metadata` | Get metadata (name, WhatsApp display name, profile picture, status) for a single contact |
| `add_contacts` | Add one or more contacts to the WhatsApp address book. |
| `list_chats` | List all WhatsApp chats with pagination |
| `mark_chat_as_read` | Mark an entire chat as read or unread |
| `list_groups` | List all WhatsApp groups with pagination |
| `send_option_list` | Send an interactive option list (WhatsApp native list). |
| `send_button_actions` | Send interactive action buttons (CALL, URL, REPLY). |

## Authentication

Z-API uses instance ID and token embedded in the request URL.

## Sandbox / Testing

Z-API offers a free trial for testing. Create an account to get started.

### Get your credentials

1. Go to [Z-API Developer Portal](https://developer.z-api.io)
2. Create an account and start a free trial
3. Get your instance ID and token
4. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ZAPI_INSTANCE_ID` | Yes | Z-API instance ID |
| `ZAPI_TOKEN` | Yes | Z-API instance token |

## Roadmap

### v0.2 (planned)
- `send_sticker` — Send a sticker message via WhatsApp
- `send_reaction` — Send a reaction to a message
- `get_chat_history` — Get full chat history with a contact
- `update_group_settings` — Update group name, description, settings
- `leave_group` — Leave a WhatsApp group

### v0.3 (planned)
- `bulk_messaging` — Send messages to multiple contacts
- `template_management` — Create and manage message templates
- `catalog_products` — Manage WhatsApp Business catalog products

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Z-API Website](https://z-api.io)
- [Z-API Developer Documentation](https://developer.z-api.io)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
