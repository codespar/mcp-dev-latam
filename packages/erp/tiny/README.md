# @codespar/mcp-tiny

> MCP server for **Tiny ERP** — products, orders, contacts, invoices, stock, and accounts payable

[![npm](https://img.shields.io/npm/v/@codespar/mcp-tiny)](https://www.npmjs.com/package/@codespar/mcp-tiny)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tiny": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-tiny"],
      "env": {
        "TINY_API_TOKEN": "your-token"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add tiny -- npx @codespar/mcp-tiny
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "tiny": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-tiny"],
      "env": {
        "TINY_API_TOKEN": "your-token"
      }
    }
  }
}
```

## Tools (21)

| Tool | Purpose |
|---|---|
| `list_products` | List products in Tiny ERP |
| `get_product` | Get product details by ID |
| `list_orders` | List sales orders in Tiny ERP |
| `get_order` | Get order details by ID |
| `list_contacts` | List contacts in Tiny ERP |
| `get_contact` | Get contact details by ID |
| `create_invoice` | Create a fiscal invoice (NF-e) from an order in Tiny |
| `get_invoice` | Get invoice details by ID |
| `get_stock` | Get current stock for a product |
| `list_accounts_payable` | List accounts payable in Tiny ERP |
| `update_stock` | Update (adjust) product stock balance — credit or debit a quantity for a deposit |
| `list_categories` | List product categories as a tree in Tiny ERP |
| `list_warehouses` | List stock warehouses (depósitos) configured in Tiny ERP |
| `list_price_lists` | List price lists (listas de preços) configured in Tiny ERP |
| `update_order_status` | Change a sales order's status — useful for cancelling or marking as approved/billed |
| `list_invoices` | List fiscal invoices (NF-e/NFC-e) in Tiny ERP |
| `get_invoice_xml` | Get the XML payload of an issued invoice (NF-e) |
| `get_invoice_link` | Get the DANFE PDF/link for an issued invoice |
| `send_invoice_email` | Email an issued invoice to a recipient |
| `list_accounts_receivable` | List accounts receivable in Tiny ERP |
| `get_account_receivable` | Get a single accounts-receivable record by ID |

## Authentication

Tiny uses a token parameter passed in each request.

## Sandbox / Testing

Tiny provides test access via account registration.

### Get your credentials

1. Go to [Tiny ERP](https://tiny.com.br)
2. Create an account
3. Navigate to API settings to generate a token
4. Set the `TINY_API_TOKEN` environment variable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TINY_API_TOKEN` | Yes | API token from Tiny ERP |

## Roadmap

### v0.2 (planned)
- `create_product` — Create a new product
- `update_product` — Update product details
- `create_contact` — Create a contact (customer/supplier)
- `update_contact` — Update contact details
- `get_financial_summary` — Get financial summary report

### v0.3 (planned)
- `fiscal_reports` — Generate fiscal reports (NF-e, NFS-e)
- `multi_company` — Multi-company management

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Tiny ERP Website](https://tiny.com.br)
- [Tiny API Documentation](https://tiny.com.br/api-docs)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
