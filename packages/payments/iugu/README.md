# @codespar/mcp-iugu

> MCP server for **iugu** — invoices, subscriptions, and payment management

[![npm](https://img.shields.io/npm/v/@codespar/mcp-iugu)](https://www.npmjs.com/package/@codespar/mcp-iugu)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "iugu": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-iugu"],
      "env": {
        "IUGU_API_TOKEN": "your-token"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add iugu -- npx @codespar/mcp-iugu
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "iugu": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-iugu"],
      "env": {
        "IUGU_API_TOKEN": "your-token"
      }
    }
  }
}
```

## Tools (23)

| Tool | Purpose |
|---|---|
| `create_invoice` | Create an invoice in iugu (Pix, boleto, or credit card) |
| `get_invoice` | Get invoice details by ID |
| `list_invoices` | List invoices with optional filters |
| `cancel_invoice` | Cancel (delete) an invoice. |
| `refund_invoice` | Refund a paid invoice (full or partial). |
| `duplicate_invoice` | Duplicate an existing invoice with a new due date. |
| `create_customer` | Create a customer in iugu |
| `update_customer` | Update a customer. |
| `list_customers` | List customers with optional filters |
| `create_plan` | Create a subscription plan (recurring template). |
| `update_plan` | Update an existing plan. |
| `list_plans` | List subscription plans. |
| `create_subscription` | Create a recurring subscription in iugu |
| `suspend_subscription` | Suspend a subscription. |
| `activate_subscription` | Reactivate a suspended subscription. |
| `cancel_subscription` | Cancel (delete) a subscription. |
| `create_payment_token` | Tokenize a credit card server-side. |
| `create_payment_method` | Attach a payment method (credit card token) to a customer. |
| `create_subaccount` | Create a marketplace sub-account. |
| `create_transfer` | Transfer funds between iugu accounts (marketplace). |
| `request_withdraw` | Request a bank withdrawal (saque) from a sub-account. |
| `create_webhook` | Register a webhook (gatilho) for an iugu event. |
| `get_account_info` | Get account information, configuration, and balance |

## Authentication

iugu uses Basic Auth with the API token as username and an empty password.

## Sandbox / Testing

iugu provides test mode via the dashboard. Use a test-mode API token to avoid real charges.

### Get your credentials

1. Go to [iugu Developer Portal](https://dev.iugu.com)
2. Create an account and access the dashboard
3. Toggle to test mode and generate an API token
4. Set the `IUGU_API_TOKEN` environment variable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `IUGU_API_TOKEN` | Yes | API token from iugu dashboard |
| `IUGU_SANDBOX` | No | Set to `"true"` for test mode |

## Roadmap

### v0.3 (planned)
- `create_split` — Create split payment rules
- `list_transfers` — List marketplace transfers
- `get_financial_report` — Financial summary report
- `batch_invoices` — Create multiple invoices in a single request
- `list_payment_methods` — List saved payment methods for a customer

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [iugu Website](https://iugu.com)
- [iugu API Documentation](https://dev.iugu.com)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
