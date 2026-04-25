# @codespar/mcp-mercado-libre

> MCP server for **Mercado Libre** — largest LATAM marketplace with 100M+ users across 18 countries

[![npm](https://img.shields.io/npm/v/@codespar/mcp-mercado-libre)](https://www.npmjs.com/package/@codespar/mcp-mercado-libre)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

```json
{
  "mcpServers": {
    "mercado-libre": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-mercado-libre"],
      "env": {
        "MELI_ACCESS_TOKEN": "your-access-token"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add mercado-libre -- npx @codespar/mcp-mercado-libre
```

## Tools (22)

| Tool | Purpose |
|---|---|
| `search_products` | Search products in Mercado Libre marketplace |
| `get_product` | Get detailed product information by item ID |
| `get_product_description` | Get product description text by item ID |
| `list_categories` | List all marketplace categories for the site |
| `get_category` | Get category details and children |
| `predict_category` | Predict the best category for a product title (domain_discovery) |
| `get_trends` | Get trending searches in the marketplace |
| `list_listings` | List seller's active product listings |
| `update_item` | Update item fields such as available_quantity (stock), status (active/paused/closed), price, or title |
| `get_seller` | Get seller information and reputation |
| `list_orders` | List seller orders with filters |
| `get_order` | Get order details by ID |
| `get_user` | Get authenticated user information |
| `get_shipment` | Get shipment details |
| `get_shipment_history` | Get tracking history (status changes) for a shipment |
| `get_shipping_label` | Get shipping labels (PDF or ZPL) for one or more shipments. |
| `list_questions` | List questions on a product listing |
| `answer_question` | Answer a question on a product listing |
| `list_messages` | List post-sale conversation messages between seller and buyer for an order pack |
| `send_message` | Send a post-sale message to the buyer associated with an order pack |
| `list_reviews` | List reviews and rating average for a product |
| `create_promotion` | Create a price discount promotion for an item (PRICE_DISCOUNT) |

## Authentication

Mercado Libre uses OAuth2. Get your access token from the [Developers Portal](https://developers.mercadolibre.com.ar/).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MELI_ACCESS_TOKEN` | Yes | OAuth2 access token |
| `MELI_SITE_ID` | No | Site ID (default: MLB for Brazil). Use MLA for Argentina, MLM for Mexico. |

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
