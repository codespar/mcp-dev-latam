# @codespar/mcp-ap2


> **Alpha release** — published under the `alpha` npm dist-tag. Endpoint paths follow public docs and BACEN/provider conventions but have not been fully live-validated. Pin exact versions during `0.x.x-alpha`. Install with `npm install <pkg>@alpha`.

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

## Tools (22)

| Tool | Purpose |
|---|---|
| `register_agent` | Register an AI agent as a trusted payer in the AP2 network. |
| `get_agent` | Get agent registration details, trust status, and current spend usage |
| `list_agents` | List registered agents with optional filters |
| `revoke_agent` | Revoke an agent's payment authorization. |
| `authorize_payment` | Request payment authorization with scoped limits. |
| `get_authorization` | Get authorization details including status, limits, and expiry |
| `list_authorizations` | List payment authorizations with optional filters |
| `execute_payment` | Execute an authorized payment. |
| `get_audit_trail` | Get the complete audit trail for a transaction — every authorization, approval, execution, and settlement e... |
| `list_audit_events` | List audit events across all transactions with filters |
| `list_payment_methods` | List available payment methods from AP2 partner network (Visa, Mastercard, Stripe, PayPal, etc.) |
| `get_transaction` | Get full transaction details including authorization, execution, and settlement status |
| `list_transactions` | List transactions with optional filters |
| `create_intent_mandate` | Create an AP2 intent mandate — a Verifiable Credential expressing the user's intent to delegate a transacti... |
| `create_cart_mandate` | Create an AP2 cart mandate — a signed, locked-cart commitment from a merchant binding line items, totals, a... |
| `create_payment_mandate` | Create an AP2 payment mandate — the final Verifiable Credential authorizing settlement against a cart mandate. |
| `verify_credential` | Verify a Verifiable Credential (intent, cart, or payment mandate). |
| `create_presentation` | Create a Verifiable Presentation bundling one or more credentials (e.g. |
| `verify_presentation` | Verify a Verifiable Presentation and all embedded credentials, including holder binding and challenge nonce. |
| `resolve_did` | Resolve a Decentralized Identifier (DID) to its DID document via the AP2 universal resolver. |
| `create_receipt` | Create a signed receipt for a settled payment — a tamper-evident record linking transaction, mandates, and... |
| `verify_receipt` | Verify a receipt's signature, issuer, and chain back to the originating mandates. |

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

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
