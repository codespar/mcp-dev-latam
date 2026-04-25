# @codespar/mcp-asaas

> MCP server for **Asaas** — billing automation with Pix, boleto, and credit card payments

[![npm](https://img.shields.io/npm/v/@codespar/mcp-asaas)](https://www.npmjs.com/package/@codespar/mcp-asaas)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "asaas": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-asaas"],
      "env": {
        "ASAAS_API_KEY": "your-key",
        "ASAAS_SANDBOX": "true"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add asaas -- npx @codespar/mcp-asaas
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "asaas": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-asaas"],
      "env": {
        "ASAAS_API_KEY": "your-key",
        "ASAAS_SANDBOX": "true"
      }
    }
  }
}
```

## Tools (24)

| Tool | Purpose |
|---|---|
| `create_payment` | Create a payment in Asaas (Pix, boleto, or credit card) |
| `get_payment` | Get payment details by ID |
| `list_payments` | List payments with optional filters |
| `get_pix_qrcode` | Get Pix QR code for a payment (returns payload and image) |
| `get_boleto` | Get boleto digitable line and barcode for a payment |
| `create_customer` | Create a customer in Asaas |
| `list_customers` | List customers with optional filters |
| `create_subscription` | Create a recurring subscription |
| `get_balance` | Get current account balance |
| `list_subscriptions` | List subscriptions with optional filters |
| `cancel_subscription` | Cancel a subscription by ID |
| `get_webhook_events` | List webhook events (payment confirmations, transfers, etc.) |
| `create_subaccount` | Create a subaccount for payment splitting |
| `get_installments` | Get installment details for a payment |
| `create_transfer` | Create a bank transfer (Pix out or TED) |
| `create_pix_qrcode` | Generate a static PIX QR code for receiving payments |
| `list_transfers` | List transfers with optional filters |
| `create_notification` | Create a webhook notification configuration |
| `list_notifications` | List webhook notification configurations |
| `get_customer` | Get customer details by ID |
| `update_payment` | Update a pending payment |
| `delete_payment` | Delete a payment by ID |
| `refund_payment` | Refund a received payment |
| `get_subscription` | Get subscription details by ID |

## Authentication

Asaas uses an API key passed via the `access_token` header. You can generate your key from the Asaas dashboard.

## Sandbox / Testing

Asaas provides a full sandbox environment at `sandbox.asaas.com`. Set `ASAAS_SANDBOX=true` to use it.

### Get your credentials

1. Go to [Asaas](https://www.asaas.com)
2. Create an account or sign up for sandbox at [sandbox.asaas.com](https://sandbox.asaas.com)
3. Navigate to **Integracoes > API** and generate your API key
4. Set the `ASAAS_API_KEY` environment variable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ASAAS_API_KEY` | Yes | API key from Asaas dashboard |
| `ASAAS_SANDBOX` | No | Set to `"true"` for sandbox mode |

## Roadmap

### v0.2 (planned)
- `list_subscriptions` — List all recurring subscriptions with filters
- `cancel_subscription` — Cancel an active subscription
- `get_webhook_events` — List webhook events for debugging integrations
- `create_subaccount` — Create a subaccount for marketplace splits
- `get_installments` — Get installment details for a payment

### v0.3 (planned)
- `create_anticipation` — Request anticipation of receivables
- `get_fiscal_info` — Get fiscal/tax information for payments
- `batch_payments` — Create multiple payments in a single request

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Asaas Website](https://www.asaas.com)
- [Asaas API Documentation](https://docs.asaas.com)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
