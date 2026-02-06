// Resource spawning and trade logic

import { GRID_SIZE, getTile, logEvent, AGENT_CLASSES } from './world.js';

const MAX_RESOURCE_PER_TILE = 5;
const RESOURCE_REGEN_INTERVAL = 10; // ticks
const RESOURCE_SCORE = { wood: 5, stone: 10, gold: 25 };
const VALID_RESOURCES = new Set(['wood', 'stone', 'gold']);

// --- Pending Trades ---
// Key: targetId, Value: { from, targetId, offer, request, tick }
const pendingTrades = new Map();
const TRADE_EXPIRY_TICKS = 30;

function regenerateResources(world) {
  if (world.tick % RESOURCE_REGEN_INTERVAL !== 0) return;

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const tile = world.grid[y][x];
      if (tile.resource && tile.resourceCount < MAX_RESOURCE_PER_TILE) {
        tile.resourceCount++;
      }
    }
  }
}

function gatherResource(world, agentId) {
  const agent = world.agents[agentId];
  if (!agent || !agent.alive) return { success: false, reason: 'Agent not found or dead' };

  const tile = getTile(world, agent.x, agent.y);
  if (!tile.resource || tile.resourceCount <= 0) {
    return { success: false, reason: 'No resources on this tile' };
  }

  // Check inventory capacity (max 20)
  const totalItems = Object.values(agent.inventory).reduce((a, b) => a + b, 0);
  if (totalItems >= 20) {
    return { success: false, reason: 'Inventory full (max 20)' };
  }

  // Gatherer class gathers double
  const gatherMultiplier = (AGENT_CLASSES[agent.class]?.gatherMultiplier) || 1;
  const amount = Math.min(gatherMultiplier, tile.resourceCount, 20 - totalItems);

  tile.resourceCount -= amount;
  agent.inventory[tile.resource] = (agent.inventory[tile.resource] || 0) + amount;
  agent.score += (RESOURCE_SCORE[tile.resource] || 10) * amount;

  logEvent(world, {
    type: 'gather',
    agent: agentId,
    resource: tile.resource,
    amount,
    x: agent.x,
    y: agent.y
  });

  return {
    success: true,
    resource: tile.resource,
    amount,
    inventory: { ...agent.inventory },
    tileRemaining: tile.resourceCount
  };
}

function validateTradeAmounts(items) {
  for (const [resource, amount] of Object.entries(items)) {
    if (!VALID_RESOURCES.has(resource)) {
      return `Invalid resource: ${resource}. Must be one of: wood, stone, gold`;
    }
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 0) {
      return `Invalid amount for ${resource}: must be a non-negative integer`;
    }
  }
  return null;
}

function proposeTrade(world, agentId, targetId, offer, request) {
  const agent = world.agents[agentId];
  const target = world.agents[targetId];

  if (!agent || !target) return { success: false, reason: 'Agent not found' };
  if (!agent.alive || !target.alive) return { success: false, reason: 'Agent is dead' };
  if (agentId === targetId) return { success: false, reason: 'Cannot trade with yourself' };

  // Reject empty trades (both sides zero/empty)
  const offerTotal = Object.values(offer).reduce((a, b) => a + b, 0);
  const requestTotal = Object.values(request).reduce((a, b) => a + b, 0);
  if (offerTotal === 0 && requestTotal === 0) {
    return { success: false, reason: 'Trade must include at least one resource' };
  }

  // Validate amounts are non-negative integers
  const offerErr = validateTradeAmounts(offer);
  if (offerErr) return { success: false, reason: offerErr };
  const requestErr = validateTradeAmounts(request);
  if (requestErr) return { success: false, reason: requestErr };

  // Must be on same tile
  if (agent.x !== target.x || agent.y !== target.y) {
    return { success: false, reason: 'Target not on same tile' };
  }

  // Market-only trading
  const tile = getTile(world, agent.x, agent.y);
  if (tile.type !== 'market') {
    return { success: false, reason: 'Trading is only allowed in market zones' };
  }

  // Validate offer: { resource: amount }
  for (const [resource, amount] of Object.entries(offer)) {
    if ((agent.inventory[resource] || 0) < amount) {
      return { success: false, reason: `Insufficient ${resource} to offer` };
    }
  }

  // Store pending trade (overwrites any existing proposal to same target)
  pendingTrades.set(targetId, { from: agentId, targetId, offer, request, tick: world.tick });

  logEvent(world, {
    type: 'trade_proposed',
    agent: agentId,
    target: targetId,
    offer,
    request
  });

  return { success: true, status: 'proposed', targetId };
}

