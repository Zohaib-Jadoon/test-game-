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

export type SurfaceKind = 'snow' | 'stone' | 'wood' | 'water';

export function getSurfaceKindAt(x: number, z: number): SurfaceKind {
  const y = getTerrainHeight(x, z);
  if (y <= FROZEN_LAKE_Y + 0.16 && Math.hypot(x - 96, z + 58) < 34) {
    return 'water';
  }
  // Timber bridge deck on Ashen Span Bridge
  if (Math.hypot(x + 72, z - 92) < 6.5) {
    return 'wood';
  }
  // Stone architecture & village/keep flagstones
  if (
    Math.hypot(x + 145, z - 145) < 10 || // Oathgrave Tomb floor
    Math.hypot(x + 10, z - 36) < 20 || // Ravenhold cobbles
    Math.hypot(x - 6, z + 146) < 26 || // Warden Keep courtyard
    Math.hypot(x - 6, z + 112) < 9 ||
    getTerrainSlopeDeg(x, z) > 25
  ) {
    return 'stone';
  }
  return 'snow';
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

export function createFrostheimTerrainMesh(segments = 180): {
  terrain: THREE.Mesh;
  frozenLake: THREE.Mesh;
  horizons: THREE.Mesh;
  updateWater: (elapsedSec: number) => void;
} {
  const geo = new THREE.PlaneGeometry(FROSTHEIM_WORLD_SIZE, FROSTHEIM_WORLD_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const snowCol = new THREE.Color('#B5C2CD');
  const slateCol = new THREE.Color('#424A53');
  const roadCol = new THREE.Color('#5A5349');
  const cobbleCol = new THREE.Color('#535962');
  const iceCol = new THREE.Color('#7CA0B5');
  const mossCol = new THREE.Color('#3C4A40');
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = getTerrainHeight(x, z);
    pos.setY(i, y);

    const slope = getTerrainSlopeDeg(x, z);
    const road = getRoadMask(x, z);
    const isIce = y <= FROZEN_LAKE_Y + 0.08;
    const villageDist = Math.hypot(x + 10, z - 36);
    const keepDist = Math.hypot(x - 6, z + 146);

    if (isIce) {
      tmp.copy(iceCol);
    } else {
      const rockBlend = smoothstep(18, 35, slope);
      const forestPatch = smoothstep(0.12, 0.72, Math.sin(x * 0.04) * Math.cos(z * 0.04));
      tmp.copy(snowCol).lerp(mossCol, forestPatch * 0.14).lerp(slateCol, rockBlend);
      if (road > 0.02) {
        tmp.lerp(roadCol, road * 0.78);
      }
      if (villageDist < 22 || keepDist < 25) {
        const w = Math.max(1 - smoothstep(14, 22, villageDist), 1 - smoothstep(18, 25, keepDist));
        tmp.lerp(cobbleCol, w * 0.85);
      }
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

  // Load real PolyHaven CC0 1K snow PBR maps (diffuse, GL normal, roughness) tiled seamlessly over Frostheim
  const texLoader = typeof THREE.TextureLoader !== 'undefined' && typeof document !== 'undefined' ? new THREE.TextureLoader() : null;
  let snowDiff: THREE.Texture | null = null;
  let snowNor: THREE.Texture | null = null;
  let snowRough: THREE.Texture | null = null;
  let iceNor: THREE.Texture | null = null;
  if (texLoader) {
    const prep = (url: string, rep: number, srgb: boolean) => {
      const t = texLoader.load(url);
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    snowDiff = prep('/assets/eidrath/textures/snow_field_aerial/diff.jpg', 54, true);
    snowNor = prep('/assets/eidrath/textures/snow_01/nor_gl.jpg', 64, false);
    snowRough = prep('/assets/eidrath/textures/snow_01/rough.jpg', 64, false);
    iceNor = prep('/assets/eidrath/textures/ice_003/nor_gl.jpg', 12, false);
  }

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: snowDiff ?? undefined,
    normalMap: snowNor ?? undefined,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: snowRough ?? undefined,
    roughness: 0.88,
    metalness: 0.04,
  });

  const terrain = new THREE.Mesh(geo, mat);
  terrain.name = 'TERRAIN_Frostheim';
  terrain.receiveShadow = true;

  // Normal-mapped animated Frozen Reach lake + glacial shimmer
  const lakeGeo = new THREE.CircleGeometry(32, 48);
  lakeGeo.rotateX(-Math.PI / 2);
  const lakeMat = new THREE.MeshStandardMaterial({
    color: '#6C92A8',
    normalMap: iceNor ?? undefined,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.14,
    metalness: 0.28,
    transparent: true,
    opacity: 0.92,
  });
  const frozenLake = new THREE.Mesh(lakeGeo, lakeMat);
  frozenLake.name = 'TERRAIN_FrozenReachLake';
  frozenLake.position.set(96, FROZEN_LAKE_Y + 0.03, -58);
  frozenLake.receiveShadow = true;

  // Jagged alpine Frostheim horizon silhouettes around playable bowl
  const rimGeo = new THREE.CylinderGeometry(285, 315, 76, 48, 4, true);
  const rPos = rimGeo.attributes.position;
  for (let i = 0; i < rPos.count; i++) {
    const x = rPos.getX(i);
    const y = rPos.getY(i);
    const z = rPos.getZ(i);
    if (y > 0) {
      const ang = Math.atan2(z, x);
      const ridge = Math.abs(Math.sin(ang * 7.0)) * 34 + Math.abs(Math.cos(ang * 13.0)) * 18;
      rPos.setY(i, 12 + ridge);
    } else {
      rPos.setY(i, -12);
    }
  }
  rimGeo.computeVertexNormals();
  const rimMat = new THREE.MeshStandardMaterial({
    color: '#34414e',
    roughness: 0.94,
    metalness: 0.02,
    side: THREE.BackSide,
  });
  const horizons = new THREE.Mesh(rimGeo, rimMat);
  horizons.name = 'TERRAIN_AlpineHorizon';

  const updateWater = (elapsedSec: number) => {
    if (iceNor) {
      iceNor.offset.set(elapsedSec * 0.012, Math.sin(elapsedSec * 0.15) * 0.015);
    }
  };

  return { terrain, frozenLake, horizons, updateWater };
}
