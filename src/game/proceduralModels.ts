import * as THREE from 'three';
import { ARENA_PILLARS, ARENA_RADIUS, type EnemyKind } from './rules';
import type { DarkFantasyTextureSet } from './darkFantasyTextures';

export type BuiltinRigId = 'ranger' | 'vanguard' | 'sentinel' | 'ronin';

export interface RigDescriptor {
  id: BuiltinRigId;
  name: string;
  role: string;
  primaryHex: string;
  accentHex: string;
}

export const BUILTIN_RIGS: RigDescriptor[] = [
  {
    id: 'ranger',
    name: 'Banshee Ranger',
    role: 'Dark Elf Archer · Carved Shadowbow',
    primaryHex: '#6b1d3a',
    accentHex: '#c8b496',
  },
  {
    id: 'vanguard',
    name: 'Dread Vanguard',
    role: 'Gothic Sky-Knight · Runic Glaive',
    primaryHex: '#312e59',
    accentHex: '#c9a66b',
  },
  {
    id: 'sentinel',
    name: 'Crypt Sentinel',
    role: 'Iron Bastion · Filigree Tower Shield',
    primaryHex: '#1f4e52',
    accentHex: '#c9933c',
  },
  {
    id: 'ronin',
    name: 'Eclipse Ronin',
    role: 'Crimson Duelist · Bloodmoon Odachi',
    primaryHex: '#5b1b3a',
    accentHex: '#e2c086',
  },
];

export interface CharacterRigParts {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  leftLeg: THREE.Object3D;
  rightLeg: THREE.Object3D;
  weaponPivot: THREE.Object3D;
  visorMesh: THREE.Mesh;
  cloakMesh?: THREE.Object3D;
  materialsToFlash: THREE.MeshStandardMaterial[];
}

export function createStoneFloorTextures(maxAnisotropy: number): {
  albedo: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;

  // Weathered dark gothic slate-obsidian flagstones
  ctx.fillStyle = '#312f3d';
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#7a7a7a';
  bctx.fillRect(0, 0, size, size);

  const tiles = 8;
  const step = size / tiles;
  for (let row = 0; row < tiles; row++) {
    for (let col = 0; col < tiles; col++) {
      const shade = ((row * 11 + col * 17) % 21) - 10;
      const r = 64 + shade;
      const g = 60 + shade;
      const b = 76 + shade;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(col * step + 3, row * step + 3, step - 6, step - 6);

      // Pale moonlight bevel catch along top edge
      ctx.fillStyle = 'rgba(218, 200, 232, 0.10)';
      ctx.fillRect(col * step + 4, row * step + 4, step - 8, 5);

      // Subtle weathered rune corner accents on alternating tiles
      if ((row + col) % 3 === 0) {
        ctx.strokeStyle = 'rgba(180, 140, 195, 0.14)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(col * step + 10, row * step + 10, step - 20, step - 20);
      }

      bctx.fillStyle = `rgb(${155 + shade * 2},${155 + shade * 2},${155 + shade * 2})`;
      bctx.fillRect(col * step + 3, row * step + 3, step - 6, step - 6);
    }
  }

  // Deep chiseled mortar seams
  ctx.strokeStyle = 'rgba(14, 12, 22, 0.78)';
  ctx.lineWidth = 4;
  bctx.strokeStyle = '#202020';
  bctx.lineWidth = 4;
  for (let i = 0; i <= tiles; i++) {
    const p = i * step;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();

    bctx.beginPath();
    bctx.moveTo(p, 0);
    bctx.lineTo(p, size);
    bctx.stroke();
    bctx.beginPath();
    bctx.moveTo(0, p);
    bctx.lineTo(size, p);
    bctx.stroke();
  }

  // Stone fractures & mineral grain
  for (let i = 0; i < 1100; i++) {
    const x = (i * 97) % size;
    const y = (i * 53) % size;
    const bright = i % 2 === 0;
    ctx.fillStyle = bright ? 'rgba(225,210,240,0.07)' : 'rgba(12,10,18,0.12)';
    ctx.fillRect(x, y, 2, 2);
    bctx.fillStyle = bright ? '#b8b8b8' : '#555555';
    bctx.fillRect(x, y, 2, 2);
  }

  const albedo = new THREE.CanvasTexture(colorCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.RepeatWrapping;
  albedo.repeat.set(6, 6);
  albedo.anisotropy = maxAnisotropy;

  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.wrapS = THREE.RepeatWrapping;
  bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(6, 6);
  bump.anisotropy = maxAnisotropy;

  return { albedo, bump };
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 6, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(8, 6, 16, 0.72)');
  grad.addColorStop(0.55, 'rgba(8, 6, 16, 0.34)');
  grad.addColorStop(1, 'rgba(8, 6, 16, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function createContactShadowMesh(
  shadowTex: THREE.CanvasTexture,
  radius: number,
): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 22);
  const mat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.78,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.025;
  return mesh;
}

/**
 * Builds the signature sculpted Dark Ranger / Banshee Archer hero using all 6 user-uploaded
 * textures: filigree burgundy armor, tattered crimson cloak, carved recurve greatbow,
 * anisotropic silver hair, pale elven skin micro-grain, and battle-scratched forged iron.
 */
