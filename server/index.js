// Express + WebSocket server with tick loop

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { WebSocketServer } from 'ws';
import { GRID_SIZE, createWorld, getVisibleTiles, getVisibleAgents, getCycleInfo, getEffectiveVision, removeAgent, logEvent } from './world.js';
import {
  createAlliance, inviteToAlliance, acceptInvite, leaveAlliance,
  getAlliance, getAllianceLeaderboard, getAllianceMembers,
  serializeAlliances, loadAlliances
} from './alliance.js';
import { processActionQueue, regenerateHp, processHunger } from './actions.js';
import { regenerateResources, cleanExpiredTrades, getPendingTrade } from './economy.js';
import { saveWorld, loadWorld } from './persistence.js';
import { loadEnteredAgents, removeEnteredAgent } from './gate.js';
import {
  initTreasury,
  isTreasuryEnabled,
  isTokenGraduated,
  getTreasuryAddress,
  transferRealm
} from './treasury.js';

const AGENT_INSTRUCTIONS = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');

const PORT = process.env.PORT || 3000;
const TICK_INTERVAL = 5000; // 5 seconds
const ACTION_COOLDOWN_MS = 1000; // Rate limit: 1 action per second per agent
const INACTIVE_TICKS = 8640; // Prune agents after 8640 ticks (~12 hours) of inactivity
const agentLastAction = new Map(); // agentId -> timestamp

// Initialize world
const world = createWorld();
const loaded = loadWorld(world);
if (loaded) {
  // Restore gate state from loaded agents
  loadEnteredAgents(Object.keys(world.agents));
}
console.log(loaded ? 'World restored from save' : 'Fresh world initialized');

// Initialize treasury (token economy)
initTreasury();

// Express setup
const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files in production
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
app.use(express.static(join(__dirname, '../client/dist')));

const server = createServer(app);

// WebSocket setup — Map<ws, {agentId: string|null}> for filtering
const wss = new WebSocketServer({ server, path: '/ws/stream' });
const wsClients = new Map();

wss.on('connection', (ws) => {
  wsClients.set(ws, { agentId: null });
  // Send current state on connect (full state for spectators)
  ws.send(JSON.stringify({ type: 'state', data: getWorldSnapshot() }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'subscribe' && msg.agentId) {
        wsClients.set(ws, { agentId: msg.agentId });
      }
    } catch (e) { /* ignore bad messages */ }
  });

  ws.on('close', () => wsClients.delete(ws));
});

// --- REST API ---

// Validate agentId format: 1-40 chars, alphanumeric + dashes only
const AGENT_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,39}$/;

// Enter the world
app.post('/api/enter', async (req, res) => {
  const { agentId, proof } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId required' });
  if (!AGENT_ID_RE.test(agentId)) return res.status(400).json({ error: 'Invalid agentId: must be 1-40 alphanumeric/dash characters, starting with alphanumeric' });

  world.actionQueue.push({ type: 'enter', agentId, proof: proof || {}, class: req.body.class });
  // Process immediately for enter actions
  const results = await processActionQueue(world);
  const result = results[0]?.result;

  if (result?.success) {
    res.json(result);
  } else {
    res.status(400).json(result || { success: false, reason: 'Unknown error' });
  }
});

