# @codespar/mcp-rede

MCP server for [Rede](https://developer.userede.com.br) — Itaú-owned Brazilian card acquirer.

Rede closes the "big four" BR acquirer quadrant alongside Cielo, Stone, and Getnet. Merchants with an Itaú commercial contract integrate directly via eRede instead of going through a PSP.

## Tools

| Tool | Purpose |
|---|---|
| `authorize_transaction` | Authorize a credit card transaction (optional auto-capture) |
| `capture_transaction` | Capture a previously authorized transaction |
| `cancel_transaction` | Cancel an uncaptured authorization (refund endpoint, full amount) |
| `refund_transaction` | Refund a captured transaction (full or partial) |
| `get_transaction` | Retrieve by TID or merchant reference |
| `zero_auth` | Validate a card without charging (zero-auth / account verification) |
| `tokenize_card` | Store a card as a reusable token |
| `delete_token` | Delete a stored card token |
| `create_recurrence` | Create a native recurrence (subscription) |
| `get_recurrence` | Retrieve a recurrence by id |
| `disable_recurrence` | Disable an active recurrence |

## Install

```bash
npm install @codespar/mcp-rede
```

## Environment

```bash
REDE_PV="..."       # Merchant filiação (PV)
REDE_TOKEN="..."    # Security token (paired with PV)
REDE_ENV="sandbox"  # Optional. 'sandbox' (default) or 'production'
```

## Authentication

HTTP Basic auth with `base64(PV:TOKEN)`. The server builds the `Authorization` header on every request — transparent to callers.

## Base URLs

- Production: `https://api.userede.com.br/erede/v1`
- Sandbox:    `https://sandbox-erede.useredecloud.com.br/v1`

## Run

```bash
# stdio (default)
npx @codespar/mcp-rede

# HTTP
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-rede
```

## License

MIT
