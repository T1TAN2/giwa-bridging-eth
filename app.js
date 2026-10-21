/**
 * GIWA Bridge — app.js
 * Uses window.ethereum (MetaMask) + ethers v6 via CDN
 * Bridges ETH from Ethereum Sepolia (L1) → GIWA Sepolia (L2)
 * via the OptimismPortal depositTransaction function.
 */

// ── Constants ────────────────────────────────────────────────
const SEPOLIA_CHAIN_ID    = 11155111n;
const GIWA_CHAIN_ID       = 91342n;
const OPTIMISM_PORTAL_ADDR = "0x956962C34687A954e611A83619ABaA37Ce6bC78A";

const GIWA_CHAIN_PARAMS = {
  chainId: "0x164BE",       // 91342 in hex
  chainName: "GIWA Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://sepolia-rpc.giwa.io"],
  blockExplorerUrls: ["https://sepolia-explorer.giwa.io"],
};

// OptimismPortal ABI — only the depositTransaction function + event
const PORTAL_ABI = [
  {
    type: "function",
    name: "depositTransaction",
    stateMutability: "payable",
    inputs: [
      { name: "_to",          type: "address" },
      { name: "_value",       type: "uint256" },
      { name: "_gasLimit",    type: "uint64"  },
      { name: "_isCreation",  type: "bool"    },
      { name: "_data",        type: "bytes"   },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "TransactionDeposited",
    inputs: [
      { name: "from",        type: "address", indexed: true  },
      { name: "to",          type: "address", indexed: true  },
      { name: "version",     type: "uint256", indexed: true  },
      { name: "opaqueData",  type: "bytes",   indexed: false },
    ],
  },
];

const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const GIWA_RPC    = "https://sepolia-rpc.giwa.io";

// ── DOM refs ─────────────────────────────────────────────────
const connectBtn       = document.getElementById("connectBtn");
const connectBtnText   = document.getElementById("connectBtnText");
const bridgeBtn        = document.getElementById("bridgeBtn");
const bridgeBtnText    = document.getElementById("bridgeBtnText");
const amountInput      = document.getElementById("amountInput");
const maxBtn           = document.getElementById("maxBtn");
const sepoliaBalanceVal= document.getElementById("sepoliaBalanceVal");
const giwaBalanceVal   = document.getElementById("giwaBalanceVal");
const statusArea       = document.getElementById("statusArea");
const errorBox         = document.getElementById("errorBox");
const inputHint        = document.getElementById("inputHint");

// ── State ────────────────────────────────────────────────────
let userAddress   = null;
let isBridging    = false;

// ── Ethers v6 lazy loader ─────────────────────────────────────
function loadEthers() {
  return new Promise((resolve, reject) => {
    if (window.ethers) { resolve(window.ethers); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.4/ethers.umd.min.js";
    s.onload  = () => resolve(window.ethers);
    s.onerror = () => reject(new Error("Failed to load ethers.js"));
    document.head.appendChild(s);
  });
}

// ── Helpers ───────────────────────────────────────────────────
function shortAddr(addr) {
  return addr ? `${addr.slice(0,6)}…${addr.slice(-4)}` : "";
}
function fmt(wei, decimals = 5) {
  const e = window.ethers?.formatEther(wei) ?? "0";
  return parseFloat(e).toFixed(decimals).replace(/\.?0+$/, "") || "0";
}
function showError(msg) {
  errorBox.textContent = msg;
  errorBox.style.display = "block";
}
function hideError() {
  errorBox.style.display = "none";
  errorBox.textContent = "";
}
function setStep(n, state, desc) {
  const el = document.getElementById(`step${n}`);
  const descEl = document.getElementById(`step${n}Desc`);
  el.className = `step ${state}`;
  if (desc !== undefined) descEl.innerHTML = desc;
}
function resetSteps() {
  [1,2,3].forEach(n => setStep(n, "", n === 1 ? "Waiting..." : "Pending"));
}

// ── Balance fetcher ───────────────────────────────────────────
async function refreshBalances(ethers, address) {
  try {
    const l1 = new ethers.JsonRpcProvider(SEPOLIA_RPC);
    const l2 = new ethers.JsonRpcProvider(GIWA_RPC);
    const [b1, b2] = await Promise.all([
      l1.getBalance(address),
      l2.getBalance(address),
    ]);
    sepoliaBalanceVal.textContent = fmt(b1);
    giwaBalanceVal.textContent    = fmt(b2);
    return b1; // return L1 balance for MAX button
  } catch {
    sepoliaBalanceVal.textContent = "Error";
    giwaBalanceVal.textContent    = "Error";
    return 0n;
  }
}

// ── Connect wallet ────────────────────────────────────────────
async function connectWallet() {
  if (!window.ethereum) {
    showError("MetaMask not detected. Please install MetaMask and refresh.");
    return;
  }
  try {
    const ethers = await loadEthers();
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    userAddress = accounts[0];

    connectBtnText.textContent = shortAddr(userAddress);
    connectBtn.classList.add("connected");
    bridgeBtnText.textContent = "Bridge ETH →";
    bridgeBtn.disabled = false;

    await refreshBalances(ethers, userAddress);
  } catch (err) {
    showError(err.message ?? "Failed to connect wallet.");
  }
}

// ── Max button ────────────────────────────────────────────────
maxBtn.addEventListener("click", async () => {
  if (!userAddress) return;
  const ethers = await loadEthers();
  const l1 = new ethers.JsonRpcProvider(SEPOLIA_RPC);
  const bal = await l1.getBalance(userAddress);
  // Leave ~0.002 ETH for gas
  const gas = ethers.parseEther("0.002");
  const max = bal > gas ? bal - gas : 0n;
  amountInput.value = ethers.formatEther(max).slice(0, 10);
});

// ── Bridge ────────────────────────────────────────────────────
async function bridge() {
  if (isBridging || !userAddress) return;
  hideError();

  const amtStr = amountInput.value.trim();
  if (!amtStr || isNaN(parseFloat(amtStr)) || parseFloat(amtStr) <= 0) {
    showError("Please enter a valid ETH amount.");
    return;
  }

  const ethers = await loadEthers();
  const mint = ethers.parseEther(amtStr);

  // Ensure on Sepolia
  const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
  const chainId = BigInt(chainIdHex);
  if (chainId !== SEPOLIA_CHAIN_ID) {
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });
    } catch {
      showError("Please switch to Ethereum Sepolia in MetaMask.");
      return;
    }
  }

  isBridging = true;
  bridgeBtn.disabled = true;
  bridgeBtnText.textContent = "Bridging…";
  statusArea.style.display = "block";
  resetSteps();
  setStep(1, "active", "Awaiting MetaMask confirmation…");

  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();

    const portal = new ethers.Contract(OPTIMISM_PORTAL_ADDR, PORTAL_ABI, signer);

    // ── Step 1: send depositTransaction on L1 ──
    const tx = await portal.depositTransaction(
      userAddress,  // _to
      mint,         // _value (minted on L2)
      200000n,      // _gasLimit (sufficient for ETH deposit)
      false,        // _isCreation
      "0x",         // _data
      { value: mint }
    );

    setStep(1, "done",
      `Sent — <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank">view on Etherscan ↗</a>`
    );
    setStep(2, "active", "Waiting for L1 confirmation…");

    // ── Step 2: wait for L1 receipt ──
    const receipt = await tx.wait(1);
    setStep(2, "done", `Confirmed in block ${receipt.blockNumber}`);
    setStep(3, "active", "GIWA sequencer crediting your wallet (1–3 min)…");

    // ── Step 3: poll GIWA balance until it increases ──
    const l2 = new ethers.JsonRpcProvider(GIWA_RPC);
    const balBefore = await l2.getBalance(userAddress);
    const deadline  = Date.now() + 5 * 60 * 1000; // 5 min max

    await new Promise((resolve, reject) => {
      const poll = setInterval(async () => {
        try {
          const bal = await l2.getBalance(userAddress);
          giwaBalanceVal.textContent = fmt(bal);
          if (bal > balBefore || Date.now() > deadline) {
            clearInterval(poll);
            resolve();
          }
        } catch { /* keep polling */ }
      }, 5000);
    });

    setStep(3, "done", `✓ ${amtStr} ETH arrived on GIWA Sepolia`);
    bridgeBtnText.textContent = "Bridge Again";

    // Refresh both balances
    await refreshBalances(ethers, userAddress);

  } catch (err) {
    const msg = err?.info?.error?.message ?? err?.shortMessage ?? err?.message ?? "Transaction failed.";
    showError(msg);
    resetSteps();
    bridgeBtnText.textContent = "Bridge ETH →";
    statusArea.style.display = "none";
  } finally {
    isBridging = false;
    bridgeBtn.disabled = false;
  }
}

