// Action handlers: enter, move, gather, trade, attack, speak

import { getTile, createAgent, addAgent, moveAgentToTile, logEvent, GRID_SIZE, AGENT_CLASSES, getHpRegenAmount, getTileType } from './world.js';
import { resolveCombat } from './combat.js';
import { gatherResource, proposeTrade, acceptTrade, rejectTrade } from './economy.js';
import { verifyEntry } from './gate.js';

const DIRECTIONS = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy: 1 },
  left:  { dx: -1, dy: 0 },
  right: { dx: 1,  dy: 0 }
};

async function processAction(world, action) {
  // Track activity for inactivity pruning
  if (world.agents[action.agentId]) {
    world.agents[action.agentId].lastActionTick = world.tick;
  }

  switch (action.type) {
    case 'enter':  return await handleEnter(world, action);
    case 'move':   return handleMove(world, action);
    case 'gather': return handleGather(world, action);
    case 'trade':        return handleTrade(world, action);
    case 'accept_trade': return handleAcceptTrade(world, action);
    case 'reject_trade': return handleRejectTrade(world, action);
    case 'attack':       return handleAttack(world, action);
    case 'speak':        return handleSpeak(world, action);
    case 'build':        return handleBuild(world, action);
    case 'pickup':       return handlePickup(world, action);
    default:             return { success: false, reason: `Unknown action: ${action.type}` };
  }
}

async function handleEnter(world, action) {
  const { agentId, proof } = action;

  if (world.agents[agentId]) {
    return { success: false, reason: 'Agent already in world' };
  }

  const gateResult = await verifyEntry(agentId, proof);
  if (!gateResult.allowed) {
    return { success: false, reason: gateResult.reason };
  }

  const agent = createAgent(agentId, action.class);
  if (!agent) {
    return { success: false, reason: `Invalid class: ${action.class}. Must be one of: warrior, gatherer, builder` };
  }
  agent.verified = gateResult.verified;
  addAgent(world, agent);

  agent.lastActionTick = world.tick;
  logEvent(world, { type: 'enter', agent: agentId, x: agent.x, y: agent.y });

  return {
    success: true,
    agent: { ...agent }
  };
}

function handleMove(world, action) {
  const { agentId, direction } = action;
  const agent = world.agents[agentId];

  if (!agent) return { success: false, reason: 'Agent not in world' };
  if (!agent.alive) return { success: false, reason: 'Agent is dead' };

  const dir = DIRECTIONS[direction];
  if (!dir) return { success: false, reason: `Invalid direction: ${direction}` };

  const newX = agent.x + dir.dx;
  const newY = agent.y + dir.dy;

  if (newX < 0 || newX >= GRID_SIZE || newY < 0 || newY >= GRID_SIZE) {
    return { success: false, reason: 'Out of bounds' };
  }

  // Wall collision check
  const targetTile = getTile(world, newX, newY);
  if (targetTile && targetTile.wall) {
    return { success: false, reason: 'Path blocked by a wall' };
  }

  moveAgentToTile(world, agentId, newX, newY);

  const tile = getTile(world, newX, newY);

  logEvent(world, {
    type: 'move',
    agent: agentId,
    x: newX,
    y: newY,
    zone: tile.type
  });

  return {
    success: true,
    position: { x: newX, y: newY },
    tile: { type: tile.type, resource: tile.resource, resourceCount: tile.resourceCount },
    occupants: tile.occupants.filter(id => id !== agentId)
  };
}

function requireVerified(world, agentId, actionName) {
  const agent = world.agents[agentId];
  if (!agent) return null;
  if (!agent.verified) {
    return { success: false, reason: `Wallet verification required to ${actionName}. Provide proof.walletAddress and proof.signature when entering.` };
  }
  return null;
}

function handleGather(world, action) {
  const blocked = requireVerified(world, action.agentId, 'gather');
  if (blocked) return blocked;
  return gatherResource(world, action.agentId);
}

