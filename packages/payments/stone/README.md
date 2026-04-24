# @codespar/mcp-stone

> MCP server for **Stone** — acquiring (card / Pix / boleto), anticipations, receivables, terminals, and open banking

[![npm](https://img.shields.io/npm/v/@codespar/mcp-stone)](https://www.npmjs.com/package/@codespar/mcp-stone)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "stone": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-stone"],
      "env": {
        "STONE_CLIENT_ID": "your-client-id",
        "STONE_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add stone -- npx @codespar/mcp-stone
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "stone": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-stone"],
      "env": {
        "STONE_CLIENT_ID": "your-client-id",
        "STONE_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

## Tools (21)

### Banking — accounts
| Tool | Description |
|------|-------------|
| `get_balance` | Get account balance |
| `list_transactions` | List account transactions |
| `get_statement` | Get account statement for a period |

### Banking — payments & transfers
| Tool | Description |
|------|-------------|
| `create_payment` | Create a payment via Stone |
| `get_payment` | Get payment details by ID |
| `list_payments` | List payments with filters |
| `create_transfer` | Create a bank transfer (internal or external) |
| `create_pix_payment` | Send a Pix payment (outbound) |
| `create_pix_charge` | Create a Pix charge / QR Code (inbound) |
| `create_boleto` | Issue a boleto bancário |

### Acquiring — charges & cards
| Tool | Description |
|------|-------------|
| `create_card_charge` | Charge a credit / debit card |
| `tokenize_card` | Tokenize a card into a PCI-safe token |
| `refund_transaction` | Refund a settled transaction (full or partial) |
| `cancel_transaction` | Cancel an authorized (not-yet-captured) transaction |

### Anticipations & receivables
| Tool | Description |
|------|-------------|
| `create_anticipation` | Anticipate future card receivables (Stone's flagship) |
| `get_anticipation_limits` | Get available / min / max anticipation limits |
| `list_receivables` | Search future receivables |

### Terminals (Stone / TON POS)
| Tool | Description |
|------|-------------|
| `list_terminals` | List physical POS terminals |
| `get_terminal_status` | Get online / offline status for a terminal |

### Webhooks
| Tool | Description |
|------|-------------|
| `register_webhook` | Register a webhook endpoint |
| `list_webhooks` | List registered webhook endpoints |

## Authentication

Stone uses OAuth2 client credentials for authentication. The server automatically manages token refresh.

## Sandbox / Testing

Stone provides a sandbox via the developer portal.

### Get your credentials

1. Go to [Stone Open Bank Documentation](https://docs.openbank.stone.com.br)
2. Register as a developer
3. Create an application to get OAuth2 credentials
4. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STONE_CLIENT_ID` | Yes | OAuth2 client ID |
| `STONE_CLIENT_SECRET` | Yes | OAuth2 client secret |
| `STONE_BASE_URL` | No | Override base URL (default `https://api.openbank.stone.com.br/api/v1`) |

## Roadmap

### v0.3 (planned)
- `list_pix_keys` — List registered Pix keys for a merchant
- `create_recipient` — Marketplace / split recipients
- `create_transfer_batch` — Batch transfer processing
- `get_boleto` — Fetch boleto details
- `create_scheduled_payment` — Schedule future-dated payments
- `list_payouts` — List anticipation / settlement payouts

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Stone Website](https://stone.com.br)
- [Stone Open Bank Documentation](https://docs.openbank.stone.com.br)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
