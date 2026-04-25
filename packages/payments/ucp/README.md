# @codespar/mcp-ucp

> MCP server for **Google UCP** — Universal Commerce Protocol for agentic shopping, cart, checkout, orders, and delivery

[![npm](https://img.shields.io/npm/v/@codespar/mcp-ucp)](https://www.npmjs.com/package/@codespar/mcp-ucp)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## What is UCP?

**Universal Commerce Protocol (UCP)** is Google's open standard for agentic commerce. It enables AI agents to autonomously discover products, build carts, checkout, manage orders, and track deliveries — without screen-scraping or bespoke merchant integrations.

UCP works alongside **AP2** (payment processing) and **A2A** (agent-to-agent interoperability), with **MCP** as the transport layer.

## Quick Start

### Claude Desktop

```json
{
  "mcpServers": {
    "ucp": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-ucp"],
      "env": {
        "UCP_API_KEY": "your-key",
        "UCP_MERCHANT_ID": "your-merchant-id"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add ucp -- npx @codespar/mcp-ucp
```

## Tools (20)

| Tool | Purpose |
|---|---|
| `search_products` | Search merchant product catalog. |
| `get_product` | Get detailed product information including pricing, variants, availability, and reviews |
| `check_availability` | Check product stock and delivery availability for a specific location |
| `list_merchants` | List UCP-compatible merchants with optional category and region filters |
| `create_cart` | Create a new shopping cart for a merchant |
| `add_to_cart` | Add an item to the shopping cart |
| `remove_from_cart` | Remove an item from the shopping cart |
| `get_cart` | Get cart contents, item totals, taxes, and shipping estimates |
| `clear_cart` | Remove all items from the cart |
| `get_delivery_options` | Get available shipping and delivery options for a cart |
| `initiate_checkout` | Start the checkout process for a cart. |
| `apply_payment` | Apply a payment method to the checkout session. |
| `confirm_order` | Confirm and place the order. |
| `get_order` | Get order details including items, status, payment, and shipping info |
| `list_orders` | List orders with optional filters |
| `cancel_order` | Cancel a pending or confirmed order |
| `request_return` | Request a return or refund for a delivered order |
| `track_shipment` | Get real-time shipment tracking details for an order |
| `link_identity` | Link buyer identity for personalization and order history across merchants |
| `get_profile` | Get buyer profile, preferences, and linked merchants |

## UCP + AP2 + A2A — The Full Stack

```
AI Agent
  └── MCP (tool interface)
       └── UCP (commerce: discover → cart → checkout → order → delivery)
            ├── A2A (agent-to-agent discovery & communication)
            └── AP2 (payment: authorize → execute → settle)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `UCP_API_KEY` | Yes | API key for UCP platform |
| `UCP_MERCHANT_ID` | No | Default merchant ID |
| `UCP_SANDBOX` | No | Set to `true` for sandbox mode |

## Links

- [Google UCP Announcement](https://cloud.google.com/blog)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
