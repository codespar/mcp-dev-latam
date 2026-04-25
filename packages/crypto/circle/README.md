# @codespar/mcp-circle

> MCP server for **Circle** — USDC stablecoin payments, payouts, transfers, and wallets

[![npm](https://img.shields.io/npm/v/@codespar/mcp-circle)](https://www.npmjs.com/package/@codespar/mcp-circle)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "circle": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-circle"],
      "env": {
        "CIRCLE_API_KEY": "your-key"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add circle -- npx @codespar/mcp-circle
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "circle": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-circle"],
      "env": {
        "CIRCLE_API_KEY": "your-key"
      }
    }
  }
}
```

## Tools (23)

| Tool | Purpose |
|---|---|
| `create_wallet` | Create a new Circle business-account wallet |
| `get_wallet` | Get wallet details by ID |
| `list_wallets` | List all Circle wallets |
| `create_payment` | Accept a USDC payment via Circle |
| `get_payment` | Get payment details by ID |
| `create_payout` | Create a payout from Circle (USDC to fiat) |
| `get_payout` | Get payout details by ID |
| `list_payouts` | List payouts with optional filters |
| `create_transfer` | Create a USDC transfer between Circle wallets (or to blockchain address) |
| `get_transfer` | Get transfer details by ID |
| `list_transfers` | List transfers with optional filters |
| `create_card` | Register card data for on-ramp payments |
| `get_card` | Get card details by ID |
| `list_cards` | List registered cards |
| `list_settlements` | List settlements (card payment batches) |
| `get_settlement` | Get settlement details by ID |
| `list_chargebacks` | List chargebacks |
| `get_chargeback` | Get chargeback details by ID |
| `create_subscription` | Register a notification subscription (webhook) |
| `list_subscriptions` | List notification subscriptions (webhooks) |
| `delete_subscription` | Delete a notification subscription |
| `get_balance` | Get business-account balance |
| `list_transactions` | List transactions with optional filters |

## Authentication

Circle uses a Bearer API key for authentication.

## Sandbox / Testing

Circle provides a sandbox at `api-sandbox.circle.com`. Use a sandbox API key for testing.

### Get your credentials

1. Go to [Circle Developer Portal](https://developers.circle.com)
2. Create a developer account
3. Generate a sandbox API key
4. Set the `CIRCLE_API_KEY` environment variable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CIRCLE_API_KEY` | Yes | API key from Circle |

## Roadmap

### v0.2 (planned)
- `create_card_payment` — Create a card payment
- `create_wire_payment` — Create a wire transfer payment
- `create_ach_payment` — Create an ACH payment
- `get_settlement` — Get settlement details
- `list_settlements` — List settlements with filters

### v0.3 (planned)
- `smart_contract_calls` — Execute smart contract calls
- `cross_chain_transfers` — Transfer assets across blockchains

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Circle Website](https://circle.com)
- [Circle API Documentation](https://developers.circle.com)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