function buildDarkRangerHero(
  shadowTex: THREE.CanvasTexture,
  textures?: DarkFantasyTextureSet,
): CharacterRigParts {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);
  root.add(createContactShadowMesh(shadowTex, 0.96));

  // PBR Materials backed by the user's 6 texture maps
  const armorMat = new THREE.MeshStandardMaterial({
    color: textures ? 0xffffff : 0x5c233a,
    map: textures?.armorMap ?? null,
    bumpMap: textures?.metalBump ?? null,
    bumpScale: 0.02,
    roughness: 0.42,
    metalness: 0.48,
  });

  const cloakMat = new THREE.MeshStandardMaterial({
    color: textures ? 0xefe2e6 : 0x5c1728,
    map: textures?.cloakMap ?? null,
    roughness: 0.84,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });

  const hoodMat = new THREE.MeshStandardMaterial({
    color: 0x394462,
    map: textures?.cloakMap ?? null,
    roughness: 0.82,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });

  const metalTrimMat = new THREE.MeshStandardMaterial({
    color: 0xcbd0dc,
    map: textures?.metalMap ?? null,
    bumpMap: textures?.metalBump ?? null,
    bumpScale: 0.035,
    roughness: 0.28,
    metalness: 0.85,
  });

  const darkLeatherMat = new THREE.MeshStandardMaterial({
    color: 0x3b2824,
    bumpMap: textures?.skinBump ?? null,
    bumpScale: 0.025,
    roughness: 0.74,
    metalness: 0.12,
  });

  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xaab6cc, // Pale spectral elven skin matching Sylvanas reference
    bumpMap: textures?.skinBump ?? null,
    bumpScale: 0.012,
    roughness: 0.58,
    metalness: 0.05,
  });

  const hairMat = new THREE.MeshStandardMaterial({
    color: 0xd8dce8,
    map: textures?.hairMap ?? null,
    bumpMap: textures?.hairBump ?? null,
    bumpScale: 0.02,
    roughness: 0.48,
    metalness: 0.22,
  });

  const bowMat = new THREE.MeshStandardMaterial({
    color: textures ? 0xffffff : 0x7b7152,
    map: textures?.bowMap ?? null,
    bumpMap: textures?.metalBump ?? null,
    bumpScale: 0.03,
    roughness: 0.36,
    metalness: 0.52,
  });

  const spectralGlowMat = new THREE.MeshStandardMaterial({
    color: 0xff3b6b,
    emissive: 0xd91c5c,
    emissiveIntensity: 2.3,
    roughness: 0.15,
    metalness: 0.1,
  });

  const soulStringMat = new THREE.MeshStandardMaterial({
    color: 0xc084fc,
    emissive: 0xa855f7,
    emissiveIntensity: 2.1,
    roughness: 0.2,
  });

  // 1. Sculpted Articulated Legs + Armored Greaves & Warboots (bottom at y = 0)
  const thighGeo = new THREE.CylinderGeometry(0.115, 0.095, 0.44, 10);
  const kneeGeo = new THREE.OctahedronGeometry(0.095, 1);
  const greavePoints = [
    new THREE.Vector2(0.08, 0.0),
    new THREE.Vector2(0.105, 0.06),
    new THREE.Vector2(0.088, 0.22),
    new THREE.Vector2(0.115, 0.44),
    new THREE.Vector2(0.125, 0.48),
  ];
  const greaveGeo = new THREE.LatheGeometry(greavePoints, 12);
  const bootFootGeo = new THREE.CapsuleGeometry(0.085, 0.15, 4, 8);

  const buildLeg = (side: -1 | 1) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.16, 0.88, 0);

    const thigh = new THREE.Mesh(thighGeo, darkLeatherMat);
    thigh.position.y = -0.22;
    thigh.castShadow = true;

    const knee = new THREE.Mesh(kneeGeo, metalTrimMat);
    knee.position.set(0, -0.42, 0.07);
    knee.scale.set(0.9, 1.15, 0.7);
    knee.castShadow = true;

    const greave = new THREE.Mesh(greaveGeo, armorMat);
    greave.position.y = -0.84;
    greave.castShadow = true;

    const foot = new THREE.Mesh(bootFootGeo, metalTrimMat);
    foot.rotation.x = Math.PI / 2;
    foot.position.set(0, -0.80, 0.07);
    foot.castShadow = true;

    hip.add(thigh, knee, greave, foot);
    return hip;
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  bodyGroup.add(leftLeg, rightLeg);

  // 2. Sculpted Hourglass Armored Corset / Cuirass (LatheGeometry with filigree armorMap)
  const torsoProfile = [
    new THREE.Vector2(0.24, 0.0),   // hips
    new THREE.Vector2(0.26, 0.12),
    new THREE.Vector2(0.18, 0.28),  // tapered waist
    new THREE.Vector2(0.25, 0.48),  // ribcage / bust plate
    new THREE.Vector2(0.28, 0.62),  // upper chest
    new THREE.Vector2(0.20, 0.72),  // collar
    new THREE.Vector2(0.11, 0.78),  // neck base
  ];
  const torsoGeo = new THREE.LatheGeometry(torsoProfile, 16);
  const torso = new THREE.Mesh(torsoGeo, armorMat);
  torso.position.y = 0.88;
  torso.scale.set(1.06, 1.0, 0.84);
  torso.castShadow = true;
  bodyGroup.add(torso);

  // Ornate Silver Filigree Belt + Skull/Gem Buckle + Armored Tassets
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.045, 8, 18), darkLeatherMat);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 1.02;
  belt.scale.set(1.06, 0.88, 1);
  bodyGroup.add(belt);

  const buckle = new THREE.Mesh(new THREE.OctahedronGeometry(0.085, 0), metalTrimMat);
  buckle.position.set(0, 1.01, 0.21);
  buckle.scale.set(1.1, 1.1, 0.55);
  const buckleGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.042, 0), spectralGlowMat);
  buckleGem.position.set(0, 1.01, 0.25);
  bodyGroup.add(buckle, buckleGem);

  // Front & side armored leather tasset panels
  const tassetGeo = new THREE.BoxGeometry(0.22, 0.44, 0.04);
  const frontTasset = new THREE.Mesh(tassetGeo, cloakMat);
  frontTasset.position.set(0, 0.77, 0.19);
  frontTasset.rotation.x = -0.14;
  frontTasset.castShadow = true;
  const sideTassetL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.28), armorMat);
  sideTassetL.position.set(-0.26, 0.78, 0.0);
  sideTassetL.rotation.z = 0.16;
  const sideTassetR = sideTassetL.clone();
  sideTassetR.position.x = 0.26;
  sideTassetR.rotation.z = -0.16;
  bodyGroup.add(frontTasset, sideTassetL, sideTassetR);

  // 3. Flowing Tattered Crimson Ranger Cloak (sylvanas2_337ef2a8.png)
  const cloakGroup = new THREE.Group();
  cloakGroup.position.set(0, 1.58, -0.17);
  const cloakGeo = new THREE.CylinderGeometry(0.24, 0.56, 1.38, 12, 3, true, Math.PI * 0.65, Math.PI * 0.7);
  const cloakMesh = new THREE.Mesh(cloakGeo, cloakMat);
  cloakMesh.position.set(0, -0.68, -0.06);
  cloakMesh.rotation.x = 0.16;
  cloakMesh.castShadow = true;
  cloakGroup.add(cloakMesh);
  bodyGroup.add(cloakGroup);

  // 4. Sculpted Feathered & Spiked Dark-Iron Pauldrons
  const buildPauldron = (side: -1 | 1) => {
    const pGroup = new THREE.Group();
    pGroup.position.set(side * 0.36, 1.53, 0.0);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.21, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6),
      armorMat,
    );
    dome.rotation.z = -side * 0.55;
    dome.scale.set(1.15, 0.85, 1.1);
    dome.castShadow = true;

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.032, 6, 12), metalTrimMat);
    rim.rotation.x = Math.PI / 2;
    rim.rotation.y = side * 0.55;
    rim.position.y = -0.02;

    // Swept feather-blade crest
    const wingBlade = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.38, 5), metalTrimMat);
    wingBlade.position.set(side * 0.16, 0.14, -0.06);
    wingBlade.rotation.z = -side * 0.82;
    wingBlade.rotation.x = -0.22;
    wingBlade.castShadow = true;

    const featherPlume = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.32, 5), cloakMat);
    featherPlume.position.set(side * 0.12, 0.06, -0.15);
    featherPlume.rotation.z = -side * 0.95;
    featherPlume.rotation.x = -0.45;

    pGroup.add(dome, rim, wingBlade, featherPlume);
    return pGroup;
  };
  bodyGroup.add(buildPauldron(-1), buildPauldron(1));

  // 5. Sculpted Head, Pale Elven Face, Glowing Crimson Eyes, Pointed Ears, Flowing Hair & Deep Ranger Hood
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.76, 0.02);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.14, 10), skinMat);
  neck.position.y = -0.1;
  headGroup.add(neck);

  // Sculpted Face / Cranium
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 12), skinMat);
  face.scale.set(0.88, 1.05, 0.96);
  face.position.y = 0.04;
  face.castShadow = true;
  headGroup.add(face);

  // Glowing Crimson Ranger Eyes (visorMesh reference for compatibility)
  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 0.04), spectralGlowMat);
  visorMesh.position.set(0, 0.065, 0.145);
  // Subtle nose bridge darkener to split into twin glowing eyes
  const eyeBridge = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.045, 0.05), skinMat);
  eyeBridge.position.set(0, 0.065, 0.148);
  headGroup.add(visorMesh, eyeBridge);

  // Swept Pointed Elven Ears
  const earGeo = new THREE.ConeGeometry(0.032, 0.22, 5);
  const earL = new THREE.Mesh(earGeo, skinMat);
  earL.position.set(-0.17, 0.06, -0.02);
  earL.rotation.z = 1.25;
  earL.rotation.y = -0.35;
  const earR = new THREE.Mesh(earGeo, skinMat);
  earR.position.set(0.17, 0.06, -0.02);
  earR.rotation.z = -1.25;
  earR.rotation.y = 0.35;
  headGroup.add(earL, earR);

  // Flowing Anisotropic Silver-Ash Hair Locks framing the face & cascading over shoulders
  const buildHairLock = (side: -1 | 1) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.11, 0.16, 0.04),
      new THREE.Vector3(side * 0.16, 0.02, 0.10),
      new THREE.Vector3(side * 0.18, -0.16, 0.13),
      new THREE.Vector3(side * 0.15, -0.36, 0.10),
    ]);
    const geo = new THREE.TubeGeometry(curve, 10, 0.042, 7, false);
    const mesh = new THREE.Mesh(geo, hairMat);
    mesh.castShadow = true;
    return mesh;
  };
  headGroup.add(buildHairLock(-1), buildHairLock(1));

  // Deep Smoky-Indigo Ranger Hood / Cowl arching dramatically over the head
  const hoodArch = new THREE.Mesh(
    new THREE.SphereGeometry(0.225, 14, 12, -Math.PI * 0.18, Math.PI * 1.36, 0, Math.PI * 0.85),
    hoodMat,
  );
  hoodArch.position.set(0, 0.06, -0.02);
  hoodArch.rotation.y = Math.PI * 0.5;
  hoodArch.scale.set(1.06, 1.08, 1.15);
  hoodArch.castShadow = true;

  // Pointed Hood Tail sweeping back
  const hoodPoint = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.36, 8), hoodMat);
  hoodPoint.position.set(0, 0.14, -0.22);
  hoodPoint.rotation.x = -Math.PI * 0.42;
  hoodPoint.castShadow = true;

  // Metallic filigree circlet edge along the hood rim
  const hoodTrim = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.018, 6, 16, Math.PI * 1.25), metalTrimMat);
  hoodTrim.position.set(0, 0.06, 0.09);
  hoodTrim.rotation.z = -Math.PI * 0.125;

  headGroup.add(hoodArch, hoodPoint, hoodTrim);
  bodyGroup.add(headGroup);

  // 6. Back Leather Quiver + Spectral-Tipped Arrows
  const quiverGroup = new THREE.Group();
  quiverGroup.position.set(-0.14, 1.34, -0.24);
  quiverGroup.rotation.z = -0.38;
  quiverGroup.rotation.x = 0.14;
  const quiverBody = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.065, 0.62, 10), darkLeatherMat);
  quiverBody.castShadow = true;
  const quiverRim = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.018, 6, 12), metalTrimMat);
  quiverRim.rotation.x = Math.PI / 2;
  quiverRim.position.y = 0.3;
  quiverGroup.add(quiverBody, quiverRim);

  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.34, 5), metalTrimMat);
    shaft.position.set(Math.cos(ang) * 0.032, 0.38, Math.sin(ang) * 0.032);
    const fletch = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.09, 4), spectralGlowMat);
    fletch.position.set(Math.cos(ang) * 0.032, 0.54, Math.sin(ang) * 0.032);
    quiverGroup.add(shaft, fletch);
  }
  bodyGroup.add(quiverGroup);

  // 7. Armored Bracers & Arms
  const buildArm = (side: -1 | 1) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.34, 1.44, 0.04);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.055, 0.32, 8), skinMat);
    upper.position.y = -0.14;
    const bracer = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.056, 0.30, 8), armorMat);
    bracer.position.set(0, -0.34, 0.12);
    bracer.rotation.x = -0.78;
    bracer.castShadow = true;
    arm.add(upper, bracer);
    return arm;
  };
  bodyGroup.add(buildArm(-1), buildArm(1));

  // 8. Signature Carved Recurve Greatbow (sylvanas_bow_0a9e2254.png) in weaponPivot
  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(0.36, 1.24, 0.34);

  const bowCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.92, -0.22),
    new THREE.Vector3(0, 0.68, 0.18),
    new THREE.Vector3(0, 0.34, 0.28),
    new THREE.Vector3(0, 0.0, 0.14),
    new THREE.Vector3(0, -0.34, 0.28),
    new THREE.Vector3(0, -0.68, 0.18),
    new THREE.Vector3(0, -0.92, -0.22),
  ]);
  const bowLimbGeo = new THREE.TubeGeometry(bowCurve, 28, 0.052, 8, false);
  const bowLimbs = new THREE.Mesh(bowLimbGeo, bowMat);
  bowLimbs.castShadow = true;

  // Flared bone-and-steel wing blades on bow riser
  const riserGuard = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), metalTrimMat);
  riserGuard.scale.set(0.55, 1.8, 0.9);
  riserGuard.position.set(0, 0, 0.18);

  const tipGeo = new THREE.ConeGeometry(0.055, 0.26, 5);
  const topTip = new THREE.Mesh(tipGeo, metalTrimMat);
  topTip.position.set(0, 1.0, -0.26);
  topTip.rotation.x = -0.55;
  const botTip = new THREE.Mesh(tipGeo, metalTrimMat);
  botTip.position.set(0, -1.0, -0.26);
  botTip.rotation.x = Math.PI + 0.55;

  // Glowing spectral bowstring
  const bowString = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.82, 6), soulStringMat);
  bowString.position.set(0, 0, -0.20);

  // Nocked Shadow Arrow
  const arrowShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.95, 6), metalTrimMat);
  arrowShaft.rotation.x = Math.PI / 2;
  arrowShaft.position.set(0, 0, 0.24);
  const arrowHead = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.18, 4), spectralGlowMat);
  arrowHead.rotation.x = Math.PI / 2;
  arrowHead.position.set(0, 0, 0.74);

  weaponPivot.add(bowLimbs, riserGuard, topTip, botTip, bowString, arrowShaft, arrowHead);
  weaponPivot.rotation.z = -0.18;
  bodyGroup.add(weaponPivot);

  return {
    root,
    bodyGroup,
    leftLeg,
    rightLeg,
    weaponPivot,
    visorMesh,
    cloakMesh: cloakGroup,
    materialsToFlash: [armorMat, metalTrimMat, cloakMat],
  };
}

