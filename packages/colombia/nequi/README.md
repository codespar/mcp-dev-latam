# MCP Nequi

MCP server for **Nequi** — Colombia's leading digital wallet with 50M+ users, powered by Bancolombia. Supports push payments, QR payments, and subscriptions.

## Quick Start

```bash
# Set your credentials
export NEQUI_API_KEY="your-api-key"
export NEQUI_CLIENT_ID="your-client-id"
export NEQUI_CLIENT_SECRET="your-client-secret"

# Run via stdio
npx tsx packages/colombia/nequi/src/index.ts

# Run via HTTP
npx tsx packages/colombia/nequi/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEQUI_API_KEY` | Yes | API key from Nequi developer portal |
| `NEQUI_CLIENT_ID` | Yes | OAuth2 client ID |
| `NEQUI_CLIENT_SECRET` | Yes | OAuth2 client secret |
| `NEQUI_ENV` | No | `"sandbox"` or `"production"` (default: sandbox) |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools

| Tool | Description |
|------|-------------|
| `create_push_payment` | Send a push payment notification to a Nequi user |
| `get_payment_status` | Check payment status |
| `create_qr_payment` | Generate a QR code for payment |
| `reverse_payment` | Reverse a completed payment |
| `get_subscription` | Get subscription details |
| `unsubscribe` | Cancel a subscription |

## Auth

Uses **OAuth2 client credentials** flow. The server obtains an access token using client ID and secret, and includes the API key in every request header.

## API Reference

- [Nequi API Docs](https://docs.conecta.nequi.com.co/)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
