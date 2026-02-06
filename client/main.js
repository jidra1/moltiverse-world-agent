// Three.js scene setup + WebSocket connection

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { WorldRenderer } from './world-renderer.js';
import { AgentRenderer } from './agent-renderer.js';
import { EffectsManager } from './effects.js';
import { UI } from './ui.js';
import { SoundManager } from './sounds.js';

// --- Scene Setup ---
const GRID_SIZE = 64;
const SIDEBAR_WIDTH = 320;
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x241530);
scene.fog = new THREE.FogExp2(0x241530, 0.004);

function canvasWidth() { return window.innerWidth - SIDEBAR_WIDTH; }
function canvasHeight() { return window.innerHeight; }

const camera = new THREE.PerspectiveCamera(50, canvasWidth() / canvasHeight(), 0.1, 300);
camera.position.set(0, 55, 45);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(canvasWidth(), canvasHeight());
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Controls — orbit + pan (right-click / two-finger drag to pan)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.minDistance = 10;
controls.maxDistance = 150;
controls.maxPolarAngle = Math.PI / 2.2;
controls.enablePan = true;
controls.panSpeed = 1.5;
controls.screenSpacePanning = false; // pan along ground plane
controls.target.set(0, 0, 0);

const MAP_HALF = GRID_SIZE / 2 + 4; // allow slight overshoot past edges

// --- Keyboard pan (WASD / Arrow keys) ---
const keysDown = new Set();
window.addEventListener('keydown', (e) => {
  if (['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    keysDown.add(e.key);
    e.preventDefault();
  }
  if (e.key === 'Escape' && followAgentId) {
    followAgentId = null;
    ui.setFollowTarget(null);
  }
});
window.addEventListener('keyup', (e) => keysDown.delete(e.key));

// Lighting — warm ground bounce + purple fill
const hemiLight = new THREE.HemisphereLight(0x8899cc, 0xc97840, 1.5);
scene.add(hemiLight);

const ambientLight = new THREE.AmbientLight(0x4a3a50, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffeedd, 1.6);
dirLight.position.set(20, 40, 15);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.left = -40;
dirLight.shadow.camera.right = 40;
dirLight.shadow.camera.top = 40;
dirLight.shadow.camera.bottom = -40;
dirLight.shadow.camera.near = 10;
dirLight.shadow.camera.far = 120;
scene.add(dirLight);

const fillLight = new THREE.DirectionalLight(0xffcc88, 0.4);
fillLight.position.set(-15, 20, -10);
scene.add(fillLight);

// Zone accent lights — non-forest zones only (forests lit by ambient)
const zoneLights = [
  // Spawn center
  { color: 0x7777cc, x:   0,   z: 0,     intensity: 0.8 },
  // Shrines (4)
  { color: 0xddaa22, x:   0,   z: -25.5, intensity: 1.2 },
  { color: 0xddaa22, x: -25.5, z: 0,     intensity: 1.2 },
  { color: 0xddaa22, x:  25.5, z: 0,     intensity: 1.2 },
  { color: 0xddaa22, x:   0,   z: 25.5,  intensity: 1.2 },
  // Arenas (4)
  { color: 0xee3333, x: -12.5, z: -13,   intensity: 0.8 },
  { color: 0xee3333, x:  12.5, z: -13,   intensity: 0.8 },
  { color: 0xee3333, x: -12.5, z: 13,    intensity: 0.8 },
  { color: 0xee3333, x:  12.5, z: 13,    intensity: 0.8 },
  // Markets (4)
  { color: 0xddaa22, x:   0,   z: -13,   intensity: 0.8 },
  { color: 0xddaa22, x: -12.5, z: 0,     intensity: 0.8 },
  { color: 0xddaa22, x:  12.5, z: 0,     intensity: 0.8 },
  { color: 0xddaa22, x:   0,   z: 13,    intensity: 0.8 },
];
for (const zl of zoneLights) {
  const light = new THREE.PointLight(zl.color, zl.intensity, 35);
  light.position.set(zl.x, 6, zl.z);
  scene.add(light);
}

// --- Post-processing ---
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(canvasWidth(), canvasHeight()),
  0.6,   // strength
  0.7,   // radius
  0.6    // threshold
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// --- Renderers ---
const worldRenderer = new WorldRenderer(scene);
worldRenderer.buildGrid();

const agentRenderer = new AgentRenderer(scene);
const effects = new EffectsManager(scene);
const ui = new UI();
const sounds = new SoundManager();

// Sound toggle button
document.getElementById('sound-toggle').addEventListener('click', () => {
  const muted = sounds.toggleMute();
  document.getElementById('sound-toggle').textContent = muted ? '♪̶' : '♪';
});

// --- State ---
let worldState = { agents: {}, activeTiles: [], tick: 0, cycle: null };
let seenEventIds = new Set();
let currentCycle = { isNight: false, phase: 'day', ticksRemaining: 60 };
let followAgentId = null;

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
    if (worldState.cycle) updateDayNight(worldState.cycle);
    ui.updateTick(worldState.tick);
    ui.updateLeaderboard(worldState.agents);
    worldRenderer.updateResources(worldState.activeTiles || []);
    agentRenderer.updateAgents(worldState.agents);

    // Load initial events
    if (worldState.events) {
      for (const event of worldState.events) {
        const eid = `${event.tick}-${event.type}-${event.agent || event.attacker || ''}-${event.timestamp || ''}`;
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
    if (data.cycle) updateDayNight(data.cycle);
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
        const eid = `${event.tick}-${event.type}-${event.agent || event.attacker || ''}-${event.timestamp || ''}`;
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
      sounds.playEnter();
      break;
    case 'gather':
      effects.addGatherSparkle(event.x, event.y, event.resource);
      sounds.playGather(event.resource);
      break;
    case 'combat': {
      const defender = worldState.agents?.[event.defender];
      if (defender) effects.addCombatFlash(defender.x, defender.y);
      sounds.playHit();
      break;
    }
    case 'kill': {
      const victim = worldState.agents?.[event.victim];
      if (victim) effects.addKillExplosion(victim.x, victim.y);
      sounds.playKill();
      break;
    }
    case 'speak':
      effects.addChatBubble(event.x, event.y, event.message);
      sounds.playSpeak();
      break;
    case 'trade':
      sounds.playTrade();
      break;
  }
}

// --- Day/Night Cycle ---
function updateDayNight(cycle) {
  currentCycle = cycle;
  if (cycle.isNight) {
    // Night: dim ambient and hemisphere lights
    ambientLight.intensity = 0.2;
    hemiLight.intensity = 0.5;
    dirLight.intensity = 0.4;
    scene.fog.density = 0.008;
    scene.background.setHex(0x0a0510);
  } else {
    // Day: normal lighting
    ambientLight.intensity = 0.6;
    hemiLight.intensity = 1.5;
    dirLight.intensity = 1.6;
    scene.fog.density = 0.004;
    scene.background.setHex(0x241530);
  }
}

// --- Mouse interaction ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Click to follow an agent
renderer.domElement.addEventListener('click', (event) => {
  const clickMouse = new THREE.Vector2(
    (event.clientX / canvasWidth()) * 2 - 1,
    -(event.clientY / canvasHeight()) * 2 + 1
  );
  raycaster.setFromCamera(clickMouse, camera);
  const hits = raycaster.intersectObjects(agentRenderer.agentGroup.children, true);
  if (hits.length > 0) {
    const agentId = agentRenderer.findAgentFromObject(hits[0].object);
    if (agentId) {
      followAgentId = agentId;
      ui.setFollowTarget(agentId);
      return;
    }
  }
  // Clicked empty space — stop following
  if (followAgentId) {
    followAgentId = null;
    ui.setFollowTarget(null);
  }
});

// Leaderboard click to follow
document.getElementById('leaderboard-entries').addEventListener('click', (event) => {
  const entry = event.target.closest('.lb-entry');
  if (entry?.dataset?.agentId) {
    followAgentId = entry.dataset.agentId;
    ui.setFollowTarget(followAgentId);
  }
});

renderer.domElement.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / canvasWidth()) * 2 - 1;
  mouse.y = -(event.clientY / canvasHeight()) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObject(worldRenderer.raycastPlane);

  if (intersects.length > 0) {
    const point = intersects[0].point;
    const tileX = Math.floor(point.x + GRID_SIZE / 2);
    const tileY = Math.floor(point.z + GRID_SIZE / 2);
    const tileObj = worldRenderer.getTileAt(tileX, tileY);
    if (tileObj) {
      const tile = tileObj.userData;
      const agents = Object.values(worldState.agents || {}).filter(
        a => a.x === tile.tileX && a.y === tile.tileY
      );
      const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      let text = `<b>(${tile.tileX}, ${tile.tileY})</b> — ${esc(tile.type)}`;
      if (agents.length > 0) {
        text += '<br>' + agents.map(a =>
          `${esc(a.id)} (HP:${a.hp} S:${a.score})`
        ).join('<br>');
      }
      ui.showTooltip(event.clientX, event.clientY, text);
    } else {
      ui.hideTooltip();
    }
  } else {
    ui.hideTooltip();
  }
});

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = canvasWidth() / canvasHeight();
  camera.updateProjectionMatrix();
  renderer.setSize(canvasWidth(), canvasHeight());
  composer.setSize(canvasWidth(), canvasHeight());
});

