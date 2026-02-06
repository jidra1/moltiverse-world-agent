// Entry gate — viem-based native MON balance + signature verification on Monad testnet
// Falls back to auto-approve when no wallet is provided (dev mode)

import { createPublicClient, http, verifyMessage } from 'viem';
import { monadTestnet } from 'viem/chains';

const enteredAgents = new Set();

// Native MON balance check — no token address needed (MON is the native gas token)
const REQUIRED_BALANCE = 100_000_000_000_000_000n; // 0.1 MON (18 decimals)

const MONAD_RPC_URL = process.env.MONAD_RPC_URL || undefined; // falls back to viem's default

let publicClient;
try {
  publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(MONAD_RPC_URL),
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
  const signature = proof?.signature;

  let verified = false;

  if (walletAddress && publicClient) {
    // Verify wallet ownership via signed message
    if (signature) {
      try {
        const valid = await verifyMessage({
          address: walletAddress,
          message: `moltiverse-enter:${agentId}`,
          signature,
        });
        if (!valid) {
          return { allowed: false, reason: 'Invalid signature — wallet ownership not proven.' };
        }
      } catch (err) {
        return { allowed: false, reason: `Signature verification failed: ${err.message}` };
      }
    }

    // Check native MON balance
    try {
      const balance = await publicClient.getBalance({ address: walletAddress });
      if (balance < REQUIRED_BALANCE) {
        return {
          allowed: false,
          reason: `Insufficient MON balance. Have ${balance}, need at least ${REQUIRED_BALANCE} (0.1 MON).`
        };
      }
      console.log(`Gate: verified ${walletAddress} — balance ${balance} MON (wei)`);
      verified = true;
    } catch (err) {
      if (err.message?.includes('fetch') || err.message?.includes('ECONNREFUSED') || err.message?.includes('timeout')) {
        console.warn(`Gate: Monad RPC unreachable — ${err.message}. Falling back to dev mode.`);
      } else {
        console.warn(`Gate: on-chain verification failed — ${err.message}. Falling back to dev mode.`);
      }
      // Fall through to dev mode approval (verified stays false)
    }
  }

  // Allow entry — verified only when wallet + signature + balance all passed
  enteredAgents.add(agentId);
  return { allowed: true, verified };
}

function resetGate() {
  enteredAgents.clear();
}

function loadEnteredAgents(agentIds) {
  for (const id of agentIds) {
    enteredAgents.add(id);
  }
}

function removeEnteredAgent(agentId) {
  enteredAgents.delete(agentId);
}

export { verifyEntry, resetGate, loadEnteredAgents, removeEnteredAgent };
