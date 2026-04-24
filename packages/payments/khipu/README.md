# @codespar/mcp-khipu

MCP server for [Khipu](https://khipu.com) — Chilean instant bank-transfer PSP.

Khipu lets a payer pay from their Chilean bank account in real time: the merchant creates a payment, the payer is redirected to Khipu, logs into their bank, and the transfer lands instantly. No card, no credit limit, no interchange fees — the Chilean preferred rail for higher-ticket purchases.

Chilean agents typically bundle Khipu with [`@codespar/mcp-transbank`](../transbank): Webpay for cards, Khipu for bank transfers. Together they cover the vast majority of Chilean checkout preferences.

## Tools

| Tool | Purpose |
|------|---------|
| `create_payment` | Create a bank-transfer charge — returns `payment_url`, `simplified_transfer_url`, `transfer_url` |
| `get_payment` | Retrieve a payment by `payment_id` or by `notification_token` (webhook lookup) |
| `delete_payment` | Cancel a pending (unpaid) payment |
| `confirm_payment` | Manually confirm a payment (when manual confirmation is enabled) |
| `refund_payment` | Refund a paid payment (full or partial, before settlement) |
| `get_merchants` | List receiver accounts accessible with the current API key |
| `get_banks` | List Chilean banks supported by Khipu (useful for bank-selection UI) |
| `create_automatic_payment` | Charge against an enrolled subscription (recurring) |

## Install

```bash
npm install @codespar/mcp-khipu
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
