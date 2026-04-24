#!/usr/bin/env node

/**
 * MCP Server for Amazon Selling Partner API (SP-API) — the biggest global
 * marketplace. For LatAm sellers this covers Amazon BR (A2Q3Y263D00KWC),
 * Amazon MX (A1AM78C64UM0Y8), and cross-border into Amazon US (ATVPDKIKX0DER)
 * and beyond. Together with Mercado Libre (LatAm generalist) and Shopee
 * (Brazil + SEA), this trio gives agents full marketplace reach for LatAm
 * commerce.
 *
 * Tools (13):
 *   list_orders               — GET  /orders/v0/orders
 *   get_order                 — GET  /orders/v0/orders/{orderId}
 *   get_order_items           — GET  /orders/v0/orders/{orderId}/orderItems
 *   get_listings_item         — GET  /listings/2021-08-01/items/{sellerId}/{sku}
 *   put_listings_item         — PUT  /listings/2021-08-01/items/{sellerId}/{sku}
 *   delete_listings_item      — DEL  /listings/2021-08-01/items/{sellerId}/{sku}
 *   search_catalog_items      — GET  /catalog/2022-04-01/items
 *   get_inventory_summary     — GET  /fba/inventory/v1/summaries
 *   create_report             — POST /reports/2021-06-30/reports
 *   get_report                — GET  /reports/2021-06-30/reports/{reportId}
 *   list_financial_events     — GET  /finances/v0/financialEvents
 *   get_order_shipment_status — GET  /shipping/v1/shipments/{shipmentId}
 *   create_subscription       — POST /notifications/v1/subscriptions/{notificationType}
 *
 * Authentication
 *   Dual-step LWA (Login with Amazon) OAuth:
 *     1. POST https://api.amazon.com/auth/o2/token with
 *        grant_type=refresh_token, refresh_token, client_id, client_secret
 *        -> returns access_token (1h lifetime)
 *     2. Call SP-API regional base with header `x-amz-access-token: <token>`
 *   AWS SigV4 request signing was the historical requirement but was
 *   removed in 2023 for most tenants; this server relies on LWA only.
 *
 * Environment
 *   AMAZON_LWA_CLIENT_ID      LWA app client_id
 *   AMAZON_LWA_CLIENT_SECRET  LWA app client_secret
 *   AMAZON_REFRESH_TOKEN      seller-authorized long-lived refresh token
 *   AMAZON_MARKETPLACE_ID     default marketplace id (BR/US/MX/...)
 *   AMAZON_REGION             'na' | 'eu' | 'fe' (default 'na')
 *   AMAZON_SELLER_ID          default sellerId (merchant token) for Listings
 *
 * Docs: https://developer-docs.amazon.com/sp-api
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const LWA_CLIENT_ID = process.env.AMAZON_LWA_CLIENT_ID || "";
const LWA_CLIENT_SECRET = process.env.AMAZON_LWA_CLIENT_SECRET || "";
const REFRESH_TOKEN = process.env.AMAZON_REFRESH_TOKEN || "";
const MARKETPLACE_ID = process.env.AMAZON_MARKETPLACE_ID || "";
const REGION = (process.env.AMAZON_REGION || "na").toLowerCase();
const SELLER_ID = process.env.AMAZON_SELLER_ID || "";

const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";
const REGIONAL_BASE_URLS: Record<string, string> = {
  na: "https://sellingpartnerapi-na.amazon.com",
  eu: "https://sellingpartnerapi-eu.amazon.com",
  fe: "https://sellingpartnerapi-fe.amazon.com",
};
const BASE_URL = REGIONAL_BASE_URLS[REGION] ?? REGIONAL_BASE_URLS.na;

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: REFRESH_TOKEN,
    client_id: LWA_CLIENT_ID,
    client_secret: LWA_CLIENT_SECRET,
  });
  const res = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Amazon LWA ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

function buildQueryString(query?: Record<string, unknown>): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      // SP-API expects comma-joined lists (e.g. MarketplaceIds=ATVPDKIKX0DER,A2Q3Y263D00KWC)
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v.join(","))}`);
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

async function amazonRequest(
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
  path: string,
  body?: unknown,
  opts?: { query?: Record<string, unknown> },
): Promise<unknown> {
  const token = await getAccessToken();
  const url = `${BASE_URL}${path}${buildQueryString(opts?.query)}`;
  const res = await fetch(url, {
    method,
    headers: {
      "x-amz-access-token": token,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Amazon SP-API ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

const server = new Server(
  { name: "mcp-amazon", version: "0.1.0-alpha.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_orders",
      description: "List orders from Amazon SP-API. Filters by marketplace, creation/update time, order status, fulfillment channel, etc. Returns a page of orders plus NextToken for pagination.",
      inputSchema: {
        type: "object",
        properties: {
          MarketplaceIds: { type: "array", items: { type: "string" }, description: "Marketplace ids (comma-joined). Defaults to AMAZON_MARKETPLACE_ID env. BR: A2Q3Y263D00KWC, US: ATVPDKIKX0DER, MX: A1AM78C64UM0Y8." },
          CreatedAfter: { type: "string", description: "ISO-8601 timestamp — only orders created on or after this time." },
          CreatedBefore: { type: "string", description: "ISO-8601 timestamp — only orders created on or before this time." },
          LastUpdatedAfter: { type: "string", description: "ISO-8601 timestamp — only orders updated on or after this time." },
          LastUpdatedBefore: { type: "string", description: "ISO-8601 timestamp — only orders updated on or before this time." },
          OrderStatuses: { type: "array", items: { type: "string" }, description: "Filter by status: PendingAvailability, Pending, Unshipped, PartiallyShipped, Shipped, Canceled, Unfulfillable, InvoiceUnconfirmed." },
          FulfillmentChannels: { type: "array", items: { type: "string" }, description: "AFN (FBA) or MFN (merchant-fulfilled)." },
          PaymentMethods: { type: "array", items: { type: "string" }, description: "COD, CVS, Other." },
          BuyerEmail: { type: "string" },
          SellerOrderId: { type: "string" },
          MaxResultsPerPage: { type: "number", description: "Page size (1-100). Default 100." },
          NextToken: { type: "string", description: "Pagination token from a prior response." },
        },
      },
    },
    {
      name: "get_order",
      description: "Get one order by AmazonOrderId (e.g. '902-3159896-1390916').",
      inputSchema: {
        type: "object",
        properties: {
          AmazonOrderId: { type: "string", description: "19-character order id (3-7-7 format)." },
        },
        required: ["AmazonOrderId"],
      },
    },
    {
      name: "get_order_items",
      description: "Get the line items for an order by AmazonOrderId. Returns ASIN, SellerSKU, quantity, item price, taxes, promotions.",
      inputSchema: {
        type: "object",
        properties: {
          AmazonOrderId: { type: "string", description: "19-character order id." },
          NextToken: { type: "string", description: "Pagination token." },
        },
        required: ["AmazonOrderId"],
      },
    },
    {
      name: "get_listings_item",
      description: "Get a single listing item for the seller by SKU.",
      inputSchema: {
        type: "object",
        properties: {
          sellerId: { type: "string", description: "Seller merchant token. Defaults to AMAZON_SELLER_ID env." },
          sku: { type: "string", description: "Merchant-defined SKU." },
          marketplaceIds: { type: "array", items: { type: "string" }, description: "Marketplace ids. Defaults to AMAZON_MARKETPLACE_ID env." },
          includedData: { type: "array", items: { type: "string" }, description: "Which data blocks to include: summaries, attributes, issues, offers, fulfillmentAvailability, procurement." },
          issueLocale: { type: "string", description: "Locale for issue localization (e.g. en_US, pt_BR)." },
        },
        required: ["sku"],
      },
    },
    {
      name: "put_listings_item",
      description: "Create or fully replace a listing item for the seller by SKU. Body must be a Listings Items submission (productType + attributes).",
      inputSchema: {
        type: "object",
        properties: {
          sellerId: { type: "string", description: "Seller merchant token. Defaults to AMAZON_SELLER_ID env." },
          sku: { type: "string", description: "Merchant-defined SKU." },
          marketplaceIds: { type: "array", items: { type: "string" }, description: "Marketplace ids. Defaults to AMAZON_MARKETPLACE_ID env." },
          productType: { type: "string", description: "Amazon product type (e.g. SHOES, LUGGAGE)." },
          requirements: { type: "string", description: "LISTING | LISTING_PRODUCT_ONLY | LISTING_OFFER_ONLY (defaults to LISTING)." },
          attributes: { type: "object", description: "Attributes object keyed by product-type schema (e.g. item_name, brand, standard_price)." },
        },
        required: ["sku", "productType", "attributes"],
      },
    },
    {
      name: "delete_listings_item",
      description: "Delete a listing item for the seller by SKU.",
      inputSchema: {
        type: "object",
        properties: {
          sellerId: { type: "string", description: "Seller merchant token. Defaults to AMAZON_SELLER_ID env." },
          sku: { type: "string", description: "Merchant-defined SKU." },
          marketplaceIds: { type: "array", items: { type: "string" }, description: "Marketplace ids. Defaults to AMAZON_MARKETPLACE_ID env." },
          issueLocale: { type: "string", description: "Locale for issue localization." },
        },
        required: ["sku"],
      },
    },
    {
      name: "search_catalog_items",
      description: "Search the Amazon catalog for reference product data (ASIN, title, brand, images) by identifiers or keywords. Use this to map merchant SKUs to ASINs before creating listings.",
      inputSchema: {
        type: "object",
        properties: {
          marketplaceIds: { type: "array", items: { type: "string" }, description: "Marketplace ids. Defaults to AMAZON_MARKETPLACE_ID env." },
          identifiers: { type: "array", items: { type: "string" }, description: "Product identifier values (e.g. EAN/UPC/ISBN/ASIN). Use with identifiersType." },
          identifiersType: { type: "string", description: "ASIN, EAN, GTIN, ISBN, JAN, MINSAN, SKU, UPC." },
          keywords: { type: "array", items: { type: "string" }, description: "Free-text keywords (alternative to identifiers)." },
          brandNames: { type: "array", items: { type: "string" } },
          classificationIds: { type: "array", items: { type: "string" } },
          pageSize: { type: "number", description: "Max 20. Default 10." },
          pageToken: { type: "string", description: "Pagination token." },
          includedData: { type: "array", items: { type: "string" }, description: "summaries, attributes, images, productTypes, salesRanks, classifications, identifiers, relationships, vendorDetails." },
          locale: { type: "string", description: "Locale for localized fields (en_US, pt_BR, es_MX)." },
        },
      },
    },
    {
      name: "get_inventory_summary",
      description: "Get FBA inventory summaries (fulfillable, inbound, reserved, researching, unfulfillable quantities) for the seller's SKUs.",
      inputSchema: {
        type: "object",
        properties: {
          details: { type: "boolean", description: "Include full detail (default false = summary only)." },
          granularityType: { type: "string", description: "Granularity scope. Use 'Marketplace'." },
          granularityId: { type: "string", description: "Marketplace id to report on. Defaults to AMAZON_MARKETPLACE_ID env." },
          marketplaceIds: { type: "array", items: { type: "string" }, description: "Marketplace ids. Defaults to AMAZON_MARKETPLACE_ID env." },
          sellerSkus: { type: "array", items: { type: "string" }, description: "Optional list of specific SKUs." },
          startDateTime: { type: "string", description: "ISO-8601 — only SKUs changed after this time." },
          nextToken: { type: "string", description: "Pagination token." },
        },
      },
    },
    {
      name: "create_report",
      description: "Request an SP-API report. Report is generated asynchronously — poll with get_report until processingStatus is DONE, then fetch the reportDocumentId.",
      inputSchema: {
        type: "object",
        properties: {
          reportType: { type: "string", description: "Report type code (e.g. GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL, GET_MERCHANT_LISTINGS_ALL_DATA, GET_FBA_MYI_ALL_INVENTORY_DATA)." },
          marketplaceIds: { type: "array", items: { type: "string" }, description: "Marketplace ids. Defaults to [AMAZON_MARKETPLACE_ID] env." },
          dataStartTime: { type: "string", description: "ISO-8601 lower bound of the report window." },
          dataEndTime: { type: "string", description: "ISO-8601 upper bound of the report window." },
          reportOptions: { type: "object", description: "Report-type-specific options." },
        },
        required: ["reportType"],
      },
    },
    {
      name: "get_report",
      description: "Get a report's status and (when DONE) its reportDocumentId, which can then be fetched from the Reports document API.",
      inputSchema: {
        type: "object",
        properties: {
          reportId: { type: "string", description: "Report id from create_report." },
        },
        required: ["reportId"],
      },
    },
    {
      name: "list_financial_events",
      description: "List financial events (shipment, refund, service fee, adjustment, etc.) for reconciliation. Filter by posted-time window or by AmazonOrderId.",
      inputSchema: {
        type: "object",
        properties: {
          MaxResultsPerPage: { type: "number", description: "Page size (1-100). Default 100." },
          PostedAfter: { type: "string", description: "ISO-8601 lower bound of the posted-time window." },
          PostedBefore: { type: "string", description: "ISO-8601 upper bound (must be at least 2 minutes before now)." },
          AmazonOrderId: { type: "string", description: "Only events for this order id." },
          FinancialEventGroupId: { type: "string", description: "Only events within this event group." },
          NextToken: { type: "string", description: "Pagination token." },
        },
      },
    },
    {
      name: "get_order_shipment_status",
      description: "Get shipment status for a shipment id via the Shipping API (Amazon Shipping / Buy Shipping labels).",
      inputSchema: {
        type: "object",
        properties: {
          shipmentId: { type: "string", description: "Shipment id returned when the label was purchased." },
        },
        required: ["shipmentId"],
      },
    },
    {
      name: "create_subscription",
      description: "Create a Notifications API subscription for a given notificationType (webhook-equivalent for SP-API events, delivered via SQS or EventBridge destination).",
      inputSchema: {
        type: "object",
        properties: {
          notificationType: { type: "string", description: "Event type (e.g. ANY_OFFER_CHANGED, ORDER_CHANGE, FBA_INVENTORY_AVAILABILITY_CHANGES, REPORT_PROCESSING_FINISHED)." },
          payloadVersion: { type: "string", description: "Payload version for the notification type (e.g. '1.0')." },
          destinationId: { type: "string", description: "Destination id (created separately via POST /notifications/v1/destinations). Identifies the SQS queue or EventBridge bus." },
          processingDirective: { type: "object", description: "Optional filters (eventFilter) to narrow which events trigger notifications." },
        },
        required: ["notificationType", "payloadVersion", "destinationId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = args as Record<string, unknown> | undefined;

  try {
    switch (name) {
      case "list_orders": {
        const q: Record<string, unknown> = {
          MarketplaceIds: a?.MarketplaceIds ?? (MARKETPLACE_ID ? [MARKETPLACE_ID] : undefined),
        };
        for (const k of [
          "CreatedAfter", "CreatedBefore", "LastUpdatedAfter", "LastUpdatedBefore",
          "OrderStatuses", "FulfillmentChannels", "PaymentMethods", "BuyerEmail",
          "SellerOrderId", "MaxResultsPerPage", "NextToken",
        ]) {
          if (a?.[k] !== undefined) q[k] = a[k];
        }
        return { content: [{ type: "text", text: JSON.stringify(await amazonRequest("GET", "/orders/v0/orders", undefined, { query: q }), null, 2) }] };
      }

      case "get_order": {
        const id = encodeURIComponent(String(a?.AmazonOrderId));
        return { content: [{ type: "text", text: JSON.stringify(await amazonRequest("GET", `/orders/v0/orders/${id}`), null, 2) }] };
      }

      case "get_order_items": {
        const id = encodeURIComponent(String(a?.AmazonOrderId));
        const q: Record<string, unknown> = {};
        if (a?.NextToken !== undefined) q.NextToken = a.NextToken;
        return { content: [{ type: "text", text: JSON.stringify(await amazonRequest("GET", `/orders/v0/orders/${id}/orderItems`, undefined, { query: q }), null, 2) }] };
      }

      case "get_listings_item": {
        const sellerId = encodeURIComponent(String(a?.sellerId ?? SELLER_ID));
        const sku = encodeURIComponent(String(a?.sku));
        const q: Record<string, unknown> = {
          marketplaceIds: a?.marketplaceIds ?? (MARKETPLACE_ID ? [MARKETPLACE_ID] : undefined),
        };
        if (a?.includedData !== undefined) q.includedData = a.includedData;
        if (a?.issueLocale !== undefined) q.issueLocale = a.issueLocale;
        return { content: [{ type: "text", text: JSON.stringify(await amazonRequest("GET", `/listings/2021-08-01/items/${sellerId}/${sku}`, undefined, { query: q }), null, 2) }] };
      }

      case "put_listings_item": {
        const sellerId = encodeURIComponent(String(a?.sellerId ?? SELLER_ID));
        const sku = encodeURIComponent(String(a?.sku));
        const q: Record<string, unknown> = {
          marketplaceIds: a?.marketplaceIds ?? (MARKETPLACE_ID ? [MARKETPLACE_ID] : undefined),
        };
        const body: Record<string, unknown> = {
          productType: a?.productType,
          attributes: a?.attributes,
        };
        if (a?.requirements !== undefined) body.requirements = a.requirements;
        return { content: [{ type: "text", text: JSON.stringify(await amazonRequest("PUT", `/listings/2021-08-01/items/${sellerId}/${sku}`, body, { query: q }), null, 2) }] };
      }

      case "delete_listings_item": {
        const sellerId = encodeURIComponent(String(a?.sellerId ?? SELLER_ID));
        const sku = encodeURIComponent(String(a?.sku));
        const q: Record<string, unknown> = {
          marketplaceIds: a?.marketplaceIds ?? (MARKETPLACE_ID ? [MARKETPLACE_ID] : undefined),
        };
        if (a?.issueLocale !== undefined) q.issueLocale = a.issueLocale;
        return { content: [{ type: "text", text: JSON.stringify(await amazonRequest("DELETE", `/listings/2021-08-01/items/${sellerId}/${sku}`, undefined, { query: q }), null, 2) }] };
      }

      case "search_catalog_items": {
        const q: Record<string, unknown> = {
          marketplaceIds: a?.marketplaceIds ?? (MARKETPLACE_ID ? [MARKETPLACE_ID] : undefined),
        };
        for (const k of [
          "identifiers", "identifiersType", "keywords", "brandNames",
          "classificationIds", "pageSize", "pageToken", "includedData", "locale",
        ]) {
          if (a?.[k] !== undefined) q[k] = a[k];
        }
        return { content: [{ type: "text", text: JSON.stringify(await amazonRequest("GET", "/catalog/2022-04-01/items", undefined, { query: q }), null, 2) }] };
      }

      case "get_inventory_summary": {
        const q: Record<string, unknown> = {
          details: a?.details ?? false,
          granularityType: a?.granularityType ?? "Marketplace",
          granularityId: a?.granularityId ?? MARKETPLACE_ID,
          marketplaceIds: a?.marketplaceIds ?? (MARKETPLACE_ID ? [MARKETPLACE_ID] : undefined),
        };
        if (a?.sellerSkus !== undefined) q.sellerSkus = a.sellerSkus;
        if (a?.startDateTime !== undefined) q.startDateTime = a.startDateTime;
        if (a?.nextToken !== undefined) q.nextToken = a.nextToken;
        return { content: [{ type: "text", text: JSON.stringify(await amazonRequest("GET", "/fba/inventory/v1/summaries", undefined, { query: q }), null, 2) }] };
      }

      case "create_report": {
        const body: Record<string, unknown> = {
          reportType: a?.reportType,
          marketplaceIds: a?.marketplaceIds ?? (MARKETPLACE_ID ? [MARKETPLACE_ID] : []),
        };
        if (a?.dataStartTime !== undefined) body.dataStartTime = a.dataStartTime;
        if (a?.dataEndTime !== undefined) body.dataEndTime = a.dataEndTime;
        if (a?.reportOptions !== undefined) body.reportOptions = a.reportOptions;
        return { content: [{ type: "text", text: JSON.stringify(await amazonRequest("POST", "/reports/2021-06-30/reports", body), null, 2) }] };
      }

      case "get_report": {
        const id = encodeURIComponent(String(a?.reportId));
        return { content: [{ type: "text", text: JSON.stringify(await amazonRequest("GET", `/reports/2021-06-30/reports/${id}`), null, 2) }] };
      }

      case "list_financial_events": {
        const q: Record<string, unknown> = {};
        for (const k of [
          "MaxResultsPerPage", "PostedAfter", "PostedBefore",
          "AmazonOrderId", "FinancialEventGroupId", "NextToken",
        ]) {
          if (a?.[k] !== undefined) q[k] = a[k];
        }
        return { content: [{ type: "text", text: JSON.stringify(await amazonRequest("GET", "/finances/v0/financialEvents", undefined, { query: q }), null, 2) }] };
      }

      case "get_order_shipment_status": {
        const id = encodeURIComponent(String(a?.shipmentId));
        return { content: [{ type: "text", text: JSON.stringify(await amazonRequest("GET", `/shipping/v1/shipments/${id}`), null, 2) }] };
      }

      case "create_subscription": {
        const notificationType = encodeURIComponent(String(a?.notificationType));
        const body: Record<string, unknown> = {
          payloadVersion: a?.payloadVersion,
          destinationId: a?.destinationId,
        };
        if (a?.processingDirective !== undefined) body.processingDirective = a.processingDirective;
        return { content: [{ type: "text", text: JSON.stringify(await amazonRequest("POST", `/notifications/v1/subscriptions/${notificationType}`, body), null, 2) }] };
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
    app.get("/health", (_req: unknown, res: { json: (body: unknown) => unknown }) => res.json({ status: "ok", sessions: transports.size }));
    app.post("/mcp", async (req: { headers: Record<string, string | string[] | undefined>; body: unknown }, res: { status: (code: number) => { json: (body: unknown) => unknown } }) => {
      const sid = req.headers["mcp-session-id"] as string | undefined;
      if (sid && transports.has(sid)) { await transports.get(sid)!.handleRequest(req as never, res as never, req.body); return; }
      if (!sid && isInitializeRequest(req.body)) {
        const t = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), onsessioninitialized: (id) => { transports.set(id, t); } });
        t.onclose = () => { if (t.sessionId) transports.delete(t.sessionId); };
        const s = new Server({ name: "mcp-amazon", version: "0.1.0-alpha.1" }, { capabilities: { tools: {} } });
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