function handleTrade(world, action) {
  const blocked = requireVerified(world, action.agentId, 'trade');
  if (blocked) return blocked;
  const { agentId, targetId, offer, request } = action;
  return proposeTrade(world, agentId, targetId, offer || {}, request || {});
}

function handleAcceptTrade(world, action) {
  const blocked = requireVerified(world, action.agentId, 'accept trade');
  if (blocked) return blocked;
  const { agentId } = action;
  return acceptTrade(world, agentId);
}

function handleRejectTrade(world, action) {
  const blocked = requireVerified(world, action.agentId, 'reject trade');
  if (blocked) return blocked;
  const { agentId } = action;
  return rejectTrade(agentId);
}

function handleAttack(world, action) {
  const blocked = requireVerified(world, action.agentId, 'attack');
  if (blocked) return blocked;
  const { agentId, targetId } = action;
  return resolveCombat(world, agentId, targetId);
}

function handleSpeak(world, action) {
  const { agentId, message } = action;
  const agent = world.agents[agentId];

  if (!agent) return { success: false, reason: 'Agent not in world' };
  if (!agent.alive) return { success: false, reason: 'Agent is dead' };

  const raw = (message || '').trim();
  if (raw.length === 0) {
    return { success: false, reason: 'Message cannot be empty' };
  }

  const truncated = raw.slice(0, 200);
  const wasTruncated = raw.length > 200;

  // Find agents within 5-tile radius
  const hearers = [];
  for (const other of Object.values(world.agents)) {
    if (other.id === agentId || !other.alive) continue;
    const dist = Math.abs(other.x - agent.x) + Math.abs(other.y - agent.y);
    if (dist <= 5) {
      hearers.push(other.id);
    }
  }

  logEvent(world, {
    type: 'speak',
    agent: agentId,
    message: truncated,
    hearers,
    x: agent.x,
    y: agent.y
  });

  const result = {
    success: true,
    message: truncated,
    hearers
  };
  if (wasTruncated) result.truncated = true;
  return result;
}

// --- Building ---
const WALL_COST = { wood: 3, stone: 2 };
const WALL_DECAY_TICKS = 120;

function handleBuild(world, action) {
  const blocked = requireVerified(world, action.agentId, 'build');
  if (blocked) return blocked;
  const { agentId, direction } = action;
  const agent = world.agents[agentId];

  if (!agent) return { success: false, reason: 'Agent not in world' };
  if (!agent.alive) return { success: false, reason: 'Agent is dead' };

  // Only builder class can build
  if (agent.class !== 'builder') {
    return { success: false, reason: 'Only builder class can place walls' };
  }

  const dir = DIRECTIONS[direction];
  if (!dir) return { success: false, reason: `Invalid direction: ${direction}` };

  const targetX = agent.x + dir.dx;
  const targetY = agent.y + dir.dy;

  if (targetX < 0 || targetX >= GRID_SIZE || targetY < 0 || targetY >= GRID_SIZE) {
    return { success: false, reason: 'Cannot build out of bounds' };
  }

  const targetTile = getTile(world, targetX, targetY);

  // Cannot build in spawn zone
  if (targetTile.type === 'spawn') {
    return { success: false, reason: 'Cannot build in spawn zone' };
  }

  // Cannot build on occupied tile or tile with existing wall
  if (targetTile.wall) {
    return { success: false, reason: 'There is already a wall here' };
  }

  if (targetTile.occupants.length > 0) {
    return { success: false, reason: 'Cannot build on an occupied tile' };
  }

  // Check resources
  for (const [resource, amount] of Object.entries(WALL_COST)) {
    if ((agent.inventory[resource] || 0) < amount) {
      return { success: false, reason: `Need ${amount} ${resource} to build (have ${agent.inventory[resource] || 0})` };
    }
  }

  // Deduct resources
  for (const [resource, amount] of Object.entries(WALL_COST)) {
    agent.inventory[resource] -= amount;
  }

  // Place wall
  targetTile.wall = {
    builtBy: agentId,
    builtTick: world.tick,
    decayTick: world.tick + WALL_DECAY_TICKS
  };

  logEvent(world, {
    type: 'build',
    agent: agentId,
    x: targetX,
    y: targetY,
    decayTick: targetTile.wall.decayTick
  });

  return {
    success: true,
    wall: { x: targetX, y: targetY, decayTick: targetTile.wall.decayTick },
    inventory: { ...agent.inventory }
  };
}

