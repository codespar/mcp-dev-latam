# @codespar/mcp-stripe-acp

> MCP server for **Stripe ACP** — Agentic Commerce Protocol for AI agent checkout, payment delegation, and product management

[![npm](https://img.shields.io/npm/v/@codespar/mcp-stripe-acp)](https://www.npmjs.com/package/@codespar/mcp-stripe-acp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## What is Stripe ACP?

The **Agentic Commerce Protocol (ACP)** is an open standard co-developed by Stripe and OpenAI. It enables AI agents to complete purchases on behalf of users — the agent handles the checkout UX, while the seller handles inventory, pricing, and payment processing.

ACP is live in ChatGPT with 1M+ Shopify merchants connected.

This MCP server covers both **ACP protocol operations** (checkout sessions, payment delegation) and **standard Stripe API operations** (customers, products, invoices, subscriptions).

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "stripe-acp": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-stripe-acp"],
      "env": {
        "STRIPE_API_KEY": "sk_test_...",
        "STRIPE_ACP_BASE": "https://seller.example.com/acp"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add stripe-acp -- npx @codespar/mcp-stripe-acp
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "stripe-acp": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-stripe-acp"],
      "env": {
        "STRIPE_API_KEY": "sk_test_...",
        "STRIPE_ACP_BASE": "https://seller.example.com/acp"
      }
    }
  }
}
```

## Tools (24)

| Tool | Purpose |
|---|---|
| `create_checkout` | Create an ACP checkout session with a seller. |
| `get_checkout` | Retrieve the current state of an ACP checkout session, including status, pricing, and available payment met... |
| `update_checkout` | Update an ACP checkout session — modify quantities, shipping address, or fulfillment selections |
| `complete_checkout` | Complete an ACP checkout by submitting a payment token. |
| `cancel_checkout` | Cancel an ACP checkout session. |
| `create_customer` | Create a Stripe customer |
| `list_customers` | List Stripe customers with optional filters |
| `create_payment_link` | Create a shareable Stripe Payment Link for a price |
| `list_payment_intents` | List Stripe payment intents with optional filters |
| `create_refund` | Refund a Stripe payment intent or charge |
| `get_balance` | Get Stripe account balance |
| `list_products` | List products in the Stripe catalog |
| `create_product` | Create a new product in Stripe |
| `list_prices` | List prices for Stripe products |
| `create_invoice` | Create a draft invoice for a customer |
| `list_subscriptions` | List active Stripe subscriptions |
| `create_subscription` | Create a subscription for a customer with a recurring price |
| `cancel_subscription` | Cancel a Stripe subscription immediately or at period end |
| `create_invoice_item` | Add a line item to an upcoming or specific invoice |
| `finalize_invoice` | Finalize a draft invoice so it can be paid |
| `create_coupon` | Create a discount coupon |
| `list_disputes` | List payment disputes (chargebacks) |
| `create_checkout_session` | Create a Stripe Checkout Session (hosted payment page) |
| `get_account` | Get Stripe account info for the authenticated account |

## Authentication

Stripe uses a secret API key (or restricted key for production). Use test mode keys (`sk_test_...`) for development.

### Get your credentials

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
2. Copy your secret key (or create a restricted key with specific permissions)
3. For ACP: configure your seller's ACP endpoint URL
4. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_API_KEY` | Yes | Stripe secret or restricted API key |
| `STRIPE_ACP_BASE` | No | Seller's ACP endpoint base URL (required for ACP tools) |

## ACP Checkout Flow

```
1. Agent calls create_checkout → sends items + buyer info
2. Seller returns pricing, shipping options, payment handlers
3. Agent calls update_checkout → selects shipping, updates address
4. Checkout reaches "ready_for_payment" status
5. Agent calls complete_checkout → submits payment token
6. Seller processes payment → order confirmed
```

## Roadmap

### v0.2 (planned)
- `search_products` — Search catalog by query
- `create_checkout_link` — Generate ACP checkout URL
- `get_order_status` — Track order post-checkout
- `list_payment_handlers` — Discover available payment methods

### v0.3 (planned)
- SharedPaymentToken creation and management
- Webhook support for checkout status updates
- Multi-seller checkout orchestration

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [ACP Specification](https://www.agenticcommerce.dev)
- [ACP GitHub](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol)
- [Stripe Agent Toolkit](https://github.com/stripe/agent-toolkit)
- [Stripe API Documentation](https://docs.stripe.com/api)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
