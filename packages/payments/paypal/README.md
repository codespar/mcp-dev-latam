# @codespar/mcp-paypal

MCP server for [PayPal](https://developer.paypal.com/api/rest) — global payments and payouts via the PayPal REST API.

Target customer: LatAm SaaS / marketplaces selling globally that already hold a PayPal merchant account and want agent-driven checkout, payouts, subscriptions, and dispute handling.

## Tools (19)

| Tool | Purpose |
|---|---|
| `create_order` | Create a PayPal Order via POST /v2/checkout/orders. |
| `get_order` | Fetch a PayPal Order by id via GET /v2/checkout/orders/{id}. |
| `capture_order` | Capture payment for an approved order via POST /v2/checkout/orders/{id}/capture. |
| `authorize_order` | Authorize payment for an approved order via POST /v2/checkout/orders/{id}/authorize. |
| `capture_authorization` | Capture a previously authorized payment via POST /v2/payments/authorizations/{id}/capture. |
| `refund_capture` | Refund a captured payment via POST /v2/payments/captures/{id}/refund. |
| `void_authorization` | Void (release) an unsettled authorization via POST /v2/payments/authorizations/{id}/void. |
| `get_payment_details` | Fetch a payment object by id via GET /v2/payments/{type}/{id}. |
| `create_batch_payout` | Create a batch payout via POST /v1/payments/payouts. |
| `get_payout` | Fetch a payout batch by id via GET /v1/payments/payouts/{batch_id}. |
| `get_payout_item` | Fetch a single payout item by id via GET /v1/payments/payouts-item/{item_id}. |
| `create_subscription` | Create a billing subscription via POST /v1/billing/subscriptions. |
| `get_subscription` | Fetch a subscription by id via GET /v1/billing/subscriptions/{id}. |
| `cancel_subscription` | Cancel an active subscription via POST /v1/billing/subscriptions/{id}/cancel. |
| `list_disputes` | List disputes via GET /v1/customer/disputes. |
| `get_dispute` | Fetch a dispute by id via GET /v1/customer/disputes/{id}. |
| `accept_dispute_claim` | Accept liability for a dispute claim via POST /v1/customer/disputes/{id}/accept-claim. |
| `list_webhooks` | List configured webhooks for the app via GET /v1/notifications/webhooks. |
| `verify_webhook_signature` | Verify a webhook event signature via POST /v1/notifications/verify-webhook-signature. |

## Install

```bash
npm install @codespar/mcp-paypal
```

## Environment

```bash
PAYPAL_CLIENT_ID="..."       # REST app client id
PAYPAL_CLIENT_SECRET="..."   # REST app client secret (OAuth2)
PAYPAL_ENV="sandbox"         # 'sandbox' (default) or 'live'
```

Endpoints:
- `sandbox` -> `https://api-m.sandbox.paypal.com`
- `live` -> `https://api-m.paypal.com`

## Authentication

PayPal REST APIs use OAuth2 `client_credentials`. The server posts `CLIENT_ID:CLIENT_SECRET` (Basic auth) to `/v1/oauth2/token` with `grant_type=client_credentials` and caches the bearer token until 60s before expiry, refreshing on demand.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-paypal

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-paypal
```

## Notes

- **Amounts** are objects in PayPal REST: `{ "currency_code": "USD", "value": "10.50" }`. Values are decimal strings.
- The server forwards arbitrary REST body fields verbatim under `body` for tools that accept them, so any field documented in the PayPal REST reference can be passed even if it's not in the MCP `inputSchema`.
- For payment captures / refunds the `PayPal-Request-Id` header (idempotency) is forwarded when supplied.

## License

MIT
