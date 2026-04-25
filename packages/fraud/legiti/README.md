# @codespar/mcp-legiti

MCP server for [Legiti](https://legiti.com) — Brazilian fraud prevention, ticketing-native with a simple synchronous evaluation API.

Fourth entry in the CodeSpar `fraud` category, after [`@codespar/mcp-clearsale`](../clearsale), [`@codespar/mcp-konduto`](../konduto), and [`@codespar/mcp-sift`](../sift). Legiti (formerly Inspetor, São Paulo) occupies the mid-size BR tier: smaller public footprint than ClearSale, more vertical depth than Konduto for ticketing / events, and a simpler API surface than Sift.

## Positioning

|                      | Strength                                    | Typical fit                               |
|----------------------|---------------------------------------------|-------------------------------------------|
| **ClearSale**        | BR pioneer (2001), large chargeback history | Default for large BR retail               |
| **Konduto**          | BR, API-first, behavioral device intel      | Digital-native BR ecommerce               |
| **Legiti** *(this)*  | BR, ticketing-native, sync evaluation       | BR ticketing marketplaces, mid-size retail|
| **Sift**             | Global, multi-abuse-type ML, workflows      | International enterprise                  |

BR merchants frequently bundle 2-3 of these for best-of-breed scoring — Legiti for its ticketing-specific signals, ClearSale or Konduto for the generalist fraud layer, Sift for cross-border flows.

## Tools (18)

| Tool | Purpose |
|---|---|
| `evaluate_order` | Submit an order to Legiti for real-time fraud evaluation via the v2 order endpoint. |
| `update_order` | Notify Legiti of a status change on an existing order (e.g. |
| `mark_order_fraudulent` | Report a confirmed chargeback / fraud outcome back to Legiti. |
| `evaluate_sale` | Legacy single-shot sale evaluation via POST /evaluation. |
| `track_account` | Notify Legiti of an account lifecycle event (created / updated / deleted). |
| `track_event` | Notify Legiti of an Event (concert, show, match, session) lifecycle change. |
| `track_sale` | Notify Legiti of a Sale state change (created / updated). |
| `track_auth` | Notify Legiti of an authentication or password event (login attempt, logout, password recovery request, pas... |
| `track_login` | Notify Legiti of a login attempt (successful or failed). |
| `track_logout` | Notify Legiti of a logout event. |
| `track_signup` | Notify Legiti of a new account creation. |
| `track_account_update` | Notify Legiti of an account profile change (email, phone, CPF, address). |
| `track_password_recovery` | Notify Legiti of a password recovery request (the 'forgot password' click). |
| `track_event_view` | Notify Legiti that a user viewed an event/show page. |
| `track_payment` | Notify Legiti of a payment-method-level event (authorization attempt, capture, refund, void). |
| `get_decision` | Fetch the latest Legiti decision for an order. |
| `update_decision_status` | Manually override Legiti's decision for an order — typically used to accept or decline a sale that landed i... |
| `mark_dispute_resolution` | Report the outcome of a chargeback dispute back to Legiti — i.e. |

## Install

```bash
npm install @codespar/mcp-legiti@alpha
```

## Environment

```bash
LEGITI_API_KEY="eyJhbGciOi..."   # JWT bearer token; required
LEGITI_BASE_URL="..."             # optional; defaults to https://collection-prod.inspcdn.net
```

## Authentication

Bearer token (JWT-format):

```
Authorization: Bearer <LEGITI_API_KEY>
```

Legiti issues separate **sandbox** and **production** keys. The sandbox key tags every request as test data so it does NOT train the ML model. Always develop and run integration tests with the sandbox key — hitting production with test data pollutes the model.

## Decision values

`evaluate_order` and `evaluate_sale` return one of three decisions:

- `approve` — ship it
- `reject` — block the sale
- `manual` — route to manual review

Evaluation is synchronous; the response may take up to ~20 seconds.

## Typical flow (ticketing)

1. At signup / login, call `track_account` (create/update) and `track_auth` (login/logout, password_recovery, password_reset). Every auth attempt — successful or failed — is valuable signal for account-takeover detection.
2. When a new event (concert, show, match) is published on the platform, call `track_event` (create). Update on price/capacity/date changes.
3. At checkout, call `evaluate_order` with the sale, account, payment, CPF, and the primary `event_date_id`. Act on the returned decision: `approve` → ship, `reject` → block, `manual` → human review.
4. As the order progresses (paid, shipped, delivered, cancelled, refunded), call `update_order`.
5. When a chargeback is confirmed by the issuer, call `mark_order_fraudulent`. This is Legiti's primary ML feedback channel — unreported chargebacks degrade future decision quality for similar buyers.

## Typical flow (non-ticketing ecommerce)

Skip `track_event`. The `event_date_id` fields become optional in `evaluate_order` — Legiti will still evaluate on account + sale + payment signal, though ticketing-vertical features will be unused.

## Alpha note

Shipped as `0.1.0-alpha.1`. Legiti's public documentation is tighter than ClearSale's or Konduto's:

- **Documented in open-source `github.com/legiti/docs-backend`:** `POST /evaluation`, plus the Collection API (account, event, sale, transfer, auth, password) shape and the `Authorization: Bearer` scheme.
- **Documented on `docs.legiti.com` integration guides:** the v2 order family (`POST /v2/order`, `PUT /v2/order`, `POST /v2/order/mark_fraudulent`).
- **Dropped from the original category spec:** `create_rule` / `list_rules` / `update_rule` / `delete_rule` — no public custom-rules surface exists on Legiti. If a customer contract exposes one, promote to `0.2.0`.

Promote to `0.1.0` once the v2 order payload schema is confirmed in production.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-legiti

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-legiti
```

## Category

`fraud` — fourth server in this CodeSpar category alongside ClearSale, Konduto, and Sift. Fraud servers share a common shape (analyze → decide → feedback) distinct from payments, which makes cross-provider swaps (ClearSale ↔ Konduto ↔ Legiti) more straightforward than cross-acquirer swaps.

## License

MIT
