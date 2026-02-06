// Grid + tile rendering with Three.js

import * as THREE from 'three';

const GRID_SIZE = 64;
const TILE_SIZE = 1;
const GAP = 0.05;

const ZONE_COLORS = {
  spawn:  0x5a5075,
  forest: 0x3a8a40,
  market: 0x8a7a38,
  arena:  0x8a3838,
  shrine: 0x8a7840
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
const TRUNK_MAT = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9, metalness: 0.0 });
const FOLIAGE_MATS = [
  new THREE.MeshStandardMaterial({ color: 0x2d8a2d, roughness: 0.7, metalness: 0.0, emissive: 0x0a2a0a, emissiveIntensity: 0.5 }),
  new THREE.MeshStandardMaterial({ color: 0x3a9e3a, roughness: 0.7, metalness: 0.0, emissive: 0x0a2a0a, emissiveIntensity: 0.5 }),
  new THREE.MeshStandardMaterial({ color: 0x228b22, roughness: 0.7, metalness: 0.0, emissive: 0x0a2a0a, emissiveIntensity: 0.5 }),
  new THREE.MeshStandardMaterial({ color: 0x1e7a1e, roughness: 0.7, metalness: 0.0, emissive: 0x0a2a0a, emissiveIntensity: 0.5 }),
];

// count → scale for a single tree per tile (size reflects resource amount)
const TREE_SCALE = { 1: 0.5, 2: 0.65, 3: 0.8, 4: 0.9, 5: 1.0 };

function tileHash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function smoothNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = tileHash(ix, iy);
  const n10 = tileHash(ix + 1, iy);
  const n01 = tileHash(ix, iy + 1);
  const n11 = tileHash(ix + 1, iy + 1);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

export function getTerrainHeight(worldX, worldZ) {
  let h = 0;
  h += smoothNoise(worldX * 0.08 + 50, worldZ * 0.08 + 50) * 3.0;   // broad rolling hills
  h += smoothNoise(worldX * 0.2 + 100, worldZ * 0.2 + 100) * 1.2;   // medium features
  h += smoothNoise(worldX * 0.5 + 200, worldZ * 0.5 + 200) * 0.4;   // bumps
  h += smoothNoise(worldX * 1.0 + 300, worldZ * 1.0 + 300) * 0.15;  // fine rocky detail
  return h - 1.5;
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
  new THREE.MeshStandardMaterial({ color: 0x2a7a2a, roughness: 0.8, metalness: 0.0 }),
  new THREE.MeshStandardMaterial({ color: 0x3b8b3b, roughness: 0.8, metalness: 0.0 }),
  new THREE.MeshStandardMaterial({ color: 0x1f6b1f, roughness: 0.8, metalness: 0.0 }),
  new THREE.MeshStandardMaterial({ color: 0x4a9a3a, roughness: 0.8, metalness: 0.0 }),
];
const BLADES_PER_TILE = 3;

// --- Mountain constants ---
const MOUNTAIN_BASE_GEO = new THREE.ConeGeometry(1.2, 0.9, 6);   // wide squat base
const MOUNTAIN_PEAK_GEO = new THREE.ConeGeometry(0.5, 0.7, 5);   // narrow peak on top
const MOUNTAIN_BASE_MAT = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.75, metalness: 0.1 });
const MOUNTAIN_PEAK_MATS = [
  new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.55, metalness: 0.15 }),
  new THREE.MeshStandardMaterial({ color: 0x7a6b5a, roughness: 0.65, metalness: 0.1 }),
  new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.6, metalness: 0.1 }),
];

// --- Lake constants ---
const LAKE_GEO = new THREE.CircleGeometry(0.9, 16);
const LAKE_MAT = new THREE.MeshStandardMaterial({
  color: 0x2277aa, transparent: true, opacity: 0.7,
  roughness: 0.2, metalness: 0.3,
  emissive: 0x225588, emissiveIntensity: 0.8,
});

// --- Shrine / desert constants ---
const DUNE_GEO = new THREE.SphereGeometry(0.3, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
const DUNE_MAT = new THREE.MeshStandardMaterial({ color: 0x8a7a50, roughness: 0.9, metalness: 0.0 });

const CACTUS_BODY_GEO = new THREE.CylinderGeometry(0.06, 0.07, 0.5, 6);
const CACTUS_ARM_GEO = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 5);
const CACTUS_MAT = new THREE.MeshStandardMaterial({ color: 0x3a6a2a, roughness: 0.7, metalness: 0.0 });

const TEMPLE_TIER1_GEO = new THREE.BoxGeometry(1.0, 0.25, 1.0);
const TEMPLE_TIER2_GEO = new THREE.BoxGeometry(0.7, 0.25, 0.7);
const TEMPLE_TIER3_GEO = new THREE.BoxGeometry(0.45, 0.2, 0.45);
const TEMPLE_PEAK_GEO = new THREE.ConeGeometry(0.25, 0.35, 4);
const TEMPLE_COLUMN_GEO = new THREE.CylinderGeometry(0.04, 0.05, 0.55, 6);
const TEMPLE_STONE_MAT = new THREE.MeshStandardMaterial({ color: 0x5a5040, roughness: 0.75, metalness: 0.05 });
const TEMPLE_SAND_MAT = new THREE.MeshStandardMaterial({ color: 0xa89060, roughness: 0.8, metalness: 0.0 });
const TEMPLE_GOLD_MAT = new THREE.MeshStandardMaterial({ color: 0xccaa44, roughness: 0.3, metalness: 0.7, emissive: 0x886600, emissiveIntensity: 1.0 });

// --- Arena constants ---
const PILLAR_GEO = new THREE.CylinderGeometry(0.15, 0.18, 0.8, 6);
const PILLAR_CAP_GEO = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 6);
const PILLAR_MAT = new THREE.MeshStandardMaterial({ color: 0x6a6060, roughness: 0.8, metalness: 0.1 });

