# MCP Wompi

MCP server for **Wompi** — Colombian payment gateway by Bancolombia, supporting cards, PSE bank transfers, Nequi, and Bancolombia transfers.

## Quick Start

```bash
# Set your credentials
export WOMPI_PUBLIC_KEY="pub_test_..."
export WOMPI_PRIVATE_KEY="prv_test_..."
export WOMPI_SANDBOX="true"

# Run via stdio
npx tsx packages/colombia/wompi/src/index.ts

# Run via HTTP
npx tsx packages/colombia/wompi/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WOMPI_PUBLIC_KEY` | Yes | Public key from Wompi dashboard |
| `WOMPI_PRIVATE_KEY` | Yes | Private key for server-side operations |
| `WOMPI_SANDBOX` | No | Set to `"true"` for sandbox environment |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools

| Tool | Description |
|------|-------------|
| `create_transaction` | Create a payment transaction |
| `get_transaction` | Get transaction details by ID |
| `list_transactions` | List transactions |
| `void_transaction` | Void a transaction |
| `create_payment_link` | Create a payment link |
| `get_payment_link` | Get payment link details |
| `list_payment_methods` | List available payment methods |
| `get_acceptance_token` | Get merchant acceptance token |
| `create_tokenized_card` | Tokenize a credit/debit card |
| `get_merchant` | Get merchant information |

## Auth

Uses **Bearer token** authentication with the private key. The public key is used for client-side tokenization and merchant queries.

## API Reference

- [Wompi API Docs](https://docs.wompi.co/)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
