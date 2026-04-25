# @codespar/mcp-vtex

> MCP server for **VTEX** — e-commerce platform with catalog, orders, inventory, and promotions

[![npm](https://img.shields.io/npm/v/@codespar/mcp-vtex)](https://www.npmjs.com/package/@codespar/mcp-vtex)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vtex": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-vtex"],
      "env": {
        "VTEX_ACCOUNT_NAME": "your-account",
        "VTEX_APP_KEY": "your-app-key",
        "VTEX_APP_TOKEN": "your-app-token"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add vtex -- npx @codespar/mcp-vtex
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "vtex": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-vtex"],
      "env": {
        "VTEX_ACCOUNT_NAME": "your-account",
        "VTEX_APP_KEY": "your-app-key",
        "VTEX_APP_TOKEN": "your-app-token"
      }
    }
  }
}
```

## Tools (33)

| Tool | Purpose |
|---|---|
| `list_products` | List products from VTEX catalog |
| `get_product` | Get product details by ID |
| `create_product` | Create a new product in the VTEX catalog |
| `update_product` | Update an existing product in the VTEX catalog |
| `list_skus` | List SKUs for a product |
| `create_sku` | Create a new SKU for a product |
| `list_categories` | List all categories with pagination |
| `create_category` | Create a new category in the catalog |
| `get_catalog` | Get the catalog category tree |
| `list_orders` | List orders with optional filters |
| `get_order` | Get full OMS order details by ID |
| `update_order_status` | Transition an order to the handling state (start fulfillment) |
| `invoice_order` | Issue a fiscal invoice (nota fiscal) for an order |
| `track_order_invoice` | Update tracking info for a previously issued invoice |
| `cancel_order` | Cancel an order |
| `list_customer_orders` | List order history for a customer (filtered by email) |
| `get_sku_price` | Get pricing details for an SKU (base price, list price, markup, cost, fixed prices per trade policy) |
| `update_sku_price` | Update base/list/cost price for an SKU |
| `list_price_tables` | List all configured price tables (trade policies) |
| `get_inventory` | Get inventory/stock for a SKU across warehouses |
| `update_inventory` | Update inventory quantity for a SKU at a specific warehouse |
| `get_shipping_rates` | Simulate shipping rates for items to a postal code |
| `list_warehouses` | List all warehouses configured in the account |
| `create_warehouse` | Register a new warehouse (fulfillment center) |
| `create_promotion` | Create a promotion/discount in VTEX |
| `list_coupons` | List all promotion coupons |
| `create_coupon` | Create a promotion coupon code |
| `list_subscriptions` | List customer subscriptions |
| `create_subscription` | Create a recurring subscription for a customer (VTEX Subscriptions) |
| `get_masterdata_document` | Get a document (customer profile, custom entity) from VTEX Master Data v2 |
| `search_masterdata` | Search documents in a Master Data entity |
| `create_giftcard` | Create a gift card for a customer (GiftCard Hub) |
| `get_giftcard` | Get gift card details by ID |

## Authentication

VTEX uses app key and app token headers for API authentication.

## Sandbox / Testing

VTEX provides sandbox access via partner accounts. Contact VTEX for developer access.

### Get your credentials

1. Go to [VTEX Developer Portal](https://developers.vtex.com)
2. Access your VTEX admin or create a partner account
3. Generate an app key and app token from License Manager
4. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VTEX_ACCOUNT_NAME` | Yes | VTEX account name |
| `VTEX_APP_KEY` | Yes | API app key |
| `VTEX_APP_TOKEN` | Yes | API app token |
| `VTEX_ENVIRONMENT` | No | Environment host slug (default `vtexcommercestable`) |

## Roadmap

### v0.3 (planned)
- Checkout / cart session management
- Marketplace seller and offer management
- Carrier (shipping policy) registration

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [VTEX Website](https://vtex.com)
- [VTEX Developer Documentation](https://developers.vtex.com)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
