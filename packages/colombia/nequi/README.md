# MCP Nequi


> **Alpha release** — published under the `alpha` npm dist-tag. Endpoint paths follow public docs and BACEN/provider conventions but have not been fully live-validated. Pin exact versions during `0.x.x-alpha`. Install with `npm install <pkg>@alpha`.

MCP server for **Nequi** — Colombia's leading digital wallet with 50M+ users, powered by Bancolombia. Supports push payments, QR payments, and subscriptions.

## Quick Start

```bash
# Set your credentials
export NEQUI_API_KEY="your-api-key"
export NEQUI_CLIENT_ID="your-client-id"
export NEQUI_CLIENT_SECRET="your-client-secret"

# Run via stdio
npx tsx packages/colombia/nequi/src/index.ts

# Run via HTTP
npx tsx packages/colombia/nequi/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEQUI_API_KEY` | Yes | API key from Nequi developer portal |
| `NEQUI_CLIENT_ID` | Yes | OAuth2 client ID |
| `NEQUI_CLIENT_SECRET` | Yes | OAuth2 client secret |
| `NEQUI_ENV` | No | `"sandbox"` or `"production"` (default: sandbox) |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools (16)

| Tool | Purpose |
|---|---|
| `create_push_payment` | Send a push payment notification to a Nequi user |
| `get_payment_status` | Check the status of a payment |
| `create_qr_payment` | Generate a QR code for payment |
| `reverse_payment` | Reverse a completed payment |
| `get_subscription` | Get subscription details for a phone number |
| `unsubscribe` | Cancel a subscription |
| `create_static_qr` | Generate a static (reusable) Nequi QR code for a merchant |
| `reverse_transaction` | Reverse any Nequi transaction by transaction ID (refund flow) |
| `validate_phone` | Check whether a phone number is enrolled in Nequi |
| `notify_unregistered_payment` | Notify a non-Nequi recipient with instructions to claim a payment |
| `list_transactions` | List transactions for a merchant within a date range |
| `get_balance` | Get the merchant's own Nequi account balance |
| `schedule_payment` | Schedule a Nequi push payment for a future date |
| `authorize_recurring_charge` | Authorize a recurring charge agreement against a Nequi user |
| `get_merchant_info` | Retrieve registered merchant business profile |
| `get_settlement` | Query settlement (liquidation) for a given date |

## Auth

Uses **OAuth2 client credentials** flow. The server obtains an access token using client ID and secret, and includes the API key in every request header.

## API Reference

- [Nequi API Docs](https://docs.conecta.nequi.com.co/)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
