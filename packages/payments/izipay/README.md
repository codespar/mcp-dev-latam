# @codespar/mcp-izipay

MCP server for [Izipay](https://developers.izipay.pe) — Peru's enterprise acquirer.

Izipay is the merchant-facing brand of **Niubiz** (Visa + Peruvian banks joint venture), the largest card acquirer in Peru with 20%+ share. Niubiz/Izipay is the default for enterprise merchants with serious volume and a direct acquirer contract.

## Positioning vs Culqi

| | [@codespar/mcp-culqi](../culqi) | @codespar/mcp-izipay |
|---|---|---|
| Segment | Peru SMB | Peru enterprise |
| Type | PSP (Stripe-analog) | Acquirer (Niubiz) |
| Onboarding | Self-serve | Commercial contract |
| Customers | D2C, SaaS, startups | Retail chains, airlines, utilities, banks |

Peruvian merchants with serious volume typically have an Izipay acquirer contract **before** they adopt a PSP — different customers, different contracts, different commercial terms. The two servers complement each other.

## Status: alpha

This is **0.1.0-alpha.1**. Izipay's developer portal at `developers.izipay.pe` is contract-gated — the public homepage advertises the API but the full REST reference is only available to contracted merchants. The endpoint paths in this server are best-effort inferences from Izipay's public SDK repositories (`github.com/izipay-pe`) and common Niubiz/Izipay REST conventions. **Every endpoint below should be validated against your integration kit before going live**, and corrections are welcome via PR.

### Best-guess endpoints (unverified)

| Tool | Method | Path |
|---|---|---|
| auth (internal) | `POST` | `/auth/login` |
| `create_charge` | `POST` | `/v1/charges` |
| `capture_charge` | `POST` | `/v1/charges/{id}/capture` |
| `cancel_charge` | `POST` | `/v1/charges/{id}/cancel` |
| `refund_charge` | `POST` | `/v1/charges/{id}/refund` |
| `get_charge` | `GET` | `/v1/charges/{id}` |
| `tokenize_card` | `POST` | `/v1/tokens` |
| `delete_token` | `DELETE` | `/v1/tokens/{id}` |
| `create_installment_plan` | `POST` | `/v1/installments` |
| `list_transactions` | `GET` | `/v1/transactions` |
| `get_settlement` | `GET` | `/v1/settlements/{date}` |

## Tools (20)

| Tool | Purpose |
|---|---|
| `create_charge` | Authorize a card payment. |
| `capture_charge` | Capture a previously authorized charge (when capture=false was used in create_charge). |
| `cancel_charge` | Void an authorized-but-uncaptured charge. |
| `refund_charge` | Refund a captured charge. |
| `get_charge` | Retrieve a charge by Izipay charge id. |
| `tokenize_card` | Tokenize a card for PCI-safe reuse. |
| `delete_token` | Delete a stored card token. |
| `create_installment_plan` | Create a Peruvian cuotas (installment) plan on a charge. |
| `list_transactions` | List transactions for reconciliation. |
| `get_settlement` | Get the daily settlement batch (liquidación) for a given date. |
| `get_charge_by_order` | Retrieve a charge by the merchant-side orderNumber (order_id passed to create_charge). |
| `list_installment_options` | Query available cuota programs for a given card BIN and amount. |
| `list_settlements` | List settlement batches across a date range. |
| `create_payment_link` | Create a hosted payment link (pay-by-link). |
| `get_payment_link` | Retrieve a payment link by id. |
| `pay_yape` | Initiate a Yape direct payment. |
| `pay_plin` | Initiate a Plin direct payment. |
| `authenticate_3ds` | Complete a 3-D Secure challenge. |
| `create_subscription` | Start a recurring card charge (subscription). |
| `cancel_subscription` | Cancel an active subscription. |

## Install

```bash
npm install @codespar/mcp-izipay@alpha
```

## Environment

```bash
IZIPAY_USERNAME="..."       # merchant username
IZIPAY_PASSWORD="..."       # merchant password (secret)
IZIPAY_MERCHANT_CODE="..."  # codigoComercio
IZIPAY_ENV="production"     # or "sandbox"
IZIPAY_BASE_URL="..."       # Optional override
```

Defaults:
- `IZIPAY_ENV=production` → `https://api.izipay.pe`
- `IZIPAY_ENV=sandbox` → `https://sandbox-api.izipay.pe`

## Authentication

JWT Bearer. On the first API call the server POSTs `{ username, password, merchantCode }` to `/auth/login`, caches the returned JWT in memory, and attaches it as `Authorization: Bearer <jwt>` on every subsequent request. The cached JWT is refreshed 60s before expiry. Transparent to callers.

## Run

```bash
# stdio (default)
npx @codespar/mcp-izipay

# HTTP
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-izipay
```

## License

MIT
