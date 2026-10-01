# @codespar/mcp-coinbase

> MCP server for **Coinbase Advanced Trade** — global crypto exchange with account balances, market data, orders, fills, and transaction summary

[![npm](https://img.shields.io/npm/v/@codespar/mcp-coinbase)](https://www.npmjs.com/package/@codespar/mcp-coinbase)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "coinbase": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-coinbase"],
      "env": {
        "COINBASE_ACCESS_KEY": "your-access-key",
        "COINBASE_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add coinbase -- npx @codespar/mcp-coinbase
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "coinbase": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-coinbase"],
      "env": {
        "COINBASE_ACCESS_KEY": "your-access-key",
        "COINBASE_API_SECRET": "your-api-secret"
      }
    }
  }
}
```

## Tools (13)

| Tool | Purpose |
|---|---|
| `list_accounts` | List authenticated accounts with available + held balances per asset |
| `get_account` | Get a specific account by UUID |
| `list_products` | List tradable products (BTC-USD, ETH-USD, USDC-BRL, etc.) |
| `get_product` | Get a single product's metadata + status |
| `get_best_bid_ask` | Top-of-book bid + ask + size for one or more products |
| `get_market_trades` | Recent trades for slippage estimation |
| `create_order` | Place a market or limit order (idempotent via client_order_id) |
| `list_orders` | List historical orders with status / time / product filters |
| `get_order` | Get full status of a single order including fills |
| `cancel_orders` | Cancel one or more open orders by order_id |
| `list_fills` | List individual fills for fee accounting + reconciliation |
| `get_transaction_summary` | 30-day volume + maker/taker fee tier |
| `list_portfolios` | List portfolios under the authenticated user |

## Authentication

Coinbase Advanced Trade uses HMAC-SHA256 request signing with three headers:

- `CB-ACCESS-KEY` — API key
- `CB-ACCESS-TIMESTAMP` — UNIX timestamp in **seconds** (not milliseconds)
- `CB-ACCESS-SIGN` — hex HMAC-SHA256 of `${ts}${method}${path}${body}` using API secret

Base URL: `https://api.coinbase.com`

> **Legacy HMAC keys only.** This package supports the classic
> `CB-ACCESS-KEY` / `CB-ACCESS-SIGN` flow. Coinbase Cloud / CDP keys
> (JWT-ECDSA) are **not** supported here — a separate `auth_type` is on
> the roadmap. Mint a legacy HMAC key from
> [coinbase.com/settings/api](https://www.coinbase.com/settings/api).

### Get your credentials

1. Go to [coinbase.com/settings/api](https://www.coinbase.com/settings/api)
2. Click **New API Key** and select the legacy (HMAC) option
3. Choose the permissions you need (view, trade, transfer)
4. Copy the access key + secret immediately — the secret is shown only once
5. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `COINBASE_ACCESS_KEY` | Yes | Legacy HMAC API key from the Coinbase dashboard |
| `COINBASE_API_SECRET` | Yes | API secret paired with the access key (HMAC-SHA256) |

## Crypto Exchanges in CodeSpar

Hedge liquidity across global + LATAM crypto venues:

- **Coinbase (this)** — global exchange, deepest USD/USDC liquidity, treasury-grade tooling
- **[Foxbit](../foxbit)** — Brazilian exchange, focus on BTC / ETH / LTC, strong institutional desk
- **[Mercado Bitcoin](../mercado-bitcoin)** — biggest BR exchange, 200+ tokens, deep altcoin coverage
- **[Bitso](../bitso)** — Mexican exchange, MXN / BRL fiat rails, OTC desk

Merchants and traders use multiple venues for best execution and redundancy.

## Roadmap

### v0.2 (planned)
- JWT-ECDSA (Coinbase Cloud / CDP) auth — complement legacy HMAC
- WebSocket market data streams (where MCP transport allows)
- Coinbase Prime endpoints (institutional custody + portfolio management)

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-latam) or [request a tool](https://github.com/codespar/mcp-dev-latam/issues).

## Links

- [Coinbase Website](https://www.coinbase.com)
- [Coinbase Advanced Trade API Documentation](https://docs.cdp.coinbase.com/advanced-trade/docs/welcome)
- [MCP Dev LATAM](https://github.com/codespar/mcp-dev-latam)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