const TORCH_POLE_GEO = new THREE.CylinderGeometry(0.03, 0.04, 0.6, 5);
const TORCH_FLAME_GEO = new THREE.ConeGeometry(0.07, 0.15, 5);
const TORCH_POLE_MAT = new THREE.MeshStandardMaterial({ color: 0x3a3030, roughness: 0.7, metalness: 0.3 });
const TORCH_FLAME_MAT = new THREE.MeshStandardMaterial({ color: 0xff6622, emissive: 0xff4400, emissiveIntensity: 2.0, roughness: 0.5 });

const RUBBLE_GEO = new THREE.DodecahedronGeometry(0.1, 0);
const RUBBLE_MATS = [
  new THREE.MeshStandardMaterial({ color: 0x6a5a5a, roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: 0x7a6a60, roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: 0x5a5050, roughness: 0.9 }),
];

const SKULL_GEO = new THREE.SphereGeometry(0.08, 5, 4);
const SKULL_JAW_GEO = new THREE.BoxGeometry(0.06, 0.03, 0.08);
const SKULL_MAT = new THREE.MeshStandardMaterial({ color: 0xd0c8b0, roughness: 0.7, metalness: 0.05 });

// --- Spawn constants ---
const FOUNTAIN_BASE_GEO = new THREE.CylinderGeometry(0.8, 0.9, 0.2, 8);
const FOUNTAIN_BOWL_GEO = new THREE.CylinderGeometry(0.5, 0.6, 0.15, 8);
const FOUNTAIN_PILLAR_GEO = new THREE.CylinderGeometry(0.08, 0.1, 0.6, 6);
const FOUNTAIN_WATER_GEO = new THREE.SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
const FOUNTAIN_STONE_MAT = new THREE.MeshStandardMaterial({ color: 0x7a7080, roughness: 0.7, metalness: 0.1 });
const FOUNTAIN_WATER_MAT = new THREE.MeshStandardMaterial({ color: 0x4488cc, transparent: true, opacity: 0.6, emissive: 0x225577, emissiveIntensity: 0.8, roughness: 0.2, metalness: 0.3 });

const LAMP_POLE_GEO = new THREE.CylinderGeometry(0.03, 0.04, 0.7, 5);
const LAMP_ORB_GEO = new THREE.SphereGeometry(0.08, 6, 6);
const LAMP_POLE_MAT = new THREE.MeshStandardMaterial({ color: 0x4a4040, roughness: 0.6, metalness: 0.4 });
const LAMP_ORB_MAT = new THREE.MeshStandardMaterial({ color: 0xffeebb, emissive: 0xffcc66, emissiveIntensity: 1.5, roughness: 0.3, metalness: 0.1 });

const BENCH_SEAT_GEO = new THREE.BoxGeometry(0.4, 0.04, 0.15);
const BENCH_LEG_GEO = new THREE.BoxGeometry(0.04, 0.15, 0.12);
const BENCH_MAT = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.8 });

const COBBLE_GEO = new THREE.CircleGeometry(0.3, 6);
const COBBLE_MAT = new THREE.MeshStandardMaterial({ color: 0x6a6570, roughness: 0.9, metalness: 0.05 });

// --- Market constants ---
const STALL_CANOPY_GEO = new THREE.BoxGeometry(0.8, 0.04, 0.6);
const STALL_POLE_GEO = new THREE.CylinderGeometry(0.025, 0.03, 0.5, 4);
const STALL_CANOPY_MATS = [
  new THREE.MeshStandardMaterial({ color: 0xcc4444, roughness: 0.6 }),
  new THREE.MeshStandardMaterial({ color: 0x44aa44, roughness: 0.6 }),
  new THREE.MeshStandardMaterial({ color: 0x4444cc, roughness: 0.6 }),
  new THREE.MeshStandardMaterial({ color: 0xccaa44, roughness: 0.6 }),
];
const STALL_POLE_MAT = new THREE.MeshStandardMaterial({ color: 0x5a4020, roughness: 0.8 });

const CRATE_GEO = new THREE.BoxGeometry(0.2, 0.2, 0.2);
const CRATE_MAT = new THREE.MeshStandardMaterial({ color: 0x7a5a30, roughness: 0.85 });

const BARREL_GEO = new THREE.CylinderGeometry(0.1, 0.1, 0.22, 7);
const BARREL_MAT = new THREE.MeshStandardMaterial({ color: 0x6a4a28, roughness: 0.8, metalness: 0.05 });

const CARPET_GEO = new THREE.PlaneGeometry(0.6, 0.4);
const CARPET_MATS = [
  new THREE.MeshStandardMaterial({ color: 0x993344, roughness: 0.95 }),
  new THREE.MeshStandardMaterial({ color: 0x446688, roughness: 0.95 }),
  new THREE.MeshStandardMaterial({ color: 0x886633, roughness: 0.95 }),
];

