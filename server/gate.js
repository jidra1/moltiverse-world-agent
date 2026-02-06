// Entry gate — pluggable verification
// Stub: auto-approve all entries
// Replace with viem on-chain MON token verification later

const enteredAgents = new Set();

function verifyEntry(agentId, proof) {
  if (enteredAgents.has(agentId)) {
    return { allowed: false, reason: 'Agent already entered' };
  }

  // TODO: Replace with on-chain verification using viem
  // Example future implementation:
  // const hasMON = await checkMONBalance(proof.walletAddress, requiredAmount);
  // if (!hasMON) return { allowed: false, reason: 'Insufficient MON tokens' };

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
