# @codespar/mcp-nupay

MCP server for [NuPay](https://docs.nupaybusiness.com.br) — Nubank's merchant checkout rail.

NuPay is Nubank's answer to PayPal / Shop Pay for Brazil: a wallet-backed checkout that leverages Nubank's 100M+ BR customer distribution. Agents create a payment, the shopper confirms inside the Nubank app (push + biometric) or via Pix, and funds settle to the merchant. Pre-authorized flows (CIBA / OTP) unlock recurrence and true one-click for repeat buyers.

## Tools

| Tool | Purpose |
|---|---|
| `create_payment` | Create a NuPay or Pix checkout payment |
| `get_payment_status` | Fetch payment status |
| `cancel_payment` | Cancel an unsettled payment |
| `create_refund` | Full or partial refund (idempotent) |
| `get_refund` | Retrieve refund status |
| `create_recipient` | Register a regulatory final beneficiary |
| `get_recipient` | Retrieve a recipient |
| `query_payment_conditions` | List installment/payment options for an amount |
| `create_preauth_payment` | Create a payment using a pre-authorized Bearer token (recurrence) |
| `backchannel_start` | Start CIBA / OTP shopper authorization |
| `backchannel_complete` | Complete OTP and exchange for tokens |
| `backchannel_resend_otp` | Resend the OTP |
| `exchange_token` | OAuth2 `/v1/token` — authorization_code or refresh_token grant |

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
