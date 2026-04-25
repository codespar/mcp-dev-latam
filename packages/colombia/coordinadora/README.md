# MCP Coordinadora


> **Alpha release** — published under the `alpha` npm dist-tag. Endpoint paths follow public docs and BACEN/provider conventions but have not been fully live-validated. Pin exact versions during `0.x.x-alpha`. Install with `npm install <pkg>@alpha`.

MCP server for **Coordinadora** — one of Colombia's largest courier and logistics companies, offering domestic and international shipping services.

## Quick Start

```bash
# Set your credentials
export COORDINADORA_API_KEY="your-api-key"
export COORDINADORA_NIT="your-nit"

# Run via stdio
npx tsx packages/colombia/coordinadora/src/index.ts

# Run via HTTP
npx tsx packages/colombia/coordinadora/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `COORDINADORA_API_KEY` | Yes | API key from Coordinadora |
| `COORDINADORA_NIT` | Yes | Company NIT number |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools (19)

| Tool | Purpose |
|---|---|
| `create_shipment` | Create a new shipment |
| `get_shipment` | Get shipment details by guide number |
| `track_shipment` | Track a shipment by guide number |
| `get_rates` | Get shipping rates/quotes |
| `list_cities` | List available cities for shipping |
| `create_pickup` | Schedule a pickup at an address |
| `get_coverage` | Check if a location is within coverage area |
| `cancel_shipment` | Cancel a shipment |
| `get_guia_pdf` | Download a guía label as PDF (returns base64 or URL) |
| `get_pickup` | Get pickup (recolección) details by id |
| `cancel_pickup` | Cancel a scheduled pickup (recolección) |
| `get_tracking_history` | Get full tracking event history for a guía |
| `list_shipments_by_date` | List guías created within a date range |
| `validate_coverage` | Validate that a city + postal code combination is covered |
| `list_services` | List available service types for a given origin/destination |
| `list_offices` | List Coordinadora branch offices (oficinas) |
| `create_return` | Create a reverse-logistics return guía |
| `list_returns` | List existing return guías |
| `create_bulk_guias` | Create multiple guías in a single batch operation |

## Auth

Uses **API key + NIT header** authentication. Both the API key and company NIT are sent as custom headers with every request.

## API Reference

- [Coordinadora API Docs](https://www.coordinadora.com/portafolio-de-servicios/soluciones-tecnologicas/)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
