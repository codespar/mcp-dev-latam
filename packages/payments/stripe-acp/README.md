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

## Tools

### ACP Protocol

| Tool | Description |
|------|-------------|
| `create_checkout` | Create an ACP checkout session with a seller |
| `get_checkout` | Retrieve checkout session state and pricing |
| `update_checkout` | Update quantities, address, fulfillment |
| `complete_checkout` | Submit payment token and finalize order |
| `cancel_checkout` | Cancel session and release inventory |

### Stripe Core

| Tool | Description |
|------|-------------|
| `create_customer` | Create a Stripe customer |
| `list_customers` | List customers with filters |
| `create_payment_link` | Create a shareable payment link |
| `list_payment_intents` | List payment intents |
| `create_refund` | Refund a payment |
| `get_balance` | Get account balance |
| `list_products` | List products in catalog |
| `create_product` | Create a new product |
| `list_prices` | List prices for products |
| `create_invoice` | Create a draft invoice |
| `list_subscriptions` | List active subscriptions |

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

## License

MIT
