import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { clone as cloneSkinnedObject } from 'three/addons/utils/SkeletonUtils.js';
import {
  buildHeroCharacterRig,
  createContactShadowTexture,
  type BuiltinRigId,
} from './proceduralModels';
import type { EnemyKind } from './rules';

export type AnimClipState = 'idle' | 'run' | 'attack' | 'dash';

export interface ImportedAssetSummary {
  fileName: string;
  format: 'GLB' | 'GLTF' | 'FBX';
  meshCount: number;
  triangleCount: number;
  materialCount: number;
  animationNames: string[];
  normalizedScale: number;
}

export interface LoadedCustomRig {
  group: THREE.Group;
  animations: THREE.AnimationClip[];
  summary: ImportedAssetSummary;
}

export interface InstancedBlenderRig {
  group: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  actions: Partial<Record<AnimClipState, THREE.AnimationAction>>;
  activeState: AnimClipState | null;
  flashMaterials: THREE.MeshStandardMaterial[];
  baseEmissive: Map<THREE.MeshStandardMaterial, { hex: number; intensity: number }>;
  dispose: () => void;
}

export const BLENDER_HERO_MODELS: Record<BuiltinRigId | 'ember', string> = {
  ranger: '/models/heroes/ranger.glb',
  vanguard: '/models/heroes/vanguard.glb',
  sentinel: '/models/heroes/sentinel.glb',
  ronin: '/models/heroes/ronin.glb',
  ember: '/models/heroes/ember.glb',
};

export const BLENDER_ENEMY_MODELS: Record<EnemyKind, { url: string; targetHeight: number; groundFeet: boolean }> = {
  charger: { url: '/models/enemies/charger.glb', targetHeight: 2.35, groundFeet: true },
  kiter: { url: '/models/enemies/kiter.glb', targetHeight: 2.05, groundFeet: false },
  swarmer: { url: '/models/enemies/swarmer.glb', targetHeight: 1.2, groundFeet: true },
};

export const BLENDER_DEFAULT_PROP_URL = '/models/props/citadel_obelisk.glb';

export const BLENDER_WEAPON_MODELS = {
  rangerBow: '/models/weapons/ranger_bow.glb',
  rangerArrow: '/models/weapons/ranger_arrow.glb',
  vanguardGlaive: '/models/weapons/vanguard_glaive.glb',
  sentinelWarhammer: '/models/weapons/sentinel_warhammer.glb',
  sentinelShield: '/models/weapons/sentinel_shield.glb',
  roninOdachi: '/models/weapons/ronin_odachi.glb',
} as const;

export const BLENDER_CITADEL_KIT = {
  brazierPillar: '/models/props/gothic_brazier_pillar.glb',
  cathedralSpire: '/models/props/cathedral_spire.glb',
  nordicWordWall: '/models/props/nordic_word_wall.glb',
  nordicPine: '/models/props/nordic_pine.glb',
} as const;

const ANIM_PATTERNS: Record<AnimClipState, RegExp> = {
  idle: /idle|stand|breath|wait|rest/i,
  run: /run|walk|sprint|move|jog|stride/i,
  attack: /attack|slash|strike|shoot|bow|fire|cast|hit|swing|cleave/i,
  dash: /dash|dodge|roll|evade|lunge|jump/i,
};

/**
 * Pure clip-name resolver that maps arbitrary Blender/Mixamo/CGTrader animation names
 * onto Skyforge Arena's 4 skeletal animation states.
 */
export function resolveAnimationClip(
  clips: readonly THREE.AnimationClip[],
  state: AnimClipState,
): THREE.AnimationClip | null {
  if (!clips.length) return null;
  const pattern = ANIM_PATTERNS[state];
  const exact = clips.find((c) => c.name.trim().toLowerCase() === state);
  if (exact) return exact;
  const matched = clips.find((c) => pattern.test(c.name));
  if (matched) return matched;
  if (state === 'idle') return clips[0];
  if (state === 'run') return clips.find((c) => ANIM_PATTERNS.idle.test(c.name)) ?? clips[0];
  return null;
}

