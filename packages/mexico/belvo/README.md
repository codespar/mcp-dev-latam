# MCP Belvo

MCP server for **Belvo** — Open Finance aggregator for LATAM (Mexico, Argentina, Colombia).

## Quick Start

```bash
# Set your credentials
export BELVO_SECRET_ID="your-secret-id"
export BELVO_SECRET_PASSWORD="your-secret-password"
export BELVO_SANDBOX=true  # Use sandbox environment

# Run via stdio
npx tsx packages/mexico/belvo/src/index.ts

# Run via HTTP
npx tsx packages/mexico/belvo/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BELVO_SECRET_ID` | Yes | Secret ID from Belvo dashboard |
| `BELVO_SECRET_PASSWORD` | Yes | Secret password from Belvo dashboard |
| `BELVO_SANDBOX` | No | Set to `"true"` to use sandbox (default: production) |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools (24)

| Tool | Purpose |
|---|---|
| `list_institutions` | List available financial institutions |
| `create_link` | Create a link to a financial institution |
| `list_links` | List existing links |
| `get_accounts` | Get accounts for a link |
| `get_balances` | Get balances for a link |
| `get_transactions` | Get transactions for a link |
| `get_owners` | Get owner information for a link |
| `get_incomes` | Get income data for a link |
| `get_tax_returns` | Get tax returns for a link (fiscal institutions) |
| `get_investments` | Get investment portfolios for a link |
| `get_link` | Retrieve details of a specific link by ID |
| `delete_link` | Delete a link (and all its associated data) by ID |
| `patch_link` | Update a link's credentials or resume after MFA (PATCH /api/links/) |
| `list_accounts` | List stored accounts (GET /api/accounts/) with optional filters |
| `get_account_detail` | Retrieve a stored account by account ID |
| `list_transactions` | List stored transactions (GET /api/transactions/) with optional filters |
| `get_transaction_detail` | Retrieve a stored transaction by transaction ID |
| `list_balances` | List stored balances (GET /api/balances/) with optional filters |
| `list_owners` | List stored owners (GET /api/owners/) |
| `list_incomes` | List stored incomes (GET /api/incomes/) |
| `get_employment_records` | Get employment records for a link (employment institutions) |
| `get_invoices` | Get invoices for a link (BR/MX fiscal institutions) |
| `get_receivables_transactions` | Get receivables transactions for a link (payment rails / acquirer data) |
| `create_widget_token` | Create a short-lived access token for the Belvo Connect Widget |

## Auth

Uses **Basic authentication** (secret_id:secret_password). Obtain your credentials from the [Belvo Dashboard](https://dashboard.belvo.com/).

## API Reference

- [Belvo API Docs](https://developers.belvo.com/)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
