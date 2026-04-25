# MCP Andreani


> **Alpha release** — published under the `alpha` npm dist-tag. Endpoint paths follow public docs and BACEN/provider conventions but have not been fully live-validated. Pin exact versions during `0.x.x-alpha`. Install with `npm install <pkg>@alpha`.

MCP server for **Andreani** — the largest Argentine courier and logistics company, providing domestic and international shipping services.

## Quick Start

```bash
# Set your credentials
export ANDREANI_API_KEY="your-api-key"
export ANDREANI_USER="your-username"
export ANDREANI_PASSWORD="your-password"

# Run via stdio
npx tsx packages/argentina/andreani/src/index.ts

# Run via HTTP
npx tsx packages/argentina/andreani/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANDREANI_API_KEY` | Yes | API key from Andreani |
| `ANDREANI_USER` | Yes | Username for authentication |
| `ANDREANI_PASSWORD` | Yes | Password for authentication |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools (18)

| Tool | Purpose |
|---|---|
| `create_shipment` | Create a new shipment |
| `get_shipment` | Get shipment details by ID |
| `track_shipment` | Track a shipment by tracking number |
| `get_rates` | Get shipping rates/quotes |
| `list_branches` | List Andreani branches/sucursales |
| `create_label` | Generate a shipping label for a shipment |
| `get_tracking_history` | Get full tracking history for a shipment |
| `cancel_shipment` | Cancel a shipment |
| `get_label_pdf` | Download a shipping label as PDF (base64-encoded) |
| `list_tracking_by_date` | List tracking events for a contract within a date range |
| `validate_postal_code` | Validate CP coverage and list available services for a postal code |
| `create_pickup` | Create a pickup/collection request (retiro) |
| `list_pickups` | List pickup/collection requests |
| `cancel_pickup` | Cancel a pickup/collection request |
| `create_return` | Create a reverse logistics shipment (logística inversa / devolución) |
| `list_returns` | List reverse logistics shipments (returns) |
| `list_products` | List contracted products/services available on the account |
| `get_invoice` | Get billing/invoice details |

## Auth

Uses **Bearer token** authentication. The server logs in with username/password to obtain a JWT token, which is used for subsequent API calls. An API key header is also included.

## API Reference

- [Andreani API Docs](https://api.andreani.com/v2/docs)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
