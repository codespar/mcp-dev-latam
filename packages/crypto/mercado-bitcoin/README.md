# @codespar/mcp-mercado-bitcoin

> MCP server for **Mercado Bitcoin** — Brazilian cryptocurrency exchange with trading, orders, and market data

[![npm](https://img.shields.io/npm/v/@codespar/mcp-mercado-bitcoin)](https://www.npmjs.com/package/@codespar/mcp-mercado-bitcoin)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mercado-bitcoin": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-mercado-bitcoin"],
      "env": {
        "MB_API_KEY": "your-key",
        "MB_API_SECRET": "your-secret"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add mercado-bitcoin -- npx @codespar/mcp-mercado-bitcoin
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "mercado-bitcoin": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-mercado-bitcoin"],
      "env": {
        "MB_API_KEY": "your-key",
        "MB_API_SECRET": "your-secret"
      }
    }
  }
}
```

## Tools (20)

| Tool | Purpose |
|---|---|
| `get_ticker` | Get ticker data for a trading pair (price, volume, etc.) |
| `list_orderbook` | Get order book (bids and asks) for a trading pair |
| `create_order` | Create a buy or sell order |
| `get_order` | Get order details by ID |
| `cancel_order` | Cancel an open order |
| `list_orders` | List orders with optional filters |
| `get_balance` | Get account balances for all assets |
| `list_trades` | List executed trades for a trading pair |
| `get_candles` | Get candlestick/OHLCV data for a trading pair |
| `withdraw` | Create a withdrawal request |
| `cancel_all_orders` | Cancel all open orders for a symbol |
| `list_account_trades` | List authenticated account fills/trades for a symbol |
| `list_deposits` | List deposits (crypto + fiat) for the authenticated account |
| `list_withdrawals` | List withdrawals (crypto + fiat) for the authenticated account |
| `get_withdrawal` | Get withdrawal details by ID |
| `list_symbols` | List available trading symbols (pairs) on the exchange |
| `list_assets` | List supported assets/coins on the exchange |
| `list_networks` | List supported blockchain networks for a given asset |
| `get_fees` | Query trading fees (maker/taker) for a symbol |
| `list_positions` | List open margin/futures positions (if applicable to the account) |

## Authentication

Mercado Bitcoin uses an API key and secret passed via request headers.

## Sandbox / Testing

Mercado Bitcoin provides a sandbox via the dashboard for testing.

### Get your credentials

1. Go to [Mercado Bitcoin](https://www.mercadobitcoin.com.br)
2. Create an account
3. Navigate to API settings to generate key and secret
4. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MB_API_KEY` | Yes | API key from Mercado Bitcoin |
| `MB_API_SECRET` | Yes | API secret from Mercado Bitcoin |

## Roadmap

### v0.2 (planned)
- `get_account_info` — Get account information and limits
- `list_currencies` — List available cryptocurrencies
- `get_order_history` — Get order history with filters
- `create_stop_order` — Create a stop-limit order
- `get_fees` — Get trading fees for an account

### v0.3 (planned)
- `margin_trading` — Margin trading operations
- `lending` — Crypto lending operations

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Mercado Bitcoin Website](https://www.mercadobitcoin.com.br)
- [Mercado Bitcoin API Documentation](https://api.mercadobitcoin.net/api/v4/docs)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
