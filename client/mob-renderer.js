// Mob visualization - simple creatures with different models per type

import * as THREE from 'three';
import { getTerrainHeight } from './world-renderer.js';

const GRID_SIZE = 64;

const MOB_COLORS = {
  wolf: 0x8B4513,   // Brown
  golem: 0x696969,  // DimGray  
  bandit: 0x4B0082, // Indigo
  wraith: 0x9370DB  // MediumPurple
};

class MobRenderer {
  constructor(scene) {
    this.scene = scene;
    this.mobMeshes = new Map();
    this.mobLabels = new Map();
    
    // Create mob templates
    this.templates = this.createMobTemplates();
  }

  createMobTemplates() {
    const templates = {};
    
    // Wolf - simple wolf-like shape
    const wolfGroup = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.15, 0.4, 4, 8),
      new THREE.MeshStandardMaterial({ color: MOB_COLORS.wolf })
    );
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.15;
    wolfGroup.add(body);
    
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 6, 6),
      new THREE.MeshStandardMaterial({ color: MOB_COLORS.wolf })
    );
    head.position.set(0.25, 0.15, 0);
    wolfGroup.add(head);
    templates.wolf = wolfGroup;

    // Golem - blocky stone creature
    const golemGroup = new THREE.Group();
    const golemBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.4, 0.2),
      new THREE.MeshStandardMaterial({ color: MOB_COLORS.golem, roughness: 0.8 })
    );
    golemBody.position.y = 0.2;
    golemGroup.add(golemBody);
    
    const golemHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.2, 0.15),
      new THREE.MeshStandardMaterial({ color: MOB_COLORS.golem, roughness: 0.8 })
    );
    golemHead.position.set(0, 0.5, 0);
    golemGroup.add(golemHead);
    templates.golem = golemGroup;

    // Bandit - humanoid shape
    const banditGroup = new THREE.Group();
    const banditBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.12, 0.4, 6),
      new THREE.MeshStandardMaterial({ color: MOB_COLORS.bandit })
    );
    banditBody.position.y = 0.2;
    banditGroup.add(banditBody);
    
    const banditHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0xFFDBB3 }) // Flesh tone
    );
    banditHead.position.set(0, 0.45, 0);
    banditGroup.add(banditHead);
    templates.bandit = banditGroup;

    // Wraith - ethereal floating shape
    const wraithGroup = new THREE.Group();
    const wraithBody = new THREE.Mesh(
      new THREE.ConeGeometry(0.15, 0.5, 6),
      new THREE.MeshStandardMaterial({ 
        color: MOB_COLORS.wraith,
        transparent: true,
        opacity: 0.7,
        emissive: 0x2a2a5a,
        emissiveIntensity: 0.3
      })
    );
    wraithBody.position.y = 0.35;
    wraithGroup.add(wraithBody);
    templates.wraith = wraithGroup;

    return templates;
  }

  createMobLabel(mobId, mobType, hp, maxHp) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 60;

    // Mob name and type
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#cccccc';
    ctx.fillText(`${mobType.toUpperCase()}`, 128, 16);

    // HP bar background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(44, 30, 168, 12);

    const texture = new THREE.CanvasTexture(canvas);
    this.updateMobHpBar(ctx, texture, hp, maxHp);
    
    return { canvas, ctx, texture };
  }

  updateMobHpBar(ctx, texture, hp, maxHp) {
    const ratio = Math.max(0, hp / maxHp);
    // Clear HP bar area
    ctx.clearRect(44, 30, 168, 12);
    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(44, 30, 168, 12);
    // HP fill (red for mobs)
    ctx.fillStyle = `rgb(${Math.round(255 * (1 - ratio) + 100)}, ${Math.round(100 * ratio)}, 60)`;
    ctx.fillRect(46, 32, Math.round(164 * ratio), 8);
    texture.needsUpdate = true;
  }

  updateMobs(mobs) {
    const currentMobIds = new Set(Object.keys(mobs));
    
    // Remove mobs that no longer exist
    for (const [mobId, mesh] of this.mobMeshes) {
      if (!currentMobIds.has(mobId)) {
        this.scene.remove(mesh);
        this.mobMeshes.delete(mobId);
        
        if (this.mobLabels.has(mobId)) {
          this.scene.remove(this.mobLabels.get(mobId).mesh);
          this.mobLabels.delete(mobId);
        }
      }
    }

    // Add or update mobs
    for (const [mobId, mob] of Object.entries(mobs)) {
      if (!mob.alive) continue;

      let mobMesh = this.mobMeshes.get(mobId);
      
      if (!mobMesh) {
        // Create new mob
        const template = this.templates[mob.type];
        if (template) {
          mobMesh = template.clone();
          this.scene.add(mobMesh);
          this.mobMeshes.set(mobId, mobMesh);

          // Create label
          const labelData = this.createMobLabel(mobId, mob.type, mob.hp, mob.maxHp);
          const labelMaterial = new THREE.SpriteMaterial({ map: labelData.texture, transparent: true });
          const labelSprite = new THREE.Sprite(labelMaterial);
          labelSprite.scale.set(2, 0.6, 1);
          labelSprite.position.y = 0.8;
          this.scene.add(labelSprite);
          
          this.mobLabels.set(mobId, {
            mesh: labelSprite,
            ...labelData
          });
        }
      }

      if (mobMesh) {
        // Position mob on terrain
        const worldX = (mob.x - GRID_SIZE / 2) + 0.5;
        const worldZ = (mob.y - GRID_SIZE / 2) + 0.5;
        const terrainY = getTerrainHeight(worldX, worldZ);
        
        mobMesh.position.set(worldX, terrainY, worldZ);

        // Add slight floating animation for wraiths
        if (mob.type === 'wraith') {
          mobMesh.position.y += Math.sin(Date.now() * 0.002) * 0.1 + 0.2;
        }

        // Update label position and HP
        const labelData = this.mobLabels.get(mobId);
        if (labelData) {
          labelData.mesh.position.set(worldX, terrainY + 0.8, worldZ);
          this.updateMobHpBar(labelData.ctx, labelData.texture, mob.hp, mob.maxHp);
        }
      }
    }
  }

  dispose() {
    for (const [mobId, mesh] of this.mobMeshes) {
      this.scene.remove(mesh);
    }
    for (const [mobId, labelData] of this.mobLabels) {
      this.scene.remove(labelData.mesh);
    }
    this.mobMeshes.clear();
    this.mobLabels.clear();
  }
}

export { MobRenderer };