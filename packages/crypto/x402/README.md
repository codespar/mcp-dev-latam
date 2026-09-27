# @codespar/mcp-x402

> **Deprecated: no live endpoint.** Measured on 2026-09-27 against two public DNS resolvers (8.8.8.8 and 1.1.1.1): `api.x402.org`, the only host this server calls, does not resolve in DNS. x402 has no central API: it is an HTTP 402 protocol, and each seller picks the facilitator that verifies payment. No tool in this server reaches a service. The package is deprecated on npm and stays in this repository for reference only. If you have a working endpoint, point the server at it with `X402_BASE_URL`. To bring the package back, open an issue in [mcp-dev-latam](https://github.com/codespar/mcp-dev-latam/issues) with the provider's documented base URL.

> MCP server for **x402** — HTTP-native micropayments protocol by Coinbase (USDC on Base/Solana)

[![npm](https://img.shields.io/npm/v/@codespar/mcp-x402)](https://www.npmjs.com/package/@codespar/mcp-x402)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## What is x402?

x402 is an open protocol that enables **machine-to-machine micropayments at the HTTP layer**. When an AI agent requests a resource and receives HTTP `402 Payment Required`, it automatically sends a USDC payment on-chain and retries — no checkout UI, no merchant integration, pure HTTP.

This is the payment rail purpose-built for **agentic commerce**.

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "x402": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-x402"],
      "env": {
        "X402_API_KEY": "your-key",
        "X402_WALLET_ADDRESS": "your-wallet-address"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add x402 -- npx @codespar/mcp-x402
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "x402": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-x402"],
      "env": {
        "X402_API_KEY": "your-key",
        "X402_WALLET_ADDRESS": "your-wallet-address"
      }
    }
  }
}
```

## Tools (10)

| Tool | Purpose |
|---|---|
| `pay_request` | Pay for a 402-protected resource. |
| `verify_payment` | Verify if a x402 payment was received and settled on-chain |
| `create_paywall` | Create a x402 paywall configuration for an endpoint. |
| `get_paywall` | Get paywall configuration for a specific URL |
| `list_paywalls` | List all configured x402 paywalls |
| `delete_paywall` | Remove a x402 paywall from an endpoint |
| `get_balance` | Get available USDC balance for x402 payments |
| `list_payments` | List x402 payment history with optional filters |
| `get_payment` | Get details of a specific x402 payment |
| `get_supported_networks` | List supported blockchain networks, tokens, and facilitators for x402 payments |

## Authentication

x402 uses a Bearer API key from a registered facilitator.

### Get your credentials

1. Visit the [x402 documentation](https://github.com/coinbase/x402)
2. Set up a facilitator or use Coinbase's hosted facilitator
3. Generate an API key
4. Get your wallet address (Base or Solana)
5. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `X402_API_KEY` | Yes | API key for x402 facilitator |
| `X402_WALLET_ADDRESS` | Yes | Wallet address for sending/receiving payments |
| `X402_NETWORK` | No | Blockchain network: `base` (default) or `solana` |

## Use Cases

- **Agent accessing premium APIs** — AI agent pays per-request for data feeds, LLM APIs, or premium content
- **Micropayment monetization** — Protect your API endpoints with sub-cent paywalls
- **Machine-to-machine commerce** — Agents autonomously purchasing compute, data, or services

## Roadmap

### v0.2 (planned)
- `create_subscription` — Set up recurring micropayments for an endpoint
- `estimate_cost` — Estimate cost before paying for a resource
- `batch_pay` — Pay for multiple resources in a single transaction

### v0.3 (planned)
- Multi-token support (ETH, SOL beyond USDC)
- Streaming payments for long-running agent tasks

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-latam) or [request a tool](https://github.com/codespar/mcp-dev-latam/issues).

## Links

- [x402 Protocol (Coinbase)](https://github.com/coinbase/x402)
- [x402 Specification](https://www.x402.org)
- [MCP Dev LATAM](https://github.com/codespar/mcp-dev-latam)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