function normalizeModelForArena(
  rawRoot: THREE.Object3D,
  fileName: string,
  format: 'GLB' | 'GLTF' | 'FBX',
  animations: THREE.AnimationClip[],
  targetHeight = 2.08,
  groundFeet = true,
): LoadedCustomRig {
  const wrapper = new THREE.Group();
  rawRoot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(rawRoot);
  const size = new THREE.Vector3();
  box.getSize(size);

  const primarySpan = size.y > 0.05 ? size.y : Math.max(size.x, size.z, 0.001);
  const maxFootprint = Math.max(size.x, size.z);
  const referenceSpan = maxFootprint > primarySpan * 2.5 ? maxFootprint * 0.55 : primarySpan;
  const scale = targetHeight / Math.max(referenceSpan, 0.001);

  rawRoot.scale.multiplyScalar(scale);
  rawRoot.updateMatrixWorld(true);

  const scaledBox = new THREE.Box3().setFromObject(rawRoot);
  const scaledCenter = new THREE.Vector3();
  scaledBox.getCenter(scaledCenter);

  rawRoot.position.x -= scaledCenter.x;
  rawRoot.position.z -= scaledCenter.z;
  if (groundFeet) {
    rawRoot.position.y -= scaledBox.min.y;
  } else {
    rawRoot.position.y -= Math.min(0, scaledBox.min.y);
  }

  let meshCount = 0;
  let triangleCount = 0;
  const materialSet = new Set<THREE.Material>();

  rawRoot.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      meshCount++;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        mesh.frustumCulled = false;
      }
      const geo = mesh.geometry;
      if (geo) {
        if (geo.index) {
          triangleCount += Math.floor(geo.index.count / 3);
        } else if (geo.attributes.position) {
          triangleCount += Math.floor(geo.attributes.position.count / 3);
        }
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m) {
          materialSet.add(m);
          if ('envMapIntensity' in m) {
            (m as THREE.MeshStandardMaterial).envMapIntensity = 1.05;
          }
        }
      }
    }
  });

  wrapper.add(rawRoot);

  return {
    group: wrapper,
    animations,
    summary: {
      fileName,
      format,
      meshCount,
      triangleCount,
      materialCount: materialSet.size,
      animationNames: animations.map((clip) => clip.name || 'Unnamed Clip'),
      normalizedScale: Number(scale.toFixed(3)),
    },
  };
}

/**
 * Creates an independent animated runtime instance from a LoadedCustomRig.
 * Uses SkeletonUtils.clone so SkinnedMesh bones bind to the cloned armature,
 * and clones materials per instance for isolated hit-flash / telegraph effects.
 */
