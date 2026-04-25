# MCP Nubank


> **Alpha release** — published under the `alpha` npm dist-tag. Endpoint paths follow public docs and BACEN/provider conventions but have not been fully live-validated. Pin exact versions during `0.x.x-alpha`. Install with `npm install <pkg>@alpha`.

MCP server for **Nubank** — Brazil's largest digital bank, using the Open Finance Brasil standard.

## Quick Start

```bash
# Set your credentials
export NUBANK_CLIENT_ID="your-client-id"
export NUBANK_CLIENT_SECRET="your-client-secret"
export NUBANK_CERT_PATH="/path/to/certificate.pem"

# Run via stdio
npx tsx packages/payments/nubank/src/index.ts

# Run via HTTP
npx tsx packages/payments/nubank/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NUBANK_CLIENT_ID` | Yes | OAuth2 client ID |
| `NUBANK_CLIENT_SECRET` | Yes | OAuth2 client secret |
| `NUBANK_CERT_PATH` | Yes | Path to mTLS certificate file |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools (22)

| Tool | Purpose |
|---|---|
| `get_accounts` | List all accounts (checking, savings) |
| `get_balance` | Get account balance |
| `get_transactions` | List transactions with filters |
| `get_credit_card_bill` | Get credit card bill details |
| `get_investments` | List investments and yields |
| `initiate_pix` | Initiate a PIX transfer |
| `get_pix_keys` | List registered PIX keys |
| `get_statement` | Get account statement for a period |
| `get_profile` | Get authenticated user profile information |
| `list_cards` | List debit and credit cards |
| `get_pix_transfer` | Get status and details of a specific PIX transfer |
| `schedule_pix` | Schedule a future-dated PIX transfer |
| `cancel_scheduled_pix` | Cancel a previously scheduled PIX transfer |
| `create_pix_key` | Register a new PIX key for the authenticated account |
| `delete_pix_key` | Remove a registered PIX key |
| `get_card_details` | Get details for a single debit or credit card |
| `block_card` | Block a card (reports lost/stolen or temporarily disables it) |
| `unblock_card` | Unblock a previously blocked card (only valid for temporary blocks) |
| `get_credit_card_transactions` | List transactions for a given credit card bill |
| `pay_credit_card_bill` | Pay a credit card bill from a linked account |
| `get_boleto` | Retrieve boleto details by barcode or digitable line |
| `pay_boleto` | Pay a boleto from a linked account |

## Auth

Uses **OAuth2 client credentials** flow with mTLS certificate. Register your application through Nubank's Open Finance portal to obtain credentials.

## API Reference

- [Open Finance Brasil](https://openfinancebrasil.org.br/)
- [Nubank Developer Docs](https://dev.nubank.com.br/)