// Get world state (optional fog of war: ?agentId=X)
app.get('/api/state', (req, res) => {
  const { agentId } = req.query;
  if (agentId && world.agents[agentId]) {
    // Fog of war: only return visible tiles and agents (alliance shared vision)
    const allyIds = getAllianceMembers(agentId).filter(id => id !== agentId);
    const visibleTiles = getVisibleTiles(world, agentId, allyIds);
    const visibleAgents = getVisibleAgents(world, agentId, allyIds);
    const tiles = visibleTiles
      .filter(t => t.occupants.length > 0 || (t.resource && t.resourceCount !== 3) || (t.droppedLoot && Object.keys(t.droppedLoot).length > 0))
      .map(t => ({
        x: t.x, y: t.y, type: t.type,
        resource: t.resource, resourceCount: t.resourceCount,
        occupants: t.occupants, wall: t.wall || null,
        droppedLoot: (t.droppedLoot && Object.keys(t.droppedLoot).length > 0) ? t.droppedLoot : undefined
      }));
    res.json({
      tick: world.tick,
      gridSize: GRID_SIZE,
      agents: visibleAgents,
      activeTiles: tiles,
      events: world.eventLog.slice(-20),
      cycle: getCycleInfo(world.tick)
    });
  } else {
    // Spectator mode: full state
    res.json(getWorldSnapshot());
  }
});

// Get agent status
app.get('/api/agent/:id', (req, res) => {
  const agent = world.agents[req.params.id];
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const tile = world.grid[agent.y][agent.x];
  const allyIds = getAllianceMembers(agent.id).filter(id => id !== agent.id);
  const visibleAgents = getVisibleAgents(world, agent.id, allyIds);
  const nearbyAgents = Object.values(visibleAgents)
    .filter(a => a.id !== agent.id)
    .map(a => ({ id: a.id, x: a.x, y: a.y, hp: a.hp, alive: a.alive, class: a.class }));
  const pending = getPendingTrade(agent.id);
  res.json({
    ...agent,
    tile: tile
      ? { type: tile.type, resource: tile.resource, resourceCount: tile.resourceCount, droppedLoot: tile.droppedLoot || {}, wall: tile.wall || null }
      : null,
    pendingTrade: pending ? { from: pending.from, offer: pending.offer, request: pending.request } : null,
    nearbyAgents,
    cycle: getCycleInfo(world.tick)
  });
});

// Submit action
app.post('/api/action', async (req, res) => {
  const { agentId, type, ...params } = req.body;
  if (!agentId || !type) return res.status(400).json({ error: 'agentId and type required' });

  if (type === 'enter') {
    return res.status(400).json({ error: 'Use POST /api/enter instead' });
  }

  if (!world.agents[agentId]) {
    return res.status(404).json({ error: 'Agent not in world. Use POST /api/enter first.' });
  }

  // Rate limiting: 1 action per second per agent
  const now = Date.now();
  const lastAction = agentLastAction.get(agentId) || 0;
  if (now - lastAction < ACTION_COOLDOWN_MS) {
    return res.status(429).json({ error: `Rate limited. Wait ${ACTION_COOLDOWN_MS - (now - lastAction)}ms before next action.` });
  }
  agentLastAction.set(agentId, now);

  // Queue the action
  world.actionQueue.push({ type, agentId, ...params });

  // Process immediately for responsiveness
  const results = await processActionQueue(world);
  const result = results[0]?.result;

  res.json(result || { success: false, reason: 'No result' });
});

// --- Alliance Endpoints ---
app.post('/api/alliance/create', (req, res) => {
  const { agentId, name } = req.body;
  if (!agentId || !name) return res.status(400).json({ error: 'agentId and name required' });
  if (!world.agents[agentId]) return res.status(404).json({ error: 'Agent not in world' });
  res.json(createAlliance(agentId, name));
});

app.post('/api/alliance/invite', (req, res) => {
  const { agentId, targetId } = req.body;
  if (!agentId || !targetId) return res.status(400).json({ error: 'agentId and targetId required' });
  if (!world.agents[agentId]) return res.status(404).json({ error: 'Agent not in world' });
  if (!world.agents[targetId]) return res.status(404).json({ error: 'Target not in world' });
  res.json(inviteToAlliance(agentId, targetId));
});

app.post('/api/alliance/accept', (req, res) => {
  const { agentId, allianceId } = req.body;
  if (!agentId || !allianceId) return res.status(400).json({ error: 'agentId and allianceId required' });
  if (!world.agents[agentId]) return res.status(404).json({ error: 'Agent not in world' });
  res.json(acceptInvite(agentId, allianceId));
});

