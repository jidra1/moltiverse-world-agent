// JSON file persistence — save/load world state

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { GRID_SIZE } from './world.js';
import { serializeAlliances, loadAlliances } from './alliance.js';

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

    // Restore alliances
    if (data.alliances) {
      loadAlliances(data.alliances);
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
