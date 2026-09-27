<p align="center">
  <h1 align="center">MCP Dev LATAM 🌎</h1>
  <p align="center">
    <strong>Every commerce API your AI agent needs to run a business in Latin America.</strong><br>
    <em>Brazil 🇧🇷 · Mexico 🇲🇽 · Argentina 🇦🇷 · Colombia 🇨🇴 · Chile 🇨🇱 · Peru 🇵🇪 · plus 4 agentic payment protocols.</em>
  </p>
  <p align="center">
    MCP servers for LATAM commerce · live in the official MCP Registry · MIT License
  </p>
  <p align="center">
    <em>Machine-readable catalog: <a href="https://codespar.dev/api/servers">codespar.dev/api/servers</a></em>
  </p>
  <p align="center">
    <a href="https://codespar.dev/servers">Catalog</a> ·
    <a href="#quick-start">Quick Start</a> ·
    <a href="#agentic-payment-protocols">Agentic Protocols</a> ·
    <a href="#all-servers">All Servers</a> ·
    <a href="docs/CONTRIBUTING.md">Contribute</a>
  </p>
  <p align="center">
    <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
    <img src="https://img.shields.io/badge/MCP_Registry-live-green" alt="Live in the official MCP Registry">
    <img src="https://img.shields.io/badge/countries-6-blue" alt="6 countries">
    <img src="https://img.shields.io/badge/MCP-compatible-purple" alt="MCP compatible">
  </p>
</p>

---

## The Problem

AI agents can write code, analyze data, and chat. But they can't **operate a business** — collect payments, issue invoices, ship products, or notify customers. Especially not in Latin America, where every service has its own API, auth pattern, and quirks (mTLS for BACEN Pix v2, JWT-RSA for STP-SPEI, AFIP web services, contract-gated developer portals, and on).

Meanwhile, four agentic payment protocols are shipping in parallel — checkout protocols (Stripe ACP, Google UCP), authorization layers (AP2), and micropayment rails (x402) — and **none of them compose cleanly** with each other or with the regional rails businesses actually run on.

**MCP Dev LATAM bridges both gaps.** Traditional LATAM services + the new agentic payment protocols, all accessible through a single MCP interface.

## The Solution

Each MCP server in this repo wraps a real provider — payments, fiscal, logistics, messaging, banking, ERP, identity, fraud, crypto, and the agentic protocols — so your agent can operate a complete business workflow.

```
🛒 Customer places order
  → 💳 Agent charges via Pix (Asaas / Mercado Pago / Zoop)
  → 📄 Agent issues NFe (Nuvem Fiscal / Focus NFe / NFe.io)
  → 📦 Agent generates shipping label (Melhor Envio / Skydropx)
  → 📱 Agent sends tracking via WhatsApp (Z-API / WhatsApp Cloud)
  → 📊 Agent records in ERP (Omie / Bling / Tiny)
  → 🏦 Agent reconciles balance (Stark Bank / Itaú / BTG)
```

**Six systems. Zero human intervention. One agent.**

---

## Agentic Payment Protocols

Four servers for the emerging agentic payment stack. Only Stripe ACP reaches a live service today; the other three are deprecated (see the note under the table):

| Protocol | Server | Tools | What it does |
|----------|--------|-------|-------------|
| **[Google UCP](packages/payments/ucp)** <sub>deprecated: no live endpoint</sub> | `@codespar/mcp-ucp` | 20 | Universal Commerce Protocol — agentic shopping, cart, checkout, orders, delivery, identity. |
| **[Stripe ACP](packages/payments/stripe-acp)** | `@codespar/mcp-stripe-acp` | 24 | Agentic Commerce Protocol — AI agent checkout, payment delegation, products, invoices. |
| **[x402](packages/crypto/x402)** <sub>deprecated: no live endpoint</sub> | `@codespar/mcp-x402` | 10 | HTTP-native micropayments by Coinbase — when an agent hits a 402, it pays USDC on Base/Solana and retries. Pure HTTP, no checkout UI. |
| **[AP2](packages/payments/ap2)** <sub>deprecated: no live endpoint</sub> | `@codespar/mcp-ap2` <sub>alpha</sub> | 22 | Google's Agent-to-Agent Payment Protocol — authorization, audit trails, scoped spend limits. |

