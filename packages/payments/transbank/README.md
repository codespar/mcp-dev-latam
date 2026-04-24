# @codespar/mcp-transbank

MCP server for [Transbank](https://www.transbankdevelopers.cl) — Chile's dominant card acquirer.

Transbank is effectively default for Chilean commerce (state-origin roots, owned by a consortium of Chilean banks). Shipping this server is a prerequisite for any "CodeSpar covers LatAm" claim that includes Chile.

Two products are covered:

- **Webpay Plus** — one-shot redirect payments (`buy_order` + `amount`, user is redirected to Webpay to pay).
- **Webpay OneClick Mall** — tokenized recurring / card-on-file payments that can split across multiple merchant codes (the "mall" model).

## Tools

### Webpay Plus (single payments)

| Tool | Purpose |
|------|---------|
| `webpay_create_transaction` | Start a transaction, returns token + redirect URL |
| `webpay_commit_transaction` | Commit after user returns to merchant site |
| `webpay_get_transaction_status` | Look up status by token |
| `webpay_refund_transaction` | Full or partial refund |
| `webpay_increase_amount` | Capture a partial / deferred authorization |

### Webpay OneClick Mall (recurring / stored cards)

| Tool | Purpose |
|------|---------|
| `oneclick_create_inscription` | Start card-enrollment flow |
| `oneclick_finish_inscription` | Finalize enrollment, returns `tbk_user` |
| `oneclick_delete_inscription` | Revoke a stored card |
| `oneclick_authorize` | Charge stored card across mall sellers |
| `oneclick_capture` | Capture a previously authorized charge |
| `oneclick_refund` | Refund a mall charge |
| `oneclick_status` | Look up OneClick transaction status |

## Install

```bash
npm install @codespar/mcp-transbank
```

## Environment

```bash
TRANSBANK_COMMERCE_CODE="..."   # merchant commerce code (Tbk-Api-Key-Id)
TRANSBANK_API_KEY_SECRET="..."  # secret key (Tbk-Api-Key-Secret)
TRANSBANK_ENV="integration"     # 'integration' (default) or 'production'
```

Integration base URL: `https://webpay3gint.transbank.cl`
Production base URL: `https://webpay3g.transbank.cl`

## Authentication

Every request sends two headers:

```
Tbk-Api-Key-Id: <commerce_code>
Tbk-Api-Key-Secret: <api_key_secret>
Content-Type: application/json
```

The server handles headers automatically — you only configure the env vars.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-transbank

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-transbank
```

## Webpay Plus flow

1. Call `webpay_create_transaction` with `buy_order`, `session_id`, `amount`, `return_url`.
2. Redirect user to `url?token_ws=<token>`.
3. User pays at Webpay, is redirected back to `return_url`.
4. Call `webpay_commit_transaction` with the returned token to actually charge.

## OneClick Mall flow

1. Call `oneclick_create_inscription` with `username`, `email`, `response_url`. Redirect user to `url_webpay`.
2. After user returns, call `oneclick_finish_inscription`. Store the returned `tbk_user` against your user.
3. To charge later, call `oneclick_authorize` with `username`, `tbk_user`, a parent mall `buy_order`, and a `details` array (one entry per child merchant).

## License

MIT
