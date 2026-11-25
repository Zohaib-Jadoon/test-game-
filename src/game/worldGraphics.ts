import * as THREE from 'three';
import { ARENA_PILLARS, ARENA_RADIUS } from './rules';
import type { DarkFantasyTextureSet } from './darkFantasyTextures';

export interface UpgradedWorldHandles {
  clouds: THREE.Group;
  brazierFlames: THREE.Mesh[];
  brazierLights: THREE.PointLight[];
  emberPoints: THREE.Points;
  emberVelocities: Float32Array;
  sanctuarySigil: THREE.Mesh;
  pillarMeshSlots: THREE.Group[];
  spireMeshSlots: THREE.Group[];
  wordWallSlot: THREE.Group;
  pineSlots: THREE.Group[];
  disposables: Array<{ dispose: () => void }>;
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number): number {
  return (
    valueNoise(x, y) * 0.55 +
    valueNoise(x * 2.07 + 13.1, y * 2.07 + 7.4) * 0.28 +
    valueNoise(x * 4.13 + 31.7, y * 4.13 + 19.2) * 0.17
  );
}

/**
 * Generates a 512x512 Skyrim Nordic cobblestone & drifted alpine snow PBR set
 * with Sobel tangent-space normal mapping and ice/snow/granite roughness contrast.
 */
