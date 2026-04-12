# MCP Andreani

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

## Tools

| Tool | Description |
|------|-------------|
| `create_shipment` | Create a new shipment |
| `get_shipment` | Get shipment details by ID |
| `track_shipment` | Track a shipment by tracking number |
| `get_rates` | Get shipping rates/quotes |
| `list_branches` | List Andreani branches/sucursales |
| `create_label` | Generate a shipping label |
| `get_tracking_history` | Get full tracking history |
| `cancel_shipment` | Cancel a shipment |

## Auth

Uses **Bearer token** authentication. The server logs in with username/password to obtain a JWT token, which is used for subsequent API calls. An API key header is also included.

## API Reference

- [Andreani API Docs](https://api.andreani.com/v2/docs)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