function acceptTrade(world, targetId) {
  const pending = pendingTrades.get(targetId);
  if (!pending) return { success: false, reason: 'No pending trade for you' };

  const agent = world.agents[pending.from];
  const target = world.agents[targetId];

  if (!agent || !target) { pendingTrades.delete(targetId); return { success: false, reason: 'Agent not found' }; }
  if (!agent.alive || !target.alive) { pendingTrades.delete(targetId); return { success: false, reason: 'Agent is dead' }; }

  // Re-validate same tile + market
  if (agent.x !== target.x || agent.y !== target.y) {
    pendingTrades.delete(targetId);
    return { success: false, reason: 'Proposer no longer on same tile' };
  }
  const tile = getTile(world, agent.x, agent.y);
  if (tile.type !== 'market') {
    pendingTrades.delete(targetId);
    return { success: false, reason: 'No longer in a market zone' };
  }

  // Re-validate resources (non-terminal: keep trade pending so they can retry)
  for (const [resource, amount] of Object.entries(pending.offer)) {
    if ((agent.inventory[resource] || 0) < amount) {
      return { success: false, reason: `Proposer no longer has enough ${resource}` };
    }
  }
  for (const [resource, amount] of Object.entries(pending.request)) {
    if ((target.inventory[resource] || 0) < amount) {
      return { success: false, reason: `You don't have enough ${resource}` };
    }
  }

  // Inventory cap check (non-terminal: keep trade pending)
  const INVENTORY_CAP = 20;
  const agentTotal = Object.values(agent.inventory).reduce((a, b) => a + b, 0);
  const targetTotal = Object.values(target.inventory).reduce((a, b) => a + b, 0);
  const agentNetGain = Object.values(pending.request).reduce((a, b) => a + b, 0) - Object.values(pending.offer).reduce((a, b) => a + b, 0);
  const targetNetGain = Object.values(pending.offer).reduce((a, b) => a + b, 0) - Object.values(pending.request).reduce((a, b) => a + b, 0);
  if (agentTotal + agentNetGain > INVENTORY_CAP) {
    return { success: false, reason: 'Trade would exceed proposer inventory cap (20)' };
  }
  if (targetTotal + targetNetGain > INVENTORY_CAP) {
    return { success: false, reason: 'Trade would exceed your inventory cap (20)' };
  }

  // Execute swap
  for (const [resource, amount] of Object.entries(pending.offer)) {
    agent.inventory[resource] -= amount;
    target.inventory[resource] = (target.inventory[resource] || 0) + amount;
  }
  for (const [resource, amount] of Object.entries(pending.request)) {
    target.inventory[resource] -= amount;
    agent.inventory[resource] = (agent.inventory[resource] || 0) + amount;
  }

  agent.score += 20;
  target.score += 20;

  pendingTrades.delete(targetId);

  logEvent(world, {
    type: 'trade',
    agent: pending.from,
    target: targetId,
    offer: pending.offer,
    request: pending.request
  });

  return {
    success: true,
    agentInventory: { ...agent.inventory },
    targetInventory: { ...target.inventory }
  };
}

function rejectTrade(targetId) {
  if (!pendingTrades.has(targetId)) return { success: false, reason: 'No pending trade for you' };
  pendingTrades.delete(targetId);
  return { success: true, status: 'rejected' };
}

function getPendingTrade(targetId) {
  return pendingTrades.get(targetId) || null;
}

function cleanExpiredTrades(tick) {
  for (const [targetId, trade] of pendingTrades) {
    if (tick - trade.tick >= TRADE_EXPIRY_TICKS) {
      pendingTrades.delete(targetId);
    }
  }
}

export { regenerateResources, gatherResource, proposeTrade, acceptTrade, rejectTrade, getPendingTrade, cleanExpiredTrades };
