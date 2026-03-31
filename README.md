<p align="center">
  <h1 align="center">MCP Dev Brasil 🇧🇷</h1>
  <p align="center">
    <strong>Every API your AI agent needs to run a business in Brazil.</strong>
  </p>
  <p align="center">
    19 MCP servers · ~170 tools · 7 verticals · MIT License
  </p>
  <p align="center">
    <a href="https://codespar.dev/mcp">Landing Page</a> ·
    <a href="#quick-start">Quick Start</a> ·
    <a href="#the-complete-loop">The Complete Loop</a> ·
    <a href="#servers">All Servers</a> ·
    <a href="docs/CONTRIBUTING.md">Contribute</a>
  </p>
  <p align="center">
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
    <img src="https://img.shields.io/badge/servers-19-green" alt="19 servers">
    <img src="https://img.shields.io/badge/tools-~170-orange" alt="~170 tools">
    <img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP compatible">
  </p>
</p>

---

## The Problem

AI agents can write code, analyze data, and chat. But they can't **operate a business** — collect payments, issue invoices, ship products, or notify customers. Especially not in Brazil, where every service has its own API, auth pattern, and quirks.

**No MCP servers existed for most Brazilian commercial services.** Until now.

## The Solution

MCP Brasil gives AI agents typed tools to interact with Brazilian APIs. Each server wraps a real service — payments, fiscal, logistics, messaging, banking, ERP — so your agent can operate a complete business workflow.

```
🛒 Customer places order
  → 💳 Agent charges via Pix (Zoop)
  → 📄 Agent issues NFe (Nuvem Fiscal)
  → 📦 Agent generates shipping label (Melhor Envio)
  → 📱 Agent sends tracking via WhatsApp (Z-API)
  → 📊 Agent records in ERP (Omie)
  → 🏦 Agent reconciles balance (Stark Bank)
```

**Six systems. Zero human intervention. One agent.**

---

## Quick Start

