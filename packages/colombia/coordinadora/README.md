# MCP Coordinadora

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

## Tools

| Tool | Description |
|------|-------------|
| `create_shipment` | Create a new shipment |
| `get_shipment` | Get shipment details by guide number |
| `track_shipment` | Track a shipment |
| `get_rates` | Get shipping rates/quotes |
| `list_cities` | List available cities for shipping |
| `create_pickup` | Schedule a pickup |
| `get_coverage` | Check coverage for a location |
| `cancel_shipment` | Cancel a shipment |

## Auth

Uses **API key + NIT header** authentication. Both the API key and company NIT are sent as custom headers with every request.

## API Reference

- [Coordinadora API Docs](https://www.coordinadora.com/portafolio-de-servicios/soluciones-tecnologicas/)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
