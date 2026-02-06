// Action handlers: enter, move, gather, trade, attack, speak

import { getTile, createAgent, addAgent, moveAgentToTile, logEvent, GRID_SIZE } from './world.js';
import { resolveCombat } from './combat.js';
import { gatherResource, executeTrade } from './economy.js';
import { verifyEntry } from './gate.js';

const DIRECTIONS = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy: 1 },
  left:  { dx: -1, dy: 0 },
  right: { dx: 1,  dy: 0 }
};

function processAction(world, action) {
  switch (action.type) {
    case 'enter':  return handleEnter(world, action);
    case 'move':   return handleMove(world, action);
    case 'gather': return handleGather(world, action);
    case 'trade':  return handleTrade(world, action);
    case 'attack': return handleAttack(world, action);
    case 'speak':  return handleSpeak(world, action);
    default:       return { success: false, reason: `Unknown action: ${action.type}` };
  }
}

function handleEnter(world, action) {
  const { agentId, proof } = action;

  if (world.agents[agentId]) {
    return { success: false, reason: 'Agent already in world' };
  }

  const gateResult = verifyEntry(agentId, proof);
  if (!gateResult.allowed) {
    return { success: false, reason: gateResult.reason };
  }

  const agent = createAgent(agentId);
  addAgent(world, agent);

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

function handleGather(world, action) {
  return gatherResource(world, action.agentId);
}

function handleTrade(world, action) {
  const { agentId, targetId, offer, request } = action;
  return executeTrade(world, agentId, targetId, offer || {}, request || {});
}

function handleAttack(world, action) {
  const { agentId, targetId } = action;
  return resolveCombat(world, agentId, targetId);
}

function handleSpeak(world, action) {
  const { agentId, message } = action;
  const agent = world.agents[agentId];

  if (!agent) return { success: false, reason: 'Agent not in world' };
  if (!agent.alive) return { success: false, reason: 'Agent is dead' };

  const truncated = (message || '').slice(0, 200);

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

  return {
    success: true,
    message: truncated,
    hearers
  };
}

function processActionQueue(world) {
  const results = [];
  while (world.actionQueue.length > 0) {
    const action = world.actionQueue.shift();
    const result = processAction(world, action);
    results.push({ action, result });
  }
  return results;
}

// Regenerate HP for all agents (5/tick)
function regenerateHp(world) {
  for (const agent of Object.values(world.agents)) {
    if (agent.alive && agent.hp < agent.maxHp) {
      agent.hp = Math.min(agent.maxHp, agent.hp + 5);
    }
  }
}

export { processAction, processActionQueue, regenerateHp };
