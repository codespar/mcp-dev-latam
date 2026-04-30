# @codespar/mcp-iniciador

MCP server for **Iniciador** — Open Finance Brasil PISP (Pix payment initiation aggregator). Iniciador holds the ICP-Brasil certificate and orchestrates DCR with each Brazilian bank for instant Pix-out flows.

> ⚠️ **ALPHA SCAFFOLD.** The package + `server.json` reserve the catalog slot. Today's tool surface is a single `health_check` placeholder. The real toolset (`initiate_pix`, `get_payment_status`, `list_payments`, `schedule_recurring_pix`) lands in a follow-on PR.

## Quick Start

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "iniciador": {
      "command": "npx",
      "args": ["@codespar/mcp-iniciador"],
      "env": {
        "INICIADOR_CLIENT_ID": "your-client-id",
        "INICIADOR_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### Cursor / VS Code

Same config in `.cursor/mcp.json`.

## Tools (1)

| Tool | Description |
|---|---|
| `health_check` | Verifies the server is running and creds are set. Returns `configured` or `missing-creds`. |

## Authentication

Iniciador uses OAuth2 client-credentials. The Pix-out call itself is signed end-to-end with the consumer's bank-issued consent token.

Issue credentials during Iniciador onboarding:

- Production: <https://iniciador.com.br>
- Docs: <https://docs.iniciador.com.br>

## Sandbox / Testing

Sandbox endpoint: `https://sandbox.iniciador.com.br`. Override via `INICIADOR_API_BASE`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `INICIADOR_CLIENT_ID` | yes | OAuth2 client ID from Iniciador onboarding |
| `INICIADOR_CLIENT_SECRET` | yes | OAuth2 client secret |
| `INICIADOR_API_BASE` | no | Override API base URL (default: production) |

## Iniciador vs Pluggy vs Belvo

Three OFB aggregators in this catalog, each with a different specialty:

| Aggregator | Strength | Best for |
|---|---|---|
| **[Iniciador](https://iniciador.com.br)** | Pix payment initiation (PISP) | Outgoing payments under OFB consent |
| **[Pluggy](https://www.pluggy.ai/en)** (`@codespar/mcp-pluggy`) | Account + transaction reads | Reconciliation, balance polling |
| **[Belvo](https://belvo.com/pt-br/)** (`@codespar/mcp-belvo`) | Multi-LATAM Open Finance + payroll + tax | Cross-border (BR + MX + CO + AR) |

For commerce agents that need both reads and writes, compose them — Pluggy/Belvo for account + recon visibility + Iniciador for Pix initiation.

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