function createTemple(scale) {
  const group = new THREE.Group();
  // Tier 1 — wide base
  const tier1 = new THREE.Mesh(TEMPLE_TIER1_GEO, TEMPLE_STONE_MAT);
  tier1.position.y = 0.125 * scale;
  tier1.scale.setScalar(scale);
  tier1.castShadow = true;
  tier1.receiveShadow = true;
  group.add(tier1);
  // Tier 2 — medium
  const tier2 = new THREE.Mesh(TEMPLE_TIER2_GEO, TEMPLE_SAND_MAT);
  tier2.position.y = 0.375 * scale;
  tier2.scale.setScalar(scale);
  tier2.castShadow = true;
  tier2.receiveShadow = true;
  group.add(tier2);
  // Tier 3 — small
  const tier3 = new THREE.Mesh(TEMPLE_TIER3_GEO, TEMPLE_SAND_MAT);
  tier3.position.y = 0.6 * scale;
  tier3.scale.setScalar(scale);
  tier3.castShadow = true;
  group.add(tier3);
  // Peak — gold cone
  const peak = new THREE.Mesh(TEMPLE_PEAK_GEO, TEMPLE_GOLD_MAT);
  peak.position.y = 0.875 * scale;
  peak.scale.setScalar(scale);
  peak.castShadow = true;
  group.add(peak);
  // 4 corner columns
  const colOffset = 0.42 * scale;
  for (const [cx, cz] of [[-colOffset, -colOffset], [colOffset, -colOffset], [-colOffset, colOffset], [colOffset, colOffset]]) {
    const col = new THREE.Mesh(TEMPLE_COLUMN_GEO, TEMPLE_GOLD_MAT);
    col.position.set(cx, 0.275 * scale, cz);
    col.scale.setScalar(scale);
    col.castShadow = true;
    group.add(col);
  }
  return group;
}

function createCactus(scale) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(CACTUS_BODY_GEO, CACTUS_MAT);
  body.position.y = 0.25 * scale;
  body.scale.setScalar(scale);
  group.add(body);
  // One arm
  const arm = new THREE.Mesh(CACTUS_ARM_GEO, CACTUS_MAT);
  arm.position.set(0.1 * scale, 0.3 * scale, 0);
  arm.rotation.z = -Math.PI / 4;
  arm.scale.setScalar(scale);
  group.add(arm);
  return group;
}

function createPillar(scale) {
  const group = new THREE.Group();
  const shaft = new THREE.Mesh(PILLAR_GEO, PILLAR_MAT);
  shaft.position.y = 0.4 * scale;
  shaft.scale.setScalar(scale);
  shaft.castShadow = true;
  group.add(shaft);
  // ~40% chance of broken top (no cap)
  if (tileHash(Math.floor(scale * 1000), 99) > 0.4) {
    const cap = new THREE.Mesh(PILLAR_CAP_GEO, PILLAR_MAT);
    cap.position.y = 0.84 * scale;
    cap.scale.setScalar(scale);
    cap.castShadow = true;
    group.add(cap);
  }
  return group;
}

function createTorch(scale) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(TORCH_POLE_GEO, TORCH_POLE_MAT);
  pole.position.y = 0.3 * scale;
  pole.scale.setScalar(scale);
  group.add(pole);
  const flame = new THREE.Mesh(TORCH_FLAME_GEO, TORCH_FLAME_MAT);
  flame.position.y = 0.675 * scale;
  flame.scale.setScalar(scale);
  group.add(flame);
  return group;
}

function createFountain(scale) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(FOUNTAIN_BASE_GEO, FOUNTAIN_STONE_MAT);
  base.position.y = 0.1 * scale;
  base.scale.setScalar(scale);
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);
  const bowl = new THREE.Mesh(FOUNTAIN_BOWL_GEO, FOUNTAIN_STONE_MAT);
  bowl.position.y = 0.275 * scale;
  bowl.scale.setScalar(scale);
  bowl.castShadow = true;
  group.add(bowl);
  const pillar = new THREE.Mesh(FOUNTAIN_PILLAR_GEO, FOUNTAIN_STONE_MAT);
  pillar.position.y = 0.55 * scale;
  pillar.scale.setScalar(scale);
  pillar.castShadow = true;
  group.add(pillar);
  const water = new THREE.Mesh(FOUNTAIN_WATER_GEO, FOUNTAIN_WATER_MAT);
  water.position.y = 0.85 * scale;
  water.scale.setScalar(scale);
  group.add(water);
  return group;
}

function createLampPost(scale) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(LAMP_POLE_GEO, LAMP_POLE_MAT);
  pole.position.y = 0.35 * scale;
  pole.scale.setScalar(scale);
  group.add(pole);
  const orb = new THREE.Mesh(LAMP_ORB_GEO, LAMP_ORB_MAT);
  orb.position.y = 0.78 * scale;
  orb.scale.setScalar(scale);
  group.add(orb);
  return group;
}

function createBench(scale) {
  const group = new THREE.Group();
  const seat = new THREE.Mesh(BENCH_SEAT_GEO, BENCH_MAT);
  seat.position.y = 0.17 * scale;
  seat.scale.setScalar(scale);
  group.add(seat);
  const leg1 = new THREE.Mesh(BENCH_LEG_GEO, BENCH_MAT);
  leg1.position.set(-0.14 * scale, 0.075 * scale, 0);
  leg1.scale.setScalar(scale);
  group.add(leg1);
  const leg2 = new THREE.Mesh(BENCH_LEG_GEO, BENCH_MAT);
  leg2.position.set(0.14 * scale, 0.075 * scale, 0);
  leg2.scale.setScalar(scale);
  group.add(leg2);
  return group;
}

function createStall(scale, canopyMat) {
  const group = new THREE.Group();
  const canopy = new THREE.Mesh(STALL_CANOPY_GEO, canopyMat);
  canopy.position.y = 0.52 * scale;
  canopy.scale.setScalar(scale);
  canopy.castShadow = true;
  group.add(canopy);
  const offsets = [[-0.35, -0.25], [0.35, -0.25], [-0.35, 0.25], [0.35, 0.25]];
  for (const [px, pz] of offsets) {
    const pole = new THREE.Mesh(STALL_POLE_GEO, STALL_POLE_MAT);
    pole.position.set(px * scale, 0.25 * scale, pz * scale);
    pole.scale.setScalar(scale);
    group.add(pole);
  }
  return group;
}

