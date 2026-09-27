import { describe, it, expect, vi, beforeEach } from "vitest";

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

process.env.STONE_CLIENT_ID = "test-id";
process.env.STONE_CLIENT_SECRET = "test-secret";

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

beforeEach(async () => {
  vi.resetModules();
  listToolsHandler = undefined as any;
  callToolHandler = undefined as any;
  mockFetch.mockReset();
  global.fetch = mockFetch as any;
  mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ access_token: "tok", expires_in: 3600 }) });
  await import("../index.js");
});

describe("mcp-stone", () => {
  it("should register 21 tools", async () => {
    const result = await listToolsHandler();
    expect(result.tools).toHaveLength(21);
  });

  it("should call correct API endpoint for get_balance", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok", expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ balance: 5000 }) });

    await callToolHandler({ params: { name: "get_balance", arguments: { account_id: "acc_123" } } });

    const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    expect(lastCall[0]).toContain("/accounts/acc_123/balance");
  });

  it("gets the token from accounts.openbank.stone.com.br (not the dead login host)", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok", expires_in: 3600 }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ balance: 5000 }) });

    await callToolHandler({ params: { name: "get_balance", arguments: { account_id: "acc_123" } } });

    const [tokenUrl, tokenOpts] = mockFetch.mock.calls[0];
    expect(tokenOpts.method).toBe("POST");
    expect(tokenUrl).toBe("https://accounts.openbank.stone.com.br/auth/realms/stone_bank/protocol/openid-connect/token");
    expect(mockFetch.mock.calls[1][0]).toBe("https://api.openbank.stone.com.br/api/v1/accounts/acc_123/balance");
  });

  it("STONE_AUTH_URL overrides the token URL", async () => {
    process.env.STONE_AUTH_URL = "https://sandbox-accounts.openbank.stone.com.br/auth/realms/stone_bank/protocol/openid-connect/token";
    try {
      vi.resetModules();
      await import("../index.js");
      mockFetch.mockReset();
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ access_token: "tok", expires_in: 3600 }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ balance: 5000 }) });

      await callToolHandler({ params: { name: "get_balance", arguments: { account_id: "acc_123" } } });

      expect(mockFetch.mock.calls[0][0]).toBe(process.env.STONE_AUTH_URL);
    } finally {
      delete process.env.STONE_AUTH_URL;
    }
  });
});
