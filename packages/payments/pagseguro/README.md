# @codespar/mcp-pagseguro

> MCP server for **PagSeguro/PagBank** — orders, charges, Pix, boleto, and credit card payments

[![npm](https://img.shields.io/npm/v/@codespar/mcp-pagseguro)](https://www.npmjs.com/package/@codespar/mcp-pagseguro)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pagseguro": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-pagseguro"],
      "env": {
        "PAGSEGURO_TOKEN": "your-token",
        "PAGSEGURO_SANDBOX": "true"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add pagseguro -- npx @codespar/mcp-pagseguro
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "pagseguro": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-pagseguro"],
      "env": {
        "PAGSEGURO_TOKEN": "your-token",
        "PAGSEGURO_SANDBOX": "true"
      }
    }
  }
}
```

## Tools (24)

| Tool | Purpose |
|---|---|
| `create_order` | Create an order in PagSeguro (Pix, boleto, or credit card) |
| `get_order` | Get order details by ID |
| `list_orders` | List orders with optional filters |
| `create_charge` | Create a standalone charge |
| `refund` | Refund a charge (full or partial) |
| `get_pix_qrcode` | Get Pix QR code payload and image for an order charge |
| `create_customer` | Create a customer in PagSeguro |
| `get_balance` | Get account balance |
| `create_subscription` | Create a recurring subscription plan in PagSeguro |
| `list_subscriptions` | List subscriptions with optional filters |
| `get_notifications` | Get payment notification details by notification code |
| `create_split` | Create a split payment configuration for marketplace transactions |
| `get_dispute` | Get dispute/chargeback details by ID |
| `pay_order` | Pay an existing order (attach a charge/payment to an order in CREATED state) |
| `get_charge` | Get charge details by ID |
| `list_charges` | List charges with optional filters |
| `capture_charge` | Capture a pre-authorized credit card charge |
| `cancel_charge` | Cancel a charge that has not yet been settled |
| `create_boleto` | Create a boleto charge |
| `get_boleto` | Get boleto charge details by ID |
| `get_public_keys` | Get PagSeguro public key for card data encryption (type: card) |
| `create_payout` | Create a payout/transfer to a bank account or Pix key |
| `create_webhook` | Register an application webhook URL to receive event notifications |
| `list_webhooks` | List registered application webhooks |

## Authentication

PagSeguro uses a Bearer token for authentication. Generate your token from the PagBank developer portal.

## Sandbox / Testing

PagSeguro provides a sandbox at `sandbox.api.pagseguro.com`. Set `PAGSEGURO_SANDBOX=true` to use it.

### Get your credentials

1. Go to [PagBank Developer Portal](https://developer.pagbank.com.br)
2. Create a developer account
3. Generate your API token
4. Set the `PAGSEGURO_TOKEN` environment variable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PAGSEGURO_TOKEN` | Yes | Bearer token from PagBank |
| `PAGSEGURO_SANDBOX` | No | Set to `"true"` for sandbox mode |

## Roadmap

### v0.2 (planned)
- `create_subscription` — Create a recurring subscription
- `list_subscriptions` — List all subscriptions with filters
- `get_notifications` — Get payment notifications/webhooks
- `create_split` — Create split payments between receivers
- `get_dispute` — Get dispute/chargeback details

### v0.3 (planned)
- `create_plan` — Create a subscription plan
- `get_installments` — Get installment options for a payment
- `batch_refunds` — Process multiple refunds in a single request

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [PagBank Website](https://pagseguro.uol.com.br)
- [PagBank API Documentation](https://developer.pagbank.com.br)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
