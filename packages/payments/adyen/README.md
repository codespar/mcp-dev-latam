# @codespar/mcp-adyen

MCP server for [Adyen Checkout API v71](https://docs.adyen.com/api-explorer/Checkout/71/overview) — the global enterprise payments rail used by iFood, Uber, Spotify, and AirBnB in LatAm.

Distinct from every other server in our catalog: it's the one gateway enterprise merchants choose when a single contract has to cover BR + EU + US + APAC.

## Tools (25)

| Tool | Purpose |
|---|---|
| `create_payment` | Create a payment. |
| `payment_details` | Submit additional details for a payment (3DS challenge response, redirect returnUrl payload, etc). |
| `capture_payment` | Capture an authorized payment (for delayed-capture flows). |
| `cancel_payment` | Cancel an authorized-but-uncaptured payment. |
| `refund_payment` | Refund a captured payment (full or partial). |
| `reverse_payment` | Void-or-refund a payment atomically. |
| `update_amount` | Update the authorized amount of an unsettled payment (common in tips / hotel incidentals). |
| `get_payment_methods` | Dynamically list available payment methods for a country/currency/amount combination. |
| `create_payment_link` | Create a hosted payment link (URL you send to the customer). |
| `get_payment_link` | Retrieve a payment link by id. |
| `update_payment_link` | Update a payment link — typically to expire it early. |
| `create_donation` | Create a round-up donation linked to an original payment (Adyen Giving). |
| `list_stored_payment_methods` | List a shopper's stored payment methods (one-click reuse). |
| `disable_stored_payment_method` | Delete a stored payment method (shopper opt-out). |
| `create_session` | Create a Checkout session (used by Drop-in and Web Components to load methods + handle the full flow client... |
| `get_session` | Retrieve the status/result of a Checkout session (poll after the shopper finishes Drop-in). |
| `retrieve_applicable_defense_reasons` | List the defense reason codes Adyen will accept for a given dispute (Dispute Service v30). |
| `accept_dispute` | Accept a dispute — forfeit the funds and close the case (Dispute Service v30). |
| `defend_dispute` | Defend a dispute using one of the applicable defense reason codes (Dispute Service v30). |
| `supply_defense_document` | Upload a supporting document for an ongoing dispute defense (Dispute Service v30). |
| `list_balance_accounts` | List the balance accounts owned by an account holder (Balance Platform BCL v2). |
| `get_balance_account` | Fetch a single balance account by id (Balance Platform BCL v2). |
| `create_transfer` | Initiate a transfer (bank payout, internal move, third-party card push) from a balance account (Transfers B... |
| `get_transfer` | Retrieve a transfer by id (Transfers BTL v4). |
| `list_merchants` | List merchant accounts visible to the API credential (Management API v3). |

## Install

```bash
npm install @codespar/mcp-adyen
```

## Environment

```bash
ADYEN_API_KEY="..."              # X-API-Key value, secret
ADYEN_MERCHANT_ACCOUNT="..."     # Merchant account code injected into every call
ADYEN_ENV="test"                 # test | live. Default: test.
ADYEN_LIVE_URL_PREFIX="..."      # Required when ADYEN_ENV=live. Your merchant-specific prefix from Customer Area.
```

## URL routing

- `ADYEN_ENV=test` → `https://checkout-test.adyen.com/v71`
- `ADYEN_ENV=live` → `https://<ADYEN_LIVE_URL_PREFIX>-checkout-live.adyenpayments.com/checkout/v71`

Live calls fail fast if `ADYEN_LIVE_URL_PREFIX` is missing.

## Run

```bash
# stdio (default)
npx @codespar/mcp-adyen

# HTTP
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-adyen
```

## Scope

This v0.1 covers **Checkout API v71** only. Separate packages for Adyen **Payouts**, **Management**, and **Balance Platform** APIs follow when demand emerges — each has distinct auth, URL prefix rules, and use cases.

## License

MIT
