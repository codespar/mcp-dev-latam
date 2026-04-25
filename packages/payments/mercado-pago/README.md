# MCP Mercado Pago

MCP server for the **Mercado Pago** payment gateway — the leading payment platform in Latin America.

## Quick Start

```bash
# Set your access token
export MERCADO_PAGO_ACCESS_TOKEN="APP_USR-..."

# Run via stdio
npx tsx packages/payments/mercado-pago/src/index.ts

# Run via HTTP
npx tsx packages/payments/mercado-pago/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MERCADO_PAGO_ACCESS_TOKEN` | Yes | Access token from Mercado Pago dashboard |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools (30)

| Tool | Purpose |
|---|---|
| `create_payment` | Create a new payment |
| `get_payment` | Get payment details by ID |
| `search_payments` | Search payments with filters |
| `create_refund` | Refund a payment (full or partial) |
| `create_preference` | Create a checkout preference for Checkout Pro |
| `get_preference` | Get checkout preference by ID |
| `create_customer` | Create a customer |
| `list_customers` | List customers |
| `get_payment_methods` | List available payment methods |
| `create_pix_payment` | Create a PIX payment |
| `get_merchant_order` | Get merchant order by ID |
| `get_balance` | Get account balance |
| `create_subscription` | Create a recurring subscription (preapproval) |
| `get_subscription` | Get subscription (preapproval) details by ID |
| `cancel_subscription` | Cancel a subscription (preapproval) |
| `create_card_token` | Tokenize a card for secure payments |
| `get_payment_method_details` | Get details of a specific payment method by ID |
| `create_store` | Create a store (physical location or POS group) |
| `list_stores` | List stores |
| `create_pos` | Create a point of sale (POS) linked to a store |
| `update_subscription` | Update a subscription (preapproval) — amount, status, reason, card token, etc. |
| `oauth_token_exchange` | Exchange an authorization code for a seller access token (marketplace onboarding). |
| `create_advanced_payment` | Create a marketplace split payment with per-recipient disbursements (application_fee, money_release_days, c... |
| `get_advanced_payment` | Get an advanced (split) payment by ID |
| `get_chargeback` | Get chargeback details by ID |
| `upload_chargeback_evidence` | Upload documentation/evidence for a chargeback dispute. |
| `get_identification_types` | Get document/identification types available per country (CPF, CNPJ, DNI, RUT, etc.). |
| `get_payment_methods_by_site` | List available payment methods for a specific Mercado Pago site (MLB=Brazil, MLA=Argentina, MLM=Mexico, MLC... |
| `create_settlement_report` | Manually generate a settlement (account money) report for a date range. |
| `search_merchant_orders` | Search merchant orders with filters (last 90 days). |

## Auth

Uses **Bearer token** authentication. Obtain your access token from the [Mercado Pago Developers](https://www.mercadopago.com.br/developers) dashboard.

## API Reference

- [Mercado Pago API Docs](https://www.mercadopago.com.br/developers/en/reference)
