# @codespar/mcp-dlocal

MCP server for [dLocal](https://dlocal.com) — LatAm cross-border payments.

One API, 15+ LatAm countries, local payment methods (Pix, OXXO, PSE, SPEI, Boleto, cards). The abstraction that per-country PSP servers cannot provide on their own.

## Tools (18)

| Tool | Purpose |
|---|---|
| `create_payment` | Create a payment (pay-in) in a LatAm country using a local payment method. |
| `get_payment` | Get payment status and full detail by dLocal payment id. |
| `get_payment_by_order_id` | Get a payment by the merchant-side order_id supplied at creation time. |
| `list_payments` | List payments with optional date / country / status filters. |
| `capture_payment` | Capture an AUTHORIZED card payment. |
| `cancel_payment` | Cancel an authorized-but-not-captured payment, or void a PENDING payment. |
| `create_refund` | Refund a captured payment. |
| `get_refund` | Get refund status by refund id. |
| `list_refunds` | List refunds, optionally scoped to a payment_id. |
| `create_payout` | Send money out to a beneficiary in a LatAm country. |
| `get_payout` | Get payout status by dLocal payout id. |
| `get_payout_by_external_id` | Get a payout by the merchant external_id / order_id supplied at creation time. |
| `list_payouts` | List payouts with optional date / country / status filters. |
| `list_payment_methods` | List all payment methods available for a given country. |
| `get_balance` | Get the merchant's current available balance per currency. |
| `get_exchange_rate` | Query the dLocal FX rate for a destination country/currency pair. |
| `create_card_token` | Tokenize a card for use in DIRECT-flow create_payment. |
| `validate_document` | Validate a LatAm tax/identity document (CPF or CNPJ in BR, CUIT/CUIL/DNI in AR, RUT in CL/UY, RFC/CURP in M... |

## Install

```bash
npm install @codespar/mcp-dlocal
```

## Environment

```bash
DLOCAL_LOGIN="..."        # X-Login header value
DLOCAL_TRANS_KEY="..."    # X-Trans-Key header value
DLOCAL_SECRET_KEY="..."   # HMAC secret used to sign V2 requests
DLOCAL_BASE_URL="..."     # Optional. Defaults to https://api.dlocal.com. Use https://sandbox.dlocal.com for sandbox.
```

## Authentication

Every request signs with V2 HMAC-SHA256:

```
X-Date: <ISO-8601 UTC>
X-Login: <login>
X-Trans-Key: <trans_key>
Authorization: V2-HMAC-SHA256, Signature: <hex(hmac_sha256(login + x_date + body, secret_key))>
```

The server handles signing automatically — you only configure the three env vars.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-dlocal

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-dlocal
```

## Countries covered

Argentina, Bolivia, Brazil, Chile, Colombia, Costa Rica, Ecuador, Guatemala, Mexico, Peru, Uruguay, and more. Use `list_payment_methods` to enumerate available methods per country at runtime rather than hard-coding.

## License

MIT
