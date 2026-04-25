# @codespar/mcp-stripe

> MCP server for **Stripe** — global standard-bearer payments API

[![npm](https://img.shields.io/npm/v/@codespar/mcp-stripe)](https://www.npmjs.com/package/@codespar/mcp-stripe)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Stripe vs. Stripe ACP

Two Stripe MCP servers live in the CodeSpar catalog — different products:

| Package | Wraps | When to use |
|---|---|---|
| **`@codespar/mcp-stripe`** (this package) | Stripe's regular payments API (PaymentIntents, Checkout, Billing) | You are already using Stripe to accept payments today — the 99% case for LatAm SaaS that ship with Stripe. |
| `@codespar/mcp-stripe-acp` | Stripe's Agentic Commerce Protocol | You are building on Stripe's new agent-native checkout spec. Much narrower product, bleeding edge. |

If you are a typical SaaS with Stripe as your PSP, **this is the package**.

## Why Stripe in the CodeSpar catalog?

Stripe is the global standard-bearer for developer-first payments. Nearly every LatAm SaaS that bills international cards ships with Stripe — Truora, Platzi, Rappi Pay (for some flows), countless Y Combinator LatAm companies. Adding Stripe lets agents operate the payments stack those SaaS already run, without forcing a migration to a local-first gateway.

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "stripe": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-stripe"],
      "env": {
        "STRIPE_SECRET_KEY": "sk_test_..."
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add stripe -- npx @codespar/mcp-stripe
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "stripe": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-stripe"],
      "env": {
        "STRIPE_SECRET_KEY": "sk_test_..."
      }
    }
  }
}
```

## Tools (30)

| Tool | Purpose |
|---|---|
| `create_payment_intent` | Create a PaymentIntent — Stripe's modern primitive for charging a customer. |
| `confirm_payment_intent` | Confirm a PaymentIntent created with confirm=false. |
| `retrieve_payment_intent` | Retrieve a PaymentIntent by id. |
| `cancel_payment_intent` | Cancel a PaymentIntent. |
| `list_payment_intents` | List PaymentIntents. |
| `create_refund` | Refund a charge or a PaymentIntent. |
| `list_refunds` | List Refunds. |
| `create_customer` | Create a Stripe Customer. |
| `retrieve_customer` | Retrieve a Customer by id. |
| `update_customer` | Update a Customer. |
| `create_product` | Create a Product — the catalog entity Prices reference. |
| `list_products` | List Products. |
| `create_price` | Create a Price attached to a Product. |
| `list_prices` | List Prices. |
| `create_subscription` | Create a Subscription for an existing customer. |
| `update_subscription` | Update a Subscription. |
| `cancel_subscription` | Cancel a Subscription. |
| `list_subscriptions` | List Subscriptions. |
| `create_checkout_session` | Create a hosted Checkout Session. |
| `create_payment_link` | Create a long-lived Payment Link (shareable URL) that charges a price or set of line items. |
| `list_payment_links` | List Payment Links. |
| `create_invoice` | Create an Invoice draft for a customer. |
| `list_invoices` | List Invoices. |
| `finalize_invoice` | Finalize a draft Invoice. |
| `send_invoice` | Send a finalized Invoice to the customer by email. |
| `pay_invoice` | Attempt to collect payment on an open Invoice. |
| `void_invoice` | Void a finalized Invoice. |
| `update_dispute` | Submit evidence on a Dispute. |
| `list_disputes` | List Disputes. |
| `retrieve_balance` | Retrieve the current Stripe account balance — available, pending, and connect_reserved funds broken down by... |

## Authentication

Stripe uses a single secret key. The key prefix selects the environment:

- `sk_test_...` → test mode (no real money moves)
- `sk_live_...` → live mode

There is **no separate base URL** — the key itself routes requests. Set `STRIPE_SECRET_KEY` and you are done.

Request bodies are `application/x-www-form-urlencoded` with bracket notation (`customer[name]=Foo`, `metadata[order]=123`, `expand[]=latest_invoice`). This server handles nested objects and arrays for you.

### Pinning an API version

Stripe auto-upgrades breaking changes on a calendar cadence. If you want to lock the version your agent sees, set `STRIPE_API_VERSION` (e.g. `2024-06-20`). The server passes it as the `Stripe-Version` header on every call.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes | `sk_test_...` or `sk_live_...` from Stripe Dashboard > Developers > API keys |
| `STRIPE_API_VERSION` | No | Pin API version via the `Stripe-Version` header (e.g. `2024-06-20`) |

## Sandbox / Testing

Every Stripe account has test mode built in — no separate signup. Use a `sk_test_...` key and any of Stripe's [test cards](https://stripe.com/docs/testing) (e.g. `4242 4242 4242 4242`).

### Get your credentials

1. Sign up at [stripe.com](https://stripe.com)
2. Go to Dashboard > Developers > API keys
3. Copy your **Secret key** (test mode by default)
4. Set `STRIPE_SECRET_KEY`

## Roadmap

### v0.2 (planned)
- `update_payment_intent`, `capture_payment_intent` (separate capture)
- `retrieve_refund`, `list_refunds`
- `list_customers`, `search_customers`
- `update_subscription`, `retrieve_subscription`
- `retrieve_invoice`, `finalize_invoice`, `pay_invoice`, `send_invoice`, `void_invoice`
- `create_invoice_item`, `list_invoice_items`
- `create_price`, `create_product`
- `list_charges`, `retrieve_charge`
- `retrieve_dispute`, `close_dispute`, `list_disputes`

### v0.3 (planned)
- Stripe Connect: accounts, account links, transfers, payouts
- `create_setup_intent`, `confirm_setup_intent` (saving cards for later)
- PaymentMethod attach / detach / list
- Webhook event construction helper

Want a tool sooner? [Open an issue](https://github.com/codespar/mcp-dev-brasil/issues) or [PR](https://github.com/codespar/mcp-dev-brasil).

## Links

- [Stripe website](https://stripe.com)
- [Stripe API docs](https://stripe.com/docs/api)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing page](https://codespar.dev/mcp)

## Enterprise

Need governance, spend caps, and audit trails for agent-initiated charges, refunds, and subscription changes? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