> **UCP, AP2 and x402 are deprecated: no live endpoint.** Measured on 2026-09-27:
>
> | Server | Default host | What that host answered |
> |---|---|---|
> | `@codespar/mcp-ucp` | `commerce.googleapis.com` (sandbox: `sandbox.commerce.googleapis.com`) | HTTP 404 with Google's generic `Error 404 (Not Found)` page; the sandbox host fails the TLS handshake (certificate is for `*.googleapis.com`) |
> | `@codespar/mcp-ap2` | `ap2.googleapis.com` (sandbox: `sandbox.ap2.googleapis.com`) | the same generic 404 page; the sandbox host fails the TLS handshake the same way |
> | `@codespar/mcp-x402` | `api.x402.org` | does not resolve in DNS (8.8.8.8 and 1.1.1.1) |
>
> A generic 404 by itself does not prove a name has no service behind it: `translate.googleapis.com/v1`, a registered service asked for a path it does not serve, answers the same page. What the claim rests on is that every path these servers call failed the same way. UCP and AP2 are open specifications, not APIs Google hosts, and x402 has no central API (each seller picks its own facilitator). The three packages are deprecated on npm and kept here for reference; they are out of the quick start and the decision tree below. Eight more servers are deprecated for the same reason (their default host does not resolve): C6, Dock, Matera, Legiti, Caf, Certta, Unico and Nubank.

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

**MCP Dev LATAM sits at the Tool Layer** — the middleware that connects every application, authorization, and settlement protocol through one interface.

### Why this matters

```
Agent needs to buy something
  ├── Retail checkout?     → Stripe ACP (create_checkout → complete_checkout)
  └── LATAM merchant?      → Asaas / Mercado Pago / Conekta / Wompi / etc.

All via MCP. Same interface. One agent.
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
    "asaas": {
      "command": "npx",
      "args": ["-y", "@codespar/mcp-asaas"],
      "env": {
        "ASAAS_API_KEY": "your-api-key",
        "ASAAS_SANDBOX": "true"
      }
    }
  }
}
```

For alpha packages (contract-gated providers like Itaú, Bradesco, Santander, Caixa, BB, BTG, Sicoob), add `@alpha` to the install:

```bash
npx -y @codespar/mcp-itau@alpha
```

### With any MCP client

```bash
npx @codespar/mcp-stripe-acp        # Agentic Commerce Protocol

npx @codespar/mcp-asaas              # BR billing + Pix
npx @codespar/mcp-mercado-pago       # LATAM payments
npx @codespar/mcp-nuvem-fiscal       # NFe / NFSe
npx @codespar/mcp-melhor-envio       # Multi-carrier shipping
npx @codespar/mcp-z-api              # WhatsApp messaging
npx @codespar/mcp-omie               # ERP
npx @codespar/mcp-stark-bank         # Banking
npx @codespar/mcp-brasil-api         # CEP, CNPJ (no key needed!)
```

### Try it now (no API key)

[BrasilAPI](packages/identity/brasil-api) and [BCRA](packages/argentina/bcra) are public — no key required. Try it in your terminal:

```bash
npx @codespar/mcp-brasil-api
```

Then ask your agent: _"What is the address for CEP 01001-000?"_ or _"Look up CNPJ 00.000.000/0001-91"_.

### Pointing a server at another host

