# @codespar/mcp-nupay

MCP server for [NuPay](https://docs.nupaybusiness.com.br) — Nubank's merchant checkout rail.

NuPay is Nubank's answer to PayPal / Shop Pay for Brazil: a wallet-backed checkout that leverages Nubank's 100M+ BR customer distribution. Agents create a payment, the shopper confirms inside the Nubank app (push + biometric) or via Pix, and funds settle to the merchant. Pre-authorized flows (CIBA / OTP) unlock recurrence and true one-click for repeat buyers.

## Tools (22)

| Tool | Purpose |
|---|---|
| `create_payment` | Create a NuPay checkout payment. |
| `get_payment` | Retrieve full payment details (amount, shopper, items, current status, timestamps) by pspReferenceId. |
| `get_payment_status` | Retrieve a payment's status by pspReferenceId. |
| `list_payments_by_date` | List payments created within a date range. |
| `cancel_payment` | Cancel a payment that has not yet been captured/settled. |
| `create_refund` | Refund a settled payment (full or partial). |
| `get_refund` | Retrieve refund status by pspReferenceId + refundId. |
| `list_refunds` | List all refunds issued against a given payment. |
| `create_recipient` | Register a final beneficiary (required for regulatory split payments). |
| `get_recipient` | Retrieve a registered recipient by referenceId. |
| `update_recipient` | Update a registered final beneficiary (name, document, country, type). |
| `delete_recipient` | Remove a registered recipient. |
| `list_recipients` | List registered recipients (final beneficiaries) for the merchant. |
| `list_settlements` | List settlement reports (payouts to the merchant bank account) within a date range. |
| `get_settlement` | Retrieve a single settlement (payout batch) including the list of underlying transactions. |
| `query_payment_conditions` | Query available installment/payment conditions for a given amount and (optionally) shopper CPF. |
| `create_preauth_payment` | Create a NuPay payment using a pre-authorized Bearer access_token (pre-auth / recurrence flow). |
| `backchannel_start` | Start a CIBA / OTP pre-authorization for a shopper. |
| `backchannel_complete` | Complete a CIBA/OTP flow by submitting the OTP the shopper received. |
| `backchannel_resend_otp` | Resend the OTP to the shopper for an in-flight authorization ticket. |
| `exchange_token` | Exchange an authorization_code or refresh_token at POST /v1/token. |
| `revoke_token` | Revoke an issued access_token or refresh_token at POST /v1/token/revoke. |

## Install

```bash
npm install @codespar/mcp-nupay
```

## Environment

```bash
NUPAY_MERCHANT_KEY="..."     # X-Merchant-Key issued to your merchant
NUPAY_MERCHANT_TOKEN="..."   # X-Merchant-Token (secret)
NUPAY_CLIENT_ID="..."        # Optional — OAuth client_id for pre-auth / recurrence
NUPAY_CLIENT_SECRET="..."    # Optional — OAuth client_secret
NUPAY_ENV="sandbox"          # sandbox (default) | production
```

## Authentication

Two flows:

1. **Standard merchant API** (payments, refunds, recipients, payment-conditions) uses `X-Merchant-Key` + `X-Merchant-Token` headers. No token exchange.
2. **Pre-authorized / recurrence** uses OAuth2 + CIBA / OTP. Start with `backchannel_start`, validate via `backchannel_complete`, then call `create_preauth_payment` with the returned Bearer `access_token`. Refresh with `exchange_token` (grant_type=refresh_token). Access tokens expire in 5 minutes; refresh tokens should be stored long-term for recurrence.

Base URLs are derived from `NUPAY_ENV`:

|  | Sandbox | Production |
|---|---|---|
| API | `https://sandbox-api.spinpay.com.br` | `https://api.spinpay.com.br` |
| Auth | `https://sandbox-authentication.spinpay.com.br/api` | `https://authentication.spinpay.com.br/api` |

JWT `client_assertion` signing is the caller's responsibility — `exchange_token` expects an already-signed assertion with `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`.

## Run

```bash
# stdio (default)
npx @codespar/mcp-nupay

# HTTP
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-nupay
```

## License

MIT
