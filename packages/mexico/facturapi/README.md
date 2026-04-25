# MCP FacturAPI

MCP server for **FacturAPI** — Mexican CFDI e-invoicing platform (equivalent to Brazil's NFe).

## Quick Start

```bash
# Set your API key
export FACTURAPI_API_KEY="sk_..."

# Run via stdio
npx tsx packages/mexico/facturapi/src/index.ts

# Run via HTTP
npx tsx packages/mexico/facturapi/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FACTURAPI_API_KEY` | Yes | API key from FacturAPI dashboard |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools (20)

| Tool | Purpose |
|---|---|
| `create_invoice` | Create a CFDI invoice |
| `get_invoice` | Get invoice by ID |
| `list_invoices` | List invoices with filters |
| `cancel_invoice` | Cancel an invoice |
| `download_invoice_pdf` | Download invoice as PDF (returns download URL) |
| `download_invoice_xml` | Download invoice as XML (returns download URL) |
| `send_invoice_email` | Send invoice (PDF + XML) by email to the customer or to specific recipients |
| `create_customer` | Create a customer for invoicing |
| `get_customer` | Get customer by ID |
| `list_customers` | List customers with optional filters |
| `update_customer` | Update an existing customer (partial update) |
| `delete_customer` | Delete a customer |
| `create_product` | Create a product for invoicing |
| `get_product` | Get product by ID |
| `list_products` | List products |
| `update_product` | Update an existing product (partial update) |
| `delete_product` | Delete a product |
| `create_receipt` | Create a receipt (recibo de venta) — the customer can later self-invoice it from the receipt's folio |
| `list_receipts` | List receipts with filters |
| `list_webhooks` | List configured webhooks |

## Auth

Uses **Bearer token** authentication. Obtain your API key from the [FacturAPI Dashboard](https://www.facturapi.io/).

## API Reference

- [FacturAPI Docs](https://docs.facturapi.io/)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
