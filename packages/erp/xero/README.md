# @codespar/mcp-xero

MCP server for [Xero](https://www.xero.com) — global cloud accounting for SMBs.

Xero is the #2 global SMB ERP and the leader in the UK, Australia, and New Zealand, with rapid expansion in the US. Paired with QuickBooks, the two platforms cover roughly 80% of global SMB accounting. For LatAm SaaS serving US/UK/AU/NZ customers or with international subsidiaries, Xero is the essential complement to our Brazil-native ERPs (Omie, Conta Azul, Bling, Tiny).

## Tools (24)

| Tool | Purpose |
|---|---|
| `create_contact` | Create a Xero contact (customer or supplier — Xero uses one unified Contact object with IsCustomer/IsSuppli... |
| `get_contact` | Retrieve a single Xero contact by ContactID (UUID). |
| `list_contacts` | List Xero contacts. |
| `create_invoice` | Create an invoice in Xero. |
| `get_invoice` | Retrieve a single invoice by InvoiceID (UUID) or InvoiceNumber. |
| `list_invoices` | List invoices with optional Xero where-clause filtering. |
| `email_invoice` | Email an AUTHORISED invoice to the contact's email address on file. |
| `create_payment` | Record a payment against an invoice or credit note. |
| `create_item` | Create a Xero inventory/product item. |
| `list_items` | List all items/products in the Xero tenant. |
| `list_accounts` | List the Xero chart of accounts. |
| `update_contact` | Update an existing Xero contact. |
| `archive_contact` | Archive a Xero contact by setting ContactStatus=ARCHIVED. |
| `update_invoice` | Update an existing invoice. |
| `void_invoice` | Void an invoice by setting Status=VOIDED. |
| `get_payment` | Retrieve a single payment by PaymentID. |
| `list_payments` | List payments recorded in Xero. |
| `create_bank_transaction` | Create a bank transaction (SPEND = money out, RECEIVE = money in) directly on a bank account — for transact... |
| `list_bank_transactions` | List bank transactions (spend/receive entries on bank accounts). |
| `list_organisations` | Retrieve the Xero organisation(s) the access token has access to — returns name, base currency, country, fi... |
| `list_tax_rates` | List tax rates configured in the Xero tenant. |
| `create_credit_note` | Create a credit note. |
| `list_credit_notes` | List credit notes. |
| `get_balance_sheet` | Retrieve the Balance Sheet report for the tenant. |

## Install

```bash
npm install @codespar/mcp-xero
```

## Environment

```bash
XERO_ACCESS_TOKEN="..."   # OAuth2 bearer access token (required, secret)
XERO_TENANT_ID="..."      # Xero tenant/organization id (required)
```

## Authentication

Xero uses OAuth2. Every request includes:

```
Authorization: Bearer <XERO_ACCESS_TOKEN>
Xero-tenant-id: <XERO_TENANT_ID>
Accept: application/json
Content-Type: application/json
```

This server assumes a **pre-issued access token**. OAuth consent, refresh-token rotation, and tenant selection happen upstream (in your OAuth proxy or secrets layer). When the token expires, Xero returns 401 and the tool surfaces the error verbatim — refresh and retry.

## Run

```bash
# stdio (default — Claude Desktop, Cursor, etc)
npx @codespar/mcp-xero

# HTTP (server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-xero
```

## Where clause

Xero's list endpoints accept a `where` query param for server-side filtering. Examples:

```
Name.Contains("ACME")
IsCustomer==true
Status=="AUTHORISED" AND Type=="ACCREC"
Date>=DateTime(2026,1,1)
Contact.ContactID==guid("00000000-0000-0000-0000-000000000000")
```

## Positioning in the CodeSpar ERP catalog

- **Brazil-native:** Omie, Conta Azul, Bling, Tiny — NF-e, Simples Nacional, local tax.
- **Global SMB:** **Xero** + QuickBooks — US/UK/AU/NZ/global accounting.

Use Xero for companies headquartered or operating outside Brazil (or with international entities). Use the BR-native servers for the local market.

## Docs

- Xero Accounting API: https://developer.xero.com/documentation/api/accounting
- Xero OAuth2 guide: https://developer.xero.com/documentation/guides/oauth2/overview

## License

MIT
