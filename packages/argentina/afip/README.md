# MCP AFIP


> **Alpha release** — published under the `alpha` npm dist-tag. Endpoint paths follow public docs and BACEN/provider conventions but have not been fully live-validated. Pin exact versions during `0.x.x-alpha`. Install with `npm install <pkg>@alpha`.

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

## Tools (20)

| Tool | Purpose |
|---|---|
| `create_invoice` | Create an electronic invoice (Factura Electrónica) via AFIP |
| `get_invoice` | Get invoice details by type, point of sale, and number |
| `get_last_invoice_number` | Get last authorized invoice number for a point of sale and type |
| `get_cae_status` | Check CAE authorization status for an invoice |
| `list_invoice_types` | List available invoice types (Factura A, B, C, etc.) |
| `list_tax_types` | List available tax types (IVA, percepciones, retenciones, etc.) |
| `get_server_status` | Check AFIP web-service availability (WSFE status) |
| `get_authorized_points_of_sale` | List authorized puntos de venta for the CUIT |
| `create_invoice_batch` | Create a batch of invoices in a single CAE request (FECAESolicitar, up to 250) |
| `create_credit_note` | Issue a credit note (Nota de Crédito A/B/C: types 3, 8, 13) referencing an original invoice |
| `create_debit_note` | Issue a debit note (Nota de Débito A/B/C: types 2, 7, 12) referencing an original invoice |
| `cancel_invoice` | Cancel/void an authorized invoice (FECancel — limited to certain types/conditions) |
| `get_invoice_total_x_request` | Max number of records allowed per FECAESolicitar request (FECompTotXRequest) |
| `list_concept_types` | List available concept types (FEParamGetTiposConcepto: 1=Products, 2=Services, 3=Both) |
| `list_doc_types` | List document/identifier types (FEParamGetTiposDoc: 80=CUIT, 86=CUIL, 96=DNI, 99=Consumer Final) |
| `list_iva_types` | List IVA tax aliquots (FEParamGetTiposIva: 21%, 10.5%, 27%, 0%, etc.) |
| `list_currency_types` | List supported currencies (FEParamGetTiposMonedas) |
| `get_currency_rate` | Get FX rate (cotización) for a currency vs ARS (FEParamGetCotizacion) |
| `lookup_taxpayer` | Padrón lookup by CUIT (WS_SR_PADRON A4/A5/A13 — fiscal status, name, address) |
| `get_registration_certificate` | Get constancia de inscripción (registration certificate) for a CUIT |

## Auth

Uses **certificate-based WSAA authentication** (SOAP). The MCP server wraps AFIP's SOAP services (WSFE) internally using a REST approach. You need a valid certificate issued by AFIP. For testing, use the homologation environment.

## API Reference

- [AFIP Web Services Documentation](https://www.afip.gob.ar/ws/)

---

**Enterprise?** Contact us at [codespar.com](https://codespar.com) for dedicated support, custom integrations, and SLAs.
