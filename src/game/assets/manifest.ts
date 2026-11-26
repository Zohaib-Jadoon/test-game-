import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AssetCategory, AssetDefinition } from '../types';

export interface LoadedAssetRecord {
  definition: AssetDefinition;
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export interface InstantiatedActor {
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  clips: Map<string, THREE.AnimationClip>;
  sockets: Map<string, THREE.Object3D>;
}

const PROVENANCE = 'EIDRATH Realistic Overhaul (CC0 / CC-BY sourced + Blender 5.3 pipeline)';

interface EntryExtras {
  name?: string;
  creator?: string;
  sourceUrl?: string;
  license?: string;
  attribution?: string;
  commercialUse?: boolean;
  redistribution?: string;
  originalFormat?: string;
  optimizedFormat?: string;
  triangleCount?: number;
  textureSizes?: string;
}

const makeEntry = (
  id: string,
  meshName: string,
  category: AssetCategory,
  url: string,
  blendSource: string,
  expectedHeightM: number,
  pivot: 'feet' | 'grip' | 'base',
  animations: string[] = [],
  sockets?: string[],
  hasCollider = false,
  extras: EntryExtras = {},
): AssetDefinition => ({
  id,
  name: extras.name ?? meshName,
  meshName,
  category,
  url,
  blendSource,
  expectedHeightM,
  pivot,
  animations,
  sockets,
  hasCollider,
  provenance: PROVENANCE,
  creator: extras.creator ?? 'EIDRATH / CC0 Sourced Pipeline',
  sourceUrl: extras.sourceUrl ?? 'https://polyhaven.com/',
  license: extras.license ?? 'CC0 1.0',
  attribution: extras.attribution ?? 'None required (CC0)',
  commercialUse: extras.commercialUse ?? true,
  redistribution: extras.redistribution ?? 'Permitted (CC0 / optimized runtime GLB)',
  originalFormat: extras.originalFormat ?? 'blend/gltf',
  optimizedFormat: extras.optimizedFormat ?? 'glb',
  triangleCount: extras.triangleCount ?? 0,
  textureSizes: extras.textureSizes ?? '512x512 / 256x256',
  integrationStatus: 'integrated',
  visualQaStatus: 'pending',
  inspectedInGame: false,
  status: 'pending',
});

export const EIDRATH_ASSET_MANIFEST: Record<string, AssetDefinition> = {
  // Rigged Characters (1:1 meters; grounded at Y=0)
  chr_kaelen: makeEntry(
    'chr_kaelen',
    'CHR_Kaelen',
    'hero',
    '/assets/eidrath/characters/chr_kaelen.glb',
    'art/blender/characters/chr_kaelen.blend',
    1.91,
    'feet',
    ['Idle', 'Walk', 'Run', 'Talk', 'Cast', 'LightAttack', 'HeavyAttack', 'Block', 'Dodge', 'Stagger', 'Death'],
    ['hand_r', 'hand_l', 'back_weapon', 'head'],
  ),
  chr_lyra: makeEntry(
    'chr_lyra',
    'CHR_Lyra',
    'companion',
    '/assets/eidrath/characters/chr_lyra.glb',
    'art/blender/characters/chr_lyra.blend',
    1.83,
    'feet',
    ['Idle', 'Walk', 'Run', 'Talk', 'Cast'],
    ['hand_r', 'hand_l', 'head'],
  ),
  npc_borin: makeEntry(
    'npc_borin',
    'NPC_Borin',
    'npc',
    '/assets/eidrath/characters/npc_borin.glb',
    'art/blender/characters/npc_borin.blend',
    1.55,
    'feet',
    ['Idle', 'Walk', 'Run', 'Talk', 'Cast'],
    ['hand_r', 'head'],
  ),
  npc_edda: makeEntry(
    'npc_edda',
    'NPC_Edda',
    'npc',
    '/assets/eidrath/characters/npc_edda.glb',
    'art/blender/characters/npc_edda.blend',
    1.80,
    'feet',
    ['Idle', 'Walk', 'Run', 'Talk', 'Cast'],
    ['hand_r', 'hand_l', 'head'],
  ),
  npc_villager: makeEntry(
    'npc_villager',
    'NPC_Villager',
    'npc',
    '/assets/eidrath/characters/npc_villager.glb',
    'art/blender/characters/npc_villager.blend',
    1.74,
    'feet',
    ['Idle', 'Walk', 'Run', 'Talk', 'Cast'],
    ['hand_r', 'head'],
  ),

  // Rigged Enemies & Boss (1:1 meters; NEVER normalized to hero height)
  enm_hollow_swordsman: makeEntry(
    'enm_hollow_swordsman',
    'ENM_HollowSwordsman',
    'enemy',
    '/assets/eidrath/enemies/enm_hollow_swordsman.glb',
    'art/blender/enemies/enm_hollow_swordsman.blend',
    1.85,
    'feet',
    ['Idle', 'Walk', 'Run', 'Telegraph', 'Attack', 'Stagger', 'Death'],
  ),
  enm_hollow_archer: makeEntry(
    'enm_hollow_archer',
    'ENM_HollowArcher',
    'enemy',
    '/assets/eidrath/enemies/enm_hollow_archer.glb',
    'art/blender/enemies/enm_hollow_archer.blend',
    1.80,
    'feet',
    ['Idle', 'Walk', 'Run', 'Telegraph', 'Attack', 'Stagger', 'Death'],
  ),
  enm_hollow_knight: makeEntry(
    'enm_hollow_knight',
    'ENM_HollowKnight',
    'enemy',
    '/assets/eidrath/enemies/enm_hollow_knight.glb',
    'art/blender/enemies/enm_hollow_knight.blend',
    2.28,
    'feet',
    ['Idle', 'Walk', 'Run', 'Telegraph', 'Attack', 'Block', 'Stagger', 'Death'],
  ),
  enm_frost_wolf: makeEntry(
    'enm_frost_wolf',
    'ENM_FrostWolf',
    'enemy',
    '/assets/eidrath/enemies/enm_frost_wolf.glb',
    'art/blender/enemies/enm_frost_wolf.blend',
    1.03,
    'feet',
    ['Idle', 'Run', 'Telegraph', 'Attack', 'Death'],
  ),
  enm_bandit: makeEntry(
    'enm_bandit',
    'ENM_Bandit',
    'enemy',
    '/assets/eidrath/enemies/enm_bandit.glb',
    'art/blender/enemies/enm_bandit.blend',
    1.89,
    'feet',
    ['Idle', 'Walk', 'Run', 'Telegraph', 'Attack', 'Stagger', 'Death'],
  ),
  enm_frost_troll: makeEntry(
    'enm_frost_troll',
    'ENM_FrostTroll',
    'enemy',
    '/assets/eidrath/enemies/enm_frost_troll.glb',
    'art/blender/enemies/enm_frost_troll.blend',
    2.86,
    'feet',
    ['Idle', 'Walk', 'Run', 'Telegraph', 'Attack', 'Stagger', 'Death'],
  ),
  boss_warden: makeEntry(
    'boss_warden',
    'BOSS_Warden',
    'boss',
    '/assets/eidrath/bosses/boss_warden.glb',
    'art/blender/enemies/boss_warden.blend',
    4.07,
    'feet',
    ['Idle', 'Walk', 'MaceChain', 'Sweep', 'Slam', 'Fissure', 'Stagger', 'Death'],
  ),

  // Weapons & Shields (1:1 grip pivot)
  wpn_oathbreaker: makeEntry('wpn_oathbreaker', 'WPN_Oathbreaker', 'weapon', '/assets/eidrath/weapons/wpn_oathbreaker.glb', 'art/blender/weapons/eidrath_weapons.blend', 1.45, 'grip'),
  wpn_iron_sword: makeEntry('wpn_iron_sword', 'WPN_IronSword', 'weapon', '/assets/eidrath/weapons/wpn_iron_sword.glb', 'art/blender/weapons/eidrath_weapons.blend', 1.05, 'grip'),
  wpn_frost_axe: makeEntry('wpn_frost_axe', 'WPN_FrostAxe', 'weapon', '/assets/eidrath/weapons/wpn_frost_axe.glb', 'art/blender/weapons/eidrath_weapons.blend', 0.92, 'grip'),
  wpn_nightpiercer: makeEntry('wpn_nightpiercer', 'WPN_Nightpiercer', 'weapon', '/assets/eidrath/weapons/wpn_nightpiercer.glb', 'art/blender/weapons/eidrath_weapons.blend', 1.25, 'grip'),
  wpn_iron_shield: makeEntry('wpn_iron_shield', 'WPN_IronShield', 'weapon', '/assets/eidrath/weapons/wpn_iron_shield.glb', 'art/blender/weapons/eidrath_weapons.blend', 0.72, 'grip'),
  wpn_oblivion_staff: makeEntry('wpn_oblivion_staff', 'WPN_StaffOfOblivion', 'weapon', '/assets/eidrath/weapons/wpn_oblivion_staff.glb', 'art/blender/weapons/eidrath_weapons.blend', 1.75, 'grip'),
  wpn_worldshatter: makeEntry('wpn_worldshatter', 'WPN_Worldshatter', 'weapon', '/assets/eidrath/weapons/wpn_worldshatter.glb', 'art/blender/weapons/eidrath_weapons.blend', 1.38, 'grip'),
  wpn_torment_links: makeEntry('wpn_torment_links', 'WPN_TormentLinks', 'weapon', '/assets/eidrath/weapons/wpn_torment_links.glb', 'art/blender/weapons/eidrath_weapons.blend', 0.76, 'grip'),

  // Frostheim Modular Architecture & Foliage (1:1 meters, verified UCX colliders)
  env_oathgrave_tomb: makeEntry('env_oathgrave_tomb', 'ENV_Frostheim_OathgraveTomb', 'world', '/assets/eidrath/world/env_oathgrave_tomb.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 5.4, 'base', [], undefined, true),
  env_ruined_bridge: makeEntry('env_ruined_bridge', 'ENV_Frostheim_RuinedBridge', 'world', '/assets/eidrath/world/env_ruined_bridge.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 2.4, 'base', [], undefined, true),
  env_nordic_cabin: makeEntry('env_nordic_cabin', 'ENV_Frostheim_NordicCabin', 'world', '/assets/eidrath/world/env_nordic_cabin.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 5.2, 'base', [], undefined, true),
  env_borin_forge: makeEntry('env_borin_forge', 'ENV_Frostheim_BorinForge', 'world', '/assets/eidrath/world/env_borin_forge.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 4.4, 'base', [], undefined, true),
  env_frost_pine: makeEntry('env_frost_pine', 'ENV_Frostheim_Pine', 'world', '/assets/eidrath/world/env_frost_pine.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 7.8, 'base', [], undefined, true),
  env_rock_cliff: makeEntry('env_rock_cliff', 'ENV_Frostheim_RockCliff', 'world', '/assets/eidrath/world/env_rock_cliff.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 6.5, 'base', [], undefined, true),
  env_ice_cave_arch: makeEntry('env_ice_cave_arch', 'ENV_Frostheim_IceCaveArch', 'world', '/assets/eidrath/world/env_ice_cave_arch.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 5.6, 'base', [], undefined, true),
  env_keep_gate: makeEntry('env_keep_gate', 'ENV_Frostheim_KeepGate', 'world', '/assets/eidrath/world/env_keep_gate.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 9.2, 'base', [], undefined, true),
  env_keep_wall: makeEntry('env_keep_wall', 'ENV_Frostheim_KeepWall', 'world', '/assets/eidrath/world/env_keep_wall.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 5.0, 'base', [], undefined, true),
  env_oath_shrine: makeEntry('env_oath_shrine', 'ENV_Frostheim_OathShrine', 'world', '/assets/eidrath/world/env_oath_shrine.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 4.6, 'base', [], undefined, true),

  // 25 Frostheim Props
  prop_chest: makeEntry('prop_chest', 'PROP_Chest', 'prop', '/assets/eidrath/props/prop_chest.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 0.8, 'base'),
  prop_oath_rune_stone: makeEntry('prop_oath_rune_stone', 'PROP_OathRuneStone', 'prop', '/assets/eidrath/props/prop_oath_rune_stone.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 2.2, 'base'),
  prop_seal_stone: makeEntry('prop_seal_stone', 'PROP_SealStone', 'prop', '/assets/eidrath/props/prop_seal_stone.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 2.1, 'base'),
  prop_lantern_post: makeEntry('prop_lantern_post', 'PROP_LanternPost', 'prop', '/assets/eidrath/props/prop_lantern_post.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 2.8, 'base'),
  prop_campfire: makeEntry('prop_campfire', 'PROP_Campfire', 'prop', '/assets/eidrath/props/prop_campfire.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 0.6, 'base'),
  prop_anvil: makeEntry('prop_anvil', 'PROP_Anvil', 'prop', '/assets/eidrath/props/prop_anvil.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 0.9, 'base'),
  prop_banner: makeEntry('prop_banner', 'PROP_Banner', 'prop', '/assets/eidrath/props/prop_banner.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 3.4, 'base'),
  prop_ore_vein: makeEntry('prop_ore_vein', 'PROP_OreVein', 'prop', '/assets/eidrath/props/prop_ore_vein.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 1.1, 'base'),
  prop_frost_herb: makeEntry('prop_frost_herb', 'PROP_FrostHerb', 'prop', '/assets/eidrath/props/prop_frost_herb.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 0.5, 'base'),
  prop_barrel: makeEntry('prop_barrel', 'PROP_Barrel', 'prop', '/assets/eidrath/props/prop_barrel.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 0.95, 'base'),
  prop_crate: makeEntry('prop_crate', 'PROP_Crate', 'prop', '/assets/eidrath/props/prop_crate.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 0.85, 'base'),
  prop_signpost: makeEntry('prop_signpost', 'PROP_Signpost', 'prop', '/assets/eidrath/props/prop_signpost.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 2.4, 'base'),
  prop_tent: makeEntry('prop_tent', 'PROP_Tent', 'prop', '/assets/eidrath/props/prop_tent.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 2.1, 'base'),
  prop_cart: makeEntry('prop_cart', 'PROP_Cart', 'prop', '/assets/eidrath/props/prop_cart.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 1.2, 'base'),
  prop_brazier: makeEntry('prop_brazier', 'PROP_Brazier', 'prop', '/assets/eidrath/props/prop_brazier.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 1.3, 'base'),
  prop_altar_pedestal: makeEntry('prop_altar_pedestal', 'PROP_AltarPedestal', 'prop', '/assets/eidrath/props/prop_altar_pedestal.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 1.2, 'base'),
  prop_weapon_rack: makeEntry('prop_weapon_rack', 'PROP_WeaponRack', 'prop', '/assets/eidrath/props/prop_weapon_rack.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 1.6, 'base'),
  prop_bench: makeEntry('prop_bench', 'PROP_Bench', 'prop', '/assets/eidrath/props/prop_bench.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 0.6, 'base'),
  prop_cairn: makeEntry('prop_cairn', 'PROP_StoneCairn', 'prop', '/assets/eidrath/props/prop_cairn.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 1.5, 'base'),
  prop_fence: makeEntry('prop_fence', 'PROP_WoodFence', 'prop', '/assets/eidrath/props/prop_fence.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 1.2, 'base'),
  prop_stair_block: makeEntry('prop_stair_block', 'PROP_StoneStairs', 'prop', '/assets/eidrath/props/prop_stair_block.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 1.6, 'base'),
  prop_market_stall: makeEntry('prop_market_stall', 'PROP_MarketStall', 'prop', '/assets/eidrath/props/prop_market_stall.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 2.6, 'base'),
  prop_bone_pile: makeEntry('prop_bone_pile', 'PROP_BonePile', 'prop', '/assets/eidrath/props/prop_bone_pile.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 0.6, 'base'),
  prop_bellows: makeEntry('prop_bellows', 'PROP_ForgeBellows', 'prop', '/assets/eidrath/props/prop_bellows.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 1.1, 'base'),
  prop_log_pile: makeEntry('prop_log_pile', 'PROP_LogPile', 'prop', '/assets/eidrath/props/prop_log_pile.glb', 'art/blender/world/eidrath_frostheim_kit.blend', 0.9, 'base'),
};

export function isAssetVisualQaApproved(def: AssetDefinition): boolean {
  return (
    def.visualQaStatus === 'approved' &&
    def.inspectedInGame &&
    def.integrationStatus === 'integrated' &&
    Boolean(def.license)
  );
}

export function listManifestAssets(): AssetDefinition[] {
  return Object.values(EIDRATH_ASSET_MANIFEST);
}

const loader = new GLTFLoader();
const assetCache = new Map<string, Promise<LoadedAssetRecord>>();
const overrideAssetBuffers = new Map<string, LoadedAssetRecord>();

function configureMeshes(root: THREE.Object3D, castShadow: boolean): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name.startsWith('UCX_')) {
      mesh.visible = false;
      return;
    }
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
      mesh.frustumCulled = false;
    }
  });
}

export async function loadEidrathAsset(assetId: string): Promise<LoadedAssetRecord> {
  const override = overrideAssetBuffers.get(assetId);
  if (override) return override;

  const def = EIDRATH_ASSET_MANIFEST[assetId];
  if (!def) {
    throw new Error(`Unknown EIDRATH asset ID: ${assetId}`);
  }

  let pending = assetCache.get(assetId);
  if (!pending) {
    pending = new Promise<LoadedAssetRecord>((resolve, reject) => {
      loader.load(
        def.url,
        (gltf: GLTF) => {
          configureMeshes(gltf.scene, def.category !== 'prop' || def.id === 'prop_lantern_post' || def.id === 'prop_oath_rune_stone');
          resolve({
            definition: def,
            scene: gltf.scene,
            animations: gltf.animations ?? [],
          });
        },
        undefined,
        (err) => reject(new Error(`Failed to load ${def.url}: ${String(err)}`)),
      );
    });
    assetCache.set(assetId, pending);
    const request = pending;
    // Failed network loads must be retryable after reconnecting.
    void request.catch(() => { if (assetCache.get(assetId) === request) assetCache.delete(assetId); });
  }
  return pending;
}

export async function registerDevPreviewGlb(
  assetId: string,
  buffer: ArrayBuffer,
  category: AssetCategory = 'hero',
): Promise<LoadedAssetRecord> {
  return new Promise((resolve, reject) => {
    loader.parse(
      buffer,
      '',
      (gltf: GLTF) => {
        const baseDef =
          EIDRATH_ASSET_MANIFEST[assetId] ??
          makeEntry(assetId, assetId, category, 'memory://dev-bridge', 'memory://dev-bridge', 1.9, 'feet');
        configureMeshes(gltf.scene, true);
        const rec: LoadedAssetRecord = {
          definition: baseDef,
          scene: gltf.scene,
          animations: gltf.animations ?? [],
        };
        overrideAssetBuffers.set(assetId, { ...rec, definition: { ...rec.definition, visualQaStatus: 'pending', inspectedInGame: false, status: 'pending' } });
        resolve(overrideAssetBuffers.get(assetId)!);
      },
      (err) => reject(new Error(`Failed to parse dev GLB: ${String(err)}`)),
    );
  });
}

export async function instantiateStaticAsset(assetId: string, scale = 1.0): Promise<THREE.Group> {
  const rec = await loadEidrathAsset(assetId);
  const group = new THREE.Group();
  const clone = rec.scene.clone(true);
  clone.scale.setScalar(scale);
  configureMeshes(clone, rec.definition.category === 'world' || rec.definition.category === 'weapon');
  group.add(clone);
  group.name = `INST_${assetId}`;
  return group;
}

export async function instantiateSkinnedActor(assetId: string): Promise<InstantiatedActor> {
  const rec = await loadEidrathAsset(assetId);
  const root = new THREE.Group();
  root.name = `ACTOR_${assetId}`;

  const model = cloneSkinned(rec.scene);
  configureMeshes(model, true);
  root.add(model);

  const sockets = new Map<string, THREE.Object3D>();
  model.traverse((obj) => {
    const key = obj.name.toLowerCase();
    if (
      key === 'hand_r' ||
      key === 'hand_l' ||
      key === 'back_weapon' ||
      key === 'head' ||
      key === 'arm_r' ||
      key === 'arm_l' ||
      key === 'core'
    ) {
      sockets.set(key, obj);
    }
  });

  const clips = new Map<string, THREE.AnimationClip>();
  for (const clip of rec.animations) {
    clips.set(clip.name.toLowerCase(), clip);
  }
  const mixer = rec.animations.length > 0 ? new THREE.AnimationMixer(model) : null;

  return { root, model, mixer, clips, sockets };
}

export async function attachWeaponToSocket(
  actor: InstantiatedActor,
  weaponAssetId: string | null,
  socketName: 'hand_r' | 'hand_l' | 'back_weapon' = 'hand_r',
): Promise<THREE.Object3D | null> {
  const socket = actor.sockets.get(socketName) ?? actor.model;
  const tag = `EQUIPPED_${socketName}`;
  const prev = socket.getObjectByName(tag);
  if (prev) {
    socket.remove(prev);
  }
  if (!weaponAssetId || !EIDRATH_ASSET_MANIFEST[weaponAssetId]) {
    return null;
  }
  const weaponGroup = await instantiateStaticAsset(weaponAssetId);
  weaponGroup.name = tag;
  if (socketName === 'hand_r') {
    weaponGroup.position.set(0, 0.04, 0);
    weaponGroup.rotation.set(Math.PI * 0.42, 0, 0);
  } else if (socketName === 'hand_l') {
    weaponGroup.position.set(0.06, 0.04, 0.02);
    weaponGroup.rotation.set(0, Math.PI * 0.5, 0);
  } else if (socketName === 'back_weapon') {
    weaponGroup.position.set(0, 0, -0.05);
    weaponGroup.rotation.set(0, 0, 0.45);
  }
  socket.add(weaponGroup);
  return weaponGroup;
}

export function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (mat && typeof mat.dispose === 'function') {
        mat.dispose();
      }
    }
  });
}

export function clearAssetCache(): void {
  assetCache.clear();
  overrideAssetBuffers.clear();
}
