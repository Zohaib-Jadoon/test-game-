import * as THREE from 'three';
import { FROSTHEIM_WORLD_SIZE } from '../../content/eidrathContent';

export const WORLD_HALF_EXTENT = FROSTHEIM_WORLD_SIZE / 2; // 250m
export const PLAYABLE_BOUND_RADIUS = 224;
export const CHUNK_SIZE = 100; // 5x5 chunks across 500m x 500m
export const FROZEN_LAKE_Y = -0.35;
export const MAX_WALKABLE_SLOPE_DEG = 44;

interface PlateauSpec {
  x: number;
  z: number;
  radius: number;
  blend: number;
  height: number;
}

const LANDMARK_PLATEAUS: PlateauSpec[] = [
  // Oathgrave Tomb (SW snow highland)
  { x: -145, z: 145, radius: 18, blend: 18, height: 6.5 },
  // Ashen Span Bridge approaches
  { x: -72, z: 92, radius: 14, blend: 16, height: 3.2 },
  // Ravenhold Sanctuary Village (sheltered basin)
  { x: -10, z: 36, radius: 34, blend: 22, height: 2.0 },
  // Old Oath-Smithy (western ridge)
  { x: -96, z: -12, radius: 16, blend: 16, height: 6.8 },
  // Whispering Pine Hunter Camp (eastern forest clearing)
  { x: 84, z: 18, radius: 18, blend: 18, height: 3.4 },
  // Frozen Reach Lake basin
  { x: 96, z: -58, radius: 28, blend: 22, height: -0.9 },
  // Frozen Reach Cavern terrace
  { x: 112, z: -78, radius: 16, blend: 15, height: 0.9 },
  // Silent Oath Shrine ridge
  { x: -124, z: -88, radius: 15, blend: 18, height: 9.2 },
  // Warden's Keep outer approach + seal gate
  { x: 6, z: -112, radius: 15, blend: 18, height: 11.4 },
  // Warden's Keep Boss Courtyard (elevated citadel visible from Ravenhold)
  { x: 6, z: -146, radius: 26, blend: 18, height: 13.8 },
];

const ROAD_SEGMENTS: Array<[number, number, number, number]> = [
  [-145, 145, -72, 92],
  [-72, 92, -10, 36],
  [-10, 36, -96, -12],
  [-10, 36, 84, 18],
  [84, 18, 112, -74],
  [-10, 36, 6, -54],
  [6, -54, 6, -116],
  [6, -116, 6, -146],
];

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function distToSegmentSq(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz;
  if (lenSq < 1e-6) {
    const dx = px - ax;
    const dz = pz - az;
    return dx * dx + dz * dz;
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (pz - az) * abz) / lenSq));
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz;
}

export function getRoadMask(x: number, z: number): number {
  let bestDistSq = Infinity;
  for (let i = 0; i < ROAD_SEGMENTS.length; i++) {
    const [ax, az, bx, bz] = ROAD_SEGMENTS[i];
    const d2 = distToSegmentSq(x, z, ax, az, bx, bz);
    if (d2 < bestDistSq) bestDistSq = d2;
  }
  const dist = Math.sqrt(bestDistSq);
  return 1 - smoothstep(2.8, 7.2, dist);
}

export function getTerrainHeight(x: number, z: number): number {
  // Base rolling Nordic foothills sloping upward toward the northern mountain citadel
  const northSlope = smoothstep(70, -165, z) * 10.5;
  const rolling =
    Math.sin(x * 0.022) * Math.cos(z * 0.021) * 3.8 +
    Math.sin(x * 0.055 + z * 0.042) * 1.4 +
    Math.cos(x * 0.11 - z * 0.09) * 0.45;

  let h = 1.6 + northSlope + rolling;

  // Natural perimeter mountain ring (replaces invisible arena walls)
  const radial = Math.hypot(x, z);
  if (radial > 186) {
    const rim = smoothstep(186, 245, radial);
    h += rim * rim * 38 + Math.sin(Math.atan2(z, x) * 11) * rim * 5.2;
  }

  // Ravine channel beneath Ashen Span Bridge (navigable on bridge deck at y=3.2)
  const bridgeDist = Math.hypot(x + 72, z - 92);
  if (bridgeDist < 24) {
    const alongBridge = Math.abs((x + 72) * 0.78 - (z - 92) * 0.62);
    if (alongBridge > 4.2) {
      h -= (1 - smoothstep(4.2, 16, bridgeDist)) * 2.2;
    }
  }

  // Blend handcrafted landmark plateaus cleanly into surrounding terrain
  for (let i = 0; i < LANDMARK_PLATEAUS.length; i++) {
    const p = LANDMARK_PLATEAUS[i];
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.radius + p.blend) {
      const weight = 1 - smoothstep(p.radius, p.radius + p.blend, d);
      h = h * (1 - weight) + p.height * weight;
    }
  }

  // Gently smooth roadbeds for clean traversal
  const road = getRoadMask(x, z);
  if (road > 0.05) {
    const smoothed = h - Math.cos(x * 0.11 - z * 0.09) * 0.45 * road;
    h = h * (1 - road * 0.5) + smoothed * (road * 0.5);
  }

  // Frozen Reach lake plane floor clamp
  if (h < FROZEN_LAKE_Y) {
    h = FROZEN_LAKE_Y;
  }

  return h;
}