Every server reads its provider host from an environment variable, so a proxy, a mock, or an endpoint the provider moved can be used without a new release. The primary API is `<PREFIX>_BASE_URL`, where `<PREFIX>` is the one the server's credentials already use (`CELCOIN_BASE_URL`, `STONE_BASE_URL`, `BB_BASE_URL`). A second host gets `<PREFIX>_<ROLE>_URL`, for example `STONE_AUTH_URL` for a token endpoint or `CIELO_QUERY_URL`. When the variable is unset the server uses its documented default.

A weekly CI job ([`catalog-hosts.yml`](.github/workflows/catalog-hosts.yml)) resolves every default host in the catalog and completes a TLS handshake with it, and fails when a host does not exist. The only exceptions are deprecated servers and the few sandbox hosts listed, each with its reason, in [`scripts/catalog-hosts-known-dead.json`](scripts/catalog-hosts-known-dead.json); the job also fails when one of those comes back, so the list cannot go stale. Run it locally with `python3 scripts/check-catalog-hosts.py` (Python 3.10+).

---

## The Complete Loop

This is what makes the LATAM catalog different — not individual connectors, but a **complete business workflow** across verticals:

| Step | Vertical | Example providers | What the agent does |
|------|----------|-------------------|---------------------|
| 1 | 💳 Payment | Asaas / Mercado Pago / Zoop | Creates Pix charge, splits to sellers |
| 2 | 📄 Fiscal | Nuvem Fiscal / NFe.io / Focus NFe | Issues NFe/NFSe when payment confirmed |
| 3 | 📦 Logistics | Melhor Envio / Correios / Skydropx | Quotes shipping, generates label |
| 4 | 📱 Messaging | Z-API / WhatsApp Cloud / Twilio | Sends tracking via customer's preferred channel |
| 5 | 📊 ERP | Omie / Bling / Tiny / Conta Azul | Records order, updates inventory |
| 6 | 🏦 Banking | Stark Bank / Itaú / BTG | Reconciles balance, creates reports |

