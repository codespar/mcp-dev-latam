# @codespar/mcp-wise

MCP server for [Wise](https://wise.com) (Wise Platform API) — global multi-currency accounts, FX, and international transfers.

Wise gives multi-currency balances, mid-market FX, and cross-border payouts to 70+ currencies via local rails. This server exposes the core Platform API: profiles, quotes, recipients, transfers, balances, and webhooks.

## Tools (21)

| Tool | Purpose |
|---|---|
| `list_profiles` | List Wise profiles (personal + business) accessible to this API token. |
| `get_profile` | Fetch a single Wise profile by id. |
| `create_quote` | Create a Wise quote — locked FX rate plus payment options for a sourceCurrency / targetCurrency pair. |
| `get_quote` | Fetch a Wise quote by id (within a profile). |
| `update_quote` | Update a Wise quote (e.g. |
| `create_recipient` | Create a Wise recipient (payout account). |
| `get_recipient` | Fetch a Wise recipient by id. |
| `list_recipients` | List Wise recipients on a profile, optionally filtered by destination currency. |
| `delete_recipient` | Deactivate (soft-delete) a Wise recipient by id. |
| `list_recipient_account_requirements` | Discover required `details` fields for creating a recipient given a quote. |
| `create_transfer` | Create a Wise transfer using a quote and a recipient. |
| `get_transfer` | Fetch a Wise transfer by id. |
| `list_transfers` | List Wise transfers on a profile with optional filters (status, date range, currency). |
| `fund_transfer` | Fund a Wise transfer from a multi-currency balance. |
| `cancel_transfer` | Cancel a Wise transfer that has not yet been processed (must still be in a cancellable state — incoming_pay... |
| `list_balances` | List balance accounts on a profile. |
| `get_balance` | Fetch a single balance account by id. |
| `create_balance_account` | Open a new currency balance account on a profile (e.g. |
| `list_webhooks` | List webhook subscriptions on a profile. |
| `create_webhook` | Create a webhook subscription on a profile. |
| `delete_webhook` | Delete a webhook subscription from a profile. |

## Install

```bash
npm install @codespar/mcp-wise
```

## Environment

```bash
WISE_API_TOKEN="..."   # Bearer token, issued per profile in the Wise dashboard
WISE_ENV="sandbox"     # 'sandbox' (default) or 'live'
```

Base URLs:
- `sandbox` → `https://api.sandbox.transferwise.tech`
- `live` → `https://api.transferwise.com`

## Authentication

Bearer token. Every request sends `Authorization: Bearer ${WISE_API_TOKEN}`. Tokens are issued per profile in the Wise dashboard — keep one token per environment (sandbox / live).

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-wise

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-wise
```

## License

MIT