### With Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zoop": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-zoop"],
      "env": {
        "ZOOP_API_KEY": "your-api-key",
        "ZOOP_MARKETPLACE_ID": "your-marketplace-id"
      }
    }
  }
}
```

### With any MCP client

```bash
npx @codespar/mcp-zoop          # Payments (marketplace, split)
npx @codespar/mcp-nuvem-fiscal  # Fiscal
npx @codespar/mcp-melhor-envio  # Logistics
npx @codespar/mcp-z-api         # WhatsApp
npx @codespar/mcp-omie          # ERP
npx @codespar/mcp-stark-bank    # Banking
npx @codespar/mcp-dev-brasil-api    # CEP, CNPJ (no key needed!)
```

### Try it now (no API key)

BrasilAPI is free and public. Try it in your terminal:

```bash
npx @codespar/mcp-dev-brasil-api
```

Then ask your agent: _"What is the address for CEP 01001-000?"_ or _"Look up CNPJ 00.000.000/0001-91"_

---

## The Complete Loop

This is what makes MCP Brasil different — not individual connectors, but a **complete business workflow** across verticals:

| Step | Vertical | Server | What the agent does |
|------|----------|--------|-------------------|
| 1 | 💳 Payment | Zoop | Creates Pix charge, splits to sellers |
| 2 | 📄 Fiscal | Nuvem Fiscal | Issues NFe/NFSe when payment confirmed |
| 3 | 📦 Logistics | Melhor Envio | Quotes shipping, generates label |
| 4 | 📱 Messaging | Z-API | Sends tracking code via WhatsApp |
| 5 | 📊 ERP | Omie | Records order, updates inventory |
| 6 | 🏦 Banking | Stark Bank | Reconciles balance, creates reports |

To orchestrate all 6 steps with governance, approval workflows, and audit trails — use [CodeSpar](https://codespar.dev).

---

## Servers

### 💳 Payments (8 servers)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[Asaas](packages/payments/asaas)** | 10 | Billing, Pix, boleto, subscriptions, transfers | API Key |
| **[PagSeguro](packages/payments/pagseguro)** | 10 | Orders, charges, Pix QR, refunds | Bearer Token |
| **[iugu](packages/payments/iugu)** | 8 | Invoices, subscriptions, payment methods | Basic Auth |
| **[Pix BCB](packages/payments/pix-bcb)** | 8 | Official Central Bank Pix API (cob, DICT) | OAuth2 + mTLS |
| **[Zoop](packages/payments/zoop)** | 10 | Marketplace payments, split rules, sellers | Basic Auth |
| **[Pagar.me](packages/payments/pagar-me)** | 10 | Orders, charges, recipients, transfers | Basic Auth |
| **[EBANX](packages/payments/ebanx)** | 7 | Cross-border payments, payouts, FX rates | Integration Key |
| **[EFÍ/Gerencianet](packages/payments/efi)** | 8 | Pix, boleto, carnet, open finance | OAuth2 |

### 📄 Fiscal (2 servers)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[Focus NFe](packages/fiscal/focus-nfe)** | 8 | NFe/NFSe/NFCe emission and management | Basic Auth |
| **[Nuvem Fiscal](packages/fiscal/nuvem-fiscal)** | 10 | NFe/NFSe/NFCe, CNPJ/CEP lookup | OAuth2 |

### 📱 Communication (4 servers)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[Evolution API](packages/communication/evolution-api)** | 10 | WhatsApp automation (Baileys) | API Key |
| **[Z-API](packages/communication/z-api)** | 10 | WhatsApp messaging, contacts, buttons | Instance + Token |
| **[Zenvia](packages/communication/zenvia)** | 8 | Multichannel (SMS, WhatsApp, RCS) | API Token |
| **[RD Station](packages/communication/rd-station)** | 8 | Marketing automation, CRM, leads | Bearer Token |

### 🇧🇷 Identity (1 server)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[BrasilAPI](packages/identity/brasil-api)** | 10 | CEP, CNPJ, banks, holidays, FIPE, DDD, weather | **None** (free) |

### 🏦 Banking (1 server)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[Stark Bank](packages/banking/stark-bank)** | 10 | Transfers, boleto, invoices, Pix, balance | Access Token |

### 📦 E-commerce / Logistics (2 servers)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[Melhor Envio](packages/ecommerce/melhor-envio)** | 8 | Shipping quotes, tracking, labels | Bearer Token |
| **[Correios](packages/ecommerce/correios)** | 6 | Tracking, shipping calc, CEP | OAuth |

### 📊 ERP (1 server)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[Omie](packages/erp/omie)** | 10 | Customers, products, orders, invoices, financials | App Key + Secret |

### 🔜 Coming Soon

Cielo · Stone · Vindi · Celcoin · Conta Azul · Take Blip · VTEX · Bling · Tiny · Open Finance Brasil

---

## Why MCP?

[Model Context Protocol](https://modelcontextprotocol.io/) is the open standard for connecting AI agents to external tools. Instead of each agent building its own integrations, MCP provides a typed, discoverable interface that works with Claude, ChatGPT, Copilot, Cursor, and more.

```
┌─────────┐     ┌───────────┐     ┌──────────────┐
│ AI Agent │────▶│ MCP Server│────▶│ Brazilian API│
│ (Claude) │◀────│ (this repo)│◀────│ (Asaas, etc) │
└─────────┘     └───────────┘     └──────────────┘
```

Each MCP server in this repo:
- Exposes **typed tools** with input/output schemas
- Handles **authentication** (OAuth, API keys, Basic Auth)
- Supports **sandbox mode** for safe testing
- Returns **structured JSON** responses

---

## About CodeSpar

[CodeSpar](https://codespar.dev) is an open source multi-agent platform that deploys autonomous AI coding agents to WhatsApp, Slack, Telegram, and Discord.

The MCP Generator in CodeSpar Enterprise can automatically generate MCP servers from API specifications — that's how this repo was bootstrapped.

**Individual MCP servers are useful. Orchestrating many with governance is powerful.** That's what CodeSpar does.

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](docs/CONTRIBUTING.md).

**Want a server for a service not listed?** [Open an issue](https://github.com/codespar/mcp-dev-brasil/issues) with the "server request" label.

## License

MIT — use freely in commercial and open source projects.
