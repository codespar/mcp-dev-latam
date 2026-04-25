# @codespar/mcp-correios


> **Alpha release** — published under the `alpha` npm dist-tag. Endpoint paths follow public docs and BACEN/provider conventions but have not been fully live-validated. Pin exact versions during `0.x.x-alpha`. Install with `npm install <pkg>@alpha`.

> MCP server for **Correios** — Brazilian postal service tracking, rates, and shipping

[![npm](https://img.shields.io/npm/v/@codespar/mcp-correios)](https://www.npmjs.com/package/@codespar/mcp-correios)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "correios": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-correios"],
      "env": {
        "CORREIOS_USER": "your-user",
        "CORREIOS_TOKEN": "your-token"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add correios -- npx @codespar/mcp-correios
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "correios": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-correios"],
      "env": {
        "CORREIOS_USER": "your-user",
        "CORREIOS_TOKEN": "your-token"
      }
    }
  }
}
```

## Tools (21)

| Tool | Purpose |
|---|---|
| `track_package` | Track a package by Correios tracking code |
| `track_bulk` | Track multiple Correios packages in a single call (up to 50 codes) |
| `calculate_shipping` | Calculate shipping rates between two CEPs |
| `get_delivery_time` | Get estimated delivery time between two CEPs |
| `list_services` | List available Correios shipping services |
| `find_cep` | Look up address by CEP via Correios |
| `find_cep_bulk` | Batch address lookup for up to 20 CEPs in a single call |
| `list_cep_ranges` | List CEP ranges (faixas de CEP) served by a given shipping service |
| `get_delivery_modality` | Get delivery modality (forma de entrega) for a CEP and service — whether delivery is domicile, agency picku... |
| `create_prepost` | Create a pre-posting order for shipping |
| `get_prepost` | Get a pre-posting order by ID |
| `list_preposts` | List pre-posting orders with optional filters (date range, status) |
| `cancel_prepost` | Cancel a pre-posting order |
| `buy_label_range` | Request a range of SIGEP tracking labels (etiquetas) for a service |
| `post_objects` | Close and post a list of pre-posted objects (fechar postagem SIGEP) — creates a PLP |
| `list_postal_codes` | Search addresses by street name or location (returns matching CEPs) |
| `create_collection` | Schedule a package collection (pickup) from an address |
| `get_collection` | Get collection request details by ID |
| `cancel_collection` | Cancel a scheduled collection request |
| `create_reverse` | Create a reverse logistics (return) order |
| `get_reverse` | Get reverse logistics order details by ID |

## Authentication

Correios uses Basic Auth for token generation, then Bearer token for subsequent requests. The server automatically manages authentication.

## Sandbox / Testing

Correios provides a homologation environment for testing. Contact Correios for homologation credentials.

### Get your credentials

1. Go to [Correios CWS Portal](https://cws.correios.com.br)
2. Register for API access (requires a contract with Correios)
3. Get your username and token
4. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CORREIOS_USER` | Yes | Correios API username |
| `CORREIOS_TOKEN` | Yes | Correios API token |

## Roadmap

### v0.2 (planned)
- `list_postal_codes` — List postal codes for a region
- `get_postal_code_range` — Get postal code range for a city
- `create_collection` — Schedule a package collection
- `get_collection` — Get collection request details
- `create_reverse` — Create a reverse logistics (return) request

### v0.3 (planned)
- `batch_tracking` — Track multiple packages in a single request
- `international_shipping` — Calculate international shipping rates

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Correios Website](https://correios.com.br)
- [Correios API Portal](https://cws.correios.com.br)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
