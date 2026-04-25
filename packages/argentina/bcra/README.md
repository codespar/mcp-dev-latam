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

## Tools (16)

| Tool | Purpose |
|---|---|
| `get_exchange_rates` | Get official exchange rates snapshot for a date (USD, EUR, BRL, etc.) |
| `list_currencies` | List the master catalog of currencies (divisas) tracked by BCRA |
| `get_official_rate` | Get the official BCRA quote for a single currency on a specific date |
| `get_currency_history` | Get historical quotes for a currency over a date range |
| `list_variables` | List the catalog of monetary variables (id, descripción, categoría) — use this to discover variable ids for... |
| `get_variable_history` | Get the historical series for any monetary variable by id, with optional date range. |
| `get_uva_value` | Get UVA (Unidad de Valor Adquisitivo) — used for inflation-adjusted mortgage calculations |
| `get_monetary_base` | Get monetary base data (base monetaria) |
| `get_reserves` | Get international reserves data (reservas internacionales) |
| `get_interest_rates` | Get reference interest rates (tasas de interés de referencia) |
| `get_inflation` | Get inflation data (IPC nivel general — variación mensual) |
| `get_badlar_rate` | Get BADLAR rate (tasa de plazos fijos >1M ARS, bancos privados) — used as benchmark for many financial prod... |
| `get_tm20_rate` | Get TM20 rate (tasa de plazos fijos >20M ARS, bancos privados) |
| `get_leliq_rate` | Get monetary policy rate (ex-LELIQ / tasa de política monetaria) |
| `list_cheque_entities` | List the catalog of financial entities with their cheque codes — use the código to validate cheques |
| `validate_cheque` | Check whether a cheque has been reported as stolen/lost (denunciado) by entity code and cheque number |

## Auth

**No authentication required.** The BCRA API is publicly available. Rate limits may apply.

## API Reference

- [BCRA API Documentation](https://www.bcra.gob.ar/Catalogo/apis.asp)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
