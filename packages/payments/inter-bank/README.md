# MCP Banco Inter

MCP server for **Banco Inter** — Brazilian digital bank with a full developer API for boletos, PIX, transfers, and banking.

## Quick Start

```bash
# Set your credentials
export INTER_CLIENT_ID="your-client-id"
export INTER_CLIENT_SECRET="your-client-secret"

# Run via stdio
npx tsx packages/payments/inter-bank/src/index.ts

# Run via HTTP
npx tsx packages/payments/inter-bank/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `INTER_CLIENT_ID` | Yes | OAuth2 client ID |
| `INTER_CLIENT_SECRET` | Yes | OAuth2 client secret |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools (22)

| Tool | Purpose |
|---|---|
| `create_boleto` | Create a boleto bancario (bank slip) |
| `get_boleto` | Get boleto details by ID |
| `list_boletos` | List boletos with filters |
| `cancel_boleto` | Cancel (write-off) a boleto |
| `get_boleto_pdf` | Download boleto PDF (returns base64 payload) |
| `create_pix` | Create a PIX payment |
| `get_pix` | Get PIX transaction details by ID |
| `list_pix` | List PIX transactions |
| `create_pix_cob` | Create PIX immediate charge (cob) with txid — returns BR Code/copia-e-cola |
| `get_pix_cob` | Retrieve PIX immediate charge by txid |
| `list_pix_cob` | List PIX immediate charges within a time range (with optional end_to_end_id filters) |
| `create_pix_cobv` | Create PIX due charge (cobv) with dueDate — boleto-like PIX with expiration date |
| `get_pix_cobv` | Retrieve PIX due charge (cobv) by txid |
| `create_pix_devolucao` | Create PIX return (devolução) for a received transaction |
| `list_pix_keys` | List PIX keys (chaves) registered to the Inter account |
| `get_balance` | Get account balance |
| `get_statement` | Get account statement for a date range |
| `get_statement_enriched` | Get enriched statement with detailed transaction info (counterparty, category, Pix details) |
| `get_statement_pdf` | Download account statement as PDF (base64 payload) for a date range |
| `create_transfer` | Create a TED or internal transfer |
| `get_webhook` | Get configured webhooks |
| `create_webhook` | Register a webhook for notifications |

## Auth

Uses **OAuth2 client credentials** flow. The token endpoint is `/oauth/v2/token` with scoped permissions per API:

- Boletos: `boleto-cobranca.read`, `boleto-cobranca.write`
- PIX: `pix.read`, `pix.write`
- Banking: `extrato.read`, `pagamento-ted.write`
- Webhooks: `webhook-boleto.read`, `webhook-boleto.write`, `webhook-pix.read`, `webhook-pix.write`

Register your application at the [Banco Inter Developer Portal](https://developers.inter.co/).

## API Reference

- [Banco Inter API Docs](https://developers.inter.co/references)
