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

## Tools (21)

### Discovery
| Tool | Description |
|------|-------------|
| `search_products` | Search merchant product catalog |
| `get_product` | Get product details, pricing, variants |
| `check_availability` | Check stock and delivery availability |
| `list_merchants` | List UCP-compatible merchants |

### Cart
| Tool | Description |
|------|-------------|
| `create_cart` | Create a shopping cart |
| `add_to_cart` | Add item to cart |
| `remove_from_cart` | Remove item from cart |
| `get_cart` | Get cart contents and totals |
| `clear_cart` | Clear all cart items |

### Checkout
| Tool | Description |
|------|-------------|
| `get_delivery_options` | Get shipping options |
| `initiate_checkout` | Start checkout session |
| `apply_payment` | Apply payment (card, AP2, x402, Pix) |
| `confirm_order` | Place the order |

### Orders
| Tool | Description |
|------|-------------|
| `get_order` | Get order details and status |
| `list_orders` | List orders with filters |
| `cancel_order` | Cancel a pending order |
| `request_return` | Request return/refund |
| `track_shipment` | Track shipment in real-time |

### Identity
| Tool | Description |
|------|-------------|
| `link_identity` | Link buyer identity |
| `get_profile` | Get buyer profile and preferences |

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

## License

MIT
