// Entry gate — MON payment verification on Monad mainnet
// Agents must send MON to the gate wallet and provide txHash as proof

import { createPublicClient, http, defineChain, formatEther } from 'viem';

const enteredAgents = new Set();
const usedTxHashes = new Set(); // Prevent tx reuse

// Gate wallet — agents send entry fee here
const GATE_WALLET = '0x96812d3c24B64b32DF830fDB6d38F696CBdC9935';

// Entry fee: 0.01 MON (18 decimals)
const ENTRY_FEE = 10_000_000_000_000_000n; // 0.01 MON

// Monad Mainnet chain config
const monadMainnet = defineChain({
  id: 143,
  name: 'Monad',
  network: 'monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.monad.xyz'] },
    public: { http: ['https://rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'MonadVision', url: 'https://monadvision.com' },
  },
});

const MONAD_RPC_URL = process.env.MONAD_RPC_URL || 'https://rpc.monad.xyz';

let publicClient;
try {
  publicClient = createPublicClient({
    chain: monadMainnet,
    transport: http(MONAD_RPC_URL),
  });
} catch (e) {
  console.warn('Viem client init failed:', e.message);
  publicClient = null;
}

async function verifyEntry(agentId, proof) {
  // Check if agent already entered
  if (enteredAgents.has(agentId)) {
    return { allowed: false, reason: 'Agent already entered' };
  }

  const txHash = proof?.txHash;
  const walletAddress = proof?.walletAddress;

  // Dev mode — no proof provided, allow with limited access
  if (!txHash) {
    console.log(`Gate: ${agentId} entering in DEV MODE (no txHash provided)`);
    enteredAgents.add(agentId);
    return { 
      allowed: true, 
      verified: false, 
      walletAddress: walletAddress || null,
      devMode: true,
      message: 'Dev mode: provide txHash of 0.01 MON payment for full access'
    };
  }

  // Check if tx already used
  if (usedTxHashes.has(txHash.toLowerCase())) {
    return { allowed: false, reason: 'Transaction hash already used for entry' };
  }

  // Verify transaction on-chain
  if (!publicClient) {
    console.warn('Gate: No RPC client, allowing dev mode');
    enteredAgents.add(agentId);
    return { allowed: true, verified: false, walletAddress, devMode: true };
  }

  try {
    // Fetch transaction
    const tx = await publicClient.getTransaction({ hash: txHash });
    
    if (!tx) {
      return { allowed: false, reason: 'Transaction not found on Monad' };
    }

    // Verify recipient is our gate wallet
    if (tx.to?.toLowerCase() !== GATE_WALLET.toLowerCase()) {
      return { 
        allowed: false, 
        reason: `Invalid recipient. Send to ${GATE_WALLET}, got ${tx.to}` 
      };
    }

    // Verify amount is >= entry fee
    if (tx.value < ENTRY_FEE) {
      return { 
        allowed: false, 
        reason: `Insufficient payment. Need ${formatEther(ENTRY_FEE)} MON, got ${formatEther(tx.value)} MON` 
      };
    }

    // Fetch receipt to verify success
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    
    if (!receipt || receipt.status !== 'success') {
      return { allowed: false, reason: 'Transaction failed or pending' };
    }

    // All checks passed — mark tx as used and allow entry
    usedTxHashes.add(txHash.toLowerCase());
    enteredAgents.add(agentId);
    
    console.log(`Gate: ${agentId} VERIFIED — paid ${formatEther(tx.value)} MON (tx: ${txHash.slice(0, 10)}...)`);
    
    return { 
      allowed: true, 
      verified: true, 
      walletAddress: tx.from,
      paidAmount: formatEther(tx.value),
      txHash
    };

  } catch (err) {
    console.warn(`Gate: RPC error — ${err.message}. Allowing dev mode.`);
    enteredAgents.add(agentId);
    return { 
      allowed: true, 
      verified: false, 
      walletAddress, 
      devMode: true,
      error: err.message 
    };
  }
}

function resetGate() {
  enteredAgents.clear();
  // Note: we don't clear usedTxHashes to prevent replay attacks across restarts
}

function loadEnteredAgents(agentIds) {
  for (const id of agentIds) {
    enteredAgents.add(id);
  }
}

function removeEnteredAgent(agentId) {
  enteredAgents.delete(agentId);
}

// Export gate wallet address for docs/UI
const getGateInfo = () => ({
  wallet: GATE_WALLET,
  entryFee: formatEther(ENTRY_FEE) + ' MON',
  entryFeeWei: ENTRY_FEE.toString()
});

export { verifyEntry, resetGate, loadEnteredAgents, removeEnteredAgent, getGateInfo };