export function getTerrainNormal(x: number, z: number): { x: number; y: number; z: number } {
  const e = 0.6;
  const hL = getTerrainHeight(x - e, z);
  const hR = getTerrainHeight(x + e, z);
  const hD = getTerrainHeight(x, z - e);
  const hU = getTerrainHeight(x, z + e);
  const nx = hL - hR;
  const ny = 2 * e;
  const nz = hD - hU;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}

export function getTerrainSlopeDeg(x: number, z: number): number {
  const n = getTerrainNormal(x, z);
  return (Math.acos(Math.max(-1, Math.min(1, n.y))) * 180) / Math.PI;
}

export function isInsidePlayableBounds(x: number, z: number): boolean {
  return Math.hypot(x, z) <= PLAYABLE_BOUND_RADIUS;
}

export function getChunkKey(x: number, z: number): string {
  const cx = Math.floor((x + WORLD_HALF_EXTENT) / CHUNK_SIZE);
  const cz = Math.floor((z + WORLD_HALF_EXTENT) / CHUNK_SIZE);
  return `${cx}_${cz}`;
}

export function getActiveChunkKeys(x: number, z: number, radiusChunks = 1): string[] {
  const cx = Math.floor((x + WORLD_HALF_EXTENT) / CHUNK_SIZE);
  const cz = Math.floor((z + WORLD_HALF_EXTENT) / CHUNK_SIZE);
  const keys: string[] = [];
  for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
    for (let dz = -radiusChunks; dz <= radiusChunks; dz++) {
      const gx = cx + dx;
      const gz = cz + dz;
      if (gx >= 0 && gx < 5 && gz >= 0 && gz < 5) {
        keys.push(`${gx}_${gz}`);
      }
    }
  }
  return keys;
}

export function createFrostheimTerrainMesh(segments = 140): {
  terrain: THREE.Mesh;
  frozenLake: THREE.Mesh;
} {
  const geo = new THREE.PlaneGeometry(FROSTHEIM_WORLD_SIZE, FROSTHEIM_WORLD_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const snowCol = new THREE.Color('#B8C3CC');
  const slateCol = new THREE.Color('#3B434B');
  const roadCol = new THREE.Color('#5A554E');
  const iceCol = new THREE.Color('#7EA4B8');
  const mossCol = new THREE.Color('#38463E');
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = getTerrainHeight(x, z);
    pos.setY(i, y);

    const slope = getTerrainSlopeDeg(x, z);
    const road = getRoadMask(x, z);
    const isIce = y <= FROZEN_LAKE_Y + 0.08;

    if (isIce) {
      tmp.copy(iceCol);
    } else {
      const rockBlend = smoothstep(20, 38, slope);
      const forestPatch = smoothstep(0.15, 0.75, Math.sin(x * 0.04) * Math.cos(z * 0.04));
      tmp.copy(snowCol).lerp(mossCol, forestPatch * 0.16).lerp(slateCol, rockBlend);
      if (road > 0.02) {
        tmp.lerp(roadCol, road * 0.72);
      }
      // Subtle elevation frost tint on peaks
      if (y > 14) {
        tmp.lerp(snowCol, smoothstep(14, 28, y) * 0.45);
      }
    }

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0.04,
  });

  const terrain = new THREE.Mesh(geo, mat);
  terrain.name = 'TERRAIN_Frostheim';
  terrain.receiveShadow = true;

  const lakeGeo = new THREE.CircleGeometry(30, 32);
  lakeGeo.rotateX(-Math.PI / 2);
  const lakeMat = new THREE.MeshStandardMaterial({
    color: '#7EA5BA',
    roughness: 0.18,
    metalness: 0.22,
    transparent: true,
    opacity: 0.9,
  });
  const frozenLake = new THREE.Mesh(lakeGeo, lakeMat);
  frozenLake.name = 'TERRAIN_FrozenReachLake';
  frozenLake.position.set(96, FROZEN_LAKE_Y + 0.03, -58);
  frozenLake.receiveShadow = true;

  return { terrain, frozenLake };
}
