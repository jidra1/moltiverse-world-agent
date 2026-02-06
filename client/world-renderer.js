// Grid + tile rendering with Three.js

import * as THREE from 'three';

const GRID_SIZE = 32;
const TILE_SIZE = 1;
const GAP = 0.05;

const ZONE_COLORS = {
  spawn:  0x2a2a3a,
  forest: 0x1a4a1a,
  market: 0x3a3a1a,
  arena:  0x4a1a1a,
  shrine: 0x1a2a4a
};

const RESOURCE_COLORS = {
  wood: 0x8B4513,
  stone: 0x808080,
  gold: 0xFFD700
};

const ZONE_RESOURCE = {
  forest: 'wood',
  arena: 'stone',
  shrine: 'gold'
};

// Zone definitions matching server
const ZONES = [
  { type: 'spawn',  x1: 11, y1: 11, x2: 20, y2: 20 },
  { type: 'forest', x1: 0,  y1: 0,  x2: 10, y2: 10 },
  { type: 'forest', x1: 11, y1: 0,  x2: 20, y2: 10 },
  { type: 'forest', x1: 0,  y1: 21, x2: 10, y2: 31 },
  { type: 'forest', x1: 11, y1: 21, x2: 20, y2: 31 },
  { type: 'market',  x1: 0,  y1: 11, x2: 10, y2: 20 },
  { type: 'arena',   x1: 21, y1: 11, x2: 31, y2: 20 },
  { type: 'shrine',  x1: 21, y1: 0,  x2: 31, y2: 10 },
  { type: 'shrine',  x1: 21, y1: 21, x2: 31, y2: 31 },
];

function getTileType(x, y) {
  for (const zone of ZONES) {
    if (x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2) {
      return zone.type;
    }
  }
  return 'spawn';
}

export class WorldRenderer {
  constructor(scene) {
    this.scene = scene;
    this.tileMeshes = [];
    this.resourceMeshes = new Map(); // key: "x,y" -> mesh
    this.gridGroup = new THREE.Group();
    // Local resource count map — default 3 for resource tiles
    this.resourceCounts = new Map();
    scene.add(this.gridGroup);
  }

  buildGrid() {
    const geometry = new THREE.PlaneGeometry(TILE_SIZE - GAP, TILE_SIZE - GAP);

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const type = getTileType(x, y);
        const color = ZONE_COLORS[type] || 0x222222;
        const material = new THREE.MeshLambertMaterial({ color });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x - GRID_SIZE / 2 + 0.5, 0, y - GRID_SIZE / 2 + 0.5);
        mesh.rotation.x = -Math.PI / 2;
        mesh.userData = { tileX: x, tileY: y, type };
        this.gridGroup.add(mesh);
        this.tileMeshes.push(mesh);

        // Initialize resource counts
        const resource = ZONE_RESOURCE[type];
        if (resource) {
          this.resourceCounts.set(`${x},${y}`, { resource, count: 3 });
        }
      }
    }

    // Add grid border lines
    const borderGeo = new THREE.EdgesGeometry(
      new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE)
    );
    const borderMat = new THREE.LineBasicMaterial({ color: 0x333355 });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.01;
    this.gridGroup.add(border);

    // Zone labels
    this.addZoneLabels();

    // Initial resource rendering
    this.renderResources();
  }

  addZoneLabels() {
    const labels = [
      { text: 'SPAWN', x: 15.5, y: 15.5, color: '#8888cc' },
      { text: 'FOREST', x: 5, y: 5, color: '#55aa55' },
      { text: 'FOREST', x: 15.5, y: 5, color: '#55aa55' },
      { text: 'FOREST', x: 5, y: 26, color: '#55aa55' },
      { text: 'FOREST', x: 15.5, y: 26, color: '#55aa55' },
      { text: 'MARKET', x: 5, y: 15.5, color: '#ccaa44' },
      { text: 'ARENA', x: 26, y: 15.5, color: '#cc4444' },
      { text: 'SHRINE', x: 26, y: 5, color: '#4488cc' },
      { text: 'SHRINE', x: 26, y: 26, color: '#4488cc' },
    ];

    for (const label of labels) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = 256;
      canvas.height = 64;

      ctx.font = 'bold 32px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillText(label.text, 129, 41);
      ctx.fillStyle = label.color;
      ctx.fillText(label.text, 128, 40);

      const texture = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.7, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(
        label.x - GRID_SIZE / 2 + 0.5,
        0.3,
        label.y - GRID_SIZE / 2 + 0.5
      );
      sprite.scale.set(5, 1.25, 1);
      this.gridGroup.add(sprite);
    }
  }

  updateResources(activeTiles) {
    // Update local resource map with server deltas
    for (const tile of activeTiles) {
      if (tile.resource) {
        const key = `${tile.x},${tile.y}`;
        this.resourceCounts.set(key, { resource: tile.resource, count: tile.resourceCount });
      }
    }
    this.renderResources();
  }

  renderResources() {
    // Clear existing
    for (const [, mesh] of this.resourceMeshes) {
      this.gridGroup.remove(mesh);
    }
    this.resourceMeshes.clear();

    const resourceGeo = new THREE.BoxGeometry(0.2, 0.15, 0.2);

    // Only render a sparse set for visual effect (every 3rd tile)
    for (const [key, data] of this.resourceCounts) {
      if (data.count <= 0) continue;
      const [xs, ys] = key.split(',');
      const x = parseInt(xs), y = parseInt(ys);

      // Render every 3rd tile to keep scene light
      if ((x + y) % 3 !== 0) continue;

      const color = RESOURCE_COLORS[data.resource] || 0xffffff;
      const material = new THREE.MeshLambertMaterial({ color });
      const count = Math.min(data.count, 5);
      const mesh = new THREE.Mesh(resourceGeo, material);
      mesh.position.set(
        x - GRID_SIZE / 2 + 0.5 + 0.3,
        0.075 * count,
        y - GRID_SIZE / 2 + 0.5 + 0.3
      );
      mesh.scale.y = count;
      this.gridGroup.add(mesh);
      this.resourceMeshes.set(key, mesh);
    }
  }

  getTileAt(x, y) {
    return this.tileMeshes.find(m => m.userData.tileX === x && m.userData.tileY === y);
  }
}
