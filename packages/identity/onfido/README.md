# @codespar/mcp-onfido

MCP server for [Onfido](https://onfido.com) — global identity verification and KYC.

Onfido is the identity verification layer behind Revolut, N26, Uber, and hundreds of regulated fintechs. One API covers 195+ countries and the full KYC flow: applicant → document → live photo → check (runs verification) → reports.

Second entry in CodeSpar's `identity` category alongside [Unico](../unico) (BR-first KYC). Pair them: **Unico for Brazilian users (CPF + Receita Federal biometric pool), Onfido when the flow touches non-LatAm users**.

## Tools (20)

| Tool | Purpose |
|---|---|
| `create_applicant` | Create an Onfido applicant — the person record that documents, live photos, and checks attach to. |
| `retrieve_applicant` | Retrieve an applicant by id. |
| `update_applicant` | Update fields on an existing applicant. |
| `upload_document` | Upload an identity document image for an applicant. |
| `retrieve_document` | Retrieve document metadata by id. |
| `upload_live_photo` | Upload a live photo (selfie) for an applicant, used by facial_similarity_photo reports. |
| `retrieve_live_photo` | Retrieve a live photo record by id. |
| `create_check` | Run a verification check on an applicant. |
| `retrieve_check` | Retrieve a check by id. |
| `list_checks` | List all checks for a given applicant. |
| `retrieve_report` | Retrieve an individual report by id. |
| `delete_applicant` | Soft-delete an applicant. |
| `list_documents` | List all documents uploaded for a given applicant. |
| `download_document` | Download the raw binary of an uploaded document. |
| `list_live_photos` | List all live photos (selfies) uploaded for a given applicant. |
| `resume_check` | Resume a check that was paused (typically awaiting_applicant or paused states). |
| `list_reports` | List the reports contained within a given check. |
| `create_workflow_run` | Start an Onfido Studio workflow run. |
| `retrieve_workflow_run` | Retrieve a workflow run by id. |
| `generate_sdk_token` | Mint a short-lived SDK token for embedding the Onfido Web / iOS / Android SDKs in your frontend. |

## Flow

```
create_applicant
    -> upload_document  (front, and back if driving_licence / national_identity_card)
    -> upload_live_photo
    -> create_check      report_names=["document","facial_similarity_photo","watchlist_standard"]
    -> retrieve_check    (poll until status = complete)
    -> retrieve_report   (for each report id to get the detailed breakdown)
```

## Install

```bash
npm install @codespar/mcp-onfido
```

## Environment

```bash
ONFIDO_API_TOKEN="..."    # API token (required, secret)
ONFIDO_REGION="eu"        # Optional. 'eu' | 'us' | 'ca'. Defaults to api.onfido.com.
```

## Authentication

Onfido uses a non-Bearer header format:

```
Authorization: Token token=<ONFIDO_API_TOKEN>
```

The server handles this automatically.

## Regional hosts

| Region | Host |
|--------|------|
| Default | `https://api.onfido.com` |
| EU | `https://api.eu.onfido.com` |
| US | `https://api.us.onfido.com` |
| CA | `https://api.ca.onfido.com` |

All requests target API version `v3.6` (current stable).

## Multipart uploads

`upload_document` and `upload_live_photo` accept files as **base64-encoded strings**. Pass the bytes in `file`, with `file_name` and `content_type`:

```json
{
  "applicant_id": "a1b2c3...",
  "type": "passport",
  "file": "<base64-encoded bytes>",
  "file_name": "passport.jpg",
  "content_type": "image/jpeg"
}
```

The server wraps it as `multipart/form-data` before sending.

Note: Onfido increasingly recommends capturing live photos via their SDK rather than API upload. Direct `/live_photos` upload may be restricted on some accounts — use the SDK flow when in doubt.

## Run

```bash
# stdio (default — for Claude Desktop, Cursor, etc)
npx @codespar/mcp-onfido

# HTTP (for server-to-server testing)
MCP_HTTP=true MCP_PORT=3000 npx @codespar/mcp-onfido
```

## When to pick Onfido vs Unico

| Signal | Pick |
|--------|------|
| User is Brazilian, need CPF validation + biometric match against Receita Federal | Unico |
| User is outside LatAm, or flow is global | Onfido |
| Regulated fintech needing AML watchlist + PEP screening globally | Onfido |
| Travel / gig marketplace onboarding across 20+ countries | Onfido |

## License

MIT
