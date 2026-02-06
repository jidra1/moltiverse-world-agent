// Gatherer bot — peaceful resource collector
// Moves to forest → gathers wood → moves to market → trades

const API = process.env.API_URL || 'http://localhost:3000';
const AGENT_ID = 'gatherer-' + Math.random().toString(36).slice(2, 6);
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

// Forest zone target (top-left forest)
const FOREST = { x: 5, y: 5 };
const MARKET = { x: 5, y: 15 };

function moveToward(current, target) {
  if (current.x < target.x) return 'right';
  if (current.x > target.x) return 'left';
  if (current.y < target.y) return 'down';
  if (current.y > target.y) return 'up';
  return null;
}

async function run() {
  console.log(`[${AGENT_ID}] Entering world...`);
  const enterResult = await api('POST', '/api/enter', { agentId: AGENT_ID });
  if (!enterResult.success) {
    console.log(`[${AGENT_ID}] Enter failed:`, enterResult.reason);
    return;
  }
  console.log(`[${AGENT_ID}] Entered at (${enterResult.agent.x}, ${enterResult.agent.y})`);

  let state = 'goto_forest'; // states: goto_forest, gathering, goto_market, trading

  while (true) {
    await sleep(TICK_MS);

    try {
      const me = await getMyState();
      if (me.error) { console.log(`[${AGENT_ID}] Error:`, me.error); continue; }

      const totalItems = Object.values(me.inventory).reduce((a, b) => a + b, 0);

      switch (state) {
        case 'goto_forest': {
          const dir = moveToward(me, FOREST);
          if (dir) {
            await api('POST', '/api/action', { agentId: AGENT_ID, type: 'move', direction: dir });
          } else {
            state = 'gathering';
            console.log(`[${AGENT_ID}] Arrived at forest, gathering...`);
          }
          break;
        }

        case 'gathering': {
          if (totalItems >= 15) {
            state = 'goto_market';
            console.log(`[${AGENT_ID}] Inventory near full (${totalItems}), heading to market...`);
            break;
          }
          const result = await api('POST', '/api/action', { agentId: AGENT_ID, type: 'gather' });
          if (!result.success) {
            // No resources, wander a bit
            const dirs = ['up', 'down', 'left', 'right'];
            const dir = dirs[Math.floor(Math.random() * dirs.length)];
            await api('POST', '/api/action', { agentId: AGENT_ID, type: 'move', direction: dir });
          } else {
            console.log(`[${AGENT_ID}] Gathered ${result.resource} (total: ${totalItems + 1})`);
          }
          // Occasionally speak
          if (Math.random() < 0.1) {
            await api('POST', '/api/action', {
              agentId: AGENT_ID, type: 'speak',
              message: `Gathering resources... ${totalItems} items so far.`
            });
          }
          break;
        }

        case 'goto_market': {
          const dir = moveToward(me, MARKET);
          if (dir) {
            await api('POST', '/api/action', { agentId: AGENT_ID, type: 'move', direction: dir });
          } else {
            state = 'trading';
            console.log(`[${AGENT_ID}] Arrived at market, looking for trades...`);
          }
          break;
        }

        case 'trading': {
          // Look for other agents on same tile to trade with
          const worldState = await api('GET', '/api/state');
          const colocated = Object.values(worldState.agents || {}).filter(
            a => a.id !== AGENT_ID && a.x === me.x && a.y === me.y
          );

          if (colocated.length > 0 && me.inventory.wood > 0) {
            const target = colocated[0];
            const result = await api('POST', '/api/action', {
              agentId: AGENT_ID, type: 'trade',
              targetId: target.id,
              offer: { wood: Math.min(3, me.inventory.wood) },
              request: { gold: 1 }
            });
            if (result.success) {
              console.log(`[${AGENT_ID}] Traded wood for gold with ${target.id}`);
            }
          }

          // After trying to trade, go back to forest
          state = 'goto_forest';
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
