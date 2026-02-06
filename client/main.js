// Three.js scene setup + WebSocket connection

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WorldRenderer } from './world-renderer.js';
import { AgentRenderer } from './agent-renderer.js';
import { EffectsManager } from './effects.js';
import { UI } from './ui.js';

// --- Scene Setup ---
const SIDEBAR_WIDTH = 320;
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080810);
scene.fog = new THREE.FogExp2(0x080810, 0.015);

function canvasWidth() { return window.innerWidth - SIDEBAR_WIDTH; }
function canvasHeight() { return window.innerHeight; }

const camera = new THREE.PerspectiveCamera(60, canvasWidth() / canvasHeight(), 0.1, 200);
camera.position.set(0, 30, 25);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(canvasWidth(), canvasHeight());
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.minDistance = 10;
controls.maxDistance = 80;
controls.maxPolarAngle = Math.PI / 2.2;
controls.target.set(0, 0, 0);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404060, 1.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffeedd, 1.2);
dirLight.position.set(20, 30, 10);
scene.add(dirLight);

const pointLight = new THREE.PointLight(0x6688ff, 0.8, 60);
pointLight.position.set(0, 15, 0);
scene.add(pointLight);

// --- Renderers ---
const worldRenderer = new WorldRenderer(scene);
worldRenderer.buildGrid();

const agentRenderer = new AgentRenderer(scene);
const effects = new EffectsManager(scene);
const ui = new UI();

// --- State ---
let worldState = { agents: {}, activeTiles: [], tick: 0 };
let seenEventIds = new Set();

// --- WebSocket ---
function connectWS() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws/stream`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    ui.setConnectionStatus(true);
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (e) {
      console.error('WS parse error:', e);
    }
  };

  ws.onclose = () => {
    ui.setConnectionStatus(false);
    console.log('WebSocket disconnected, reconnecting...');
    setTimeout(connectWS, 2000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

function handleMessage(msg) {
  if (msg.type === 'state') {
    // Full state update
    worldState = msg.data;
    ui.updateTick(worldState.tick);
    ui.updateLeaderboard(worldState.agents);
    worldRenderer.updateResources(worldState.activeTiles || []);
    agentRenderer.updateAgents(worldState.agents);

    // Load initial events
    if (worldState.events) {
      for (const event of worldState.events) {
        const eid = `${event.tick}-${event.type}-${event.agent || event.attacker || ''}`;
        if (!seenEventIds.has(eid)) {
          seenEventIds.add(eid);
          ui.addLogEntry(event);
          ui.trackEvent(event);
          triggerEffect(event);
        }
      }
    }
  } else if (msg.type === 'tick') {
    const data = msg.data;
    worldState.tick = data.tick;
    ui.updateTick(data.tick);

    // Update agents from tick data
    if (data.agents) {
      for (const agentUpdate of data.agents) {
        if (worldState.agents[agentUpdate.id]) {
          Object.assign(worldState.agents[agentUpdate.id], agentUpdate);
        } else {
          worldState.agents[agentUpdate.id] = agentUpdate;
        }
      }
      ui.updateLeaderboard(worldState.agents);
      agentRenderer.updateAgents(worldState.agents);
    }

    // Add new events
    if (data.events) {
      for (const event of data.events) {
        const eid = `${event.tick}-${event.type}-${event.agent || event.attacker || ''}`;
        if (!seenEventIds.has(eid)) {
          seenEventIds.add(eid);
          ui.addLogEntry(event);
          ui.trackEvent(event);
          triggerEffect(event);
        }
      }
      // Limit seen set size
      if (seenEventIds.size > 500) {
        const arr = [...seenEventIds];
        seenEventIds = new Set(arr.slice(-300));
      }
    }

    // Periodically fetch full state
    if (data.tick % 5 === 0) {
      fetchFullState();
    }
  }
}

async function fetchFullState() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    worldState = data;
    worldRenderer.updateResources(data.activeTiles || []);
    agentRenderer.updateAgents(data.agents);
    ui.updateLeaderboard(data.agents);
  } catch (e) {
    // Silent fail — will retry next cycle
  }
}

// --- Visual Effects ---
function triggerEffect(event) {
  switch (event.type) {
    case 'enter':
      effects.addEnterGlow(event.x, event.y);
      break;
    case 'gather':
      effects.addGatherSparkle(event.x, event.y, event.resource);
      break;
    case 'combat': {
      const defender = worldState.agents?.[event.defender];
      if (defender) effects.addCombatFlash(defender.x, defender.y);
      break;
    }
    case 'kill': {
      const victim = worldState.agents?.[event.victim];
      if (victim) effects.addKillExplosion(victim.x, victim.y);
      break;
    }
    case 'speak':
      effects.addChatBubble(event.x, event.y, event.message);
      break;
  }
}

// --- Mouse interaction ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

renderer.domElement.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / canvasWidth()) * 2 - 1;
  mouse.y = -(event.clientY / canvasHeight()) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(worldRenderer.tileMeshes);

  if (intersects.length > 0) {
    const tile = intersects[0].object.userData;
    const agents = Object.values(worldState.agents || {}).filter(
      a => a.x === tile.tileX && a.y === tile.tileY
    );
    let text = `<b>(${tile.tileX}, ${tile.tileY})</b> — ${tile.type}`;
    if (agents.length > 0) {
      text += '<br>' + agents.map(a =>
        `${a.id} (HP:${a.hp} S:${a.score})`
      ).join('<br>');
    }
    ui.showTooltip(event.clientX, event.clientY, text);
  } else {
    ui.hideTooltip();
  }
});

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = canvasWidth() / canvasHeight();
  camera.updateProjectionMatrix();
  renderer.setSize(canvasWidth(), canvasHeight());
});

// --- Animation Loop ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  controls.update();
  agentRenderer.animate(delta);
  effects.animate(delta);

  renderer.render(scene, camera);
}

// --- Start ---
connectWS();
animate();

// Initial fetch as fallback
fetchFullState();
