// Visual effects — chat bubbles, combat flashes, gather particles

import * as THREE from 'three';
import { getTerrainHeight } from './world-renderer.js';

const GRID_SIZE = 64;

export class EffectsManager {
  constructor(scene) {
    this.scene = scene;
    this.effects = []; // { mesh, lifetime, age, update }
  }

  toWorld(x, y) {
    const wx = x - GRID_SIZE / 2 + 0.5;
    const wz = y - GRID_SIZE / 2 + 0.5;
    return { x: wx, y: getTerrainHeight(wx, wz), z: wz };
  }

  // --- Chat Bubble ---
  addChatBubble(agentX, agentY, message, color = '#d9bbff') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;

    // Background
    ctx.fillStyle = 'rgba(20, 15, 30, 0.85)';
    roundRect(ctx, 0, 10, 512, 108, 16);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    roundRect(ctx, 0, 10, 512, 108, 16);
    ctx.stroke();

    // Text
    ctx.fillStyle = '#eee';
    ctx.font = '28px monospace';
    const truncated = message.length > 40 ? message.slice(0, 37) + '...' : message;
    ctx.fillText(truncated, 16, 72);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);

    const pos = this.toWorld(agentX, agentY);
    sprite.position.set(pos.x, pos.y + 2.5, pos.z);
    sprite.scale.set(4, 1, 1);

    this.scene.add(sprite);
    this.effects.push({
      mesh: sprite,
      lifetime: 4,
      age: 0,
      update(dt) {
        this.age += dt;
        sprite.position.y += dt * 0.3;
        material.opacity = Math.max(0, 1 - this.age / this.lifetime);
      }
    });
  }

  // --- Combat Flash ---
  addCombatFlash(x, y) {
    const geo = new THREE.RingGeometry(0.1, 0.6, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff3333, transparent: true, opacity: 1, side: THREE.DoubleSide, emissive: 0xff2200, emissiveIntensity: 2.0, roughness: 0.5, metalness: 0.0 });
    const mesh = new THREE.Mesh(geo, mat);
    const pos = this.toWorld(x, y);
    mesh.position.set(pos.x, pos.y + 0.5, pos.z);
    mesh.rotation.x = -Math.PI / 2;

    this.scene.add(mesh);
    this.effects.push({
      mesh,
      lifetime: 0.6,
      age: 0,
      update(dt) {
        this.age += dt;
        const t = this.age / this.lifetime;
        mesh.scale.setScalar(1 + t * 3);
        mat.opacity = Math.max(0, 1 - t);
      }
    });
  }

  // --- Gather Sparkle ---
  addGatherSparkle(x, y, resourceType) {
    const colors = { wood: 0x8B4513, stone: 0xaaaaaa, gold: 0xFFD700 };
    const color = colors[resourceType] || 0xffffff;
    const pos = this.toWorld(x, y);

    for (let i = 0; i < 5; i++) {
      const geo = new THREE.SphereGeometry(0.06, 6, 6);
      const mat = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 1, emissive: color, emissiveIntensity: 1.5, roughness: 0.5, metalness: 0.0 });
      const mesh = new THREE.Mesh(geo, mat);

      const offsetX = (Math.random() - 0.5) * 0.6;
      const offsetZ = (Math.random() - 0.5) * 0.6;
      mesh.position.set(pos.x + offsetX, pos.y + 0.2, pos.z + offsetZ);

      const velY = 1 + Math.random() * 1.5;
      const velX = (Math.random() - 0.5) * 0.5;
      const velZ = (Math.random() - 0.5) * 0.5;

      this.scene.add(mesh);
      this.effects.push({
        mesh,
        lifetime: 1.2,
        age: 0,
        update(dt) {
          this.age += dt;
          mesh.position.y += velY * dt;
          mesh.position.x += velX * dt;
          mesh.position.z += velZ * dt;
          mat.opacity = Math.max(0, 1 - this.age / this.lifetime);
          mesh.scale.setScalar(Math.max(0, 1 - this.age / this.lifetime));
        }
      });
    }
  }

  // --- Kill Explosion ---
  addKillExplosion(x, y) {
    const pos = this.toWorld(x, y);

    for (let i = 0; i < 12; i++) {
      const geo = new THREE.SphereGeometry(0.08, 6, 6);
      const mat = new THREE.MeshStandardMaterial({ color: 0xff2222, transparent: true, opacity: 1, emissive: 0xff2200, emissiveIntensity: 3.0, roughness: 0.5, metalness: 0.0 });
      const mesh = new THREE.Mesh(geo, mat);

      mesh.position.set(pos.x, pos.y + 0.5, pos.z);
      const angle = (i / 12) * Math.PI * 2;
      const speed = 2 + Math.random() * 2;
      const velX = Math.cos(angle) * speed;
      const velZ = Math.sin(angle) * speed;
      const velY = 1 + Math.random() * 2;

      this.scene.add(mesh);
      this.effects.push({
        mesh,
        lifetime: 1,
        age: 0,
        update(dt) {
          this.age += dt;
          mesh.position.x += velX * dt;
          mesh.position.z += velZ * dt;
          mesh.position.y += (velY - this.age * 5) * dt;
          mat.opacity = Math.max(0, 1 - this.age / this.lifetime);
        }
      });
    }
  }

  // --- Enter Glow ---
  addEnterGlow(x, y) {
    const geo = new THREE.RingGeometry(0.05, 0.4, 24);
    const mat = new THREE.MeshStandardMaterial({ color: 0x44ff88, transparent: true, opacity: 1, side: THREE.DoubleSide, emissive: 0x44ff88, emissiveIntensity: 1.5, roughness: 0.5, metalness: 0.0 });
    const mesh = new THREE.Mesh(geo, mat);
    const pos = this.toWorld(x, y);
    mesh.position.set(pos.x, pos.y + 0.1, pos.z);
    mesh.rotation.x = -Math.PI / 2;

    this.scene.add(mesh);
    this.effects.push({
      mesh,
      lifetime: 1.5,
      age: 0,
      update(dt) {
        this.age += dt;
        const t = this.age / this.lifetime;
        mesh.scale.setScalar(1 + t * 4);
        mat.opacity = Math.max(0, 1 - t);
      }
    });
  }

  // --- Animate all effects ---
  animate(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.update(dt);
      if (effect.age >= effect.lifetime) {
        this.scene.remove(effect.mesh);
        if (effect.mesh.material?.map) effect.mesh.material.map.dispose();
        if (effect.mesh.material) effect.mesh.material.dispose();
        if (effect.mesh.geometry) effect.mesh.geometry.dispose();
        this.effects.splice(i, 1);
      }
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
