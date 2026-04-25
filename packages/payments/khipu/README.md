# @codespar/mcp-khipu

MCP server for [Khipu](https://khipu.com) — Chilean instant bank-transfer PSP.

Khipu lets a payer pay from their Chilean bank account in real time: the merchant creates a payment, the payer is redirected to Khipu, logs into their bank, and the transfer lands instantly. No card, no credit limit, no interchange fees — the Chilean preferred rail for higher-ticket purchases.

Chilean agents typically bundle Khipu with [`@codespar/mcp-transbank`](../transbank): Webpay for cards, Khipu for bank transfers. Together they cover the vast majority of Chilean checkout preferences.

## Tools (21)

| Tool | Purpose |
|---|---|
| `create_payment` | Create a Khipu payment (bank-transfer charge). |
| `get_payment` | Retrieve a Khipu payment. |
| `delete_payment` | Delete (cancel) a pending Khipu payment. |
| `confirm_payment` | Manually confirm a Khipu payment. |
| `refund_payment` | Refund a paid Khipu payment (full or partial). |
| `list_payments` | List Khipu payments for the current merchant, optionally filtered by date range and status. |
| `predict_payment` | Predict whether a payment is likely to succeed for a given payer+amount+bank, and recommend the best bank/r... |
| `get_merchants` | List the merchant receiver accounts accessible with the current API key. |
| `get_merchant` | Fetch a single merchant by id. |
| `list_merchant_accounts` | List the bank accounts registered for a merchant to collect into. |
| `create_receiver` | Create (onboard) a new receiver under an integrator account. |
| `list_receivers` | List receivers onboarded under the current integrator account. |
| `list_conciliations` | List settlement / conciliation records for a date range. |
| `list_reviews` | List payer reviews / opinions left after a Khipu payment. |
| `register_webhook` | Register a webhook endpoint to receive Khipu notifications (payment.paid, payment.refunded, etc). |
| `list_webhooks` | List registered webhook endpoints for the current merchant. |
| `delete_webhook` | Delete (unregister) a webhook endpoint by id. |
| `create_terminal_session` | Create a Khipu terminal session for in-person / POS bank-transfer checkout. |
| `get_terminal_session` | Retrieve the current status of a terminal (POS) session — whether the payer has scanned, paid, or the sessi... |
| `get_banks` | List Chilean banks supported by Khipu for bank-transfer payments. |
| `create_automatic_payment` | Create a Khipu automatic payment (recurring / subscription charge against a previously enrolled subscriptio... |

## Install

```bash
npm install @codespar/mcp-khipu@alpha
```

## Environment

```bash
# Preferred — v3 API key auth
KHIPU_API_KEY="..."       # sent as x-api-key header

# Legacy — v2 HTTP Basic auth (only if no API key available)
KHIPU_RECEIVER_ID="..."   # merchant receiver id
KHIPU_SECRET="..."        # receiver secret

# Optional
KHIPU_BASE_URL="..."      # defaults to https://payment-api.khipu.com/v3
```

## Authentication

Khipu v3 uses a single API key in the `x-api-key` header — no request signing, no HMAC. Obtain the key from the Khipu merchant panel under Developers → API keys.

If `KHIPU_API_KEY` is unset, the server falls back to v2 HTTP Basic with `KHIPU_RECEIVER_ID:KHIPU_SECRET` for merchants still on the legacy endpoints.

All request bodies are JSON (v3); the server sets `Content-Type: application/json` automatically.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-khipu

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-khipu
```

## Why Khipu + Transbank

Chile has two dominant checkout rails:

1. **Card (Transbank Webpay)** — universal, works everywhere, interchange fees apply.
2. **Bank transfer (Khipu)** — no card needed, no credit limit, cheaper fees, preferred for larger purchases and B2B.

An agent that can offer both at checkout converts materially better than one that only takes cards. `@codespar/mcp-transbank` handles the first; this package handles the second.

## Pair with

- [`@codespar/mcp-transbank`](../transbank) — Chilean card acquiring (Webpay Plus, Oneclick, Full Transaction)
- [`@codespar/mcp-dlocal`](../dlocal) — cross-border LatAm coverage when you need CL + other countries through one API

## License

MIT
