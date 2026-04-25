# MCP Colppy


> **Alpha release** — published under the `alpha` npm dist-tag. Endpoint paths follow public docs and BACEN/provider conventions but have not been fully live-validated. Pin exact versions during `0.x.x-alpha`. Install with `npm install <pkg>@alpha`.

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

## Tools (22)

| Tool | Purpose |
|---|---|
| `list_customers` | List customers |
| `create_customer` | Create a customer |
| `list_products` | List products and services |
| `create_invoice` | Create an invoice (integrates with AFIP for electronic invoicing) |
| `list_invoices` | List invoices |
| `get_balance` | Get account balance summary |
| `list_accounts` | List chart of accounts (plan de cuentas) |
| `create_payment` | Record a payment against an invoice |
| `update_customer` | Update an existing customer's data |
| `delete_customer` | Delete a customer |
| `get_customer_balance` | Get the current account balance (cuenta corriente) for a customer |
| `list_suppliers` | List suppliers (proveedores) |
| `create_supplier` | Create a supplier (proveedor) |
| `cancel_invoice` | Cancel/void an invoice (anular comprobante) |
| `get_invoice_pdf` | Get the PDF representation of an invoice (returns URL or base64) |
| `create_receipt` | Create a receipt (recibo) — record cash/transfer received against one or more invoices |
| `list_receipts` | List receipts (recibos) |
| `get_stock` | Get current stock for a product across warehouses |
| `list_warehouses` | List warehouses (depósitos) |
| `list_companies` | List companies (empresas) accessible to the current API user |
| `sales_report` | Sales report by date range |
| `expenses_report` | Expenses/purchases report by date range |

## Auth

Uses **API key + session** authentication. The API key is sent with each request along with the company ID. Colppy uses a JSON-RPC style API where service and operation are specified in the request body.

## API Reference

- [Colppy API Documentation](https://www.colppy.com/api)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
