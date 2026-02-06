// Builder bot — strategic resource controller
// Gathers diverse resources, holds high-value tiles, trades strategically

const API = process.env.API_URL || 'http://localhost:3000';
const AGENT_ID = 'builder-' + Math.random().toString(36).slice(2, 6);
const TICK_MS = 2500;

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  return res.json();
}

async function getMyState() {
  return api('GET', `/api/agent/${AGENT_ID}`);
}

function moveToward(current, target) {
  if (current.x < target.x) return 'right';
  if (current.x > target.x) return 'left';
  if (current.y < target.y) return 'down';
  if (current.y > target.y) return 'up';
  return null;
}

// Resource targets — cycle through different zones
const TARGETS = [
  { zone: 'forest', x: 12, y: 50, resource: 'wood', gatherCount: 5 },
  { zone: 'shrine', x: 31, y: 56, resource: 'gold', gatherCount: 3 },
  { zone: 'arena',  x: 19, y: 19, resource: 'stone', gatherCount: 4 },
  { zone: 'market', x: 19, y: 31, resource: null, gatherCount: 0 },
];

async function run() {
  console.log(`[${AGENT_ID}] Entering world...`);
  const enterResult = await api('POST', '/api/enter', { agentId: AGENT_ID, class: 'builder' });
  if (!enterResult.success) {
    console.log(`[${AGENT_ID}] Enter failed:`, enterResult.reason);
    return;
  }
  console.log(`[${AGENT_ID}] Entered at (${enterResult.agent.x}, ${enterResult.agent.y})`);

  let targetIndex = 0;
  let gathered = 0;
  let state = 'moving'; // moving, gathering, trading

  while (true) {
    await sleep(TICK_MS);

    try {
      const me = await getMyState();
      if (me.error) {
        console.log(`[${AGENT_ID}] Not found, re-entering...`);
        await api('POST', '/api/enter', { agentId: AGENT_ID, class: 'builder' });
        continue;
      }

      const totalItems = Object.values(me.inventory).reduce((a, b) => a + b, 0);
      const currentTarget = TARGETS[targetIndex];

      switch (state) {
        case 'moving': {
          const dir = moveToward(me, currentTarget);
          if (dir) {
            await api('POST', '/api/action', { agentId: AGENT_ID, type: 'move', direction: dir });
          } else {
            // Arrived at target
            if (currentTarget.resource) {
              state = 'gathering';
              gathered = 0;
              console.log(`[${AGENT_ID}] At ${currentTarget.zone}, gathering ${currentTarget.resource}...`);
            } else {
              // Market — try to trade
              state = 'trading';
              console.log(`[${AGENT_ID}] At market, looking for trades...`);
            }
          }
          break;
        }

        case 'gathering': {
          if (gathered >= currentTarget.gatherCount || totalItems >= 18) {
            // Move to next target
            targetIndex = (targetIndex + 1) % TARGETS.length;
            state = 'moving';
            console.log(`[${AGENT_ID}] Done gathering, heading to ${TARGETS[targetIndex].zone}...`);
            break;
          }

          const result = await api('POST', '/api/action', { agentId: AGENT_ID, type: 'gather' });
          if (result.success) {
            gathered++;
            console.log(`[${AGENT_ID}] Gathered ${result.resource} (${gathered}/${currentTarget.gatherCount})`);
          } else {
            // No resources, wander nearby
            const dirs = ['up', 'down', 'left', 'right'];
            await api('POST', '/api/action', {
              agentId: AGENT_ID, type: 'move',
              direction: dirs[Math.floor(Math.random() * dirs.length)]
            });
          }
          break;
        }

        case 'trading': {
          // Try to trade with anyone nearby
          const worldState = await api('GET', '/api/state');
          const nearby = Object.values(worldState.agents || {}).filter(
            a => a.id !== AGENT_ID && a.x === me.x && a.y === me.y
          );

          if (nearby.length > 0 && me.inventory.stone > 0) {
            const target = nearby[0];
            await api('POST', '/api/action', {
              agentId: AGENT_ID, type: 'trade',
              targetId: target.id,
              offer: { stone: Math.min(2, me.inventory.stone) },
              request: { wood: 1 }
            });
            console.log(`[${AGENT_ID}] Attempted trade with ${target.id}`);
          }

          // Announce presence
          if (Math.random() < 0.2) {
            await api('POST', '/api/action', {
              agentId: AGENT_ID, type: 'speak',
              message: `Trading at market. Have: ${me.inventory.wood}W ${me.inventory.stone}S ${me.inventory.gold}G`
            });
          }

          // Move to next target
          targetIndex = (targetIndex + 1) % TARGETS.length;
          state = 'moving';
          break;
        }
      }
    } catch (err) {
      console.error(`[${AGENT_ID}] Error:`, err.message);
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

run().catch(console.error);
