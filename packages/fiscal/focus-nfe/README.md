# @codespar/mcp-focus-nfe

> MCP server for **Focus NFe** — NFe, NFSe, and NFCe fiscal document emission

[![npm](https://img.shields.io/npm/v/@codespar/mcp-focus-nfe)](https://www.npmjs.com/package/@codespar/mcp-focus-nfe)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "focus-nfe": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-focus-nfe"],
      "env": {
        "FOCUS_NFE_TOKEN": "your-token",
        "FOCUS_NFE_SANDBOX": "true"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add focus-nfe -- npx @codespar/mcp-focus-nfe
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "focus-nfe": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-focus-nfe"],
      "env": {
        "FOCUS_NFE_TOKEN": "your-token",
        "FOCUS_NFE_SANDBOX": "true"
      }
    }
  }
}
```

## Tools (19)

| Tool | Purpose |
|---|---|
| `create_nfe` | Create and emit an NFe (nota fiscal eletronica) |
| `get_nfe` | Get NFe details and status by reference |
| `cancel_nfe` | Cancel an authorized NFe (within 24h of emission) |
| `get_nfe_pdf` | Get NFe PDF (DANFE) download URL |
| `send_correction_letter` | Send a correction letter (Carta de Correcao / CCe) for an authorized NFe |
| `create_nfse` | Create and emit an NFSe (nota fiscal de servico) |
| `get_nfse` | Get NFSe details and status by reference |
| `cancel_nfse` | Cancel an authorized NFSe |
| `create_nfce` | Create and emit an NFCe (nota fiscal do consumidor eletronica) |
| `get_nfce` | Get NFCe details and status by reference |
| `cancel_nfce` | Cancel an authorized NFCe |
| `create_cte` | Create and emit a CTe (conhecimento de transporte eletronico) for cargo transport |
| `get_cte` | Get CTe details and status by reference |
| `cancel_cte` | Cancel an authorized CTe |
| `create_mdfe` | Create and emit an MDFe (manifesto eletronico de documentos fiscais) for cargo transport manifest |
| `close_mdfe` | Close/finalize an MDFe (encerramento) after trip completion |
| `register_webhook` | Register a webhook trigger (gatilho) that notifies your URL when fiscal document events occur |
| `list_webhooks` | List all registered webhooks (gatilhos) |
| `delete_webhook` | Delete a registered webhook by ID |

## Authentication

Focus NFe uses Basic Auth with the API token as username and empty password.

## Sandbox / Testing

Focus NFe provides a homologation environment at `homologacao.focusnfe.com.br`. Set `FOCUS_NFE_SANDBOX=true` to use it.

### Get your credentials

1. Go to [Focus NFe](https://focusnfe.com.br)
2. Create an account
3. Get your API token from the dashboard
4. Set the `FOCUS_NFE_TOKEN` environment variable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FOCUS_NFE_TOKEN` | Yes | API token from Focus NFe |
| `FOCUS_NFE_SANDBOX` | No | Set to `"true"` for homologation mode |

## Roadmap

### v0.2 (planned)
- `create_cte` — Create a CT-e (electronic transport document)
- `get_cte` — Get CT-e details by ID
- `correction_letter` — Issue a correction letter for an NF-e
- `manifest_recipient` — Manifest recipient awareness of an NF-e
- `get_nfse_pdf` — Get PDF for a service invoice (NFS-e)

### v0.3 (planned)
- `batch_nfe` — Create multiple NF-e in a single request
- `batch_nfse` — Create multiple NFS-e in a single request

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Focus NFe Website](https://focusnfe.com.br)
- [Focus NFe API Documentation](https://focusnfe.com.br/doc)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
