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

// Wait for server to be ready, then start agents
setTimeout(() => {
  console.log('[start-all] Starting demo agents...');
  
  const agentEnv = { ...process.env, API_URL: `http://localhost:${PORT}` };
  
  ['gatherer', 'warrior', 'builder'].forEach(type => {
    const agent = spawn('node', [join(__dirname, `agents/${type}.js`)], {
      stdio: 'inherit',
      env: agentEnv
    });
    
    agent.on('error', (err) => {
      console.error(`[start-all] ${type} error:`, err);
    });
    
    agent.on('exit', (code) => {
      console.log(`[start-all] ${type} exited with code ${code}`);
    });
  });
  
  console.log('[start-all] All agents started');
}, 8000);

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('[start-all] SIGTERM received, shutting down...');
  server.kill();
  process.exit(0);
});