// --- Animation Loop ---
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  // Keyboard pan — move target + camera together
  if (keysDown.size > 0) {
    const speed = 20 * delta;
    // Forward direction from camera (projected onto XZ plane)
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

    const move = new THREE.Vector3();
    if (keysDown.has('w') || keysDown.has('ArrowUp'))    move.add(forward);
    if (keysDown.has('s') || keysDown.has('ArrowDown'))  move.sub(forward);
    if (keysDown.has('d') || keysDown.has('ArrowRight')) move.add(right);
    if (keysDown.has('a') || keysDown.has('ArrowLeft'))  move.sub(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      controls.target.add(move);
      camera.position.add(move);
    }
  }

  // Camera follow mode — smoothly track the followed agent
  if (followAgentId) {
    const pos = agentRenderer.getAgentWorldPosition(followAgentId);
    if (pos) {
      const offset = camera.position.clone().sub(controls.target);
      controls.target.lerp(pos, 0.08);
      camera.position.copy(controls.target).add(offset);
    } else {
      // Agent gone — stop following
      followAgentId = null;
      ui.setFollowTarget(null);
    }
  }

  // Clamp pan target to map bounds
  controls.target.x = Math.max(-MAP_HALF, Math.min(MAP_HALF, controls.target.x));
  controls.target.z = Math.max(-MAP_HALF, Math.min(MAP_HALF, controls.target.z));
  controls.update();
  agentRenderer.animate(delta);
  effects.animate(delta);

  composer.render();
}

// --- Start ---
connectWS();
animate();

// Initial fetch as fallback
fetchFullState();
