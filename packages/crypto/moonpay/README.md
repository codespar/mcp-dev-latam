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

## Tools (20)

| Tool | Purpose |
|---|---|
| `get_buy_quote` | Preview a fiat -> crypto buy quote in real time. |
| `create_buy_transaction` | Create a buy transaction (fiat -> crypto). |
| `get_buy_transaction` | Retrieve a buy transaction (fiat -> crypto) by its MoonPay id. |
| `list_buy_transactions` | List buy transactions with optional filters. |
| `get_sell_quote` | Preview a crypto -> fiat sell quote in real time. |
| `create_sell_transaction` | Create a sell transaction (crypto -> fiat). |
| `get_sell_transaction` | Retrieve a sell transaction (crypto -> fiat) by its MoonPay id. |
| `refund_sell_transaction` | Request a refund on an off-ramp (sell) transaction. |
| `create_customer` | Create a MoonPay customer (KYC'd end user). |
| `get_customer` | Retrieve a MoonPay customer by id. |
| `get_customer_kyc_status` | Fetch KYC verification status (and any pending document requirements) for a MoonPay customer. |
| `list_customer_transactions` | List all transactions (buy + sell) tied to a single MoonPay customer. |
| `get_transaction_receipt` | Fetch a tax-/audit-grade receipt for a completed buy or sell transaction. |
| `list_currencies` | List supported currencies (fiat + crypto). |
| `get_currency` | Retrieve metadata for a single currency (fiat or crypto) by its MoonPay code. |
| `list_countries` | List countries supported by MoonPay along with which flows (buy / sell / NFT) are allowed per geography. |
| `list_payment_methods` | List payment methods supported for a given fiat currency / country combination (e.g. |
| `get_user_country` | Resolve the caller's (or a given IP's) country via MoonPay's IP-address geolocation endpoint. |
| `sign_buy_url` | Build and HMAC-SHA256 sign a MoonPay buy widget URL (buy.moonpay.com). |
| `sign_sell_url` | Build and HMAC-SHA256 sign a MoonPay sell widget URL (sell.moonpay.com). |

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
