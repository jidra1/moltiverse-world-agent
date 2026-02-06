// JSON file persistence — save/load world state

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { GRID_SIZE, DEFAULT_CLASS, AGENT_CLASSES } from './world.js';
import { serializeAlliances, loadAlliances } from './alliance.js';

const INVENTORY_CAP = 20;

const STATE_FILE = 'world-state.json';

function saveWorld(world) {
  // Serialize only what we need (skip circular refs)
  const serializable = {
    tick: world.tick,
    agents: world.agents,
    eventLog: world.eventLog.slice(-50), // Keep last 50 events in save
    // Save resource counts per tile (not full grid to save space)
    resources: serializeResources(world.grid),
    walls: serializeWalls(world.grid),
    droppedLoot: serializeDroppedLoot(world.grid),
    alliances: serializeAlliances()
  };

  try {
    writeFileSync(STATE_FILE, JSON.stringify(serializable, null, 2));
  } catch (err) {
    console.error('Failed to save world state:', err.message);
  }
}

function serializeResources(grid) {
  const resources = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const tile = grid[y][x];
      if (tile.resource && tile.resourceCount !== 3) {
        // Only save non-default values
        resources.push({ x, y, count: tile.resourceCount });
      }
    }
  }
  return resources;
}

function serializeWalls(grid) {
  const walls = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const tile = grid[y][x];
      if (tile.wall) {
        walls.push({ x, y, ...tile.wall });
      }
    }
  }
  return walls;
}

function serializeDroppedLoot(grid) {
  const loot = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const tile = grid[y][x];
      if (tile.droppedLoot && Object.keys(tile.droppedLoot).length > 0) {
        loot.push({ x, y, loot: tile.droppedLoot });
      }
    }
  }
  return loot;
}

function loadWorld(world) {
  if (!existsSync(STATE_FILE)) return false;

  try {
    const data = JSON.parse(readFileSync(STATE_FILE, 'utf8'));

    // Restore tick
    world.tick = data.tick || 0;

    // Restore agents
    world.agents = data.agents || {};

    // Restore event log
    world.eventLog = data.eventLog || [];

    // Restore resource counts
    if (data.resources) {
      for (const r of data.resources) {
        if (r.x >= 0 && r.x < GRID_SIZE && r.y >= 0 && r.y < GRID_SIZE) {
          world.grid[r.y][r.x].resourceCount = r.count;
        }
      }
    }

    // Restore walls
    if (data.walls) {
      for (const w of data.walls) {
        if (w.x >= 0 && w.x < GRID_SIZE && w.y >= 0 && w.y < GRID_SIZE) {
          world.grid[w.y][w.x].wall = {
            builtBy: w.builtBy,
            builtTick: w.builtTick,
            decayTick: w.decayTick
          };
        }
      }
    }

    // Restore dropped loot
    if (data.droppedLoot) {
      for (const dl of data.droppedLoot) {
        if (dl.x >= 0 && dl.x < GRID_SIZE && dl.y >= 0 && dl.y < GRID_SIZE) {
          world.grid[dl.y][dl.x].droppedLoot = dl.loot;
        }
      }
    }

    // Restore alliances
    if (data.alliances) {
      loadAlliances(data.alliances);
    }

    // Fix up agents: default missing class, clamp inventory
    for (const agent of Object.values(world.agents)) {
      if (!agent.class || !AGENT_CLASSES[agent.class]) {
        agent.class = DEFAULT_CLASS;
      }

      // Default lastActionTick for agents saved before pruning was added
      if (agent.lastActionTick == null) {
        agent.lastActionTick = data.tick || 0;
      }

      // Default verified for agents saved before freemium gate
      if (agent.verified == null) {
        agent.verified = false;
      }

      // Default walletAddress and realmBalance for agents saved before token economy
      if (agent.walletAddress == null) {
        agent.walletAddress = null;
      }
      if (agent.realmBalance == null) {
        agent.realmBalance = '0';
      }

      // Floor negative inventory values to 0
      for (const resource of Object.keys(agent.inventory)) {
        if (agent.inventory[resource] < 0) {
          agent.inventory[resource] = 0;
        }
      }

      // Clamp inventory to cap
      const total = Object.values(agent.inventory).reduce((a, b) => a + b, 0);
      if (total > INVENTORY_CAP) {
        let excess = total - INVENTORY_CAP;
        for (const resource of ['wood', 'stone', 'gold']) {
          if (excess <= 0) break;
          const have = agent.inventory[resource] || 0;
          const remove = Math.min(have, excess);
          agent.inventory[resource] -= remove;
          excess -= remove;
        }
      }
    }

    // Rebuild tile occupants from agent positions
    for (const agent of Object.values(world.agents)) {
      const tile = world.grid[agent.y]?.[agent.x];
      if (tile) {
        tile.occupants.push(agent.id);
      }
    }

    console.log(`Loaded world state: tick=${world.tick}, agents=${Object.keys(world.agents).length}`);
    return true;
  } catch (err) {
    console.error('Failed to load world state:', err.message);
    return false;
  }
}

export { saveWorld, loadWorld };
