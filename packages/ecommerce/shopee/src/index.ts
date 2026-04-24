#!/usr/bin/env node

/**
 * MCP Server for Shopee — major LatAm ecommerce marketplace (dominant in Brazil,
 * growing across the region) via the Shopee Open Platform Partner API v2.
 *
 * Together with Mercado Libre (also in this catalog), Shopee covers the two
 * marketplaces where LatAm merchants concentrate most of their online GMV.
 * Each has its own seller ecosystem — bundle both for full regional reach.
 *
 * Tools (22):
 *   get_shop_info                — GET  /shop/get_shop_info
 *   list_orders                  — GET  /order/get_order_list
 *   get_order_detail             — GET  /order/get_order_detail
 *   ship_order                   — POST /order/ship_order
 *   cancel_order                 — POST /order/cancel_order
 *   list_products                — GET  /product/get_item_list
 *   get_product_detail           — GET  /product/get_item_base_info
 *   add_item                     — POST /product/add_item
 *   update_item                  — POST /product/update_item
 *   delete_item                  — POST /product/delete_item
 *   update_product_stock         — POST /product/update_stock
 *   update_product_price         — POST /product/update_price
 *   get_shipment_list            — GET  /order/get_shipment_list
 *   get_shipping_parameter       — GET  /logistics/get_shipping_parameter
 *   get_tracking_number          — GET  /logistics/get_tracking_number
 *   download_shipping_document   — POST /logistics/download_shipping_document
 *   get_return_list              — GET  /returns/get_return_list
 *   confirm_return               — POST /returns/confirm
 *   accept_return_offer          — POST /returns/accept_offer
 *   add_discount                 — POST /discount/add_discount
 *   add_bundle_deal              — POST /bundle_deal/add_bundle_deal
 *   send_chat_message            — POST /sellerchat/send_message
 *
 * Authentication
 *   Shopee uses partner-signed requests. For shop-level endpoints the base
 *   string is concatenated from:
 *     base_string = partner_id + api_path + timestamp + access_token + shop_id
 *   and signed with HMAC-SHA256 using partner_key, hex-encoded:
 *     sign = hmac_sha256(partner_key, base_string).hex()
 *   partner_id, timestamp, access_token, shop_id and sign are then appended
 *   as query-string parameters on the request URL. The access_token is
 *   obtained via the merchant OAuth authorization flow and expires every
 *   4 hours (refresh with the refresh_token, which lasts 30 days).
 *
 * Environment
 *   SHOPEE_PARTNER_ID     — partner_id (integer) from Shopee Open Platform
 *   SHOPEE_PARTNER_KEY    — partner_key (secret) used for HMAC signing
 *   SHOPEE_ACCESS_TOKEN   — merchant access_token (secret)
 *   SHOPEE_SHOP_ID        — shop_id (integer) from the authorized shop
 *   SHOPEE_ENV            — 'sandbox' | 'production' (default: production)
 *
 * Docs: https://open.shopee.com
 */

import { createHmac } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const PARTNER_ID = process.env.SHOPEE_PARTNER_ID || "";
const PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY || "";
const ACCESS_TOKEN = process.env.SHOPEE_ACCESS_TOKEN || "";
const SHOP_ID = process.env.SHOPEE_SHOP_ID || "";
const ENV = (process.env.SHOPEE_ENV || "production").toLowerCase();
const BASE_URL = ENV === "sandbox"
  ? "https://partner.test-stable.shopeemobile.com"
  : "https://partner.shopeemobile.com";
const API_PREFIX = "/api/v2";

function sign(apiPath: string, timestamp: number): string {
  // Shop-level endpoint signature: partner_id + api_path + timestamp + access_token + shop_id
  const baseString = `${PARTNER_ID}${apiPath}${timestamp}${ACCESS_TOKEN}${SHOP_ID}`;
  return createHmac("sha256", PARTNER_KEY).update(baseString).digest("hex");
}

function buildSignedUrl(apiPath: string, extra?: Record<string, unknown>): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign(apiPath, timestamp);
  const params: Record<string, unknown> = {
    partner_id: PARTNER_ID,
    timestamp,
    access_token: ACCESS_TOKEN,
    shop_id: SHOP_ID,
    sign: signature,
  };
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== null && v !== "") params[k] = v;
    }
  }
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `${BASE_URL}${apiPath}?${qs}`;
}

