# @codespar/mcp-rd-station

> MCP server for **RD Station** — marketing automation and CRM

[![npm](https://img.shields.io/npm/v/@codespar/mcp-rd-station)](https://www.npmjs.com/package/@codespar/mcp-rd-station)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rd-station": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-rd-station"],
      "env": {
        "RD_STATION_TOKEN": "your-token"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add rd-station -- npx @codespar/mcp-rd-station
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "rd-station": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-rd-station"],
      "env": {
        "RD_STATION_TOKEN": "your-token"
      }
    }
  }
}
```

## Tools (18)

| Tool | Purpose |
|---|---|
| `create_contact` | Create a contact in RD Station CRM |
| `update_contact` | Update a contact by UUID |
| `upsert_contact` | Upsert (create or update) a contact identified by email (Marketing API) |
| `get_contact` | Get contact details by UUID or email |
| `list_contacts` | List contacts with pagination |
| `delete_contact` | Delete a contact by UUID |
| `create_event` | Create a conversion event for a contact |
| `list_funnels` | List all sales funnels |
| `get_funnel` | Get funnel details with stages |
| `list_deal_stages` | List deal stages of a pipeline (funnel) |
| `create_opportunity` | Create a sales opportunity in a funnel |
| `update_deal` | Update a deal/opportunity by ID |
| `get_deal` | Get a deal/opportunity by ID |
| `list_deals` | List deals with optional filters and pagination |
| `list_segmentations` | List contact segmentations |
| `get_segmentation_contacts` | List contacts inside a given segmentation |
| `update_lead_scoring` | Mark a contact as lead, qualified lead, or opportunity (lead scoring) |
| `create_webhook` | Subscribe a webhook to RD Station events (WEBHOOK.CONVERTED / WEBHOOK.MARKED_OPPORTUNITY) |

## Authentication

RD Station uses a Bearer token for authentication.

## Sandbox / Testing

RD Station provides an OAuth sandbox for testing. Use sandbox credentials during development.

### Get your credentials

1. Go to [RD Station Developer Portal](https://developers.rdstation.com)
2. Create a developer account
3. Register an OAuth application and obtain a token
4. Set the `RD_STATION_TOKEN` environment variable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `RD_STATION_TOKEN` | Yes | Bearer token from RD Station |

## Roadmap

### v0.2 (planned)
- `list_deals` — List deals in the CRM pipeline
- `create_deal` — Create a new deal
- `update_deal` — Update deal details or stage
- `list_activities` — List activities for a contact or deal
- `create_task` — Create a task assigned to a user

### v0.3 (planned)
- `custom_fields` — Manage custom fields for contacts and deals
- `automation_triggers` — Trigger marketing automation flows

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [RD Station Website](https://rdstation.com)
- [RD Station API Documentation](https://developers.rdstation.com)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
