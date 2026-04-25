# @codespar/mcp-picpay

MCP server for [PicPay Business](https://developers-business.picpay.com) — Brazilian digital wallet with 60M+ users.

PicPay's Checkout API lets merchants create a payment intent that the buyer completes inside the PicPay app, returning a redirect URL plus a Pix-style QR code. The Recurrency API adds subscription plans on top.

## Tools (20)

| Tool | Purpose |
|---|---|
| `create_payment` | Create a PicPay checkout payment. |
| `get_payment_status` | Get the status of a payment by referenceId. |
| `cancel_payment` | Cancel a PicPay order. |
| `create_plan` | Create a subscription plan (Recurrency API). |
| `list_plans` | List all subscription plans registered for this merchant. |
| `update_plan` | Update an existing subscription plan. |
| `delete_plan` | Delete a subscription plan. |
| `create_subscription` | Enroll a buyer in a subscription plan. |
| `get_subscription` | Retrieve a subscription by id. |
| `cancel_subscription` | Cancel an active subscription. |
| `validate_notification` | Verify that an incoming webhook callback came from PicPay by comparing the x-seller-token header against PI... |
| `refund_payment` | Refund a paid PicPay order, optionally partially. |
| `create_b2p_transfer` | Create a Business-to-Person (B2P) transfer: push funds from the merchant wallet to a PicPay user identified... |
| `get_b2p_transfer` | Get the status of a B2P transfer by referenceId. |
| `create_batch_payment` | Submit a batch of B2P transfers in a single request. |
| `list_transactions` | List merchant transactions (payments and transfers) within a date range. |
| `get_wallet_balance` | Retrieve the merchant's current PicPay wallet balance (available and blocked amounts in BRL). |
| `generate_static_qrcode` | Generate a static PicPay Pay QR code for in-store / reusable use. |
| `generate_dynamic_qrcode` | Generate a dynamic PicPay Pay QR code with a fixed amount and optional expiration. |
| `create_payment_link` | Create a shareable PicPay payment link. |

## Install

```bash
npm install @codespar/mcp-picpay@alpha
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
