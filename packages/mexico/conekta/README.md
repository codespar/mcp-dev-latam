# MCP Conekta

MCP server for **Conekta** — the leading Mexican payment gateway supporting cards, OXXO cash payments, and SPEI bank transfers.

## Quick Start

```bash
# Set your API key
export CONEKTA_API_KEY="key_..."

# Run via stdio
npx tsx packages/mexico/conekta/src/index.ts

# Run via HTTP
npx tsx packages/mexico/conekta/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CONEKTA_API_KEY` | Yes | API key from Conekta dashboard |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools (21)

| Tool | Purpose |
|---|---|
| `create_order` | Create a new order |
| `get_order` | Get order details by ID |
| `list_orders` | List orders with filters |
| `create_customer` | Create a customer |
| `get_customer` | Get customer by ID |
| `list_customers` | List customers |
| `create_charge` | Create a charge for an existing order |
| `refund_charge` | Refund a charge |
| `list_payment_sources` | List payment sources for a customer |
| `get_webhook_events` | List webhook events (Conekta Events) |
| `get_webhook_event` | Retrieve a single webhook event by ID |
| `update_customer` | Update a customer |
| `delete_customer` | Delete a customer |
| `create_payment_source` | Create a payment source (card token) for a customer |
| `delete_payment_source` | Delete a payment source from a customer |
| `update_order` | Update an order (line_items, metadata, etc.) |
| `cancel_order` | Cancel an order |
| `capture_charge` | Capture a pre-authorized order (pre_authorized → paid) |
| `create_webhook` | Create a webhook endpoint |
| `update_webhook` | Update a webhook endpoint |
| `delete_webhook` | Delete a webhook endpoint |

## Auth

Uses **Basic authentication** with API key as username and empty password. API version `v2.2.0` is set via the Accept header. Obtain your API key from the [Conekta Dashboard](https://panel.conekta.com/).

## API Reference

- [Conekta API Docs](https://developers.conekta.com/reference)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
