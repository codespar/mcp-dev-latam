# @codespar/mcp-jumio

MCP server for [Jumio](https://jumio.com) — global enterprise identity verification (KYX / Netverify).

Jumio is the identity layer banks and large regulated fintechs reach for when Onfido isn't deep enough on fraud-pattern detection. Longer operator history, richer risk intelligence, purpose-built for regulated commerce at scale.

Third entry in CodeSpar's `identity` category. Completes the tier:

| Server | Strength |
|--------|----------|
| [Unico](../unico) | BR leader — local KYC, PEP, court records, Receita Federal biometric pool |
| [Onfido](../onfido) | Global challenger — clean developer API, 195+ countries, strong SDK story |
| **Jumio** (this) | Global enterprise — deeper fraud-pattern detection, longer operator history, bank-grade |

## When to pick Jumio

- Regulated bank or tier-1 fintech where auditors expect a legacy-credible vendor
- High-value onboarding where fraud-loss >> verification cost
- Deep fraud intelligence matters (velocity checks, device/session signals, longitudinal identity graph)
- You already run Jumio elsewhere in the org and want a single KYC stack

Pair with Unico for Brazil-resident users (CPF + Receita biometric match); use Jumio for the rest of the world.

## Tools (20)

| Tool | Purpose |
|---|---|
| `initiate_account` | Create a persistent Jumio end-user account. |
| `initiate_transaction` | Start a new KYC workflow execution on an existing account. |
| `get_transaction` | Retrieve a workflow execution summary — status ('INITIATED' \| 'PROCESSED' \| 'SESSION_EXPIRED' \| 'TOKEN_EXPI... |
| `list_transactions` | List workflow executions for an account. |
| `get_transaction_details` | Retrieve the full result payload for a workflow execution — all capability outputs (extraction, liveness, s... |
| `retrieve_document_data` | Retrieve extracted fields from the ID document (name, DOB, document number, expiry, issuing country, MRZ, e... |
| `retrieve_similarity_score` | Retrieve the facial similarity result (selfie vs document photo). |
| `delete_transaction` | Delete a workflow execution (GDPR right-to-erasure). |
| `update_transaction_status` | Update the merchant-side status of a workflow execution (PATCH). |
| `retrieve_credentials` | List the credentials (captured artefacts: ID front/back, selfie, proof-of-address, etc) for a workflow exec... |
| `cancel_transaction` | Cancel an in-flight workflow execution (status 'INITIATED' or 'ACQUIRED'). |
| `retry_transaction` | Retry a failed, expired, or rejected workflow execution. |
| `retrieve_extraction_data` | Retrieve raw OCR / extraction capability output for a completed workflow — every extracted field with its s... |
| `retrieve_liveness_result` | Retrieve the liveness capability result — passive/active liveness decision plus per-frame anti-spoofing sco... |
| `retrieve_facemap` | Retrieve the biometric facemap (face template) generated during a workflow. |
| `retrieve_screening_result` | Retrieve AML / watchlist screening output for a workflow — sanctions hits, PEP hits, adverse-media hits wit... |
| `retrieve_data_export` | Retrieve a full GDPR-compliant data export for an account — every workflow execution, captured image URL, e... |
| `register_callback_url` | Set or update the account-level webhook (callback) URL where Jumio POSTs workflow result notifications. |
| `delete_account` | Delete a Jumio end-user account and every workflow execution under it (GDPR right-to-erasure). |
| `list_accounts` | List Jumio end-user accounts under your authorizer / merchant. |

## Flow

```
initiate_account              (once per end-user)
  -> initiate_transaction     returns redirectUrl
  -> user completes capture at redirectUrl
  -> get_transaction          poll until status = PROCESSED
  -> get_transaction_details  full decision payload
  -> retrieve_document_data   extracted ID fields
  -> retrieve_similarity_score face-match result
  -> update_transaction_status ("APPROVED" / "REJECTED" — feedback loop)
```

## Install

```bash
npm install @codespar/mcp-jumio
```

## Environment

```bash
JUMIO_API_TOKEN="..."       # API token (required)
JUMIO_API_SECRET="..."      # API secret (required, secret)
JUMIO_USER_AGENT="AcmeCorp KYX/1.0"   # required by Jumio — identifies the caller
JUMIO_REGION="us"           # 'us' | 'eu' | 'sg'. Default 'us'.
```

## Authentication

HTTP Basic, with API token as user and API secret as password:

```
Authorization: Basic base64(JUMIO_API_TOKEN:JUMIO_API_SECRET)
User-Agent:    <JUMIO_USER_AGENT>
```

Jumio rejects requests without a custom `User-Agent` header — use something that identifies your merchant + integration (e.g. `"AcmeCorp KYX/1.0"`). The server wires both headers automatically.

## Regional hosts

| Region | Host |
|--------|------|
| US (default) | `https://api.amer-1.jumio.ai` |
| EU | `https://api.emea-1.jumio.ai` |
| SG / APAC | `https://api.apac-1.jumio.ai` |

All endpoints live under `/api/v1`.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-jumio

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-jumio
```

## License

MIT
