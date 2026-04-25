# @codespar/mcp-open-finance

> MCP server for **Open Finance Brasil** — open banking standard for accounts, transactions, and consents

[![npm](https://img.shields.io/npm/v/@codespar/mcp-open-finance)](https://www.npmjs.com/package/@codespar/mcp-open-finance)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Quick Start

### Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "open-finance": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-open-finance"],
      "env": {
        "OPEN_FINANCE_BASE_URL": "https://api.institution.com.br",
        "OPEN_FINANCE_CLIENT_ID": "your-client-id",
        "OPEN_FINANCE_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add open-finance -- npx @codespar/mcp-open-finance
```

### Cursor / VS Code

Add to `.cursor/mcp.json` or `.vscode/mcp.json`:

```json
{
  "servers": {
    "open-finance": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-open-finance"],
      "env": {
        "OPEN_FINANCE_BASE_URL": "https://api.institution.com.br",
        "OPEN_FINANCE_CLIENT_ID": "your-client-id",
        "OPEN_FINANCE_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

## Tools (18)

| Tool | Purpose |
|---|---|
| `list_accounts` | List customer bank accounts via Open Finance |
| `get_account_balance` | Get account balance via Open Finance |
| `list_transactions` | List account transactions via Open Finance |
| `get_account_overdraft_limits` | Get account overdraft (limites) via Open Finance |
| `get_consent` | Get consent details by ID |
| `create_consent` | Create a new consent request for data access |
| `revoke_consent` | Revoke an existing consent (data or payment) |
| `list_credit_cards` | List credit card accounts via Open Finance |
| `get_credit_card_bills` | Get credit card bills (faturas) via Open Finance |
| `get_credit_card_transactions` | Get credit card transactions via Open Finance |
| `list_loans` | List loan contracts (empréstimos) via Open Finance |
| `get_loan_payments` | Get loan payment schedule via Open Finance |
| `list_financings` | List financing contracts (financiamentos) via Open Finance |
| `list_investments` | List investment products via Open Finance |
| `create_payment_consent` | Create payment-initiation consent (e.g., PIX) via Open Finance |
| `create_payment` | Initiate a payment using an authorized payment consent |
| `get_personal_qualifications` | Get personal customer qualifications (income, occupation) via Open Finance |
| `get_business_qualifications` | Get business customer qualifications via Open Finance |

## Authentication

Open Finance Brasil uses OAuth2 client credentials. Each financial institution provides its own base URL and credentials.

## Sandbox / Testing

Sandbox availability varies by institution. Contact your financial institution for Open Finance sandbox access.

### Get your credentials

1. Go to [Open Finance Brasil](https://openfinancebrasil.org.br)
2. Register with a participating financial institution
3. Obtain your OAuth2 client credentials
4. Set the environment variables

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPEN_FINANCE_BASE_URL` | Yes | Institution API base URL |
| `OPEN_FINANCE_CLIENT_ID` | Yes | OAuth2 client ID |
| `OPEN_FINANCE_CLIENT_SECRET` | Yes | OAuth2 client secret |

## Roadmap

### v0.2 (planned)
- `revoke_consent` — Revoke a data sharing consent
- `list_payments` — List initiated payments
- `create_payment_consent` — Create a payment initiation consent
- `initiate_payment` — Initiate a payment via Open Finance
- `get_payment_status` — Get payment initiation status

### v0.3 (planned)
- `insurance_products` — List insurance products from institutions
- `pension_products` — List pension products from institutions

Want to contribute? [Open a PR](https://github.com/codespar/mcp-dev-brasil) or [request a tool](https://github.com/codespar/mcp-dev-brasil/issues).

## Links

- [Open Finance Brasil](https://openfinancebrasil.org.br)
- [Open Finance Brasil Developer Portal](https://openfinancebrasil.atlassian.net)
- [MCP Dev Brasil](https://github.com/codespar/mcp-dev-brasil)
- [Landing Page](https://codespar.dev/mcp)

## Enterprise

Need governance, budget limits, and audit trails for agent payments? [CodeSpar Enterprise](https://codespar.dev/enterprise) adds policy engine, payment routing, and compliance templates on top of these MCP servers.

## License

MIT
