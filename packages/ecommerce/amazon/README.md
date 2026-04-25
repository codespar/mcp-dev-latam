# @codespar/mcp-amazon

MCP server for the [Amazon Selling Partner API](https://developer-docs.amazon.com/sp-api) (SP-API) — the biggest global marketplace, including Amazon BR, Amazon MX, Amazon US, and all EU/FE marketplaces.

For LatAm sellers, Amazon rounds out the marketplace trio already in this catalog:

- **Mercado Libre** (`@codespar/mcp-mercadolibre`) — dominant in LatAm generally (BR, AR, MX, CO, CL).
- **Shopee** (`@codespar/mcp-shopee`) — heavy in Brazil and rapidly growing regionally.
- **Amazon** (this package) — global reach, plus Amazon BR/MX for LatAm sellers and cross-border into Amazon US/EU/JP.

Together these three cover essentially every marketplace where a LatAm merchant transacts meaningful GMV.

## Tools (24)

| Tool | Purpose |
|---|---|
| `list_orders` | List orders from Amazon SP-API. |
| `get_order` | Get one order by AmazonOrderId (e.g. |
| `get_order_items` | Get the line items for an order by AmazonOrderId. |
| `get_listings_item` | Get a single listing item for the seller by SKU. |
| `put_listings_item` | Create or fully replace a listing item for the seller by SKU. |
| `delete_listings_item` | Delete a listing item for the seller by SKU. |
| `search_catalog_items` | Search the Amazon catalog for reference product data (ASIN, title, brand, images) by identifiers or keywords. |
| `get_inventory_summary` | Get FBA inventory summaries (fulfillable, inbound, reserved, researching, unfulfillable quantities) for the... |
| `create_report` | Request an SP-API report. |
| `get_report` | Get a report's status and (when DONE) its reportDocumentId, which can then be fetched from the Reports docu... |
| `list_financial_events` | List financial events (shipment, refund, service fee, adjustment, etc.) for reconciliation. |
| `get_order_shipment_status` | Get shipment status for a shipment id via the Shipping API (Amazon Shipping / Buy Shipping labels). |
| `create_subscription` | Create a Notifications API subscription for a given notificationType (webhook-equivalent for SP-API events,... |
| `patch_listings_item` | Partially update a listing item for the seller by SKU using a JSON Patch list of operations. |
| `confirm_shipment` | Confirm shipment of an order's items (Orders API v0). |
| `update_shipment_status` | Update the shipment status of an order (Orders API v0). |
| `list_reports` | List reports the seller has requested. |
| `cancel_report` | Cancel a report that is IN_QUEUE and has not yet started processing. |
| `create_feed` | Submit a feed to SP-API (e.g. |
| `get_feed` | Get a feed's status and (when DONE) its resultFeedDocumentId — fetch the result from the Feed Document API... |
| `list_financial_events_by_order` | List financial events scoped to a single order (shipment, refund, service fee, adjustment). |
| `get_my_fees_estimate_for_asin` | Estimate referral fee + FBA fees for selling an ASIN at a given price. |
| `list_subscriptions` | Get the current subscription for a notificationType (one subscription per notificationType per app). |
| `get_marketplace_participations` | List all marketplaces the seller is registered to sell in (Sellers API). |

## Install

```bash
npm install @codespar/mcp-amazon@alpha
```

## Environment

```bash
AMAZON_LWA_CLIENT_ID="amzn1.application-oa2-client....."
AMAZON_LWA_CLIENT_SECRET="..."
AMAZON_REFRESH_TOKEN="Atzr|..."          # long-lived, seller-authorized
AMAZON_MARKETPLACE_ID="A2Q3Y263D00KWC"   # BR; ATVPDKIKX0DER=US, A1AM78C64UM0Y8=MX
AMAZON_REGION="na"                        # na | eu | fe (default na)
AMAZON_SELLER_ID="A3..."                  # optional; default for Listings tools
```

### Marketplace ids (common)

| Marketplace | Id | Region |
|-------------|----|--------|
| Brazil | `A2Q3Y263D00KWC` | na |
| United States | `ATVPDKIKX0DER` | na |
| Mexico | `A1AM78C64UM0Y8` | na |
| Canada | `A2EUQ1WTGCTBG2` | na |
| Spain | `A1RKKUPIHCS9HS` | eu |
| United Kingdom | `A1F83G8C2ARO7P` | eu |
| Germany | `A1PA6795UKMFR9` | eu |
| Japan | `A1VC38T7YXB528` | fe |

## Authentication

SP-API uses a dual-step Login with Amazon (LWA) flow:

1. **Exchange refresh token → access token** (1-hour lifetime). The server POSTs to `https://api.amazon.com/auth/o2/token` with `grant_type=refresh_token` and your `client_id` / `client_secret` / `refresh_token`. The result is cached in memory until ~1 minute before expiry.
2. **Call SP-API** with the regional base URL and header `x-amz-access-token: <token>` plus `Content-Type: application/json`.

AWS Signature v4 request signing was the historical requirement for SP-API. Amazon **removed** the SigV4 requirement in 2023 for most tenants, so this server uses LWA-only auth. If your seller is still flagged as requiring SigV4, you will need to wrap `amazonRequest` with a signer (`@aws-sdk/signature-v4`) — not included here.

## Regional base URLs

- **NA** (Americas, including BR/US/MX/CA): `https://sellingpartnerapi-na.amazon.com`
- **EU** (Europe + India + MENA): `https://sellingpartnerapi-eu.amazon.com`
- **FE** (Far East — Japan, Australia, Singapore): `https://sellingpartnerapi-fe.amazon.com`

Select with `AMAZON_REGION`. Brazil and the Americas use `na`.

## Run

```bash
# stdio (default — Claude Desktop, Cursor, etc)
npx @codespar/mcp-amazon

# HTTP (server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-amazon
```

## Notifications

`create_subscription` is webhook-equivalent for SP-API. Amazon does not push HTTP webhooks directly — instead, you create a **destination** (SQS queue or EventBridge bus) via `POST /notifications/v1/destinations` first, then attach subscriptions to that destination. This package covers subscription creation; destination provisioning is a one-time setup typically done via the AWS Console or a deploy script.

## Status

`0.1.0-alpha.1` — SP-API has 30+ product sections and this package covers the commerce-relevant subset (orders, listings, catalog, inventory, reports, finances, shipping, notifications). Endpoint paths and auth flow are implemented to the published spec; tool contracts should be integration-tested against real seller tokens before production use. The LWA refresh flow and `x-amz-access-token` header usage are confirmed against current SP-API docs.

## License

MIT
