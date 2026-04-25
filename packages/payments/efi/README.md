# @codespar/mcp-efi

> MCP server for **EFI (Gerencianet)** — Pix charges, boleto, credit card, and carnets

[![npm](https://img.shields.io/npm/v/@codespar/mcp-efi)](https://www.npmjs.com/package/@codespar/mcp-efi)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "efi": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-efi"],
      "env": {
        "EFI_CLIENT_ID": "your-client-id",
        "EFI_CLIENT_SECRET": "your-client-secret",
        "EFI_SANDBOX": "true"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add efi -- npx @codespar/mcp-efi
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "efi": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-efi"],
      "env": {
        "EFI_CLIENT_ID": "your-client-id",
        "EFI_CLIENT_SECRET": "your-client-secret",
        "EFI_SANDBOX": "true"
      }
    }
  }
}
```

## Tools (18)

| Tool | Purpose |
|---|---|
| `create_cob` | Create an immediate Pix charge (cobranca imediata) |
| `get_cob` | Get Pix charge details by txid |
| `list_cobs` | List Pix charges by date range |
| `create_charge` | Create a billing charge (boleto or credit card) |
| `get_charge` | Get charge details by ID |
| `create_carnet` | Create a carnet (payment booklet with multiple parcels) |
| `get_pix_key` | Get details of a registered Pix key |
| `create_pix_evp` | Create a random Pix key (EVP/alias) |
| `create_cobv` | Create a Pix due charge (cobranca com vencimento). |
| `get_cobv` | Get Pix due charge (cobv) details by txid |
| `update_cobv` | Update an existing Pix due charge (cobv) by txid |
| `create_devolucao` | Request a Pix devolution (refund) on a received Pix transaction |
| `get_devolucao` | Get details of a Pix devolution by e2eId and devolution id |
| `list_pix_received` | List received Pix transactions (recebidos) by date range |
| `delete_pix_key` | Delete a registered Pix key (DICT) |
| `register_webhook` | Register a webhook URL for a given Pix key |
| `list_webhooks` | List registered webhooks by date range |
| `delete_webhook` | Delete the webhook registered for a Pix key |

## Authentication

EFI uses OAuth2 client credentials. The server automatically manages token refresh.

## Sandbox / Testing

EFI provides a sandbox at `pix-h.api.efipay.com.br`. Set `EFI_SANDBOX=true` to use it.

### Get your credentials

1. Go to [EFI Pay Dashboard](https://app.efipay.com.br)
2. Create an account
3. Register an application to get OAuth2 credentials
4. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EFI_CLIENT_ID` | Yes | OAuth2 client ID |
| `EFI_CLIENT_SECRET` | Yes | OAuth2 client secret |
| `EFI_SANDBOX` | No | Set to `"true"` for sandbox mode |

## Roadmap

### v0.2 (planned)
- `create_devolucao` — Create a Pix refund (devolucao)
- `get_devolucao` — Get Pix refund details
- `list_locations` — List Pix payload locations
- `create_webhook` — Register a webhook for Pix notifications
- `update_cob` — Update an existing Pix charge

### v0.3 (planned)
- `batch_charges` — Create multiple charges in a single request
- `split_payments` — Configure split payment rules

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [EFI Pay Website](https://efipay.com.br)
- [Gerencianet API Documentation](https://dev.gerencianet.com.br)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