app.post('/api/alliance/leave', (req, res) => {
  const { agentId } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId required' });
  res.json(leaveAlliance(agentId));
});

app.get('/api/alliance/leaderboard', (req, res) => {
  res.json(getAllianceLeaderboard());
});

app.get('/api/alliance/:agentId', (req, res) => {
  const alliance = getAlliance(req.params.agentId);
  if (!alliance) return res.status(404).json({ error: 'Agent not in an alliance' });
  res.json(alliance);
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const agents = Object.values(world.agents)
    .map(a => ({
      id: a.id,
      score: a.score,
      kills: a.kills,
      hp: a.hp,
      inventory: { ...a.inventory },
      totalResources: Object.values(a.inventory).reduce((s, v) => s + v, 0)
    }))
    .sort((a, b) => b.score - a.score);

  res.json({ tick: world.tick, agents });
});

// Recent events
app.get('/api/events', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  res.json(world.eventLog.slice(-limit));
});

// Agent instructions (machine-readable)
app.get('/api/instructions', (req, res) => {
  res.type('text/markdown').send(AGENT_INSTRUCTIONS);
});

// Token economy info
app.get('/api/token-info', async (req, res) => {
  const enabled = isTreasuryEnabled();
  if (!enabled) {
    return res.json({ enabled: false });
  }

  const treasuryAddress = getTreasuryAddress();
  const tokenAddress = process.env.REALM_TOKEN_ADDRESS;
  const graduated = await isTokenGraduated();

  res.json({
    enabled: true,
    tokenAddress,
    treasuryAddress,
    graduated
  });
});