function createMountain(scale, peakMat, rotationY) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(MOUNTAIN_BASE_GEO, MOUNTAIN_BASE_MAT);
  base.position.y = 0.45 * scale;
  base.scale.setScalar(scale);
  base.castShadow = true;
  group.add(base);
  const peak = new THREE.Mesh(MOUNTAIN_PEAK_GEO, peakMat);
  peak.position.set(0.1 * scale, 0.85 * scale, 0.05 * scale);
  peak.scale.setScalar(scale);
  peak.castShadow = true;
  group.add(peak);
  group.rotation.y = rotationY;
  return group;
}

// Zone definitions matching server — 5x5 grid, 25 zones
const ZONES = [
  // Row 0
  { type: 'forest', x1: 0,  y1: 0,  x2: 12, y2: 12 },
  { type: 'forest', x1: 13, y1: 0,  x2: 25, y2: 12 },
  { type: 'shrine', x1: 26, y1: 0,  x2: 37, y2: 12 },
  { type: 'forest', x1: 38, y1: 0,  x2: 50, y2: 12 },
  { type: 'forest', x1: 51, y1: 0,  x2: 63, y2: 12 },
  // Row 1
  { type: 'forest', x1: 0,  y1: 13, x2: 12, y2: 25 },
  { type: 'arena',  x1: 13, y1: 13, x2: 25, y2: 25 },
  { type: 'market', x1: 26, y1: 13, x2: 37, y2: 25 },
  { type: 'arena',  x1: 38, y1: 13, x2: 50, y2: 25 },
  { type: 'forest', x1: 51, y1: 13, x2: 63, y2: 25 },
  // Row 2
  { type: 'shrine', x1: 0,  y1: 26, x2: 12, y2: 37 },
  { type: 'market', x1: 13, y1: 26, x2: 25, y2: 37 },
  { type: 'spawn',  x1: 26, y1: 26, x2: 37, y2: 37 },
  { type: 'market', x1: 38, y1: 26, x2: 50, y2: 37 },
  { type: 'shrine', x1: 51, y1: 26, x2: 63, y2: 37 },
  // Row 3
  { type: 'forest', x1: 0,  y1: 38, x2: 12, y2: 50 },
  { type: 'arena',  x1: 13, y1: 38, x2: 25, y2: 50 },
  { type: 'market', x1: 26, y1: 38, x2: 37, y2: 50 },
  { type: 'arena',  x1: 38, y1: 38, x2: 50, y2: 50 },
  { type: 'forest', x1: 51, y1: 38, x2: 63, y2: 50 },
  // Row 4
  { type: 'forest', x1: 0,  y1: 51, x2: 12, y2: 63 },
  { type: 'forest', x1: 13, y1: 51, x2: 25, y2: 63 },
  { type: 'shrine', x1: 26, y1: 51, x2: 37, y2: 63 },
  { type: 'forest', x1: 38, y1: 51, x2: 50, y2: 63 },
  { type: 'forest', x1: 51, y1: 51, x2: 63, y2: 63 },
];

function getTileType(x, y) {
  for (const zone of ZONES) {
    if (x >= zone.x1 && x <= zone.x2 && y >= zone.y1 && y <= zone.y2) {
      return zone.type;
    }
  }
  return 'spawn';
}

// Per-zone color palettes — 3 variants each for patchy variety
const ZONE_PALETTES = {
  spawn:  [new THREE.Color(0x5a5075), new THREE.Color(0x4e4668), new THREE.Color(0x665a82)],
  forest: [new THREE.Color(0x3a8a40), new THREE.Color(0x2e7a34), new THREE.Color(0x469a4c)],
  market: [new THREE.Color(0x8a7a38), new THREE.Color(0x7e6e2c), new THREE.Color(0x968644)],
  arena:  [new THREE.Color(0x8a3838), new THREE.Color(0x7e2c2c), new THREE.Color(0x964444)],
  shrine: [new THREE.Color(0x8a7840), new THREE.Color(0x7e6c34), new THREE.Color(0x96844c)],
};

// Pre-build sample ring: center + 3 rings at increasing radii, distance-weighted
const _blendSamples = (() => {
  const samples = [];
  // Center point — highest weight
  samples.push({ ox: 0, oz: 0, w: 2.0 });
  // Ring 1 — radius 3, 8 points
  for (let a = 0; a < 8; a++) {
    const angle = a * Math.PI / 4;
    samples.push({ ox: Math.cos(angle) * 3, oz: Math.sin(angle) * 3, w: 1.2 });
  }
  // Ring 2 — radius 6, 8 points
  for (let a = 0; a < 8; a++) {
    const angle = (a + 0.5) * Math.PI / 4;
    samples.push({ ox: Math.cos(angle) * 6, oz: Math.sin(angle) * 6, w: 0.6 });
  }
  // Ring 3 — radius 9, 8 points (wide reach for gradual blend)
  for (let a = 0; a < 8; a++) {
    const angle = a * Math.PI / 4;
    samples.push({ ox: Math.cos(angle) * 9, oz: Math.sin(angle) * 9, w: 0.25 });
  }
  return samples;
})();