export function instantiateBlenderRig(loaded: LoadedCustomRig): InstancedBlenderRig {
  const cloned = cloneSkinnedObject(loaded.group);
  const flashMaterials: THREE.MeshStandardMaterial[] = [];
  const baseEmissive = new Map<THREE.MeshStandardMaterial, { hex: number; intensity: number }>();
  const clonedMaterialMap = new Map<THREE.Material, THREE.Material>();

  cloned.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      mesh.frustumCulled = false;
    }

    const cloneMat = (mat: THREE.Material): THREE.Material => {
      const existing = clonedMaterialMap.get(mat);
      if (existing) return existing;
      const dup = mat.clone();
      clonedMaterialMap.set(mat, dup);
      if ((dup as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
        const std = dup as THREE.MeshStandardMaterial;
        flashMaterials.push(std);
        baseEmissive.set(std, {
          hex: std.emissive.getHex(),
          intensity: std.emissiveIntensity,
        });
      }
      return dup;
    };

    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(cloneMat);
    } else if (mesh.material) {
      mesh.material = cloneMat(mesh.material);
    }
  });

  let mixer: THREE.AnimationMixer | null = null;
  const actions: Partial<Record<AnimClipState, THREE.AnimationAction>> = {};
  let activeState: AnimClipState | null = null;

  if (loaded.animations.length > 0) {
    mixer = new THREE.AnimationMixer(cloned);
    for (const state of ['idle', 'run', 'attack', 'dash'] as const) {
      const clip = resolveAnimationClip(loaded.animations, state);
      if (!clip) continue;
      const action = mixer.clipAction(clip);
      if (state === 'attack' || state === 'dash') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      actions[state] = action;
    }

    const startAction = actions.idle ?? Object.values(actions)[0];
    if (startAction) {
      startAction.play();
      activeState = actions.idle ? 'idle' : null;
    }
  }

  return {
    group: cloned,
    mixer,
    actions,
    activeState,
    flashMaterials,
    baseEmissive,
    dispose: () => {
      mixer?.stopAllAction();
      for (const m of clonedMaterialMap.values()) {
        m.dispose();
      }
      clonedMaterialMap.clear();
    },
  };
}

export function transitionRigAnimation(
  inst: InstancedBlenderRig,
  nextState: AnimClipState,
  fadeSec = 0.12,
): void {
  if (!inst.mixer) return;
  const nextAction = inst.actions[nextState] ?? inst.actions.idle;
  if (!nextAction) return;
  if (inst.activeState === nextState && nextState !== 'attack' && nextState !== 'dash') {
    return;
  }

  const prevAction = inst.activeState ? inst.actions[inst.activeState] : undefined;
  if (prevAction === nextAction) {
    if (nextState === 'attack' || nextState === 'dash') {
      nextAction.reset().play();
    }
    return;
  }

  nextAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
  if (prevAction) {
    prevAction.crossFadeTo(nextAction, fadeSec, false);
  }
  inst.activeState = nextState;
}

export function applyRigFlashTint(
  inst: InstancedBlenderRig,
  flashHex: number | null,
  flashIntensity: number,
): void {
  for (const mat of inst.flashMaterials) {
    const base = inst.baseEmissive.get(mat);
    if (!base) continue;
    if (flashHex !== null && flashIntensity > 0) {
      mat.emissive.setHex(flashHex);
      mat.emissiveIntensity = Math.max(base.intensity, flashIntensity);
    } else {
      mat.emissive.setHex(base.hex);
      mat.emissiveIntensity = base.intensity;
    }
  }
}

/**
 * Loads a Blender-exported .glb, .gltf, or .fbx binary ArrayBuffer via Three.js loaders.
 */
export async function loadBlenderAssetBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  opts?: { targetHeight?: number; groundFeet?: boolean },
): Promise<LoadedCustomRig> {
  const lower = fileName.toLowerCase();
  const ext = lower.endsWith('.glb')
    ? 'GLB'
    : lower.endsWith('.gltf')
      ? 'GLTF'
      : lower.endsWith('.fbx')
        ? 'FBX'
        : null;

  if (!ext) {
    throw new Error('Unsupported 3D asset format. Please upload a .glb, .gltf, or .fbx file exported from Blender.');
  }

  const targetHeight = opts?.targetHeight ?? 2.08;
  const groundFeet = opts?.groundFeet ?? true;

  if (ext === 'FBX') {
    const loader = new FBXLoader();
    const fbxGroup = loader.parse(buffer, '');
    const clips = fbxGroup.animations || [];
    return normalizeModelForArena(fbxGroup, fileName, 'FBX', clips, targetHeight, groundFeet);
  }

  const gltfLoader = new GLTFLoader();
  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>(
    (resolve, reject) => {
      gltfLoader.parse(
        buffer,
        '',
        (result) => resolve({ scene: result.scene, animations: result.animations || [] }),
        (err) => reject(err instanceof Error ? err : new Error('Failed to parse GLTF/GLB asset.')),
      );
    },
  );

  return normalizeModelForArena(gltf.scene, fileName, ext, gltf.animations, targetHeight, groundFeet);
}

