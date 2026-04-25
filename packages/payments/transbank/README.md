# @codespar/mcp-transbank

MCP server for [Transbank](https://www.transbankdevelopers.cl) — Chile's dominant card acquirer.

Transbank is effectively default for Chilean commerce (state-origin roots, owned by a consortium of Chilean banks). Shipping this server is a prerequisite for any "CodeSpar covers LatAm" claim that includes Chile.

Two products are covered:

- **Webpay Plus** — one-shot redirect payments (`buy_order` + `amount`, user is redirected to Webpay to pay).
- **Webpay OneClick Mall** — tokenized recurring / card-on-file payments that can split across multiple merchant codes (the "mall" model).

## Tools (19)

| Tool | Purpose |
|---|---|
| `webpay_create_transaction` | Create a Webpay Plus transaction. |
| `webpay_commit_transaction` | Commit a Webpay Plus transaction after the user has returned from the Webpay flow. |
| `webpay_get_transaction_status` | Get the current status of a Webpay Plus transaction by token. |
| `webpay_refund_transaction` | Refund a committed Webpay Plus transaction. |
| `webpay_increase_amount` | Capture a previously authorized Webpay Plus transaction (partial-capture / deferred-capture flow). |
| `webpay_capture_transaction` | Deferred-capture for a previously authorized Webpay Plus transaction. |
| `webpay_mall_create_transaction` | Create a Webpay Mall transaction — one parent buy_order split across several seller commerce codes. |
| `webpay_mall_commit_transaction` | Commit a Webpay Mall transaction after the user has returned. |
| `webpay_mall_get_transaction_status` | Get the status of a Webpay Mall transaction by token (includes per-child details). |
| `webpay_mall_refund_transaction` | Refund one child seller of a Webpay Mall transaction. |
| `webpay_mall_capture_transaction` | Deferred-capture for one child seller inside a Webpay Mall transaction. |
| `oneclick_create_inscription` | Start a OneClick Mall card-enrollment flow. |
| `oneclick_finish_inscription` | Finalize a OneClick Mall enrollment after the user has returned. |
| `oneclick_delete_inscription` | Delete (revoke) a stored OneClick Mall card for a user. |
| `oneclick_authorize` | Charge a stored OneClick Mall card across one or more mall merchant codes. |
| `oneclick_capture` | Capture a previously authorized OneClick Mall charge (deferred-capture flow). |
| `oneclick_refund` | Refund a OneClick Mall charge. |
| `oneclick_status` | Get the status of a OneClick Mall transaction by parent buy_order. |
| `oneclick_get_transaction_by_buy_order` | Look up a OneClick Mall transaction by parent buy_order. |

## Install

```bash
npm install @codespar/mcp-transbank@alpha
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
