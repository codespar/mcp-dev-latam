<p align="center">
  <h1 align="center">MCP Dev Brasil 🇧🇷</h1>
  <p align="center">
    <strong>Every API your AI agent needs to run a business in Brazil.</strong><br>
    <em>Plus the agentic payment protocols to bridge them all.</em>
  </p>
  <p align="center">
    37 MCP servers · ~400 tools · 9 verticals · MIT License
  </p>
  <p align="center">
    <a href="https://codespar.dev/mcp">Landing Page</a> ·
    <a href="#quick-start">Quick Start</a> ·
    <a href="#agentic-payment-protocols">Agentic Protocols</a> ·
    <a href="#the-complete-loop">The Complete Loop</a> ·
    <a href="#servers">All Servers</a> ·
    <a href="docs/CONTRIBUTING.md">Contribute</a>
  </p>
  <p align="center">
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
    <img src="https://img.shields.io/badge/servers-37-green" alt="37 servers">
    <img src="https://img.shields.io/badge/tools-~400-orange" alt="~400 tools">
    <img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP compatible">
  </p>
</p>

---

## The Problem

AI agents can write code, analyze data, and chat. But they can't **operate a business** — collect payments, issue invoices, ship products, or notify customers. Especially not in Brazil, where every service has its own API, auth pattern, and quirks.

Meanwhile, five categories of agentic payment infrastructure are shipping in parallel — checkout protocols, authorization layers, micropayment rails, identity frameworks, and issuing tools — and **none of them compose cleanly**.

**MCP Dev Brasil bridges both gaps.** Traditional Brazilian services + the new agentic payment protocols, all accessible through a single MCP interface.

## The Solution

MCP Brasil gives AI agents typed tools to interact with Brazilian APIs and agentic payment protocols. Each server wraps a real service — payments, fiscal, logistics, messaging, banking, ERP, crypto, and now **agentic protocols** — so your agent can operate a complete business workflow.

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

## Agentic Payment Protocols

> _"The bridge looks more like middleware than a protocol."_ — The middleware is MCP.

Three new servers that bridge the emerging agentic payment stack:

| Protocol | Server | Tools | What it does |
|----------|--------|-------|-------------|
| **[Google UCP](packages/payments/ucp)** | `@codespar/mcp-ucp` | 21 | Universal Commerce Protocol — agentic shopping, cart, checkout, orders, delivery, identity. Google's full commerce stack for AI agents. |
| **[Stripe ACP](packages/payments/stripe-acp)** | `@codespar/mcp-stripe-acp` | 16 | Agentic Commerce Protocol — AI agent checkout, payment delegation, products, invoices. Live in ChatGPT with 1M+ Shopify merchants. |
| **[x402](packages/crypto/x402)** | `@codespar/mcp-x402` | 10 | HTTP-native micropayments by Coinbase — when an agent hits a 402, it pays USDC on Base/Solana and retries. Pure HTTP, no checkout UI. |
| **[AP2](packages/payments/ap2)** | `@codespar/mcp-ap2` | 13 | Google's Agent-to-Agent Payment Protocol — authorization, audit trails, scoped spend limits. 60+ partners including Visa, Mastercard, Stripe, PayPal. |

### The Autonomy Spectrum

Each protocol sits at a different level of agent autonomy:

```
 Human-in-loop ◄──────────────────────────────► Fully autonomous

  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
  │   ACP   │   │   UCP   │   │   AP2   │   │   x402  │
  │ Stripe  │   │ Google  │   │ Google  │   │Coinbase │
  └─────────┘   └─────────┘   └─────────┘   └─────────┘
  User confirms   Commerce     User sets      No user.
  every purchase  lifecycle    rules, agent   Machine-to-
  in-chat         managed      acts within    machine at
                  by agent     budget/scope   HTTP layer
```

### The Convergence Stack

These protocols aren't competing — they're converging into layers:

```
┌─────────────────────────────────────────────┐
│  Application Layer        ACP / UCP         │  Chat UX, product discovery
├─────────────────────────────────────────────┤
│  Authorization Layer      AP2 / Mandates    │  Spend limits, audit trails
├─────────────────────────────────────────────┤
│  Tool Layer               MCP  ◄── WE ARE  │  Standardized agent tools
├─────────────────────────────────────────────┤
│  Settlement Layer         x402 / Pix / Card │  On-chain or traditional rails
└─────────────────────────────────────────────┘
```

**CodeSpar sits at the Tool Layer** — the middleware that connects every application, authorization, and settlement protocol through one interface.

### Why this matters

```
Agent needs to buy something
  ├── Full commerce?       → Google UCP (search → cart → checkout → delivery)
  ├── Retail checkout?     → Stripe ACP (create_checkout → complete_checkout)
  ├── API micropayment?    → x402 (pay_request → USDC $0.001 → data returned)
  ├── Agent-to-agent?      → AP2 (authorize_payment → execute_payment)
  └── Brazilian merchant?  → Asaas / Zoop / PagSeguro (traditional rails)

All via MCP. Same interface. One agent.
```

