# @codespar/mcp-getnet

MCP server for [Getnet](https://developers.getnet.com.br) — Santander-owned Brazilian card acquirer.

Together with Cielo, Stone, and Efi, Getnet closes three of the "big four" BR acquirer quadrant. Distinct from per-PSP servers (Zoop, Pagar.me, Asaas): Getnet is an acquirer, so merchants with a Santander commercial contract integrate directly instead of going through a PSP.

## Tools (20)

| Tool | Purpose |
|---|---|
| `authorize_credit` | Authorize a credit-card payment on Getnet. |
| `capture_credit` | Capture a previously authorized credit payment (when delayed=true was used). |
| `cancel_credit` | Cancel an authorized-but-uncaptured credit payment. |
| `refund_credit` | Refund a captured credit payment. |
| `create_pix` | Create a Pix charge. |
| `create_boleto` | Create a boleto charge. |
| `get_payment` | Retrieve a payment by Getnet payment_id. |
| `tokenize_card` | Tokenize a card for PCI-safe reuse. |
| `create_seller` | Onboard a marketplace seller via Getnet Marketplace Management. |
| `get_seller` | Retrieve a seller by Getnet seller_id. |
| `list_sellers` | List marketplace sellers with optional filters. |
| `cancel_debit` | Cancel a debit-card payment by Getnet payment_id. |
| `query_pix` | Retrieve a Pix charge by Getnet payment_id. |
| `query_boleto` | Retrieve a boleto by Getnet payment_id. |
| `cancel_boleto` | Cancel a boleto that has not yet been paid. |
| `get_payment_by_order` | Retrieve a payment using the merchant-side order_id (handy when you've lost the Getnet payment_id). |
| `query_installments` | Query the installment plans Getnet offers for a given amount + card brand (with/without interest, max insta... |
| `create_numtoken` | Create a numtoken (Getnet card-on-file PAN-level token). |
| `create_split` | Configure a marketplace split rule that routes part of a payment to a subseller. |
| `get_statement` | Retrieve marketplace statement entries (sales, fees, payouts) for a subseller in a date range. |

## Install

```bash
npm install @codespar/mcp-getnet
```

## Environment

```bash
GETNET_CLIENT_ID="..."       # OAuth client_id
GETNET_CLIENT_SECRET="..."   # OAuth client_secret
GETNET_SELLER_ID="..."       # seller_id from your merchant contract
GETNET_BASE_URL="..."        # Optional. Default: https://api.getnet.com.br
                             # Sandbox: https://api-homologacao.getnet.com.br
```

## Authentication

OAuth 2.0 Client Credentials. The server calls `POST /auth/oauth/v2/token` with Basic auth and caches the bearer token in memory until 60s before expiry. Transparent to callers.

## Run

```bash
# stdio (default)
npx @codespar/mcp-getnet

# HTTP
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-getnet
```

## License

MIT
