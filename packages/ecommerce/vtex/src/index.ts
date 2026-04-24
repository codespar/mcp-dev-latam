#!/usr/bin/env node

/**
 * MCP Server for VTEX — Brazilian e-commerce platform.
 *
 * Tools (29):
 * Catalog: list_products, get_product, create_product, update_product,
 *          list_skus, create_sku, list_categories, create_category, get_catalog
 * OMS:     list_orders, get_order, update_order_status, invoice_order,
 *          track_order_invoice, cancel_order, list_customer_orders
 * Pricing: get_sku_price, update_sku_price, list_price_tables
 * Stock:   get_inventory, update_inventory, get_shipping_rates
 * Logistics: list_warehouses, create_warehouse
 * Promotions: create_promotion, list_coupons, create_coupon
 * Subscriptions: list_subscriptions, create_subscription
 * MasterData: get_masterdata_document, search_masterdata
 * Giftcards: create_giftcard, get_giftcard
 *
 * Environment:
 *   VTEX_ACCOUNT_NAME — VTEX account name
 *   VTEX_APP_KEY — API app key
 *   VTEX_APP_TOKEN — API app token
 *   VTEX_ENVIRONMENT — optional, defaults to "vtexcommercestable"
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ACCOUNT_NAME = process.env.VTEX_ACCOUNT_NAME || "";
const APP_KEY = process.env.VTEX_APP_KEY || "";
const APP_TOKEN = process.env.VTEX_APP_TOKEN || "";
const ENVIRONMENT = process.env.VTEX_ENVIRONMENT || "vtexcommercestable";
const BASE_URL = `https://${ACCOUNT_NAME}.${ENVIRONMENT}.com.br/api`;
// Pricing API lives on the cross-account host api.vtex.com/{account}
const PRICING_BASE_URL = `https://api.vtex.com/${ACCOUNT_NAME}`;

async function vtexRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  return vtexRequestAbs(method, `${BASE_URL}${path}`, body);
}

async function vtexRequestAbs(method: string, url: string, body?: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-VTEX-API-AppKey": APP_KEY,
      "X-VTEX-API-AppToken": APP_TOKEN,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`VTEX API ${res.status}: ${err}`);
  }
  // Some endpoints return 204/empty body
  const text = await res.text();
  if (!text) return { ok: true };
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

const server = new Server(
  { name: "mcp-vtex", version: "0.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ---------- Catalog ----------
    {
      name: "list_products",
      description: "List products from VTEX catalog",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "number", description: "Start index (default 1)" },
          to: { type: "number", description: "End index (default 10)" },
          categoryId: { type: "number", description: "Filter by category ID" },
        },
      },
    },
    {
      name: "get_product",
      description: "Get product details by ID",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "number", description: "Product ID" },
        },
        required: ["productId"],
      },
    },
    {
      name: "create_product",
      description: "Create a new product in the VTEX catalog",
      inputSchema: {
        type: "object",
        properties: {
          Name: { type: "string", description: "Product name" },
          CategoryId: { type: "number", description: "Category ID" },
          BrandId: { type: "number", description: "Brand ID" },
          IsVisible: { type: "boolean", description: "Product visibility (default true)" },
          Description: { type: "string", description: "Product description (HTML supported)" },
          DescriptionShort: { type: "string", description: "Short description" },
          RefId: { type: "string", description: "Reference ID (internal code)" },
          Title: { type: "string", description: "Page title (SEO)" },
          LinkId: { type: "string", description: "URL slug" },
          IsActive: { type: "boolean", description: "Active status (default true)" },
        },
        required: ["Name", "CategoryId", "BrandId"],
      },
    },
    {
      name: "update_product",
      description: "Update an existing product in the VTEX catalog",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "number", description: "Product ID to update" },
          Name: { type: "string", description: "Product name" },
          CategoryId: { type: "number", description: "Category ID" },
          BrandId: { type: "number", description: "Brand ID" },
          IsVisible: { type: "boolean", description: "Product visibility" },
          Description: { type: "string", description: "Product description" },
          IsActive: { type: "boolean", description: "Active status" },
        },
        required: ["productId"],
      },
    },
    {
      name: "list_skus",
      description: "List SKUs for a product",
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "number", description: "Product ID" },
        },
        required: ["productId"],
      },
    },
    {
      name: "create_sku",
      description: "Create a new SKU for a product",
      inputSchema: {
        type: "object",
        properties: {
          ProductId: { type: "number", description: "Parent product ID" },
          Name: { type: "string", description: "SKU name" },
          RefId: { type: "string", description: "Reference ID (internal code)" },
          PackagedHeight: { type: "number", description: "Packaged height in cm" },
          PackagedLength: { type: "number", description: "Packaged length in cm" },
          PackagedWidth: { type: "number", description: "Packaged width in cm" },
          PackagedWeightKg: { type: "number", description: "Packaged weight in kg" },
          IsActive: { type: "boolean", description: "Active status" },
        },
        required: ["ProductId", "Name"],
      },
    },
    {
      name: "list_categories",
      description: "List all categories with pagination",
      inputSchema: {
        type: "object",
        properties: {
          from: { type: "number", description: "Start index (default 1)" },
          to: { type: "number", description: "End index (default 10)" },
        },
      },
    },
    {
      name: "create_category",
      description: "Create a new category in the catalog",
      inputSchema: {
        type: "object",
        properties: {
          Name: { type: "string", description: "Category name" },
          FatherCategoryId: { type: "number", description: "Parent category ID (null for root)" },
          Title: { type: "string", description: "Page title (SEO)" },
          Description: { type: "string", description: "Category description" },
          Keywords: { type: "string", description: "SEO keywords (comma-separated)" },
          IsActive: { type: "boolean", description: "Active status (default true)" },
          ShowInStoreFront: { type: "boolean", description: "Show in store navigation" },
        },
        required: ["Name"],
      },
    },
    {
      name: "get_catalog",
      description: "Get the catalog category tree",
      inputSchema: {
        type: "object",
        properties: {
          levels: { type: "number", description: "Number of category tree levels (default 3)" },
        },
      },
    },

    // ---------- OMS / Orders ----------
    {
      name: "list_orders",
      description: "List orders with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by status (e.g., ready-for-handling, payment-approved)" },
          page: { type: "number", description: "Page number (default 1)" },
          per_page: { type: "number", description: "Items per page (default 15)" },
          q: { type: "string", description: "Search query (order ID, customer name, email)" },
          f_creationDate: { type: "string", description: "Date range filter (e.g., creationDate:[2024-01-01T00:00:00.000Z TO 2024-12-31T23:59:59.999Z])" },
        },
      },
    },
    {
      name: "get_order",
      description: "Get full OMS order details by ID",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order ID" },
        },
        required: ["orderId"],
      },
    },
    {
      name: "update_order_status",
      description: "Transition an order to the handling state (start fulfillment)",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order ID" },
        },
        required: ["orderId"],
      },
    },
    {
      name: "invoice_order",
      description: "Issue a fiscal invoice (nota fiscal) for an order",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order ID" },
          type: { type: "string", enum: ["Output", "Input"], description: "Invoice type: Output (sale) or Input (return)" },
          issuanceDate: { type: "string", description: "Issuance date in ISO 8601 format" },
          invoiceNumber: { type: "string", description: "Invoice number issued by the ERP" },
          invoiceValue: { type: "number", description: "Invoice total value in cents" },
          invoiceKey: { type: "string", description: "Fiscal key (chave da NFe)" },
          invoiceUrl: { type: "string", description: "URL to the invoice PDF/XML" },
          courier: { type: "string", description: "Shipping carrier name" },
          trackingNumber: { type: "string", description: "Tracking number" },
          trackingUrl: { type: "string", description: "Tracking URL" },
          items: {
            type: "array",
            description: "Items in the invoice",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "SKU ID" },
                price: { type: "number", description: "Item price in cents" },
                quantity: { type: "number", description: "Quantity" },
              },
            },
          },
        },
        required: ["orderId", "type", "issuanceDate", "invoiceNumber", "invoiceValue", "items"],
      },
    },
    {
      name: "track_order_invoice",
      description: "Update tracking info for a previously issued invoice",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order ID" },
          invoiceNumber: { type: "string", description: "Invoice number" },
          courier: { type: "string", description: "Carrier name" },
          trackingNumber: { type: "string", description: "Tracking number" },
          trackingUrl: { type: "string", description: "Tracking URL" },
        },
        required: ["orderId", "invoiceNumber", "trackingNumber"],
      },
    },
    {
      name: "cancel_order",
      description: "Cancel an order",
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "Order ID" },
          reason: { type: "string", description: "Reason for cancellation" },
        },
        required: ["orderId"],
      },
    },
    {
      name: "list_customer_orders",
      description: "List order history for a customer (filtered by email)",
      inputSchema: {
        type: "object",
        properties: {
          clientEmail: { type: "string", description: "Customer email" },
          page: { type: "number", description: "Page number (default 1)" },
          per_page: { type: "number", description: "Items per page" },
          status: { type: "string", description: "Filter by status" },
        },
        required: ["clientEmail"],
      },
    },

    // ---------- Pricing ----------
    {
      name: "get_sku_price",
      description: "Get pricing details for an SKU (base price, list price, markup, cost, fixed prices per trade policy)",
      inputSchema: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "SKU / item ID" },
        },
        required: ["itemId"],
      },
    },
    {
      name: "update_sku_price",
      description: "Update base/list/cost price for an SKU",
      inputSchema: {
        type: "object",
        properties: {
          itemId: { type: "string", description: "SKU / item ID" },
          basePrice: { type: "number", description: "Selling base price" },
          listPrice: { type: "number", description: "Suggested selling (crossed-out) price" },
          costPrice: { type: "number", description: "Cost price" },
          markup: { type: "number", description: "Markup percentage" },
        },
        required: ["itemId"],
      },
    },
    {
      name: "list_price_tables",
      description: "List all configured price tables (trade policies)",
      inputSchema: { type: "object", properties: {} },
    },

    // ---------- Inventory / Shipping ----------
    {
      name: "get_inventory",
      description: "Get inventory/stock for a SKU across warehouses",
      inputSchema: {
        type: "object",
        properties: {
          skuId: { type: "number", description: "SKU ID" },
        },
        required: ["skuId"],
      },
    },
    {
      name: "update_inventory",
      description: "Update inventory quantity for a SKU at a specific warehouse",
      inputSchema: {
        type: "object",
        properties: {
          skuId: { type: "number", description: "SKU ID" },
          warehouseId: { type: "string", description: "Warehouse ID" },
          quantity: { type: "number", description: "New quantity" },
          unlimitedQuantity: { type: "boolean", description: "Set unlimited quantity (default false)" },
        },
        required: ["skuId", "warehouseId", "quantity"],
      },
    },
    {
      name: "get_shipping_rates",
      description: "Simulate shipping rates for items to a postal code",
      inputSchema: {
        type: "object",
        properties: {
          postalCode: { type: "string", description: "Destination postal code (CEP)" },
          country: { type: "string", description: "Country code (default BRA)" },
          items: {
            type: "array",
            description: "Items to simulate",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "SKU ID" },
                quantity: { type: "number" },
                seller: { type: "string", description: "Seller ID (default 1)" },
              },
            },
          },
        },
        required: ["postalCode", "items"],
      },
    },

    // ---------- Logistics ----------
    {
      name: "list_warehouses",
      description: "List all warehouses configured in the account",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_warehouse",
      description: "Register a new warehouse (fulfillment center)",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Warehouse ID (slug, unique)" },
          name: { type: "string", description: "Warehouse display name" },
          warehouseDocks: {
            type: "array",
            description: "Docks (shipping origin points) attached to this warehouse",
            items: {
              type: "object",
              properties: {
                dockId: { type: "string" },
                priority: { type: "number" },
                time: { type: "string", description: "ISO 8601 duration (e.g., 00:00:00)" },
                cost: { type: "number" },
              },
            },
          },
          priority: { type: "number", description: "Priority among warehouses (lower = higher priority)" },
          isActive: { type: "boolean", description: "Active (default true)" },
        },
        required: ["id", "name"],
      },
    },

    // ---------- Promotions / Coupons ----------
    {
      name: "create_promotion",
      description: "Create a promotion/discount in VTEX",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Promotion name" },
          type: { type: "string", enum: ["regular", "combo", "forThePriceOf", "progressive", "buyAndWin", "campaign"], description: "Promotion type" },
          beginDateUtc: { type: "string", description: "Start date (ISO 8601)" },
          endDateUtc: { type: "string", description: "End date (ISO 8601)" },
          isActive: { type: "boolean", description: "Active status" },
          percentualDiscountValue: { type: "number", description: "Percentage discount (0-100)" },
          nominalDiscountValue: { type: "number", description: "Fixed discount amount" },
        },
        required: ["name", "type", "beginDateUtc", "endDateUtc"],
      },
    },
    {
      name: "list_coupons",
      description: "List all promotion coupons",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "create_coupon",
      description: "Create a promotion coupon code",
      inputSchema: {
        type: "object",
        properties: {
          utmSource: { type: "string", description: "Coupon code / UTM source (what the customer types)" },
          promotionId: { type: "string", description: "Promotion ID this coupon is tied to" },
          isArchived: { type: "boolean", description: "Archived state (default false)" },
          maxItemsPerClient: { type: "number", description: "Max usage per customer (0 = unlimited)" },
          expirationIntervalPerUse: { type: "string", description: "Time between uses (ISO 8601 duration)" },
        },
        required: ["utmSource", "promotionId"],
      },
    },

    // ---------- Subscriptions ----------
    {
      name: "list_subscriptions",
      description: "List customer subscriptions",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number (default 1)" },
          perPage: { type: "number", description: "Items per page" },
          status: { type: "string", description: "Filter by status (ACTIVE, PAUSED, CANCELED, EXPIRED)" },
        },
      },
    },
    {
      name: "create_subscription",
      description: "Create a recurring subscription for a customer (VTEX Subscriptions)",
      inputSchema: {
        type: "object",
        properties: {
          customerEmail: { type: "string", description: "Customer email" },
          title: { type: "string", description: "Subscription title" },
          nextPurchaseDate: { type: "string", description: "ISO 8601 datetime of next purchase" },
          plan: {
            type: "object",
            description: "Plan / frequency settings",
            properties: {
              frequency: {
                type: "object",
                properties: {
                  periodicity: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"] },
                  interval: { type: "number" },
                },
              },
              validity: {
                type: "object",
                properties: {
                  begin: { type: "string" },
                  end: { type: "string", description: "Optional end date" },
                },
              },
            },
          },
          shippingAddress: {
            type: "object",
            description: "Shipping address. Must include addressId or full address fields.",
          },
          purchaseSettings: {
            type: "object",
            description: "Purchase settings (currencyCode, paymentMethod, etc.)",
          },
          items: {
            type: "array",
            description: "Items in the subscription (skuId + quantity)",
            items: {
              type: "object",
              properties: {
                skuId: { type: "string" },
                quantity: { type: "number" },
              },
            },
          },
        },
        required: ["customerEmail", "plan", "shippingAddress", "purchaseSettings", "items"],
      },
    },

    // ---------- MasterData ----------
    {
      name: "get_masterdata_document",
      description: "Get a document (customer profile, custom entity) from VTEX Master Data v2",
      inputSchema: {
        type: "object",
        properties: {
          dataEntity: { type: "string", description: "Data entity name (e.g., CL for clients)" },
          id: { type: "string", description: "Document ID" },
          fields: { type: "string", description: "Comma-separated fields to return (default: all)" },
        },
        required: ["dataEntity", "id"],
      },
    },
    {
      name: "search_masterdata",
      description: "Search documents in a Master Data entity",
      inputSchema: {
        type: "object",
        properties: {
          dataEntity: { type: "string", description: "Data entity name (e.g., CL for clients)" },
          fields: { type: "string", description: "Comma-separated fields (required by VTEX)" },
          where: { type: "string", description: "Filter expression (e.g., email=customer@example.com)" },
          rangeStart: { type: "number", description: "Pagination start (default 0)" },
          rangeEnd: { type: "number", description: "Pagination end (default 10)" },
        },
        required: ["dataEntity", "fields"],
      },
    },

    // ---------- Giftcards ----------
    {
      name: "create_giftcard",
      description: "Create a gift card for a customer (GiftCard Hub)",
      inputSchema: {
        type: "object",
        properties: {
          relationName: { type: "string", description: "Unique identifier for client-gift card relationship (UUID recommended)" },
          profileId: { type: "string", description: "Customer profile ID (email or client ID)" },
          caption: { type: "string", description: "Short description of the gift card" },
          expiringDate: { type: "string", description: "Expiration date in ISO 8601 format" },
          discount: { type: "boolean", description: "Whether the gift card is a discount (default false)" },
          restrictedToOwner: { type: "boolean", description: "Restrict redemption to the owner (default false)" },
          multipleCredits: { type: "boolean", description: "Allow multiple credits (default true)" },
          multipleRedemptions: { type: "boolean", description: "Allow multiple redemptions (default true)" },
        },
        required: ["relationName", "profileId", "caption", "expiringDate"],
      },
    },
    {
      name: "get_giftcard",
      description: "Get gift card details by ID",
      inputSchema: {
        type: "object",
        properties: {
          giftCardId: { type: "string", description: "Gift card ID" },
        },
        required: ["giftCardId"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ---------- Catalog ----------
      case "list_products": {
        const from = args?.from || 1;
        const to = args?.to || 10;
        const params = args?.categoryId ? `&categoryId=${args.categoryId}` : "";
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("GET", `/catalog_system/pub/products/search?_from=${from}&_to=${to}${params}`), null, 2) }] };
      }
      case "get_product":
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("GET", `/catalog/pvt/product/${args?.productId}`), null, 2) }] };
      case "create_product": {
        const { ...productData } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("POST", "/catalog/pvt/product", productData), null, 2) }] };
      }
      case "update_product": {
        const { productId, ...productData } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("PUT", `/catalog/pvt/product/${productId}`, productData), null, 2) }] };
      }
      case "list_skus":
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("GET", `/catalog_system/pvt/sku/stockkeepingunitByProductId/${args?.productId}`), null, 2) }] };
      case "create_sku": {
        const { ...skuData } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("POST", "/catalog/pvt/stockkeepingunit", skuData), null, 2) }] };
      }
      case "list_categories": {
        const from = args?.from || 1;
        const to = args?.to || 10;
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("GET", `/catalog_system/pvt/category/GetCategoryList?_from=${from}&_to=${to}`), null, 2) }] };
      }
      case "create_category": {
        const { ...categoryData } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("POST", "/catalog/pvt/category", categoryData), null, 2) }] };
      }
      case "get_catalog": {
        const levels = args?.levels || 3;
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("GET", `/catalog_system/pub/category/tree/${levels}`), null, 2) }] };
      }

      // ---------- OMS / Orders ----------
      case "list_orders": {
        const params = new URLSearchParams();
        if (args?.status) params.set("f_status", String(args.status));
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.q) params.set("q", String(args.q));
        if (args?.f_creationDate) params.set("f_creationDate", String(args.f_creationDate));
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("GET", `/oms/pvt/orders?${params}`), null, 2) }] };
      }
      case "get_order":
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("GET", `/oms/pvt/orders/${args?.orderId}`), null, 2) }] };
      case "update_order_status":
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("POST", `/oms/pvt/orders/${args?.orderId}/start-handling`), null, 2) }] };
      case "invoice_order": {
        const { orderId, ...invoiceData } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("POST", `/oms/pvt/orders/${orderId}/invoice`, invoiceData), null, 2) }] };
      }
      case "track_order_invoice": {
        const { orderId, invoiceNumber, ...tracking } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("PUT", `/oms/pvt/orders/${orderId}/invoice/${invoiceNumber}/tracking`, tracking), null, 2) }] };
      }
      case "cancel_order": {
        const payload = args?.reason ? { reason: args.reason } : {};
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("POST", `/oms/pvt/orders/${args?.orderId}/cancel`, payload), null, 2) }] };
      }
      case "list_customer_orders": {
        const params = new URLSearchParams();
        params.set("clientEmail", String(args?.clientEmail));
        if (args?.page) params.set("page", String(args.page));
        if (args?.per_page) params.set("per_page", String(args.per_page));
        if (args?.status) params.set("status", String(args.status));
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("GET", `/oms/user/orders?${params}`), null, 2) }] };
      }

      // ---------- Pricing ----------
      case "get_sku_price":
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequestAbs("GET", `${PRICING_BASE_URL}/pricing/prices/${args?.itemId}`), null, 2) }] };
      case "update_sku_price": {
        const { itemId, ...priceData } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequestAbs("PUT", `${PRICING_BASE_URL}/pricing/prices/${itemId}`, priceData), null, 2) }] };
      }
      case "list_price_tables":
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequestAbs("GET", `${PRICING_BASE_URL}/pricing/tables`), null, 2) }] };

      // ---------- Inventory / Shipping ----------
      case "get_inventory":
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("GET", `/logistics/pvt/inventory/skus/${args?.skuId}`), null, 2) }] };
      case "update_inventory": {
        const payload = {
          quantity: args?.quantity,
          unlimitedQuantity: args?.unlimitedQuantity ?? false,
        };
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("PUT", `/logistics/pvt/inventory/skus/${args?.skuId}/warehouses/${args?.warehouseId}`, payload), null, 2) }] };
      }
      case "get_shipping_rates": {
        const payload = {
          postalCode: args?.postalCode,
          country: args?.country || "BRA",
          items: args?.items,
        };
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("POST", "/checkout/pub/orderForms/simulation", payload), null, 2) }] };
      }

      // ---------- Logistics ----------
      case "list_warehouses":
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("GET", "/logistics/pvt/configuration/warehouses"), null, 2) }] };
      case "create_warehouse": {
        const { ...warehouseData } = args as Record<string, unknown>;
        if (warehouseData.isActive === undefined) warehouseData.isActive = true;
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("POST", "/logistics/pvt/configuration/warehouses", warehouseData), null, 2) }] };
      }

      // ---------- Promotions / Coupons ----------
      case "create_promotion":
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("POST", "/rnb/pvt/calculatorconfiguration", args), null, 2) }] };
      case "list_coupons":
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("GET", "/rnb/pvt/coupon"), null, 2) }] };
      case "create_coupon": {
        const { ...couponData } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("POST", "/rnb/pvt/coupon", couponData), null, 2) }] };
      }

      // ---------- Subscriptions ----------
      case "list_subscriptions": {
        const params = new URLSearchParams();
        if (args?.page) params.set("page", String(args.page));
        if (args?.perPage) params.set("perPage", String(args.perPage));
        if (args?.status) params.set("status", String(args.status));
        const qs = params.toString();
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("GET", `/rns/pub/subscriptions${qs ? "?" + qs : ""}`), null, 2) }] };
      }
      case "create_subscription": {
        const { ...subData } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("POST", "/rns/pub/subscriptions", subData), null, 2) }] };
      }

      // ---------- MasterData ----------
      case "get_masterdata_document": {
        const qs = args?.fields ? `?_fields=${encodeURIComponent(String(args.fields))}` : "";
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("GET", `/dataentities/${args?.dataEntity}/documents/${args?.id}${qs}`), null, 2) }] };
      }
      case "search_masterdata": {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-VTEX-API-AppKey": APP_KEY,
          "X-VTEX-API-AppToken": APP_TOKEN,
          "REST-Range": `resources=${args?.rangeStart ?? 0}-${args?.rangeEnd ?? 10}`,
        };
        const params = new URLSearchParams();
        params.set("_fields", String(args?.fields));
        if (args?.where) params.set("_where", String(args.where));
        const url = `${BASE_URL}/dataentities/${args?.dataEntity}/search?${params}`;
        const res = await fetch(url, { method: "GET", headers });
        if (!res.ok) throw new Error(`VTEX API ${res.status}: ${await res.text()}`);
        const text = await res.text();
        return { content: [{ type: "text", text: text || "[]" }] };
      }

      // ---------- Giftcards ----------
      case "create_giftcard": {
        const { ...gcData } = args as Record<string, unknown>;
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("POST", "/giftcards", gcData), null, 2) }] };
      }
      case "get_giftcard":
        return { content: [{ type: "text", text: JSON.stringify(await vtexRequest("GET", `/giftcards/${args?.giftCardId}`), null, 2) }] };

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
        const s = new Server({ name: "mcp-vtex", version: "0.2.0" }, { capabilities: { tools: {} } }); (server as any)._requestHandlers.forEach((v: any, k: any) => (s as any)._requestHandlers.set(k, v)); (server as any)._notificationHandlers?.forEach((v: any, k: any) => (s as any)._notificationHandlers.set(k, v)); await s.connect(t);
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