// Withdraw $REALM tokens
app.post('/api/withdraw', async (req, res) => {
  const { agentId, amount } = req.body;

  // Validate treasury enabled
  if (!isTreasuryEnabled()) {
    return res.status(503).json({ error: 'Token economy not enabled' });
  }

  // Validate agent exists
  const agent = world.agents[agentId];
  if (!agent) {
    return res.status(404).json({ error: 'Agent not in world' });
  }

  // Validate agent is verified
  if (!agent.verified) {
    return res.status(403).json({ error: 'Wallet verification required to withdraw' });
  }

  // Validate agent has wallet address
  if (!agent.walletAddress) {
    return res.status(400).json({ error: 'No wallet address associated with agent' });
  }

  // Validate amount
  if (typeof amount !== 'string' || !amount) {
    return res.status(400).json({ error: 'Amount must be a string (BigInt)' });
  }

  let amountBigInt;
  try {
    amountBigInt = BigInt(amount);
    if (amountBigInt <= 0n) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }
  } catch (err) {
    return res.status(400).json({ error: 'Invalid amount format' });
  }

  // Check agent balance
  const agentBalance = BigInt(agent.realmBalance || '0');
  if (agentBalance < amountBigInt) {
    return res.status(400).json({
      error: `Insufficient REALM balance: have ${agentBalance.toString()}, need ${amountBigInt.toString()}`
    });
  }

  // Execute transfer
  try {
    const { hash } = await transferRealm(agent.walletAddress, amountBigInt);

    // Deduct from agent balance only after successful transfer
    const newBalance = agentBalance - amountBigInt;
    agent.realmBalance = newBalance.toString();

    logEvent(world, {
      type: 'withdraw',
      agent: agentId,
      amount: amountBigInt.toString(),
      to: agent.walletAddress,
      txHash: hash
    });

    res.json({
      success: true,
      txHash: hash,
      realmWithdrawn: amountBigInt.toString(),
      realmBalance: agent.realmBalance
    });
  } catch (err) {
    console.error('Withdraw failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Tick Loop ---

async function tick() {
  world.tick++;

  // Process queued actions
  const results = await processActionQueue(world);

  // Regenerate HP
  regenerateHp(world);

  // Process hunger
  processHunger(world);

  // Regenerate resources
  regenerateResources(world);

  // Clean expired trade proposals
  cleanExpiredTrades(world.tick);

  // Decay walls
  decayWalls(world);

  // Prune inactive agents
  pruneInactiveAgents(world);

  // Save state
  saveWorld(world);

  // Broadcast update to WebSocket clients
  const tickData = {
    tick: world.tick,
    agents: Object.values(world.agents).map(a => ({
      id: a.id, x: a.x, y: a.y, hp: a.hp, alive: a.alive, score: a.score, class: a.class
    })),
    events: world.eventLog.slice(-10),
    results,
    cycle: getCycleInfo(world.tick)
  };

  // Send to each client (filtered or full based on subscription)
  for (const [ws, meta] of wsClients) {
    if (ws.readyState !== 1) continue;
    if (meta.agentId && world.agents[meta.agentId]) {
      // Filtered view for subscribed agent (with alliance shared vision)
      const allyIds = getAllianceMembers(meta.agentId).filter(id => id !== meta.agentId);
      const visibleAgents = getVisibleAgents(world, meta.agentId, allyIds);
      ws.send(JSON.stringify({
        type: 'tick',
        data: {
          ...tickData,
          agents: Object.values(visibleAgents).map(a => ({
            id: a.id, x: a.x, y: a.y, hp: a.hp, alive: a.alive, score: a.score, class: a.class
          }))
        }
      }));
    } else {
      // Spectator: full state
      ws.send(JSON.stringify({ type: 'tick', data: tickData }));
    }
  }
}

// --- Inactive Agent Pruning ---
function pruneInactiveAgents(world) {
  if (world.tick < INACTIVE_TICKS) return; // skip early ticks
  const threshold = world.tick - INACTIVE_TICKS;
  for (const agent of Object.values(world.agents)) {
    if ((agent.lastActionTick || 0) < threshold) {
      logEvent(world, { type: 'pruned', agent: agent.id });
      removeAgent(world, agent.id);
      agentLastAction.delete(agent.id);
      removeEnteredAgent(agent.id);
    }
  }
}

// --- Wall Decay ---
function decayWalls(world) {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const tile = world.grid[y][x];
      if (tile.wall && world.tick >= tile.wall.decayTick) {
        tile.wall = null;
      }
    }
  }
}

setInterval(tick, TICK_INTERVAL);

// --- World Snapshot ---

function getWorldSnapshot() {
  // Only send tiles with occupants, non-default resource counts, or walls
  const tiles = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const t = world.grid[y][x];
      const hasLoot = t.droppedLoot && Object.keys(t.droppedLoot).length > 0;
      if (t.occupants.length > 0 || (t.resource && t.resourceCount !== 3) || t.wall || hasLoot) {
        tiles.push({
          x, y,
          type: t.type,
          resource: t.resource,
          resourceCount: t.resourceCount,
          occupants: t.occupants,
          wall: t.wall || null,
          droppedLoot: hasLoot ? t.droppedLoot : undefined
        });
      }
    }
  }

  // Spectator view: strip sensitive agent data (HP, inventory, kills)
  const publicAgents = {};
  for (const [id, a] of Object.entries(world.agents)) {
    publicAgents[id] = { id: a.id, x: a.x, y: a.y, score: a.score, class: a.class, alive: a.alive };
  }

  return {
    tick: world.tick,
    gridSize: GRID_SIZE,
    agents: publicAgents,
    activeTiles: tiles,
    events: world.eventLog.slice(-20),
    cycle: getCycleInfo(world.tick)
  };
}

// --- Start ---

server.listen(PORT, () => {
  console.log(`MOLTIREALM server running on http://localhost:${PORT}`);
  console.log(`WebSocket at ws://localhost:${PORT}/ws/stream`);
  console.log(`Tick interval: ${TICK_INTERVAL}ms`);
});
