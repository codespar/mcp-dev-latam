# @codespar/mcp-picpay

MCP server for [PicPay Business](https://developers-business.picpay.com) — Brazilian digital wallet with 60M+ users.

PicPay's Checkout API lets merchants create a payment intent that the buyer completes inside the PicPay app, returning a redirect URL plus a Pix-style QR code. The Recurrency API adds subscription plans on top.

## Tools

| Tool | Purpose |
|------|---------|
| `create_payment` | Create a checkout (`POST /payments`). Returns `paymentUrl` + `qrcode`. |
| `get_payment_status` | `GET /payments/{referenceId}/status` |
| `cancel_payment` | `POST /payments/{referenceId}/cancellations` (voids unpaid, refunds paid) |
| `create_plan` | `POST /recurrency/plans` |
| `list_plans` | `GET /recurrency/plans` |
| `update_plan` | `PUT /recurrency/plans/{planId}` |
| `delete_plan` | `DELETE /recurrency/plans/{planId}` |
| `create_subscription` | `POST /recurrency/subscriptions` |
| `get_subscription` | `GET /recurrency/subscriptions/{subscriptionId}` |
| `cancel_subscription` | `POST /recurrency/subscriptions/{subscriptionId}/cancel` |
| `validate_notification` | Verify an incoming webhook against `PICPAY_SELLER_TOKEN` |

## Install

```bash
npm install @codespar/mcp-picpay
```

## Environment

```bash
PICPAY_TOKEN="..."          # Merchant integration token (x-picpay-token header)
PICPAY_SELLER_TOKEN="..."   # Seller token used to validate webhook callbacks
PICPAY_BASE_URL="..."       # Optional. Defaults to https://appws.picpay.com/ecommerce/public
```

## Authentication

Every request sends:

```
Content-Type: application/json
x-picpay-token: <PICPAY_TOKEN>
```

PicPay webhook callbacks carry `x-seller-token: <PICPAY_SELLER_TOKEN>`. Use the `validate_notification` tool (or compare the header yourself) before trusting a payload, then fetch the authoritative status with `get_payment_status`.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-picpay

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-picpay
```

## Status

`0.1.0-alpha.1`. Core checkout endpoints (`/payments`, `/payments/{ref}/status`, `/payments/{ref}/cancellations`) are verified against PicPay's public docs. Recurrency (plans + subscriptions) endpoints come from the documented path shape but field-level schemas (frequency enum values, subscription response) should be confirmed against the live API before production use.

## License

MIT
