# @codespar/mcp-braintree

MCP server for [Braintree](https://www.braintreepayments.com) (PayPal) — global card processing via the Braintree **GraphQL** API.

Target customer: LatAm SaaS selling to US/EU buyers who already hold a Braintree merchant account and want agent-driven payments, vaulting, and customer management.

## Tools (22)

| Tool | Purpose |
|---|---|
| `authorize_transaction` | Authorize a transaction (reserve funds without capturing) via Braintree GraphQL authorizePaymentMethod. |
| `charge_transaction` | Authorize and capture a transaction atomically via Braintree GraphQL chargePaymentMethod. |
| `capture_transaction` | Capture a previously authorized transaction via captureTransaction. |
| `refund_transaction` | Refund a settled transaction via refundTransaction. |
| `void_transaction` | Void an unsettled transaction (reverse the authorization) via reverseTransaction. |
| `vault_payment_method` | Permanently store a tokenized payment method in the Braintree vault via vaultPaymentMethod. |
| `delete_payment_method` | Delete a vaulted payment method via deletePaymentMethodFromVault. |
| `create_customer` | Create a Braintree customer via createCustomer. |
| `update_customer` | Update an existing Braintree customer via updateCustomer. |
| `get_transaction` | Fetch a transaction by id via the GraphQL search.transactions query. |
| `get_customer` | Fetch a customer by id via the GraphQL node(id:) query. |
| `submit_for_settlement` | Submit a previously authorized transaction for settlement via submitTransactionForSettlement. |
| `update_payment_method` | Update metadata on a vaulted payment method via updatePaymentMethod. |
| `verify_payment_method` | Run a credit-card verification (zero-auth or $1 auth) on a tokenized payment method via verifyPaymentMethod. |
| `delete_customer` | Delete a Braintree customer via deleteCustomer. |
| `find_customer` | Search for customers via the GraphQL search.customers query. |
| `search_transactions` | Search transactions via the GraphQL search.transactions query. |
| `find_dispute` | Fetch a dispute by id via the GraphQL node(id:) query. |
| `accept_dispute` | Accept liability for a dispute via acceptDispute — the merchant concedes and the disputed amount is refunde... |
| `finalize_dispute` | Finalize a dispute via finalizeDispute — submits previously added evidence to the card network for review. |
| `find_merchant_account` | Fetch a merchant account by id via the GraphQL node(id:) query. |
| `create_client_token` | Mint a Braintree client token via createClientToken for client-side tokenization (Drop-in, Hosted Fields, m... |

## Install

```bash
npm install @codespar/mcp-braintree
```

## Environment

```bash
BRAINTREE_MERCHANT_ID="..."   # merchant id
BRAINTREE_PUBLIC_KEY="..."    # public API key (Basic auth user)
BRAINTREE_PRIVATE_KEY="..."   # private API key (Basic auth password, secret)
BRAINTREE_ENV="sandbox"       # 'sandbox' (default) or 'production'
BRAINTREE_API_VERSION="2019-01-01"  # optional, Braintree-Version header
```

Endpoints:
- `sandbox` → `https://payments.sandbox.braintree-api.com/graphql`
- `production` → `https://payments.braintree-api.com/graphql`

## Authentication

Braintree's GraphQL endpoint accepts HTTP Basic auth with `PUBLIC_KEY:PRIVATE_KEY` base64-encoded. Every request also requires a `Braintree-Version: YYYY-MM-DD` header — the server defaults to `2019-01-01` and can be overridden with `BRAINTREE_API_VERSION`.

## Payment method ids

Most mutations take a **paymentMethodId**. These come from client-side tokenization (Braintree Drop-in / Hosted Fields / SDKs) — the server does not accept raw PANs. Use `create_client_token` to mint a token for the browser or mobile SDK.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-braintree

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-braintree
```

## Notes

- **Amount** is a string in Braintree GraphQL (e.g. `"10.50"`), not a number. The server forwards whatever shape the agent passes; strings are the safe default.
- Braintree's GraphQL schema evolves; some input fields not exposed in the MCP `inputSchema` can still be passed in `additional` / nested objects and will be forwarded.

## License

MIT
