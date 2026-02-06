// Warrior bot — aggressive raider
// Moves toward nearest agent → attacks → loots inventory

const API = process.env.API_URL || 'http://localhost:3000';
const AGENT_ID = 'warrior-' + Math.random().toString(36).slice(2, 6);
const TICK_MS = 2000;

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

async function getMyState() {
  return api('GET', `/api/agent/${AGENT_ID}`);
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function moveToward(current, target) {
  if (current.x < target.x) return 'right';
  if (current.x > target.x) return 'left';
  if (current.y < target.y) return 'down';
  if (current.y > target.y) return 'up';
  return null;
}

async function run() {
  console.log(`[${AGENT_ID}] Entering world...`);
  const enterResult = await api('POST', '/api/enter', { agentId: AGENT_ID, class: 'warrior' });
  if (!enterResult.success) {
    console.log(`[${AGENT_ID}] Enter failed:`, enterResult.reason);
    return;
  }
  console.log(`[${AGENT_ID}] Entered at (${enterResult.agent.x}, ${enterResult.agent.y})`);

  while (true) {
    await sleep(TICK_MS);

    try {
      const me = await getMyState();
      if (me.error) {
        console.log(`[${AGENT_ID}] Not found, re-entering...`);
        await api('POST', '/api/enter', { agentId: AGENT_ID, class: 'warrior' });
        continue;
      }

      // If low HP, retreat to spawn area and wait
      if (me.hp < 30) {
        const spawnCenter = { x: 31, y: 31 };
        const dir = moveToward(me, spawnCenter);
        if (dir) {
          await api('POST', '/api/action', { agentId: AGENT_ID, type: 'move', direction: dir });
        }
        if (Math.random() < 0.2) {
          await api('POST', '/api/action', {
            agentId: AGENT_ID, type: 'speak',
            message: 'Retreating... need to heal.'
          });
        }
        continue;
      }

      // Find nearest agent
      const worldState = await api('GET', '/api/state');
      const others = Object.values(worldState.agents || {}).filter(
        a => a.id !== AGENT_ID && a.alive !== false
      );

      if (others.length === 0) {
        // No targets, wander toward arena
        const arena = { x: 19, y: 19 };
        const dir = moveToward(me, arena);
        if (dir) {
          await api('POST', '/api/action', { agentId: AGENT_ID, type: 'move', direction: dir });
        }
        continue;
      }

      // Target the nearest agent
      others.sort((a, b) => distance(me, a) - distance(me, b));
      const target = others[0];
      const dist = distance(me, target);

      if (dist === 0) {
        // Same tile — attack!
        const result = await api('POST', '/api/action', {
          agentId: AGENT_ID, type: 'attack', targetId: target.id
        });
        if (result.success) {
          console.log(`[${AGENT_ID}] Hit ${target.id} for ${result.damage}dmg${result.killed ? ' — KILLED!' : ''}`);
        }
        // Taunt
        if (Math.random() < 0.3) {
          await api('POST', '/api/action', {
            agentId: AGENT_ID, type: 'speak',
            message: result.killed ? `${target.id} has been defeated!` : `Come at me, ${target.id}!`
          });
        }
      } else {
        // Move toward target
        const dir = moveToward(me, target);
        if (dir) {
          await api('POST', '/api/action', { agentId: AGENT_ID, type: 'move', direction: dir });
        }
      }

      // If full inventory, gather some resources on the way
      const totalItems = Object.values(me.inventory).reduce((a, b) => a + b, 0);
      if (totalItems < 5 && me.tile?.resource && me.tile.resourceCount > 0) {
        await api('POST', '/api/action', { agentId: AGENT_ID, type: 'gather' });
      }
    } catch (err) {
      console.error(`[${AGENT_ID}] Error:`, err.message);
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

run().catch(console.error);
