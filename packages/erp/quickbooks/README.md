# @codespar/mcp-quickbooks

MCP server for [QuickBooks Online](https://developer.intuit.com/app/developer/qbo/docs/api) (Intuit) — the most-used accounting platform in the US and UK, and the global default for small-business ERP.

This is our **global accounting anchor**. While the catalog covers BR/LatAm ERPs (Omie, Conta Azul, Alegra, Bling, Tiny), LatAm SaaS companies that invoice international customers — or subsidiaries of US parent companies — almost universally keep their books in QuickBooks.

## Tools (22)

| Tool | Purpose |
|---|---|
| `create_customer` | Create a customer in QuickBooks Online. |
| `update_customer` | Update a customer. |
| `get_customer` | Retrieve a customer by QuickBooks entity id. |
| `list_customers` | Query customers using QBO's SQL-like query language. |
| `create_invoice` | Create an invoice. |
| `update_invoice` | Update an invoice. |
| `void_invoice` | Void an invoice. |
| `delete_invoice` | Delete an invoice. |
| `get_invoice` | Retrieve an invoice by QuickBooks entity id. |
| `send_invoice` | Email an invoice to the customer. |
| `create_payment` | Record a customer payment against one or more invoices. |
| `get_payment` | Retrieve a payment by QuickBooks entity id. |
| `create_item` | Create a product or service item. |
| `list_items` | Query items using QBO's SQL-like query language. |
| `create_bill` | Create a bill (AP / money owed to a vendor). |
| `list_bills` | Query bills using QBO's SQL-like query language. |
| `create_vendor` | Create a vendor (supplier). |
| `list_vendors` | Query vendors using QBO's SQL-like query language. |
| `create_estimate` | Create an estimate (quote). |
| `create_sales_receipt` | Create a sales receipt (paid-on-the-spot sale — combines invoice + payment). |
| `list_accounts` | Query the chart of accounts using QBO's SQL-like query language. |
| `get_profit_and_loss_report` | Run a Profit and Loss report for a date range. |

## Install

```bash
npm install @codespar/mcp-quickbooks
```

## Environment

```bash
QB_ACCESS_TOKEN="..."   # OAuth2 bearer (expires in 1hr — caller refreshes)
QB_REALM_ID="..."       # company id, issued on authorization
QB_ENV="sandbox"        # or "production". Default: sandbox
QB_MINOR_VERSION="70"   # optional, default 70
```

## Authentication

QuickBooks uses OAuth2 authorization_code flow. Access tokens live 1hr; refresh tokens 100 days. This server assumes a valid `QB_ACCESS_TOKEN` is already issued — token acquisition and refresh live outside the MCP scaffold (typically in your agent's credential manager).

## Run

```bash
# stdio (default)
npx @codespar/mcp-quickbooks

# HTTP
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-quickbooks
```

## Query language

QuickBooks list endpoints use a SQL-like syntax passed via `?query=`. Examples:

```sql
SELECT * FROM Customer WHERE Active = true MAXRESULTS 50
SELECT * FROM Item WHERE Type = 'Service'
SELECT * FROM Account WHERE AccountType = 'Income'
```

Pass the full query string to `list_customers`, `list_items`, `list_accounts`.

## License

MIT
