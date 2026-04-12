# MCP AFIP

MCP server for **AFIP** — Argentine tax authority (Administracion Federal de Ingresos Publicos) for electronic invoicing (Factura Electronica) with CAE authorization.

## Quick Start

```bash
# Set your credentials
export AFIP_CERT_PATH="/path/to/cert.crt"
export AFIP_KEY_PATH="/path/to/key.key"
export AFIP_CUIT="20123456789"

# Run via stdio
npx tsx packages/argentina/afip/src/index.ts

# Run via HTTP
npx tsx packages/argentina/afip/src/index.ts --http
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AFIP_CERT_PATH` | Yes | Path to AFIP certificate (.crt) |
| `AFIP_KEY_PATH` | Yes | Path to AFIP private key (.key) |
| `AFIP_CUIT` | Yes | CUIT number of the taxpayer |
| `AFIP_ENV` | No | `"production"` or `"homologation"` (default: homologation) |
| `MCP_HTTP` | No | Set to `"true"` to enable HTTP transport |
| `MCP_PORT` | No | HTTP port (default: 3000) |

## Tools

| Tool | Description |
|------|-------------|
| `create_invoice` | Create an electronic invoice (Factura Electronica) |
| `get_invoice` | Get invoice details by type, POS, and number |
| `get_last_invoice_number` | Get last authorized invoice number for a POS |
| `get_cae_status` | Check CAE authorization status |
| `list_invoice_types` | List available invoice types (A, B, C, etc.) |
| `list_tax_types` | List available tax types (IVA, percepciones, etc.) |
| `get_server_status` | Check AFIP web-service availability |
| `get_authorized_points_of_sale` | List authorized puntos de venta |

## Auth

Uses **certificate-based WSAA authentication** (SOAP). The MCP server wraps AFIP's SOAP services (WSFE) internally using a REST approach. You need a valid certificate issued by AFIP. For testing, use the homologation environment.

## API Reference

- [AFIP Web Services Documentation](https://www.afip.gob.ar/ws/)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
