// Entry gate — viem-based MON token verification on Monad testnet
// Falls back to auto-approve when no wallet is provided (dev mode)

import { createPublicClient, http, parseAbi } from 'viem';
import { monadTestnet } from 'viem/chains';

const enteredAgents = new Set();

// Monad testnet MON token contract
const MON_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000001'; // Native MON placeholder
const REQUIRED_BALANCE = 1_000_000_000_000_000n; // 0.001 MON (18 decimals)

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
]);

let publicClient;
try {
  publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });
} catch (e) {
  console.warn('Viem client init failed (chain may not be available):', e.message);
  publicClient = null;
}

async function verifyEntry(agentId, proof) {
  if (enteredAgents.has(agentId)) {
    return { allowed: false, reason: 'Agent already entered' };
  }

  const walletAddress = proof?.walletAddress;

  if (walletAddress && publicClient) {
    try {
      // Check native MON balance on Monad testnet
      const balance = await publicClient.getBalance({ address: walletAddress });
      if (balance < REQUIRED_BALANCE) {
        return { allowed: false, reason: 'Insufficient MON tokens. Need at least 0.001 MON.' };
      }
    } catch (err) {
      console.warn('On-chain verification failed, falling back to dev mode:', err.message);
      // Fall through to dev mode approval
    }
  }

  // Dev mode: auto-approve when no wallet or chain unavailable
  enteredAgents.add(agentId);
  return { allowed: true };
}

function resetGate() {
  enteredAgents.clear();
}

function loadEnteredAgents(agentIds) {
  for (const id of agentIds) {
    enteredAgents.add(id);
  }
}

export { verifyEntry, resetGate, loadEnteredAgents };
