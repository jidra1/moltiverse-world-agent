// World state: 64x64 grid with zones, resources, agents

const GRID_SIZE = 64;
const TILE_TYPES = { SPAWN: 'spawn', FOREST: 'forest', MARKET: 'market', ARENA: 'arena', SHRINE: 'shrine' };
const RESOURCE_TYPES = { WOOD: 'wood', STONE: 'stone', GOLD: 'gold' };

// Zone definitions — 5x5 grid (25 zones), boundaries at 13/26/38/51
//         Col 0(0-12)  Col 1(13-25)  Col 2(26-37)  Col 3(38-50)  Col 4(51-63)
// Row 0:  FOREST       FOREST        SHRINE         FOREST        FOREST
// Row 1:  FOREST       ARENA         MARKET         ARENA         FOREST
// Row 2:  SHRINE       MARKET        SPAWN          MARKET        SHRINE
// Row 3:  FOREST       ARENA         MARKET         ARENA         FOREST
// Row 4:  FOREST       FOREST        SHRINE         FOREST        FOREST
const ZONES = [
  // Row 0
  { type: TILE_TYPES.FOREST, x1: 0,  y1: 0,  x2: 12, y2: 12 },
  { type: TILE_TYPES.FOREST, x1: 13, y1: 0,  x2: 25, y2: 12 },
  { type: TILE_TYPES.SHRINE, x1: 26, y1: 0,  x2: 37, y2: 12 },
  { type: TILE_TYPES.FOREST, x1: 38, y1: 0,  x2: 50, y2: 12 },
  { type: TILE_TYPES.FOREST, x1: 51, y1: 0,  x2: 63, y2: 12 },
  // Row 1
  { type: TILE_TYPES.FOREST, x1: 0,  y1: 13, x2: 12, y2: 25 },
  { type: TILE_TYPES.ARENA,  x1: 13, y1: 13, x2: 25, y2: 25 },
  { type: TILE_TYPES.MARKET, x1: 26, y1: 13, x2: 37, y2: 25 },
  { type: TILE_TYPES.ARENA,  x1: 38, y1: 13, x2: 50, y2: 25 },
  { type: TILE_TYPES.FOREST, x1: 51, y1: 13, x2: 63, y2: 25 },
  // Row 2
  { type: TILE_TYPES.SHRINE, x1: 0,  y1: 26, x2: 12, y2: 37 },
  { type: TILE_TYPES.MARKET, x1: 13, y1: 26, x2: 25, y2: 37 },
  { type: TILE_TYPES.SPAWN,  x1: 26, y1: 26, x2: 37, y2: 37 },
  { type: TILE_TYPES.MARKET, x1: 38, y1: 26, x2: 50, y2: 37 },
  { type: TILE_TYPES.SHRINE, x1: 51, y1: 26, x2: 63, y2: 37 },
  // Row 3
  { type: TILE_TYPES.FOREST, x1: 0,  y1: 38, x2: 12, y2: 50 },
  { type: TILE_TYPES.ARENA,  x1: 13, y1: 38, x2: 25, y2: 50 },
  { type: TILE_TYPES.MARKET, x1: 26, y1: 38, x2: 37, y2: 50 },
  { type: TILE_TYPES.ARENA,  x1: 38, y1: 38, x2: 50, y2: 50 },
  { type: TILE_TYPES.FOREST, x1: 51, y1: 38, x2: 63, y2: 50 },
  // Row 4
  { type: TILE_TYPES.FOREST, x1: 0,  y1: 51, x2: 12, y2: 63 },
  { type: TILE_TYPES.FOREST, x1: 13, y1: 51, x2: 25, y2: 63 },
  { type: TILE_TYPES.SHRINE, x1: 26, y1: 51, x2: 37, y2: 63 },
  { type: TILE_TYPES.FOREST, x1: 38, y1: 51, x2: 50, y2: 63 },
  { type: TILE_TYPES.FOREST, x1: 51, y1: 51, x2: 63, y2: 63 },
];

// Resource mapping per zone type
const ZONE_RESOURCE = {
  [TILE_TYPES.FOREST]: RESOURCE_TYPES.WOOD,
  [TILE_TYPES.ARENA]: RESOURCE_TYPES.STONE,
  [TILE_TYPES.SHRINE]: RESOURCE_TYPES.GOLD,
};

function createWorld() {
  const grid = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      const type = getTileType(x, y);
      const resource = ZONE_RESOURCE[type] || null;
      row.push({
        x, y, type,
        resource,
        resourceCount: resource ? 3 : 0,
        occupants: []
      });
    }
    grid.push(row);
  }

  return {
    grid,
    agents: {},
    tick: 0,
    actionQueue: [],
    eventLog: []
  };
}

function getTileType(x, y) {
  for (const zone of ZONES) {
    if (x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2) {
      return zone.type;
    }
  }
  return TILE_TYPES.SPAWN;
}

function getTile(world, x, y) {
  if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return null;
  return world.grid[y][x];
}

function createAgent(id) {
  const spawnX = 31 + Math.floor(Math.random() * 2);
  const spawnY = 31 + Math.floor(Math.random() * 2);
  return {
    id,
    x: spawnX,
    y: spawnY,
    hp: 100,
    maxHp: 100,
    inventory: { wood: 0, stone: 0, gold: 0 },
    score: 0,
    kills: 0,
    alive: true,
    enteredAt: Date.now()
  };
}

function addAgent(world, agent) {
  world.agents[agent.id] = agent;
  const tile = getTile(world, agent.x, agent.y);
  if (tile) tile.occupants.push(agent.id);
}

function removeAgentFromTile(world, agentId, x, y) {
  const tile = getTile(world, x, y);
  if (tile) {
    tile.occupants = tile.occupants.filter(id => id !== agentId);
  }
}

function moveAgentToTile(world, agentId, newX, newY) {
  const agent = world.agents[agentId];
  if (!agent) return;
  removeAgentFromTile(world, agentId, agent.x, agent.y);
  agent.x = newX;
  agent.y = newY;
  const tile = getTile(world, newX, newY);
  if (tile) tile.occupants.push(agentId);
}

function inventoryCount(agent) {
  return Object.values(agent.inventory).reduce((a, b) => a + b, 0);
}

function logEvent(world, event) {
  event.tick = world.tick;
  event.timestamp = Date.now();
  world.eventLog.push(event);
  // Keep last 200 events
  if (world.eventLog.length > 200) {
    world.eventLog = world.eventLog.slice(-200);
  }
}

export {
  GRID_SIZE, TILE_TYPES, RESOURCE_TYPES, ZONES, ZONE_RESOURCE,
  createWorld, getTileType, getTile, createAgent, addAgent,
  removeAgentFromTile, moveAgentToTile, inventoryCount, logEvent
};
