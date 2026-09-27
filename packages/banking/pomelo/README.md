# @codespar/mcp-pomelo

> MCP server for **Pomelo** — pan-LATAM card issuing as a service: card-holder users, virtual and physical Visa/Mastercard issuance, lifecycle management, and the transactions feed. Argentina, Brazil, Mexico, Colombia, Peru, Chile.

[![npm](https://img.shields.io/npm/v/@codespar/mcp-pomelo)](https://www.npmjs.com/package/@codespar/mcp-pomelo)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pomelo": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-pomelo"],
      "env": {
        "POMELO_CLIENT_ID": "your-client-id",
        "POMELO_CLIENT_SECRET": "your-client-secret",
        "POMELO_ENV": "sandbox"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add pomelo -- npx @codespar/mcp-pomelo
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "pomelo": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-pomelo"],
      "env": {
        "POMELO_CLIENT_ID": "your-client-id",
        "POMELO_CLIENT_SECRET": "your-client-secret",
        "POMELO_ENV": "sandbox"
      }
    }
  }
}
```

## Environment

| Variable | Required | Description |
|---|---|---|
| `POMELO_CLIENT_ID` | yes | OAuth2 client id |
| `POMELO_CLIENT_SECRET` | yes | OAuth2 client secret |
| `POMELO_ENV` | no | `sandbox` (default) or `production` |
| `POMELO_BASE_URL` | no | API base override (default `https://api-stage.pomelo.la` in sandbox, `https://api.pomelo.la` in production) |
| `POMELO_AUTH_URL` | no | Auth base override; the token call is `{AUTH_URL}/oauth/token` (default: the same host as the API, per Pomelo's docs) |
| `POMELO_AUDIENCE` | no | OAuth2 audience override (defaults per env) |

Authentication is OAuth2 client-credentials; the server exchanges and caches the Bearer token automatically.

## Tools (9)

| Tool | What it does |
|---|---|
| `create_user` | Create a card-holder identity (`POST /users/v1`) |
| `get_user` | Fetch a user by id |
| `update_user` | Patch user fields (status, contact, address) |
| `create_card` | Issue a `VIRTUAL` or `PHYSICAL` card (`POST /cards/v1`) |
| `get_card` | Fetch a card (masked PAN, status, program) |
| `list_cards` | List cards, filterable by user/status |
| `update_card_status` | `ACTIVE` / `BLOCKED` / `DISABLED` lifecycle changes |
| `list_transactions` | Search the card-transactions feed |
| `get_transaction` | Fetch one transaction by id |

Mutating calls carry an `x-idempotency-key` (auto-generated, overridable per call via `idempotency_key`).

## Example

> "Issue a virtual card for the new contractor and freeze the old one."

The agent calls `create_user` (if needed) → `create_card` (`card_type: "VIRTUAL"`) → `update_card_status` (`status: "BLOCKED"`, `status_reason: "CLIENT_INTERNAL_REASON"`).

## Notes

- Card credentials (full PAN/CVV) are never returned by these tools; Pomelo exposes sensitive data only through its PCI-scoped widgets.
- Authorization decisioning (approving each swipe in real time) is a webhook you host, not an API call — pair this server with CodeSpar's governed authorizer if you want mandate checks per transaction.

## Authentication

OAuth2 client-credentials: the server exchanges `POMELO_CLIENT_ID` / `POMELO_CLIENT_SECRET` for a Bearer token at `{AUTH_URL}/oauth/token` and caches it until shortly before expiry. Mutating calls carry an `x-idempotency-key`.

## Enterprise

Need governance, budget limits, and audit trails for agent-driven card issuing on Pomelo? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds a policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
