# @codespar/mcp-sift

MCP server for [Sift](https://sift.com) — global enterprise ML-based fraud detection.

Third entry in the CodeSpar `fraud` category after [`@codespar/mcp-clearsale`](../clearsale) and [`@codespar/mcp-konduto`](../konduto). Sift is the global / enterprise counterpart to the two BR-native antifraud servers.

## Positioning

|                    | ClearSale                 | Konduto                               | Sift                                         |
|--------------------|---------------------------|---------------------------------------|----------------------------------------------|
| Geography          | Brazil                    | Brazil                                | Global (US-HQ, ~30 countries)                |
| Founded            | 2001                      | 2014                                  | 2011                                         |
| Strength           | Chargeback history db     | Behavioral device intelligence        | Multi-abuse-type ML + workflow decisions     |
| Shape              | Score + manual review     | API-first, tight surface              | Event stream in, scores + decisions out      |
| Scope              | Order fraud               | Order fraud                           | Payment, account, content, promotion abuse   |

Also distinct from [`@codespar/mcp-jumio`](../../kyc/jumio), which is global KYC / identity verification — a different layer than fraud scoring.

## Sift's API shape

Sift is built around three APIs that work together:

1. **Events API** (`/v205/events`) — you POST every interesting signal (account creation, login, order, chargeback, ...) as a `$`-prefixed event.
2. **Score API** (`/v205/users/{user_id}/score`) — you GET the latest ML score for a user, or POST to force a rescore. Scores are floats in `[0, 1]` per abuse type (`payment_abuse`, `account_abuse`, `content_abuse`, `promotion_abuse`).
3. **Decisions API v3** (`/v3/accounts/{account_id}/...`) — workflows in the Sift console turn scores into Decisions (`block_user_payment_abuse`, `approve_order_payment_abuse`, etc). You can apply a decision directly, read the current decisions on a user/order, or fetch the status of a workflow run.

## Tools (20)

| Tool | Purpose |
|---|---|
| `send_event` | Send a fraud signal to Sift's Events API (POST /v205/events). |
| `get_user_score` | Fetch the latest Sift score(s) for a user (GET /v205/users/{user_id}/score). |
| `rescore_user` | Force Sift to recompute a user's score right now (POST /v205/users/{user_id}/score). |
| `label_user` | Label a user as fraud or not-fraud via the legacy Labels API (POST /v205/users/{user_id}/labels). |
| `unlabel_user` | Remove any existing label on a user (DELETE /v205/users/{user_id}/labels). |
| `apply_decision_to_user` | Apply a workflow Decision to a user (POST /v3/accounts/{account_id}/users/{user_id}/decisions). |
| `apply_decision_to_order` | Apply a workflow Decision to a specific order (POST /v3/accounts/{account_id}/users/{user_id}/orders/{order... |
| `get_user_decisions` | Fetch the decisions currently applied to a user (GET /v3/accounts/{account_id}/users/{user_id}/decisions). |
| `get_order_decisions` | Fetch the decisions currently applied to an order (GET /v3/accounts/{account_id}/orders/{order_id}/decisions). |
| `get_workflow_run` | Fetch the status of a Sift Workflow run (GET /v3/accounts/{account_id}/workflows/runs/{run_id}). |
| `send_chargeback` | Send a $chargeback event to Sift's Events API (POST /v205/events). |
| `send_login` | Send a $login event to Sift's Events API (POST /v205/events). |
| `send_logout` | Send a $logout event to Sift's Events API (POST /v205/events). |
| `send_content_status` | Send a $content_status event to Sift's Events API (POST /v205/events). |
| `link_session_to_user` | Send a $link_session_to_user event to Sift's Events API (POST /v205/events). |
| `send_custom_event` | Send a custom (merchant-defined) event to Sift's Events API (POST /v205/events). |
| `apply_decision_to_session` | Apply a workflow Decision to a session (POST /v3/accounts/{account_id}/users/{user_id}/sessions/{session_id... |
| `apply_decision_to_content` | Apply a workflow Decision to a content item (POST /v3/accounts/{account_id}/users/{user_id}/content/{conten... |
| `get_session_decisions` | Fetch the decisions currently applied to a session (GET /v3/accounts/{account_id}/users/{user_id}/sessions/... |
| `get_content_decisions` | Fetch the decisions currently applied to a content item (GET /v3/accounts/{account_id}/users/{user_id}/cont... |

## Install

```bash
npm install @codespar/mcp-sift@alpha
```

## Environment

```bash
SIFT_API_KEY="..."         # required, secret
SIFT_ACCOUNT_ID="..."      # required for all Decisions API v3 calls
SIFT_BASE_URL="..."        # optional; defaults to https://api.sift.com
```

## Authentication

- **Events API** — `$api_key` is injected into the JSON body. The server handles this automatically.
- **Score API + Decisions API v3** — HTTP Basic, API key as username, empty password. The server handles the base64 encoding.

Pass the raw key in `SIFT_API_KEY`.

## Typical flow

1. Instrument your app: every signup, login, profile update, order, and chargeback becomes a `send_event` call with the right `$type`.
2. On high-stakes moments (checkout, withdrawal), call `send_event` with `return_score: true` to get an inline decision.
3. Or poll `get_user_score` / `get_order_decisions` asynchronously after a workflow run completes.
4. For manual review outcomes, call `apply_decision_to_user` or `apply_decision_to_order` with a Decision ID configured in the Sift console and `source: "MANUAL_REVIEW"`.
5. When a chargeback is confirmed, send a `$chargeback` event AND either `apply_decision_to_user` with a Block decision or `label_user` with `is_bad: true, abuse_type: "payment_abuse"`. Decisions are preferred for new integrations; Labels are kept for backward compatibility.

## Alpha note

Shipped as `0.1.0-alpha.1`. All endpoint paths are verified against Sift's official Ruby SDK ([`SiftScience/sift-ruby`](https://github.com/SiftScience/sift-ruby)): `rest_api_path`, `user_score_api_path`, `users_label_api_path`, `user_decisions_api_path`, `order_decisions_api_path`, `workflow_status_path`, and the Decision `ApplyTo` path builder.

Scope vs. the original brief:

- **Shipped & verified:** send_event, get_user_score, rescore_user, label_user, unlabel_user, apply_decision_to_user, apply_decision_to_order, get_user_decisions, get_order_decisions, get_workflow_run.
- **Dropped — not in the public SDK:**
  - `get_session_score` (`/v205/sessions/{session_id}/score`) — no equivalent helper in the Ruby SDK; session-level scoring in Sift flows through session-level Decisions and Workflow runs, not a dedicated score endpoint.
  - `list_workflow_runs` (`GET /v3/accounts/{account_id}/workflows/runs`) — only `GET /{run_id}` is implemented in the public SDK. In practice, Sift surfaces run_ids in event responses rather than via a list endpoint.
  - `get_psychology_score` — no such endpoint in the public SDK.

The `developers.sift.com` reference pages gate deep-link URLs (403 on several paths), so we used the official SDK as the source of truth. Promote to `0.1.0` once a customer confirms (or denies) the dropped endpoints against the full Decisions / Score API reference in Sift's admin console.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-sift

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-sift
```

## Category

`fraud` — third entry after ClearSale and Konduto. BR merchants operating internationally commonly pair Sift (global payment/account abuse) with ClearSale or Konduto (BR-specific chargeback history / device intelligence).

## License

MIT
