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

## Tools (22)

| Tool | Purpose |
|---|---|
| `create_transaction` | Create a payment transaction |
| `get_transaction` | Get transaction details by ID |
| `list_transactions` | List transactions |
| `search_transaction_by_reference` | Find transaction(s) by merchant reference |
| `void_transaction` | Void a transaction |
| `create_payment_link` | Create a payment link |
| `get_payment_link` | Get payment link details |
| `update_payment_link` | Update a payment link |
| `list_payment_links` | List payment links |
| `list_payment_methods` | List available payment methods for the merchant |
| `get_acceptance_token` | Get merchant acceptance token (required for transactions) |
| `create_tokenized_card` | Tokenize a credit/debit card |
| `create_tokenized_nequi` | Tokenize a Nequi wallet (start async tokenization by phone number) |
| `get_tokenization_status` | Query async tokenization status (Nequi etc.) by tokenization id |
| `create_payment_source` | Create a reusable payment source (CARD/NEQUI/PSE) linked to a customer email |
| `create_customer` | Create a customer profile |
| `get_customer` | Get customer by ID |
| `list_financial_institutions` | List PSE banks (financial institutions) |
| `create_refund` | Create a refund for a transaction |
| `get_refund` | Get refund details by ID |
| `get_merchant` | Get merchant information |
| `validate_webhook_signature` | Validate a Wompi event signature. |

## Auth

Uses **Bearer token** authentication with the private key. The public key is used for client-side tokenization and merchant queries.

## API Reference

- [Wompi API Docs](https://docs.wompi.co/)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
