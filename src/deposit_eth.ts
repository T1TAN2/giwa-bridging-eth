import {
  publicClientL1,
  publicClientL2,
  walletClientL1,
  account,
} from "./config.js";
import { formatEther, parseEther } from "viem";
import { getL2TransactionHashes } from "viem/op-stack";

// Amount to bridge in ETH. Override with: DEPOSIT_AMOUNT=0.01 pnpm deposit
const AMOUNT = process.env.DEPOSIT_AMOUNT ?? "0.001";

async function main() {
  const mint = parseEther(AMOUNT);
  console.log(`Wallet: ${account.address}`);

  // 1. Check balances before bridging
  const l1Before = await publicClientL1.getBalance({ address: account.address });
  const l2Before = await publicClientL2.getBalance({ address: account.address });
  console.log(`Sepolia balance:      ${formatEther(l1Before)} ETH`);
  console.log(`GIWA Sepolia balance: ${formatEther(l2Before)} ETH`);

  if (l1Before <= mint) {
    throw new Error(
      `Not enough Sepolia ETH. Need more than ${AMOUNT} ETH to cover the deposit plus gas.`
    );
  }

  // 2. Build the deposit params
  const depositArgs = await publicClientL2.buildDepositTransaction({
    mint,
    to: account.address,
  });

  // 3. Send the deposit on L1 (ETH is locked in the OptimismPortal contract)
  console.log(`\nDepositing ${AMOUNT} ETH to GIWA...`);
  const depositHash = await walletClientL1.depositTransaction(depositArgs);
  console.log(`L1 deposit tx: https://sepolia.etherscan.io/tx/${depositHash}`);

  // 4. Wait for L1 confirmation
  const depositReceipt = await publicClientL1.waitForTransactionReceipt({
    hash: depositHash,
  });
  console.log(`L1 confirmed in block ${depositReceipt.blockNumber}`);

  // 5. Derive the matching L2 transaction hash and wait for it (about 1-3 minutes)
  const [l2Hash] = getL2TransactionHashes(depositReceipt);
  console.log(`L2 tx hash: ${l2Hash}`);
  console.log("Waiting for the GIWA sequencer to credit your wallet (1-3 minutes)...");

  await publicClientL2.waitForTransactionReceipt({ hash: l2Hash });

  // 6. Show the final balance
  const l2After = await publicClientL2.getBalance({ address: account.address });
  console.log(`\nDeposit complete! GIWA Sepolia balance: ${formatEther(l2After)} ETH`);
}

main().catch((err) => {
  console.error("Deposit failed:", err.shortMessage ?? err.message ?? err);
  process.exit(1);
});
