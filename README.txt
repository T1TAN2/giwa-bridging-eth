# GIWA Sepolia ETH Bridge (Ethereum Sepolia -> GIWA Sepolia)

## Prerequisites
- node (v18+)
- pnpm
- A wallet with Sepolia ETH (faucet: https://cloud.google.com/application/web3/faucet/ethereum/sepolia)

## Run

```bash
cd giwa-bridging-eth
pnpm install

# Use a throwaway TESTNET wallet only. Never use a wallet that holds real funds.
export TEST_PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY

# Bridge the default 0.001 ETH
pnpm deposit

# Or choose an amount
DEPOSIT_AMOUNT=0.01 pnpm deposit
```

The deposit usually shows up on GIWA Sepolia within 1-3 minutes.

## Notes
- Don't have a wallet? Create one with Foundry: `cast wallet new`
- Keep a little extra Sepolia ETH for L1 gas on top of the amount you bridge.
- Withdrawing back to Ethereum is a separate 3-step process (initiate, prove after up to 2 hours, finalize after about 7 days). Ask if you want that script too.
