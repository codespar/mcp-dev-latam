# @codespar/mcp-nfe-io

> MCP server for **NFe.io** — NF-e / NFS-e fiscal document emission plus CNPJ and CEP lookups for Brazil.

[![npm](https://img.shields.io/npm/v/@codespar/mcp-nfe-io)](https://www.npmjs.com/package/@codespar/mcp-nfe-io)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nfe-io": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-nfe-io"],
      "env": {
        "NFEIO_API_KEY": "your-api-key",
        "NFEIO_COMPANY_ID": "your-company-id-or-cnpj"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add nfe-io -- npx @codespar/mcp-nfe-io
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "nfe-io": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-nfe-io"],
      "env": {
        "NFEIO_API_KEY": "your-api-key",
        "NFEIO_COMPANY_ID": "your-company-id-or-cnpj"
      }
    }
  }
}
```

## Tools

### Service invoices (NFS-e)

- `create_nfse` — issue a service invoice
- `get_nfse` — fetch one by id
- `cancel_nfse` — cancel (subject to municipal window)
- `list_nfse` — paginated list with optional `flowStatus` filter
- `email_nfse` — email the PDF to a recipient

### Product invoices (NF-e)

- `create_nfe` — issue a product invoice
- `get_nfe` — fetch one by id
- `cancel_nfe` — cancel (requires 15+ char justification)
- `list_nfe` — paginated list with optional `status` filter
- `get_nfe_pdf` — resolve the DANFE PDF URL

### Lookups

- `consult_cnpj` — Brazilian company data by CNPJ
- `consult_cep` — full address by postal code

## Environment

| Variable | Required | Notes |
|---|---|---|
| `NFEIO_API_KEY` | yes | Issuance + query scopes. NFe.io supports splitting this into two keys; either is fine. |
| `NFEIO_COMPANY_ID` | no | Default company id (or CNPJ). Per-call `company_id` arguments override it. |

## Hosts

NFe.io segments its API across three hostnames. This server maps tools to the correct one automatically:

- `api.nfse.io` — product invoices
- `api.nfe.io` — service invoices + company management
- `nfe.api.nfe.io` — lookups (CNPJ, CEP)

## Demo mode

Pass `--demo` or set `MCP_DEMO=true` to return canned responses without hitting the network. Useful for documentation, screencasts, and CI.

## Links

- [NFe.io REST API docs](https://nfe.io/docs/rest-api/)
- [CodeSpar MCP Brazil catalog](https://github.com/codespar/mcp-dev-brasil)

## License

MIT
