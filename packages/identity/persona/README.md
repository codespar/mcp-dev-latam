# @codespar/mcp-persona

MCP server for [Persona](https://withpersona.com) — modern developer-first identity verification and KYC.

Persona is the programmable identity layer favoured by modern startups and fintechs that prioritise DX and template-driven workflows. Instead of a fixed KYC pipeline, you compose **inquiry templates** in the Persona dashboard that reuse building blocks — document, selfie, database, phone, bank — and Persona orchestrates the hosted flow.

Fourth entry in CodeSpar's `identity` category. Where it fits alongside the others:

| Provider | Positioning |
|----------|-------------|
| [Unico](../unico) | BR leader — local PEP, court records, Receita Federal biometric pool |
| [Onfido](../onfido) | Global challenger — document + facial similarity across 195+ countries |
| [Jumio](../jumio) | Global enterprise — deeper fraud intelligence, longer operator track record |
| **Persona** | **Modern developer-first — great DX, template-driven programmable workflows** |

Pick Persona when you want to ship fast, iterate on the flow without a vendor ticket, and wire verification into your own product surfaces.

## Tools (20)

| Tool | Purpose |
|---|---|
| `create_inquiry` | Create a Persona inquiry — a verification session bound to an inquiry template you configured in the Person... |
| `retrieve_inquiry` | Retrieve an inquiry by id. |
| `list_inquiries` | List inquiries, filterable by reference-id (your internal user id) or status. |
| `approve_inquiry` | Mark an inquiry as approved. |
| `decline_inquiry` | Mark an inquiry as declined. |
| `redact_inquiry` | Redact an inquiry (GDPR right-to-erasure). |
| `create_account` | Create a persistent Persona account — a long-lived end-user record that multiple inquiries can attach to. |
| `retrieve_account` | Retrieve a Persona account by id, including summary PII and linked inquiries / verifications. |
| `list_reports` | List reports — individual verification artifacts (e.g. |
| `retrieve_report` | Retrieve a single report by id — returns the full verification detail (matches, scores, raw source data). |
| `create_case` | Open a case — a workspace for an ongoing investigation tied to one or more inquiries / accounts. |
| `resume_inquiry` | Resume a paused inquiry — returns a fresh one-time session token / link so the end user can continue a flow... |
| `update_account` | Patch attributes on an existing Persona account (e.g. |
| `list_accounts` | List Persona accounts, filterable by reference-id (your internal user id) or email. |
| `run_report` | Create and run a standalone Persona report — not tied to an inquiry flow. |
| `retrieve_case` | Retrieve a case by id — full detail including status, assignee, linked objects, attached fields, and tags. |
| `list_cases` | List investigation cases, filterable by status, assignee, or priority. |
| `add_case_tag` | Add a tag to a case. |
| `list_templates` | List inquiry templates configured in your Persona dashboard — returns each template's id (itmpl_...), name,... |
| `list_webhooks` | List configured webhook subscriptions (Persona calls them 'Webhook subscriptions'). |

## Flow

```
create_inquiry (inquiry-template-id=itmpl_...)
    -> user completes Persona-hosted flow (doc + selfie + whatever the template runs)
    -> retrieve_inquiry   (poll until status = 'completed' | 'approved' | 'declined' | 'needs_review')
    -> approve_inquiry / decline_inquiry   (record your final decision)
    -> list_reports / retrieve_report       (for standalone reports like watchlist / adverse-media)
```

Accounts (`create_account` / `retrieve_account`) persist end-user records across inquiries — attach future sessions via `account-id` on `create_inquiry`.

Cases (`create_case`) open a workspace for ongoing investigations (periodic re-verification, flagged users, manual review).

## Install

```bash
npm install @codespar/mcp-persona
```

## Environment

```bash
PERSONA_API_KEY="..."              # API key (required, secret)
PERSONA_API_VERSION="2023-01-05"   # Optional. Sent as Persona-Version header.
```

## Authentication

```
Authorization: Bearer <PERSONA_API_KEY>
Persona-Version: 2023-01-05
```

The server handles both headers automatically.

## JSON:API envelope

Persona uses a JSON:API-style request envelope: every POST body is wrapped as `{ data: { attributes: {...} } }`. This server **handles the wrapping for you** — tool inputs mirror the inner `attributes` shape directly, with kebab-case keys per Persona's convention:

```json
{
  "inquiry-template-id": "itmpl_ABC123",
  "reference-id": "user_42",
  "fields": {
    "name-first": "Ada",
    "name-last": "Lovelace",
    "birthdate": "1815-12-10",
    "address-country-code": "US"
  }
}
```

The server sends it on the wire as:

```json
{ "data": { "attributes": { "inquiry-template-id": "itmpl_ABC123", ... } } }
```

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-persona

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-persona
```

## When to pick Persona vs other identity providers

| Signal | Pick |
|--------|------|
| Fast-moving startup / fintech, DX matters, want to iterate on flow | **Persona** |
| Need custom workflow reusing doc + selfie + bank + phone verifications | **Persona** |
| User is Brazilian, need CPF + Receita Federal biometric match | Unico |
| Global coverage across 195+ countries, regulated fintech AML/PEP | Onfido |
| Bank / large regulated marketplace needing deep fraud intelligence | Jumio |

## License

MIT
