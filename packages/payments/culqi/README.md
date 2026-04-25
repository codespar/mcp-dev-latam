# @codespar/mcp-culqi

MCP server for [Culqi](https://culqi.com) — Peru's default PSP.

Culqi is the Stripe of Peru: the standard rail for Peruvian D2C brands and SaaS. It ships CulqiOnline (hosted checkout), CulqiLink (payment links), and CulqiFull (subscriptions). Adding Culqi brings Peru into the CodeSpar catalog alongside Mexico, Brazil, Colombia, Argentina, and Chile.

## Tools (20)

| Tool | Purpose |
|---|---|
| `create_token` | Tokenize a card (POST /tokens). |
| `create_charge` | Create a charge (POST /charges). |
| `get_charge` | Retrieve a charge by Culqi id. |
| `list_charges` | List charges (GET /charges) with optional filters. |
| `capture_charge` | Capture a previously-authorized charge (POST /charges/{id}/capture). |
| `refund_charge` | Refund a captured charge (POST /refunds). |
| `get_refund` | Retrieve a refund by id (GET /refunds/{id}). |
| `create_customer` | Create a customer record (POST /customers). |
| `get_customer` | Retrieve a customer by Culqi id (GET /customers/{id}). |
| `list_customers` | List customers (GET /customers) with optional filters passed as query params: first_name, last_name, email,... |
| `create_card` | Attach a tokenized card to a customer for reuse (POST /cards). |
| `delete_card` | Detach a saved card from its customer (DELETE /cards/{id}). |
| `create_order` | Create an order (POST /orders) for non-card payment methods — Yape, PagoEfectivo (Cash), bank transfer. |
| `confirm_order` | Confirm an unpaid order (POST /orders/{id}/confirm). |
| `list_orders` | List orders (GET /orders) with optional filters passed as query params: order_number, state (created, paid,... |
| `create_plan` | Create a subscription plan (POST /plans). |
| `create_subscription` | Subscribe a customer's saved card to a plan (POST /subscriptions). |
| `cancel_subscription` | Cancel an active subscription (DELETE /subscriptions/{id}). |
| `list_events` | List webhook events (GET /events) with optional filters. |
| `get_event` | Retrieve a single webhook event by id (GET /events/{id}). |

## Install

```bash
npm install @codespar/mcp-culqi
```

## Environment

```bash
CULQI_SECRET_KEY="sk_test_..."   # or sk_live_... for production
```

Culqi has no separate sandbox URL — the key prefix (`sk_test_` vs `sk_live_`) selects the environment.

## Authentication

Bearer token on every request:

```
Authorization: Bearer <CULQI_SECRET_KEY>
Content-Type: application/json
```

Base URL: `https://api.culqi.com/v2`.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-culqi

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-culqi
```

## Notes

- **Amounts** are in cents of the currency (e.g. `1000` = S/ 10.00 PEN).
- **Currencies** supported: `PEN`, `USD`.
- **Tokenization** of raw card data is typically done client-side (culqi.js / mobile SDKs). The `create_token` tool is primarily for test scripts — never send real PANs from a backend without PCI scope.
- **Subscriptions** require `tyc: true` (terms & conditions acceptance) on creation.

## License

MIT
