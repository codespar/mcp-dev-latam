# MCP Tienda Nube

MCP server for **Tienda Nube** (Nuvemshop) — the leading LATAM e-commerce platform, Argentine-founded, equivalent to Shopify for Latin America.

## Quick Start

```bash
# Set your credentials
export TIENDANUBE_ACCESS_TOKEN="your-access-token"
export TIENDANUBE_STORE_ID="your-store-id"

# Run via stdio
npx tsx packages/argentina/tienda-nube/src/index.ts

# Run via HTTP
npx tsx packages/argentina/tienda-nube/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TIENDANUBE_ACCESS_TOKEN` | Yes | Access token from Tienda Nube |
| `TIENDANUBE_STORE_ID` | Yes | Store identifier |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools

| Tool | Description |
|------|-------------|
| `list_products` | List products from the store |
| `get_product` | Get product details by ID |
| `create_product` | Create a new product |
| `update_product` | Update an existing product |
| `list_orders` | List orders |
| `get_order` | Get order details by ID |
| `list_customers` | List customers |
| `get_customer` | Get customer details by ID |
| `list_categories` | List product categories |
| `update_order_status` | Update order fulfillment/shipping status |

## Auth

Uses **Bearer token** authentication. Obtain your access token via the Tienda Nube Partners OAuth flow. The store ID is included in the API base URL.

## API Reference

- [Tienda Nube API Docs](https://tiendanube.github.io/api-documentation/)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
