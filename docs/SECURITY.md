# Security Best Practices

Guidelines for securely using MCP Brasil servers in development and production.

---

## API Key Management

### Never Hardcode API Keys

```json
// BAD — never do this
{
  "mcpServers": {
    "zoop": {
      "env": {
        "ZOOP_API_KEY": "zpk_live_abc123..."
      }
    }
  }
}
```

### Use Environment Variables

```bash
# .env (add to .gitignore!)
ZOOP_API_KEY=zpk_live_abc123...
ZOOP_MARKETPLACE_ID=mkt_456...
ASAAS_API_KEY=aak_live_def789...
NUVEM_FISCAL_CLIENT_ID=nf_client_123...
NUVEM_FISCAL_CLIENT_SECRET=nf_secret_456...
MELHOR_ENVIO_TOKEN=me_token_789...
OMIE_APP_KEY=omie_key_123...
OMIE_APP_SECRET=omie_secret_456...
STARK_BANK_PRIVATE_KEY_PATH=./stark-bank-key.pem
ZAPI_INSTANCE_ID=inst_123...
ZAPI_TOKEN=zapi_tok_456...
```

### .gitignore

Make sure your `.gitignore` includes:

```
.env
.env.*
*.pem
*.key
stark-bank-key.pem
```

### Production Secrets Management

| Platform | How to Set Secrets |
|----------|-------------------|
| Railway | `railway variables set ZOOP_API_KEY=...` or dashboard |
| Vercel | Project Settings > Environment Variables |
| AWS | Secrets Manager or SSM Parameter Store |
| Docker | `docker run -e ZOOP_API_KEY=...` or Docker secrets |

Never store production API keys in `.env` files on shared machines.

---

## Sandbox Mode

Always develop and test using sandbox/staging environments before going live.

### Servers with Sandbox Support

| MCP Server | Sandbox Variable | How to Enable |
|-----------|-----------------|---------------|
| Zoop | `ZOOP_SANDBOX=true` | Uses `https://sandbox.zoop.ws` |
| Asaas | `ASAAS_SANDBOX=true` | Uses `https://sandbox.asaas.com/api/v3` |
| Melhor Envio | `MELHOR_ENVIO_SANDBOX=true` | Uses `https://sandbox.melhorenvio.com.br` |
| Nuvem Fiscal | `NUVEM_FISCAL_AMBIENTE=homologacao` | Uses SEFAZ homologacao environment |
| Stark Bank | `STARK_BANK_ENVIRONMENT=sandbox` | Uses Stark Bank sandbox |
| Omie | N/A | Use a separate test "empresa" in Omie |
| Z-API | N/A | Use a test WhatsApp number |

### Sandbox Testing Checklist

- [ ] All API keys point to sandbox/homologacao
- [ ] Test CPF/CNPJ are used (not real customer data)
- [ ] Payment amounts are small (R$ 1,00 - R$ 10,00)
- [ ] WhatsApp messages go to your own test number
- [ ] NFe is emitted in homologacao (not production SEFAZ)

### Test Data

Use these for sandbox testing:

```
CPF (test):       123.456.789-09
CNPJ (test):      12.345.678/0001-90
CEP:              01310-100 (Av Paulista, SP)
Phone:            +55 11 99999-0000
Email:            test@example.com
Pix amount:       R$ 1,00
```

> Check each provider's documentation for valid test CPF/CNPJ numbers in their sandbox.

---

## Data Protection

### What Passes Through MCP Servers

MCP servers act as **proxies** to external APIs. They do not store data themselves, but sensitive information passes through them:

- **CPF / CNPJ** — tax identification numbers
- **Full names and addresses** — for shipping and invoicing
- **Phone numbers** — for WhatsApp messaging
- **Bank account details** — for Stark Bank operations
- **Payment card data** — if using credit card payments (PCI considerations)

### Protect Sensitive Data in Transit

1. **MCP servers communicate over stdio** — data stays local between your MCP client and the server process.
2. **HTTPS to external APIs** — all MCP servers use HTTPS for outbound requests.
3. **No data stored on disk** — MCP servers are stateless; they don't write logs or databases by default.

### MCP Client Logging

Your MCP client (Claude Desktop, Cursor, custom agent) may log tool calls. Be aware:

```
// This gets logged by your client:
Tool call: create_transaction({ amount: 14990, customer: { cpf: "12345678909", ... } })
```

- Disable verbose logging in production
- If logging is required, redact sensitive fields (CPF, card numbers, phone)
- Never expose client logs publicly

### LGPD Considerations

Brazil's LGPD (Lei Geral de Protecao de Dados) applies to all personal data processing:

- Ensure you have legal basis to process customer data
- Customers have the right to access and delete their data at the external APIs
- Keep records of what data you sent to which API and when
- MCP tool calls can serve as an audit trail if logged properly

---

## Rate Limiting

MCP servers do **not** implement their own rate limiting. Each external API enforces its own limits.

### Why This Matters for AI Agents

An AI agent can call tools very quickly in a loop. Without safeguards, it can:

- Exhaust your API rate limit in seconds
- Trigger account suspension on payment providers
- Generate unexpected charges (e.g., sending hundreds of WhatsApp messages)

### Mitigation

1. **Implement rate limiting in your MCP client** — add delays between tool calls.
2. **Set maximum tool calls per session** — e.g., max 50 tool calls per conversation.
3. **Require confirmation for bulk operations** — "You're about to send 200 WhatsApp messages. Proceed?"

See [RATE-LIMITS.md](RATE-LIMITS.md) for specific limits per service.

---

## Recommended: Read-Only First

When setting up a new MCP server, start with read-only operations:

### Phase 1: Read-Only (Safe)

```
list_customers       ✅ Safe
get_transaction      ✅ Safe
get_balance          ✅ Safe
list_orders          ✅ Safe
calculate_shipping   ✅ Safe (quote only, no charge)
```

### Phase 2: Write Operations (Test in Sandbox)

```
create_transaction   ⚠️ Charges money
create_nfe           ⚠️ Emits fiscal document
create_shipment      ⚠️ Generates paid shipping label
send_text_message    ⚠️ Sends WhatsApp message
create_order         ⚠️ Creates ERP record
create_transfer      ⚠️ Transfers money
```

### Phase 3: Production Write Operations

Only enable after:

- [ ] Successfully tested all write operations in sandbox
- [ ] Confirmed correct business logic (amounts, recipients, tax codes)
- [ ] Set up confirmation prompts for high-value operations
- [ ] Configured logging and audit trail
- [ ] Reviewed LGPD compliance for customer data

---

## Security Checklist

Before going to production, verify:

- [ ] All API keys are in environment variables (not in code or config files)
- [ ] `.env` and key files are in `.gitignore`
- [ ] Sandbox mode is disabled only for production deployment
- [ ] MCP client logging does not expose sensitive data
- [ ] Rate limiting is configured in the client or agent layer
- [ ] High-value operations require human confirmation
- [ ] Audit trail is in place for write operations
- [ ] LGPD compliance reviewed for customer data handling
- [ ] Billing alerts are set on all payment providers
- [ ] Team members use individual API keys (not shared credentials)
