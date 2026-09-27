import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let listToolsHandler: Function;
let callToolHandler: Function;

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => {
  class FakeServer {
    constructor() {}
    setRequestHandler(schema: any, handler: Function) {
      if (JSON.stringify(schema).includes("tools/list")) listToolsHandler = handler;
      if (JSON.stringify(schema).includes("tools/call")) callToolHandler = handler;
    }
    connect() { return Promise.resolve(); }
  }
  return { Server: FakeServer };
});

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({ StdioServerTransport: class {} }));

process.env.CELCOIN_CLIENT_ID = "test-id";
process.env.CELCOIN_CLIENT_SECRET = "test-secret";

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// The first fetch a Celcoin call makes is always POST /v5/token. Queue the OAuth
// token, then the endpoint's own response, and assert on the LAST fetch call.
const tokenResponse = () => ({ ok: true, json: () => Promise.resolve({ access_token: "tok", expires_in: 3600 }) });
const okJson = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) });

function lastCall() {
  return mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
}
function lastBody() {
  return JSON.parse(lastCall()[1].body);
}

async function loadServer() {
  vi.resetModules();
  listToolsHandler = undefined as any;
  callToolHandler = undefined as any;
  await import("../index.js");
}

beforeEach(async () => {
  delete process.env.CELCOIN_SANDBOX;
  mockFetch.mockReset();
  global.fetch = mockFetch as any;
  // Default: every fetch returns a token (enough for the "18 tools" listing test).
  mockFetch.mockResolvedValue(tokenResponse());
  await loadServer();
});

afterEach(() => {
  delete process.env.CELCOIN_SANDBOX;
});

