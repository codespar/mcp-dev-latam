# @codespar/mcp-coinbase-commerce

MCP server for [Coinbase Commerce](https://commerce.coinbase.com) — global crypto merchant payments.

Coinbase Commerce is the **merchant-accept** side of crypto. Your store prices an order in local fiat (USD, BRL, EUR, MXN, ...), the buyer settles in BTC / ETH / USDC / and other supported assets, and Coinbase settles to you in the crypto or fiat of your choice.

## Positioning vs the rest of the catalog

| Server | Use case | Direction |
|--------|----------|-----------|
| `@codespar/mcp-coinbase-commerce` | **Merchants accept crypto at checkout** | Buyer pays merchant |
| `@codespar/mcp-unblockpay` | BRL / MXN <-> USDC corridor | Value transfer |
| `@codespar/mcp-moonpay` | End-user fiat <-> crypto (100+ assets) | Onramp / offramp |
| `@codespar/mcp-transak` | End-user fiat <-> crypto (broad geo) | Onramp / offramp |

Use Coinbase Commerce when an agent needs to **bill a buyer in crypto** — hosted charge page, reusable checkout, or directed invoice.

## Tools (18)

| Tool | Purpose |
|---|---|
| `create_charge` | Create a crypto charge — a one-time merchant invoice priced in local fiat that a buyer can settle in BTC, E... |
| `retrieve_charge` | Retrieve a charge by its Coinbase Commerce id OR its short code (the 8-character code embedded in the hoste... |
| `list_charges` | List charges, newest first. |
| `cancel_charge` | Cancel a charge that has not yet been paid. |
| `resolve_charge` | Manually resolve a charge as paid. |
| `create_checkout` | Create a reusable hosted checkout — think product-page-style link that can be paid multiple times. |
| `retrieve_checkout` | Retrieve a checkout by id. |
| `list_checkouts` | List reusable hosted checkouts, newest first. |
| `update_checkout` | Update an existing reusable checkout. |
| `delete_checkout` | Delete a reusable checkout. |
| `list_events` | List events — the lifecycle signals (charge:created, charge:confirmed, charge:failed, charge:delayed, charg... |
| `retrieve_event` | Retrieve a single event by id. |
| `create_invoice` | Create an invoice — a directed bill sent to a specific named recipient. |
| `retrieve_invoice` | Retrieve an invoice by code. |
| `list_invoices` | List invoices, newest first. |
| `void_invoice` | Void an unpaid invoice. |
| `list_exchange_rates` | Fetch current Coinbase exchange rates for a base asset (e.g. |
| `verify_webhook_signature` | Local helper — verify a Coinbase Commerce webhook payload using HMAC-SHA256. |

## Install

```bash
npm install @codespar/mcp-coinbase-commerce
```

## Environment

```bash
COINBASE_COMMERCE_API_KEY="..."         # API key (required, secret)
COINBASE_COMMERCE_API_VERSION="..."     # Optional. Defaults to 2018-03-22.
```

Create an API key at <https://beta.commerce.coinbase.com/settings/security>.

## Authentication

Every request carries two headers:

```
X-CC-Api-Key: <COINBASE_COMMERCE_API_KEY>
X-CC-Version: 2018-03-22
```

The version header is required. Pin it so future API changes don't silently break your integration.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-coinbase-commerce

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-coinbase-commerce
```

## License

MIT
