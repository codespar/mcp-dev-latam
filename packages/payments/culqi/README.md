# @codespar/mcp-culqi

MCP server for [Culqi](https://culqi.com) — Peru's default PSP.

Culqi is the Stripe of Peru: the standard rail for Peruvian D2C brands and SaaS. It ships CulqiOnline (hosted checkout), CulqiLink (payment links), and CulqiFull (subscriptions). Adding Culqi brings Peru into the CodeSpar catalog alongside Mexico, Brazil, Colombia, Argentina, and Chile.

## Tools

| Tool | Purpose |
|------|---------|
| `create_token` | Tokenize a card (POST /tokens) — usually client-side, server-side for testing |
| `create_charge` | Charge a card or token (POST /charges) in PEN or USD |
| `get_charge` | Retrieve a charge by id |
| `refund_charge` | Refund a captured charge (full or partial) |
| `create_customer` | Create a customer record |
| `create_card` | Attach a tokenized card to a customer for reuse |
| `create_plan` | Create a subscription plan |
| `create_subscription` | Subscribe a customer's card to a plan (CulqiFull) |
| `cancel_subscription` | Cancel an active subscription |
| `list_events` | List webhook events with filters (type, date range) |

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
