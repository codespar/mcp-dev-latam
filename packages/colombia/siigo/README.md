# MCP Siigo

MCP server for **Siigo** — Colombian accounting platform with integrated DIAN electronic invoicing.

## Quick Start

```bash
# Set your credentials
export SIIGO_API_KEY="your-api-key"
export SIIGO_ACCESS_TOKEN="your-access-token"

# Run via stdio
npx tsx packages/colombia/siigo/src/index.ts

# Run via HTTP
npx tsx packages/colombia/siigo/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SIIGO_API_KEY` | Yes | API key from Siigo |
| `SIIGO_ACCESS_TOKEN` | Yes | Bearer access token |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools (22)

| Tool | Purpose |
|---|---|
| `create_invoice` | Create an invoice (DIAN electronic invoice) |
| `get_invoice` | Get invoice details by ID |
| `list_invoices` | List invoices |
| `create_credit_note` | Create a credit note against an invoice |
| `list_customers` | List customers |
| `create_customer` | Create a customer |
| `list_products` | List products |
| `create_product` | Create a product |
| `get_invoice_pdf` | Get the PDF document for an invoice |
| `get_credit_note` | Get a credit note by ID |
| `list_credit_notes` | List credit notes |
| `update_customer` | Update an existing customer |
| `delete_customer` | Delete a customer |
| `update_product` | Update an existing product |
| `delete_product` | Delete a product |
| `create_purchase` | Create a purchase document |
| `list_purchases` | List purchase documents |
| `list_document_types` | List document types (e.g., FV for invoice, NC for credit note, FC for purchase) |
| `list_users` | List Siigo users (sellers) |
| `list_warehouses` | List warehouses (bodegas) |
| `list_taxes` | List available tax types |
| `list_payment_methods` | List available payment methods |

## Auth

Uses **Bearer token** authentication. Obtain your access token from the Siigo developer portal.

## API Reference

- [Siigo API Docs](https://siigodeveloper.siigo.com/)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