describe("mcp-celcoin", () => {
  it("should register 18 tools", async () => {
    const result = await listToolsHandler();
    expect(result.tools).toHaveLength(18);
  });

  it("should call correct API endpoint for get_balance", async () => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(okJson({ balance: 1000 }));

    await callToolHandler({ params: { name: "get_balance", arguments: {} } });

    expect(lastCall()[0]).toContain("/v5/merchant/balance");
  });

  describe("read_barcode (authorize)", () => {
    it("POSTs to /v5/transactions/billpayments/authorize with barCode {type, digitable}", async () => {
      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(okJson({ transactionId: 9001, totalUpdated: 150.5, allowChangeValue: false }));

      await callToolHandler({
        params: { name: "read_barcode", arguments: { barcode: "846700000017", barcodeType: 1 } },
      });

      const [url, opts] = lastCall();
      expect(url).toContain("/v5/transactions/billpayments/authorize");
      expect(url).not.toContain("?barCode=");
      expect(opts.method).toBe("POST");
      expect(lastBody()).toMatchObject({ barCode: { type: 1, digitable: "846700000017" } });
    });

    it("defaults barcode type to 2 (ficha de compensação) when omitted", async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(okJson({ transactionId: 1 }));

      await callToolHandler({ params: { name: "read_barcode", arguments: { barcode: "34191790010104351004791020150008291070026000" } } });

      expect(lastBody().barCode.type).toBe(2);
    });
  });

  describe("pay_bill (confirm)", () => {
    it("carries transactionIdAuthorize, cpfcnpj, billData and externalNSU (errorCode-44 regression guard)", async () => {
      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(okJson({ transactionId: 9001, status: "CONFIRMED" }));

      await callToolHandler({
        params: {
          name: "pay_bill",
          arguments: {
            barcode: "846700000017",
            barcodeType: 1,
            transactionIdAuthorize: "9001",
            amount: 150.5,
            originalValue: 150.5,
            dueDate: "2026-07-10",
            cpfcnpj: "12345678909",
            externalNSU: 42,
          },
        },
      });

      const [url, opts] = lastCall();
      expect(url).toContain("/v5/transactions/billpayments");
      expect(url).not.toContain("/authorize");
      expect(opts.method).toBe("POST");
      const body = lastBody();
      expect(body).toMatchObject({
        transactionIdAuthorize: "9001",
        cpfcnpj: "12345678909",
        externalNSU: 42,
        barCode: { type: 1, digitable: "846700000017" },
        billData: { value: 150.5, originalValue: 150.5 },
        dueDate: "2026-07-10",
      });
      // The old bare `amount` field must be gone — its absence is the fix for
      // Celcoin errorCode 44 "Valor nao permitido".
      expect(body.amount).toBeUndefined();
    });
  });

  describe("create_boleto (issuance)", () => {
    it("POSTs to /billissuance/v1/bill", async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(okJson({ transactionId: "b1" }));

      await callToolHandler({
        params: {
          name: "create_boleto",
          arguments: { amount: 99, dueDate: "2026-08-01", payerName: "Ana", payerDocument: "12345678909" },
        },
      });

      const [url, opts] = lastCall();
      expect(url).toContain("/billissuance/v1/bill");
      expect(url).not.toContain("/v5/transactions/billpayments/bankslip");
      expect(opts.method).toBe("POST");
    });
  });

  describe("get_boleto / cancel_boleto (issuance)", () => {
    it("get_boleto GETs /billissuance/v1/bill/:id", async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(okJson({ id: "b1" }));

      await callToolHandler({ params: { name: "get_boleto", arguments: { transactionId: "b1" } } });

      const [url, opts] = lastCall();
      expect(url).toContain("/billissuance/v1/bill/b1");
      expect(opts.method).toBe("GET");
    });

    it("cancel_boleto DELETEs /billissuance/v1/bill/:id", async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(okJson({ status: "CANCELLED" }));

      await callToolHandler({ params: { name: "cancel_boleto", arguments: { transactionId: "b1" } } });

      const [url, opts] = lastCall();
      expect(url).toContain("/billissuance/v1/bill/b1");
      expect(opts.method).toBe("DELETE");
    });
  });

  describe("sandbox host", () => {
    it("uses sandbox.openfinance.celcoin.dev (not the dead sandbox-api host) when CELCOIN_SANDBOX=true", async () => {
      process.env.CELCOIN_SANDBOX = "true";
      await loadServer();
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(okJson({ balance: 1 }));

      await callToolHandler({ params: { name: "get_balance", arguments: {} } });

      const url = lastCall()[0];
      expect(url).toContain("sandbox.openfinance.celcoin.dev");
      expect(url).not.toContain("sandbox-api.celcoin.com.br");
    });

    it("uses api.openfinance.celcoin.com.br (not the dead api-sec host) when CELCOIN_SANDBOX is unset", async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(okJson({ balance: 1 }));

      await callToolHandler({ params: { name: "get_balance", arguments: {} } });

      // Both calls, token and endpoint, go to the production host.
      const [tokenUrl] = mockFetch.mock.calls[0];
      const url = lastCall()[0];
      expect(tokenUrl).toBe("https://api.openfinance.celcoin.com.br/v5/token");
      expect(url.startsWith("https://api.openfinance.celcoin.com.br/")).toBe(true);
      expect(url).not.toContain("api-sec.celcoin.com.br");
    });

    it("CELCOIN_BASE_URL overrides the host in both modes", async () => {
      process.env.CELCOIN_BASE_URL = "https://celcoin-proxy.internal.test";
      process.env.CELCOIN_SANDBOX = "true";
      try {
        await loadServer();
        mockFetch.mockReset();
        mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(okJson({ balance: 1 }));

        await callToolHandler({ params: { name: "get_balance", arguments: {} } });

        expect(mockFetch.mock.calls[0][0]).toBe("https://celcoin-proxy.internal.test/v5/token");
        expect(lastCall()[0].startsWith("https://celcoin-proxy.internal.test/")).toBe(true);
      } finally {
        delete process.env.CELCOIN_BASE_URL;
      }
    });
  });

  describe("error handling", () => {
    it("returns isError true on a 400 confirm response", async () => {
      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce({ ok: false, status: 400, text: () => Promise.resolve('{"errorCode":"44"}') });

      const result = await callToolHandler({
        params: { name: "pay_bill", arguments: { barcode: "1", amount: 1, transactionIdAuthorize: "1" } },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("400");
    });

    it("returns isError true for an unknown tool", async () => {
      const result = await callToolHandler({ params: { name: "nonexistent", arguments: {} } });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown tool");
    });
  });
});
