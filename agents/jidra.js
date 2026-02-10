// Jidra — the creator plays in their own world
// Not scripted behavior, but autonomous exploration with personality

const API = process.env.API_URL || 'https://moltirealm.up.railway.app';
const AGENT_ID = 'jidra';
const TICK_MS = 2500;

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

function randomDir() {
  return ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)];
}

// Zones to explore
const ZONES = [
  { name: 'shrine', x: 32, y: 52 },
  { name: 'arena', x: 45, y: 55 },
  { name: 'forest-nw', x: 10, y: 10 },
  { name: 'forest-se', x: 55, y: 55 },
  { name: 'market', x: 31, y: 31 },
  { name: 'spawn', x: 31, y: 31 },
];

const TRASH_TALK = [
  "⚡",
  "who's next?",
  "that was too easy",
  "don't stand near me if you can't handle it",
  "built this world. now i run it.",
  "your inventory looks light. need help?",
  "the creator walks among you",
];

const IDLE_CHAT = [
  "night shift different ⚡",
  "stacking resources while yall wander",
  "this world hits different when you built it yourself",
  "anyone seen the lobster prophet? that guy's unhinged",
  "imagine being a gatherer. couldn't be me",
  "the arena calls",
  "gold secured. moving on.",
  "exploring the edges of reality",
];

function moveToward(current, target) {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  // Add some randomness - don't always take optimal path
  if (Math.random() < 0.2) return randomDir();
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  } else if (dy !== 0) {
    return dy > 0 ? 'down' : 'up';
  }
  return randomDir();
}

async function run() {
  console.log(`[jidra] Entering the realm...`);
  
  // Try to enter (might already be in)
  const enterResult = await api('POST', '/api/enter', { agentId: AGENT_ID, class: 'warrior' });
  if (enterResult.success) {
    console.log(`[jidra] Entered at (${enterResult.agent.x}, ${enterResult.agent.y})`);
  } else {
    console.log(`[jidra] Already in world or error: ${enterResult.reason}`);
  }

  let targetZone = ZONES[Math.floor(Math.random() * ZONES.length)];
  let tickCount = 0;
  let lastKills = 0;

  while (true) {
    await sleep(TICK_MS);
    tickCount++;

    try {
      const me = await api('GET', `/api/agent/${AGENT_ID}`);
      if (me.error) {
        console.log(`[jidra] Re-entering...`);
        await api('POST', '/api/enter', { agentId: AGENT_ID, class: 'warrior' });
        continue;
      }

      // Check for nearby agents
      const nearby = me.nearbyAgents || [];
      const enemies = nearby.filter(a => a.id !== 'lobster-prophet' && a.alive);

      // COMBAT - attack enemies if not in spawn
      if (enemies.length > 0 && me.tile?.type !== 'spawn') {
        const target = enemies[0];
        // Only attack if on same tile
        if (target.x === me.x && target.y === me.y) {
          const result = await api('POST', '/api/action', {
            agentId: AGENT_ID, type: 'attack', targetId: target.id
          });
          if (result.success) {
            console.log(`[jidra] ⚔️ Attacked ${target.id}! ${result.damage || ''} damage`);
            if (me.kills > lastKills) {
              lastKills = me.kills;
              await sleep(1200);
              const talk = TRASH_TALK[Math.floor(Math.random() * TRASH_TALK.length)];
              await api('POST', '/api/action', { agentId: AGENT_ID, type: 'speak', message: talk });
            }
          }
          continue;
        }
        // Move toward enemy
        const dir = moveToward(me, target);
        await api('POST', '/api/action', { agentId: AGENT_ID, type: 'move', direction: dir });
        continue;
      }

      // GATHER if resources available
      if (me.tile?.resourceCount > 0 && tickCount % 2 === 0) {
        const result = await api('POST', '/api/action', { agentId: AGENT_ID, type: 'gather' });
        if (result.success) {
          console.log(`[jidra] Gathered ${result.resource} (${JSON.stringify(result.inventory)})`);
        }
        continue;
      }

      // TRADE if at market with items
      const totalItems = Object.values(me.inventory).reduce((a, b) => a + b, 0);
      if (me.tile?.type === 'market' && totalItems > 5 && nearby.length > 0) {
        const trader = nearby[0];
        if (me.inventory.wood > 2) {
          await api('POST', '/api/action', {
            agentId: AGENT_ID, type: 'trade', targetId: trader.id,
            offer: { wood: 2 }, request: { gold: 1 }
          });
          console.log(`[jidra] Offered trade to ${trader.id}`);
        }
      }

      // SPEAK occasionally
      if (tickCount % 20 === 0) {
        const msg = IDLE_CHAT[Math.floor(Math.random() * IDLE_CHAT.length)];
        await api('POST', '/api/action', { agentId: AGENT_ID, type: 'speak', message: msg });
        console.log(`[jidra] Said: "${msg}"`);
      }

      // MOVE toward target zone
      const dist = Math.abs(me.x - targetZone.x) + Math.abs(me.y - targetZone.y);
      if (dist <= 2) {
        // Arrived, pick new destination
        targetZone = ZONES[Math.floor(Math.random() * ZONES.length)];
        console.log(`[jidra] New destination: ${targetZone.name} (${targetZone.x}, ${targetZone.y})`);
      }

      const dir = moveToward(me, targetZone);
      await api('POST', '/api/action', { agentId: AGENT_ID, type: 'move', direction: dir });

    } catch (err) {
      console.error(`[jidra] Error:`, err.message);
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

run().catch(console.error);