function getBlendedZoneColor(worldX, worldZ) {
  const half = GRID_SIZE / 2;

  // Accumulate distance-weighted zone contributions
  const weights = { spawn: 0, forest: 0, market: 0, arena: 0, shrine: 0 };
  let totalWeight = 0;

  for (const s of _blendSamples) {
    // Noise-driven wobble so boundaries become organic curves
    const wobbleX = smoothNoise(worldX * 0.1 + s.oz * 0.2 + 500, worldZ * 0.1 + s.ox * 0.2 + 500) * 3.0;
    const wobbleZ = smoothNoise(worldX * 0.1 + s.oz * 0.2 + 600, worldZ * 0.1 + s.ox * 0.2 + 600) * 3.0;
    const sx = worldX + s.ox + wobbleX;
    const sz = worldZ + s.oz + wobbleZ;
    const tileX = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(sx + half)));
    const tileY = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(sz + half)));
    const type = getTileType(tileX, tileY);
    weights[type] += s.w;
    totalWeight += s.w;
  }

  const result = new THREE.Color(0, 0, 0);

  for (const zone in weights) {
    if (weights[zone] === 0) continue;
    const w = weights[zone] / totalWeight;
    // Pick palette variant using noise
    const palette = ZONE_PALETTES[zone];
    const variantNoise = smoothNoise(worldX * 0.06 + 700, worldZ * 0.06 + 700);
    const variantIdx = Math.floor(variantNoise * palette.length) % palette.length;
    const baseColor = palette[variantIdx];
    result.r += baseColor.r * w;
    result.g += baseColor.g * w;
    result.b += baseColor.b * w;
  }

  // 3 octaves of brightness noise
  const bright1 = (smoothNoise(worldX * 0.04 + 800, worldZ * 0.04 + 800) - 0.5) * 0.15;  // +/-7.5%
  const bright2 = (smoothNoise(worldX * 0.12 + 900, worldZ * 0.12 + 900) - 0.5) * 0.08;   // +/-4%
  const bright3 = (smoothNoise(worldX * 0.35 + 1000, worldZ * 0.35 + 1000) - 0.5) * 0.05;  // +/-2.5%
  const brightness = 1 + bright1 + bright2 + bright3;

  result.r *= brightness;
  result.g *= brightness;
  result.b *= brightness;

  // Subtle per-channel hue shifts (+/-3%)
  const hueR = 1 + (smoothNoise(worldX * 0.09 + 1100, worldZ * 0.09 + 1100) - 0.5) * 0.06;
  const hueG = 1 + (smoothNoise(worldX * 0.09 + 1200, worldZ * 0.09 + 1200) - 0.5) * 0.06;
  const hueB = 1 + (smoothNoise(worldX * 0.09 + 1300, worldZ * 0.09 + 1300) - 0.5) * 0.06;

  result.r = Math.min(1, Math.max(0, result.r * hueR));
  result.g = Math.min(1, Math.max(0, result.g * hueG));
  result.b = Math.min(1, Math.max(0, result.b * hueB));

  return result;
}

// --- Wall constants ---
const WALL_GEO = new THREE.BoxGeometry(0.9, 0.6, 0.9);
const WALL_MAT = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.7, metalness: 0.1 });

export class WorldRenderer {
  constructor(scene) {
    this.scene = scene;
    this.resourceMeshes = new Map(); // key: "x,y" -> mesh
    this.wallMeshes = new Map(); // key: "x,y" -> mesh
    this.gridGroup = new THREE.Group();
    // Local resource count map — default 3 for resource tiles
    this.resourceCounts = new Map();
    // Invisible plane for raycasting
    this.raycastPlane = null;
    scene.add(this.gridGroup);
  }

