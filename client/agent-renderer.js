// Agent visualization — colored spheres on tiles

import * as THREE from 'three';

const GRID_SIZE = 32;

// Distinct colors for agents
const AGENT_COLORS = [
  0x44aaff, 0xff4444, 0x44ff44, 0xffaa44, 0xff44ff,
  0x44ffff, 0xffff44, 0xaa44ff, 0xff8888, 0x88ff88
];

export class AgentRenderer {
  constructor(scene) {
    this.scene = scene;
    this.agentMeshes = new Map(); // agentId -> { sphere, label, targetPos }
    this.agentGroup = new THREE.Group();
    this.colorIndex = 0;
    scene.add(this.agentGroup);

    this.sphereGeo = new THREE.SphereGeometry(0.3, 16, 16);
  }

  getAgentColor(agentId) {
    // Consistent color per agent
    let hash = 0;
    for (let i = 0; i < agentId.length; i++) {
      hash = ((hash << 5) - hash + agentId.charCodeAt(i)) | 0;
    }
    return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
  }

  updateAgents(agents) {
    const currentIds = new Set();

    for (const agent of Object.values(agents)) {
      currentIds.add(agent.id);
      const worldX = agent.x - GRID_SIZE / 2 + 0.5;
      const worldZ = agent.y - GRID_SIZE / 2 + 0.5;

      if (this.agentMeshes.has(agent.id)) {
        // Update existing agent — animate toward new position
        const data = this.agentMeshes.get(agent.id);
        data.targetPos.set(worldX, 0.35, worldZ);

        // Update opacity based on HP
        const hpRatio = Math.max(0, agent.hp / 100);
        data.sphere.material.opacity = 0.4 + hpRatio * 0.6;

        // Scale down if low HP
        const scale = 0.7 + hpRatio * 0.3;
        data.sphere.scale.setScalar(scale);
      } else {
        // New agent — create mesh
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
        this.agentMeshes.set(agent.id, {
          sphere,
          targetPos: new THREE.Vector3(worldX, 0.35, worldZ),
          color
        });
      }
    }

    // Remove agents that are no longer in the world
    for (const [id, data] of this.agentMeshes) {
      if (!currentIds.has(id)) {
        this.agentGroup.remove(data.sphere);
        this.agentMeshes.delete(id);
      }
    }
  }

  animate(deltaTime) {
    // Smoothly interpolate agent positions
    for (const [, data] of this.agentMeshes) {
      data.sphere.position.lerp(data.targetPos, 0.15);
      // Gentle bobbing
      data.sphere.position.y = 0.35 + Math.sin(Date.now() * 0.003) * 0.05;
    }
  }

  getAgentAt(x, y, agents) {
    for (const agent of Object.values(agents)) {
      if (agent.x === x && agent.y === y) return agent;
    }
    return null;
  }
}
