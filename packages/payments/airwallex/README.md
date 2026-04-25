# @codespar/mcp-airwallex

MCP server for [Airwallex](https://www.airwallex.com) — embedded finance for cross-border collection and payouts.

EBANX lets global platforms collect FROM LatAm and settle to USD. Airwallex is the inverse: LatAm sellers collect FROM abroad (USD, EUR, GBP) into global accounts, convert FX, and pay beneficiaries out across 150+ countries. Together the two servers bracket the cross-border flow both ways.

## Tools (20)

| Tool | Purpose |
|---|---|
| `create_payment_intent` | Create an Airwallex payment intent (pay-in). |
| `confirm_payment_intent` | Confirm a previously-created payment intent with a payment method. |
| `retrieve_payment_intent` | Retrieve a payment intent by id. |
| `cancel_payment_intent` | Cancel a payment intent that has not yet been captured. |
| `capture_payment_intent` | Capture a previously-authorized payment intent (two-step auth + capture flow). |
| `list_payment_intents` | List payment intents with optional filters (status, merchant_order_id, date range). |
| `create_refund` | Refund a captured payment intent (full or partial). |
| `retrieve_refund` | Retrieve a refund by id. |
| `create_customer` | Create an Airwallex customer for saved payment methods and recurring charges. |
| `retrieve_customer` | Retrieve a customer by id. |
| `update_customer` | Update fields on an existing customer (email, phone, address, metadata). |
| `create_beneficiary` | Create a transfer beneficiary (recipient) with bank details. |
| `retrieve_beneficiary` | Retrieve a beneficiary by id. |
| `list_beneficiaries` | List beneficiaries. |
| `create_transfer` | Send a cross-border transfer to a pre-created beneficiary. |
| `retrieve_transfer` | Retrieve a transfer by id. |
| `cancel_transfer` | Cancel a transfer that has not yet settled. |
| `list_transfers` | List transfers with optional filters (status, date range). |
| `create_conversion` | Execute an FX conversion between wallet currencies (e.g. |
| `retrieve_balance` | Retrieve the current wallet balance for every currency the account holds. |

## Install

```bash
npm install @codespar/mcp-airwallex
```

## Environment

```bash
AIRWALLEX_CLIENT_ID="..."   # x-client-id header on /authentication/login
AIRWALLEX_API_KEY="..."     # x-api-key header on /authentication/login (secret)
AIRWALLEX_ENV="demo"        # 'demo' (default) or 'production'
```

Base URLs:
- `demo` → `https://api-demo.airwallex.com/api/v1`
- `production` → `https://api.airwallex.com/api/v1`

## Authentication

Token flow. On first call the server POSTs to `/authentication/login` with headers `x-client-id` and `x-api-key` (no body). Airwallex returns `{ token, expires_at }` (JWT, ~30 min lifetime). The server caches the token in memory and refreshes it 60 seconds before expiry. Every subsequent call sends `Authorization: Bearer <token>`.

## Idempotency

Every `create_*` tool takes a required `request_id` parameter. Airwallex uses this as the idempotency key. The server never auto-generates it — agents must pass a stable UUID per logical operation so retries are safe.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-airwallex

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-airwallex
```

## Positioning vs EBANX

| Flow | Use |
|------|-----|
| Global platform collecting from LatAm buyers, settling to USD | [@codespar/mcp-ebanx](../ebanx) |
| LatAm seller collecting from global buyers in USD/EUR/GBP, settling locally | `@codespar/mcp-airwallex` |

Pair both for bidirectional cross-border coverage.

## License

MIT
