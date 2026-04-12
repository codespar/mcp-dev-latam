# MCP Alegra

MCP server for **Alegra** — cloud accounting platform for LATAM (Colombian-founded), supporting invoicing, contacts, inventory, and payments across CO, MX, AR, CL, and more.

## Quick Start

```bash
# Set your credentials
export ALEGRA_EMAIL="your-email@example.com"
export ALEGRA_API_TOKEN="your-api-token"

# Run via stdio
npx tsx packages/colombia/alegra/src/index.ts

# Run via HTTP
npx tsx packages/colombia/alegra/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ALEGRA_EMAIL` | Yes | Account email address |
| `ALEGRA_API_TOKEN` | Yes | API token from Alegra settings |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools

| Tool | Description |
|------|-------------|
| `create_invoice` | Create an invoice |
| `get_invoice` | Get invoice details by ID |
| `list_invoices` | List invoices |
| `create_contact` | Create a contact (customer/supplier) |
| `list_contacts` | List contacts |
| `create_item` | Create a product/service item |
| `list_items` | List products and services |
| `list_payments` | List payments |
| `create_payment` | Record a payment |
| `get_company` | Get company profile and settings |

## Auth

Uses **Basic authentication** with email and API token. Obtain your API token from the Alegra settings page under "API" section.

## API Reference

- [Alegra API Docs](https://developer.alegra.com/)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