/**
 * Builds a composite multi-part hero character (bottom-center pivoted at y=0).
 * Default 'ranger' constructs the sculpted Dark Elf Archer using all 6 uploaded textures.
 */
export function buildHeroCharacterRig(
  rigId: BuiltinRigId | 'ember',
  shadowTex: THREE.CanvasTexture,
  textures?: DarkFantasyTextureSet,
): CharacterRigParts {
  if (rigId === 'ranger') {
    return buildDarkRangerHero(shadowTex, textures);
  }

  const palette =
    rigId === 'sentinel'
      ? { primary: 0x2a6668, secondary: 0x1d1b28, trim: 0xc9a054, glow: 0x34d399 }
      : rigId === 'ronin'
        ? { primary: 0x6b1e3d, secondary: 0x1b1524, trim: 0xd9b87a, glow: 0xf43f5e }
        : rigId === 'ember'
          ? { primary: 0x991b1b, secondary: 0x221519, trim: 0xd9a043, glow: 0xfb923c }
          : { primary: 0x3a3768, secondary: 0x1a1826, trim: 0xc8a96e, glow: 0xa855f7 };

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);
  root.add(createContactShadowMesh(shadowTex, 0.94));

  const armorMat = new THREE.MeshStandardMaterial({
    color: palette.primary,
    map: textures?.metalMap ?? null,
    bumpMap: textures?.metalBump ?? null,
    bumpScale: 0.03,
    roughness: 0.36,
    metalness: 0.56,
  });
  const underMat = new THREE.MeshStandardMaterial({
    color: palette.secondary,
    bumpMap: textures?.skinBump ?? null,
    bumpScale: 0.02,
    roughness: 0.78,
    metalness: 0.16,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: palette.trim,
    map: textures?.metalMap ?? null,
    bumpMap: textures?.metalBump ?? null,
    bumpScale: 0.025,
    roughness: 0.25,
    metalness: 0.86,
  });
  const cloakMat = new THREE.MeshStandardMaterial({
    color: rigId === 'ember' ? 0xc2410c : 0xd8b4c8,
    map: textures?.cloakMap ?? null,
    roughness: 0.82,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  const glowMat = new THREE.MeshStandardMaterial({
    color: palette.glow,
    emissive: palette.glow,
    emissiveIntensity: 1.9,
    roughness: 0.2,
    metalness: 0.1,
  });

  // 1. Articulated Sculpted Legs (bottom rests at y=0)
  const legGeo = new THREE.CylinderGeometry(0.13, 0.10, 0.64, 10);
  const bootGeo = new THREE.CapsuleGeometry(0.11, 0.16, 4, 8);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.20, 0.74, 0);
  const lShin = new THREE.Mesh(legGeo, underMat);
  lShin.position.y = -0.32;
  lShin.castShadow = true;
  const lBoot = new THREE.Mesh(bootGeo, trimMat);
  lBoot.rotation.x = Math.PI / 2;
  lBoot.position.set(0, -0.63, 0.05);
  lBoot.castShadow = true;
  leftLeg.add(lShin, lBoot);
  bodyGroup.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.20, 0.74, 0);
  const rShin = new THREE.Mesh(legGeo, underMat);
  rShin.position.y = -0.32;
  rShin.castShadow = true;
  const rBoot = new THREE.Mesh(bootGeo, trimMat);
  rBoot.rotation.x = Math.PI / 2;
  rBoot.position.set(0, -0.63, 0.05);
  rBoot.castShadow = true;
  rightLeg.add(rShin, rBoot);
  bodyGroup.add(rightLeg);

  // 2. Sculpted Gothic Cuirass & Belt
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.22, 10), trimMat);
  belt.position.y = 0.82;
  belt.castShadow = true;
  bodyGroup.add(belt);

  const torsoProfile = [
    new THREE.Vector2(0.27, 0.0),
    new THREE.Vector2(0.24, 0.16),
    new THREE.Vector2(0.36, 0.50),
    new THREE.Vector2(0.34, 0.68),
    new THREE.Vector2(0.18, 0.78),
  ];
  const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoProfile, 12), armorMat);
  torso.position.y = 0.86;
  torso.scale.set(1.08, 1.0, 0.82);
  torso.castShadow = true;
  bodyGroup.add(torso);

  // 3. Chest Runestone Emblem
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), glowMat);
  core.position.set(0, 1.32, 0.28);
  bodyGroup.add(core);

  // 4. Sculpted Cape
  const cloakGroup = new THREE.Group();
  cloakGroup.position.set(0, 1.54, -0.22);
  const cape = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.52, 1.24, 10, 2, true, Math.PI * 0.65, Math.PI * 0.7),
    cloakMat,
  );
  cape.position.set(0, -0.60, -0.05);
  cape.rotation.x = 0.14;
  cloakGroup.add(cape);
  bodyGroup.add(cloakGroup);

  // 5. Layered Gothic Pauldrons
  const pauldronGeo = new THREE.ConeGeometry(0.26, 0.44, 7);
  const leftPauldron = new THREE.Mesh(pauldronGeo, trimMat);
  leftPauldron.position.set(-0.50, 1.54, 0);
  leftPauldron.rotation.z = 0.78;
  leftPauldron.castShadow = true;

  const rightPauldron = new THREE.Mesh(pauldronGeo, trimMat);
  rightPauldron.position.set(0.50, 1.54, 0);
  rightPauldron.rotation.z = -0.78;
  rightPauldron.castShadow = true;
  bodyGroup.add(leftPauldron, rightPauldron);

  // 6. Gothic Greathelm & Crest
  const helmGroup = new THREE.Group();
  helmGroup.position.set(0, 1.84, 0);
  const helmBase = new THREE.Mesh(new THREE.OctahedronGeometry(0.26, 2), armorMat);
  helmBase.scale.set(0.92, 1.08, 1.04);
  helmBase.castShadow = true;
  helmGroup.add(helmBase);

  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.14), glowMat);
  visorMesh.position.set(0, 0.02, 0.21);
  helmGroup.add(visorMesh);

  if (rigId === 'ronin') {
    const kasa = new THREE.Mesh(new THREE.ConeGeometry(0.60, 0.22, 14), trimMat);
    kasa.position.y = 0.22;
    kasa.castShadow = true;
    helmGroup.add(kasa);
  } else {
    const hornGeo = new THREE.ConeGeometry(0.055, 0.36, 6);
    const hL = new THREE.Mesh(hornGeo, trimMat);
    hL.position.set(-0.18, 0.24, 0.04);
    hL.rotation.z = 0.38;
    const hR = new THREE.Mesh(hornGeo, trimMat);
    hR.position.set(0.18, 0.24, 0.04);
    hR.rotation.z = -0.38;
    helmGroup.add(hL, hR);
  }
  bodyGroup.add(helmGroup);

  // 7. Off-Hand Gothic Kite Shield
  const offHand = new THREE.Group();
  offHand.position.set(-0.50, 1.18, 0.18);
  const shield = new THREE.Mesh(
    rigId === 'sentinel'
      ? new THREE.BoxGeometry(0.12, 0.94, 0.58)
      : new THREE.BoxGeometry(0.10, 0.52, 0.34),
    trimMat,
  );
  shield.castShadow = true;
  offHand.add(shield);
  bodyGroup.add(offHand);

  // 8. Main Forged Weapon Pivot
  const weaponPivot = new THREE.Group();
  weaponPivot.position.set(0.54, 1.20, 0.14);
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.72, 8), trimMat);
  hilt.rotation.x = Math.PI / 2;
  hilt.position.z = 0.24;
  const bladeLen = rigId === 'ronin' ? 1.55 : rigId === 'sentinel' ? 1.05 : 1.32;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, bladeLen), glowMat);
  blade.position.set(0, 0, 0.56 + bladeLen * 0.5);
  weaponPivot.add(hilt, blade);
  bodyGroup.add(weaponPivot);

  return {
    root,
    bodyGroup,
    leftLeg,
    rightLeg,
    weaponPivot,
    visorMesh,
    cloakMesh: cloakGroup,
    materialsToFlash: [armorMat, trimMat],
  };
}

