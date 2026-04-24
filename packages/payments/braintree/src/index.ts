#!/usr/bin/env node

/**
 * MCP Server for Braintree — PayPal-owned global payment processor.
 *
 * Target customer: LatAm SaaS selling to US/EU buyers who already hold a
 * Braintree merchant account. Braintree's modern API is GraphQL — this server
 * wraps the most-used operations (authorize / charge / capture / submit-for-
 * settlement / refund / void, vault management, customer CRUD, disputes,
 * verifications, merchant accounts, client token minting).
 *
 * Tools (22):
 *   authorize_transaction        — authorizePaymentMethod (reserve funds)
 *   charge_transaction           — chargePaymentMethod (authorize + capture)
 *   capture_transaction          — captureTransaction (capture prior auth)
 *   submit_for_settlement        — submitTransactionForSettlement
 *   refund_transaction           — refundTransaction (refund settled)
 *   void_transaction             — reverseTransaction (void unsettled)
 *   vault_payment_method         — vaultPaymentMethod (permanently store token)
 *   update_payment_method        — updatePaymentMethod (vaulted token metadata)
 *   delete_payment_method        — deletePaymentMethodFromVault
 *   verify_payment_method        — verifyPaymentMethod (credit card verification)
 *   create_customer              — createCustomer
 *   update_customer              — updateCustomer
 *   delete_customer              — deleteCustomer
 *   find_customer                — search.customers (by email / id filters)
 *   get_transaction              — search.transactions (by id)
 *   search_transactions          — search.transactions (filters: status, date, customer)
 *   get_customer                 — node(id:) on Customer
 *   find_dispute                 — node(id:) on Dispute
 *   accept_dispute               — acceptDispute
 *   finalize_dispute             — finalizeDispute
 *   find_merchant_account        — node(id:) on MerchantAccount
 *   create_client_token          — createClientToken (for client-side tokenization)
 *
 * Authentication
 *   HTTP Basic auth with PUBLIC_KEY:PRIVATE_KEY (base64-encoded). Every request
 *   also carries a `Braintree-Version: YYYY-MM-DD` header — defaults to
 *   2019-01-01, override via BRAINTREE_API_VERSION.
 *
 * Environment
 *   BRAINTREE_MERCHANT_ID   merchant id
 *   BRAINTREE_PUBLIC_KEY    public API key (Basic auth user)
 *   BRAINTREE_PRIVATE_KEY   private API key (Basic auth password, secret)
 *   BRAINTREE_ENV           'sandbox' (default) or 'production'
 *   BRAINTREE_API_VERSION   Braintree-Version header (default '2019-01-01')
 *
 * Docs: https://graphql.braintreepayments.com (redirects to
 *       https://developer.paypal.com/braintree/graphql)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const MERCHANT_ID = process.env.BRAINTREE_MERCHANT_ID || "";
const PUBLIC_KEY = process.env.BRAINTREE_PUBLIC_KEY || "";
const PRIVATE_KEY = process.env.BRAINTREE_PRIVATE_KEY || "";
const ENV = (process.env.BRAINTREE_ENV || "sandbox").toLowerCase();
const API_VERSION = process.env.BRAINTREE_API_VERSION || "2019-01-01";
const ENDPOINT =
  ENV === "production"
    ? "https://payments.braintree-api.com/graphql"
    : "https://payments.sandbox.braintree-api.com/graphql";

void MERCHANT_ID; // not sent as header, included for parity with Control Panel docs & future scoping

async function braintreeRequest(
  query: string,
  variables?: Record<string, unknown>,
): Promise<unknown> {
  const basic = Buffer.from(`${PUBLIC_KEY}:${PRIVATE_KEY}`).toString("base64");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${basic}`,
      "Braintree-Version": API_VERSION,
    },
    body: JSON.stringify({ query, variables: variables ?? {} }),
  });
  if (!res.ok) {
    throw new Error(`Braintree API ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { errors?: unknown; data?: unknown };
  // Braintree returns HTTP 200 even on GraphQL errors — surface them explicitly.
  if (data.errors) {
    throw new Error(`Braintree GraphQL error: ${JSON.stringify(data.errors)}`);
  }
  return data;
}

const server = new Server(
  { name: "mcp-braintree", version: "0.2.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "authorize_transaction",
      description:
        "Authorize a transaction (reserve funds without capturing) via Braintree GraphQL authorizePaymentMethod. Pass a paymentMethodId obtained from client-side tokenization (Drop-in / Hosted Fields / SDK nonce). Capture later with capture_transaction.",
      inputSchema: {
        type: "object",
        properties: {
          paymentMethodId: {
            type: "string",
            description: "Tokenized payment method id or nonce (from client SDK).",
          },
          amount: {
            type: "string",
            description: "Amount as a decimal string (e.g. '10.50'). Braintree amounts are strings.",
          },
          orderId: { type: "string", description: "Merchant-side order reference." },
          merchantAccountId: {
            type: "string",
            description: "Optional merchant account id (for multi-currency / multi-account merchants).",
          },
          transaction: {
            type: "object",
            description:
              "Additional TransactionInput fields (customerDetails, billingAddress, shippingAddress, descriptor, customFields, riskData, lineItems, etc). Merged with amount/orderId/merchantAccountId.",
          },
        },
        required: ["paymentMethodId", "amount"],
      },
    },
    {
      name: "charge_transaction",
      description:
        "Authorize and capture a transaction atomically via Braintree GraphQL chargePaymentMethod. Use for one-step sales. For auth-now-capture-later split, use authorize_transaction + capture_transaction.",
      inputSchema: {
        type: "object",
        properties: {
          paymentMethodId: {
            type: "string",
            description: "Tokenized payment method id or nonce.",
          },
          amount: { type: "string", description: "Amount as decimal string." },
          orderId: { type: "string", description: "Merchant-side order reference." },
          merchantAccountId: { type: "string", description: "Optional merchant account id." },
          transaction: {
            type: "object",
            description:
              "Additional TransactionInput fields (customerDetails, billingAddress, shippingAddress, descriptor, customFields, riskData, lineItems, etc).",
          },
        },
        required: ["paymentMethodId", "amount"],
      },
    },
    {
      name: "capture_transaction",
      description:
        "Capture a previously authorized transaction via captureTransaction. Amount defaults to full authorized amount when omitted (partial captures allowed up to the authorized total).",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string", description: "Braintree transaction id from a prior authorization." },
          amount: {
            type: "string",
            description: "Optional capture amount as decimal string. Omit for full capture.",
          },
        },
        required: ["transactionId"],
      },
    },
    {
      name: "refund_transaction",
      description:
        "Refund a settled transaction via refundTransaction. Amount defaults to the full settled amount when omitted. For partial refunds, pass a smaller amount.",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string", description: "Settled Braintree transaction id." },
          amount: {
            type: "string",
            description: "Optional refund amount as decimal string. Omit for full refund.",
          },
          orderId: { type: "string", description: "Optional order id for the refund record." },
        },
        required: ["transactionId"],
      },
    },
    {
      name: "void_transaction",
      description:
        "Void an unsettled transaction (reverse the authorization) via reverseTransaction. Use when funds are authorized but not yet captured — for captured/settled transactions use refund_transaction instead.",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string", description: "Unsettled Braintree transaction id." },
        },
        required: ["transactionId"],
      },
    },
    {
      name: "vault_payment_method",
      description:
        "Permanently store a tokenized payment method in the Braintree vault via vaultPaymentMethod. The input paymentMethodId must be a single-use nonce; the mutation returns a permanent vaulted payment method id that can be reused for future charges.",
      inputSchema: {
        type: "object",
        properties: {
          paymentMethodId: { type: "string", description: "Single-use nonce from client-side tokenization." },
          customerId: {
            type: "string",
            description: "Optional Braintree customer id to associate the vaulted method with.",
          },
          verify: {
            type: "boolean",
            description: "If true, Braintree runs a verification (zero-auth / $1 auth) before vaulting.",
          },
        },
        required: ["paymentMethodId"],
      },
    },
    {
      name: "delete_payment_method",
      description:
        "Delete a vaulted payment method via deletePaymentMethodFromVault. Irreversible — the token cannot be used for future charges after deletion.",
      inputSchema: {
        type: "object",
        properties: {
          paymentMethodId: { type: "string", description: "Vaulted payment method id." },
        },
        required: ["paymentMethodId"],
      },
    },
    {
      name: "create_customer",
      description:
        "Create a Braintree customer via createCustomer. Customers group multiple vaulted payment methods and transactions under one identity.",
      inputSchema: {
        type: "object",
        properties: {
          firstName: { type: "string" },
          lastName: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          company: { type: "string" },
          customer: {
            type: "object",
            description:
              "Additional CustomerInput fields (website, fax, customFields, etc). Merged with the scalar fields above.",
          },
        },
      },
    },
    {
      name: "update_customer",
      description:
        "Update an existing Braintree customer via updateCustomer. Only fields present in the request are updated.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "Braintree customer id to update." },
          firstName: { type: "string" },
          lastName: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          company: { type: "string" },
          customer: {
            type: "object",
            description: "Additional CustomerInput fields to merge into the update payload.",
          },
        },
        required: ["customerId"],
      },
    },
    {
      name: "get_transaction",
      description:
        "Fetch a transaction by id via the GraphQL search.transactions query. Returns id, status, amount, orderId, createdAt, and the associated payment method.",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string", description: "Braintree transaction id." },
        },
        required: ["transactionId"],
      },
    },
    {
      name: "get_customer",
      description:
        "Fetch a customer by id via the GraphQL node(id:) query. Returns customer scalars (id, firstName, lastName, email, company, phone).",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "Braintree customer id (GraphQL global id)." },
        },
        required: ["customerId"],
      },
    },
    {
      name: "submit_for_settlement",
      description:
        "Submit a previously authorized transaction for settlement via submitTransactionForSettlement. Unlike capture_transaction (captureTransaction), this marks the transaction for the next settlement batch and supports optional order id / descriptor overrides.",
      inputSchema: {
        type: "object",
        properties: {
          transactionId: { type: "string", description: "Braintree transaction id from a prior authorization." },
          amount: {
            type: "string",
            description: "Optional partial settlement amount as decimal string. Omit for full authorized amount.",
          },
          orderId: { type: "string", description: "Optional order id to record with the settlement." },
        },
        required: ["transactionId"],
      },
    },
    {
      name: "update_payment_method",
      description:
        "Update metadata on a vaulted payment method via updatePaymentMethod. Use to change billing address, cardholder name, expiration, or set-as-default flag without re-tokenizing.",
      inputSchema: {
        type: "object",
        properties: {
          paymentMethodId: { type: "string", description: "Vaulted payment method id." },
          paymentMethod: {
            type: "object",
            description:
              "UpdatePaymentMethodFieldsInput — e.g. { billingAddress, cardholderName, expirationMonth, expirationYear, usage }. Passed through verbatim.",
          },
        },
        required: ["paymentMethodId", "paymentMethod"],
      },
    },
    {
      name: "verify_payment_method",
      description:
        "Run a credit-card verification (zero-auth or $1 auth) on a tokenized payment method via verifyPaymentMethod. Returns a CreditCardVerification with status and processor response. Useful before vaulting or charging.",
      inputSchema: {
        type: "object",
        properties: {
          paymentMethodId: { type: "string", description: "Tokenized payment method id or nonce." },
          amount: {
            type: "string",
            description: "Optional verification amount as decimal string. Omit for a zero-auth / processor default.",
          },
          merchantAccountId: { type: "string", description: "Optional merchant account id." },
          riskCorrelationId: { type: "string", description: "Optional client-side risk correlation id." },
        },
        required: ["paymentMethodId"],
      },
    },
    {
      name: "delete_customer",
      description:
        "Delete a Braintree customer via deleteCustomer. Irreversible — also deletes any payment methods vaulted against the customer.",
      inputSchema: {
        type: "object",
        properties: {
          customerId: { type: "string", description: "Braintree customer id to delete." },
        },
        required: ["customerId"],
      },
    },
    {
      name: "find_customer",
      description:
        "Search for customers via the GraphQL search.customers query. Pass one of email / firstName / lastName / company to filter; returns matching customer nodes. Leave all blank to list the first page of customers.",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Filter by customer email (exact match)." },
          firstName: { type: "string", description: "Filter by first name (exact match)." },
          lastName: { type: "string", description: "Filter by last name (exact match)." },
          company: { type: "string", description: "Filter by company name (exact match)." },
        },
      },
    },
    {
      name: "search_transactions",
      description:
        "Search transactions via the GraphQL search.transactions query. Filter by status / customerId / orderId / createdAt range. Returns a page of transaction nodes with id, status, amount, orderId, createdAt.",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of TransactionStatus values (e.g. ['AUTHORIZED','SETTLED','VOIDED']).",
          },
          customerId: { type: "string", description: "Filter by customer id (exact match)." },
          orderId: { type: "string", description: "Filter by merchant-side order id (exact match)." },
          createdAfter: { type: "string", description: "ISO 8601 lower bound for createdAt (greaterThanOrEqualTo)." },
          createdBefore: { type: "string", description: "ISO 8601 upper bound for createdAt (lessThanOrEqualTo)." },
        },
      },
    },
    {
      name: "find_dispute",
      description:
        "Fetch a dispute by id via the GraphQL node(id:) query. Returns id, status, reason, amountDisputed, receivedDate, replyByDate.",
      inputSchema: {
        type: "object",
        properties: {
          disputeId: { type: "string", description: "Braintree dispute id (GraphQL global id)." },
        },
        required: ["disputeId"],
      },
    },
    {
      name: "accept_dispute",
      description:
        "Accept liability for a dispute via acceptDispute — the merchant concedes and the disputed amount is refunded to the buyer. Terminal action, cannot be undone.",
      inputSchema: {
        type: "object",
        properties: {
          disputeId: { type: "string", description: "Braintree dispute id to accept." },
        },
        required: ["disputeId"],
      },
    },
    {
      name: "finalize_dispute",
      description:
        "Finalize a dispute via finalizeDispute — submits previously added evidence to the card network for review. After finalization, no further evidence can be added.",
      inputSchema: {
        type: "object",
        properties: {
          disputeId: { type: "string", description: "Braintree dispute id to finalize." },
        },
        required: ["disputeId"],
      },
    },
    {
      name: "find_merchant_account",
      description:
        "Fetch a merchant account by id via the GraphQL node(id:) query. Returns id, status, currencyCode, and default flag — useful for multi-currency / multi-entity merchants.",
      inputSchema: {
        type: "object",
        properties: {
          merchantAccountId: { type: "string", description: "Braintree merchant account id (GraphQL global id)." },
        },
        required: ["merchantAccountId"],
      },
    },
    {
      name: "create_client_token",
      description:
        "Mint a Braintree client token via createClientToken for client-side tokenization (Drop-in, Hosted Fields, mobile SDKs). Pass a customerId to scope the token to a customer for vault-aware flows.",
      inputSchema: {
        type: "object",
        properties: {
          merchantAccountId: { type: "string", description: "Optional merchant account id." },
          customerId: {
            type: "string",
            description: "Optional customer id — required for client-side vaulted method lookup.",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "authorize_transaction": {
        const transaction = {
          ...((a.transaction as Record<string, unknown>) ?? {}),
          amount: a.amount,
          ...(a.orderId !== undefined ? { orderId: a.orderId } : {}),
          ...(a.merchantAccountId !== undefined ? { merchantAccountId: a.merchantAccountId } : {}),
        };
        const query = `mutation AuthorizePaymentMethod($input: AuthorizePaymentMethodInput!) {
          authorizePaymentMethod(input: $input) {
            transaction { id status amount { value currencyCode } orderId createdAt }
          }
        }`;
        const variables = {
          input: { paymentMethodId: a.paymentMethodId, transaction },
        };
        return {
          content: [
            { type: "text", text: JSON.stringify(await braintreeRequest(query, variables), null, 2) },
          ],
        };
      }
      case "charge_transaction": {
        const transaction = {
          ...((a.transaction as Record<string, unknown>) ?? {}),
          amount: a.amount,
          ...(a.orderId !== undefined ? { orderId: a.orderId } : {}),
          ...(a.merchantAccountId !== undefined ? { merchantAccountId: a.merchantAccountId } : {}),
        };
        const query = `mutation ChargePaymentMethod($input: ChargePaymentMethodInput!) {
          chargePaymentMethod(input: $input) {
            transaction { id status amount { value currencyCode } orderId createdAt }
          }
        }`;
        const variables = {
          input: { paymentMethodId: a.paymentMethodId, transaction },
        };
        return {
          content: [
            { type: "text", text: JSON.stringify(await braintreeRequest(query, variables), null, 2) },
          ],
        };
      }
      case "capture_transaction": {
        const query = `mutation CaptureTransaction($input: CaptureTransactionInput!) {
          captureTransaction(input: $input) {
            transaction { id status amount { value currencyCode } }
          }
        }`;
        const input: Record<string, unknown> = { transactionId: a.transactionId };
        if (a.amount !== undefined) input.amount = a.amount;
        return {
          content: [
            { type: "text", text: JSON.stringify(await braintreeRequest(query, { input }), null, 2) },
          ],
        };
      }
      case "refund_transaction": {
        const refund: Record<string, unknown> = {};
        if (a.amount !== undefined) refund.amount = a.amount;
        if (a.orderId !== undefined) refund.orderId = a.orderId;
        const query = `mutation RefundTransaction($input: RefundTransactionInput!) {
          refundTransaction(input: $input) {
            refund { id status amount { value currencyCode } }
          }
        }`;
        const input: Record<string, unknown> = { transactionId: a.transactionId };
        if (Object.keys(refund).length > 0) input.refund = refund;
        return {
          content: [
            { type: "text", text: JSON.stringify(await braintreeRequest(query, { input }), null, 2) },
          ],
        };
      }
      case "void_transaction": {
        const query = `mutation ReverseTransaction($input: ReverseTransactionInput!) {
          reverseTransaction(input: $input) {
            reversal {
              ... on Transaction { id status }
              ... on Refund { id status }
            }
          }
        }`;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await braintreeRequest(query, { input: { transactionId: a.transactionId } }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "vault_payment_method": {
        const query = `mutation VaultPaymentMethod($input: VaultPaymentMethodInput!) {
          vaultPaymentMethod(input: $input) {
            paymentMethod { id usage details { __typename } }
            verification { id status }
          }
        }`;
        const input: Record<string, unknown> = { paymentMethodId: a.paymentMethodId };
        if (a.customerId !== undefined) input.customerId = a.customerId;
        if (a.verify !== undefined) input.verify = a.verify;
        return {
          content: [
            { type: "text", text: JSON.stringify(await braintreeRequest(query, { input }), null, 2) },
          ],
        };
      }
      case "delete_payment_method": {
        const query = `mutation DeletePaymentMethodFromVault($input: DeletePaymentMethodFromVaultInput!) {
          deletePaymentMethodFromVault(input: $input) { clientMutationId }
        }`;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await braintreeRequest(query, {
                  input: { paymentMethodId: a.paymentMethodId },
                }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "create_customer": {
        const customer = {
          ...((a.customer as Record<string, unknown>) ?? {}),
          ...(a.firstName !== undefined ? { firstName: a.firstName } : {}),
          ...(a.lastName !== undefined ? { lastName: a.lastName } : {}),
          ...(a.email !== undefined ? { email: a.email } : {}),
          ...(a.phone !== undefined ? { phone: a.phone } : {}),
          ...(a.company !== undefined ? { company: a.company } : {}),
        };
        const query = `mutation CreateCustomer($input: CreateCustomerInput!) {
          createCustomer(input: $input) {
            customer { id firstName lastName email company phone }
          }
        }`;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(await braintreeRequest(query, { input: { customer } }), null, 2),
            },
          ],
        };
      }
      case "update_customer": {
        const customer = {
          ...((a.customer as Record<string, unknown>) ?? {}),
          ...(a.firstName !== undefined ? { firstName: a.firstName } : {}),
          ...(a.lastName !== undefined ? { lastName: a.lastName } : {}),
          ...(a.email !== undefined ? { email: a.email } : {}),
          ...(a.phone !== undefined ? { phone: a.phone } : {}),
          ...(a.company !== undefined ? { company: a.company } : {}),
        };
        const query = `mutation UpdateCustomer($input: UpdateCustomerInput!) {
          updateCustomer(input: $input) {
            customer { id firstName lastName email company phone }
          }
        }`;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await braintreeRequest(query, {
                  input: { customerId: a.customerId, customer },
                }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "get_transaction": {
        const query = `query GetTransaction($id: ID!) {
          search {
            transactions(input: { id: { is: $id } }) {
              edges {
                node {
                  id
                  status
                  amount { value currencyCode }
                  orderId
                  createdAt
                  paymentMethodSnapshot { __typename }
                }
              }
            }
          }
        }`;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await braintreeRequest(query, { id: a.transactionId }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "get_customer": {
        const query = `query GetCustomer($id: ID!) {
          node(id: $id) {
            ... on Customer { id firstName lastName email company phone }
          }
        }`;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await braintreeRequest(query, { id: a.customerId }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "submit_for_settlement": {
        const transaction: Record<string, unknown> = {};
        if (a.amount !== undefined) transaction.amount = a.amount;
        if (a.orderId !== undefined) transaction.orderId = a.orderId;
        const query = `mutation SubmitForSettlement($input: SubmitTransactionForSettlementInput!) {
          submitTransactionForSettlement(input: $input) {
            transaction { id status amount { value currencyCode } orderId }
          }
        }`;
        const input: Record<string, unknown> = { transactionId: a.transactionId };
        if (Object.keys(transaction).length > 0) input.transaction = transaction;
        return {
          content: [
            { type: "text", text: JSON.stringify(await braintreeRequest(query, { input }), null, 2) },
          ],
        };
      }
      case "update_payment_method": {
        const query = `mutation UpdatePaymentMethod($input: UpdatePaymentMethodInput!) {
          updatePaymentMethod(input: $input) {
            paymentMethod { id usage details { __typename } }
            verification { id status }
          }
        }`;
        const input = {
          paymentMethodId: a.paymentMethodId,
          paymentMethod: (a.paymentMethod as Record<string, unknown>) ?? {},
        };
        return {
          content: [
            { type: "text", text: JSON.stringify(await braintreeRequest(query, { input }), null, 2) },
          ],
        };
      }
      case "verify_payment_method": {
        const query = `mutation VerifyPaymentMethod($input: VerifyPaymentMethodInput!) {
          verifyPaymentMethod(input: $input) {
            verification {
              id
              status
              processorResponse { legacyCode message }
              amount { value currencyCode }
            }
          }
        }`;
        const input: Record<string, unknown> = { paymentMethodId: a.paymentMethodId };
        const options: Record<string, unknown> = {};
        if (a.amount !== undefined) options.amount = a.amount;
        if (a.merchantAccountId !== undefined) options.merchantAccountId = a.merchantAccountId;
        if (a.riskCorrelationId !== undefined) options.riskCorrelationId = a.riskCorrelationId;
        if (Object.keys(options).length > 0) input.options = options;
        return {
          content: [
            { type: "text", text: JSON.stringify(await braintreeRequest(query, { input }), null, 2) },
          ],
        };
      }
      case "delete_customer": {
        const query = `mutation DeleteCustomer($input: DeleteCustomerInput!) {
          deleteCustomer(input: $input) { clientMutationId }
        }`;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await braintreeRequest(query, { input: { customerId: a.customerId } }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "find_customer": {
        const filter: Record<string, unknown> = {};
        if (a.email !== undefined) filter.email = { is: a.email };
        if (a.firstName !== undefined) filter.firstName = { is: a.firstName };
        if (a.lastName !== undefined) filter.lastName = { is: a.lastName };
        if (a.company !== undefined) filter.company = { is: a.company };
        const query = `query FindCustomer($input: CustomerSearchInput) {
          search {
            customers(input: $input) {
              edges {
                node { id firstName lastName email company phone }
              }
            }
          }
        }`;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await braintreeRequest(query, {
                  input: Object.keys(filter).length > 0 ? filter : null,
                }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "search_transactions": {
        const filter: Record<string, unknown> = {};
        if (Array.isArray(a.status) && (a.status as unknown[]).length > 0) {
          filter.status = { in: a.status };
        }
        if (a.customerId !== undefined) filter.customer = { id: { is: a.customerId } };
        if (a.orderId !== undefined) filter.orderId = { is: a.orderId };
        if (a.createdAfter !== undefined || a.createdBefore !== undefined) {
          const createdAt: Record<string, unknown> = {};
          if (a.createdAfter !== undefined) createdAt.greaterThanOrEqualTo = a.createdAfter;
          if (a.createdBefore !== undefined) createdAt.lessThanOrEqualTo = a.createdBefore;
          filter.createdAt = createdAt;
        }
        const query = `query SearchTransactions($input: TransactionSearchInput) {
          search {
            transactions(input: $input) {
              edges {
                node {
                  id
                  status
                  amount { value currencyCode }
                  orderId
                  createdAt
                }
              }
            }
          }
        }`;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await braintreeRequest(query, {
                  input: Object.keys(filter).length > 0 ? filter : null,
                }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "find_dispute": {
        const query = `query FindDispute($id: ID!) {
          node(id: $id) {
            ... on Dispute {
              id
              status
              reason
              amountDisputed { value currencyCode }
              receivedDate
              replyByDate
            }
          }
        }`;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await braintreeRequest(query, { id: a.disputeId }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "accept_dispute": {
        const query = `mutation AcceptDispute($input: AcceptDisputeInput!) {
          acceptDispute(input: $input) {
            dispute { id status }
          }
        }`;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await braintreeRequest(query, { input: { disputeId: a.disputeId } }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "finalize_dispute": {
        const query = `mutation FinalizeDispute($input: FinalizeDisputeInput!) {
          finalizeDispute(input: $input) {
            dispute { id status }
          }
        }`;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await braintreeRequest(query, { input: { disputeId: a.disputeId } }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "find_merchant_account": {
        const query = `query FindMerchantAccount($id: ID!) {
          node(id: $id) {
            ... on MerchantAccount {
              id
              status
              currencyCode
              default
            }
          }
        }`;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await braintreeRequest(query, { id: a.merchantAccountId }),
                null,
                2,
              ),
            },
          ],
        };
      }
      case "create_client_token": {
        const clientToken: Record<string, unknown> = {};
        if (a.merchantAccountId !== undefined) clientToken.merchantAccountId = a.merchantAccountId;
        if (a.customerId !== undefined) clientToken.customerId = a.customerId;
        const query = `mutation CreateClientToken($input: CreateClientTokenInput!) {
          createClientToken(input: $input) { clientToken }
        }`;
        const input: Record<string, unknown> =
          Object.keys(clientToken).length > 0 ? { clientToken } : {};
        return {
          content: [
            { type: "text", text: JSON.stringify(await braintreeRequest(query, { input }), null, 2) },
          ],
        };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return {
      content: [
        { type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
      ],
      isError: true,
    };
  }
});

async function main() {
  if (process.argv.includes("--http") || process.env.MCP_HTTP === "true") {
    const { default: express } = await import("express");
    const { randomUUID } = await import("node:crypto");
    const app = express();
    app.use(express.json());
    const transports = new Map<string, StreamableHTTPServerTransport>();
    app.get("/health", (_req: unknown, res: { json: (body: unknown) => unknown }) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: { headers: Record<string, string | string[] | undefined>; body: unknown }, res: { status: (code: number) => { json: (body: unknown) => unknown } }) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req as never, res as never, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-braintree", version: "0.2.0" }, { capabilities: { tools: {} } });
        (server as unknown as { _requestHandlers: Map<unknown, unknown> })._requestHandlers.forEach((v, k) => (s as unknown as { _requestHandlers: Map<unknown, unknown> })._requestHandlers.set(k, v));
        (server as unknown as { _notificationHandlers?: Map<unknown, unknown> })._notificationHandlers?.forEach((v, k) => (s as unknown as { _notificationHandlers: Map<unknown, unknown> })._notificationHandlers.set(k, v));
        await s.connect(t);
        await t.handleRequest(req as never, res as never, req.body); return;
      }
      res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
    });
    app.get("/mcp", async (req: { headers: Record<string, string | string[] | undefined> }, res: { status: (code: number) => { send: (body: string) => unknown } }) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req as never, res as never); else res.status(400).send("Invalid session"); });
    app.delete("/mcp", async (req: { headers: Record<string, string | string[] | undefined> }, res: { status: (code: number) => { send: (body: string) => unknown } }) => { const sid = req.headers["mcp-session-id"] as string; if (sid && transports.has(sid)) await transports.get(sid)!.handleRequest(req as never, res as never); else res.status(400).send("Invalid session"); });
    const port = Number(process.env.MCP_PORT) || 3000;
    app.listen(port, () => { console.error(`MCP HTTP server on http://localhost:${port}/mcp`); });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

main().catch(console.error);