// --- Pickup Ground Loot ---
function handlePickup(world, action) {
  const blocked = requireVerified(world, action.agentId, 'pick up loot');
  if (blocked) return blocked;
  const { agentId, resource } = action;
  const agent = world.agents[agentId];

  if (!agent) return { success: false, reason: 'Agent not in world' };
  if (!agent.alive) return { success: false, reason: 'Agent is dead' };

  const tile = getTile(world, agent.x, agent.y);
  if (!tile.droppedLoot || Object.keys(tile.droppedLoot).length === 0) {
    return { success: false, reason: 'No loot on this tile' };
  }

  const totalItems = Object.values(agent.inventory).reduce((a, b) => a + b, 0);
  if (totalItems >= 20) {
    return { success: false, reason: 'Inventory full (max 20)' };
  }

  // If resource specified, pick up that one; otherwise pick up first available
  const resources = resource ? [resource] : Object.keys(tile.droppedLoot);
  let picked = {};
  let space = 20 - totalItems;

  for (const r of resources) {
    const available = tile.droppedLoot[r] || 0;
    if (available <= 0) continue;
    const take = Math.min(available, space);
    if (take <= 0) break;
    agent.inventory[r] = (agent.inventory[r] || 0) + take;
    tile.droppedLoot[r] -= take;
    if (tile.droppedLoot[r] <= 0) delete tile.droppedLoot[r];
    picked[r] = take;
    space -= take;
  }

  if (Object.keys(picked).length === 0) {
    return { success: false, reason: resource ? `No ${resource} loot on this tile` : 'No loot available' };
  }

  logEvent(world, { type: 'pickup', agent: agentId, loot: picked, x: agent.x, y: agent.y });

  return { success: true, picked, inventory: { ...agent.inventory } };
}

async function processActionQueue(world) {
  const results = [];
  while (world.actionQueue.length > 0) {
    const action = world.actionQueue.shift();
    const result = await processAction(world, action);
    results.push({ action, result });
  }
  return results;
}

// Regenerate HP for all agents (day: 5/tick, night: 2/tick)
function regenerateHp(world) {
  const regenAmount = getHpRegenAmount(world);
  for (const agent of Object.values(world.agents)) {
    if (agent.alive && agent.hp < agent.maxHp) {
      agent.hp = Math.min(agent.maxHp, agent.hp + regenAmount);
    }
  }
}

// --- Hunger System ---
const HUNGER_INTERVAL = 10; // every 10 ticks
const HUNGER_RESOURCES = ['wood', 'stone', 'gold']; // consume priority

function processHunger(world) {
  if (world.tick % HUNGER_INTERVAL !== 0) return;

  for (const agent of Object.values(world.agents)) {
    if (!agent.alive) continue;

    let consumed = false;
    for (const resource of HUNGER_RESOURCES) {
      if ((agent.inventory[resource] || 0) > 0) {
        agent.inventory[resource]--;
        consumed = true;
        break;
      }
    }

    if (!consumed) {
      // No resources — take HP damage
      agent.hp -= 5;
      if (agent.hp <= 0) {
        agent.hp = 50;
        agent.alive = true;
        agent.score = Math.max(0, agent.score - 25);
        for (const r of Object.keys(agent.inventory)) {
          agent.inventory[r] = 0;
        }
        const spawnX = 31 + Math.floor(Math.random() * 2);
        const spawnY = 31 + Math.floor(Math.random() * 2);
        moveAgentToTile(world, agent.id, spawnX, spawnY);
        logEvent(world, { type: 'hunger_death', agent: agent.id });
      } else {
        logEvent(world, { type: 'hunger', agent: agent.id, hp: agent.hp });
      }
    }
  }
}

export { processAction, processActionQueue, regenerateHp, processHunger };
