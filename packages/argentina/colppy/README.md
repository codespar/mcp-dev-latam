# MCP Colppy

MCP server for **Colppy** — Argentine cloud accounting platform with integrated AFIP electronic invoicing.

## Quick Start

```bash
# Set your credentials
export COLPPY_API_KEY="your-api-key"
export COLPPY_COMPANY_ID="your-company-id"

# Run via stdio
npx tsx packages/argentina/colppy/src/index.ts

# Run via HTTP
npx tsx packages/argentina/colppy/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `COLPPY_API_KEY` | Yes | API key from Colppy |
| `COLPPY_COMPANY_ID` | Yes | Company identifier |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools

| Tool | Description |
|------|-------------|
| `list_customers` | List customers |
| `create_customer` | Create a customer |
| `list_products` | List products and services |
| `create_invoice` | Create an invoice (integrates with AFIP) |
| `list_invoices` | List invoices |
| `get_balance` | Get account balance summary |
| `list_accounts` | List chart of accounts (plan de cuentas) |
| `create_payment` | Record a payment against an invoice |

## Auth

Uses **API key + session** authentication. The API key is sent with each request along with the company ID. Colppy uses a JSON-RPC style API where service and operation are specified in the request body.

## API Reference

- [Colppy API Documentation](https://www.colppy.com/api)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