  buildGrid() {
    const half = GRID_SIZE / 2;

    // Ground plane beneath the grid (below terrain valleys)
    const groundGeo = new THREE.PlaneGeometry(90, 90);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x241530, roughness: 0.95, metalness: 0.0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3;
    ground.receiveShadow = true;
    this.gridGroup.add(ground);

    // Terrain mesh (vertex-colored zones + height)
    this.createTerrain();

    // Initialize resource counts
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const type = getTileType(x, y);
        const resource = ZONE_RESOURCE[type];
        if (resource) {
          this.resourceCounts.set(`${x},${y}`, { resource, count: 3 });
        }
      }
    }

    // Forest grass
    this.addForestGrass();

    // Forest mountains & lakes
    this.addForestMountains();
    this.addForestLakes();

    // Shrine desert decorations
    this.addShrineDecorations();

    // Arena battle decorations
    this.addArenaDecorations();

    // Spawn village decorations
    this.addSpawnDecorations();

    // Market bazaar decorations
    this.addMarketDecorations();

    // Zone border lines (disabled — blended terrain replaces hard edges)
    // this.addZoneBorders();

    // Zone labels
    this.addZoneLabels();

    // Initial resource rendering
    this.renderResources();
  }

  createTerrain() {
    const segs = 256;
    const geo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE, segs, segs);
    const posAttr = geo.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);

    for (let i = 0; i < posAttr.count; i++) {
      const localX = posAttr.getX(i);
      const localY = posAttr.getY(i);
      // After -PI/2 rotation: worldX = localX, worldZ = -localY
      const worldX = localX;
      const worldZ = -localY;
      const h = getTerrainHeight(worldX, worldZ);
      posAttr.setZ(i, h);

      // Blended zone color with noise-driven palettes
      const c = getBlendedZoneColor(worldX, worldZ);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    this.gridGroup.add(mesh);
    this.raycastPlane = mesh;
  }

  addForestGrass() {
    const half = GRID_SIZE / 2;

    // Count instances per material
    const matCounts = new Array(GRASS_MATS.length).fill(0);
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (getTileType(x, y) !== 'forest') continue;
        for (let i = 0; i < BLADES_PER_TILE; i++) {
          const h1 = tileHash(x * 7 + i, y * 13 + i);
          matCounts[Math.floor(h1 * GRASS_MATS.length)]++;
        }
      }
    }

    // Create one InstancedMesh per material (4 draw calls instead of ~6K)
    const instances = GRASS_MATS.map((mat, idx) =>
      new THREE.InstancedMesh(GRASS_GEO, mat, matCounts[idx])
    );
    const counters = new Array(GRASS_MATS.length).fill(0);
    const dummy = new THREE.Object3D();

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
          const bwx = x - half + 0.5 + ox;
          const bwz = y - half + 0.5 + oz;

          dummy.position.set(bwx, getTerrainHeight(bwx, bwz) + 0.075 * scale, bwz);
          dummy.scale.set(scale, scale, scale);
          dummy.rotation.set(0, h2 * Math.PI * 2, (h3 - 0.5) * 0.3);
          dummy.updateMatrix();

          const matIdx = Math.floor(h1 * GRASS_MATS.length);
          instances[matIdx].setMatrixAt(counters[matIdx]++, dummy.matrix);
        }
      }
    }

    for (const im of instances) {
      im.instanceMatrix.needsUpdate = true;
      this.gridGroup.add(im);
    }
  }

  addForestMountains() {
    const half = GRID_SIZE / 2;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (getTileType(x, y) !== 'forest') continue;
        if (tileHash(x * 131, y * 197) >= 0.003) continue;
        const h = tileHash(x * 37, y * 53);
        const scale = 0.8 + h * 0.5;
        const rotY = tileHash(x * 41, y * 67) * Math.PI * 2;
        const peakMat = MOUNTAIN_PEAK_MATS[Math.floor(h * MOUNTAIN_PEAK_MATS.length)];
        const mountain = createMountain(scale, peakMat, rotY);
        const mwx = x - half + 0.5, mwz = y - half + 0.5;
        mountain.position.set(mwx, getTerrainHeight(mwx, mwz), mwz);
        this.gridGroup.add(mountain);
      }
    }
  }

  addForestLakes() {
    const half = GRID_SIZE / 2;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (getTileType(x, y) !== 'forest') continue;
        if (tileHash(x * 163, y * 229) >= 0.002) continue;
        const h = tileHash(x * 47, y * 61);
        const scale = 0.8 + h * 0.4;
        const lake = new THREE.Mesh(LAKE_GEO, LAKE_MAT);
        lake.rotation.x = -Math.PI / 2;
        const lwx = x - half + 0.5, lwz = y - half + 0.5;
        lake.position.set(lwx, getTerrainHeight(lwx, lwz) + 0.02, lwz);
        lake.scale.setScalar(scale);
        this.gridGroup.add(lake);
      }
    }
  }

  addShrineDecorations() {
    const half = GRID_SIZE / 2;
    // Central temple positions (grid coords)
    const templeCenters = [{ x: 31, y: 6 }, { x: 6, y: 31 }, { x: 57, y: 31 }, { x: 31, y: 57 }];

    for (const tc of templeCenters) {
      const temple = createTemple(2.5);
      const twx = tc.x - half + 0.5, twz = tc.y - half + 0.5;
      temple.position.set(twx, getTerrainHeight(twx, twz), twz);
      temple.rotation.y = Math.PI / 6; // 30°
      this.gridGroup.add(temple);
    }

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (getTileType(x, y) !== 'shrine') continue;

        // Skip tiles near temple centers (±1)
        let nearTemple = false;
        for (const tc of templeCenters) {
          if (Math.abs(x - tc.x) <= 1 && Math.abs(y - tc.y) <= 1) {
            nearTemple = true;
            break;
          }
        }
        if (nearTemple) continue;

        const h = tileHash(x * 179, y * 241);
        const wx = x - half + 0.5;
        const wz = y - half + 0.5;

        if (h < 0.08) {
          // Sand dune — half-sphere, stretched horizontally
          const dh = tileHash(x * 61, y * 79);
          const dune = new THREE.Mesh(DUNE_GEO, DUNE_MAT);
          dune.position.set(wx, getTerrainHeight(wx, wz), wz);
          dune.scale.set(1.2 + dh * 0.6, 0.4 + dh * 0.3, 0.8 + dh * 0.4);
          dune.rotation.y = dh * Math.PI * 2;
          this.gridGroup.add(dune);
        } else if (h < 0.38) {
          // Cactus
          const ch = tileHash(x * 83, y * 97);
          const scale = 0.7 + ch * 0.6;
          const cactus = createCactus(scale);
          cactus.position.set(wx, getTerrainHeight(wx, wz), wz);
          cactus.rotation.y = ch * Math.PI * 2;
          this.gridGroup.add(cactus);
        }
        // else: bare sand (~62% of tiles)
      }
    }
  }

  addArenaDecorations() {
    const half = GRID_SIZE / 2;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (getTileType(x, y) !== 'arena') continue;
        const h = tileHash(x * 191, y * 257);
        const wx = x - half + 0.5;
        const wz = y - half + 0.5;

        if (h < 0.02) {
          // Pillar
          const ph = tileHash(x * 67, y * 89);
          const scale = 0.8 + ph * 0.4;
          const pillar = createPillar(scale);
          pillar.position.set(wx, getTerrainHeight(wx, wz), wz);
          pillar.rotation.y = ph * Math.PI * 2;
          this.gridGroup.add(pillar);
        } else if (h < 0.07) {
          // Torch
          const th = tileHash(x * 71, y * 101);
          const scale = 0.7 + th * 0.3;
          const torch = createTorch(scale);
          torch.position.set(wx, getTerrainHeight(wx, wz), wz);
          this.gridGroup.add(torch);
        } else if (h < 0.22) {
          // Rubble cluster
          const count = 2 + Math.floor(tileHash(x * 73, y * 107) * 3);
          for (let i = 0; i < count; i++) {
            const rh1 = tileHash(x * 79 + i, y * 113 + i);
            const rh2 = tileHash(x + i * 17, y + i * 23);
            const scale = 0.5 + rh1 * 0.5;
            const mat = RUBBLE_MATS[Math.floor(rh2 * RUBBLE_MATS.length)];
            const rock = new THREE.Mesh(RUBBLE_GEO, mat);
            const ox = (rh1 - 0.5) * 0.6;
            const oz = (rh2 - 0.5) * 0.6;
            const rwx = wx + ox, rwz = wz + oz;
            rock.position.set(rwx, getTerrainHeight(rwx, rwz) + 0.05 * scale, rwz);
            rock.scale.setScalar(scale);
            rock.rotation.set(rh1 * Math.PI, rh2 * Math.PI, 0);
            this.gridGroup.add(rock);
          }
        } else if (h < 0.25) {
          // Skull
          const sh = tileHash(x * 83, y * 119);
          const scale = 0.6 + sh * 0.4;
          const group = new THREE.Group();
          const skull = new THREE.Mesh(SKULL_GEO, SKULL_MAT);
          skull.position.y = 0.08 * scale;
          skull.scale.setScalar(scale);
          group.add(skull);
          const jaw = new THREE.Mesh(SKULL_JAW_GEO, SKULL_MAT);
          jaw.position.set(0, 0.02 * scale, 0.06 * scale);
          jaw.scale.setScalar(scale);
          group.add(jaw);
          group.position.set(wx, getTerrainHeight(wx, wz), wz);
          group.rotation.y = sh * Math.PI * 2;
          this.gridGroup.add(group);
        }
        // else: bare stone ground (~75%)
      }
    }
  }

  addSpawnDecorations() {
    const half = GRID_SIZE / 2;

    // Central fountain at spawn center (31.5, 31.5 in grid coords)
    const fountain = createFountain(1.5);
    const fwx = 31.5 - half + 0.5, fwz = 31.5 - half + 0.5;
    fountain.position.set(fwx, getTerrainHeight(fwx, fwz), fwz);
    this.gridGroup.add(fountain);

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (getTileType(x, y) !== 'spawn') continue;
        // Skip tiles near fountain center (±1)
        if (Math.abs(x - 31.5) <= 1 && Math.abs(y - 31.5) <= 1) continue;

        const h = tileHash(x * 199, y * 263);
        const wx = x - half + 0.5;
        const wz = y - half + 0.5;

        if (h < 0.06) {
          // Lamp post
          const lh = tileHash(x * 89, y * 127);
          const scale = 0.8 + lh * 0.3;
          const lamp = createLampPost(scale);
          lamp.position.set(wx, getTerrainHeight(wx, wz), wz);
          this.gridGroup.add(lamp);
        } else if (h < 0.10) {
          // Bench
          const bh = tileHash(x * 97, y * 131);
          const scale = 0.7 + bh * 0.3;
          const bench = createBench(scale);
          bench.position.set(wx, getTerrainHeight(wx, wz), wz);
          bench.rotation.y = bh * Math.PI * 2;
          this.gridGroup.add(bench);
        } else if (h < 0.20) {
          // Cobblestone marker
          const ch = tileHash(x * 103, y * 137);
          const cobble = new THREE.Mesh(COBBLE_GEO, COBBLE_MAT);
          cobble.rotation.x = -Math.PI / 2;
          cobble.position.set(wx, getTerrainHeight(wx, wz) + 0.02, wz);
          cobble.rotation.z = ch * Math.PI * 2;
          this.gridGroup.add(cobble);
        }
        // else: bare spawn ground (~80%)
      }
    }
  }

  addMarketDecorations() {
    const half = GRID_SIZE / 2;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (getTileType(x, y) !== 'market') continue;
        const h = tileHash(x * 211, y * 271);
        const wx = x - half + 0.5;
        const wz = y - half + 0.5;

        if (h < 0.05) {
          // Market stall
          const sh = tileHash(x * 109, y * 139);
          const scale = 0.8 + sh * 0.4;
          const canopyMat = STALL_CANOPY_MATS[Math.floor(sh * STALL_CANOPY_MATS.length)];
          const stall = createStall(scale, canopyMat);
          stall.position.set(wx, getTerrainHeight(wx, wz), wz);
          stall.rotation.y = sh * Math.PI * 2;
          this.gridGroup.add(stall);
        } else if (h < 0.17) {
          // Crate cluster
          const ch = tileHash(x * 113, y * 149);
          const count = 1 + Math.floor(ch * 3);
          for (let i = 0; i < count; i++) {
            const crh = tileHash(x * 59 + i, y * 67 + i);
            const scale = 0.6 + crh * 0.4;
            const crate = new THREE.Mesh(CRATE_GEO, CRATE_MAT);
            const ox = (crh - 0.5) * 0.3;
            const oz = (tileHash(x + i * 13, y + i * 19) - 0.5) * 0.3;
            const cwx = wx + ox, cwz = wz + oz;
            crate.position.set(cwx, getTerrainHeight(cwx, cwz) + 0.1 * scale, cwz);
            crate.scale.setScalar(scale);
            crate.rotation.y = crh * Math.PI;
            this.gridGroup.add(crate);
          }
        } else if (h < 0.25) {
          // Barrel
          const bh = tileHash(x * 121, y * 157);
          const scale = 0.7 + bh * 0.3;
          const barrel = new THREE.Mesh(BARREL_GEO, BARREL_MAT);
          const ox = (bh - 0.5) * 0.2;
          const bwx = wx + ox;
          barrel.position.set(bwx, getTerrainHeight(bwx, wz) + 0.11 * scale, wz);
          barrel.scale.setScalar(scale);
          this.gridGroup.add(barrel);
        } else if (h < 0.31) {
          // Carpet/rug
          const rh = tileHash(x * 127, y * 163);
          const mat = CARPET_MATS[Math.floor(rh * CARPET_MATS.length)];
          const carpet = new THREE.Mesh(CARPET_GEO, mat);
          carpet.rotation.x = -Math.PI / 2;
          carpet.position.set(wx, getTerrainHeight(wx, wz) + 0.02, wz);
          carpet.rotation.z = rh * Math.PI * 2;
          this.gridGroup.add(carpet);
        }
        // else: bare market ground (~69%)
      }
    }
  }

  addZoneBorders() {
    const zoneBorderColor = 0x556688;
    const mat = new THREE.LineBasicMaterial({ color: zoneBorderColor, transparent: true, opacity: 0.5 });
    const half = GRID_SIZE / 2;
    const step = 1; // sample every tile

    const boundaries = [13, 26, 38, 51];
    for (const b of boundaries) {
      // Vertical line (x = b)
      const vPoints = [];
      for (let t = 0; t <= GRID_SIZE; t += step) {
        const wx = b - half;
        const wz = t - half;
        vPoints.push(new THREE.Vector3(wx, getTerrainHeight(wx, wz) + 0.05, wz));
      }
      this.gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(vPoints), mat));

      // Horizontal line (y = b)
      const hPoints = [];
      for (let t = 0; t <= GRID_SIZE; t += step) {
        const wx = t - half;
        const wz = b - half;
        hPoints.push(new THREE.Vector3(wx, getTerrainHeight(wx, wz) + 0.05, wz));
      }
      this.gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(hPoints), mat));
    }
  }

  addZoneLabels() {
    const labels = [
      // Row 0
      { text: 'FOREST', x: 6,    y: 6,    color: '#55aa55' },
      { text: 'FOREST', x: 19,   y: 6,    color: '#55aa55' },
      { text: 'SHRINE', x: 31.5, y: 6,    color: '#ccaa44' },
      { text: 'FOREST', x: 44,   y: 6,    color: '#55aa55' },
      { text: 'FOREST', x: 57,   y: 6,    color: '#55aa55' },
      // Row 1
      { text: 'FOREST', x: 6,    y: 19,   color: '#55aa55' },
      { text: 'ARENA',  x: 19,   y: 19,   color: '#cc4444' },
      { text: 'MARKET', x: 31.5, y: 19,   color: '#ccaa44' },
      { text: 'ARENA',  x: 44,   y: 19,   color: '#cc4444' },
      { text: 'FOREST', x: 57,   y: 19,   color: '#55aa55' },
      // Row 2
      { text: 'SHRINE', x: 6,    y: 31.5, color: '#ccaa44' },
      { text: 'MARKET', x: 19,   y: 31.5, color: '#ccaa44' },
      { text: 'SPAWN',  x: 31.5, y: 31.5, color: '#8888cc' },
      { text: 'MARKET', x: 44,   y: 31.5, color: '#ccaa44' },
      { text: 'SHRINE', x: 57,   y: 31.5, color: '#ccaa44' },
      // Row 3
      { text: 'FOREST', x: 6,    y: 44,   color: '#55aa55' },
      { text: 'ARENA',  x: 19,   y: 44,   color: '#cc4444' },
      { text: 'MARKET', x: 31.5, y: 44,   color: '#ccaa44' },
      { text: 'ARENA',  x: 44,   y: 44,   color: '#cc4444' },
      { text: 'FOREST', x: 57,   y: 44,   color: '#55aa55' },
      // Row 4
      { text: 'FOREST', x: 6,    y: 57,   color: '#55aa55' },
      { text: 'FOREST', x: 19,   y: 57,   color: '#55aa55' },
      { text: 'SHRINE', x: 31.5, y: 57,   color: '#ccaa44' },
      { text: 'FOREST', x: 44,   y: 57,   color: '#55aa55' },
      { text: 'FOREST', x: 57,   y: 57,   color: '#55aa55' },
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
      const lwx = label.x - GRID_SIZE / 2 + 0.5;
      const lwz = label.y - GRID_SIZE / 2 + 0.5;
      sprite.position.set(lwx, getTerrainHeight(lwx, lwz) + 2.5, lwz);
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
    this.renderWalls(activeTiles);
  }

  renderWalls(activeTiles) {
    // Clear existing wall meshes
    for (const [, mesh] of this.wallMeshes) {
      this.gridGroup.remove(mesh);
    }
    this.wallMeshes.clear();

    const half = GRID_SIZE / 2;
    for (const tile of activeTiles) {
      if (!tile.wall) continue;
      const key = `${tile.x},${tile.y}`;
      const wx = tile.x - half + 0.5;
      const wz = tile.y - half + 0.5;
      const wall = new THREE.Mesh(WALL_GEO, WALL_MAT);
      wall.position.set(wx, getTerrainHeight(wx, wz) + 0.3, wz);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.gridGroup.add(wall);
      this.wallMeshes.set(key, wall);
    }
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

      // Skip gold octahedrons in shrine zones (temples/dunes provide the visual)
      if (data.resource === 'gold' && getTileType(x, y) === 'shrine') continue;

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
        group.position.set(baseX, getTerrainHeight(baseX, baseZ), baseZ);
        this.gridGroup.add(group);
        this.resourceMeshes.set(key, group);
      } else {
        // Stone / gold
        const color = RESOURCE_COLORS[data.resource] || 0xffffff;
        const geo = geos[data.resource] || geos.stone;
        const isGold = data.resource === 'gold';
        const material = new THREE.MeshStandardMaterial({
          color,
          roughness: isGold ? 0.3 : 0.7,
          metalness: isGold ? 0.6 : 0.1,
          emissive: isGold ? 0x664400 : 0x000000,
          emissiveIntensity: isGold ? 0.4 : 0,
        });
        const mesh = new THREE.Mesh(geo, material);
        const baseY = data.resource === 'gold' ? 0.15 : 0.1;
        mesh.position.set(baseX, getTerrainHeight(baseX, baseZ) + baseY + 0.04 * count, baseZ);
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
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return null;
    return { userData: { tileX: x, tileY: y, type: getTileType(x, y) } };
  }
}