const urlAssetCache = new Map<string, Promise<LoadedCustomRig>>();

/**
 * Fetches and caches a shipped Blender-exported .glb/.gltf/.fbx asset by URL.
 */
export function loadBlenderAssetUrl(
  url: string,
  opts?: { targetHeight?: number; groundFeet?: boolean },
): Promise<LoadedCustomRig> {
  const key = `${url}|${opts?.targetHeight ?? 2.08}|${opts?.groundFeet ?? true}`;
  const cached = urlAssetCache.get(key);
  if (cached) return cached;

  const task = (async () => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch Blender asset ${url} (HTTP ${res.status})`);
    }
    const buf = await res.arrayBuffer();
    const fileName = url.split('/').pop() || 'blender_asset.glb';
    return loadBlenderAssetBuffer(buf, fileName, opts);
  })().catch((err) => {
    urlAssetCache.delete(key);
    throw err;
  });

  urlAssetCache.set(key, task);
  return task;
}

const staticGlbCache = new Map<string, Promise<THREE.Group>>();

/**
 * Fetches and caches a Blender-exported 1:1 scale static .glb preserving exact
 * grip/floor pivots authored in Blender (used for FPS viewmodel weapons & modular kit pieces).
 */
export function loadBlenderStaticModelUrl(url: string): Promise<THREE.Group> {
  const cached = staticGlbCache.get(url);
  if (cached) return cached;

  const task = (async () => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch static Blender asset ${url} (HTTP ${res.status})`);
    }
    const buf = await res.arrayBuffer();
    const loader = new GLTFLoader();
    const scene = await new Promise<THREE.Group>((resolve, reject) => {
      loader.parse(
        buf,
        '',
        (gltf) => resolve(gltf.scene),
        (err) => reject(err instanceof Error ? err : new Error('Failed to parse static GLB asset.')),
      );
    });
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m && 'envMapIntensity' in m) {
          (m as THREE.MeshStandardMaterial).envMapIntensity = 1.25;
        }
      }
    });
    return scene;
  })().catch((err) => {
    staticGlbCache.delete(url);
    throw err;
  });

  staticGlbCache.set(url, task);
  return task;
}

/**
 * Loads a Blender-exported .glb, .gltf, or .fbx File directly in the browser via Three.js loaders.
 */
export async function loadBlenderAssetFile(file: File): Promise<LoadedCustomRig> {
  const buffer = await file.arrayBuffer();
  return loadBlenderAssetBuffer(buffer, file.name);
}

/**
 * Downloads the shipped Blender-authored .glb hero rig (or exports the procedural fallback).
 */
export async function exportBuiltinRigAsGlb(rigId: BuiltinRigId): Promise<Blob> {
  const shippedUrl = BLENDER_HERO_MODELS[rigId];
  if (shippedUrl && typeof fetch === 'function') {
    try {
      const res = await fetch(shippedUrl);
      if (res.ok) {
        return await res.blob();
      }
    } catch {
      // Fall back to procedural runtime export when offline without cache
    }
  }

  const shadowTex = createContactShadowTexture();
  const built = buildHeroCharacterRig(rigId, shadowTex);
  const exportScene = new THREE.Group();
  exportScene.name = `Skyforge_${rigId}`;
  exportScene.add(built.bodyGroup);

  const exporter = new GLTFExporter();
  const binary = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      exportScene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(result);
        } else {
          const json = JSON.stringify(result);
          resolve(new TextEncoder().encode(json).buffer);
        }
      },
      (err) => reject(err instanceof Error ? err : new Error('GLB export failed')),
      { binary: true },
    );
  });

  shadowTex.dispose();
  return new Blob([binary], { type: 'model/gltf-binary' });
}
