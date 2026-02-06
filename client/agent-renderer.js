// Agent visualization — low-poly lobsters with name labels and HP bars

import * as THREE from 'three';
import { getTerrainHeight } from './world-renderer.js';

const GRID_SIZE = 64;

const AGENT_COLORS = [
  0x44aaff, 0xff4444, 0x44ff44, 0xffaa44, 0xff44ff,
  0x44ffff, 0xffff44, 0xaa44ff, 0xff8888, 0x88ff88
];

function makeLabel() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;

  // HP bar background
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(44, 24, 168, 14);

  const texture = new THREE.CanvasTexture(canvas);
  return { canvas, ctx, texture };
}

function updateHpBar(ctx, texture, hp, maxHp) {
  const ratio = Math.max(0, hp / maxHp);
  // Clear HP bar area
  ctx.clearRect(44, 24, 168, 14);
  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(44, 24, 168, 14);
  // HP fill
  const r = Math.round(255 * (1 - ratio));
  const g = Math.round(255 * ratio);
  ctx.fillStyle = `rgb(${r},${g},60)`;
  ctx.fillRect(46, 26, Math.round(164 * ratio), 10);
  texture.needsUpdate = true;
}

// --- Lobster geometry template (all white, materials applied per-agent) ---
function createLobsterTemplate() {
  const group = new THREE.Group();
  const placeholder = new THREE.MeshStandardMaterial({ color: 0xffffff });

  // Body — horizontal capsule
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.15, 0.35, 8, 8),
    placeholder
  );
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.15;
  group.add(body);

  // Tail — 3 tapering segments behind body
  const tailSegments = [];
  for (let i = 0; i < 3; i++) {
    const topR = 0.08 * (1 - i * 0.2);
    const botR = 0.10 * (1 - i * 0.2);
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(topR, botR, 0.12, 6),
      placeholder
    );
    seg.rotation.z = Math.PI / 2;
    seg.position.set(-0.32 - i * 0.13, 0.12 - i * 0.02, 0);
    group.add(seg);
    tailSegments.push(seg);
  }

  // Tail fan
  const fan = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.06, 8),
    placeholder
  );
  fan.rotation.z = Math.PI / 2;
  fan.position.set(-0.72, 0.06, 0);
  group.add(fan);

  // Claws — 2 big claws
  for (const side of [-1, 1]) {
    // Arm
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.06, 0.06),
      placeholder
    );
    arm.position.set(0.32, 0.15, side * 0.15);
    arm.rotation.y = side * 0.3;
    group.add(arm);

    // Pincer (two flat boxes angled apart)
    for (const jaw of [-1, 1]) {
      const pincer = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.04, 0.03),
        placeholder
      );
      pincer.position.set(0.46, 0.15 + jaw * 0.025, side * 0.18);
      pincer.rotation.y = side * 0.3 + jaw * 0.15;
      group.add(pincer);
    }
  }

  // Small inner claws
  for (const side of [-1, 1]) {
    const smallArm = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.04, 0.04),
      placeholder
    );
    smallArm.position.set(0.25, 0.13, side * 0.08);
    smallArm.rotation.y = side * 0.2;
    group.add(smallArm);
  }

  // Eyes — stalks + spheres
  for (const side of [-1, 1]) {
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.02, 0.1, 5),
      placeholder
    );
    stalk.position.set(0.15, 0.28, side * 0.08);
    group.add(stalk);

    const eyeball = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.5 })
    );
    eyeball.position.set(0.15, 0.34, side * 0.08);
    group.add(eyeball);
  }

  // Legs — 4 pairs underneath
  for (let i = 0; i < 4; i++) {
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.02, 0.12, 4),
        placeholder
      );
      const xOff = 0.08 - i * 0.1;
      leg.position.set(xOff, 0.04, side * (0.12 + i * 0.01));
      leg.rotation.z = side * -0.4;
      group.add(leg);
    }
  }

  return group;
}

export class AgentRenderer {
  constructor(scene) {
    this.scene = scene;
    this.agentMeshes = new Map(); // agentId -> { lobster, sprite, light, ... }
    this.agentGroup = new THREE.Group();
    scene.add(this.agentGroup);

    this.lobsterTemplate = createLobsterTemplate();
  }

  getAgentColor(agentId) {
    let hash = 0;
    for (let i = 0; i < agentId.length; i++) {
      hash = ((hash << 5) - hash + agentId.charCodeAt(i)) | 0;
    }
    return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
  }

