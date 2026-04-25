# @codespar/mcp-ebanx

> MCP server for **EBANX** — cross-border payments for Latin America

[![npm](https://img.shields.io/npm/v/@codespar/mcp-ebanx)](https://www.npmjs.com/package/@codespar/mcp-ebanx)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ebanx": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-ebanx"],
      "env": {
        "EBANX_INTEGRATION_KEY": "your-key",
        "EBANX_SANDBOX": "true"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add ebanx -- npx @codespar/mcp-ebanx
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "ebanx": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-ebanx"],
      "env": {
        "EBANX_INTEGRATION_KEY": "your-key",
        "EBANX_SANDBOX": "true"
      }
    }
  }
}
```

## Tools (18)

| Tool | Purpose |
|---|---|
| `create_payment` | Create a payment in EBANX (boleto, credit card, PIX, etc.) |
| `get_payment` | Get payment details by hash |
| `list_payments` | List payments by date range |
| `refund` | Refund a payment (full or partial) |
| `create_payout` | Create a payout to a bank account |
| `exchange_rate` | Get current exchange rate for a currency pair |
| `get_banks` | List available banks for a country |
| `query_payment_by_merchant_code` | Get payment details by merchant_payment_code (alternative to hash) |
| `capture_payment` | Capture a previously authorized credit card payment (full or partial). |
| `cancel_payment` | Cancel/void a pending payment by hash (e.g. |
| `create_mass_payout` | Create a mass payout — multiple payouts in a single batch request. |
| `get_payout` | Query a payout by external_reference or payout id. |
| `simulate_payment` | Simulate the response of a payment in sandbox without persisting it (useful for integration testing). |
| `list_payment_methods` | List available payment methods for a country (which payment_type_codes are supported). |
| `create_card_token` | Tokenize a credit/debit card for reuse without re-collecting card data. |
| `delete_card_token` | Delete a previously stored card token. |
| `validate_document` | Validate a LATAM tax document (CPF/CNPJ for BR, RFC for MX, DNI for AR/PE) using checksum/format rules. |
| `verify_notification` | Verify an EBANX webhook notification HMAC signature against the integration key. |

## Authentication

EBANX uses an integration key passed in the request body/query parameters.

## Sandbox / Testing

EBANX provides a sandbox at `sandbox.ebanx.com`. Set `EBANX_SANDBOX=true` to use it.

### Get your credentials

1. Go to [EBANX Dashboard](https://dashboard.ebanx.com)
2. Create a developer account
3. Get your integration key
4. Set the `EBANX_INTEGRATION_KEY` environment variable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EBANX_INTEGRATION_KEY` | Yes | Integration key from EBANX dashboard |
| `EBANX_SANDBOX` | No | Set to `"true"` for sandbox mode |

## Roadmap

### v0.2 (planned)
- `create_subscription` — Create a recurring subscription
- `cancel_payment` — Cancel a pending payment
- `get_merchant_info` — Get merchant account information
- `create_split` — Create split payment rules

### v0.3 (planned)
- `batch_payouts` — Process multiple payouts in a single request
- `detailed_reports` — Generate detailed financial reports

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [EBANX Website](https://ebanx.com)
- [EBANX API Documentation](https://docs.ebanx.com)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