// ── Event listeners ───────────────────────────────────────────
connectBtn.addEventListener("click", connectWallet);
bridgeBtn.addEventListener("click", bridge);

// Auto-reconnect if already connected
window.addEventListener("load", async () => {
  if (!window.ethereum) return;
  try {
    const accounts = await window.ethereum.request({ method: "eth_accounts" });
    if (accounts.length > 0) {
      const ethers = await loadEthers();
      userAddress = accounts[0];
      connectBtnText.textContent = shortAddr(userAddress);
      connectBtn.classList.add("connected");
      bridgeBtnText.textContent = "Bridge ETH →";
      bridgeBtn.disabled = false;
      await refreshBalances(ethers, userAddress);
    }
  } catch { /* silent */ }
});

// Account / chain change handlers
if (window.ethereum) {
  window.ethereum.on("accountsChanged", (accounts) => {
    if (accounts.length === 0) {
      userAddress = null;
      connectBtnText.textContent = "Connect Wallet";
      connectBtn.classList.remove("connected");
      bridgeBtn.disabled = true;
      bridgeBtnText.textContent = "Connect Wallet to Bridge";
      sepoliaBalanceVal.textContent = "—";
      giwaBalanceVal.textContent    = "—";
    } else {
      userAddress = accounts[0];
      connectBtnText.textContent = shortAddr(userAddress);
      loadEthers().then(e => refreshBalances(e, userAddress));
    }
  });

  window.ethereum.on("chainChanged", () => window.location.reload());
}