async function shopeeRequest(
  method: "GET" | "POST",
  apiPath: string,
  queryParams?: Record<string, unknown>,
  body?: unknown,
): Promise<unknown> {
  const fullPath = `${API_PREFIX}${apiPath}`;
  const url = buildSignedUrl(fullPath, queryParams);
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Shopee API ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

const server = new Server(
  { name: "mcp-shopee", version: "0.2.0-alpha.1" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_shop_info",
      description: "Get basic information about the authorized Shopee shop (shop_name, region, status, auth expiry).",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_orders",
      description: "List orders within a time window, optionally filtered by order_status. Time window cannot exceed 15 days. Returns order_sn list which can be fed into get_order_detail.",
      inputSchema: {
        type: "object",
        properties: {
          time_range_field: { type: "string", enum: ["create_time", "update_time"], description: "Which timestamp field to filter. Defaults to 'create_time'." },
          time_from: { type: "number", description: "Unix seconds start of window (inclusive)." },
          time_to: { type: "number", description: "Unix seconds end of window (inclusive). Max 15 days after time_from." },
          page_size: { type: "number", description: "Max 100. Defaults to 20." },
          cursor: { type: "string", description: "Pagination cursor returned from a previous call." },
          order_status: { type: "string", enum: ["UNPAID", "READY_TO_SHIP", "PROCESSED", "SHIPPED", "COMPLETED", "IN_CANCEL", "CANCELLED", "INVOICE_PENDING"], description: "Filter by order_status." },
        },
        required: ["time_from", "time_to"],
      },
    },
    {
      name: "get_order_detail",
      description: "Get full detail for one or more orders by order_sn (comma-separated, up to 50).",
      inputSchema: {
        type: "object",
        properties: {
          order_sn_list: { type: "string", description: "Comma-separated list of order_sn values (up to 50)." },
          response_optional_fields: { type: "string", description: "Optional comma-separated list of extra fields to include (e.g. 'buyer_user_id,recipient_address,item_list,pay_time,package_list')." },
        },
        required: ["order_sn_list"],
      },
    },
    {
      name: "ship_order",
      description: "Arrange shipment for an order — either request pickup, drop off, or pass a tracking number depending on the logistics channel.",
      inputSchema: {
        type: "object",
        properties: {
          order_sn: { type: "string", description: "Order serial number to ship." },
          package_number: { type: "string", description: "Optional package_number when the order has multiple packages." },
          pickup: { type: "object", description: "Pickup object: { address_id, pickup_time_id, tracking_number? }." },
          dropoff: { type: "object", description: "Dropoff object: { branch_id?, sender_real_name?, tracking_number?, slug? }." },
          non_integrated: { type: "object", description: "Non-integrated logistics object: { tracking_number }." },
        },
        required: ["order_sn"],
      },
    },
    {
      name: "cancel_order",
      description: "Cancel an order that has not yet shipped. Seller cancellations require a cancel_reason.",
      inputSchema: {
        type: "object",
        properties: {
          order_sn: { type: "string", description: "Order serial number to cancel." },
          cancel_reason: { type: "string", enum: ["OUT_OF_STOCK", "UNDELIVERABLE_AREA", "COD_NOT_SUPPORTED", "CUSTOMER_REQUEST"], description: "Reason for cancellation." },
          item_list: { type: "array", items: { type: "object" }, description: "For OUT_OF_STOCK: array of { item_id, model_id } identifying which items are out of stock." },
        },
        required: ["order_sn", "cancel_reason"],
      },
    },
    {
      name: "list_products",
      description: "List items (products) in the shop with optional status filter. Returns item_id list which can be fed into get_product_detail.",
      inputSchema: {
        type: "object",
        properties: {
          offset: { type: "number", description: "Starting offset. Defaults to 0." },
          page_size: { type: "number", description: "Max 100. Defaults to 20." },
          item_status: { type: "string", enum: ["NORMAL", "BANNED", "UNLIST", "REVIEWING", "SELLER_DELETE", "SHOPEE_DELETE"], description: "Filter by item status." },
          update_time_from: { type: "number", description: "Unix seconds — only return items updated after this time." },
          update_time_to: { type: "number", description: "Unix seconds — only return items updated before this time." },
        },
      },
    },
    {
      name: "get_product_detail",
      description: "Get detailed base info for up to 50 items by item_id.",
      inputSchema: {
        type: "object",
        properties: {
          item_id_list: { type: "string", description: "Comma-separated list of item_id values (up to 50)." },
          need_tax_info: { type: "boolean", description: "Include tax info in the response." },
          need_complaint_policy: { type: "boolean", description: "Include complaint policy in the response." },
        },
        required: ["item_id_list"],
      },
    },
    {
      name: "update_product_stock",
      description: "Update stock levels for an item (or its models/variants). Pass stock_list entries with model_id 0 for single-SKU items.",
      inputSchema: {
        type: "object",
        properties: {
          item_id: { type: "number", description: "Item ID whose stock is being updated." },
          stock_list: {
            type: "array",
            items: { type: "object" },
            description: "Array of { model_id (0 for items without variants), normal_stock } objects.",
          },
        },
        required: ["item_id", "stock_list"],
      },
    },
    {
      name: "update_product_price",
      description: "Update prices for an item (or its models/variants). Pass price_list entries with model_id 0 for single-SKU items.",
      inputSchema: {
        type: "object",
        properties: {
          item_id: { type: "number", description: "Item ID whose price is being updated." },
          price_list: {
            type: "array",
            items: { type: "object" },
            description: "Array of { model_id (0 for items without variants), original_price } objects.",
          },
        },
        required: ["item_id", "price_list"],
      },
    },
    {
      name: "get_shipment_list",
      description: "List orders currently in shipment (status SHIPPED or in-transit). Useful for reconciling tracking and delivery status.",
      inputSchema: {
        type: "object",
        properties: {
          page_size: { type: "number", description: "Max 100. Defaults to 20." },
          cursor: { type: "string", description: "Pagination cursor returned from a previous call." },
        },
      },
    },
    {
      name: "get_return_list",
      description: "List return/refund requests on the shop, optionally filtered by status and time window.",
      inputSchema: {
        type: "object",
        properties: {
          page_no: { type: "number", description: "Page number (starts at 1). Defaults to 1." },
          page_size: { type: "number", description: "Max 100. Defaults to 20." },
          create_time_from: { type: "number", description: "Unix seconds start of window (inclusive)." },
          create_time_to: { type: "number", description: "Unix seconds end of window (inclusive)." },
          status: { type: "string", enum: ["REQUESTED", "ACCEPTED", "CANCELLED", "JUDGING", "CLOSED", "PROCESSING", "SELLER_DISPUTE"], description: "Filter by return status." },
          negotiation_status: { type: "string", description: "Filter by negotiation status (PENDING_RESPOND, ONGOING, TERMINATED)." },
          seller_proof_status: { type: "string", description: "Filter by seller proof status (PENDING, COMPLETED)." },
          seller_compensation_status: { type: "string", description: "Filter by seller compensation status." },
        },
      },
    },
    {
      name: "confirm_return",
      description: "Confirm (accept) a buyer-initiated return request by return_sn.",
      inputSchema: {
        type: "object",
        properties: {
          return_sn: { type: "string", description: "Return serial number to confirm." },
        },
        required: ["return_sn"],
      },
    },
    {
      name: "add_item",
      description: "Create a new product (item) in the shop. Expects full item payload per Shopee /product/add_item spec (category_id, item_name, description, price+stock via model list or tier_variation, image.image_id_list, weight, logistic_info, etc.).",
      inputSchema: {
        type: "object",
        properties: {
          item: { type: "object", description: "Full item payload forwarded as the POST body to /product/add_item. Required fields typically include original_price, description, weight, item_name, category_id, image, and logistic_info. See Shopee Open Platform docs for the exact schema in your region." },
        },
        required: ["item"],
      },
    },
    {
      name: "update_item",
      description: "Update an existing product. Only the provided fields on the item_id are changed. Use update_product_stock / update_product_price for SKU stock and price — this endpoint handles descriptive fields (name, description, images, attributes, logistics).",
      inputSchema: {
        type: "object",
        properties: {
          item_id: { type: "number", description: "Item ID to update." },
          patch: { type: "object", description: "Object containing the fields to update (e.g. item_name, description, image.image_id_list, attribute_list, logistic_info). Merged into the POST body along with item_id." },
        },
        required: ["item_id"],
      },
    },
    {
      name: "delete_item",
      description: "Delete an item (product) from the shop by item_id. Irreversible — item moves to SELLER_DELETE status.",
      inputSchema: {
        type: "object",
        properties: {
          item_id: { type: "number", description: "Item ID to delete." },
        },
        required: ["item_id"],
      },
    },
    {
      name: "get_shipping_parameter",
      description: "Fetch the required shipping parameters for an order before calling ship_order. Returns which of pickup / dropoff / non_integrated is expected and lists valid address_id, pickup_time_id, branch_id, slug values for the order's logistics channel.",
      inputSchema: {
        type: "object",
        properties: {
          order_sn: { type: "string", description: "Order serial number." },
          package_number: { type: "string", description: "Optional package_number when the order has multiple packages." },
        },
        required: ["order_sn"],
      },
    },
    {
      name: "get_tracking_number",
      description: "Get the tracking number (and courier info when available) for a shipped order.",
      inputSchema: {
        type: "object",
        properties: {
          order_sn: { type: "string", description: "Order serial number." },
          package_number: { type: "string", description: "Optional package_number when the order has multiple packages." },
          response_optional_fields: { type: "string", description: "Optional comma-separated list of extra fields (e.g. 'first_mile_tracking_number,last_mile_tracking_number,plp_number')." },
        },
        required: ["order_sn"],
      },
    },
    {
      name: "download_shipping_document",
      description: "Request the shipping label / air waybill PDF for one or more orders. Returns a download URL or base64 document payload depending on channel. Call create_shipping_document first if your flow requires pre-generation.",
      inputSchema: {
        type: "object",
        properties: {
          order_list: {
            type: "array",
            items: { type: "object" },
            description: "Array of { order_sn, package_number?, shipping_document_type? } entries. shipping_document_type defaults to NORMAL_AIR_WAYBILL.",
          },
          shipping_document_type: { type: "string", description: "Default document type applied to entries without their own (e.g. NORMAL_AIR_WAYBILL, THERMAL_AIR_WAYBILL)." },
        },
        required: ["order_list"],
      },
    },
    {
      name: "accept_return_offer",
      description: "Accept the buyer's return offer (proposed solution) for a return_sn, ending negotiation in the buyer's favor.",
      inputSchema: {
        type: "object",
        properties: {
          return_sn: { type: "string", description: "Return serial number whose offer is being accepted." },
        },
        required: ["return_sn"],
      },
    },
    {
      name: "add_discount",
      description: "Create a new shop-level discount (promotion) with a time window. Add items/variations to it afterwards via the Shopee discount/add_discount_item endpoint.",
      inputSchema: {
        type: "object",
        properties: {
          discount_name: { type: "string", description: "Internal name of the discount promotion." },
          start_time: { type: "number", description: "Unix seconds when the discount becomes active. Must be > now + 1 hour per Shopee rules." },
          end_time: { type: "number", description: "Unix seconds when the discount ends. Must be > start_time and within the maximum promotion window (typically 180 days)." },
        },
        required: ["discount_name", "start_time", "end_time"],
      },
    },
    {
      name: "add_bundle_deal",
      description: "Create a bundle-deal promotion (e.g. buy-N-for-X, buy-N-get-Y%-off, fixed-price bundle). Items are attached via add_bundle_deal_item (not exposed here).",
      inputSchema: {
        type: "object",
        properties: {
          rule_type: { type: "number", description: "Bundle rule type: 1 = fixed price, 2 = discount percentage, 3 = discount amount." },
          discount_value: { type: "number", description: "Discount value — interpretation depends on rule_type (fixed price, percent off, or amount off)." },
          fix_price: { type: "number", description: "Fixed bundle price when rule_type = 1." },
          min_amount: { type: "number", description: "Minimum number of items required to trigger the bundle." },
          start_time: { type: "number", description: "Unix seconds when the bundle deal becomes active." },
          end_time: { type: "number", description: "Unix seconds when the bundle deal ends." },
          name: { type: "string", description: "Bundle deal name shown internally." },
          purchase_limit: { type: "number", description: "Per-buyer purchase limit (0 = unlimited)." },
        },
        required: ["rule_type", "start_time", "end_time", "name"],
      },
    },
    {
      name: "send_chat_message",
      description: "Send a text or sticker message to a buyer in Shopee's seller chat. Requires the buyer's user_id (obtainable from order detail's buyer_user_id).",
      inputSchema: {
        type: "object",
        properties: {
          to_id: { type: "number", description: "Buyer user_id to message." },
          message_type: { type: "string", enum: ["text", "sticker", "image", "item", "order"], description: "Message content type. Defaults to 'text'." },
          content: { type: "object", description: "Message payload object. For text: { text: '...' }. For sticker: { sticker_id, sticker_package_id }. For item: { item_id }. For order: { order_sn }." },
        },
        required: ["to_id", "content"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = args as Record<string, unknown> | undefined;

  try {
    switch (name) {
      case "get_shop_info":
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("GET", "/shop/get_shop_info"), null, 2) }] };

      case "list_orders": {
        const q: Record<string, unknown> = {
          time_range_field: a?.time_range_field ?? "create_time",
          time_from: a?.time_from,
          time_to: a?.time_to,
          page_size: a?.page_size ?? 20,
        };
        if (a?.cursor !== undefined) q.cursor = a.cursor;
        if (a?.order_status !== undefined) q.order_status = a.order_status;
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("GET", "/order/get_order_list", q), null, 2) }] };
      }

      case "get_order_detail": {
        const q: Record<string, unknown> = { order_sn_list: a?.order_sn_list };
        if (a?.response_optional_fields !== undefined) q.response_optional_fields = a.response_optional_fields;
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("GET", "/order/get_order_detail", q), null, 2) }] };
      }

      case "ship_order": {
        const body: Record<string, unknown> = { order_sn: a?.order_sn };
        if (a?.package_number !== undefined) body.package_number = a.package_number;
        if (a?.pickup !== undefined) body.pickup = a.pickup;
        if (a?.dropoff !== undefined) body.dropoff = a.dropoff;
        if (a?.non_integrated !== undefined) body.non_integrated = a.non_integrated;
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("POST", "/order/ship_order", undefined, body), null, 2) }] };
      }

      case "cancel_order": {
        const body: Record<string, unknown> = {
          order_sn: a?.order_sn,
          cancel_reason: a?.cancel_reason,
        };
        if (a?.item_list !== undefined) body.item_list = a.item_list;
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("POST", "/order/cancel_order", undefined, body), null, 2) }] };
      }

      case "list_products": {
        const q: Record<string, unknown> = {
          offset: a?.offset ?? 0,
          page_size: a?.page_size ?? 20,
        };
        if (a?.item_status !== undefined) q.item_status = a.item_status;
        if (a?.update_time_from !== undefined) q.update_time_from = a.update_time_from;
        if (a?.update_time_to !== undefined) q.update_time_to = a.update_time_to;
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("GET", "/product/get_item_list", q), null, 2) }] };
      }

      case "get_product_detail": {
        const q: Record<string, unknown> = { item_id_list: a?.item_id_list };
        if (a?.need_tax_info !== undefined) q.need_tax_info = a.need_tax_info;
        if (a?.need_complaint_policy !== undefined) q.need_complaint_policy = a.need_complaint_policy;
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("GET", "/product/get_item_base_info", q), null, 2) }] };
      }

      case "update_product_stock": {
        const body = { item_id: a?.item_id, stock_list: a?.stock_list };
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("POST", "/product/update_stock", undefined, body), null, 2) }] };
      }

      case "update_product_price": {
        const body = { item_id: a?.item_id, price_list: a?.price_list };
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("POST", "/product/update_price", undefined, body), null, 2) }] };
      }

      case "get_shipment_list": {
        const q: Record<string, unknown> = { page_size: a?.page_size ?? 20 };
        if (a?.cursor !== undefined) q.cursor = a.cursor;
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("GET", "/order/get_shipment_list", q), null, 2) }] };
      }

      case "get_return_list": {
        const q: Record<string, unknown> = {
          page_no: a?.page_no ?? 1,
          page_size: a?.page_size ?? 20,
        };
        if (a?.create_time_from !== undefined) q.create_time_from = a.create_time_from;
        if (a?.create_time_to !== undefined) q.create_time_to = a.create_time_to;
        if (a?.status !== undefined) q.status = a.status;
        if (a?.negotiation_status !== undefined) q.negotiation_status = a.negotiation_status;
        if (a?.seller_proof_status !== undefined) q.seller_proof_status = a.seller_proof_status;
        if (a?.seller_compensation_status !== undefined) q.seller_compensation_status = a.seller_compensation_status;
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("GET", "/returns/get_return_list", q), null, 2) }] };
      }

      case "confirm_return": {
        const body = { return_sn: a?.return_sn };
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("POST", "/returns/confirm", undefined, body), null, 2) }] };
      }

      case "add_item": {
        const body = (a?.item ?? {}) as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("POST", "/product/add_item", undefined, body), null, 2) }] };
      }

      case "update_item": {
        const patch = (a?.patch ?? {}) as Record<string, unknown>;
        const body: Record<string, unknown> = { item_id: a?.item_id, ...patch };
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("POST", "/product/update_item", undefined, body), null, 2) }] };
      }

      case "delete_item": {
        const body = { item_id: a?.item_id };
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("POST", "/product/delete_item", undefined, body), null, 2) }] };
      }

      case "get_shipping_parameter": {
        const q: Record<string, unknown> = { order_sn: a?.order_sn };
        if (a?.package_number !== undefined) q.package_number = a.package_number;
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("GET", "/logistics/get_shipping_parameter", q), null, 2) }] };
      }

      case "get_tracking_number": {
        const q: Record<string, unknown> = { order_sn: a?.order_sn };
        if (a?.package_number !== undefined) q.package_number = a.package_number;
        if (a?.response_optional_fields !== undefined) q.response_optional_fields = a.response_optional_fields;
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("GET", "/logistics/get_tracking_number", q), null, 2) }] };
      }

      case "download_shipping_document": {
        const body: Record<string, unknown> = { order_list: a?.order_list };
        if (a?.shipping_document_type !== undefined) body.shipping_document_type = a.shipping_document_type;
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("POST", "/logistics/download_shipping_document", undefined, body), null, 2) }] };
      }

      case "accept_return_offer": {
        const body = { return_sn: a?.return_sn };
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("POST", "/returns/accept_offer", undefined, body), null, 2) }] };
      }

      case "add_discount": {
        const body = {
          discount_name: a?.discount_name,
          start_time: a?.start_time,
          end_time: a?.end_time,
        };
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("POST", "/discount/add_discount", undefined, body), null, 2) }] };
      }

      case "add_bundle_deal": {
        const body: Record<string, unknown> = {
          rule_type: a?.rule_type,
          start_time: a?.start_time,
          end_time: a?.end_time,
          name: a?.name,
        };
        if (a?.discount_value !== undefined) body.discount_value = a.discount_value;
        if (a?.fix_price !== undefined) body.fix_price = a.fix_price;
        if (a?.min_amount !== undefined) body.min_amount = a.min_amount;
        if (a?.purchase_limit !== undefined) body.purchase_limit = a.purchase_limit;
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("POST", "/bundle_deal/add_bundle_deal", undefined, body), null, 2) }] };
      }

      case "send_chat_message": {
        const body: Record<string, unknown> = {
          to_id: a?.to_id,
          message_type: a?.message_type ?? "text",
          content: a?.content,
        };
        return { content: [{ type: "text", text: JSON.stringify(await shopeeRequest("POST", "/sellerchat/send_message", undefined, body), null, 2) }] };
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
        const s = new Server({ name: "mcp-shopee", version: "0.2.0-alpha.1" }, { capabilities: { tools: {} } });
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
