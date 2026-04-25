# @codespar/mcp-shopee

MCP server for [Shopee](https://open.shopee.com) — the Shopee Open Platform Partner API v2.

Shopee is one of the two marketplaces where LatAm merchants concentrate the bulk of their online GMV (dominant in Brazil, rapidly expanding across the region). Paired with `@codespar/mcp-mercadolibre`, this package gives agents full reach across LatAm's major ecommerce marketplaces — each has its own seller ecosystem, so merchants typically operate on both.

## Tools (22)

| Tool | Purpose |
|---|---|
| `get_shop_info` | Get basic information about the authorized Shopee shop (shop_name, region, status, auth expiry). |
| `list_orders` | List orders within a time window, optionally filtered by order_status. |
| `get_order_detail` | Get full detail for one or more orders by order_sn (comma-separated, up to 50). |
| `ship_order` | Arrange shipment for an order — either request pickup, drop off, or pass a tracking number depending on the... |
| `cancel_order` | Cancel an order that has not yet shipped. |
| `list_products` | List items (products) in the shop with optional status filter. |
| `get_product_detail` | Get detailed base info for up to 50 items by item_id. |
| `update_product_stock` | Update stock levels for an item (or its models/variants). |
| `update_product_price` | Update prices for an item (or its models/variants). |
| `get_shipment_list` | List orders currently in shipment (status SHIPPED or in-transit). |
| `get_return_list` | List return/refund requests on the shop, optionally filtered by status and time window. |
| `confirm_return` | Confirm (accept) a buyer-initiated return request by return_sn. |
| `add_item` | Create a new product (item) in the shop. |
| `update_item` | Update an existing product. |
| `delete_item` | Delete an item (product) from the shop by item_id. |
| `get_shipping_parameter` | Fetch the required shipping parameters for an order before calling ship_order. |
| `get_tracking_number` | Get the tracking number (and courier info when available) for a shipped order. |
| `download_shipping_document` | Request the shipping label / air waybill PDF for one or more orders. |
| `accept_return_offer` | Accept the buyer's return offer (proposed solution) for a return_sn, ending negotiation in the buyer's favor. |
| `add_discount` | Create a new shop-level discount (promotion) with a time window. |
| `add_bundle_deal` | Create a bundle-deal promotion (e.g. |
| `send_chat_message` | Send a text or sticker message to a buyer in Shopee's seller chat. |

## Install

```bash
npm install @codespar/mcp-shopee@alpha
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
