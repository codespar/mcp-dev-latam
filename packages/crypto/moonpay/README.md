# @codespar/mcp-moonpay

MCP server for [MoonPay](https://moonpay.com) — fiat-to-crypto on/off-ramp.

MoonPay spans 100+ crypto assets and many geographies, with both buy (fiat → crypto) and sell (crypto → fiat) flows. Pix is supported as a Brazil onramp rail.

## Positioning vs the rest of the catalog

| Server | Coverage | Direction |
|--------|----------|-----------|
| `@codespar/mcp-unblockpay` | BRL / MXN ↔ USDC | Onramp + offramp, stablecoin only |
| `@codespar/mcp-moonpay` | 100+ crypto assets, multi-geo, Pix for BR | Onramp + offramp |
| `@codespar/mcp-mercado-bitcoin`, `@codespar/mcp-bitso` | Exchange order books | Trade |
| `@codespar/mcp-circle` | USDC native rails | Stablecoin infra |

Use MoonPay when an agent needs broader crypto coverage (beyond USDC), longer-tail geographies, or a sell-side flow that pays out to local fiat.

## Tools

| Tool | Purpose |
|------|---------|
| `get_buy_quote` | Preview a fiat → crypto quote before committing |
| `create_buy_transaction` | Create a buy transaction (fiat → crypto) |
| `get_buy_transaction` | Retrieve a buy transaction by id |
| `list_buy_transactions` | List buy transactions with filters |
| `get_sell_quote` | Preview a crypto → fiat quote |
| `create_sell_transaction` | Create a sell transaction (crypto → fiat) |
| `get_sell_transaction` | Retrieve a sell transaction by id |
| `create_customer` | Create a KYC'd end user |
| `get_customer` | Retrieve a customer by id |
| `list_currencies` | List supported fiat + crypto assets (dynamic discovery) |

## Install

```bash
npm install @codespar/mcp-moonpay
```

## Environment

```bash
MOONPAY_API_KEY="..."     # API key (sandbox or production — the key selects the environment)
MOONPAY_BASE_URL="..."    # Optional. Defaults to https://api.moonpay.com.
```

## Authentication

Every request uses a simple header:

```
Authorization: Api-Key <MOONPAY_API_KEY>
```

Sandbox vs production is selected by the key itself — the base URL stays the same.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-moonpay

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-moonpay
```

## License

MIT
