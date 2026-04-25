# @codespar/mcp-bitso

> MCP server for **Bitso** — Latin American cryptocurrency exchange with trading, orders, and withdrawals

[![npm](https://img.shields.io/npm/v/@codespar/mcp-bitso)](https://www.npmjs.com/package/@codespar/mcp-bitso)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bitso": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-bitso"],
      "env": {
        "BITSO_API_KEY": "your-key",
        "BITSO_API_SECRET": "your-secret"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add bitso -- npx @codespar/mcp-bitso
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "bitso": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-bitso"],
      "env": {
        "BITSO_API_KEY": "your-key",
        "BITSO_API_SECRET": "your-secret"
      }
    }
  }
}
```

## Tools (20)

| Tool | Purpose |
|---|---|
| `get_ticker` | Get ticker data for a trading pair (price, volume, VWAP, etc.) |
| `list_orderbook` | Get order book (bids and asks) for a trading pair |
| `create_order` | Create a buy or sell order |
| `get_order` | Get order details by ID |
| `cancel_order` | Cancel an open order |
| `list_orders` | List orders with optional filters |
| `get_balances` | Get account balances for all assets |
| `list_trades` | List executed trades for an order book |
| `list_funding_sources` | List available funding sources (bank accounts, etc.) |
| `create_withdrawal` | Create a withdrawal request (crypto or fiat) |
| `list_ledger` | List account ledger entries (trades, fees, fundings, withdrawals) |
| `list_open_orders` | List currently open orders for the authenticated user |
| `lookup_order` | Look up one or more orders by origin_id (client_id) |
| `cancel_all_orders` | Cancel all open orders for the authenticated user |
| `list_fundings` | List account fundings (deposits) |
| `list_withdrawals` | List account withdrawals |
| `get_withdrawal` | Retrieve a specific withdrawal by its ID |
| `list_fees` | List applicable fees for the authenticated user across trading pairs |
| `get_account_status` | Retrieve account KYC and verification status (tier, limits, required docs) |
| `list_funding_destinations` | Get funding destination details (address/CLABE) for a given currency |

## Authentication

Bitso uses HMAC-SHA256 signed requests with an API key and secret.

## Sandbox / Testing

Bitso provides a developer sandbox via the developer account.

### Get your credentials

1. Go to [Bitso](https://bitso.com)
2. Create an account
3. Navigate to API settings and generate key and secret
4. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BITSO_API_KEY` | Yes | API key from Bitso |
| `BITSO_API_SECRET` | Yes | API secret for HMAC signature |

## Roadmap

### v0.2 (planned)
- `get_account_status` — Get account verification status
- `list_currencies` — List available cryptocurrencies
- `create_spei_withdrawal` — Create a SPEI (Mexican bank) withdrawal
- `get_phone_number` — Get phone number associated with account
- `list_open_orders` — List all open orders

### v0.3 (planned)
- `recurring_orders` — Create and manage recurring buy/sell orders
- `advanced_orders` — Advanced order types (OCO, trailing stop)

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Bitso Website](https://bitso.com)
- [Bitso API Documentation](https://bitso.com/developers)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
