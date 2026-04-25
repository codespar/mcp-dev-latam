# @codespar/mcp-stark-bank

> MCP server for **Stark Bank** — digital banking with transfers, boletos, invoices, and Pix

[![npm](https://img.shields.io/npm/v/@codespar/mcp-stark-bank)](https://www.npmjs.com/package/@codespar/mcp-stark-bank)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "stark-bank": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-stark-bank"],
      "env": {
        "STARK_BANK_ACCESS_TOKEN": "your-token",
        "STARK_BANK_SANDBOX": "true"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add stark-bank -- npx @codespar/mcp-stark-bank
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "stark-bank": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-stark-bank"],
      "env": {
        "STARK_BANK_ACCESS_TOKEN": "your-token",
        "STARK_BANK_SANDBOX": "true"
      }
    }
  }
}
```

## Tools (27)

| Tool | Purpose |
|---|---|
| `create_transfer` | Create a bank transfer (Pix or TED) |
| `get_transfer` | Get transfer details by ID |
| `list_transfers` | List transfers with optional filters |
| `create_boleto` | Create a boleto payment |
| `get_balance` | Get current account balance |
| `create_invoice` | Create an invoice (generates Pix QR code) |
| `get_invoice` | Get invoice details by ID |
| `list_invoices` | List invoices with optional filters |
| `create_pix_request` | Create a Pix payment request |
| `get_webhook_events` | Get webhook events (payment confirmations, transfers, etc.) |
| `create_payment_request` | Create a payment request for approval workflow |
| `get_payment_request` | Get payment request details by ID |
| `list_payment_requests` | List payment requests with optional filters |
| `create_brcode_payment` | Pay a BR Code (Pix QR code / copia-e-cola) |
| `get_deposit` | Get deposit details by ID (incoming Pix or TED) |
| `create_boleto_issue` | Issue a boleto receivable (generates barcode/digitable line to collect payment) |
| `get_boleto` | Get an issued boleto by ID |
| `list_boletos` | List issued boletos with optional filters |
| `delete_boleto` | Cancel an issued boleto (only allowed while unpaid / in 'created' or 'registered' state) |
| `create_pix_key` | Register a Pix key (CPF/CNPJ, email, phone, or EVP/random) |
| `get_pix_key` | Get Pix key details by ID |
| `list_pix_keys` | List registered Pix keys with optional filters |
| `delete_pix_key` | Cancel / deregister a Pix key |
| `list_deposits` | List deposits (incoming Pix or TED) with optional filters |
| `create_utility_payment` | Pay a utility bill (e.g. |
| `create_tax_payment` | Pay a tax (DARF, GPS, GRU, etc.) by barcode / digitable line |
| `list_workspaces` | List workspaces the organization has access to (multi-tenant subaccounts) |

## Authentication

Stark Bank uses a Bearer token for API authentication.

## Sandbox / Testing

Stark Bank provides a sandbox at `sandbox.api.starkbank.com`. Set `STARK_BANK_SANDBOX=true` to use it.

### Get your credentials

1. Go to [Stark Bank](https://starkbank.com)
2. Create an account
3. Generate an API access token from the dashboard
4. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STARK_BANK_ACCESS_TOKEN` | Yes | API access token |
| `STARK_BANK_SANDBOX` | No | Set to `"true"` for sandbox mode |

## Roadmap

### v0.2 (planned)
- `create_payment_request` — Create a payment request
- `get_payment_request` — Get payment request details
- `list_payment_requests` — List payment requests with filters
- `create_brcode_payment` — Create a BR Code (Pix) payment
- `get_deposit` — Get deposit details

### v0.3 (planned)
- `create_workspace` — Create a new workspace
- `tax_payment` — Create a tax payment (DAS, DARF, etc.)
- `utility_payment` — Create a utility payment (boleto, bills)

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Stark Bank Website](https://starkbank.com)
- [Stark Bank API Documentation](https://starkbank.com/docs)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
