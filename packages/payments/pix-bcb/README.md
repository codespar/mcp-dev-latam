# @codespar/mcp-pix-bcb

> MCP server for **Pix BCB** — official Banco Central do Brasil Pix API

[![npm](https://img.shields.io/npm/v/@codespar/mcp-pix-bcb)](https://www.npmjs.com/package/@codespar/mcp-pix-bcb)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pix-bcb": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-pix-bcb"],
      "env": {
        "PIX_BASE_URL": "https://pix.example.com/api/v2",
        "PIX_CLIENT_ID": "your-client-id",
        "PIX_CLIENT_SECRET": "your-client-secret",
        "PIX_CERT_PATH": "/path/to/certificate.pem"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add pix-bcb -- npx @codespar/mcp-pix-bcb
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "pix-bcb": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-pix-bcb"],
      "env": {
        "PIX_BASE_URL": "https://pix.example.com/api/v2",
        "PIX_CLIENT_ID": "your-client-id",
        "PIX_CLIENT_SECRET": "your-client-secret",
        "PIX_CERT_PATH": "/path/to/certificate.pem"
      }
    }
  }
}
```

## Tools (18)

| Tool | Purpose |
|---|---|
| `create_cob` | Create an immediate Pix charge (cobranca imediata) |
| `get_cob` | Get immediate charge details by txid |
| `list_cobs` | List immediate charges with date range and filters |
| `update_cob` | Revise an existing immediate charge (PATCH /cob/{txid}). |
| `create_cobv` | Create a due-date Pix charge (cobranca com vencimento) |
| `list_cobv` | List due-date charges (cobv) within a date range |
| `update_cobv` | Revise an existing due-date charge (PATCH /cobv/{txid}) |
| `get_pix` | Get a received Pix payment by e2eid (endToEndId) |
| `list_pix_received` | List received Pix payments within a date range |
| `create_devolucao` | Request a refund (devolução) for a received Pix (PUT /pix/{e2eid}/devolucao/{id}) |
| `get_devolucao` | Get refund details by e2eid + refund id (GET /pix/{e2eid}/devolucao/{id}) |
| `create_pix_key` | Register a Pix key in DICT (requires PSP support) |
| `get_pix_key` | Look up a Pix key in DICT |
| `list_pix_keys` | List all Pix keys owned by the authenticated account at this PSP |
| `request_key_portability` | Request portability of a Pix key from another PSP into this PSP (DICT portability flow) |
| `resolve_key_claim` | Resolve a pending DICT key claim (confirm or cancel) — POST /dict/keys/claims/{id}/resolve |
| `set_webhook` | Configure a webhook URL for a given Pix key (PUT /webhook/{chave}). |
| `delete_webhook` | Remove the webhook configured for a Pix key (DELETE /webhook/{chave}) |

## Authentication

The Pix BCB API uses OAuth2 client credentials with mTLS. Each PSP (bank) provides their own base URL and certificate requirements.

## Sandbox / Testing

Sandbox availability varies by PSP (payment service provider). Contact your bank for homologation environment access.

### Get your credentials

1. Go to [Pix API Documentation (BCB)](https://bacen.github.io/pix-api/)
2. Register with your PSP (bank) for API access
3. Obtain your OAuth2 client credentials and mTLS certificate
4. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PIX_BASE_URL` | Yes | PSP API base URL (e.g., `https://pix.example.com/api/v2`) |
| `PIX_CLIENT_ID` | Yes | OAuth2 client ID |
| `PIX_CLIENT_SECRET` | Yes | OAuth2 client secret |
| `PIX_CERT_PATH` | No | Path to mTLS certificate (.pem or .p12) |

## Roadmap

### v0.2 (planned)
- `create_location` — Create a Pix location (payload URL)
- `get_location` — Get details of a Pix location
- `list_locations` — List all Pix locations
- `create_devolucao` — Create a Pix refund (devolucao)
- `get_devolucao` — Get Pix refund details

### v0.3 (planned)
- `create_cobv_batch` — Create a batch of due-date Pix charges (cobv)
- `webhook_management` — Register, get, and delete Pix webhooks

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Pix API Specification (BCB)](https://bacen.github.io/pix-api/)
- [Banco Central do Brasil](https://www.bcb.gov.br)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
