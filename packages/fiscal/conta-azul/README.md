# @codespar/mcp-conta-azul

> MCP server for **Conta Azul** — ERP, accounting, invoicing, and financial management

[![npm](https://img.shields.io/npm/v/@codespar/mcp-conta-azul)](https://www.npmjs.com/package/@codespar/mcp-conta-azul)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "conta-azul": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-conta-azul"],
      "env": {
        "CONTA_AZUL_ACCESS_TOKEN": "your-token"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add conta-azul -- npx @codespar/mcp-conta-azul
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "conta-azul": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-conta-azul"],
      "env": {
        "CONTA_AZUL_ACCESS_TOKEN": "your-token"
      }
    }
  }
}
```

## Tools (20)

| Tool | Purpose |
|---|---|
| `list_customers` | List customers in Conta Azul |
| `create_customer` | Create a customer in Conta Azul |
| `update_customer` | Update a customer in Conta Azul |
| `delete_customer` | Delete a customer in Conta Azul |
| `list_products` | List products in Conta Azul |
| `create_product` | Create a product in Conta Azul |
| `update_product` | Update a product in Conta Azul |
| `delete_product` | Delete a product in Conta Azul |
| `list_sales` | List sales in Conta Azul |
| `create_sale` | Create a sale in Conta Azul |
| `get_sale` | Get a sale by id in Conta Azul |
| `cancel_sale` | Cancel a sale in Conta Azul |
| `list_services` | List services in Conta Azul |
| `create_service` | Create a service in Conta Azul |
| `update_service` | Update a service in Conta Azul |
| `delete_service` | Delete a service in Conta Azul |
| `get_financial_summary` | Get financial summary from Conta Azul |
| `list_categories` | List product/service categories |
| `list_bank_accounts` | List bank accounts in Conta Azul |
| `list_accounts_receivable` | List accounts receivable (financial events to receive) in Conta Azul |

## Authentication

Conta Azul uses OAuth2 Bearer tokens for authentication.

## Sandbox / Testing

Conta Azul provides a sandbox via the OAuth flow. Use sandbox credentials for testing.

### Get your credentials

1. Go to [Conta Azul Developer Portal](https://developers.contaazul.com)
2. Register as a developer
3. Create an OAuth application and obtain an access token
4. Set the `CONTA_AZUL_ACCESS_TOKEN` environment variable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CONTA_AZUL_ACCESS_TOKEN` | Yes | OAuth2 access token |

## Roadmap

### v0.2 (planned)
- `list_bank_accounts` — List registered bank accounts
- `create_bank_account` — Register a new bank account
- `list_taxes` — List tax entries
- `create_tax` — Create a tax entry
- `get_cash_flow` — Get cash flow summary report

### v0.3 (planned)
- `reconciliation` — Bank reconciliation tools
- `financial_reports` — Generate financial summary reports

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Conta Azul Website](https://contaazul.com)
- [Conta Azul API Documentation](https://developers.contaazul.com)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
