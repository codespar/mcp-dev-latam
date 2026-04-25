# MCP Skydropx

MCP server for **Skydropx** — Mexican multi-carrier shipping aggregator supporting Estafeta, DHL, FedEx, Redpack, and more.

## Quick Start

```bash
# Set your API token
export SKYDROPX_API_TOKEN="your-token"

# Run via stdio
npx tsx packages/mexico/skydropx/src/index.ts

# Run via HTTP
npx tsx packages/mexico/skydropx/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SKYDROPX_API_TOKEN` | Yes | API token from Skydropx dashboard |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools (23)

| Tool | Purpose |
|---|---|
| `create_shipment` | Create a shipment |
| `get_shipment` | Get shipment by ID |
| `list_shipments` | List shipments |
| `get_rates` | Get shipping rates for a shipment |
| `create_label` | Create a shipping label for a shipment |
| `track_shipment` | Track a shipment |
| `list_carriers` | List available carriers |
| `create_address` | Create an address |
| `get_address` | Get address by ID |
| `cancel_shipment` | Cancel a shipment |
| `validate_address` | Validate an address (zip, city, province, country) |
| `list_addresses` | List saved addresses |
| `list_parcels` | List saved parcel presets |
| `get_label` | Get a label by ID |
| `list_labels` | List labels |
| `create_pickup` | Schedule a carrier pickup |
| `list_pickups` | List scheduled pickups |
| `cancel_pickup` | Cancel a scheduled pickup |
| `get_tracker` | Get tracker (events) by tracker ID |
| `list_trackers` | List trackers |
| `create_webhook` | Register a webhook to receive shipment/tracker events |
| `list_webhooks` | List registered webhooks |
| `delete_webhook` | Delete a registered webhook |

## Auth

Uses **Bearer token** authentication. Obtain your API token from the [Skydropx Dashboard](https://app.skydropx.com/).

## API Reference

- [Skydropx API Docs](https://developers.skydropx.com/)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
