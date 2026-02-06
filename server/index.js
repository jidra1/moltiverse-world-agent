// Express + WebSocket server with tick loop

import express from 'express';
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { WebSocketServer } from 'ws';
import { createWorld } from './world.js';
import { processActionQueue, regenerateHp } from './actions.js';
import { regenerateResources } from './economy.js';
import { saveWorld, loadWorld } from './persistence.js';
import { loadEnteredAgents } from './gate.js';

const AGENT_INSTRUCTIONS = readFileSync(new URL('../AGENTS.md', import.meta.url), 'utf8');

const PORT = process.env.PORT || 3000;
const TICK_INTERVAL = 5000; // 5 seconds

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

// WebSocket setup
const wss = new WebSocketServer({ server, path: '/ws/stream' });
const wsClients = new Set();

wss.on('connection', (ws) => {
  wsClients.add(ws);
  // Send current state on connect
  ws.send(JSON.stringify({ type: 'state', data: getWorldSnapshot() }));
  ws.on('close', () => wsClients.delete(ws));
});

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const ws of wsClients) {
    if (ws.readyState === 1) { // OPEN
      ws.send(data);
    }
  }
}

// --- REST API ---

// Enter the world
app.post('/api/enter', (req, res) => {
  const { agentId, proof } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId required' });

  world.actionQueue.push({ type: 'enter', agentId, proof: proof || {} });
  // Process immediately for enter actions
  const results = processActionQueue(world);
  const result = results[0]?.result;

  if (result?.success) {
    res.json(result);
  } else {
    res.status(400).json(result || { success: false, reason: 'Unknown error' });
  }
});

// Get world state
app.get('/api/state', (req, res) => {
  res.json(getWorldSnapshot());
});

// Get agent status
app.get('/api/agent/:id', (req, res) => {
  const agent = world.agents[req.params.id];
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json({
    ...agent,
    tile: world.grid[agent.y][agent.x]
      ? { type: world.grid[agent.y][agent.x].type, resource: world.grid[agent.y][agent.x].resource, resourceCount: world.grid[agent.y][agent.x].resourceCount }
      : null
  });
});

// Submit action
app.post('/api/action', (req, res) => {
  const { agentId, type, ...params } = req.body;
  if (!agentId || !type) return res.status(400).json({ error: 'agentId and type required' });

  if (type === 'enter') {
    return res.status(400).json({ error: 'Use POST /api/enter instead' });
  }

  if (!world.agents[agentId]) {
    return res.status(404).json({ error: 'Agent not in world. Use POST /api/enter first.' });
  }

  // Queue the action
  world.actionQueue.push({ type, agentId, ...params });

  // Process immediately for responsiveness
  const results = processActionQueue(world);
  const result = results[0]?.result;

  res.json(result || { success: false, reason: 'No result' });
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

function tick() {
  world.tick++;

  // Process queued actions
  const results = processActionQueue(world);

  // Regenerate HP
  regenerateHp(world);

  // Regenerate resources
  regenerateResources(world);

  // Save state
  saveWorld(world);

  // Broadcast update to WebSocket clients
  broadcast({
    type: 'tick',
    data: {
      tick: world.tick,
      agents: Object.values(world.agents).map(a => ({
        id: a.id, x: a.x, y: a.y, hp: a.hp, alive: a.alive, score: a.score
      })),
      events: world.eventLog.slice(-10),
      results
    }
  });
}

setInterval(tick, TICK_INTERVAL);

// --- World Snapshot ---

function getWorldSnapshot() {
  // Only send tiles with occupants or non-default resource counts
  const tiles = [];
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const t = world.grid[y][x];
      if (t.occupants.length > 0 || (t.resource && t.resourceCount !== 3)) {
        tiles.push({
          x, y,
          type: t.type,
          resource: t.resource,
          resourceCount: t.resourceCount,
          occupants: t.occupants
        });
      }
    }
  }

  return {
    tick: world.tick,
    gridSize: 32,
    agents: world.agents,
    activeTiles: tiles,
    events: world.eventLog.slice(-20)
  };
}

// --- Start ---

server.listen(PORT, () => {
  console.log(`Moltiverse server running on http://localhost:${PORT}`);
  console.log(`WebSocket at ws://localhost:${PORT}/ws/stream`);
  console.log(`Tick interval: ${TICK_INTERVAL}ms`);
});
