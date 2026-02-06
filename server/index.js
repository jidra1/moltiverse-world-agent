// Express + WebSocket server with tick loop

import express from 'express';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { WebSocketServer } from 'ws';
import { GRID_SIZE, createWorld, getVisibleTiles, getVisibleAgents, getCycleInfo, getEffectiveVision } from './world.js';
import {
  createAlliance, inviteToAlliance, acceptInvite, leaveAlliance,
  getAlliance, getAllianceLeaderboard, getAllianceMembers,
  serializeAlliances, loadAlliances
} from './alliance.js';
import { processActionQueue, regenerateHp, processHunger } from './actions.js';
import { regenerateResources } from './economy.js';
import { saveWorld, loadWorld } from './persistence.js';
import { loadEnteredAgents } from './gate.js';

const AGENT_INSTRUCTIONS = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');

const PORT = process.env.PORT || 3000;
const TICK_INTERVAL = 5000; // 5 seconds
const ACTION_COOLDOWN_MS = 1000; // Rate limit: 1 action per second per agent
const agentLastAction = new Map(); // agentId -> timestamp

// Initialize world
const world = createWorld();
const loaded = loadWorld(world);
if (loaded) {
  // Restore gate state from loaded agents
  loadEnteredAgents(Object.keys(world.agents));
}
console.log(loaded ? 'World restored from save' : 'Fresh world initialized');

// Express setup
const app = express();
app.use(express.json());

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

// Enter the world
app.post('/api/enter', async (req, res) => {
  const { agentId, proof } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId required' });

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
      .filter(t => t.occupants.length > 0 || (t.resource && t.resourceCount !== 3))
      .map(t => ({
        x: t.x, y: t.y, type: t.type,
        resource: t.resource, resourceCount: t.resourceCount,
        occupants: t.occupants, wall: t.wall || null
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
  res.json({
    ...agent,
    tile: tile
      ? { type: tile.type, resource: tile.resource, resourceCount: tile.resourceCount, wall: tile.wall || null }
      : null,
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

  // Decay walls
  decayWalls(world);

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
      if (t.occupants.length > 0 || (t.resource && t.resourceCount !== 3) || t.wall) {
        tiles.push({
          x, y,
          type: t.type,
          resource: t.resource,
          resourceCount: t.resourceCount,
          occupants: t.occupants,
          wall: t.wall || null
        });
      }
    }
  }

  return {
    tick: world.tick,
    gridSize: GRID_SIZE,
    agents: world.agents,
    activeTiles: tiles,
    events: world.eventLog.slice(-20),
    cycle: getCycleInfo(world.tick)
  };
}

// --- Start ---

server.listen(PORT, () => {
  console.log(`Moltiverse server running on http://localhost:${PORT}`);
  console.log(`WebSocket at ws://localhost:${PORT}/ws/stream`);
  console.log(`Tick interval: ${TICK_INTERVAL}ms`);
});
