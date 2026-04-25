# @codespar/mcp-bling

> MCP server for **Bling** — ERP with products, orders, contacts, invoices, and stock management

[![npm](https://img.shields.io/npm/v/@codespar/mcp-bling)](https://www.npmjs.com/package/@codespar/mcp-bling)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bling": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-bling"],
      "env": {
        "BLING_ACCESS_TOKEN": "your-token"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add bling -- npx @codespar/mcp-bling
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "bling": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-bling"],
      "env": {
        "BLING_ACCESS_TOKEN": "your-token"
      }
    }
  }
}
```

## Tools (28)

| Tool | Purpose |
|---|---|
| `list_products` | List products in Bling |
| `create_product` | Create a product in Bling |
| `list_categories` | List product categories in Bling |
| `create_category` | Create a product category in Bling |
| `list_orders` | List sales orders in Bling |
| `create_order` | Create a sales order in Bling |
| `list_purchase_orders` | List purchase orders (pedidos de compras) in Bling |
| `create_purchase_order` | Create a purchase order (pedido de compra) in Bling |
| `list_contacts` | List contacts (customers/suppliers) in Bling |
| `create_contact` | Create a contact in Bling |
| `get_contact` | Get a single contact by ID |
| `update_contact` | Update an existing contact |
| `list_invoices` | List fiscal invoices (NF-e) in Bling |
| `create_invoice` | Create a fiscal invoice (NF-e) from an order |
| `send_invoice` | Send/emit an already-created NF-e to SEFAZ |
| `create_service_invoice` | Create a service invoice (NFS-e) in Bling |
| `get_stock` | Get stock/inventory for a product |
| `update_stock` | Update stock for a product at a warehouse |
| `create_stock_movement` | Register a stock-in or stock-out movement for a product (alias of update_stock with explicit direction) |
| `list_warehouses` | List warehouses (depósitos) in Bling |
| `create_warehouse` | Create a warehouse (depósito) in Bling |
| `list_accounts_receivable` | List accounts receivable (contas a receber) |
| `create_account_receivable` | Create an account receivable (conta a receber) |
| `list_accounts_payable` | List accounts payable (contas a pagar) |
| `create_account_payable` | Create an account payable (conta a pagar) |
| `list_payment_methods` | List payment methods (formas de pagamento) |
| `subscribe_webhook` | Register a webhook (notificação) to receive Bling events |
| `unsubscribe_webhook` | Remove a previously registered webhook |

## Authentication

Bling uses OAuth2 Bearer tokens for authentication.

## Sandbox / Testing

Bling provides a sandbox via the OAuth flow. Use test credentials for development.

### Get your credentials

1. Go to [Bling Developer Portal](https://developer.bling.com.br)
2. Create an account
3. Register an OAuth application and obtain an access token
4. Set the `BLING_ACCESS_TOKEN` environment variable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BLING_ACCESS_TOKEN` | Yes | OAuth2 access token |

## Roadmap

### v0.3 (planned)
- `production_management` — Manage production orders
- `multi_store` — Multi-store inventory (Mercado Livre, Shopee, Amazon integrations)
- `list_nfce` / `create_nfce` — Consumer invoice (NFC-e) helpers
- Richer filters on `list_accounts_*` (by payment status, contact)

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Bling Website](https://bling.com.br)
- [Bling API Documentation](https://developer.bling.com.br)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
