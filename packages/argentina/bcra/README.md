# MCP BCRA

MCP server for **BCRA** (Banco Central de la Republica Argentina) — public API for exchange rates, monetary data, reserves, interest rates, and inflation data.

## Quick Start

```bash
# No credentials needed — public API

# Run via stdio
npx tsx packages/argentina/bcra/src/index.ts

# Run via HTTP
npx tsx packages/argentina/bcra/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| _None_ | — | Public API, no authentication required |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools

| Tool | Description |
|------|-------------|
| `get_exchange_rates` | Get official exchange rates (USD, EUR, BRL, etc.) |
| `get_uva_value` | Get UVA value (inflation-adjusted unit for mortgages) |
| `get_monetary_base` | Get monetary base data |
| `get_reserves` | Get international reserves data |
| `get_interest_rates` | Get reference interest rates |
| `get_inflation` | Get inflation data (CPI / IPC) |

## Auth

**No authentication required.** The BCRA API is publicly available. Rate limits may apply.

## API Reference

- [BCRA API Documentation](https://www.bcra.gob.ar/Catalogo/apis.asp)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
