# Complete Order Workflow

A step-by-step example showing how 6 MCP servers work together to handle a real Brazilian e-commerce order: charge a customer, issue a fiscal note, generate shipping, send tracking, record in ERP, and reconcile.

---

## Scenario

**Loja Exemplo LTDA** (CNPJ: 12.345.678/0001-90) sells a product to **Maria Silva** (CPF: 123.456.789-09) for R$ 149,90 via Pix. The product ships from Sao Paulo (CEP 01310-100) to Belo Horizonte (CEP 30130-000).

---

## Step 1: Charge via Pix (Zoop)

The agent creates a Pix payment using the Zoop MCP server.

**User:**
> Cobra R$ 149,90 via Pix da Maria Silva, CPF 123.456.789-09.

**Agent calls:** `create_transaction`

```json
{
  "amount": 14990,
  "currency": "BRL",
  "payment_type": "pix",
  "description": "Pedido #4521 - Camiseta Oficial",
  "customer": {
    "first_name": "Maria",
    "last_name": "Silva",
    "taxpayer_id": "12345678909",
    "email": "maria.silva@email.com"
  }
}
```

**Response:**

```json
{
  "id": "txn_abc123def456",
  "status": "pending",
  "amount": 14990,
  "payment_type": "pix",
  "pix_qr_code": "00020126580014br.gov.bcb.pix0136...",
  "pix_qr_code_url": "https://api.zoop.ws/v1/pix/qrcode/txn_abc123def456.png",
  "expires_at": "2026-04-03T23:59:59Z"
}
```

**Agent responds:**
> QR Code Pix gerado para R$ 149,90. O pagamento expira hoje as 23:59. Envio o QR Code para a Maria por WhatsApp?

---

## Step 2: Send Pix QR Code via WhatsApp (Z-API)

After generating the Pix, the agent sends the QR code to the customer.

**User:**
> Sim, manda o QR Code no WhatsApp dela.

**Agent calls:** `send_image_message`

```json
{
  "phone": "5531999887766",
  "image_url": "https://api.zoop.ws/v1/pix/qrcode/txn_abc123def456.png",
  "caption": "Ola Maria! Segue o QR Code Pix para o pedido #4521 no valor de R$ 149,90. Valido ate hoje as 23:59."
}
```

**Response:**

```json
{
  "message_id": "msg_zapi_789",
  "status": "sent"
}
```

**Agent responds:**
> QR Code enviado no WhatsApp da Maria (31) 99988-7766. Aguardando confirmacao do pagamento.

---

## Step 3: Payment Confirmed — Issue NFe (Nuvem Fiscal)

Once the Pix payment is confirmed, the agent issues the fiscal note (Nota Fiscal Eletronica).

**User:**
> O pagamento foi confirmado. Emite a nota fiscal.

**Agent calls:** `create_nfe`

```json
{
  "natureza_operacao": "Venda de mercadoria",
  "tipo_documento": 1,
  "emitente": {
    "cnpj": "12345678000190",
    "razao_social": "Loja Exemplo LTDA",
    "inscricao_estadual": "123456789",
    "endereco": {
      "logradouro": "Av Paulista",
      "numero": "1000",
      "bairro": "Bela Vista",
      "municipio": "Sao Paulo",
      "uf": "SP",
      "cep": "01310100"
    }
  },
  "destinatario": {
    "cpf": "12345678909",
    "nome": "Maria Silva",
    "endereco": {
      "logradouro": "Rua da Bahia",
      "numero": "500",
      "bairro": "Centro",
      "municipio": "Belo Horizonte",
      "uf": "MG",
      "cep": "30130000"
    }
  },
  "itens": [
    {
      "descricao": "Camiseta Oficial - Tamanho M",
      "ncm": "61091000",
      "cfop": "6102",
      "quantidade": 1,
      "valor_unitario": 149.90
    }
  ],
  "pagamento": {
    "tipo": "pix",
    "valor": 149.90
  }
}
```

**Response:**

```json
{
  "id": "nfe_456def",
  "numero": 1523,
  "serie": 1,
  "chave_acesso": "35260412345678000190550010000015231234567890",
  "status": "autorizada",
  "protocolo": "135260400001234",
  "danfe_url": "https://api.nuvemfiscal.com.br/nfe/nfe_456def/danfe.pdf",
  "xml_url": "https://api.nuvemfiscal.com.br/nfe/nfe_456def/xml"
}
```

**Agent responds:**
> NFe #1523 autorizada com sucesso. Chave de acesso: 3526041234...7890. DANFE disponivel para download. Gero a etiqueta de envio?

---

## Step 4: Generate Shipping Label (Melhor Envio)

The agent calculates shipping options and creates the shipment.

**User:**
> Sim, gera a etiqueta pelo Melhor Envio. Usa a opcao mais barata.

**Agent calls:** `calculate_shipping`

```json
{
  "from_postal_code": "01310100",
  "to_postal_code": "30130000",
  "package": {
    "height": 5,
    "width": 30,
    "length": 40,
    "weight": 0.3
  }
}
```

**Response:**

```json
{
  "quotes": [
    {
      "id": "quote_pac_001",
      "service": "PAC",
      "carrier": "Correios",
      "price": 18.90,
      "delivery_days": 7,
      "delivery_range": { "min": 5, "max": 7 }
    },
    {
      "id": "quote_sedex_001",
      "service": "SEDEX",
      "carrier": "Correios",
      "price": 32.50,
      "delivery_days": 3,
      "delivery_range": { "min": 2, "max": 3 }
    }
  ]
}
```

**Agent calls:** `create_shipment`

