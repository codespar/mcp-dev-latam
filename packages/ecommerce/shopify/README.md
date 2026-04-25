# @codespar/mcp-shopify

MCP server for [Shopify](https://shopify.dev) — global ecommerce platform Admin REST API.

Shopify is the global DTC standard and dominant across LatAm for brands operating internationally (complementary to Nuvemshop/Tiendanube for regional-only merchants, also in this catalog). Agents building merchant tools — restocking, refund automation, marketing campaigns, fulfillment orchestration — integrate directly with the Admin API rather than through a reseller.

## Tools (28)

| Tool | Purpose |
|---|---|
| `list_orders` | List orders with optional filters. |
| `get_order` | Get a single order by ID with full detail. |
| `create_order` | Create a new order. |
| `update_order` | Update an existing order (tags, note, email, shipping_address, metafields, etc). |
| `cancel_order` | Cancel an order. |
| `list_products` | List products with optional filters. |
| `get_product` | Get a single product by ID including all variants and images. |
| `create_product` | Create a new product with variants, options, and images. |
| `update_product` | Update an existing product's fields, variants, or images. |
| `list_customers` | List customers with optional query filter. |
| `create_customer` | Create a new customer record. |
| `adjust_inventory` | Adjust the available inventory for a specific inventory_item at a specific location by a delta (positive to... |
| `create_fulfillment` | Create a fulfillment for an order (mark line items as shipped, attach tracking number and carrier). |
| `update_fulfillment_tracking` | Update the tracking number, tracking company, or tracking URL on an existing fulfillment (post-ship trackin... |
| `create_draft_order` | Create a draft order (invoice-style quote). |
| `complete_draft_order` | Convert a draft order into a real order. |
| `create_price_rule` | Create a price rule (the policy that governs discounts — percentage/fixed amount, prerequisites, entitlemen... |
| `create_discount_code` | Create a discount code tied to an existing price rule (the customer-facing string like 'SUMMER20'). |
| `create_smart_collection` | Create a smart collection — an automated collection populated by rules (e.g. |
| `create_custom_collection` | Create a custom collection — a manually curated collection. |
| `create_metafield` | Attach a metafield (custom typed field) to a resource (shop, product, variant, customer, order, collection,... |
| `create_variant` | Add a new variant to an existing product (size/color/SKU permutation with its own price and inventory). |
| `update_variant` | Update an existing product variant's price, SKU, barcode, options, weight, or inventory policy. |
| `list_transactions` | List all payment transactions for an order (authorizations, captures, sales, refunds, voids) including gate... |
| `list_abandoned_checkouts` | List abandoned checkouts (carts where the customer entered contact info but did not complete checkout). |
| `list_locations` | List all fulfillment locations (physical stores, warehouses, 3PLs). |
| `create_refund` | Refund one or more line items on an order. |
| `register_webhook` | Register a webhook subscription for a Shopify event topic (orders/create, orders/paid, products/update, app... |

## Install

```bash
npm install @codespar/mcp-shopify
```

## Environment

```bash
SHOPIFY_SHOP="acme"               # subdomain (acme.myshopify.com)
SHOPIFY_ACCESS_TOKEN="shpat_..."  # Admin API access token (secret)
SHOPIFY_API_VERSION="2024-01"     # Optional. Defaults to 2024-01.
```

## Authentication

Private/custom app access token sent as header on every request:

```
X-Shopify-Access-Token: <SHOPIFY_ACCESS_TOKEN>
```

Create a custom app in Shopify admin → Settings → Apps and sales channels → Develop apps, grant the Admin API scopes you need (read/write orders, products, customers, inventory, fulfillments), and install to generate the token.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-shopify

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-shopify
```

## API surface

Uses the Shopify Admin REST API at `https://{shop}.myshopify.com/admin/api/{version}`. Default version is `2024-01` (stable). Override with `SHOPIFY_API_VERSION` when newer stable versions ship.

## License

MIT
