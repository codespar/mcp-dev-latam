# @codespar/mcp-shopee

MCP server for [Shopee](https://open.shopee.com) — the Shopee Open Platform Partner API v2.

Shopee is one of the two marketplaces where LatAm merchants concentrate the bulk of their online GMV (dominant in Brazil, rapidly expanding across the region). Paired with `@codespar/mcp-mercadolibre`, this package gives agents full reach across LatAm's major ecommerce marketplaces — each has its own seller ecosystem, so merchants typically operate on both.

## Tools

| Tool | Purpose |
|------|---------|
| `get_shop_info` | Basic info about the authorized shop |
| `list_orders` | List orders in a time window (max 15 days), optional status filter |
| `get_order_detail` | Full detail for up to 50 order_sn values |
| `ship_order` | Arrange shipment (pickup, dropoff, or non-integrated tracking) |
| `cancel_order` | Cancel an unshipped order with a reason |
| `list_products` | List shop items with status and update_time filters |
| `get_product_detail` | Base info for up to 50 items |
| `update_product_stock` | Update stock per model (0 for single-SKU) |
| `update_product_price` | Update price per model (0 for single-SKU) |
| `get_shipment_list` | Orders currently in shipment |
| `get_return_list` | Return/refund requests with status filters |
| `confirm_return` | Accept a buyer-initiated return |

## Install

```bash
npm install @codespar/mcp-shopee
```

## Environment

```bash
SHOPEE_PARTNER_ID="2001234"        # partner_id (integer) from Shopee Open Platform
SHOPEE_PARTNER_KEY="..."           # partner_key (secret) for HMAC signing
SHOPEE_ACCESS_TOKEN="..."          # merchant access_token (4h lifetime; refresh via refresh_token)
SHOPEE_SHOP_ID="123456789"         # shop_id (integer) from authorization flow
SHOPEE_ENV="production"            # or "sandbox"
```

## Authentication

Shopee uses partner-signed requests. For shop-level endpoints the signature is:

```
base_string = partner_id + api_path + timestamp + access_token + shop_id
sign        = hex(HMAC_SHA256(partner_key, base_string))
```

`partner_id`, `timestamp`, `access_token`, `shop_id`, and `sign` are attached as URL query parameters on every request. The signing helper (`src/index.ts`) handles this on each call.

The `access_token` is obtained via the merchant authorization OAuth flow on Shopee Open Platform; it expires every 4 hours. Refresh it using the `refresh_token` (30-day lifetime) — that exchange lives outside this MCP's scope, typically in a separate token-management service.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-shopee

# HTTP (server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-shopee
```

## Base URLs

- Production: `https://partner.shopeemobile.com/api/v2`
- Sandbox:    `https://partner.test-stable.shopeemobile.com/api/v2`

Select with `SHOPEE_ENV`.

## Status

`0.1.0-alpha.1` — Shopee's Partner API documentation portal requires developer registration, so some endpoint payloads and field-level contracts (especially around `ship_order` pickup/dropoff objects and logistics channel specifics) should be validated against the live docs before production use. The signing recipe and base-URL selection are implemented to spec.

## License

MIT
