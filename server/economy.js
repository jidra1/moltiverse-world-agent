// Resource spawning and trade logic

import { GRID_SIZE, getTile, logEvent, AGENT_CLASSES } from './world.js';

const MAX_RESOURCE_PER_TILE = 5;
const RESOURCE_REGEN_INTERVAL = 10; // ticks
const RESOURCE_SCORE = { wood: 5, stone: 10, gold: 25 };

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

function executeTrade(world, agentId, targetId, offer, request) {
  const agent = world.agents[agentId];
  const target = world.agents[targetId];

  if (!agent || !target) return { success: false, reason: 'Agent not found' };
  if (!agent.alive || !target.alive) return { success: false, reason: 'Agent is dead' };

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

  // Validate request: { resource: amount }
  for (const [resource, amount] of Object.entries(request)) {
    if ((target.inventory[resource] || 0) < amount) {
      return { success: false, reason: `Target has insufficient ${resource}` };
    }
  }

  // Execute trade
  for (const [resource, amount] of Object.entries(offer)) {
    agent.inventory[resource] -= amount;
    target.inventory[resource] = (target.inventory[resource] || 0) + amount;
  }
  for (const [resource, amount] of Object.entries(request)) {
    target.inventory[resource] -= amount;
    agent.inventory[resource] = (agent.inventory[resource] || 0) + amount;
  }

  agent.score += 20;
  target.score += 20;

  logEvent(world, {
    type: 'trade',
    agent: agentId,
    target: targetId,
    offer,
    request
  });

  return {
    success: true,
    agentInventory: { ...agent.inventory },
    targetInventory: { ...target.inventory }
  };
}

export { regenerateResources, gatherResource, executeTrade };
