# @codespar/mcp-foxbit

> MCP server for **Foxbit** — Brazilian cryptocurrency exchange with trading, orderbook, and market data

[![npm](https://img.shields.io/npm/v/@codespar/mcp-foxbit)](https://www.npmjs.com/package/@codespar/mcp-foxbit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "foxbit": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-foxbit"],
      "env": {
        "FOXBIT_API_KEY": "your-key",
        "FOXBIT_API_SECRET": "your-secret"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add foxbit -- npx @codespar/mcp-foxbit
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "foxbit": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-foxbit"],
      "env": {
        "FOXBIT_API_KEY": "your-key",
        "FOXBIT_API_SECRET": "your-secret"
      }
    }
  }
}
```

## Tools (21)

| Tool | Purpose |
|---|---|
| `list_markets` | List all available trading pairs / markets on Foxbit |
| `list_currencies` | List all supported currencies (crypto and fiat) on Foxbit |
| `get_currency` | Get details of a specific currency (precision, min/max amounts, type) |
| `get_ticker` | Get 24h ticker data for a market (price, volume, high/low) |
| `get_orderbook` | Get order book (bids and asks) for a market |
| `get_market_trades` | Get recent public trades for a market (trade history / tape) |
| `get_candles` | Get OHLC candlestick data for a market |
| `get_account_balances` | Get account balances for all currencies |
| `get_balance` | Get account balance for a single currency |
| `create_order` | Create a buy or sell order (limit or market) |
| `get_order` | Get order details by ID |
| `list_orders` | List orders with optional filters |
| `cancel_order` | Cancel an open order by ID |
| `list_trades` | List user's executed trades (private trade history) |
| `list_deposits_withdrawals` | List deposits and withdrawals (transactions) for a currency |
| `create_pix_deposit` | Create a Pix instant deposit (BRL). |
| `list_pix_deposits` | List Pix deposit history (BRL instant deposits) |
| `create_pix_withdrawal` | Create a Pix withdrawal (BRL) to a Pix key |
| `list_pix_withdrawals` | List Pix withdrawal history (BRL fiat withdrawals) |
| `create_crypto_withdrawal` | Create a crypto withdrawal to an external wallet address |
| `get_trading_fees` | Get current trading fees and limits (maker/taker per pair, withdrawal limits) |

## Authentication

Foxbit uses HMAC-SHA256 request signing. Each request includes three headers:

- `X-FB-ACCESS-KEY` — API key
- `X-FB-ACCESS-TIMESTAMP` — UNIX timestamp in milliseconds
- `X-FB-ACCESS-SIGNATURE` — hex HMAC-SHA256 of `timestamp + method + path + queryString + body` using API secret

Base URL: `https://api.foxbit.com.br/rest/v3`

### Get your credentials

1. Go to [Foxbit](https://app.foxbit.com.br)
2. Create an account (KYC required for Brazilian residents)
3. Navigate to API settings to generate key and secret
4. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FOXBIT_API_KEY` | Yes | API key from Foxbit |
| `FOXBIT_API_SECRET` | Yes | API secret for HMAC-SHA256 |

## Brazilian Crypto Exchanges in CodeSpar

Hedge liquidity across multiple BR venues:

- **[Mercado Bitcoin](../mercado-bitcoin)** — biggest BR exchange, 200+ tokens, deep altcoin coverage
- **Foxbit (this)** — 2nd BR exchange, focus on BTC / ETH / LTC, strong institutional desk

Merchants and traders use both for best execution and redundancy.

## Roadmap

### v0.2 (planned)
- `get_candles` — OHLCV candlestick data
- `create_withdrawal` — Initiate crypto/PIX withdrawal
- `list_currencies` — Available currencies and networks
- `get_fees` — Trading fees for account tier
- `create_stop_order` — Stop-limit / stop-market orders

### v0.3 (planned)
- Institutional / OTC desk integrations
- WebSocket market data streams (where MCP transport allows)

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Foxbit Website](https://foxbit.com.br)
- [Foxbit API Documentation](https://docs.foxbit.com.br)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