### Quick Start — Agentic Protocols

```bash
# Google UCP — full agentic commerce (early access)
npx @codespar/mcp-ucp

# Stripe ACP — agentic checkout (test mode, free)
npx @codespar/mcp-stripe-acp

# x402 — HTTP micropayments (testnet, free)
npx @codespar/mcp-x402

# AP2 — agent authorization (early access)
npx @codespar/mcp-ap2
```

---

## Quick Start

### With Claude Desktop

Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "stripe-acp": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-stripe-acp"],
      "env": {
        "STRIPE_API_KEY": "sk_test_..."
      }
    },
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
npx @codespar/mcp-stripe-acp   # Agentic Commerce Protocol
npx @codespar/mcp-x402         # HTTP micropayments
npx @codespar/mcp-ap2          # Agent authorization
npx @codespar/mcp-zoop         # Payments (marketplace, split)
npx @codespar/mcp-nuvem-fiscal # Fiscal
npx @codespar/mcp-melhor-envio # Logistics
npx @codespar/mcp-z-api        # WhatsApp
npx @codespar/mcp-omie         # ERP
npx @codespar/mcp-stark-bank   # Banking
npx @codespar/mcp-dev-brasil-api   # CEP, CNPJ (no key needed!)
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

### ⚡ Agentic Protocols (4 servers)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[Google UCP](packages/payments/ucp)** | 21 | Universal Commerce Protocol — shopping, cart, checkout, orders, delivery, identity | UCP API Key |
| **[Stripe ACP](packages/payments/stripe-acp)** | 16 | Agentic Commerce Protocol — checkout sessions, payment delegation, products, invoices | Stripe API Key |
| **[x402](packages/crypto/x402)** | 10 | HTTP micropayments — USDC on Base/Solana, paywalls, machine-to-machine | Facilitator Key |
| **[AP2](packages/payments/ap2)** | 13 | Agent authorization, audit trails, scoped spend limits | AP2 API Key |

### 💳 Payments (13 servers)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[Asaas](packages/payments/asaas)** | 10 | Billing, Pix, boleto, subscriptions, transfers | API Key |
| **[PagSeguro](packages/payments/pagseguro)** | 10 | Orders, charges, Pix QR, refunds | Bearer Token |
| **[iugu](packages/payments/iugu)** | 8 | Invoices, subscriptions, payment methods | Basic Auth |
| **[Pix BCB](packages/payments/pix-bcb)** | 8 | Official Central Bank Pix API (cob, DICT) | OAuth2 + mTLS |
| **[Zoop](packages/payments/zoop)** | 20 | Marketplace payments, split rules, sellers, subscriptions | Basic Auth |
| **[Pagar.me](packages/payments/pagar-me)** | 10 | Orders, charges, recipients, transfers | Basic Auth |
| **[EBANX](packages/payments/ebanx)** | 7 | Cross-border payments, payouts, FX rates | Integration Key |
| **[EFÍ/Gerencianet](packages/payments/efi)** | 8 | Pix, boleto, carnet, open finance | OAuth2 |
| **[Vindi](packages/payments/vindi)** | 10 | Recurring billing, subscriptions, invoices | API Key |
| **[Cielo](packages/payments/cielo)** | 8 | Credit card, debit, boleto, recurrent payments | Merchant Key |
| **[Stone](packages/payments/stone)** | 8 | Open banking, payments, Pix, transfers | OAuth2 |
| **[Celcoin](packages/payments/celcoin)** | 8 | Pix, boleto, transfers, bill payments, top-ups | OAuth2 |
| **[AP2](packages/payments/ap2)** | 13 | Google's Agent-to-Agent Payment Protocol | AP2 API Key |

### 📄 Fiscal (3 servers)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[Focus NFe](packages/fiscal/focus-nfe)** | 8 | NFe/NFSe/NFCe emission and management | Basic Auth |
| **[Nuvem Fiscal](packages/fiscal/nuvem-fiscal)** | 10 | NFe/NFSe/NFCe, CNPJ/CEP lookup | OAuth2 |
| **[Conta Azul](packages/fiscal/conta-azul)** | 10 | Accounting, invoicing, customers, products | OAuth2 |

### 📱 Communication (5 servers)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[Evolution API](packages/communication/evolution-api)** | 10 | WhatsApp automation (Baileys) | API Key |
| **[Z-API](packages/communication/z-api)** | 20 | WhatsApp messaging, contacts, groups, labels | Instance + Token |
| **[Zenvia](packages/communication/zenvia)** | 8 | Multichannel (SMS, WhatsApp, RCS) | API Token |
| **[RD Station](packages/communication/rd-station)** | 8 | Marketing automation, CRM, leads | Bearer Token |
| **[Take Blip](packages/communication/take-blip)** | 8 | Chatbots, messaging, contacts, broadcasts | Access Key |

