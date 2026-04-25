# MCP STP/SPEI


> **Alpha release** — published under the `alpha` npm dist-tag. Endpoint paths follow public docs and BACEN/provider conventions but have not been fully live-validated. Pin exact versions during `0.x.x-alpha`. Install with `npm install <pkg>@alpha`.

MCP server for **STP/SPEI** — Mexican instant bank transfer system (equivalent to Brazil's PIX).

## Quick Start

```bash
# Set your credentials
export STP_API_KEY="your-api-key"
export STP_COMPANY="your-company-id"

# Run via stdio
npx tsx packages/mexico/stp-spei/src/index.ts

# Run via HTTP
npx tsx packages/mexico/stp-spei/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `STP_API_KEY` | Yes | API key from STP |
| `STP_COMPANY` | Yes | Company identifier |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools (18)

| Tool | Purpose |
|---|---|
| `create_transfer` | Create a SPEI transfer |
| `get_transfer` | Get transfer details by ID |
| `list_transfers` | List transfers with filters |
| `cancel_transfer` | Cancel a pending SPEI orden by clave_rastreo (only works while orden is pending) |
| `get_balance` | Get account balance |
| `list_account_balances` | List balances for all company accounts |
| `validate_account` | Validate a CLABE account number against the receiving bank (online check) |
| `validate_clabe` | Validate CLABE structure and checksum locally (no API call). |
| `list_banks` | List participating SPEI banks |
| `lookup_bank_by_code` | Look up a participating bank by its ABM/SPEI code (first 3 digits of CLABE) |
| `get_cep` | Get CEP (Comprobante Electronico de Pago) for transfer validation |
| `register_beneficiary` | Register a beneficiary account |
| `create_refund` | Create a SPEI refund/devolución for a previously received transfer |
| `list_refunds` | List devoluciones (refunds) by date range |
| `conciliation_report` | Get transactions reconciliation report by date (all received + sent ordenes) |
| `register_webhook` | Register a webhook URL to receive STP event notifications |
| `list_webhooks` | List registered webhooks for the company |
| `delete_webhook` | Delete a registered webhook by ID |

## Auth

Uses **API key + digital signature** authentication. The API key is sent as a Bearer token, and the company identifier is included in requests. Obtain credentials from [STP](https://www.stp.mx/).

## API Reference

- [STP API Docs](https://stpmex.com/documentacion)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
