# Cost Estimator

Which tools trigger paid operations and approximate costs.

## Free Tools (no cost)

- **BrasilAPI**: all tools (public API, no auth required)
- **Pix BCB**: all tools (public API, Central Bank open data)
- **Correios**: tracking tools (public endpoints)
- Most **list** and **get** tools across all servers (read operations)

## Paid Tools by Server

### Payments

| Server | Tool | Operation | Approx Cost |
|--------|------|-----------|-------------|
| Zoop | `create_transaction` | Charge customer (Pix) | 1.49%/txn |
| Zoop | `create_transaction` | Charge customer (credit card) | 2.49% + R$0.49/txn |
| Zoop | `create_transaction` | Charge customer (boleto) | R$2.90/boleto |
| Zoop | `create_transfer` | Payout to seller | R$3.50/transfer |
| Asaas | `create_payment` | Charge (Pix) | 0.99%/txn |
| Asaas | `create_payment` | Charge (boleto) | R$1.99/boleto |
| Asaas | `create_payment` | Charge (credit card) | 2.99% + R$0.49/txn |
| Asaas | `create_transfer` | Pix out | R$2.00/transfer |
| Pagar.me | `create_transaction` | Charge (credit card) | 2.99% + R$0.39/txn |
| Pagar.me | `create_transaction` | Charge (Pix) | 0.95%/txn |
| Pagar.me | `create_transaction` | Charge (boleto) | R$3.49/boleto |
| Iugu | `create_invoice` | Charge (Pix) | 0.99%/txn |
| Iugu | `create_invoice` | Charge (boleto) | R$2.50/boleto |
| Iugu | `create_invoice` | Charge (credit card) | 2.51% + R$0.31/txn |
| Ebanx | `create_payment` | Charge (cross-border) | 3.99-5.99%/txn |
| Efi (Gerencianet) | `create_charge` | Charge (Pix) | R$0.01/txn (promotional) |
| Efi (Gerencianet) | `create_charge` | Charge (boleto) | R$2.50/boleto |
| Vindi | `create_bill` | Subscription billing | 2.49%/txn or R$2.50/boleto |
| Stone | `create_payment` | Charge (credit card) | 1.67-3.19%/txn |
| Celcoin | `create_pix` | Pix transfer | R$0.07-0.50/txn |
| Cielo | `create_payment` | Charge (credit card) | 1.99-4.99%/txn |
| PagSeguro | `create_payment` | Charge (credit card) | 1.99-4.99%/txn |
| PagSeguro | `create_payment` | Charge (Pix) | 0.99%/txn |
| PagSeguro | `create_payment` | Charge (boleto) | R$2.99/boleto |

### Fiscal

| Server | Tool | Operation | Approx Cost |
|--------|------|-----------|-------------|
| Nuvem Fiscal | `create_nfe` | Issue NFe | ~R$0.10-0.50/note |
| Nuvem Fiscal | `create_nfse` | Issue NFSe | ~R$0.10-0.50/note |
| Focus NFe | `create_nfe` | Issue NFe | ~R$0.15/note |
| Focus NFe | `create_nfse` | Issue NFSe | ~R$0.15/note |
| Conta Azul | all write tools | Included in subscription | R$0 (plan-based) |

### Communication

| Server | Tool | Operation | Approx Cost |
|--------|------|-----------|-------------|
| Z-API | `send_text` | WhatsApp message | R$0.01-0.05/msg |
| Z-API | `send_image` | WhatsApp media | R$0.01-0.05/msg |
| Evolution API | `send_text` | WhatsApp message | Free (self-hosted) |
| Evolution API | `send_image` | WhatsApp media | Free (self-hosted) |
| Zenvia | `send_sms` | SMS message | R$0.05-0.10/SMS |
| Zenvia | `send_whatsapp` | WhatsApp (official) | R$0.15-0.80/msg |
| Take Blip | `send_message` | Multi-channel msg | R$0.03-0.50/msg (varies by channel) |
| RD Station | all write tools | CRM/marketing | R$0 (plan-based) |

### Logistics

| Server | Tool | Operation | Approx Cost |
|--------|------|-----------|-------------|
| Melhor Envio | `create_shipment` | Ship package | Varies by carrier |
| Melhor Envio | `calculate_shipping` | Quote (free) | R$0 |
| Correios | `calculate_price` | Quote (free) | R$0 |
| VTEX | all write tools | E-commerce ops | R$0 (plan-based) |

### ERP

| Server | Tool | Operation | Approx Cost |
|--------|------|-----------|-------------|
| Omie | all tools | ERP operations | R$0 (included in subscription) |
| Bling | all tools | ERP operations | R$0 (included in subscription) |
| Tiny | all tools | ERP operations | R$0 (included in subscription) |

### Banking / Open Finance

| Server | Tool | Operation | Approx Cost |
|--------|------|-----------|-------------|
| Stark Bank | `create_transfer` | Bank transfer | R$0 (Stark Bank account) |
| Stark Bank | `create_boleto` | Issue boleto | R$2.50/boleto |
| Open Finance | all tools | Data aggregation | R$0 (regulated API) |

### Crypto

| Server | Tool | Operation | Approx Cost |
|--------|------|-----------|-------------|
| Mercado Bitcoin | `create_order` | Buy/sell crypto | 0.30-0.70% maker/taker |
| Bitso | `create_order` | Buy/sell crypto | 0.10-0.60% maker/taker |
| Circle | `create_payout` | USDC payout | ~$0.01-1.00/txn |
| Unblockpay | `create_payment` | Crypto payment | 1.00-2.00%/txn |

## Tips

- Always use **sandbox mode** for testing — most payment servers support it
- Set **billing alerts** on payment provider dashboards
- Monitor **API usage** to catch unexpected charges
- Configure **agent budget limits** to cap spend per session
- Read operations (list, get, search) are always free across all servers
- Write operations (create, update, delete) may incur costs on payment/fiscal servers
