// Agent visualization — colored spheres with name labels and HP bars

import * as THREE from 'three';

const GRID_SIZE = 32;

const AGENT_COLORS = [
  0x44aaff, 0xff4444, 0x44ff44, 0xffaa44, 0xff44ff,
  0x44ffff, 0xffff44, 0xaa44ff, 0xff8888, 0x88ff88
];

function makeLabel(text, color) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 128;

  // Name text
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000';
  ctx.fillText(text, 129, 37);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 36);

  // HP bar background
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(44, 56, 168, 14);

  const texture = new THREE.CanvasTexture(canvas);
  return { canvas, ctx, texture };
}

function updateHpBar(ctx, texture, hp, maxHp) {
  const ratio = Math.max(0, hp / maxHp);
  // Clear HP bar area
  ctx.clearRect(44, 56, 168, 14);
  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(44, 56, 168, 14);
  // HP fill
  const r = Math.round(255 * (1 - ratio));
  const g = Math.round(255 * ratio);
  ctx.fillStyle = `rgb(${r},${g},60)`;
  ctx.fillRect(46, 58, Math.round(164 * ratio), 10);
  // HP text
  ctx.fillStyle = '#fff';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${hp}`, 128, 68);
  texture.needsUpdate = true;
}

export class AgentRenderer {
  constructor(scene) {
    this.scene = scene;
    this.agentMeshes = new Map(); // agentId -> { sphere, label, sprite, targetPos, ... }
    this.agentGroup = new THREE.Group();
    scene.add(this.agentGroup);

    this.sphereGeo = new THREE.SphereGeometry(0.3, 16, 16);
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
        data.targetPos.set(worldX, 0.35, worldZ);

        // Update HP bar
        updateHpBar(data.labelCtx, data.labelTexture, agent.hp || 0, 100);

        // Update opacity/scale based on HP
        const hpRatio = Math.max(0, (agent.hp || 0) / 100);
        data.sphere.material.opacity = 0.4 + hpRatio * 0.6;
        const scale = 0.7 + hpRatio * 0.3;
        data.sphere.scale.setScalar(scale);
      } else {
        // New agent
        const color = this.getAgentColor(agent.id);
        const material = new THREE.MeshPhongMaterial({
          color,
          transparent: true,
          opacity: 1,
          emissive: color,
          emissiveIntensity: 0.3
        });
        const sphere = new THREE.Mesh(this.sphereGeo, material);
        sphere.position.set(worldX, 0.35, worldZ);
        sphere.userData = { agentId: agent.id };
        this.agentGroup.add(sphere);

        // Name label + HP bar sprite
        const { canvas, ctx, texture } = makeLabel(agent.id, this.colorToHex(color));
        updateHpBar(ctx, texture, agent.hp || 100, 100);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.set(worldX, 1.2, worldZ);
        sprite.scale.set(2.5, 1.25, 1);
        this.agentGroup.add(sprite);

        // Point light under agent for glow effect
        const light = new THREE.PointLight(color, 1, 3);
        light.position.set(worldX, 0.2, worldZ);
        this.agentGroup.add(light);

        this.agentMeshes.set(agent.id, {
          sphere,
          sprite,
          light,
          labelCtx: ctx,
          labelTexture: texture,
          targetPos: new THREE.Vector3(worldX, 0.35, worldZ),
          color
        });
      }
    }

    // Remove departed agents
    for (const [id, data] of this.agentMeshes) {
      if (!currentIds.has(id)) {
        this.agentGroup.remove(data.sphere);
        this.agentGroup.remove(data.sprite);
        this.agentGroup.remove(data.light);
        data.light.dispose();
        data.labelTexture.dispose();
        data.sprite.material.dispose();
        this.agentMeshes.delete(id);
      }
    }
  }

  animate(deltaTime) {
    for (const [, data] of this.agentMeshes) {
      data.sphere.position.lerp(data.targetPos, 0.15);
      // Gentle bobbing
      data.sphere.position.y = 0.35 + Math.sin(Date.now() * 0.003) * 0.05;
      // Label follows sphere
      data.sprite.position.x = data.sphere.position.x;
      data.sprite.position.z = data.sphere.position.z;
      data.sprite.position.y = data.sphere.position.y + 0.85;
      // Light follows sphere
      data.light.position.x = data.sphere.position.x;
      data.light.position.z = data.sphere.position.z;
    }
  }
}
