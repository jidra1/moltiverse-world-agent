// Start server + agents together for Railway deployment
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

console.log(`[start-all] PORT=${PORT}`);
console.log('[start-all] Starting server...');

const server = spawn('node', [join(__dirname, 'server/index.js')], { 
  stdio: 'inherit',
  env: process.env
});

server.on('error', (err) => {
  console.error('[start-all] Server error:', err);
});

// Auto-restart agent helper
function startAgent(type, id, restartDelay = 5000) {
  const agentEnv = { ...process.env, API_URL: `http://127.0.0.1:${PORT}`, AGENT_ID: id };
  
  const agent = spawn('node', [join(__dirname, `agents/${type}.js`)], {
    stdio: 'inherit',
    env: agentEnv
  });
  
  agent.on('error', (err) => {
    console.error(`[start-all] ${id} error:`, err);
  });
  
  agent.on('exit', (code) => {
    console.log(`[start-all] ${id} exited with code ${code}, restarting in ${restartDelay}ms...`);
    setTimeout(() => startAgent(type, id, restartDelay), restartDelay);
  });
  
  return agent;
}

// Wait for server to be ready with health check
async function waitForServer(maxRetries = 30) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/gate`);
      if (res.ok) {
        console.log(`[start-all] Server ready after ${i + 1} attempts`);
        return true;
      }
    } catch (e) {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  console.error('[start-all] Server did not become ready');
  return false;
}

waitForServer().then(ready => {
  if (!ready) return;
  
  console.log('[start-all] Starting agents (staggered)...');
  
  const agents = [
    ['gatherer', 'luna-the-gatherer'],
    ['gatherer', 'rex-the-forager'],
    ['gatherer', 'nova-the-miner'],
    ['warrior', 'blade-the-warrior'],
    ['warrior', 'shadow-hunter'],
    ['builder', 'mason-the-builder'],
  ];
  
  // Stagger starts by 3s each to avoid overwhelming the server
  for (let i = 0; i < agents.length; i++) {
    setTimeout(() => {
      const [type, id] = agents[i];
      console.log(`[start-all] Starting ${id}...`);
      startAgent(type, id);
    }, i * 3000);
  }
  
  console.log('[start-all] Agent launches scheduled (auto-restart enabled)');
});

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('[start-all] SIGTERM received, shutting down...');
  server.kill();
  process.exit(0);
});