function createNordicFloorPbrSet(maxAnisotropy: number): {
  albedo: THREE.CanvasTexture;
  normal: THREE.DataTexture;
  roughness: THREE.CanvasTexture;
} {
  const size = 512;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const actx = albedoCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rctx = roughCanvas.getContext('2d')!;

  const height = new Float32Array(size * size);
  const albedoImg = actx.createImageData(size, size);
  const roughImg = rctx.createImageData(size, size);

  const tiles = 8;
  const tilePx = size / tiles;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const p4 = idx * 4;

      const row = Math.floor(y / tilePx);
      const stagger = (row % 2) * (tilePx * 0.5);
      const sx = (x + stagger) % size;
      const col = Math.floor(sx / tilePx);
      const lx = (sx % tilePx) / tilePx;
      const ly = (y % tilePx) / tilePx;

      const edgeDist = Math.min(lx, 1 - lx, ly, 1 - ly);
      const seamMask = edgeDist < 0.055 ? edgeDist / 0.055 : 1.0;
      const bevelMask = edgeDist < 0.12 ? (edgeDist - 0.055) / 0.065 : 1.0;

      const tileSeed = hash2(col * 3.1 + 1, row * 5.7 + 2);
      const grain = fbm((x / size) * 16, (y / size) * 16);
      const snowField = fbm((x / size) * 4.5 + 3.7, (y / size) * 4.5 + 6.2);
      const iceField = fbm((x / size) * 5.0 + 11.4, (y / size) * 5.0 + 2.9);

      // Snow settles in mortar crevices and wind-blown drifts across stones
      const seamSnow = seamMask < 0.72 ? (0.72 - seamMask) * 1.15 : 0;
      const driftSnow = snowField > 0.54 ? Math.min(1, (snowField - 0.54) * 3.8) : 0;
      const snowBlend = Math.min(1, Math.max(driftSnow, seamSnow * 0.8));
      const iceMask = snowBlend < 0.25 && iceField > 0.62 ? Math.min(1, (iceField - 0.62) * 4.2) : 0;

      const h =
        seamMask * 0.58 +
        Math.max(0, Math.min(1, bevelMask)) * 0.2 +
        grain * 0.16 +
        snowBlend * 0.12;
      height[idx] = h;

      // Weathered Nordic mountain granite mixed with crisp alpine snowdrifts
      const shade = 0.72 + tileSeed * 0.26 + (grain - 0.5) * 0.22;
      const seamDark = 0.42 + seamMask * 0.58;

      let r = 92 * shade * seamDark;
      let g = 99 * shade * seamDark;
      let b = 108 * shade * seamDark;

      if (iceMask > 0) {
        r = r * (1 - iceMask * 0.25) + 125 * iceMask * 0.25;
        g = g * (1 - iceMask * 0.25) + 158 * iceMask * 0.25;
        b = b * (1 - iceMask * 0.25) + 188 * iceMask * 0.25;
      }

      if (snowBlend > 0) {
        const sr = 216 + grain * 24;
        const sg = 226 + grain * 22;
        const sb = 238 + grain * 16;
        r = r * (1 - snowBlend) + sr * snowBlend;
        g = g * (1 - snowBlend) + sg * snowBlend;
        b = b * (1 - snowBlend) + sb * snowBlend;
      }

      albedoImg.data[p4] = Math.min(255, Math.max(0, Math.round(r)));
      albedoImg.data[p4 + 1] = Math.min(255, Math.max(0, Math.round(g)));
      albedoImg.data[p4 + 2] = Math.min(255, Math.max(0, Math.round(b)));
      albedoImg.data[p4 + 3] = 255;

      // Frozen glaze patches catch crisp specular sky light; granite & snow stay tactile matte
      const dryRough = 0.88 - grain * 0.14;
      const snowRough = 0.66 - grain * 0.08;
      let rough = dryRough * (1 - snowBlend) + snowRough * snowBlend;
      if (iceMask > 0) rough = rough * (1 - iceMask) + 0.18 * iceMask;
      const roughByte = Math.min(255, Math.max(36, Math.round(rough * 255)));
      roughImg.data[p4] = roughByte;
      roughImg.data[p4 + 1] = roughByte;
      roughImg.data[p4 + 2] = roughByte;
      roughImg.data[p4 + 3] = 255;
    }
  }

  actx.putImageData(albedoImg, 0, 0);
  rctx.putImageData(roughImg, 0, 0);

  const normalData = new Uint8Array(size * size * 4);
  const strength = 3.2;
  const sampleH = (x: number, y: number) =>
    height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tl = sampleH(x - 1, y - 1);
      const t = sampleH(x, y - 1);
      const tr = sampleH(x + 1, y - 1);
      const l = sampleH(x - 1, y);
      const r = sampleH(x + 1, y);
      const bl = sampleH(x - 1, y + 1);
      const b = sampleH(x, y + 1);
      const br = sampleH(x + 1, y + 1);

      const dX = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dY = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const dZ = 1.0;
      const invLen = 1 / Math.hypot(dX, dY, dZ);

      const p4 = (y * size + x) * 4;
      normalData[p4] = Math.round(((-dX * invLen) * 0.5 + 0.5) * 255);
      normalData[p4 + 1] = Math.round(((-dY * invLen) * 0.5 + 0.5) * 255);
      normalData[p4 + 2] = Math.round(((dZ * invLen) * 0.5 + 0.5) * 255);
      normalData[p4 + 3] = 255;
    }
  }

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.RepeatWrapping;
  albedo.repeat.set(7, 7);
  albedo.anisotropy = maxAnisotropy;

  const normal = new THREE.DataTexture(normalData, size, size, THREE.RGBAFormat);
  normal.wrapS = THREE.RepeatWrapping;
  normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(7, 7);
  normal.anisotropy = maxAnisotropy;
  normal.needsUpdate = true;

  const roughness = new THREE.CanvasTexture(roughCanvas);
  roughness.wrapS = THREE.RepeatWrapping;
  roughness.wrapT = THREE.RepeatWrapping;
  roughness.repeat.set(7, 7);
  roughness.anisotropy = maxAnisotropy;

  return { albedo, normal, roughness };
}

/**
 * Generates an atmospheric 1024x512 Skyrim Boreal Skybox:
 * - Deep Nordic steel-blue twilight zenith fading into frosty alpine mountain mist
 * - Rippling emerald-teal & ice-blue Aurora Borealis curtains across the Northern sky
 * - Twin Moons Masser (large weathered copper-gold moon) & Secunda (silver satellite moon)
 * - Crisp northern starfield
 */
function createSkyrimSkyTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, '#07111f');
  grad.addColorStop(0.24, '#10243b');
  grad.addColorStop(0.42, '#213e5b');
  grad.addColorStop(0.55, '#4b6c88');
  grad.addColorStop(0.64, '#87a3b8');
  grad.addColorStop(0.72, '#a9bccb');
  grad.addColorStop(0.84, '#465c72');
  grad.addColorStop(1.0, '#182432');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Crisp northern starfield
  for (let i = 0; i < 460; i++) {
    const sx = hash2(i * 1.7, 3.3) * w;
    const sy = hash2(i * 2.9, 7.1) * (h * 0.48);
    const alpha = 0.25 + hash2(i, 11.4) * 0.75;
    const r = hash2(i, 17.2) > 0.9 ? 1.7 : 0.9;
    ctx.fillStyle = i % 6 === 0 ? `rgba(215, 244, 255, ${alpha})` : `rgba(235, 242, 255, ${alpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Shimmering Skyrim Aurora Borealis ribbons sweeping across the northern sky (-Z vista = u ~0.75)
  for (let band = 0; band < 3; band++) {
    const baseY = 92 + band * 34;
    for (let x = 0; x < w; x += 6) {
      const wave = Math.sin(x * 0.011 + band * 1.6) * 26 + Math.cos(x * 0.023 - band) * 12;
      const intensity = Math.max(0, Math.sin((x / w) * Math.PI * 2 - 1.1) * 0.65 + 0.35);
      const colH = (62 + Math.sin(x * 0.03 + band) * 24) * intensity;
      if (colH < 8) continue;
      const aGrad = ctx.createLinearGradient(x, baseY + wave - colH, x, baseY + wave + 24);
      aGrad.addColorStop(0, 'rgba(64, 224, 208, 0)');
      aGrad.addColorStop(
        0.45,
        band === 2
          ? `rgba(118, 178, 255, ${0.18 * intensity})`
          : `rgba(56, 238, 184, ${0.22 * intensity})`,
      );
      aGrad.addColorStop(0.75, `rgba(92, 245, 210, ${0.14 * intensity})`);
      aGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = aGrad;
      ctx.fillRect(x, baseY + wave - colH, 8, colH + 24);
    }
  }

  // Twin Moons of Nirn: Masser (large weathered copper-gold moon) + Secunda (silver companion)
  const masserX = w * 0.72;
  const masserY = h * 0.31;
  const mHalo = ctx.createRadialGradient(masserX, masserY, 22, masserX, masserY, 130);
  mHalo.addColorStop(0.0, 'rgba(246, 205, 152, 0.55)');
  mHalo.addColorStop(0.4, 'rgba(180, 146, 122, 0.20)');
  mHalo.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = mHalo;
  ctx.beginPath();
  ctx.arc(masserX, masserY, 130, 0, Math.PI * 2);
  ctx.fill();

  const mCore = ctx.createRadialGradient(masserX - 10, masserY - 10, 6, masserX, masserY, 44);
  mCore.addColorStop(0.0, '#f3d7b3');
  mCore.addColorStop(0.58, '#c98f68');
  mCore.addColorStop(1.0, '#6a4136');
  ctx.fillStyle = mCore;
  ctx.beginPath();
  ctx.arc(masserX, masserY, 42, 0, Math.PI * 2);
  ctx.fill();

  // Subtle lunar maria craters on Masser
  ctx.fillStyle = 'rgba(72, 42, 36, 0.24)';
  for (const [dx, dy, cr] of [
    [-12, -8, 11],
    [10, 8, 14],
    [-4, 16, 8],
    [14, -12, 7],
  ]) {
    ctx.beginPath();
    ctx.arc(masserX + dx, masserY + dy, cr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Secunda (smaller pale silver-blue companion moon)
  const secX = w * 0.785;
  const secY = h * 0.24;
  const sCore = ctx.createRadialGradient(secX - 4, secY - 4, 2, secX, secY, 18);
  sCore.addColorStop(0.0, '#f1f5f9');
  sCore.addColorStop(0.7, '#b4c5d6');
  sCore.addColorStop(1.0, '#6b7e94');
  ctx.fillStyle = sCore;
  ctx.beginPath();
  ctx.arc(secX, secY, 17, 0, Math.PI * 2);
  ctx.fill();

  // Soft alpine mist cloud wisps near horizon
  for (let i = 0; i < 40; i++) {
    const cx = hash2(i, 21.1) * w;
    const cy = h * 0.49 + hash2(i, 29.7) * (h * 0.16);
    const rw = 85 + hash2(i, 37.3) * 190;
    const rh = 10 + hash2(i, 41.9) * 24;
    const cGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, rw);
    cGrad.addColorStop(0, 'rgba(186, 206, 224, 0.32)');
    cGrad.addColorStop(0.7, 'rgba(116, 142, 168, 0.14)');
    cGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, rh / rw);
    ctx.fillStyle = cGrad;
    ctx.beginPath();
    ctx.arc(0, 0, rw, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSnowflakeSprite(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
  grad.addColorStop(0.45, 'rgba(220, 238, 255, 0.72)');
  grad.addColorStop(1, 'rgba(200, 224, 248, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createNordicCompassMosaicTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(196, 176, 134, 0.55)';
  ctx.lineWidth = 4;
  for (const r of [232, 212, 152, 86]) {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Carved Nordic 8-point compass & barrow knotwork lines
  ctx.strokeStyle = 'rgba(148, 198, 228, 0.42)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const a1 = (i / 8) * Math.PI * 2;
    const a2 = ((i + 3) / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a1) * 212, c + Math.sin(a1) * 212);
    ctx.lineTo(c + Math.cos(a2) * 212, c + Math.sin(a2) * 212);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(226, 212, 180, 0.48)';
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * 162, c + Math.sin(a) * 162);
    ctx.lineTo(c + Math.cos(a) * 204, c + Math.sin(a) * 204);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds the Skyrim-inspired Nordic Mountain Sanctuary Arena (Throat of the World / Bleak Falls Barrow):
 * - Snow-dusted weathered Nordic cobblestone plateau with tangent-space normals
 * - 360-degree Boreal Twilight skybox with Aurora Borealis & Twin Moons (Masser & Secunda)
 * - Towering 360-degree snow-capped Skyrim mountain range panorama
 * - Curved Nordic Dragon Shout Word Wall at North focal vista
 * - Snow-laden Nordic Alpine Pine forest framing the rocky sanctuary ledges
 * - Carved Nordic Brazier Cairns with warm amber hearthfire + Nordic Watchtower ruins
 * - 280 gently drifting alpine snowflakes
 */
export function buildUpgradedCitadelWorld(
  scene: THREE.Scene,
  maxAnisotropy: number,
  isSoftwareGl: boolean,
  textures?: DarkFantasyTextureSet,
): UpgradedWorldHandles {
  const disposables: Array<{ dispose: () => void }> = [];
  const { albedo, normal, roughness } = createNordicFloorPbrSet(maxAnisotropy);
  disposables.push(albedo, normal, roughness);

  // 0. 360-degree Boreal Aurora & Twin-Moons Sky Dome
  const skyTex = createSkyrimSkyTexture();
  const skyGeo = new THREE.SphereGeometry(185, 36, 24);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);
  disposables.push(skyTex, skyGeo, skyMat);

  // 1. Snow-Dusted Nordic Barrow Flagstone Mountain Sanctuary Plateau (y = 0)
  const deckGeo = new THREE.CylinderGeometry(ARENA_RADIUS + 0.85, ARENA_RADIUS + 0.35, 1.8, 56);
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: albedo,
    normalMap: normal,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughnessMap: roughness,
    roughness: 0.96,
    metalness: 0.08,
    envMapIntensity: 1.05,
  });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = -0.9;
  deck.receiveShadow = true;
  scene.add(deck);
  disposables.push(deckGeo, deckMat);

  // Subtle carved Nordic compass floor inlay at sanctuary center
  const sigilTex = createNordicCompassMosaicTexture();
  const sigilGeo = new THREE.PlaneGeometry(11.4, 11.4);
  const sigilMat = new THREE.MeshBasicMaterial({
    map: sigilTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const sanctuarySigil = new THREE.Mesh(sigilGeo, sigilMat);
  sanctuarySigil.rotation.x = -Math.PI / 2;
  sanctuarySigil.position.y = 0.018;
  scene.add(sanctuarySigil);
  disposables.push(sigilTex, sigilGeo, sigilMat);

  // Broad snowy alpine mountain shelf extending below the sanctuary out to the mountain ring
  const shelfGeo = new THREE.CylinderGeometry(ARENA_RADIUS + 16, ARENA_RADIUS + 58, 18, 28);
  const shelfMat = new THREE.MeshStandardMaterial({
    color: 0x424d59,
    roughness: 0.92,
    metalness: 0.05,
  });
  const shelf = new THREE.Mesh(shelfGeo, shelfMat);
  shelf.position.y = -10.4;
  scene.add(shelf);
  disposables.push(shelfGeo, shelfMat);

  // 2. Ancient Tarnished Bronze Sanctuary Floor Rings + Carved Stone Curb (no neon pink!)
  const bronzeFiligreeMat = new THREE.MeshStandardMaterial({
    color: 0xa68b5b,
    map: textures?.metalMap ?? null,
    bumpMap: textures?.metalBump ?? null,
    bumpScale: 0.03,
    roughness: 0.42,
    metalness: 0.78,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const darkIronMat = new THREE.MeshStandardMaterial({
    color: 0x3b4048,
    map: textures?.metalMap ?? null,
    bumpMap: textures?.metalBump ?? null,
    bumpScale: 0.04,
    roughness: 0.48,
    metalness: 0.76,
  });
  const nordicStoneMat = new THREE.MeshStandardMaterial({
    color: 0x5c646e,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.86,
    metalness: 0.06,
  });
  const snowCapMat = new THREE.MeshStandardMaterial({
    color: 0xdde7f0,
    roughness: 0.65,
    metalness: 0.02,
  });
  const hearthFlameMat = new THREE.MeshStandardMaterial({
    color: 0xffd08a,
    emissive: 0xff7b24,
    emissiveIntensity: 3.4,
    roughness: 0.2,
  });
  const beaconFlameMat = new THREE.MeshStandardMaterial({
    color: 0xffe4a8,
    emissive: 0xff9e38,
    emissiveIntensity: 3.0,
    roughness: 0.2,
  });
  disposables.push(bronzeFiligreeMat, darkIronMat, nordicStoneMat, snowCapMat, hearthFlameMat, beaconFlameMat);

  for (const r of [5.8, 12.6, ARENA_RADIUS - 0.14]) {
    const ringGeo = new THREE.RingGeometry(r - 0.24, r, 64);
    const ring = new THREE.Mesh(ringGeo, bronzeFiligreeMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.022;
    ring.receiveShadow = true;
    scene.add(ring);
    disposables.push(ringGeo);
  }

  // Low weathered Nordic stone retaining wall curb around sanctuary edge
  const curbGeo = new THREE.TorusGeometry(ARENA_RADIUS + 0.18, 0.22, 8, 64);
  const curb = new THREE.Mesh(curbGeo, nordicStoneMat);
  curb.rotation.x = Math.PI / 2;
  curb.position.y = 0.08;
  curb.receiveShadow = true;
  scene.add(curb);
  disposables.push(curbGeo);

  // 3. Nordic Cover Brazier Cairns (swapped to Blender SM_Env_GothicBrazierPillar_01 Nordic cairns!)
  const brazierFlames: THREE.Mesh[] = [];
  const brazierLights: THREE.PointLight[] = [];
  const pillarMeshSlots: THREE.Group[] = [];
  const spireMeshSlots: THREE.Group[] = [];
  const pineSlots: THREE.Group[] = [];

  const plinthGeo = new THREE.CylinderGeometry(1.48, 1.64, 0.68, 8);
  const shaftGeo = new THREE.CylinderGeometry(1.06, 1.22, 3.6, 8);
  const capGeo = new THREE.CylinderGeometry(1.46, 1.16, 0.52, 8);
  const flameGeo = new THREE.OctahedronGeometry(0.46, 1);
  disposables.push(plinthGeo, shaftGeo, capGeo, flameGeo);

  for (const p of ARENA_PILLARS) {
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);

    const stoneSlot = new THREE.Group();
    const plinth = new THREE.Mesh(plinthGeo, nordicStoneMat);
    plinth.position.y = 0.34;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    const shaft = new THREE.Mesh(shaftGeo, nordicStoneMat);
    shaft.position.y = 2.4;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    const cap = new THREE.Mesh(capGeo, bronzeFiligreeMat);
    cap.position.y = 4.32;
    stoneSlot.add(plinth, shaft, cap);
    pillarMeshSlots.push(stoneSlot);

    const flame = new THREE.Mesh(flameGeo, hearthFlameMat);
    flame.position.y = 5.32;
    flame.scale.set(0.85, 1.35, 0.85);
    brazierFlames.push(flame);

    group.add(stoneSlot, flame);

    if (!isSoftwareGl) {
      const pLight = new THREE.PointLight(0xff963a, 20, 20, 1.7);
      pLight.position.set(0, 5.65, 0);
      group.add(pLight);
      brazierLights.push(pLight);
    }

    scene.add(group);
  }

  // 4. Four Nordic Barrow Watchtower Ruins (swapped to Blender SM_Env_CathedralSpire_01!)
  const towerBaseGeo = new THREE.BoxGeometry(3.2, 12.0, 3.2);
  const beaconCrystalGeo = new THREE.OctahedronGeometry(0.82, 0);
  disposables.push(towerBaseGeo, beaconCrystalGeo);

  const spireAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
  for (const ang of spireAngles) {
    const tower = new THREE.Group();
    const dist = ARENA_RADIUS + 2.2;
    const sx = Math.cos(ang) * dist;
    const sz = Math.sin(ang) * dist;
    tower.position.set(sx, -0.35, sz);
    tower.rotation.y = -ang + Math.PI / 4;

    const towerSlot = new THREE.Group();
    const fallbackTower = new THREE.Mesh(towerBaseGeo, nordicStoneMat);
    fallbackTower.position.y = 6.0;
    fallbackTower.castShadow = true;
    towerSlot.add(fallbackTower);
    spireMeshSlots.push(towerSlot);

    // Warm Nordic watchtower beacon fire suspended inside the open timber belfry (y = 14.0)
    const beacon = new THREE.Mesh(beaconCrystalGeo, beaconFlameMat);
    beacon.position.y = 14.0;
    brazierFlames.push(beacon);

    tower.add(towerSlot, beacon);
    scene.add(tower);
  }

  // 5. Iconic Skyrim Curved Dragon Shout Word Wall on Northern Sanctuary Rim (z = -18.8, facing South!)
  const wordWallSlot = new THREE.Group();
  wordWallSlot.position.set(0, -0.05, -(ARENA_RADIUS + 1.1));
  // Blender Word Wall front faces -Y -> Three.js +Z (directly facing the player at South!)
  scene.add(wordWallSlot);

  if (!isSoftwareGl) {
    const wordLight = new THREE.PointLight(0x67e8f9, 14, 15, 1.6);
    wordLight.position.set(0, 3.1, -(ARENA_RADIUS - 0.8));
    scene.add(wordLight);
    brazierLights.push(wordLight);
  }

  // 6. Snow-Laden Nordic Alpine Pine Forest framing the sanctuary ledges (14 Blender pine slots!)
  const pinePlacements: Array<[number, number, number, number, number]> = [
    // [x, y, z, scale, rotY]
    [-9.5, -0.5, -18.5, 1.15, 0.4],
    [ 9.5, -0.5, -18.5, 1.22, 1.9],
    [-15.2, -0.8, -14.8, 1.32, 0.9],
    [ 15.2, -0.8, -14.8, 1.18, 2.7],
    [-21.2, -1.0,  -6.5, 1.28, 1.3],
    [ 21.2, -1.0,  -6.5, 1.35, 4.1],
    [-22.0, -1.1,   5.8, 1.24, 3.0],
    [ 22.0, -1.1,   5.8, 1.12, 5.2],
    [-16.4, -0.9,  15.6, 1.30, 0.5],
    [ 16.4, -0.9,  15.6, 1.26, 2.2],
    [ -6.8, -0.8,  20.6, 1.18, 3.8],
    [  7.2, -0.8,  20.4, 1.22, 1.1],
    [-26.5, -1.8, -18.0, 1.55, 2.4],
    [ 26.5, -1.8, -17.5, 1.60, 0.7],
  ];
  for (const [px, py, pz, ps, pr] of pinePlacements) {
    const slot = new THREE.Group();
    slot.position.set(px, py, pz);
    slot.scale.setScalar(ps);
    slot.rotation.y = pr;
    scene.add(slot);
    pineSlots.push(slot);
  }

  // 7. Snow-Dusted Nordic Perimeter Boulders (InstancedMesh)
  const rockCount = 44;
  const rockGeo = new THREE.DodecahedronGeometry(0.92, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.06,
  });
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < rockCount; i++) {
    const ang = (i / rockCount) * Math.PI * 2 + 0.08;
    // Leave clean clear view corridor directly in front of the Northern Word Wall
    const distFromNorth = Math.abs(Math.atan2(Math.sin(ang + Math.PI / 2), Math.cos(ang + Math.PI / 2)));
    const r = ARENA_RADIUS + (distFromNorth < 0.36 ? 2.4 : 0.78) + ((i * 19) % 10) * 0.06;
    const s = 0.76 + ((i * 7) % 10) * 0.075;
    dummy.position.set(Math.cos(ang) * r, s * 0.36 - 0.18, Math.sin(ang) * r);
    dummy.rotation.set(i * 0.4, ang, i * 0.3);
    dummy.scale.set(s * 1.15, s * 0.92, s * 0.95);
    dummy.updateMatrix();
    rockInst.setMatrixAt(i, dummy.matrix);
    // Cool Nordic granite & frosty snow-dusted boulders
    color.setHSL(0.58, 0.10, i % 3 === 0 ? 0.62 : 0.34 + ((i * 13) % 10) * 0.018);
    rockInst.setColorAt(i, color);
  }
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  scene.add(rockInst);
  disposables.push(rockGeo, rockMat);

  // 8. 360-Degree Towering Snow-Capped Skyrim Mountain Range Panorama (Throat of the World!)
  const peakBaseGeo = new THREE.ConeGeometry(20, 48, 7);
  const peakSnowGeo = new THREE.ConeGeometry(11.6, 26, 7);
  const mountainRockMat = new THREE.MeshStandardMaterial({
    color: 0x303b48,
    roughness: 0.94,
    metalness: 0.04,
    flatShading: true,
  });
  const mountainSnowMat = new THREE.MeshStandardMaterial({
    color: 0xcbdbe8,
    roughness: 0.74,
    metalness: 0.02,
    flatShading: true,
  });
  disposables.push(peakBaseGeo, peakSnowGeo, mountainRockMat, mountainSnowMat);

  const peakCount = 18;
  for (let i = 0; i < peakCount; i++) {
    const ang = (i / peakCount) * Math.PI * 2 + 0.12;
    const dist = 76 + ((i * 23) % 10) * 3.8;
    const heightScale = 0.85 + ((i * 17) % 10) * 0.14;
    const widthScale = 0.95 + ((i * 11) % 7) * 0.12;

    const peak = new THREE.Group();
    peak.position.set(Math.cos(ang) * dist, -12, Math.sin(ang) * dist);
    peak.rotation.y = i * 1.1;
    peak.scale.set(widthScale, heightScale, widthScale);

    const rockMesh = new THREE.Mesh(peakBaseGeo, mountainRockMat);
    rockMesh.position.y = 22;
    const snowMesh = new THREE.Mesh(peakSnowGeo, mountainSnowMat);
    snowMesh.position.y = 33.4;

    peak.add(rockMesh, snowMesh);
    scene.add(peak);
  }

  // Drifting high-altitude alpine valley mist clouds far below the peak
  const clouds = new THREE.Group();
  const cloudGeo = new THREE.IcosahedronGeometry(4.2, 1);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xc2d4e4,
    roughness: 0.96,
    metalness: 0.0,
    transparent: true,
    opacity: 0.28,
  });
  disposables.push(cloudGeo, cloudMat);

  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    const dist = 38 + (i % 4) * 12;
    const puff = new THREE.Mesh(cloudGeo, cloudMat);
    puff.position.set(Math.cos(ang) * dist, -8.5 + (i % 3) * 3.4, Math.sin(ang) * dist);
    puff.scale.set(2.8 + (i % 3) * 0.7, 0.65, 1.5);
    clouds.add(puff);
  }
  scene.add(clouds);

  // 9. 280 Gently Drifting Skyrim Alpine Snowflakes (falls downward with mountain breeze!)
  const snowCount = isSoftwareGl ? 80 : 280;
  const snowPos = new Float32Array(snowCount * 3);
  const snowColors = new Float32Array(snowCount * 3);
  const snowVelocities = new Float32Array(snowCount * 3);
  const tmpColor = new THREE.Color();

  for (let i = 0; i < snowCount; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * (ARENA_RADIUS + 4.5);
    snowPos[i * 3] = Math.cos(ang) * rad;
    snowPos[i * 3 + 1] = 0.2 + Math.random() * 14.5;
    snowPos[i * 3 + 2] = Math.sin(ang) * rad;

    // Gentle Nordic wind blowing diagonally across the snowy peak + steady snowfall
    snowVelocities[i * 3] = 0.65 + (Math.random() - 0.3) * 0.55;
    snowVelocities[i * 3 + 1] = -(0.85 + Math.random() * 0.95);
    snowVelocities[i * 3 + 2] = (Math.random() - 0.5) * 0.65;

    tmpColor.setHex(i % 4 === 0 ? 0xd8eeff : 0xf4f9ff);
    snowColors[i * 3] = tmpColor.r;
    snowColors[i * 3 + 1] = tmpColor.g;
    snowColors[i * 3 + 2] = tmpColor.b;
  }

  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  snowGeo.setAttribute('color', new THREE.BufferAttribute(snowColors, 3));
  const snowTex = createSnowflakeSprite();
  const snowMat = new THREE.PointsMaterial({
    size: 0.22,
    map: snowTex,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const emberPoints = new THREE.Points(snowGeo, snowMat);
  scene.add(emberPoints);
  disposables.push(snowGeo, snowTex, snowMat);

  return {
    clouds,
    brazierFlames,
    brazierLights,
    emberPoints,
    emberVelocities: snowVelocities,
    sanctuarySigil,
    pillarMeshSlots,
    spireMeshSlots,
    wordWallSlot,
    pineSlots,
    disposables,
  };
}
