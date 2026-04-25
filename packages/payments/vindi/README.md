# @codespar/mcp-vindi

> MCP server for **Vindi** — recurring billing, subscriptions, and payment plans

[![npm](https://img.shields.io/npm/v/@codespar/mcp-vindi)](https://www.npmjs.com/package/@codespar/mcp-vindi)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vindi": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-vindi"],
      "env": {
        "VINDI_API_KEY": "your-key"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add vindi -- npx @codespar/mcp-vindi
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "vindi": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-vindi"],
      "env": {
        "VINDI_API_KEY": "your-key"
      }
    }
  }
}
```

## Tools (20)

| Tool | Purpose |
|---|---|
| `create_subscription` | Create a recurring subscription in Vindi |
| `get_subscription` | Get subscription details by ID |
| `list_subscriptions` | List subscriptions with optional filters |
| `create_bill` | Create a bill (charge) in Vindi |
| `get_bill` | Get bill details by ID |
| `list_bills` | List bills with optional filters |
| `create_customer` | Create a customer in Vindi |
| `get_customer` | Get customer details by ID |
| `create_plan` | Create a billing plan in Vindi |
| `list_plans` | List available billing plans |
| `update_customer` | Update a customer's details |
| `create_product` | Create a product (catalog item that can be attached to plans or bills) |
| `list_products` | List products in the catalog |
| `cancel_subscription` | Cancel a subscription immediately |
| `reactivate_subscription` | Reactivate a canceled subscription |
| `cancel_bill` | Cancel a pending bill |
| `charge_bill` | Retry charging a pending bill (runs the billing workflow) |
| `refund_charge` | Refund a charge (full or partial). |
| `create_payment_profile` | Create a payment profile (tokenized card / saved payment method) for a customer |
| `list_payment_profiles` | List payment profiles, optionally filtered by customer |

## Authentication

Vindi uses Basic Auth with the API key as username and empty password.

## Sandbox / Testing

Vindi provides a sandbox via the dashboard. Use a sandbox API key for testing.

### Get your credentials

1. Go to [Vindi](https://app.vindi.com.br)
2. Create an account
3. Navigate to settings and generate your API key
4. Set the `VINDI_API_KEY` environment variable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VINDI_API_KEY` | Yes | API key from Vindi dashboard |

## Roadmap

### v0.2 (planned)
- `cancel_subscription` — Cancel an active subscription
- `update_subscription` — Update subscription details
- `list_payment_profiles` — List payment profiles for a customer
- `create_discount` — Create a discount for a subscription
- `get_charges` — Get charge details with filters

### v0.3 (planned)
- `batch_bills` — Create multiple bills in a single request
- `financial_reports` — Generate financial summary reports

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Vindi Website](https://vindi.com.br)
- [Vindi Documentation](https://atendimento.vindi.com.br/hc/pt-br)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