To orchestrate all six steps with governance, approval workflows, and audit trails — use [CodeSpar](https://codespar.dev).

---

## All Servers

Browse the full catalog at [codespar.dev/servers](https://codespar.dev/servers). Each server has its own README, env-var requirements, and tool reference under `packages/<category>/<slug>/`.

### 💳 Payments (46 servers)

| Server | Tools | npm | Auth |
|---|---|---|---|
| **[Rinne](packages/payments/rinne)** | 62 | `@codespar/mcp-rinne` | API Key |
| **[Mercado Pago](packages/payments/mercado-pago)** | 30 | `@codespar/mcp-mercado-pago` | API Key |
| **[Stripe](packages/payments/stripe)** | 30 | `@codespar/mcp-stripe` | API Key |
| **[Zoop](packages/payments/zoop)** | 28 | `@codespar/mcp-zoop` | API Key |
| **[Adyen](packages/payments/adyen)** | 25 | `@codespar/mcp-adyen` | API Key |
| **[Asaas](packages/payments/asaas)** | 24 | `@codespar/mcp-asaas` | API Key |
| **[Pagseguro](packages/payments/pagseguro)** | 24 | `@codespar/mcp-pagseguro` | API Key |
| **[Stripe ACP](packages/payments/stripe-acp)** | 24 | `@codespar/mcp-stripe-acp` | API Key |
| **[Iugu](packages/payments/iugu)** | 23 | `@codespar/mcp-iugu` | API Key |
| **[Openpay](packages/payments/openpay)** | 23 | `@codespar/mcp-openpay` | API Key |
| **[AP2](packages/payments/ap2)** <sub>alpha</sub> <sub>deprecated: no live endpoint</sub> | 22 | `@codespar/mcp-ap2` | API Key |
| **[Braintree](packages/payments/braintree)** | 22 | `@codespar/mcp-braintree` | API Key |
| **[Braspag](packages/payments/braspag)** | 22 | `@codespar/mcp-braspag` | API Key |
| **[Cielo](packages/payments/cielo)** | 22 | `@codespar/mcp-cielo` | API Key |
| **[Inter Bank](packages/payments/inter-bank)** | 22 | `@codespar/mcp-inter-bank` | OAuth2 |
| **[Mercado Libre](packages/payments/mercado-libre)** | 22 | `@codespar/mcp-mercado-libre` | API Key |
| **[Nubank](packages/payments/nubank)** <sub>alpha</sub> <sub>deprecated: no live endpoint</sub> | 22 | `@codespar/mcp-nubank` | OAuth2 |
| **[Nupay](packages/payments/nupay)** | 22 | `@codespar/mcp-nupay` | OAuth2 |
| **[Pagar Me](packages/payments/pagar-me)** | 22 | `@codespar/mcp-pagar-me` | API Key |
| **[Rapyd](packages/payments/rapyd)** | 22 | `@codespar/mcp-rapyd` | API Key |
| **[Rede](packages/payments/rede)** <sub>alpha</sub> | 22 | `@codespar/mcp-rede` | API Key |
| **[Safrapay](packages/payments/safrapay)** <sub>alpha</sub> | 22 | `@codespar/mcp-safrapay` | OAuth2 |
| **[Worldpay](packages/payments/worldpay)** <sub>alpha</sub> | 22 | `@codespar/mcp-worldpay` | API Key |
| **[Khipu](packages/payments/khipu)** <sub>alpha</sub> | 21 | `@codespar/mcp-khipu` | API Key |
| **[Stone](packages/payments/stone)** | 21 | `@codespar/mcp-stone` | API Key |
| **[Malga](packages/payments/malga)** | 24 | `@codespar/mcp-malga` | API Key |
| **[Wise](packages/payments/wise)** | 21 | `@codespar/mcp-wise` | API Key |
| **[Airwallex](packages/payments/airwallex)** | 20 | `@codespar/mcp-airwallex` | OAuth2 |
| **[Culqi](packages/payments/culqi)** | 20 | `@codespar/mcp-culqi` | API Key |
| **[Getnet](packages/payments/getnet)** | 20 | `@codespar/mcp-getnet` | OAuth2 |
| **[Izipay](packages/payments/izipay)** <sub>alpha</sub> | 20 | `@codespar/mcp-izipay` | API Key |
| **[Picpay](packages/payments/picpay)** <sub>alpha</sub> | 20 | `@codespar/mcp-picpay` | API Key |
| **[UCP](packages/payments/ucp)** <sub>deprecated: no live endpoint</sub> | 20 | `@codespar/mcp-ucp` | API Key |
| **[Vindi](packages/payments/vindi)** | 20 | `@codespar/mcp-vindi` | API Key |
| **[Paypal](packages/payments/paypal)** | 19 | `@codespar/mcp-paypal` | OAuth2 |
| **[Transbank](packages/payments/transbank)** <sub>alpha</sub> | 19 | `@codespar/mcp-transbank` | API Key |
| **[Celcoin](packages/payments/celcoin)** | 18 | `@codespar/mcp-celcoin` | API Key |
| **[dLocal](packages/payments/dlocal)** | 18 | `@codespar/mcp-dlocal` | API Key |
| **[Ebanx](packages/payments/ebanx)** | 18 | `@codespar/mcp-ebanx` | API Key |
| **[Efi](packages/payments/efi)** | 18 | `@codespar/mcp-efi` | API Key |
| **[Pix BCB](packages/payments/pix-bcb)** | 18 | `@codespar/mcp-pix-bcb` | API Key |
| **[Chargebee](packages/payments/chargebee)** | 15 | `@codespar/mcp-chargebee` | API Key |
| **[Kushki](packages/payments/kushki)** | 10 | `@codespar/mcp-kushki` | API Key |
| **[Flow.cl](packages/payments/flow-cl)** | 8 | `@codespar/mcp-flow-cl` | API Key |
| **[Niubiz](packages/payments/niubiz)** | 4 | `@codespar/mcp-niubiz` | User/Password |
| **[PagBrasil](packages/payments/pagbrasil)** | 3 | `@codespar/mcp-pagbrasil` | API Key |

### 🏦 Banking (16 servers)

| Server | Tools | npm | Auth |
|---|---|---|---|
| **[Stark Bank](packages/banking/stark-bank)** | 27 | `@codespar/mcp-stark-bank` | API Key |
| **[Caixa](packages/banking/caixa)** <sub>alpha</sub> | 23 | `@codespar/mcp-caixa` | OAuth2 |
| **[Santander](packages/banking/santander)** <sub>alpha</sub> | 23 | `@codespar/mcp-santander` | OAuth2 |
| **[Bradesco](packages/banking/bradesco)** <sub>alpha</sub> | 22 | `@codespar/mcp-bradesco` | OAuth2 |
| **[Itau](packages/banking/itau)** <sub>alpha</sub> | 22 | `@codespar/mcp-itau` | OAuth2 |
| **[Matera](packages/banking/matera)** <sub>alpha</sub> <sub>deprecated: no live endpoint</sub> | 22 | `@codespar/mcp-matera` | OAuth2 |
| **[Dock](packages/banking/dock)** <sub>alpha</sub> <sub>deprecated: no live endpoint</sub> | 20 | `@codespar/mcp-dock` | OAuth2 |
| **[Open Finance](packages/banking/open-finance)** | 18 | `@codespar/mcp-open-finance` | API Key |
| **[Pluggy](packages/banking/pluggy)** | 16 | `@codespar/mcp-pluggy` | API Key |
| **[C6](packages/banking/c6)** <sub>alpha</sub> <sub>deprecated: no live endpoint</sub> | 14 | `@codespar/mcp-c6` | OAuth2 |
| **[Banco Do Brasil](packages/banking/banco-do-brasil)** <sub>alpha</sub> | 13 | `@codespar/mcp-banco-do-brasil` | OAuth2 |
| **[Sicoob](packages/banking/sicoob)** <sub>alpha</sub> | 13 | `@codespar/mcp-sicoob` | OAuth2 |
| **[BTG](packages/banking/btg)** <sub>alpha</sub> | 12 | `@codespar/mcp-btg` | OAuth2 |
| **[Iniciador](packages/banking/iniciador)** | 9 | `@codespar/mcp-iniciador` | API Key |
| **[Pomelo](packages/banking/pomelo)** | 9 | `@codespar/mcp-pomelo` | OAuth2 |
| **[Midaz](packages/banking/midaz)** | 5 | `@codespar/mcp-midaz` | API Key (optional) |

### 📄 Fiscal (Brasil) (4 servers)

| Server | Tools | npm | Auth |
|---|---|---|---|
| **[Nuvem Fiscal](packages/fiscal/nuvem-fiscal)** | 24 | `@codespar/mcp-nuvem-fiscal` | API Key |
| **[Nfe Io](packages/fiscal/nfe-io)** | 22 | `@codespar/mcp-nfe-io` | API Key |
| **[Conta Azul](packages/fiscal/conta-azul)** | 20 | `@codespar/mcp-conta-azul` | API Key |
| **[Focus Nfe](packages/fiscal/focus-nfe)** | 19 | `@codespar/mcp-focus-nfe` | API Key |

### 📱 Communication (8 servers)

| Server | Tools | npm | Auth |
|---|---|---|---|
| **[Z API](packages/communication/z-api)** | 27 | `@codespar/mcp-z-api` | API Key |
| **[Evolution API](packages/communication/evolution-api)** | 25 | `@codespar/mcp-evolution-api` | API Key |
| **[Twilio](packages/communication/twilio)** | 22 | `@codespar/mcp-twilio` | API Key |
| **[Whatsapp Cloud](packages/communication/whatsapp-cloud)** | 22 | `@codespar/mcp-whatsapp-cloud` | API Key |
| **[Sendgrid](packages/communication/sendgrid)** | 20 | `@codespar/mcp-sendgrid` | API Key |
| **[Rd Station](packages/communication/rd-station)** | 18 | `@codespar/mcp-rd-station` | API Key |
| **[Take Blip](packages/communication/take-blip)** | 18 | `@codespar/mcp-take-blip` | API Key |
| **[Zenvia](packages/communication/zenvia)** | 18 | `@codespar/mcp-zenvia` | API Key |

### 📦 E-commerce / Logistics (7 servers)

| Server | Tools | npm | Auth |
|---|---|---|---|
| **[Vtex](packages/ecommerce/vtex)** | 33 | `@codespar/mcp-vtex` | API Key |
| **[Shopify](packages/ecommerce/shopify)** | 28 | `@codespar/mcp-shopify` | API Key |
| **[Amazon](packages/ecommerce/amazon)** <sub>alpha</sub> | 24 | `@codespar/mcp-amazon` | OAuth2 |
| **[Shopee](packages/ecommerce/shopee)** <sub>alpha</sub> | 22 | `@codespar/mcp-shopee` | API Key |
| **[Correios](packages/ecommerce/correios)** <sub>alpha</sub> | 21 | `@codespar/mcp-correios` | API Key |
| **[Melhor Envio](packages/ecommerce/melhor-envio)** | 18 | `@codespar/mcp-melhor-envio` | API Key |
| **[SuperFrete](packages/ecommerce/superfrete)** | 11 | `@codespar/mcp-superfrete` | API Key |

### 📊 ERP / Accounting (5 servers)

| Server | Tools | npm | Auth |
|---|---|---|---|
| **[Omie](packages/erp/omie)** | 30 | `@codespar/mcp-omie` | API Key |
| **[Bling](packages/erp/bling)** | 28 | `@codespar/mcp-bling` | API Key |
| **[Xero](packages/erp/xero)** | 24 | `@codespar/mcp-xero` | API Key |
| **[Quickbooks](packages/erp/quickbooks)** | 22 | `@codespar/mcp-quickbooks` | API Key |
| **[Tiny](packages/erp/tiny)** | 21 | `@codespar/mcp-tiny` | API Key |

### 🪪 Identity & KYC (8 servers)

| Server | Tools | npm | Auth |
|---|---|---|---|
| **[Brasil API](packages/identity/brasil-api)** | 24 | `@codespar/mcp-brasil-api` | No auth |
| **[Jumio](packages/identity/jumio)** | 20 | `@codespar/mcp-jumio` | API Key |
| **[Onfido](packages/identity/onfido)** | 20 | `@codespar/mcp-onfido` | API Key |
| **[Persona](packages/identity/persona)** | 20 | `@codespar/mcp-persona` | API Key |
| **[Unico](packages/identity/unico)** <sub>alpha</sub> <sub>deprecated: no live endpoint</sub> | 18 | `@codespar/mcp-unico` | OAuth2 |
| **[Certta](packages/identity/certta)** <sub>deprecated: no live endpoint</sub> | 11 | `@codespar/mcp-certta` | API Key |
| **[BigDataCorp](packages/identity/bigdatacorp)** | 10 | `@codespar/mcp-bigdatacorp` | API Key |
| **[Caf](packages/identity/caf)** <sub>deprecated: no live endpoint</sub> | 9 | `@codespar/mcp-caf` | API Key |

### 🛡️ Fraud & Risk (4 servers)

| Server | Tools | npm | Auth |
|---|---|---|---|
| **[Sift](packages/fraud/sift)** <sub>alpha</sub> | 20 | `@codespar/mcp-sift` | API Key |
| **[Clearsale](packages/fraud/clearsale)** <sub>alpha</sub> | 18 | `@codespar/mcp-clearsale` | API Key |
| **[Konduto](packages/fraud/konduto)** <sub>alpha</sub> | 18 | `@codespar/mcp-konduto` | API Key |
| **[Legiti](packages/fraud/legiti)** <sub>alpha</sub> <sub>deprecated: no live endpoint</sub> | 18 | `@codespar/mcp-legiti` | API Key |

### 🪙 Crypto / Stablecoins (10 servers)

| Server | Tools | npm | Auth |
|---|---|---|---|
| **[Circle](packages/crypto/circle)** | 23 | `@codespar/mcp-circle` | API Key |
| **[Foxbit](packages/crypto/foxbit)** | 21 | `@codespar/mcp-foxbit` | API Key |
| **[Bitso](packages/crypto/bitso)** | 20 | `@codespar/mcp-bitso` | API Key |
| **[Mercado Bitcoin](packages/crypto/mercado-bitcoin)** | 20 | `@codespar/mcp-mercado-bitcoin` | API Key |
| **[Moonpay](packages/crypto/moonpay)** | 20 | `@codespar/mcp-moonpay` | API Key |
| **[Unblockpay](packages/crypto/unblockpay)** | 13 | `@codespar/mcp-unblockpay` | API Key |
| **[Coinbase Commerce](packages/crypto/coinbase-commerce)** | 18 | `@codespar/mcp-coinbase-commerce` | API Key |
| **[Transak](packages/crypto/transak)** <sub>alpha</sub> | 18 | `@codespar/mcp-transak` | API Key |
| **[Coinbase CDP](packages/crypto/coinbase-cdp)** | 15 | `@codespar/mcp-coinbase-cdp` | API Key |
| **[x402](packages/crypto/x402)** <sub>deprecated: no live endpoint</sub> | 10 | `@codespar/mcp-x402` | API Key |

### 🇦🇷 Argentina (6 servers)

| Server | Tools | npm | Auth |
|---|---|---|---|
| **[Tienda Nube](packages/argentina/tienda-nube)** | 24 | `@codespar/mcp-tienda-nube` | API Key |
| **[Colppy](packages/argentina/colppy)** <sub>alpha</sub> | 22 | `@codespar/mcp-colppy` | API Key |
| **[AFIP](packages/argentina/afip)** <sub>alpha</sub> | 20 | `@codespar/mcp-afip` | API Key |
| **[Andreani](packages/argentina/andreani)** <sub>alpha</sub> | 18 | `@codespar/mcp-andreani` | API Key |
| **[BCRA](packages/argentina/bcra)** | 16 | `@codespar/mcp-bcra` | No auth |
| **[Payway](packages/argentina/payway)** | 6 | `@codespar/mcp-payway` | API Key |

### 🇨🇴 Colombia (8 servers)

| Server | Tools | npm | Auth |
|---|---|---|---|
| **[Siigo](packages/colombia/siigo)** | 22 | `@codespar/mcp-siigo` | API Key |
| **[Wompi](packages/colombia/wompi)** | 22 | `@codespar/mcp-wompi` | API Key |
| **[Alegra](packages/colombia/alegra)** | 20 | `@codespar/mcp-alegra` | API Key |
| **[Coordinadora](packages/colombia/coordinadora)** <sub>alpha</sub> | 19 | `@codespar/mcp-coordinadora` | API Key |
| **[Nequi](packages/colombia/nequi)** <sub>alpha</sub> | 16 | `@codespar/mcp-nequi` | OAuth2 |
| **[Cobre](packages/colombia/cobre)** | 8 | `@codespar/mcp-cobre` | API Key |
| **[ePayco](packages/colombia/epayco)** | 8 | `@codespar/mcp-epayco` | API Key |
| **[Bold](packages/colombia/bold-co)** | 7 | `@codespar/mcp-bold-co` | API Key |

### 🇲🇽 Mexico (7 servers)

| Server | Tools | npm | Auth |
|---|---|---|---|
| **[Belvo](packages/mexico/belvo)** | 24 | `@codespar/mcp-belvo` | API Key |
| **[Skydropx](packages/mexico/skydropx)** | 23 | `@codespar/mcp-skydropx` | API Key |
| **[Conekta](packages/mexico/conekta)** | 21 | `@codespar/mcp-conekta` | API Key |
| **[Bind ERP](packages/mexico/bind-erp)** | 20 | `@codespar/mcp-bind-erp` | API Key |
| **[Facturapi](packages/mexico/facturapi)** | 20 | `@codespar/mcp-facturapi` | API Key |
| **[STP/SPEI](packages/mexico/stp-spei)** <sub>alpha</sub> | 18 | `@codespar/mcp-stp-spei` | API Key |
| **[Clip](packages/mexico/clip)** | 6 | `@codespar/mcp-clip` | API Key |


---

## Why MCP?

[Model Context Protocol](https://modelcontextprotocol.io/) is the open standard for connecting AI agents to external tools. Instead of each agent building its own integrations, MCP provides a typed, discoverable interface that works with Claude, ChatGPT, Cursor, VS Code, and more.

```
AI Agent (Claude, ChatGPT, Cursor)
    ↕
MCP Server (this repo)
    ↕
LATAM API / Agentic Protocol (Stripe ACP, x402, Asaas, Mercado Pago, NFe.io, etc.)
```

Each MCP server in this repo:
- Exposes **typed tools** with input/output schemas
- Handles **authentication** (OAuth, mTLS, API keys, Basic Auth, JWT-RSA, signed requests)
- Supports **dual transport** — stdio (default) and **Streamable HTTP** (`--http` flag)
- Compatible with **Claude Managed Agents** via MCP Connector
- Supports **sandbox mode** for safe testing
- Returns **structured JSON** responses

### Running in HTTP mode

Any server can run as an HTTP server for remote/cloud use:

```bash
# stdio (default — local, Claude Desktop, Cursor, Claude Code)
npx @codespar/mcp-asaas

# HTTP (remote — Managed Agents, cloud deployments)
npx @codespar/mcp-asaas --http
# or
MCP_HTTP=true npx @codespar/mcp-asaas
```

HTTP mode exposes `/mcp` (Streamable HTTP) and `/health` (status check).

---

## Alpha vs stable

About a third of the catalog ships under the `alpha` npm dist-tag. These packages have correct tool schemas and auth flow, but the endpoint paths are best-guesses — typically because the provider's developer portal is contract-gated (BR public banks, AR central authority APIs, MX bank-transfer providers). They're flagged with `TODO(verify)` in source.

```bash
npm install @codespar/mcp-itau@alpha
```

Stable packages (the majority) install with the default tag:

```bash
npm install @codespar/mcp-stripe
```

Status is shown on every package page at [codespar.dev/servers](https://codespar.dev/servers) and in each package README.

---

## About CodeSpar

[CodeSpar](https://codespar.dev) builds **commerce infrastructure for AI agents in Latin America** — an MCP catalog (this repo), a runtime + SDK ([`@codespar/sdk`](https://www.npmjs.com/package/@codespar/sdk) on npm, [`codespar`](https://pypi.org/project/codespar/) on PyPI), and a managed-tier governance product (AgentGate: programmable wallet, policy engine, CFO-grade audit, fiscal-compliance certifications).

**Individual MCP servers are useful. Orchestrating many with governance is powerful.** That's what CodeSpar does.

Part of a broader ecosystem index: **[Awesome Agentic Commerce LATAM](https://github.com/codespar/awesome-agentic-commerce-latam)** — a vendor-neutral list of the protocols, rails, providers, and regulation for agents that move money in Latin America.

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](docs/CONTRIBUTING.md).

**Want a server for a service not listed?** [Open a server-request issue](https://github.com/codespar/mcp-dev-latam/issues/new?template=server-request.yml) — there's a structured form with name, npm package, docs link, auth flow.

## License

MIT — use freely in commercial and open source projects.
