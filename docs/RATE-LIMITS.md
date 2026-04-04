# Rate Limits & Retry Strategy

How to handle rate limits, retries, and cost awareness when using MCP Brasil servers.

---

## Rate Limits by Service

| Service | Production Limit | Sandbox Limit | Rate Limit Response | Retry Header |
|---------|-----------------|---------------|-------------------|-------------|
| **Zoop** | 100 req/min | 50 req/min | HTTP 429 | `Retry-After` |
| **Asaas** | 100 req/min | 100 req/min | HTTP 429 | `Retry-After` |
| **Nuvem Fiscal** | 60 req/min | 60 req/min | HTTP 429 | `X-RateLimit-Reset` |
| **Melhor Envio** | 60 req/min | 30 req/min | HTTP 429 | `Retry-After` |
| **Omie** | 60 req/min (per app) | N/A | HTTP 429 | None (wait 60s) |
| **Stark Bank** | 200 req/min | 200 req/min | HTTP 429 | `Retry-After` |
| **Z-API** | 20 msg/min* | 20 msg/min* | HTTP 429 | None |

> *Z-API limits vary by plan. WhatsApp itself may throttle further if messages are flagged.

### Additional Limits

- **Omie** has a daily limit of 10,000 requests per app.
- **Nuvem Fiscal** NFe emission is limited by SEFAZ processing (typically 1-5 seconds per NFe).
- **Melhor Envio** shipping label generation may take 5-30 seconds (async).
- **Stark Bank** has separate limits for read vs. write operations.
- **Z-API** message throughput depends on WhatsApp Business account quality rating.

---

## Retry Strategy

### HTTP 429 — Rate Limited

When you receive a 429 status code:

1. Check for `Retry-After` header (value in seconds).
2. If present, wait that many seconds before retrying.
3. If absent, use exponential backoff starting at 2 seconds.

```
Attempt 1: wait 2s
Attempt 2: wait 4s
Attempt 3: wait 8s
Max attempts: 3
```

### HTTP 5xx — Server Error

The external API is experiencing issues:

```
Attempt 1: wait 1s
Attempt 2: wait 2s
Attempt 3: wait 4s
Max attempts: 3
```

If all retries fail, report the error to the user. Do not keep retrying indefinitely.

### HTTP 4xx (except 429) — Client Error

**Do not retry.** The request is malformed or unauthorized. Common causes:

| Status | Meaning | Action |
|--------|---------|--------|
| 400 | Bad request | Fix the request parameters |
| 401 | Unauthorized | Check API key |
| 403 | Forbidden | Check permissions / plan |
| 404 | Not found | Check the resource ID |
| 422 | Validation error | Fix the input data |

### Timeout

If a request takes longer than 30 seconds:

- For **read operations**: retry once.
- For **write operations** (payments, NFe): do NOT retry blindly. Check if the resource was created before retrying to avoid duplicates.

---

## Cost Awareness

### Tools That Trigger Paid Operations

Not all tool calls are free. Some trigger real charges on external APIs:

| Tool | Service | Estimated Cost |
|------|---------|---------------|
| `create_transaction` | Zoop | 2.5% + R$ 0,49 per Pix |
| `create_nfe` | Nuvem Fiscal | R$ 0,10 - R$ 0,20 per NFe |
| `create_shipment` | Melhor Envio | R$ 15 - R$ 80+ (varies by carrier/weight) |
| `send_text_message` | Z-API | Included in plan (varies) |
| `send_image_message` | Z-API | Included in plan (varies) |
| `create_transfer` | Stark Bank | R$ 0,00 (Pix) to R$ 3,00 (TED) |
| `create_boleto` | Asaas | R$ 1,00 - R$ 3,00 per boleto |
| `create_order` | Omie | Free (included in plan) |

> Costs are approximate and vary by plan, volume, and provider. Check each provider's pricing page for current rates.

### Free / Read-Only Tools

These tools do not incur charges:

```
get_balance           — Free
list_transactions     — Free
get_transaction       — Free
list_customers        — Free
calculate_shipping    — Free (quote only)
get_nfe               — Free
list_orders           — Free
```

### Monitor Your Usage

Set up billing alerts on every service to avoid surprises:

| Service | Where to Monitor |
|---------|-----------------|
| Zoop | Dashboard > Financeiro |
| Asaas | Minha Conta > Extrato |
| Nuvem Fiscal | Painel > Consumo |
| Melhor Envio | Painel > Carteira |
| Omie | Painel > Plano |
| Stark Bank | Dashboard > Extrato |
| Z-API | Painel > Plano |

---

## Agent Safety

When an AI agent has access to tools that spend money, you need guardrails.

### Configure Budget Limits

Set a maximum budget per agent session:

```
Max spend per session:     R$ 500,00
Max single transaction:    R$ 1.000,00
Max WhatsApp messages:     50 per session
Max shipping labels:       10 per session
```

### Require Confirmation for High-Value Operations

Configure your agent to ask before executing expensive operations:

```
Agent: "Vou criar uma cobranca de R$ 2.500,00 via Pix para Joao Silva.
        CPF: 987.654.321-00. Confirma?"

User: "Sim, pode cobrar."

Agent: [executes create_transaction]
```

Suggested confirmation thresholds:

| Operation | Confirm If |
|-----------|-----------|
| Payment / Charge | > R$ 1.000,00 |
| Bank transfer | > R$ 500,00 |
| Bulk WhatsApp | > 10 messages |
| Bulk shipping labels | > 5 labels |
| NFe emission | Always (fiscal document) |

### Log All Write Operations

Maintain an audit trail of every write operation:

```
[2026-04-03 14:22:00] create_transaction — R$ 149,90 — Pix — txn_abc123
[2026-04-03 14:25:00] create_nfe — NFe #1523 — nfe_456def
[2026-04-03 14:28:00] create_shipment — PAC — R$ 18,90 — shipment_789
[2026-04-03 14:30:00] send_text_message — 5531999887766 — msg_zapi_790
```

This log helps with:
- **Debugging** — what happened and when
- **Reconciliation** — match tool calls to bank transactions
- **Compliance** — LGPD audit trail
- **Dispute resolution** — prove what was sent and when

### Idempotency

Some APIs support idempotency keys to prevent duplicate operations:

- **Stark Bank** — uses `external_id` to prevent duplicate transfers
- **Omie** — uses `codigo_pedido_integracao` to prevent duplicate orders
- **Zoop** — use a unique `reference_id` per transaction

Always pass idempotency keys when available. If a tool call times out, you can safely retry without creating duplicates.

---

## Quick Reference

```
429 → Wait Retry-After or exponential backoff (2s, 4s, 8s)
5xx → Retry 3x with backoff (1s, 2s, 4s)
4xx → Don't retry, fix the request
Timeout on write → Check if resource was created before retrying
Paid tool → Confirm with user if above threshold
Bulk operation → Require explicit confirmation
All writes → Log for audit trail
```
