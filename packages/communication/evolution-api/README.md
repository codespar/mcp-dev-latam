# @codespar/mcp-evolution-api

> MCP server for **Evolution API** — self-hosted WhatsApp messaging API

[![npm](https://img.shields.io/npm/v/@codespar/mcp-evolution-api)](https://www.npmjs.com/package/@codespar/mcp-evolution-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "evolution-api": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-evolution-api"],
      "env": {
        "EVOLUTION_API_URL": "https://your-instance.example.com",
        "EVOLUTION_API_KEY": "your-key"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add evolution-api -- npx @codespar/mcp-evolution-api
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "evolution-api": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-evolution-api"],
      "env": {
        "EVOLUTION_API_URL": "https://your-instance.example.com",
        "EVOLUTION_API_KEY": "your-key"
      }
    }
  }
}
```

## Tools (25)

| Tool | Purpose |
|---|---|
| `send_text` | Send a text message via WhatsApp |
| `send_image` | Send an image message via WhatsApp |
| `send_document` | Send a document via WhatsApp |
| `get_instances` | List all WhatsApp instances |
| `create_instance` | Create a new WhatsApp instance |
| `get_qrcode` | Get QR code for instance pairing |
| `get_contacts` | Get contacts from an instance |
| `send_poll` | Send a poll message via WhatsApp |
| `get_messages` | Get messages from a chat |
| `check_number` | Check if a phone number is registered on WhatsApp |
| `create_group` | Create a WhatsApp group |
| `get_group_info` | Get group metadata, participants, and settings |
| `update_profile` | Update instance profile (name, status text, or picture) |
| `set_presence` | Set online/offline presence for an instance |
| `get_chat_history` | Get full chat history with pagination support |
| `logout_instance` | Logout an instance (disconnects the WhatsApp session without deleting the instance) |
| `restart_instance` | Restart an instance |
| `delete_instance` | Delete an instance permanently |
| `connection_state` | Get the connection state of an instance (open, connecting, close) |
| `leave_group` | Leave a WhatsApp group |
| `update_group_participants` | Add, remove, promote, or demote participants in a WhatsApp group |
| `fetch_group_invite_code` | Fetch the invite code/link for a WhatsApp group |
| `mark_message_as_read` | Mark one or more messages in a chat as read |
| `archive_chat` | Archive or unarchive a chat |
| `delete_message` | Delete a message for me or for everyone in a chat |

## Authentication

Evolution API uses an API key passed via the `apikey` header.

## Sandbox / Testing

Evolution API is self-hosted. Deploy your own instance using Docker for testing.

### Get your credentials

1. Go to [Evolution API Documentation](https://doc.evolution-api.com)
2. Deploy your own instance (Docker recommended)
3. Get the API key from your instance configuration
4. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EVOLUTION_API_URL` | Yes | Base URL of your Evolution API instance |
| `EVOLUTION_API_KEY` | Yes | API key for authentication |

## Roadmap

### v0.2 (planned)
- `create_group` — Create a WhatsApp group
- `get_group_info` — Get group details and participants
- `update_profile` — Update instance profile (name, photo, status)
- `set_presence` — Set online/offline presence status
- `get_chat_history` — Get full chat history with a contact

### v0.3 (planned)
- `bulk_send` — Send messages to multiple contacts
- `template_messages` — Send WhatsApp Business template messages
- `label_management` — Create, update, and assign labels to chats

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Evolution API Documentation](https://doc.evolution-api.com)
- [Evolution API GitHub](https://github.com/EvolutionAPI/evolution-api)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
