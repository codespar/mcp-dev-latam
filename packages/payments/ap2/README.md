# @codespar/mcp-ap2

> MCP server for **AP2** — Google's Agent-to-Agent Payment Protocol (authorization, audit, and trust for agentic payments)

[![npm](https://img.shields.io/npm/v/@codespar/mcp-ap2)](https://www.npmjs.com/package/@codespar/mcp-ap2)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## What is AP2?

AP2 (Agent-to-Agent Payment Protocol) is Google's open framework for **authorization, audit, and trust** in agentic payments. It answers the critical questions: *Who authorized this payment? What limits apply? What's the full audit trail?*

With 60+ partners including Visa, Mastercard, Stripe, PayPal, and Square, AP2 is the emerging standard for agent payment governance.

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ap2": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-ap2"],
      "env": {
        "AP2_API_KEY": "your-key",
        "AP2_AGENT_ID": "your-agent-id"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add ap2 -- npx @codespar/mcp-ap2
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "ap2": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-ap2"],
      "env": {
        "AP2_API_KEY": "your-key",
        "AP2_AGENT_ID": "your-agent-id"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `register_agent` | Register an AI agent as a trusted payer in AP2 |
| `get_agent` | Get agent registration details and trust status |
| `list_agents` | List registered agents with filters |
| `revoke_agent` | Revoke an agent's payment authorization |
| `authorize_payment` | Request payment authorization with scoped limits |
| `get_authorization` | Get authorization details by ID |
| `list_authorizations` | List payment authorizations with filters |
| `execute_payment` | Execute an authorized payment |
| `get_audit_trail` | Get full audit trail for a transaction |
| `list_audit_events` | List audit events with filters |
| `list_payment_methods` | List available payment methods via AP2 partners |
| `get_transaction` | Get full transaction details |
| `list_transactions` | List transactions with filters |

## Authentication

AP2 uses a Bearer API key and requires a registered Agent ID.

### Get your credentials

1. Visit the [AP2 Developer Portal](https://developers.google.com/ap2)
2. Register your application
3. Generate an API key
4. Register your agent to get an Agent ID
5. Set the environment variables

## Sandbox / Testing

AP2 provides a sandbox environment for testing. Set `AP2_SANDBOX=true` to use it.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AP2_API_KEY` | Yes | API key from AP2 |
| `AP2_AGENT_ID` | Yes | Registered agent ID |
| `AP2_SANDBOX` | No | Set to `true` for sandbox mode |

## Use Cases

- **Authorized agent purchases** — Agent requests spend authorization, gets approval with limits, then executes payment
- **Multi-agent commerce** — Agent A authorizes Agent B to make payments on its behalf with scoped limits
- **Compliance & audit** — Full audit trail of every authorization, approval, execution, and settlement
- **Cross-rail payments** — AP2 bridges card payments, bank transfers, wallets, and x402 micropayments

## Roadmap

### v0.2 (planned)
- `create_policy` — Define reusable authorization policies
- `delegate_authority` — Allow agent-to-agent authorization delegation
- `get_spend_report` — Get spend analytics and reports
- OAuth 2.0 authentication flow

### v0.3 (planned)
- Webhook support for real-time authorization events
- Multi-currency support with automatic FX
- Integration with x402 as payment method

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [AP2 (Google)](https://developers.google.com/ap2)
- [AP2 Specification](https://github.com/anthropic-payments/ap2-spec)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## License

MIT
