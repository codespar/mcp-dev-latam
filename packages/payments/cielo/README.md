# @codespar/mcp-cielo

> MCP server for **Cielo** — card acquiring, boleto, and recurrent payments

[![npm](https://img.shields.io/npm/v/@codespar/mcp-cielo)](https://www.npmjs.com/package/@codespar/mcp-cielo)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cielo": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-cielo"],
      "env": {
        "CIELO_MERCHANT_ID": "your-merchant-id",
        "CIELO_MERCHANT_KEY": "your-merchant-key",
        "CIELO_SANDBOX": "true"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add cielo -- npx @codespar/mcp-cielo
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "cielo": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-cielo"],
      "env": {
        "CIELO_MERCHANT_ID": "your-merchant-id",
        "CIELO_MERCHANT_KEY": "your-merchant-key",
        "CIELO_SANDBOX": "true"
      }
    }
  }
}
```

## Tools (22)

| Tool | Purpose |
|---|---|
| `create_sale` | Create a credit/debit card sale in Cielo |
| `get_sale` | Get sale details by PaymentId |
| `capture_sale` | Capture a pre-authorized sale |
| `cancel_sale` | Cancel/void a sale (full or partial) |
| `create_recurrent` | Create a recurrent (recurring) credit card payment |
| `get_recurrent` | Get recurrent payment details |
| `tokenize_card` | Tokenize a credit card for future use |
| `create_boleto` | Create a boleto payment in Cielo |
| `create_pix` | Create a Pix payment in Cielo (generates QR code) |
| `get_pix` | Get Pix payment details and QR code by PaymentId |
| `create_debit` | Create a debit card sale in Cielo (requires 3DS authentication) |
| `create_ewallet` | Create a digital wallet payment (Google Pay, Samsung Pay, Apple Pay) |
| `get_antifraud` | Get anti-fraud analysis details for a payment |
| `create_sale_with_token` | Create a credit card sale using a previously stored CardToken (avoids re-entering card data) |
| `update_recurrent_amount` | Update the amount of an existing recurrent payment |
| `update_recurrent_next_date` | Update the next charge date of an existing recurrent payment |
| `deactivate_recurrent` | Deactivate (pause) a recurrent payment so it stops charging |
| `reactivate_recurrent` | Reactivate a previously deactivated recurrent payment |
| `create_payment_link` | Create a Cielo Link de Pagamento (shareable checkout URL) |
| `get_payment_link` | Get a Cielo Link de Pagamento by its id |
| `zero_auth` | Zero-dollar authorization to validate a card without charging (card or CardToken) |
| `create_sale_with_3ds` | Create a credit card sale using 3DS 2.0 authentication data (from 3DS flow) |

## Authentication

Cielo uses MerchantId and MerchantKey headers for authentication.

## Sandbox / Testing

Cielo provides a sandbox at `apisandbox.cieloecommerce.cielo.com.br`. Set `CIELO_SANDBOX=true` to use it.

### Get your credentials

1. Go to [Cielo Developer Portal](https://developercielo.github.io)
2. Create a developer account
3. Get your MerchantId and MerchantKey
4. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CIELO_MERCHANT_ID` | Yes | Merchant ID from Cielo |
| `CIELO_MERCHANT_KEY` | Yes | Merchant Key from Cielo |
| `CIELO_SANDBOX` | No | Set to `"true"` for sandbox mode |

## Roadmap

### v0.2 (planned)
- `create_pix` — Create a Pix payment
- `get_pix` — Get Pix payment details
- `create_debit` — Create a debit card payment
- `create_ewallet` — Create an e-wallet payment (Apple Pay, Google Pay)
- `get_antifraud` — Get anti-fraud analysis for a transaction

### v0.3 (planned)
- `batch_captures` — Capture multiple pre-authorized transactions
- `velocity_rules` — Configure velocity/anti-fraud rules

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Cielo Website](https://cielo.com.br)
- [Cielo API Documentation](https://developercielo.github.io)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
