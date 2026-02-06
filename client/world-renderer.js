// Grid + tile rendering with Three.js

import * as THREE from 'three';

const GRID_SIZE = 32;
const TILE_SIZE = 1;
const GAP = 0.05;

const ZONE_COLORS = {
  spawn:  0x1e1e30,
  forest: 0x153a15,
  market: 0x2e2a12,
  arena:  0x3a1515,
  shrine: 0x151a38
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

// --- Low-poly tree constants ---
const TRUNK_GEO = new THREE.CylinderGeometry(0.06, 0.09, 0.9, 5);
const FOLIAGE_GEO = new THREE.ConeGeometry(0.35, 0.7, 6);
const TRUNK_MAT = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
const FOLIAGE_MATS = [
  new THREE.MeshLambertMaterial({ color: 0x2d8a2d }),
  new THREE.MeshLambertMaterial({ color: 0x3a9e3a }),
  new THREE.MeshLambertMaterial({ color: 0x228b22 }),
  new THREE.MeshLambertMaterial({ color: 0x1e7a1e }),
];

// count → scale for a single tree per tile (size reflects resource amount)
const TREE_SCALE = { 1: 0.5, 2: 0.65, 3: 0.8, 4: 0.9, 5: 1.0 };

function tileHash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function createTree(scale, foliageMat, rotationY) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(TRUNK_GEO, TRUNK_MAT);
  trunk.position.y = 0.45 * scale;
  trunk.scale.setScalar(scale);
  group.add(trunk);
  const foliage = new THREE.Mesh(FOLIAGE_GEO, foliageMat);
  foliage.position.y = (0.9 + 0.35) * scale;
  foliage.scale.setScalar(scale);
  group.add(foliage);
  group.rotation.y = rotationY;
  return group;
}

// --- Grass constants ---
const GRASS_GEO = new THREE.ConeGeometry(0.03, 0.15, 3);
const GRASS_MATS = [
  new THREE.MeshLambertMaterial({ color: 0x2a7a2a }),
  new THREE.MeshLambertMaterial({ color: 0x3b8b3b }),
  new THREE.MeshLambertMaterial({ color: 0x1f6b1f }),
  new THREE.MeshLambertMaterial({ color: 0x4a9a3a }),
];
const BLADES_PER_TILE = 5;

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
    const borderMat = new THREE.LineBasicMaterial({ color: 0x222244 });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.01;
    this.gridGroup.add(border);

    // Forest grass
    this.addForestGrass();

    // Zone border lines
    this.addZoneBorders();

    // Zone labels
    this.addZoneLabels();

    // Initial resource rendering
    this.renderResources();
  }

  addForestGrass() {
    const half = GRID_SIZE / 2;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (getTileType(x, y) !== 'forest') continue;
        for (let i = 0; i < BLADES_PER_TILE; i++) {
          const h1 = tileHash(x * 7 + i, y * 13 + i);
          const h2 = tileHash(x + i * 11, y + i * 3);
          const h3 = tileHash(x * 5 + i, y * 9);
          const ox = (h1 - 0.5) * 0.85;
          const oz = (h2 - 0.5) * 0.85;
          const scale = 0.6 + h3 * 0.8;
          const mat = GRASS_MATS[Math.floor(h1 * GRASS_MATS.length)];
          const blade = new THREE.Mesh(GRASS_GEO, mat);
          blade.position.set(
            x - half + 0.5 + ox,
            0.075 * scale,
            y - half + 0.5 + oz
          );
          blade.scale.set(scale, scale, scale);
          blade.rotation.y = h2 * Math.PI * 2;
          // Slight lean
          blade.rotation.z = (h3 - 0.5) * 0.3;
          this.gridGroup.add(blade);
        }
      }
    }
  }

  addZoneBorders() {
    const zoneBorderColor = 0x334466;
    const mat = new THREE.LineBasicMaterial({ color: zoneBorderColor, transparent: true, opacity: 0.5 });
    const half = GRID_SIZE / 2;

    // Draw lines at zone boundaries: x=11, x=21, y=11, y=21
    const boundaries = [11, 21];
    for (const b of boundaries) {
      // Vertical line (x = b)
      const vGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(b - half, 0.02, -half),
        new THREE.Vector3(b - half, 0.02, half)
      ]);
      this.gridGroup.add(new THREE.Line(vGeo, mat));

      // Horizontal line (y = b)
      const hGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-half, 0.02, b - half),
        new THREE.Vector3(half, 0.02, b - half)
      ]);
      this.gridGroup.add(new THREE.Line(hGeo, mat));
    }
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

    // Geometries for non-wood resources
    const geos = {
      stone: new THREE.BoxGeometry(0.2, 0.18, 0.2),             // blocks
      gold: new THREE.OctahedronGeometry(0.12),                  // gems
    };

    // Only render a sparse set for visual effect (every 3rd tile)
    for (const [key, data] of this.resourceCounts) {
      if (data.count <= 0) continue;
      const [xs, ys] = key.split(',');
      const x = parseInt(xs), y = parseInt(ys);

      // Render every 3rd tile to keep scene light
      if ((x + y) % 3 !== 0) continue;

      const count = Math.min(data.count, 5);
      const baseX = x - GRID_SIZE / 2 + 0.5 + 0.3;
      const baseZ = y - GRID_SIZE / 2 + 0.5 + 0.3;

      if (data.resource === 'wood') {
        const h = tileHash(x, y);
        // ~20% of tiles stay empty for natural gaps
        if (h < 0.2) continue;
        // Tile hash picks 1, 2, or 3 trees (~50% / ~30% / ~20%)
        const treeCount = h < 0.5 ? 1 : h < 0.8 ? 2 : 3;
        const OFFSETS = [
          [[0, 0]],
          [[-0.12, -0.08], [0.12, 0.08]],
          [[-0.12, -0.1], [0.12, -0.05], [0, 0.12]],
        ];
        const positions = OFFSETS[treeCount - 1];
        const group = new THREE.Group();
        for (let i = 0; i < treeCount; i++) {
          const s = TREE_SCALE[count] * (0.55 + 0.9 * tileHash(x + i, y + i * 7));
          const matIdx = (Math.floor(h * 97) + i) % FOLIAGE_MATS.length;
          const rotY = tileHash(x * 3 + i, y * 5) * Math.PI * 2;
          const t = createTree(s, FOLIAGE_MATS[matIdx], rotY);
          t.position.set(positions[i][0], 0, positions[i][1]);
          group.add(t);
        }
        group.position.set(baseX, 0, baseZ);
        this.gridGroup.add(group);
        this.resourceMeshes.set(key, group);
      } else {
        // Stone / gold — original rendering
        const color = RESOURCE_COLORS[data.resource] || 0xffffff;
        const geo = geos[data.resource] || geos.stone;
        const material = new THREE.MeshLambertMaterial({ color });
        const mesh = new THREE.Mesh(geo, material);
        const baseY = data.resource === 'gold' ? 0.15 : 0.1;
        mesh.position.set(baseX, baseY + 0.04 * count, baseZ);
        if (data.resource === 'gold') {
          mesh.scale.setScalar(0.8 + count * 0.15);
        } else {
          mesh.scale.set(1, count * 0.5, 1);
        }
        this.gridGroup.add(mesh);
        this.resourceMeshes.set(key, mesh);
      }
    }
  }

  getTileAt(x, y) {
    return this.tileMeshes.find(m => m.userData.tileX === x && m.userData.tileY === y);
  }
}
