# @codespar/mcp-openpay

MCP server for [Openpay](https://www.openpay.mx) — the BBVA-owned Mexican payment gateway.

Openpay is the main BBVA-backed alternative to Conekta for Mexican online merchants. Adding it to the catalog alongside `@codespar/mcp-conekta` closes the "big two" MX gateway story and opens the BBVA rails (SPEI, OXXO, domestic cards) to agents. Differentiators in this catalog: native subscriptions (plans + per-customer recurring billing) and marketplace payouts.

## Tools

| Tool | Purpose |
|------|---------|
| `create_charge` | Charge via card, bank_account (SPEI), or store (OXXO). Customer-scoped or merchant-scoped. |
| `get_charge` | Retrieve a charge |
| `capture_charge` | Capture a previously authorized charge (delayed capture) |
| `refund_charge` | Refund a captured charge (full or partial) |
| `create_customer` | Create a customer record, optionally with a wallet account |
| `get_customer` | Retrieve a customer |
| `list_customers` | List customers with filters |
| `create_card` | Tokenize a card at merchant or customer scope |
| `delete_card` | Delete a tokenized card |
| `create_plan` | Create a subscription plan template |
| `create_subscription` | Subscribe a customer to a plan using a stored card |
| `create_payout` | Pay out MXN to a bank account (marketplace seller payouts) |

## Install

```bash
npm install @codespar/mcp-openpay
```

## Environment

```bash
OPENPAY_MERCHANT_ID="..."  # merchant id (part of the API URL path)
OPENPAY_PRIVATE_KEY="..."  # private API key — secret
OPENPAY_ENV="sandbox"      # 'sandbox' (default) | 'production'
```

## Authentication

HTTP Basic. The private key is the username, and the password is empty:

```
Authorization: Basic base64(OPENPAY_PRIVATE_KEY + ":")
Content-Type: application/json
```

The server handles the Base64 encoding automatically — you only configure the three env vars.

## Base URLs

| Env | Host |
|-----|------|
| `sandbox` (default) | `https://sandbox-api.openpay.mx/v1/{merchant_id}` |
| `production` | `https://api.openpay.mx/v1/{merchant_id}` |

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-openpay

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-openpay
```

## Scoping notes

Several Openpay resources can be addressed at either merchant scope or customer scope. The tools expose this via an optional `customer_id` parameter:

- `create_charge`, `get_charge`, `capture_charge`, `refund_charge` — routed to `/customers/{customer_id}/...` when `customer_id` is set, else `/...`.
- `create_card`, `delete_card` — same pattern.
- `create_payout` — customer-scoped payout requires the customer to have `requires_account=true`.
- `create_subscription` — customer scope is required by the API (plans are merchant-scoped; subscriptions are always per-customer).

## PCI scope

Prefer client-side tokenization with Openpay.js and pass the resulting `token_id` / `source_id` to the server. Only send raw PANs/CVVs server-side if you are PCI-DSS compliant.

## Docs

https://documents.openpay.mx/en/api

## License

MIT
