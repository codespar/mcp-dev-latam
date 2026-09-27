# @codespar/mcp-celcoin

> MCP server for **Celcoin** — BaaS infrastructure for Pix, boleto, transfers, and top-ups

[![npm](https://img.shields.io/npm/v/@codespar/mcp-celcoin)](https://www.npmjs.com/package/@codespar/mcp-celcoin)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "celcoin": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-celcoin"],
      "env": {
        "CELCOIN_CLIENT_ID": "your-client-id",
        "CELCOIN_CLIENT_SECRET": "your-client-secret",
        "CELCOIN_SANDBOX": "true"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add celcoin -- npx @codespar/mcp-celcoin
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "celcoin": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-celcoin"],
      "env": {
        "CELCOIN_CLIENT_ID": "your-client-id",
        "CELCOIN_CLIENT_SECRET": "your-client-secret",
        "CELCOIN_SANDBOX": "true"
      }
    }
  }
}
```

## Tools (18)

| Tool | Purpose |
|---|---|
| `create_pix_payment` | Create a Pix payment via Celcoin |
| `get_pix_payment` | Get Pix payment details by transaction ID |
| `create_pix_cob` | Create a Pix immediate charge (cob) — generates QR code / copia-e-cola for payer |
| `get_pix_cob` | Get a Pix immediate charge by transactionId or txid |
| `create_pix_cobv` | Create a Pix due charge (cobv) — boleto-like Pix with due date |
| `lookup_pix_dict` | Lookup a Pix DICT key — resolves a Pix key to account holder + bank info |
| `create_pix_devolution` | Create a Pix devolução (refund) — refund a received Pix transaction |
| `cancel_boleto` | Cancel a boleto issued via the bill-issuance product by id |
| `read_barcode` | Authorize (consult) a boleto / concessionária barcode before paying — returns transactionId, amount, totalUpdated, dueDate |
| `pay_bill` | Confirm payment of a previously authorized bill — pass the read_barcode transactionId as transactionIdAuthorize |
| `get_statement` | Get account statement (extrato) for a date range |
| `list_topup_providers` | List telecom top-up providers (operadoras) available for recargas |
| `create_boleto` | Issue a boleto via the bill-issuance product |
| `get_boleto` | Get an issued boleto's details by id |
| `create_transfer` | Create a bank transfer (TED/DOC) via Celcoin |
| `get_balance` | Get account balance at Celcoin |
| `list_banks` | List available banks in Brazil (ISPB codes) |
| `create_topup` | Create a mobile/service top-up (recarga) via Celcoin |

## Authentication

Celcoin uses OAuth2 client credentials. The server automatically manages token refresh.

## Sandbox / Testing

Celcoin provides a sandbox at `sandbox.openfinance.celcoin.dev`. Set `CELCOIN_SANDBOX=true` to use it.

Without `CELCOIN_SANDBOX`, the server calls Celcoin production at `api.openfinance.celcoin.com.br` (up to 0.2.3 the default was `api-sec.celcoin.com.br`, a host that does not exist). Celcoin accepts production calls only over mTLS, with a certificate Celcoin issues, and only from IPs you registered with them in advance ([Celcoin docs](https://developers.celcoin.com.br/docs/obtendo-acesso-%C3%A0s-apis)). From any other IP the token call answers `401 "O seu IP ou certificado digital nao foi reconhecido"`. This server does not present a client certificate, so in production point `CELCOIN_BASE_URL` at a proxy that holds the certificate and terminates the mTLS; called directly, production answers that 401.

### Get your credentials

1. Go to [Celcoin Documentation](https://docs.celcoin.com.br)
2. Create a developer account
3. Register an application to get OAuth2 credentials
4. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CELCOIN_CLIENT_ID` | Yes | OAuth2 client ID |
| `CELCOIN_CLIENT_SECRET` | Yes | OAuth2 client secret |
| `CELCOIN_SANDBOX` | No | Set to `"true"` for sandbox mode |
| `CELCOIN_BASE_URL` | No | Override the API host. Defaults: `https://api.openfinance.celcoin.com.br` (production), `https://sandbox.openfinance.celcoin.dev` (sandbox) |

## Roadmap

### v0.2 (planned)
- `get_pix_key` — Get Pix key details (DICT lookup)
- `create_bill_payment` — Create a bill/utility payment
- `get_bill_payment` — Get bill payment details
- `create_scheduled_transfer` — Create a scheduled transfer
- `list_providers` — List available service providers

### v0.3 (planned)
- `batch_topups` — Process multiple mobile top-ups
- `detailed_reports` — Generate detailed transaction reports

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-latam) or [request a tool](https://github.com/codespar/mcp-dev-latam/issues).

## Links

- [Celcoin Website](https://celcoin.com.br)
- [Celcoin API Documentation](https://docs.celcoin.com.br)
- [MCP Dev LATAM](https://github.com/codespar/mcp-dev-latam)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
