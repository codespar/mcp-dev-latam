# @codespar/mcp-pluggy

MCP server for **Pluggy** — Open Finance Brasil aggregator (ITP/TPP). Pluggy holds the ICP-Brasil certificate and runs Dynamic Client Registration with each Brazilian bank, so you integrate against one API instead of N.

> ⚠️ **ALPHA SCAFFOLD.** The package + `server.json` reserve the catalog slot and document the env contract. Today's tool surface is a single `health_check` placeholder. The real toolset (list_connectors, create_item, list_accounts, list_transactions, payments_initiation) lands in a follow-on PR.

## Quick Start

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pluggy": {
      "command": "npx",
      "args": ["@codespar/mcp-pluggy"],
      "env": {
        "PLUGGY_CLIENT_ID": "your-client-id",
        "PLUGGY_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### Cursor / VS Code

Same config in `.cursor/mcp.json` or VS Code's MCP integration.

## Tools (1)

| Tool | Description |
|---|---|
| `health_check` | Verifies the server is running and creds are set. Returns `configured` or `missing-creds`. |

## Authentication

Pluggy uses an OAuth2 client-credentials flow:

1. Client obtains an API key by `POST /auth` with `clientId` + `clientSecret`
2. Subsequent requests include the API key as `X-API-KEY`

Issue credentials at the Pluggy dashboard:

- Production: <https://dashboard.pluggy.ai>
- Docs: <https://docs.pluggy.ai>

## Sandbox / Testing

Pluggy provides sandbox connectors with synthetic accounts and transactions. The sandbox uses the same API endpoint (`https://api.pluggy.ai`); the connector list returned by `/connectors` includes sandbox banks (`Pluggy Bank`, `BR · Pluggy Bank`).

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PLUGGY_CLIENT_ID` | yes | Client ID from the Pluggy dashboard |
| `PLUGGY_CLIENT_SECRET` | yes | Client secret from the Pluggy dashboard |

## Why use Pluggy via CodeSpar

If you only need the MCP server, install the package directly. If you're building a commerce agent that needs Pluggy + Pix + NF-e + WhatsApp + dashboard governance, look at the managed tier.

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