### 🇧🇷 Identity (1 server)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[BrasilAPI](packages/identity/brasil-api)** | 10 | CEP, CNPJ, banks, holidays, FIPE, DDD, weather | **None** (free) |

### 🏦 Banking (2 servers)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[Stark Bank](packages/banking/stark-bank)** | 10 | Transfers, boleto, invoices, Pix, balance | Access Token |
| **[Open Finance](packages/banking/open-finance)** | 8 | Open Finance Brasil — accounts, transactions, consents, investments | OAuth2 |

### 📦 E-commerce / Logistics (3 servers)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[Melhor Envio](packages/ecommerce/melhor-envio)** | 18 | Shipping quotes, tracking, labels, cart, agencies | Bearer Token |
| **[SuperFrete](packages/ecommerce/superfrete)** | 11 | Discounted shipping, freight calc, labels, tracking | Bearer Token |
| **[Correios](packages/ecommerce/correios)** | 6 | Tracking, shipping calc, CEP | OAuth |
| **[VTEX](packages/ecommerce/vtex)** | 10 | E-commerce, orders, products, inventory, shipping | App Key + Token |

### 📊 ERP (3 servers)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[Omie](packages/erp/omie)** | 10 | Customers, products, orders, invoices, financials | App Key + Secret |
| **[Bling](packages/erp/bling)** | 10 | ERP, products, orders, invoices, stock management | OAuth2 |
| **[Tiny](packages/erp/tiny)** | 10 | ERP, products, orders, invoices, stock, accounts payable | API Token |

### 🪙 Crypto / Stablecoins (5 servers)

| Server | Tools | Description | Auth |
|--------|-------|-------------|------|
| **[x402](packages/crypto/x402)** | 10 | HTTP micropayments — USDC on Base/Solana | Facilitator Key |
| **[UnblockPay](packages/crypto/unblockpay)** | 10 | Fiat-to-stablecoin onramp/offramp, wallets, transfers | API Key |
| **[Circle](packages/crypto/circle)** | 10 | USDC payments, wallets, payouts, transfers | API Key |
| **[Mercado Bitcoin](packages/crypto/mercado-bitcoin)** | 10 | Brazilian crypto exchange, trading, orderbook, withdrawals | API Key + Secret |
| **[Bitso](packages/crypto/bitso)** | 10 | Latin American crypto exchange, trading, funding, withdrawals | API Key + Secret |

### 🔜 Coming Soon

Foxbit · BRLA · Coinbase · Transak · PagBrasil · Juno · NFe.io · PlugNotas · Movidesk · Infobip · Frenet · Loggi · Kangu · Inter · Nubank · ReceitaWS · BigDataCorp · Sankhya · Totvs

---

## Why MCP?

[Model Context Protocol](https://modelcontextprotocol.io/) is the open standard for connecting AI agents to external tools. Instead of each agent building its own integrations, MCP provides a typed, discoverable interface that works with Claude, ChatGPT, Copilot, Cursor, and more.

```
AI Agent (Claude, ChatGPT, Cursor)
    ↕
MCP Server (this repo)
    ↕
Brazilian API / Agentic Protocol (Stripe ACP, x402, Zoop, etc.)
```

Each MCP server in this repo:
- Exposes **typed tools** with input/output schemas
- Handles **authentication** (OAuth, API keys, Basic Auth)
- Supports **dual transport** — stdio (default) and **Streamable HTTP** (`--http` flag)
- Compatible with **Claude Managed Agents** via MCP Connector
- Supports **sandbox mode** for safe testing
- Returns **structured JSON** responses

### Running in HTTP mode

Any server can run as an HTTP server for remote/cloud use:

```bash
# stdio (default — local, Claude Desktop, Cursor)
npx @codespar/mcp-asaas

# HTTP (remote — Managed Agents, cloud deployments)
npx @codespar/mcp-asaas --http
# or
MCP_HTTP=true npx @codespar/mcp-asaas
```

HTTP mode exposes `/mcp` (Streamable HTTP) and `/health` (status check).

---

## About CodeSpar

[CodeSpar](https://codespar.dev) is an open source multi-agent platform that deploys autonomous AI coding agents to WhatsApp, Slack, Telegram, and Discord.

The MCP Generator in CodeSpar Enterprise can automatically generate MCP servers from API specifications — that's how this repo was bootstrapped.

**Individual MCP servers are useful. Orchestrating many with governance is powerful.** That's what CodeSpar does — including a [Payment Gateway](https://codespar.dev/enterprise) that integrates policy engine, payment routing, and mandate authorization across all rails.

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](docs/CONTRIBUTING.md).

**Want a server for a service not listed?** [Open an issue](https://github.com/codespar/mcp-dev-brasil/issues) with the "server request" label.

## License

MIT — use freely in commercial and open source projects.
