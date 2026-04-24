# @codespar/mcp-konduto

MCP server for [Konduto](https://konduto.com) — Brazilian fraud prevention, API-first.

Second entry in the CodeSpar `fraud` category after [`@codespar/mcp-clearsale`](../clearsale). Konduto sits alongside ClearSale as one of the two default antifraud layers BR merchants evaluate, and the two are often deployed in parallel for score comparison or failover.

## Positioning vs. ClearSale

|                          | ClearSale                           | Konduto                                  |
|--------------------------|-------------------------------------|------------------------------------------|
| Founded                  | 2001 (São Paulo)                    | 2014 (São Paulo)                         |
| Strength                 | Larger chargeback history database  | Behavioral device intelligence           |
| Shape                    | ML scoring + manual review services | API-first, tighter surface, dev-oriented |
| Typical pairing          | Default for large BR retail         | Default for digital-native BR ecommerce  |

Merchants commonly run both in parallel: Konduto for the fast behavioral signal, ClearSale for the long-tail chargeback history. When one flags `review` and the other flags `approved`, the merchant routes the order to manual inspection.

## Tools

| Tool | Purpose |
|------|---------|
| `send_order_for_analysis` | Submit an order; returns decision (approved/declined/review) + score |
| `get_order` | Retrieve the current decision state for an order |
| `update_order_status` | Feed merchant's final status back (approved / declined / fraud / canceled / not_authorized / new) |
| `add_to_blocklist` | Add a known-bad value (email, phone, ip, name, bin_last4, zip, tax_id) |
| `query_blocklist` | Check whether a value is on the blocklist |
| `remove_from_blocklist` | Remove a value from the blocklist |
| `add_to_allowlist` | Add a trusted value (auto-approve) |
| `add_to_reviewlist` | Add a value to force manual review |

## Install

```bash
npm install @codespar/mcp-konduto
```

## Environment

```bash
KONDUTO_API_KEY="T00000..."          # private key; required
KONDUTO_BASE_URL="..."               # optional; defaults to https://api.konduto.com/v1
```

## Authentication

HTTP Basic. The API key is the username; password is empty:

```
Authorization: Basic base64(KONDUTO_API_KEY + ":")
```

The server handles the base64 encoding — pass the raw key in `KONDUTO_API_KEY`.

## Typical flow

1. Embed Konduto's browser JS SDK on the merchant checkout page. It captures a `visitor` id (behavioral + device signals).
2. At order submit, call `send_order_for_analysis` with the full order payload and the `visitor` id.
3. Act on the response: `approved` ships it, `declined` blocks it, `review` holds for manual inspection or a second signal from ClearSale.
4. Once the order lifecycle completes, call `update_order_status` with `approved` / `canceled` / `fraud` — this feeds Konduto's model.
5. When a chargeback is confirmed, call `update_order_status` with status `fraud`. This is Konduto's primary ML feedback channel (there is no separate `/chargebacks` endpoint in the public docs).
6. Use `add_to_blocklist` to permanently block specific emails / IPs / card BIN+last4 pairs observed in confirmed fraud.

## Alpha note

This package is shipped as `0.1.0-alpha.1`. Scope vs. the original brief:

- **Verified against docs.konduto.com:**
  - `POST /orders` (send_order_for_analysis)
  - `POST/GET/DELETE /blacklist/{type}` (blocklist family)
  - `/whitelist/{type}` (allowlist) and `/greylist/{type}` (reviewlist), indexed under "APIs de Blocklist, Allowlist e Reviewlist"

- **Standard REST pattern, not separately indexed in the public reference** (used by Konduto's official client libraries):
  - `GET /orders/{id}` (get_order)
  - `PUT /orders/{id}` (update_order_status)

- **Dropped — not documented publicly:**
  - `POST /disputes` — no dispute submission endpoint on docs.konduto.com
  - `POST /cards/analyze` — no card-only pre-check endpoint documented
  - `GET /visitors/{visitor_id}` — visitor ids are referenced on the order (`visitor` field) but no public retrieval endpoint exists

Chargeback feedback is folded into `update_order_status` with `status: fraud`, which is Konduto's documented feedback channel.

Promote to `0.2.0` once the dropped endpoints are confirmed (via private docs or direct API response), or once Konduto publishes a broader public reference.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-konduto

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-konduto
```

## Category

`fraud` — second server in this CodeSpar category after ClearSale. Fraud servers share a common shape (analyze → decide → feedback) distinct from payments, which makes cross-provider swaps (ClearSale ↔ Konduto ↔ Legiti) more straightforward than cross-acquirer swaps.

## License

MIT
