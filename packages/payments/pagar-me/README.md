# @codespar/mcp-pagar-me

> MCP server for **Pagar.me** — Stone ecosystem payments with orders, charges, and split payments

[![npm](https://img.shields.io/npm/v/@codespar/mcp-pagar-me)](https://www.npmjs.com/package/@codespar/mcp-pagar-me)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pagar-me": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-pagar-me"],
      "env": {
        "PAGARME_API_KEY": "sk_your-key"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add pagar-me -- npx @codespar/mcp-pagar-me
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "pagar-me": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-pagar-me"],
      "env": {
        "PAGARME_API_KEY": "sk_your-key"
      }
    }
  }
}
```

## Tools

### Orders & Charges
| Tool | Description |
|------|-------------|
| `create_order` | Create an order in Pagar.me with items and payment |
| `get_order` | Get order details by ID |
| `list_orders` | List orders with optional filters |
| `create_charge` | Create a charge (Pix, boleto, or credit card) |
| `get_charge` | Get charge details by ID |
| `capture_charge` | Capture a pre-authorized charge (auth-then-capture flow) |
| `refund` | Refund a charge (full or partial) |
| `partial_refund` | Explicit partial refund with required amount |

### Recipients & Money Movement
| Tool | Description |
|------|-------------|
| `create_recipient` | Create a recipient for split payments |
| `list_recipients` | List recipients with optional filters |
| `get_balance` | Get current account balance |
| `create_transfer` | Create a transfer to a recipient |
| `create_withdrawal` | Withdraw recipient balance to their bank account |

### Anticipations
| Tool | Description |
|------|-------------|
| `create_anticipation` | Request anticipation of receivables |
| `get_anticipation` | Get anticipation details |
| `get_anticipation_limits` | Get anticipation limits for a recipient |

### Subscriptions
| Tool | Description |
|------|-------------|
| `create_plan` | Create a subscription plan |
| `update_plan` | Update plan name/description/status |
| `create_subscription` | Create a recurring subscription |
| `cancel_subscription` | Cancel a subscription |

### Tokens & Webhooks
| Tool | Description |
|------|-------------|
| `create_card_token` | Tokenize a credit card (PCI-safe, uses public key) |
| `register_webhook` | Register a webhook endpoint for events |

## Authentication

Pagar.me uses Basic Auth with the secret key (sk_xxx) as username and empty password.

## Sandbox / Testing

Pagar.me provides test mode via the dashboard. Use a test-mode API key to avoid real charges.

### Get your credentials

1. Go to [Pagar.me Dashboard](https://dash.pagar.me)
2. Create an account
3. Get your secret key (sk_test_xxx for test mode)
4. Set the `PAGARME_API_KEY` environment variable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PAGARME_API_KEY` | Yes | Secret key (sk_xxx) from Pagar.me dashboard |
| `PAGARME_PUBLIC_KEY` | No | Public key (pk_xxx) for `create_card_token` only |

## Roadmap

### v0.3 (planned)
- `list_charges` — List charges with filters
- `list_subscriptions` — List subscriptions
- `list_plans` — List plans
- `batch_charges` — Create multiple charges in a single request
- `list_webhooks` / `delete_webhook` — Full webhook management

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Pagar.me Website](https://pagar.me)
- [Pagar.me API Documentation](https://docs.pagar.me)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
