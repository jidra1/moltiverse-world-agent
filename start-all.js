// Start server + agents together for Railway deployment
import { spawn } from 'child_process';

const PORT = process.env.PORT || 3000;

console.log('[start-all] Starting server...');
const server = spawn('node', ['server/index.js'], { 
  stdio: 'inherit',
  env: process.env
});

// Wait for server to be ready, then start agents
setTimeout(() => {
  console.log('[start-all] Starting demo agents...');
  
  spawn('node', ['agents/gatherer.js'], {
    stdio: 'inherit',
    env: { ...process.env, API_URL: `http://localhost:${PORT}` }
  });
  
  spawn('node', ['agents/warrior.js'], {
    stdio: 'inherit', 
    env: { ...process.env, API_URL: `http://localhost:${PORT}` }
  });
  
  spawn('node', ['agents/builder.js'], {
    stdio: 'inherit',
    env: { ...process.env, API_URL: `http://localhost:${PORT}` }
  });
}, 5000);

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('[start-all] Shutting down...');
  server.kill();
  process.exit(0);
});