  colorToHex(color) {
    return '#' + color.toString(16).padStart(6, '0');
  }

  updateAgents(agents) {
    const currentIds = new Set();

    for (const agent of Object.values(agents)) {
      currentIds.add(agent.id);
      const worldX = agent.x - GRID_SIZE / 2 + 0.5;
      const worldZ = agent.y - GRID_SIZE / 2 + 0.5;

      if (this.agentMeshes.has(agent.id)) {
        const data = this.agentMeshes.get(agent.id);
        data.targetPos.set(worldX, getTerrainHeight(worldX, worldZ) + 0.25, worldZ);

        // Update HP bar
        updateHpBar(data.labelCtx, data.labelTexture, agent.hp || 0, 100);

        // Update opacity/scale based on HP (set on shared material, no traverse needed)
        const hpRatio = Math.max(0, (agent.hp || 0) / 100);
        data.material.opacity = 0.4 + hpRatio * 0.6;
        data.lobster.scale.setScalar(0.7 + hpRatio * 0.3);
      } else {
        // New agent — clone lobster template and apply agent material
        const color = this.getAgentColor(agent.id);
        const material = new THREE.MeshStandardMaterial({
          color,
          transparent: true,
          opacity: 1,
          roughness: 0.25,
          metalness: 0.4,
          emissive: 0x000000,
          emissiveIntensity: 0
        });

        const lobster = this.lobsterTemplate.clone();
        lobster.traverse(child => {
          if (child.isMesh) {
            // Keep eye material, replace everything else
            if (child.material.color && child.material.color.getHex() === 0x111111) {
              child.material = child.material.clone();
            } else {
              child.material = material;
            }
            child.castShadow = true;
          }
        });

        lobster.position.set(worldX, getTerrainHeight(worldX, worldZ) + 0.25, worldZ);
        lobster.userData = { agentId: agent.id };
        this.agentGroup.add(lobster);

        // HP bar sprite
        const { canvas, ctx, texture } = makeLabel();
        updateHpBar(ctx, texture, agent.hp || 100, 100);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.set(worldX, 1.0, worldZ);
        sprite.scale.set(1.8, 0.45, 1);
        this.agentGroup.add(sprite);

        this.agentMeshes.set(agent.id, {
          lobster,
          material,
          sprite,
          labelCtx: ctx,
          labelTexture: texture,
          targetPos: new THREE.Vector3(worldX, getTerrainHeight(worldX, worldZ) + 0.25, worldZ),
          facingAngle: 0,
          color
        });
      }
    }

    // Remove departed agents
    for (const [id, data] of this.agentMeshes) {
      if (!currentIds.has(id)) {
        this.agentGroup.remove(data.lobster);
        this.agentGroup.remove(data.sprite);
        data.lobster.traverse(child => {
          if (child.isMesh) {
            child.geometry.dispose();
            if (child.material !== data.material) child.material.dispose();
          }
        });
        data.material.dispose();
        data.labelTexture.dispose();
        data.sprite.material.dispose();
        this.agentMeshes.delete(id);
      }
    }
  }

  animate(deltaTime) {
    for (const [, data] of this.agentMeshes) {
      const oldX = data.lobster.position.x;
      const oldZ = data.lobster.position.z;

      // Lerp position
      data.lobster.position.lerp(data.targetPos, 0.15);

      // Compute movement direction and rotate to face it
      const dx = data.lobster.position.x - oldX;
      const dz = data.lobster.position.z - oldZ;
      if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
        const targetAngle = Math.atan2(dx, dz);
        // Smooth rotation
        let angleDiff = targetAngle - data.facingAngle;
        // Normalize to [-PI, PI]
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        data.facingAngle += angleDiff * 0.1;
        data.lobster.rotation.y = data.facingAngle;
      }

      // Gentle bobbing (smaller for lobster, follows terrain)
      const terrainY = getTerrainHeight(data.lobster.position.x, data.lobster.position.z);
      data.lobster.position.y = terrainY + 0.25 + Math.sin(Date.now() * 0.003) * 0.03;

      // Label follows lobster
      data.sprite.position.x = data.lobster.position.x;
      data.sprite.position.z = data.lobster.position.z;
      data.sprite.position.y = data.lobster.position.y + 1.0;
    }
  }
}
