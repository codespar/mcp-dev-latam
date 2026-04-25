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

## Tools (22)

| Tool | Purpose |
|---|---|
| `create_nfse` | Issue an NFS-e (service invoice). |
| `get_nfse` | Fetch a single NFS-e by id. |
| `cancel_nfse` | Cancel an NFS-e. |
| `list_nfse` | List NFS-e with pagination + optional flowStatus filter. |
| `email_nfse` | Email the PDF of an already-issued NFS-e to a recipient. |
| `create_nfe` | Issue an NF-e (product invoice). |
| `get_nfe` | Fetch a single NF-e by id. |
| `cancel_nfe` | Cancel an NF-e. |
| `list_nfe` | List NF-e with pagination + optional status filter. |
| `get_nfe_pdf` | Return the DANFE PDF URL for an issued NF-e. |
| `consult_cnpj` | Look up Brazilian company data (razão social, status, address) by CNPJ. |
| `consult_cep` | Resolve a Brazilian postal code (CEP) to a full address. |
| `correct_nfe` | Issue a Carta de Correção (CC-e) for an authorized NF-e. |
| `get_nfe_xml` | Return the authorized XML URL for an NF-e. |
| `get_nfse_pdf` | Return the PDF URL for an issued NFS-e. |
| `get_nfse_xml` | Return the XML URL for an issued NFS-e. |
| `list_companies` | List companies registered on the NFe.io account. |
| `get_company` | Fetch a single company by id or CNPJ. |
| `create_company` | Provision a new company on NFe.io. |
| `list_webhooks` | List webhook endpoints registered for a company (invoice event callbacks). |
| `create_webhook` | Register a webhook endpoint. |
| `delete_webhook` | Remove a webhook endpoint by id. |

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
