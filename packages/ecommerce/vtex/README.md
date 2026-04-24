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

## Tools

### Catalog
| Tool | Description |
|------|-------------|
| `list_products` | List products from VTEX catalog |
| `get_product` | Get product details by ID |
| `create_product` | Create a new product |
| `update_product` | Update product details |
| `list_skus` | List SKUs for a product |
| `create_sku` | Create a new SKU |
| `list_categories` | List categories with pagination |
| `create_category` | Create a new category |
| `get_catalog` | Get the catalog category tree |

### Orders (OMS)
| Tool | Description |
|------|-------------|
| `list_orders` | List orders with optional filters |
| `get_order` | Get full OMS order details by ID |
| `update_order_status` | Start handling (fulfillment) on an order |
| `invoice_order` | Issue a fiscal invoice (nota fiscal) for an order |
| `track_order_invoice` | Update tracking info on an issued invoice |
| `cancel_order` | Cancel an order |
| `list_customer_orders` | List order history for a customer email |

### Pricing
| Tool | Description |
|------|-------------|
| `get_sku_price` | Get base / list / cost price and fixed prices for an SKU |
| `update_sku_price` | Update pricing for an SKU |
| `list_price_tables` | List configured price tables (trade policies) |

### Inventory & Shipping
| Tool | Description |
|------|-------------|
| `get_inventory` | Get inventory/stock for a SKU across warehouses |
| `update_inventory` | Update inventory quantity at a warehouse |
| `get_shipping_rates` | Simulate shipping rates for items to a postal code |

### Logistics
| Tool | Description |
|------|-------------|
| `list_warehouses` | List all warehouses |
| `create_warehouse` | Register a new warehouse (fulfillment center) |

### Promotions & Coupons
| Tool | Description |
|------|-------------|
| `create_promotion` | Create a promotion/discount |
| `list_coupons` | List promotion coupons |
| `create_coupon` | Create a coupon code |

### Subscriptions
| Tool | Description |
|------|-------------|
| `list_subscriptions` | List customer subscriptions |
| `create_subscription` | Create a recurring subscription |

### Master Data (customer profiles & custom entities)
| Tool | Description |
|------|-------------|
| `get_masterdata_document` | Get a document from a data entity |
| `search_masterdata` | Search documents with filters |

### Giftcards
| Tool | Description |
|------|-------------|
| `create_giftcard` | Issue a gift card for a customer |
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