export interface EnemyMeshParts {
  root: THREE.Group;
  body: THREE.Group;
  telegraphMesh: THREE.Mesh;
  materialsToFlash: THREE.MeshStandardMaterial[];
  spinner?: THREE.Object3D;
}

/**
 * Builds distinct dark-fantasy gothic enemy silhouettes per archetype using the forged metal & cloth maps.
 */
export function buildEnemyModel(
  kind: EnemyKind,
  shadowTex: THREE.CanvasTexture,
  textures?: DarkFantasyTextureSet,
): EnemyMeshParts {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const shadowRadius = kind === 'charger' ? 1.28 : kind === 'kiter' ? 0.88 : 0.74;
  root.add(createContactShadowMesh(shadowTex, shadowRadius));

  const flashMats: THREE.MeshStandardMaterial[] = [];
  let spinner: THREE.Object3D | undefined;

  if (kind === 'charger') {
    // Dread Ravager (Heavy horned iron juggernaut)
    const obsidian = new THREE.MeshStandardMaterial({
      color: 0x3b3644,
      map: textures?.metalMap ?? null,
      bumpMap: textures?.metalBump ?? null,
      bumpScale: 0.04,
      roughness: 0.58,
      metalness: 0.55,
    });
    const bronze = new THREE.MeshStandardMaterial({
      color: 0xa66b46,
      map: textures?.metalMap ?? null,
      roughness: 0.3,
      metalness: 0.82,
    });
    const magma = new THREE.MeshStandardMaterial({
      color: 0xff4d2a,
      emissive: 0xe11d48,
      emissiveIntensity: 2.1,
      roughness: 0.22,
    });
    flashMats.push(obsidian, bronze);

    const legGeo = new THREE.CylinderGeometry(0.24, 0.20, 0.78, 8);
    const lLeg = new THREE.Mesh(legGeo, obsidian);
    lLeg.position.set(-0.42, 0.39, 0);
    lLeg.castShadow = true;
    const rLeg = new THREE.Mesh(legGeo, obsidian);
    rLeg.position.set(0.42, 0.39, 0);
    rLeg.castShadow = true;

    const hull = new THREE.Mesh(new THREE.DodecahedronGeometry(0.88, 1), obsidian);
    hull.scale.set(1.12, 1.04, 0.94);
    hull.position.set(0, 1.38, 0);
    hull.castShadow = true;

    const shoulderGeo = new THREE.ConeGeometry(0.42, 0.68, 6);
    const sL = new THREE.Mesh(shoulderGeo, bronze);
    sL.position.set(-0.92, 1.72, 0.08);
    sL.rotation.z = 0.65;
    sL.castShadow = true;
    const sR = sL.clone();
    sR.position.x = 0.92;
    sR.rotation.z = -0.65;

    const hornGeo = new THREE.ConeGeometry(0.14, 0.82, 6);
    const hornL = new THREE.Mesh(hornGeo, bronze);
    hornL.position.set(-0.44, 2.04, 0.52);
    hornL.rotation.x = Math.PI / 2.6;
    const hornR = hornL.clone();
    hornR.position.x = 0.44;

    const core = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.26, 0.24), magma);
    core.position.set(0, 1.48, 0.74);

    body.add(lLeg, rLeg, hull, sL, sR, hornL, hornR, core);

    const teleGeo = new THREE.PlaneGeometry(1.5, 9.5);
    const teleMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const telegraphMesh = new THREE.Mesh(teleGeo, teleMat);
    telegraphMesh.rotation.x = -Math.PI / 2;
    telegraphMesh.position.set(0, 0.04, 5.1);
    root.add(telegraphMesh);

    return { root, body, telegraphMesh, materialsToFlash: flashMats };
  }

  if (kind === 'kiter') {
    // Banshee Soul-Archon (Hovering shrouded wraith with iron rune halo)
    const shroud = new THREE.MeshStandardMaterial({
      color: 0xcbb8d6,
      map: textures?.cloakMap ?? null,
      roughness: 0.72,
      metalness: 0.14,
      side: THREE.DoubleSide,
    });
    const iron = new THREE.MeshStandardMaterial({
      color: 0xc8b28e,
      map: textures?.metalMap ?? null,
      roughness: 0.26,
      metalness: 0.85,
    });
    const crystal = new THREE.MeshStandardMaterial({
      color: 0xd8b4fe,
      emissive: 0xa855f7,
      emissiveIntensity: 2.3,
      roughness: 0.15,
    });
    flashMats.push(shroud, iron);

    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.48, 10, 1, true), shroud);
    robe.position.y = 1.12;
    robe.castShadow = true;

    const coreCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), crystal);
    coreCrystal.position.y = 1.64;
    coreCrystal.castShadow = true;

    const ringGroup = new THREE.Group();
    ringGroup.position.y = 1.56;
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.76, 0.06, 8, 20), iron);
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.045, 8, 16), iron);
    innerRing.rotation.x = Math.PI / 2;
    ringGroup.add(outerRing, innerRing);
    spinner = ringGroup;

    body.add(robe, coreCrystal, ringGroup);

    const teleGeo = new THREE.RingGeometry(0.6, 1.15, 24);
    const teleMat = new THREE.MeshBasicMaterial({
      color: 0xc084fc,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const telegraphMesh = new THREE.Mesh(teleGeo, teleMat);
    telegraphMesh.rotation.x = -Math.PI / 2;
    telegraphMesh.position.y = 0.05;
    root.add(telegraphMesh);

    return { root, body, telegraphMesh, materialsToFlash: flashMats, spinner };
  }

  // Crypt Stalker (Agile iron-armored shadow flanker)
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x452d3f,
    map: textures?.metalMap ?? null,
    bumpMap: textures?.metalBump ?? null,
    bumpScale: 0.03,
    roughness: 0.48,
    metalness: 0.52,
  });
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xff4d6d,
    emissive: 0xe11d48,
    emissiveIntensity: 1.7,
    roughness: 0.2,
    metalness: 0.72,
  });
  flashMats.push(hullMat);

  const legGeo = new THREE.CylinderGeometry(0.08, 0.055, 0.64, 6);
  const legL = new THREE.Mesh(legGeo, hullMat);
  legL.position.set(-0.22, 0.32, 0);
  const legR = legL.clone();
  legR.position.x = 0.22;

  const thorax = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.96, 7), hullMat);
  thorax.position.set(0, 1.04, 0);
  thorax.rotation.x = 0.22;
  thorax.castShadow = true;

  const scytheGeo = new THREE.BoxGeometry(0.07, 0.14, 0.94);
  const scytheL = new THREE.Mesh(scytheGeo, bladeMat);
  scytheL.position.set(-0.46, 0.96, 0.36);
  const scytheR = scytheL.clone();
  scytheR.position.x = 0.46;

  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.08, 0.14), bladeMat);
  eye.position.set(0, 1.24, 0.34);

  body.add(legL, legR, thorax, scytheL, scytheR, eye);

  const teleGeo = new THREE.RingGeometry(0.52, 0.92, 18);
  const teleMat = new THREE.MeshBasicMaterial({
    color: 0xf43f5e,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const telegraphMesh = new THREE.Mesh(teleGeo, teleMat);
  telegraphMesh.rotation.x = -Math.PI / 2;
  telegraphMesh.position.y = 0.04;
  root.add(telegraphMesh);

  return { root, body, telegraphMesh, materialsToFlash: flashMats };
}

/**
 * Builds the Twilight Gothic Sky-Citadel playground arena with weathered basalt flagstones,
 * forged iron rune-rings, gothic buttressed pillars, cathedral arch spires, soulfire braziers,
 * and floating twilight obsidian crags.
 */
export function buildSunlitCitadelWorld(
  scene: THREE.Scene,
  maxAnisotropy: number,
  textures?: DarkFantasyTextureSet,
): { clouds: THREE.Group; brazierFlames: THREE.Mesh[]; disposables: Array<{ dispose: () => void }> } {
  const disposables: Array<{ dispose: () => void }> = [];
  const { albedo, bump } = createStoneFloorTextures(maxAnisotropy);
  disposables.push(albedo, bump);

  // 0. Dramatic Crimson-Twilight Gothic Sky Dome
  const skyCanvas = document.createElement('canvas');
  skyCanvas.width = 16;
  skyCanvas.height = 256;
  const sctx = skyCanvas.getContext('2d')!;
  const skyGrad = sctx.createLinearGradient(0, 0, 0, 256);
  skyGrad.addColorStop(0.0, '#100c1e');
  skyGrad.addColorStop(0.32, '#241838');
  skyGrad.addColorStop(0.56, '#582848');
  skyGrad.addColorStop(0.72, '#a85a5e');
  skyGrad.addColorStop(0.84, '#d98f76');
  skyGrad.addColorStop(1.0, '#3a2434');
  sctx.fillStyle = skyGrad;
  sctx.fillRect(0, 0, 16, 256);
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyGeo = new THREE.SphereGeometry(148, 24, 16);
  const skyMat = new THREE.MeshBasicMaterial({
    map: skyTex,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const skyDome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(skyDome);
  disposables.push(skyTex, skyGeo, skyMat);

  // 1. Carved Gothic Basalt Plateau (y = 0 surface)
  const deckGeo = new THREE.CylinderGeometry(ARENA_RADIUS + 0.7, ARENA_RADIUS + 0.15, 1.6, 40);
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: albedo,
    bumpMap: bump,
    bumpScale: 0.08,
    roughness: 0.78,
    metalness: 0.14,
  });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.position.y = -0.8;
  deck.receiveShadow = true;
  scene.add(deck);
  disposables.push(deckGeo, deckMat);

  // Jagged floating obsidian crag underside
  const rockUnderGeo = new THREE.ConeGeometry(ARENA_RADIUS + 0.3, 17, 14);
  const rockUnderMat = new THREE.MeshStandardMaterial({
    color: 0x221d2d,
    roughness: 0.92,
    metalness: 0.08,
  });
  const rockUnder = new THREE.Mesh(rockUnderGeo, rockUnderMat);
  rockUnder.rotation.x = Math.PI;
  rockUnder.position.y = -9.6;
  scene.add(rockUnder);
  disposables.push(rockUnderGeo, rockUnderMat);

  // 2. Forged Antique Silver-Iron & Crimson-Gold Arcane Arena Rings
  const ironFiligreeMat = new THREE.MeshStandardMaterial({
    color: 0xc8a96e,
    map: textures?.metalMap ?? null,
    bumpMap: textures?.metalBump ?? null,
    bumpScale: 0.03,
    roughness: 0.30,
    metalness: 0.84,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const darkIronMat = new THREE.MeshStandardMaterial({
    color: 0x706c7a,
    map: textures?.metalMap ?? null,
    bumpMap: textures?.metalBump ?? null,
    bumpScale: 0.035,
    roughness: 0.38,
    metalness: 0.80,
  });
  disposables.push(ironFiligreeMat, darkIronMat);

  for (const r of [5.2, 12.2, ARENA_RADIUS - 0.15]) {
    const ringGeo = new THREE.RingGeometry(r - 0.28, r, 48);
    const ring = new THREE.Mesh(ringGeo, ironFiligreeMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.022;
    ring.receiveShadow = true;
    scene.add(ring);
    disposables.push(ringGeo);
  }

  // 3. Gothic Buttressed Cover Pillars + Amethyst-Crimson Soulfire Braziers
  const pillarStoneMat = new THREE.MeshStandardMaterial({
    color: 0x524c60,
    bumpMap: bump,
    bumpScale: 0.05,
    roughness: 0.76,
    metalness: 0.16,
  });
  const soulFlameMat = new THREE.MeshStandardMaterial({
    color: 0xff5c8a,
    emissive: 0xd91c5c,
    emissiveIntensity: 2.4,
    roughness: 0.22,
  });
  const amethystFlameMat = new THREE.MeshStandardMaterial({
    color: 0xd8b4fe,
    emissive: 0x9333ea,
    emissiveIntensity: 2.2,
    roughness: 0.18,
  });
  disposables.push(pillarStoneMat, soulFlameMat, amethystFlameMat);

  const brazierFlames: THREE.Mesh[] = [];
  const plinthGeo = new THREE.CylinderGeometry(1.48, 1.66, 0.65, 8);
  const shaftGeo = new THREE.CylinderGeometry(1.06, 1.24, 3.5, 8);
  const collarGeo = new THREE.TorusGeometry(1.18, 0.12, 6, 8);
  const capGeo = new THREE.CylinderGeometry(1.44, 1.14, 0.48, 8);
  const bowlGeo = new THREE.ConeGeometry(1.05, 0.65, 8);
  const flameGeo = new THREE.OctahedronGeometry(0.48, 0);
  disposables.push(plinthGeo, shaftGeo, collarGeo, capGeo, bowlGeo, flameGeo);

  for (const p of ARENA_PILLARS) {
    const group = new THREE.Group();
    group.position.set(p.x, 0, p.z);

    const plinth = new THREE.Mesh(plinthGeo, pillarStoneMat);
    plinth.position.y = 0.325;
    plinth.castShadow = true;
    plinth.receiveShadow = true;

    const shaft = new THREE.Mesh(shaftGeo, pillarStoneMat);
    shaft.position.y = 2.35;
    shaft.castShadow = true;
    shaft.receiveShadow = true;

    const collar = new THREE.Mesh(collarGeo, darkIronMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 2.4;

    const cap = new THREE.Mesh(capGeo, ironFiligreeMat);
    cap.position.y = 4.25;
    cap.castShadow = true;

    const bowl = new THREE.Mesh(bowlGeo, darkIronMat);
    bowl.rotation.x = Math.PI;
    bowl.position.y = 4.62;

    const flame = new THREE.Mesh(flameGeo, soulFlameMat);
    flame.position.y = 5.15;
    brazierFlames.push(flame);

    group.add(plinth, shaft, collar, cap, bowl, flame);
    scene.add(group);
  }

  // 4. Four Monumental Gothic Cathedral Bell-Spires & Pointed Finials (Spawn Vista Landmarks)
  const spireBaseGeo = new THREE.BoxGeometry(2.8, 2.5, 2.8);
  const spireShaftGeo = new THREE.CylinderGeometry(0.68, 1.32, 12.2, 6);
  const spireFinialGeo = new THREE.ConeGeometry(0.85, 3.8, 6);
  const spireCrystalGeo = new THREE.OctahedronGeometry(0.95, 0);
  const spireBandGeo = new THREE.BoxGeometry(2.1, 0.5, 2.1);
  disposables.push(spireBaseGeo, spireShaftGeo, spireFinialGeo, spireCrystalGeo, spireBandGeo);

  const spireAngles = [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75];
  for (const ang of spireAngles) {
    const spire = new THREE.Group();
    const dist = ARENA_RADIUS + 1.45;
    spire.position.set(Math.cos(ang) * dist, -0.3, Math.sin(ang) * dist);
    spire.rotation.y = -ang + Math.PI / 4;

    const base = new THREE.Mesh(spireBaseGeo, pillarStoneMat);
    base.position.y = 1.25;
    base.castShadow = true;
    const shaft = new THREE.Mesh(spireShaftGeo, pillarStoneMat);
    shaft.position.y = 8.0;
    shaft.castShadow = true;
    const band = new THREE.Mesh(spireBandGeo, ironFiligreeMat);
    band.position.y = 6.2;
    const bandUpper = new THREE.Mesh(spireBandGeo, darkIronMat);
    bandUpper.scale.setScalar(0.82);
    bandUpper.position.y = 11.4;
    const finial = new THREE.Mesh(spireFinialGeo, darkIronMat);
    finial.position.y = 15.8;
    const crystal = new THREE.Mesh(spireCrystalGeo, amethystFlameMat);
    crystal.position.y = 14.3;
    brazierFlames.push(crystal);

    spire.add(base, shaft, band, bandUpper, finial, crystal);
    scene.add(spire);
  }

  // 5. Jagged Perimeter Obsidian Merlons & Broken Gothic Parapet Stones (InstancedMesh)
  const rockCount = 36;
  const rockGeo = new THREE.DodecahedronGeometry(0.86, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0.14,
  });
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (let i = 0; i < rockCount; i++) {
    const ang = (i / rockCount) * Math.PI * 2 + 0.1;
    const r = ARENA_RADIUS + 0.45 + ((i * 19) % 10) * 0.05;
    const s = 0.72 + ((i * 7) % 10) * 0.065;
    dummy.position.set(Math.cos(ang) * r, s * 0.42 - 0.15, Math.sin(ang) * r);
    dummy.rotation.set(i * 0.4, ang, i * 0.3);
    dummy.scale.set(s * 1.0, s * 1.05, s * 0.85);
    dummy.updateMatrix();
    rockInst.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.74, 0.14, 0.24 + ((i * 13) % 10) * 0.014);
    rockInst.setColorAt(i, color);
  }
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  scene.add(rockInst);
  disposables.push(rockGeo, rockMat);

  // 6. Distant Floating Obsidian Ruin-Islets & Twilight Mist Clouds
  const isletTopGeo = new THREE.CylinderGeometry(5.2, 4.4, 1.5, 8);
  const isletBotGeo = new THREE.ConeGeometry(4.6, 10.5, 7);
  const ruinTopMat = new THREE.MeshStandardMaterial({
    color: 0x3b2d42,
    roughness: 0.86,
    metalness: 0.08,
  });
  disposables.push(isletTopGeo, isletBotGeo, ruinTopMat);

  const isletPositions = [
    [-38, -2, -34, 1.2],
    [42, 4, -28, 1.4],
    [-44, 6, 26, 1.0],
    [36, -3, 38, 1.15],
    [0, 5, -52, 1.6],
  ];
  for (const [ix, iy, iz, iscale] of isletPositions) {
    const islet = new THREE.Group();
    islet.position.set(ix, iy, iz);
    islet.scale.setScalar(iscale);
    const top = new THREE.Mesh(isletTopGeo, ruinTopMat);
    const bot = new THREE.Mesh(isletBotGeo, rockUnderMat);
    bot.rotation.x = Math.PI;
    bot.position.y = -5.8;
    // Ruined silhouette tower on distant floating crags
    const ruinSpire = new THREE.Mesh(spireFinialGeo, darkIronMat);
    ruinSpire.position.set(0, 2.4, 0);
    islet.add(top, bot, ruinSpire);
    scene.add(islet);
  }

  const clouds = new THREE.Group();
  const cloudGeo = new THREE.IcosahedronGeometry(3.6, 1);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xc295a8,
    roughness: 0.96,
    metalness: 0.0,
    transparent: true,
    opacity: 0.48,
  });
  disposables.push(cloudGeo, cloudMat);

  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2;
    const dist = 34 + (i % 4) * 10;
    const puff = new THREE.Mesh(cloudGeo, cloudMat);
    puff.position.set(
      Math.cos(ang) * dist,
      -9.5 + (i % 3) * 3.5,
      Math.sin(ang) * dist,
    );
    puff.scale.set(2.4 + (i % 3) * 0.6, 0.72, 1.4);
    clouds.add(puff);
  }
  scene.add(clouds);

  return { clouds, brazierFlames, disposables };
}