```json
{
  "quote_id": "quote_pac_001",
  "from": {
    "name": "Loja Exemplo LTDA",
    "address": "Av Paulista, 1000",
    "city": "Sao Paulo",
    "state": "SP",
    "postal_code": "01310100",
    "document": "12345678000190"
  },
  "to": {
    "name": "Maria Silva",
    "address": "Rua da Bahia, 500",
    "city": "Belo Horizonte",
    "state": "MG",
    "postal_code": "30130000",
    "document": "12345678909"
  },
  "invoice": {
    "key": "35260412345678000190550010000015231234567890"
  }
}
```

**Response:**

```json
{
  "id": "shipment_789",
  "tracking_code": "BR123456789CS",
  "label_url": "https://api.melhorenvio.com.br/shipments/shipment_789/label.pdf",
  "service": "PAC",
  "price": 18.90,
  "estimated_delivery": "2026-04-10"
}
```

**Agent responds:**
> Etiqueta gerada via PAC (Correios) por R$ 18,90. Rastreio: BR123456789CS. Previsao de entrega: 10/04/2026. Envio o rastreio para a Maria?

---

## Step 5: Send Tracking via WhatsApp (Z-API)

**User:**
> Sim, avisa a Maria com o codigo de rastreio.

**Agent calls:** `send_text_message`

```json
{
  "phone": "5531999887766",
  "message": "Oi Maria! Seu pedido #4521 foi enviado!\n\nRastreio: BR123456789CS\nTransportadora: Correios (PAC)\nPrevisao de entrega: 10/04/2026\n\nAcompanhe em: https://www.correios.com.br/rastreamento\n\nObrigado pela compra!"
}
```

**Response:**

```json
{
  "message_id": "msg_zapi_790",
  "status": "sent"
}
```

**Agent responds:**
> Mensagem de rastreio enviada para a Maria no WhatsApp. Registro o pedido no Omie?

---

## Step 6: Record in ERP (Omie)

The agent creates the order in Omie ERP for accounting and stock control.

**User:**
> Sim, registra no Omie.

**Agent calls:** `create_order`

```json
{
  "cabecalho": {
    "codigo_pedido_integracao": "PED-4521",
    "data_previsao": "2026-04-03",
    "etapa": "60",
    "codigo_cliente_integracao": "CLI-MARIA-12345678909"
  },
  "itens": [
    {
      "codigo_produto_integracao": "PROD-CAM-001",
      "descricao": "Camiseta Oficial - Tamanho M",
      "quantidade": 1,
      "valor_unitario": 149.90,
      "cfop": "6102"
    }
  ],
  "informacoes_adicionais": {
    "nota_fiscal": "1523",
    "rastreamento": "BR123456789CS",
    "gateway_pagamento": "Zoop",
    "transaction_id": "txn_abc123def456"
  }
}
```

**Response:**

```json
{
  "codigo_pedido": 98765,
  "codigo_pedido_integracao": "PED-4521",
  "codigo_status": "60",
  "descricao_status": "Faturado"
}
```

**Agent responds:**
> Pedido #4521 registrado no Omie como faturado (codigo 98765). Quer que eu verifique o saldo na Stark Bank?

---

## Step 7: Reconcile Balance (Stark Bank)

At the end of the day, the agent checks the bank balance to reconcile.

**User:**
> Sim, como esta o saldo hoje?

**Agent calls:** `get_balance`

```json
{}
```

**Response:**

```json
{
  "amount": 45230.50,
  "currency": "BRL",
  "updated_at": "2026-04-03T18:30:00Z"
}
```

**Agent calls:** `list_transactions`

```json
{
  "after": "2026-04-03T00:00:00Z",
  "before": "2026-04-03T23:59:59Z"
}
```

**Response:**

```json
{
  "transactions": [
    {
      "id": "stk_txn_001",
      "amount": 149.90,
      "type": "credit",
      "description": "Pix recebido - txn_abc123def456",
      "created_at": "2026-04-03T14:22:00Z"
    },
    {
      "id": "stk_txn_002",
      "amount": -18.90,
      "type": "debit",
      "description": "Melhor Envio - Frete PAC",
      "created_at": "2026-04-03T15:05:00Z"
    }
  ]
}
```

**Agent responds:**
> Saldo atual: R$ 45.230,50. Hoje entraram R$ 149,90 (Pix da Maria) e sairam R$ 18,90 (frete PAC). Lucro liquido nessa venda: R$ 131,00.

---

## Summary

| Step | MCP Server | Tool | Result |
|------|-----------|------|--------|
| 1 | Zoop | `create_transaction` | Pix QR Code generated |
| 2 | Z-API | `send_image_message` | QR Code sent via WhatsApp |
| 3 | Nuvem Fiscal | `create_nfe` | NFe #1523 authorized |
| 4 | Melhor Envio | `calculate_shipping` + `create_shipment` | PAC label, R$ 18,90 |
| 5 | Z-API | `send_text_message` | Tracking sent via WhatsApp |
| 6 | Omie | `create_order` | Order recorded in ERP |
| 7 | Stark Bank | `get_balance` + `list_transactions` | Balance reconciled |

**Total cost of this order:**
- Product revenue: R$ 149,90
- Shipping cost: -R$ 18,90
- Payment gateway fee (~2.5%): -R$ 3,75
- **Net profit: ~R$ 127,25**

---

## Tips

- **Always use sandbox mode** for testing. Set `ZOOP_SANDBOX=true`, `MELHOR_ENVIO_SANDBOX=true`, etc.
- **Chain tools logically.** Payment must be confirmed before issuing NFe. NFe must be issued before generating a shipping label (the invoice key is required).
- **Store IDs across steps.** The transaction ID from Zoop, the NFe key from Nuvem Fiscal, and the tracking code from Melhor Envio are all needed in later steps.
- **Automate with webhooks.** In production, payment confirmation (Step 3) should be triggered by a webhook, not manual confirmation.
