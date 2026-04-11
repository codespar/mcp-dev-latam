# @codespar/mcp-superfrete

> MCP server for **SuperFrete** — Brazilian shipping platform with discounted rates across multiple carriers

[![npm](https://img.shields.io/npm/v/@codespar/mcp-superfrete)](https://www.npmjs.com/package/@codespar/mcp-superfrete)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "superfrete": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-superfrete"],
      "env": {
        "SUPERFRETE_TOKEN": "your-token",
        "SUPERFRETE_SANDBOX": "true"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add superfrete -- npx @codespar/mcp-superfrete
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "superfrete": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-superfrete"],
      "env": {
        "SUPERFRETE_TOKEN": "your-token",
        "SUPERFRETE_SANDBOX": "true"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `calculate_freight` | Calculate shipping rates across carriers (PAC, SEDEX, JadLog, Loggi, Mini Envios) |
| `create_freight` | Create a freight/label order |
| `get_freight` | Get freight order details, status, and tracking |
| `checkout_freight` | Purchase freight orders and generate labels |
| `cancel_freight` | Cancel a freight order |
| `get_user_info` | Get user info, balance, and shipment limits |
| `get_user_addresses` | List saved addresses |
| `get_services` | Get available services with restrictions and limits |
| `list_webhooks` | List configured webhooks |
| `create_webhook` | Create a webhook for order event notifications |
| `delete_webhook` | Delete a webhook |

## Authentication

SuperFrete uses a Bearer token (API key) for authentication.

## Sandbox / Testing

SuperFrete provides a sandbox environment. Set `SUPERFRETE_SANDBOX=true` to use it.

### Get your credentials

1. Go to [SuperFrete](https://superfrete.com) and create an account
2. Navigate to [Integrations](https://web.superfrete.com/#/integrations/select-integration-platform)
3. Click **"Desenvolvedores"** → **"Integrar"** to generate your API token
4. Set the `SUPERFRETE_TOKEN` environment variable

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPERFRETE_TOKEN` | Yes | API Bearer token from SuperFrete |
| `SUPERFRETE_SANDBOX` | No | Set to `"true"` for sandbox mode |

## Available Services

| ID | Service | Carrier |
|----|---------|---------|
| 1 | PAC | Correios |
| 2 | SEDEX | Correios |
| 3 | .Package | JadLog |
| 17 | Mini Envios | Correios |
| 31 | Loggi | Loggi |

## Typical Workflow

1. **Calculate rates** with `calculate_freight` — get prices and delivery times for all carriers
2. **Create order** with `create_freight` — select a service and provide addresses
3. **Checkout** with `checkout_freight` — pay for the order and generate the label
4. **Track** with `get_freight` — monitor status and get the label print URL

## Links

- [SuperFrete Website](https://superfrete.com)
- [SuperFrete API Documentation](https://docs.superfrete.com)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## License

MIT
