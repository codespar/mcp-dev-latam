#!/usr/bin/env node

/**
 * MCP Server for Cielo — Brazilian payment gateway (credit card, debit, boleto, recurrent).
 *
 * Tools:
 * - create_sale: Create a credit/debit card sale
 * - get_sale: Get sale details by PaymentId
 * - capture_sale: Capture a pre-authorized sale
 * - cancel_sale: Cancel/void a sale
 * - create_recurrent: Create a recurrent payment
 * - get_recurrent: Get recurrent payment details
 * - tokenize_card: Tokenize a credit card for future use
 * - create_boleto: Create a boleto payment
 * - create_pix: Create a Pix payment
 * - get_pix: Get Pix payment details by PaymentId
 * - create_debit: Create a debit card sale
 * - create_ewallet: Create a digital wallet payment (Google Pay, Samsung Pay)
 * - get_antifraud: Get anti-fraud analysis for a payment
 * - create_sale_with_token: Charge a previously tokenized card (CardToken)
 * - update_recurrent_amount: Update the amount of an existing recurrent payment
 * - update_recurrent_next_date: Update the next charge date of an existing recurrent payment
 * - deactivate_recurrent: Deactivate (pause) a recurrent payment
 * - reactivate_recurrent: Reactivate a paused recurrent payment
 * - create_payment_link: Create a Cielo Link de Pagamento
 * - get_payment_link: Get Cielo Link de Pagamento by id
 * - zero_auth: Zero-dollar authorization to validate a card without charging
 * - create_sale_with_3ds: Create a credit card sale using 3DS 2.0 authentication data
 *
 * Environment:
 *   CIELO_MERCHANT_ID — MerchantId from Cielo
 *   CIELO_MERCHANT_KEY — MerchantKey from Cielo
 *   CIELO_SANDBOX — "true" to use sandbox (default: false)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const MERCHANT_ID = process.env.CIELO_MERCHANT_ID || "";
const MERCHANT_KEY = process.env.CIELO_MERCHANT_KEY || "";
const BASE_URL = process.env.CIELO_SANDBOX === "true"
  ? "https://apisandbox.cieloecommerce.cielo.com.br/1"
  : "https://api.cieloecommerce.cielo.com.br/1";
const QUERY_URL = process.env.CIELO_SANDBOX === "true"
  ? "https://apiquerysandbox.cieloecommerce.cielo.com.br/1"
  : "https://apiquery.cieloecommerce.cielo.com.br/1";

async function cieloRequest(method: string, path: string, body?: unknown, useQueryUrl = false): Promise<unknown> {
  const baseUrl = useQueryUrl ? QUERY_URL : BASE_URL;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "MerchantId": MERCHANT_ID,
      "MerchantKey": MERCHANT_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cielo API ${res.status}: ${err}`);
  }
  return res.json();
}

const server = new Server(
  { name: "mcp-cielo", version: "0.2.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_sale",
      description: "Create a credit/debit card sale in Cielo",
      inputSchema: {
        type: "object",
        properties: {
          merchantOrderId: { type: "string", description: "Merchant order reference" },
          customerName: { type: "string", description: "Customer name" },
          amount: { type: "number", description: "Amount in cents (e.g., 15700 = R$157.00)" },
          cardNumber: { type: "string", description: "Credit card number" },
          holder: { type: "string", description: "Cardholder name" },
          expirationDate: { type: "string", description: "Expiration date (MM/YYYY)" },
          securityCode: { type: "string", description: "CVV" },
          brand: { type: "string", enum: ["Visa", "Master", "Elo", "Amex", "Hipercard"], description: "Card brand" },
          installments: { type: "number", description: "Number of installments (1 for full payment)" },
          capture: { type: "boolean", description: "Auto-capture (true for immediate capture)" },
        },
        required: ["merchantOrderId", "customerName", "amount", "cardNumber", "holder", "expirationDate", "securityCode", "brand"],
      },
    },
    {
      name: "get_sale",
      description: "Get sale details by PaymentId",
      inputSchema: {
        type: "object",
        properties: {
          paymentId: { type: "string", description: "Payment ID (GUID)" },
        },
        required: ["paymentId"],
      },
    },
    {
      name: "capture_sale",
      description: "Capture a pre-authorized sale",
      inputSchema: {
        type: "object",
        properties: {
          paymentId: { type: "string", description: "Payment ID (GUID)" },
          amount: { type: "number", description: "Amount to capture in cents (optional, defaults to full amount)" },
        },
        required: ["paymentId"],
      },
    },
    {
      name: "cancel_sale",
      description: "Cancel/void a sale (full or partial)",
      inputSchema: {
        type: "object",
        properties: {
          paymentId: { type: "string", description: "Payment ID (GUID)" },
          amount: { type: "number", description: "Amount to cancel in cents (optional, defaults to full amount)" },
        },
        required: ["paymentId"],
      },
    },
    {
      name: "create_recurrent",
      description: "Create a recurrent (recurring) credit card payment",
      inputSchema: {
        type: "object",
        properties: {
          merchantOrderId: { type: "string", description: "Merchant order reference" },
          customerName: { type: "string", description: "Customer name" },
          amount: { type: "number", description: "Amount in cents" },
          cardNumber: { type: "string", description: "Credit card number" },
          holder: { type: "string", description: "Cardholder name" },
          expirationDate: { type: "string", description: "Expiration date (MM/YYYY)" },
          securityCode: { type: "string", description: "CVV" },
          brand: { type: "string", description: "Card brand" },
          interval: { type: "string", enum: ["Monthly", "Bimonthly", "Quarterly", "SemiAnnual", "Annual"], description: "Recurrence interval" },
          endDate: { type: "string", description: "End date (YYYY-MM-DD, optional)" },
        },
        required: ["merchantOrderId", "customerName", "amount", "cardNumber", "holder", "expirationDate", "securityCode", "brand", "interval"],
      },
    },
    {
      name: "get_recurrent",
      description: "Get recurrent payment details",
      inputSchema: {
        type: "object",
        properties: {
          recurrentPaymentId: { type: "string", description: "Recurrent Payment ID (GUID)" },
        },
        required: ["recurrentPaymentId"],
      },
    },
    {
      name: "tokenize_card",
      description: "Tokenize a credit card for future use",
      inputSchema: {
        type: "object",
        properties: {
          customerName: { type: "string", description: "Customer name" },
          cardNumber: { type: "string", description: "Credit card number" },
          holder: { type: "string", description: "Cardholder name" },
          expirationDate: { type: "string", description: "Expiration date (MM/YYYY)" },
          brand: { type: "string", description: "Card brand" },
        },
        required: ["customerName", "cardNumber", "holder", "expirationDate", "brand"],
      },
    },
    {
      name: "create_boleto",
      description: "Create a boleto payment in Cielo",
      inputSchema: {
        type: "object",
        properties: {
          merchantOrderId: { type: "string", description: "Merchant order reference" },
          customerName: { type: "string", description: "Customer name" },
          customerIdentity: { type: "string", description: "CPF or CNPJ" },
          amount: { type: "number", description: "Amount in cents" },
          expirationDate: { type: "string", description: "Boleto expiration date (YYYY-MM-DD)" },
          instructions: { type: "string", description: "Boleto instructions text" },
          provider: { type: "string", enum: ["Bradesco2", "BancoDoBrasil2", "ItauShopline", "Santander2", "Caixa2"], description: "Boleto provider/bank" },
        },
        required: ["merchantOrderId", "customerName", "amount", "expirationDate", "provider"],
      },
    },
    {
      name: "create_pix",
      description: "Create a Pix payment in Cielo (generates QR code)",
      inputSchema: {
        type: "object",
        properties: {
          merchantOrderId: { type: "string", description: "Merchant order reference" },
          customerName: { type: "string", description: "Customer name" },
          customerIdentity: { type: "string", description: "CPF or CNPJ" },
          amount: { type: "number", description: "Amount in cents (e.g., 15700 = R$157.00)" },
          expirationDate: { type: "string", description: "QR code expiration (ISO 8601, e.g. 2025-12-31T23:59:59)" },
        },
        required: ["merchantOrderId", "customerName", "amount"],
      },
    },
    {
      name: "get_pix",
      description: "Get Pix payment details and QR code by PaymentId",
      inputSchema: {
        type: "object",
        properties: {
          paymentId: { type: "string", description: "Payment ID (GUID)" },
        },
        required: ["paymentId"],
      },
    },
    {
      name: "create_debit",
      description: "Create a debit card sale in Cielo (requires 3DS authentication)",
      inputSchema: {
        type: "object",
        properties: {
          merchantOrderId: { type: "string", description: "Merchant order reference" },
          customerName: { type: "string", description: "Customer name" },
          amount: { type: "number", description: "Amount in cents" },
          cardNumber: { type: "string", description: "Debit card number" },
          holder: { type: "string", description: "Cardholder name" },
          expirationDate: { type: "string", description: "Expiration date (MM/YYYY)" },
          securityCode: { type: "string", description: "CVV" },
          brand: { type: "string", enum: ["Visa", "Master", "Elo"], description: "Card brand" },
          returnUrl: { type: "string", description: "URL to redirect after 3DS authentication" },
        },
        required: ["merchantOrderId", "customerName", "amount", "cardNumber", "holder", "expirationDate", "securityCode", "brand", "returnUrl"],
      },
    },
    {
      name: "create_ewallet",
      description: "Create a digital wallet payment (Google Pay, Samsung Pay, Apple Pay)",
      inputSchema: {
        type: "object",
        properties: {
          merchantOrderId: { type: "string", description: "Merchant order reference" },
          customerName: { type: "string", description: "Customer name" },
          amount: { type: "number", description: "Amount in cents" },
          walletType: { type: "string", enum: ["GooglePay", "SamsungPay", "ApplePay"], description: "Digital wallet type" },
          walletKey: { type: "string", description: "Wallet token/key from wallet provider" },
        },
        required: ["merchantOrderId", "customerName", "amount", "walletType", "walletKey"],
      },
    },
    {
      name: "get_antifraud",
      description: "Get anti-fraud analysis details for a payment",
      inputSchema: {
        type: "object",
        properties: {
          paymentId: { type: "string", description: "Payment ID (GUID)" },
        },
        required: ["paymentId"],
      },
    },
    {
      name: "create_sale_with_token",
      description: "Create a credit card sale using a previously stored CardToken (avoids re-entering card data)",
      inputSchema: {
        type: "object",
        properties: {
          merchantOrderId: { type: "string", description: "Merchant order reference" },
          customerName: { type: "string", description: "Customer name" },
          amount: { type: "number", description: "Amount in cents" },
          cardToken: { type: "string", description: "CardToken returned by tokenize_card" },
          securityCode: { type: "string", description: "CVV (optional, recommended)" },
          brand: { type: "string", description: "Card brand (Visa, Master, Elo, Amex, Hipercard)" },
          installments: { type: "number", description: "Number of installments (default 1)" },
          capture: { type: "boolean", description: "Auto-capture (default false)" },
        },
        required: ["merchantOrderId", "customerName", "amount", "cardToken", "brand"],
      },
    },
    {
      name: "update_recurrent_amount",
      description: "Update the amount of an existing recurrent payment",
      inputSchema: {
        type: "object",
        properties: {
          recurrentPaymentId: { type: "string", description: "Recurrent Payment ID (GUID)" },
          amount: { type: "number", description: "New amount in cents" },
        },
        required: ["recurrentPaymentId", "amount"],
      },
    },
    {
      name: "update_recurrent_next_date",
      description: "Update the next charge date of an existing recurrent payment",
      inputSchema: {
        type: "object",
        properties: {
          recurrentPaymentId: { type: "string", description: "Recurrent Payment ID (GUID)" },
          nextPaymentDate: { type: "string", description: "Next charge date (YYYY-MM-DD)" },
        },
        required: ["recurrentPaymentId", "nextPaymentDate"],
      },
    },
    {
      name: "deactivate_recurrent",
      description: "Deactivate (pause) a recurrent payment so it stops charging",
      inputSchema: {
        type: "object",
        properties: {
          recurrentPaymentId: { type: "string", description: "Recurrent Payment ID (GUID)" },
        },
        required: ["recurrentPaymentId"],
      },
    },
    {
      name: "reactivate_recurrent",
      description: "Reactivate a previously deactivated recurrent payment",
      inputSchema: {
        type: "object",
        properties: {
          recurrentPaymentId: { type: "string", description: "Recurrent Payment ID (GUID)" },
        },
        required: ["recurrentPaymentId"],
      },
    },
    {
      name: "create_payment_link",
      description: "Create a Cielo Link de Pagamento (shareable checkout URL)",
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["Digital", "Physical", "Service", "Asaas", "Recurrent"], description: "Product type" },
          name: { type: "string", description: "Product/service name" },
          description: { type: "string", description: "Product/service description" },
          price: { type: "number", description: "Unit price in cents" },
          quantity: { type: "number", description: "Quantity available (optional)" },
          maxNumberOfInstallments: { type: "number", description: "Max installments allowed (1-12)" },
          shipping: {
            type: "object",
            description: "Shipping options (for Physical type)",
            properties: {
              type: { type: "string", enum: ["Fixed", "WithoutShipping"] },
              price: { type: "number" },
              name: { type: "string" },
            },
          },
          weight: { type: "number", description: "Weight in grams (for Physical type)" },
        },
        required: ["type", "name", "price"],
      },
    },
    {
      name: "get_payment_link",
      description: "Get a Cielo Link de Pagamento by its id",
      inputSchema: {
        type: "object",
        properties: {
          paymentLinkId: { type: "string", description: "Payment link identifier" },
        },
        required: ["paymentLinkId"],
      },
    },
    {
      name: "zero_auth",
      description: "Zero-dollar authorization to validate a card without charging (card or CardToken)",
      inputSchema: {
        type: "object",
        properties: {
          cardType: { type: "string", enum: ["CreditCard", "DebitCard"], description: "Card type" },
          cardNumber: { type: "string", description: "Card number (omit if using cardToken)" },
          holder: { type: "string", description: "Cardholder name (omit if using cardToken)" },
          expirationDate: { type: "string", description: "Expiration date MM/YYYY (omit if using cardToken)" },
          securityCode: { type: "string", description: "CVV" },
          brand: { type: "string", description: "Card brand" },
          cardToken: { type: "string", description: "CardToken (alternative to full card data)" },
          saveCard: { type: "boolean", description: "Tokenize card on success (default false)" },
        },
        required: ["securityCode", "brand"],
      },
    },
    {
      name: "create_sale_with_3ds",
      description: "Create a credit card sale using 3DS 2.0 authentication data (from 3DS flow)",
      inputSchema: {
        type: "object",
        properties: {
          merchantOrderId: { type: "string", description: "Merchant order reference" },
          customerName: { type: "string", description: "Customer name" },
          amount: { type: "number", description: "Amount in cents" },
          cardNumber: { type: "string", description: "Credit card number" },
          holder: { type: "string", description: "Cardholder name" },
          expirationDate: { type: "string", description: "Expiration date (MM/YYYY)" },
          securityCode: { type: "string", description: "CVV" },
          brand: { type: "string", description: "Card brand" },
          installments: { type: "number", description: "Number of installments (default 1)" },
          capture: { type: "boolean", description: "Auto-capture (default false)" },
          cavv: { type: "string", description: "3DS CAVV value" },
          xid: { type: "string", description: "3DS XID value" },
          eci: { type: "string", description: "3DS ECI value" },
          version: { type: "string", description: "3DS version (e.g., '2')" },
          referenceId: { type: "string", description: "3DS reference id (dsTransactionId)" },
        },
        required: ["merchantOrderId", "customerName", "amount", "cardNumber", "holder", "expirationDate", "securityCode", "brand", "cavv", "eci"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = rawArgs as Record<string, unknown> | undefined;

  try {
    switch (name) {
      case "create_sale": {
        const payload = {
          MerchantOrderId: args?.merchantOrderId,
          Customer: { Name: args?.customerName },
          Payment: {
            Type: "CreditCard",
            Amount: args?.amount,
            Installments: args?.installments || 1,
            Capture: args?.capture ?? false,
            CreditCard: {
              CardNumber: args?.cardNumber,
              Holder: args?.holder,
              ExpirationDate: args?.expirationDate,
              SecurityCode: args?.securityCode,
              Brand: args?.brand,
            },
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("POST", "/sales", payload), null, 2) }] };
      }
      case "get_sale":
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("GET", `/sales/${args?.paymentId}`, undefined, true), null, 2) }] };
      case "capture_sale": {
        const capturePath = args?.amount
          ? `/sales/${args.paymentId}/capture?amount=${args.amount}`
          : `/sales/${args?.paymentId}/capture`;
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("PUT", capturePath), null, 2) }] };
      }
      case "cancel_sale": {
        const cancelPath = args?.amount
          ? `/sales/${args.paymentId}/void?amount=${args.amount}`
          : `/sales/${args?.paymentId}/void`;
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("PUT", cancelPath), null, 2) }] };
      }
      case "create_recurrent": {
        const payload = {
          MerchantOrderId: args?.merchantOrderId,
          Customer: { Name: args?.customerName },
          Payment: {
            Type: "CreditCard",
            Amount: args?.amount,
            Installments: 1,
            RecurrentPayment: {
              AuthorizeNow: true,
              Interval: args?.interval,
              EndDate: args?.endDate,
            },
            CreditCard: {
              CardNumber: args?.cardNumber,
              Holder: args?.holder,
              ExpirationDate: args?.expirationDate,
              SecurityCode: args?.securityCode,
              Brand: args?.brand,
            },
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("POST", "/sales", payload), null, 2) }] };
      }
      case "get_recurrent":
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("GET", `/RecurrentPayment/${args?.recurrentPaymentId}`, undefined, true), null, 2) }] };
      case "tokenize_card": {
        const payload = {
          MerchantOrderId: "tokenize",
          Customer: { Name: args?.customerName },
          Payment: {
            Type: "CreditCard",
            Amount: 0,
            CreditCard: {
              CardNumber: args?.cardNumber,
              Holder: args?.holder,
              ExpirationDate: args?.expirationDate,
              Brand: args?.brand,
              SaveCard: true,
            },
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("POST", "/sales", payload), null, 2) }] };
      }
      case "create_boleto": {
        const payload = {
          MerchantOrderId: args?.merchantOrderId,
          Customer: {
            Name: args?.customerName,
            Identity: args?.customerIdentity,
          },
          Payment: {
            Type: "Boleto",
            Amount: args?.amount,
            Provider: args?.provider,
            ExpirationDate: args?.expirationDate,
            Instructions: args?.instructions,
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("POST", "/sales", payload), null, 2) }] };
      }
      case "create_pix": {
        const payload = {
          MerchantOrderId: args?.merchantOrderId,
          Customer: {
            Name: args?.customerName,
            Identity: args?.customerIdentity,
          },
          Payment: {
            Type: "Pix",
            Amount: args?.amount,
            ...(args?.expirationDate ? { QrCodeExpiration: args.expirationDate } : {}),
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("POST", "/sales", payload), null, 2) }] };
      }
      case "get_pix":
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("GET", `/sales/${args?.paymentId}`, undefined, true), null, 2) }] };
      case "create_debit": {
        const payload = {
          MerchantOrderId: args?.merchantOrderId,
          Customer: { Name: args?.customerName },
          Payment: {
            Type: "DebitCard",
            Amount: args?.amount,
            Authenticate: true,
            ReturnUrl: args?.returnUrl,
            DebitCard: {
              CardNumber: args?.cardNumber,
              Holder: args?.holder,
              ExpirationDate: args?.expirationDate,
              SecurityCode: args?.securityCode,
              Brand: args?.brand,
            },
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("POST", "/sales", payload), null, 2) }] };
      }
      case "create_ewallet": {
        const payload = {
          MerchantOrderId: args?.merchantOrderId,
          Customer: { Name: args?.customerName },
          Payment: {
            Type: "CreditCard",
            Amount: args?.amount,
            Wallet: {
              Type: args?.walletType,
              WalletKey: args?.walletKey,
            },
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("POST", "/sales", payload), null, 2) }] };
      }
      case "get_antifraud":
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("GET", `/sales/${args?.paymentId}/antifraud`, undefined, true), null, 2) }] };
      case "create_sale_with_token": {
        const payload = {
          MerchantOrderId: args?.merchantOrderId,
          Customer: { Name: args?.customerName },
          Payment: {
            Type: "CreditCard",
            Amount: args?.amount,
            Installments: args?.installments || 1,
            Capture: args?.capture ?? false,
            CreditCard: {
              CardToken: args?.cardToken,
              ...(args?.securityCode ? { SecurityCode: args.securityCode } : {}),
              Brand: args?.brand,
            },
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("POST", "/sales", payload), null, 2) }] };
      }
      case "update_recurrent_amount":
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("PUT", `/RecurrentPayment/${args?.recurrentPaymentId}/Amount`, args?.amount), null, 2) }] };
      case "update_recurrent_next_date":
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("PUT", `/RecurrentPayment/${args?.recurrentPaymentId}/NextPaymentDate`, args?.nextPaymentDate), null, 2) }] };
      case "deactivate_recurrent":
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("PUT", `/RecurrentPayment/${args?.recurrentPaymentId}/Deactivate`), null, 2) }] };
      case "reactivate_recurrent":
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("PUT", `/RecurrentPayment/${args?.recurrentPaymentId}/Reactivate`), null, 2) }] };
      case "create_payment_link": {
        const payload: Record<string, unknown> = {
          Type: args?.type,
          Name: args?.name,
          Price: args?.amount ?? args?.price,
        };
        if (args?.description) payload.Description = args.description;
        if (args?.quantity !== undefined) payload.Quantity = args.quantity;
        if (args?.maxNumberOfInstallments !== undefined) payload.MaxNumberOfInstallments = args.maxNumberOfInstallments;
        if (args?.weight !== undefined) payload.Weight = args.weight;
        if (args?.shipping) payload.Shipping = args.shipping;
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("POST", "/products", payload), null, 2) }] };
      }
      case "get_payment_link":
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("GET", `/products/${args?.paymentLinkId}`, undefined, true), null, 2) }] };
      case "zero_auth": {
        const card: Record<string, unknown> = {
          SecurityCode: args?.securityCode,
          Brand: args?.brand,
          ...(args?.saveCard ? { SaveCard: true } : {}),
        };
        if (args?.cardToken) {
          card.CardToken = args.cardToken;
        } else {
          card.CardNumber = args?.cardNumber;
          card.Holder = args?.holder;
          card.ExpirationDate = args?.expirationDate;
        }
        const payload = {
          CardType: args?.cardType || "CreditCard",
          ...card,
        };
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("POST", "/zeroauth", payload), null, 2) }] };
      }
      case "create_sale_with_3ds": {
        const payload = {
          MerchantOrderId: args?.merchantOrderId,
          Customer: { Name: args?.customerName },
          Payment: {
            Type: "CreditCard",
            Amount: args?.amount,
            Installments: args?.installments || 1,
            Capture: args?.capture ?? false,
            CreditCard: {
              CardNumber: args?.cardNumber,
              Holder: args?.holder,
              ExpirationDate: args?.expirationDate,
              SecurityCode: args?.securityCode,
              Brand: args?.brand,
            },
            ExternalAuthentication: {
              Cavv: args?.cavv,
              Xid: args?.xid,
              Eci: args?.eci,
              Version: args?.version,
              ReferenceId: args?.referenceId,
            },
          },
        };
        return { content: [{ type: "text", text: JSON.stringify(await cieloRequest("POST", "/sales", payload), null, 2) }] };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main() {
  if (process.argv.includes("--http") || process.env.MCP_HTTP === "true") {
    const { default: express } = await import("express");
    const { randomUUID } = await import("node:crypto");
    const app = express();
    app.use(express.json());
    const transports = new Map<string, StreamableHTTPServerTransport>();
    app.get("/health", (_req: any, res: any) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: any, res: any) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req, res, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-cielo", version: "0.2.1" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
        await t.handleRequest(req, res, req.body); return;
      }
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
    });
    app.get("/mcp", async (req: any, res: any) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req, res); else res.status(400).send("Invalid session"); });
    app.delete("/mcp", async (req: any, res: any) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req, res); else res.status(400).send("Invalid session"); });
    const port = Number(process.env.MCP_PORT) || 3000;
    app.listen(port, () => { console.error(`MCP HTTP server on http://localhost:${port}/mcp`); });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch(console.error);
