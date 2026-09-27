# x402 Demo — HTTP Micropayments on Base Sepolia

End-to-end demo of the x402 protocol: an AI agent paying for premium API data with USDC micropayments at the HTTP layer.

## How it works

1. Server protects endpoints with `$0.001` and `$0.01` USDC paywalls
2. Client (agent) requests data → receives `HTTP 402 Payment Required`
3. Client automatically signs a USDC permit and retries
4. Server verifies via Coinbase facilitator → serves data
5. Facilitator settles the USDC transfer on-chain

## Setup

### 1. Install

```bash
npm install
```

### 2. Fund the client wallet

Go to [Coinbase Faucet](https://portal.cdp.coinbase.com/products/faucet), select **Base Sepolia**, and paste:

```
0xaEBC4296cc8045D1480de2d497234bD38cA2A11A
```

This gives you testnet ETH (gas) + testnet USDC.

### 3. Run

```bash
# Terminal 1 — start the server
npm run server

# Terminal 2 — run the client
npm run client
```

## Expected output

```
  x402 Client — Payer: 0xaEBC...

  [1] GET /api/health (free)
      → { status: "ok", protocol: "x402" }

  [2] GET /api/market-data ($0.001 USDC)
      Agent detects 402 → signs USDC permit → retries...
      → Paid! Response: { pairs: [...] }

  [3] GET /api/premium-analysis ($0.01 USDC)
      Agent detects 402 → signs USDC permit → retries...
      → Paid! Response: { analysis: "...", signals: [...] }

  Done. Two x402 micropayments completed on Base Sepolia.
```

## Integration with CodeSpar

`@codespar/mcp-x402` was meant to wrap this flow in a `pay_request` tool. It is deprecated: its default host, `api.x402.org`, does not resolve, so none of its tools reach a service. This demo does not use it: it calls a facilitator directly (the public one on Base Sepolia, Coinbase CDP on mainnet).

## Links

- [x402 Protocol](https://github.com/coinbase/x402)
- [@codespar/mcp-x402](https://www.npmjs.com/package/@codespar/mcp-x402) (deprecated: no live endpoint)
- [Coinbase Faucet](https://portal.cdp.coinbase.com/products/faucet)
