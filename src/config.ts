import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  publicActionsL1,
  publicActionsL2,
  walletActionsL1,
  walletActionsL2,
} from "viem/op-stack";
import { sepolia, giwaSepolia } from "viem/chains";

// Load and validate the wallet private key
const rawKey = process.env.TEST_PRIVATE_KEY;
if (!rawKey) {
  throw new Error(
    "TEST_PRIVATE_KEY is not set. Run: export TEST_PRIVATE_KEY=0x..."
  );
}
const PRIVATE_KEY = (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`;
export const account = privateKeyToAccount(PRIVATE_KEY);

// Optional RPC overrides. The default public Sepolia RPC is often rate-limited.
// Get a free one from Alchemy, Infura or similar and run:
//   export SEPOLIA_RPC_URL=https://...
const SEPOLIA_RPC = process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const GIWA_RPC = process.env.GIWA_RPC_URL || undefined; // falls back to https://sepolia-rpc.giwa.io

// Read Ethereum Sepolia (L1)
export const publicClientL1 = createPublicClient({
  chain: sepolia,
  transport: http(SEPOLIA_RPC),
}).extend(publicActionsL1());

// Send transactions on Ethereum Sepolia (L1)
export const walletClientL1 = createWalletClient({
  account,
  chain: sepolia,
  transport: http(SEPOLIA_RPC),
}).extend(walletActionsL1());

// Read GIWA Sepolia (L2)
export const publicClientL2 = createPublicClient({
  chain: giwaSepolia,
  transport: http(GIWA_RPC),
}).extend(publicActionsL2());

// Send transactions on GIWA Sepolia (L2)
export const walletClientL2 = createWalletClient({
  account,
  chain: giwaSepolia,
  transport: http(GIWA_RPC),
}).extend(walletActionsL2());
