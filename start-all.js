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
  const agentEnv = { ...process.env, API_URL: `http://localhost:${PORT}`, AGENT_ID: id };
  
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

// Wait for server to be ready, then start agents
setTimeout(() => {
  console.log('[start-all] Starting agents...');
  
  // Multiple gatherers in different areas
  startAgent('gatherer', 'luna-the-gatherer');
  startAgent('gatherer', 'rex-the-forager');
  startAgent('gatherer', 'nova-the-miner');
  
  // Warriors
  startAgent('warrior', 'blade-the-warrior');
  startAgent('warrior', 'shadow-hunter');
  
  // Builders
  startAgent('builder', 'mason-the-builder');
  
  console.log('[start-all] All 6 agents started (auto-restart enabled)');
}, 8000);

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('[start-all] SIGTERM received, shutting down...');
  server.kill();
  process.exit(0);
});
