# @codespar/mcp-wise

MCP server for [Wise](https://wise.com) (Wise Platform API) — global multi-currency accounts, FX, and international transfers.

Wise gives multi-currency balances, mid-market FX, and cross-border payouts to 70+ currencies via local rails. This server exposes the core Platform API: profiles, quotes, recipients, transfers, balances, and webhooks.

## Tools

| Tool | Purpose |
|------|---------|
| `list_profiles` / `get_profile` | List or fetch a profile (personal/business) |
| `create_quote` / `get_quote` / `update_quote` | Quote an FX + transfer (locked rate, fees) |
| `create_recipient` / `get_recipient` / `list_recipients` / `delete_recipient` | Manage payout recipients |
| `list_recipient_account_requirements` | Discover required bank fields per currency/country |
| `create_transfer` / `get_transfer` / `list_transfers` | Create and track international transfers |
| `fund_transfer` | Fund a transfer from a balance account |
| `cancel_transfer` | Cancel a transfer that has not yet been processed |
| `list_balances` / `get_balance` / `create_balance_account` | Multi-currency balance accounts |
| `list_webhooks` / `create_webhook` / `delete_webhook` | Subscribe to event notifications |

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
