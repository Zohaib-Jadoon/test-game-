import * as THREE from 'three';
import {
  ATTACKS,
  DIALOGUES,
  ENEMY_ARCHETYPES,
  FROSTHEIM_LANDMARKS,
  ITEMS,
} from '../../content/eidrathContent';
import {
  attachWeaponToSocket,
  disposeObjectTree,
  instantiateSkinnedActor,
  instantiateStaticAsset,
  registerDevPreviewGlb,
  type InstantiatedActor,
} from '../assets/manifest';
import { EidrathAudio } from '../audio/eidrathAudio';
import {
  advanceCombatTimeline,
  canRegisterHitOnTarget,
  computeDamageAmount,
  computeStealthAwarenessDelta,
  createCombatTimeline,
  DIFFICULTY_TUNING,
  getMountainWardenDamageTakenMultiplier,
  getMountainWardenPhase,
  releaseGuardAction,
  resolveDefenderHit,
  startAttackAction,
  startDodgeAction,
  startGuardAction,
  type CombatActorTimeline,
} from '../combat/combatRules';
import {
  addInventoryItem,
  applyDialogueChoice,
  buyFromMerchant,
  computeDerivedStats,
  craftOrUpgradeRecipe,
  dropInventoryItem,
  emitQuestEvent,
  equipInventoryItem,
  getItemQuantity,
  getTrackedQuestObjective,
  grantXp,
  resetAllSkills,
  sellToMerchant,
  startQuest,
  syncPlayerCaps,
  unlockSkillNode,
  useConsumableItem,
  xpRequiredForLevel,
} from '../rpg/rpgLogic';
import {
  createDefaultSettings,
  createNewGameSave,
  writeSaveSlot,
  type SaveSlotId,
} from '../save/saveSystem';
import type {
  ActiveInteractPrompt,
  AssetCategory,
  BossHudInfo,
  CompanionCommand,
  EnemyArchetypeId,
  EnemyRadarBlip,
  GameSettings,
  HudSnapshot,
  SaveGame,
} from '../types';
import {
  createFrostheimTerrainMesh,
  getActiveChunkKeys,
  getChunkKey,
  getTerrainHeight,
  getTerrainSlopeDeg,
  isInsidePlayableBounds,
  MAX_WALKABLE_SLOPE_DEG,
} from '../world/frostheimTerrain';

interface ColliderCircle {
  id: string;
  x: number;
  z: number;
  radius: number;
  active: boolean;
}

interface WorldInteractable {
  id: string;
  kind: ActiveInteractPrompt['kind'];
  label: string;
  sublabel?: string;
  x: number;
  z: number;
  radius: number;
  enabled: boolean;
  mesh?: THREE.Object3D;
  dialogueNodeId?: string;
  chestItemIds?: Array<{ itemId: string; quantity: number }>;
  loreId?: string;
  pickupItemId?: string;
  runeIndex?: number;
}

interface NpcRuntime {
  id: string;
  name: string;
  assetId: string;
  dialogueId: string;
  homeX: number;
  homeZ: number;
  yaw: number;
  actor: InstantiatedActor | null;
  currentClip: string;
}

type EnemyAiState =
  | 'patrol'
  | 'suspicious'
  | 'investigate'
  | 'engage'
  | 'telegraph'
  | 'attack'
  | 'recover'
  | 'stagger'
  | 'dead';

interface EnemyRuntime {
  id: string;
  archetypeId: EnemyArchetypeId;
  name: string;
  x: number;
  y: number;
  z: number;
  homeX: number;
  homeZ: number;
  yaw: number;
  hp: number;
  maxHp: number;
  poise: number;
  maxPoise: number;
  aiState: EnemyAiState;
  stateTimerMs: number;
  attackCooldownMs: number;
  awareness: number;
  currentAttackId: string | null;
  hitPlayerThisSwing: boolean;
  actor: InstantiatedActor | null;
  currentClip: string;
  isBoss: boolean;
  bossPhase: 1 | 2 | 3;
  isAdd?: boolean;
  chunkKey: string;
}

interface ProjectileRuntime {
  id: string;
  fromPlayer: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  damage: number;
  poiseDamage: number;
  ttlSec: number;
  mesh: THREE.Mesh;
}

interface FissureHazard {
  x: number;
  z: number;
  radius: number;
  warnRemainingSec: number;
  erupted: boolean;
  ttlSec: number;
  mesh: THREE.Mesh;
}

interface SealStoneRuntime {
  id: string;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  mesh: THREE.Object3D | null;
}

interface SlashVfx {
  mesh: THREE.Mesh;
  ttlSec: number;
  maxTtl: number;
}

export interface EidrathEngineCallbacks {
  onHudUpdate: (snapshot: HudSnapshot) => void;
  onDialogueOpen: (nodeId: string | null) => void;
  onSaveChanged: (save: SaveGame) => void;
  onOpenSpecialUi?: (ui: 'crafting' | 'merchant') => void;
}

const RUNE_NAMES = ['Frost', 'Iron', 'Breath'] as const;
const RUNE_COLORS = [0x6d9cb6, 0x9c7848, 0xd9d1be] as const;

export class EidrathEngine {
  private container: HTMLElement;
  private callbacks: EidrathEngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private audio = new EidrathAudio();

  private mode: HudSnapshot['mode'] = 'title';
  private save: SaveGame = createNewGameSave('autosave');
  private settings: GameSettings = createDefaultSettings();

  private rafId: number | null = null;
  private disposed = false;
  private lastFrameTs = 0;
  private hudThrottleAccum = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private currentFps = 60;
  private hitstopSec = 0;

  // Groups
  private titleGroup = new THREE.Group();
  private worldGroup = new THREE.Group();
  private chunkGroups = new Map<string, THREE.Group>();
  private snowPoints: THREE.Points | null = null;
  private sunLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private playerLight!: THREE.PointLight;

  // Player state
  private kaelen: InstantiatedActor | null = null;
  private kaelenClip = '';
  private lyra: InstantiatedActor | null = null;
  private lyraPos = new THREE.Vector3(-120, 0, 122);
  private lyraYaw = 0;
  private lyraClip = '';
  private lyraAttackCd = 0;
  private lyraHp = 100;

  private playerVelX = 0;
  private playerVelY = 0;
  private playerVelZ = 0;
  private playerGrounded = true;
  private isSneaking = false;
  private footstepAccum = 0;
  private staminaRegenDelaySec = 0;
  private comboStep = 0;
  private comboResetSec = 0;
  private ascensionSec = 0;
  private abilityCooldowns: [number, number, number, number] = [0, 0, 0, 0];
  private timeline: CombatActorTimeline = createCombatTimeline();

  // Camera
  private camYaw = -Math.PI * 0.25;
  private camPitch = 0.28;
  private camShakeSec = 0;
  private camShakeAmp = 0;
  private lockedEnemyId: string | null = null;
  private pointerLocked = false;
  private rightMouseDrag = false;
  private lastDragX = 0;
  private lastDragY = 0;

  // Input state
  private keys = new Set<string>();
  private touchMoveX = 0;
  private touchMoveY = 0;

  // World entities
  private colliders: ColliderCircle[] = [];
  private interactables: WorldInteractable[] = [];
  private npcs: NpcRuntime[] = [];
  private enemies: EnemyRuntime[] = [];
  private projectiles: ProjectileRuntime[] = [];
  private fissures: FissureHazard[] = [];
  private sealStones: SealStoneRuntime[] = [];
  private vfxList: SlashVfx[] = [];
  private runeStates: [number, number, number] = [1, 2, 0]; // Target solution: [0, 1, 2]
  private runeVisuals: THREE.PointLight[] = [];
  private keepGateBarrierMesh: THREE.Mesh | null = null;
  private shortcutPortalMesh: THREE.Object3D | null = null;
  private worldInitialized = false;

  // UI feedback timers
  private landmarkBanner = '';
  private landmarkBannerSec = 0;
  private notificationText = '';
  private notificationSec = 0;
  private subtitleText = '';
  private subtitleSec = 0;
  private parryFlashSec = 0;
  private damageFlashSec = 0;
  private activeDialogueNodeId: string | null = null;
  private activeBossId: string | null = null;

  constructor(container: HTMLElement, callbacks: EidrathEngineCallbacks, initialSettings?: GameSettings) {
    this.container = container;
    this.callbacks = callbacks;
    if (initialSettings) {
      this.settings = initialSettings;
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#27333e');
    this.scene.fog = new THREE.FogExp2('#2e3c48', 0.0068);

    const w = Math.max(320, container.clientWidth || window.innerWidth);
    const h = Math.max(240, container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(58, w / h, 0.2, 420);

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.settings.quality !== 'low',
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.28;
    this.renderer.shadowMap.enabled = this.settings.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyQualityPreset(this.settings.quality);

    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    this.setupLighting();
    this.setupSnowParticles();
    this.scene.add(this.titleGroup);
    this.scene.add(this.worldGroup);
    this.worldGroup.visible = false;

    void this.buildTitleBackdrop();
    this.bindInputEvents();

    this.lastFrameTs = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  private setupLighting(): void {
    this.hemiLight = new THREE.HemisphereLight(0xd2e4f5, 0x4b5661, 1.38);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff6ea, 1.85);
    this.sunLight.position.set(62, 92, 68);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 220;
    const d = 55;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.playerLight = new THREE.PointLight(0x88b8d4, 1.35, 16);
    this.scene.add(this.playerLight);
  }

  private setupSnowParticles(): void {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 90;
      positions[i * 3 + 1] = Math.random() * 28;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xd9e4ee,
      size: 0.16,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    this.snowPoints = new THREE.Points(geo, mat);
    this.snowPoints.frustumCulled = false;
    this.scene.add(this.snowPoints);
  }

  private async buildTitleBackdrop(): Promise<void> {
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(36, 40).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#8e9ca8', roughness: 0.9, metalness: 0.04 }),
    );
    ground.receiveShadow = true;
    this.titleGroup.add(ground);

    const shrineLight = new THREE.PointLight(0x6d9cb6, 5.5, 16);
    shrineLight.position.set(0, 2.4, 0.5);
    this.titleGroup.add(shrineLight);

    try {
      const shrine = await instantiateStaticAsset('env_oath_shrine', 1.15);
      shrine.position.set(0, 0, 0);
      this.titleGroup.add(shrine);

      const pineOffsets: Array<[number, number, number]> = [
        [-6.5, -4.5, 1.1],
        [7.2, -5.2, 1.0],
        [-9.0, 2.5, 1.2],
        [8.5, 3.0, 0.95],
        [-3.2, -8.8, 1.3],
        [4.0, -9.2, 1.15],
      ];
      for (const [px, pz, sc] of pineOffsets) {
        const pine = await instantiateStaticAsset('env_frost_pine', sc);
        pine.position.set(px, 0, pz);
        this.titleGroup.add(pine);
      }

      const lantern = await instantiateStaticAsset('prop_lantern_post', 1.0);
      lantern.position.set(-2.6, 0, 2.6);
      this.titleGroup.add(lantern);

      const warmLight = new THREE.PointLight(0xd99b52, 3.2, 11);
      warmLight.position.set(-2.6, 2.3, 2.6);
      this.titleGroup.add(warmLight);

      const sword = await instantiateStaticAsset('wpn_oathbreaker', 1.1);
      sword.position.set(1.25, 0.95, 1.1);
      sword.rotation.set(Math.PI + 0.14, 0.4, 0.08);
      this.titleGroup.add(sword);
    } catch {
      // Fallback monolith if GLB fetch failed during offline cold boot
      const mono = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.85, 4.2, 6),
        new THREE.MeshStandardMaterial({ color: '#3b434b', roughness: 0.85 }),
      );
      mono.position.set(0, 2.1, 0);
      this.titleGroup.add(mono);
    }
  }

  public applyQualityPreset(preset: GameSettings['quality']): void {
    const dprCap = preset === 'low' ? 1.0 : preset === 'medium' ? 1.35 : Math.min(2, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(dprCap);
    this.renderer.shadowMap.enabled = preset !== 'low';
    if (this.sunLight) {
      this.sunLight.castShadow = preset !== 'low';
      const sz = preset === 'high' ? 2048 : 1024;
      if (this.sunLight.shadow.mapSize.x !== sz) {
        this.sunLight.shadow.mapSize.set(sz, sz);
        this.sunLight.shadow.map?.dispose();
        this.sunLight.shadow.map = null;
      }
    }
  }

  public setSettings(next: GameSettings): void {
    this.settings = next;
    this.applyQualityPreset(next.quality);
    this.audio.setSettings(next.masterVolume, next.muted);
  }

  public getSaveSnapshot(): SaveGame {
    return JSON.parse(JSON.stringify(this.save)) as SaveGame;
  }

  public async startNewGame(slotId: SaveSlotId = 'autosave'): Promise<void> {
    this.audio.unlock();
    const fresh = createNewGameSave(slotId);
    fresh.player.y = getTerrainHeight(fresh.player.x, fresh.player.z);
    await this.loadSave(fresh);
    this.showBanner('Oathgrave Tomb — Frostheim');
    this.showSubtitle('Centuries after the betrayal, Kaelen wakes beneath the snow. Claim your blade from the altar.');
  }

  public async loadSave(save: SaveGame): Promise<void> {
    this.audio.unlock();
    this.save = JSON.parse(JSON.stringify(save)) as SaveGame;
    syncPlayerCaps(this.save);
    this.save.player.y = getTerrainHeight(this.save.player.x, this.save.player.z);
    // Position over-the-shoulder camera BEHIND Kaelen so Kaelen faces forward into the scene
    this.camYaw = this.save.player.yaw + Math.PI;
    this.timeline = createCombatTimeline();
    this.ascensionSec = 0;
    this.lockedEnemyId = null;
    this.activeDialogueNodeId = null;
    this.callbacks.onDialogueOpen(null);

    if (!this.worldInitialized) {
      await this.buildFrostheimWorld();
      this.worldInitialized = true;
    }

    this.reconcileWorldWithSave();
    await this.refreshPlayerWeapons();

    this.titleGroup.visible = false;
    this.worldGroup.visible = true;
    this.mode = 'playing';
    this.callbacks.onSaveChanged(this.getSaveSnapshot());
    this.emitHudSnapshot();
  }

  public returnToTitle(): void {
    this.exitPointerLock();
    this.mode = 'title';
    this.activeDialogueNodeId = null;
    this.callbacks.onDialogueOpen(null);
    this.worldGroup.visible = false;
    this.titleGroup.visible = true;
    this.keys.clear();
    this.emitHudSnapshot();
  }

  public setPaused(paused: boolean, menuOpen = false): void {
    if (this.mode === 'title' || this.mode === 'dead') return;
    if (paused) {
      this.exitPointerLock();
      this.keys.clear();
      this.mode = menuOpen ? 'menu' : 'paused';
    } else {
      this.mode = this.activeDialogueNodeId ? 'dialogue' : 'playing';
    }
    this.emitHudSnapshot();
  }

  public manualSave(slotId: SaveSlotId): { ok: boolean; message: string } {
    if (this.isInCombat() && this.mode === 'playing') {
      return { ok: false, message: 'Cannot manually save while enemies are actively engaging you.' };
    }
    this.save.slotId = slotId;
    this.save.revision += 1;
    this.save.updatedAt = new Date().toISOString();
    writeSaveSlot(slotId, this.save);
    this.callbacks.onSaveChanged(this.getSaveSnapshot());
    this.notify(`Saved to ${slotId.replace('_', ' ').toUpperCase()}.`);
    return { ok: true, message: `Game saved to ${slotId}.` };
  }

  private autosaveSafe(): void {
    if (this.timeline.state === 'dead') return;
    this.save.revision += 1;
    this.save.updatedAt = new Date().toISOString();
    writeSaveSlot('autosave', this.save);
    this.callbacks.onSaveChanged(this.getSaveSnapshot());
  }

  private addToChunk(obj: THREE.Object3D, x: number, z: number): void {
    const key = getChunkKey(x, z);
    let grp = this.chunkGroups.get(key);
    if (!grp) {
      grp = new THREE.Group();
      grp.name = `CHUNK_${key}`;
      this.chunkGroups.set(key, grp);
      this.worldGroup.add(grp);
    }
    grp.add(obj);
  }

  private async placeWorldPiece(
    assetId: string,
    x: number,
    z: number,
    rotY = 0,
    scale = 1,
    colliderRadius = 0,
    colliderId?: string,
  ): Promise<THREE.Object3D> {
    const y = getTerrainHeight(x, z);
    const group = await instantiateStaticAsset(assetId, scale);
    group.position.set(x, y, z);
    group.rotation.y = rotY;
    this.addToChunk(group, x, z);
    if (colliderRadius > 0) {
      this.colliders.push({
        id: colliderId ?? `${assetId}_${Math.round(x)}_${Math.round(z)}`,
        x,
        z,
        radius: colliderRadius,
        active: true,
      });
    }
    return group;
  }

  private async buildFrostheimWorld(): Promise<void> {
    // 1. Continuous snowy Frostheim terrain + Frozen Reach lake
    const { terrain, frozenLake } = createFrostheimTerrainMesh(140);
    this.worldGroup.add(terrain);
    this.worldGroup.add(frozenLake);

    // 2. Load hero Kaelen + companion Lyra
    this.kaelen = await instantiateSkinnedActor('chr_kaelen');
    this.worldGroup.add(this.kaelen.root);
    this.playActorClip(this.kaelen, 'Idle', true);
    this.kaelenClip = 'Idle';

    this.lyra = await instantiateSkinnedActor('chr_lyra');
    this.lyraPos.set(-120, getTerrainHeight(-120, 122), 122);
    this.lyra.root.position.copy(this.lyraPos);
    this.worldGroup.add(this.lyra.root);
    this.playActorClip(this.lyra, 'Idle', true);
    this.lyraClip = 'Idle';

    // 3. Handcrafted Frostheim Landmarks (all 10 modular Blender buildings + 25 props)
    // 3a. Oathgrave Tomb (-145, 145)
    await this.placeWorldPiece('env_oathgrave_tomb', -149, 149, -Math.PI * 0.25, 1.35, 3.2);
    await this.placeWorldPiece('prop_brazier', -141, 142, 0, 1.0, 0.6);
    await this.placeWorldPiece('prop_cairn', -131, 131, 0.5, 1.0, 0.7);
    const altar = await this.placeWorldPiece('prop_altar_pedestal', -138, 138, -Math.PI * 0.25, 1.0, 0.75);
    const altarSword = await instantiateStaticAsset('wpn_iron_sword', 1.0);
    altarSword.name = 'ALTAR_SWORD';
    altarSword.position.set(0, 1.12, 0);
    altarSword.rotation.set(Math.PI * 0.5, 0.3, 0);
    altar.add(altarSword);
    this.interactables.push({
      id: 'pickup_oath_blade',
      kind: 'pickup',
      label: 'Claim Weathered Oath Blade',
      sublabel: 'Kaelen’s notched infantry sword',
      x: -138,
      z: 138,
      radius: 3.2,
      enabled: true,
      mesh: altarSword,
      pickupItemId: 'wpn_iron_sword',
    });

    // 3b. Ashen Span Bridge (-72, 92)
    await this.placeWorldPiece('env_ruined_bridge', -72, 92, -Math.PI * 0.26, 1.45, 0);
    await this.placeWorldPiece('prop_signpost', -56, 74, 0.4, 1.0, 0.4);
    await this.placeWorldPiece('prop_lantern_post', -62, 82, 0, 1.0, 0.35);

    // 3c. Ravenhold Sanctuary Village (-10, 36)
    await this.placeWorldPiece('env_nordic_cabin', -16, 22, 0.3, 1.25, 3.8);
    await this.placeWorldPiece('env_nordic_cabin', 4, 26, -0.45, 1.25, 3.8);
    await this.placeWorldPiece('env_nordic_cabin', 6, 48, 2.6, 1.25, 3.8);
    await this.placeWorldPiece('env_borin_forge', -24, 38, 1.45, 1.2, 3.2);
    await this.placeWorldPiece('prop_anvil', -20, 37, 0.3, 1.0, 0.6);
    await this.placeWorldPiece('prop_bellows', -22, 41, 0.8, 1.0, 0.6);
    await this.placeWorldPiece('prop_weapon_rack', -18, 41, 0.2, 1.0, 0.6);
    await this.placeWorldPiece('prop_market_stall', -1, 41, -2.5, 1.1, 1.6);
    await this.placeWorldPiece('prop_campfire', -10, 36, 0, 1.2, 0.8);
    await this.placeWorldPiece('prop_bench', -8, 39, 0.2, 1.0, 0.5);
    await this.placeWorldPiece('prop_cart', -15, 46, 0.7, 1.0, 1.2);
    await this.placeWorldPiece('prop_barrel', -3, 39, 0, 1.0, 0.5);
    await this.placeWorldPiece('prop_crate', -2, 38, 0.4, 1.0, 0.5);
    await this.placeWorldPiece('prop_banner', -10, 26, 0, 1.0, 0.3);
    await this.placeWorldPiece('prop_banner', -10, 46, Math.PI, 1.0, 0.3);
    await this.placeWorldPiece('prop_fence', -28, 30, 0.2, 1.2, 0);
    await this.placeWorldPiece('prop_lantern_post', -10, 31, 0, 1.0, 0.35);
    await this.placeWorldPiece('prop_lantern_post', -17, 36, 0, 1.0, 0.35);

    const villageWarm = new THREE.PointLight(0xe69f4c, 6.5, 32);
    villageWarm.position.set(-10, getTerrainHeight(-10, 36) + 2.8, 36);
    this.worldGroup.add(villageWarm);

    // Village interactables: Campfire rest/checkpoint, Forge, Merchant Stall
    this.interactables.push(
      {
        id: 'rest_ravenhold_campfire',
        kind: 'shrine',
        label: 'Rest at Ravenhold Hearth',
        sublabel: 'Restore HP/Mana & set safe checkpoint',
        x: -10,
        z: 36,
        radius: 3.4,
        enabled: true,
      },
      {
        id: 'use_borin_forge',
        kind: 'forge',
        label: "Use Borin's Forge",
        sublabel: 'Craft weapons, potions & temper Oathbreaker',
        x: -20,
        z: 37,
        radius: 3.2,
        enabled: true,
      },
      {
        id: 'trade_ravenhold_stall',
        kind: 'npc',
        label: 'Ravenhold Provisions',
        sublabel: 'Buy & sell gear and Frostheim supplies',
        x: -1,
        z: 41,
        radius: 3.4,
        enabled: true,
      },
    );

    // 3d. Old Oath-Smithy (-96, -12) — holds Oathbreaker chest + Frost Iron veins
    await this.placeWorldPiece('env_borin_forge', -98, -14, 0.6, 1.25, 3.0);
    await this.placeWorldPiece('prop_ore_vein', -91, -8, 0.3, 1.15, 0.7);
    await this.placeWorldPiece('prop_ore_vein', -101, -6, 1.4, 1.1, 0.7);
    const oathChest = await this.placeWorldPiece('prop_chest', -96, -12, 0.6, 1.15, 0.7);
    this.interactables.push(
      {
        id: 'chest_oathbreaker',
        kind: 'chest',
        label: 'Open Ancient Forge Chest',
        sublabel: 'Recover Oathbreaker & Frost Iron Ore',
        x: -96,
        z: -12,
        radius: 3.2,
        enabled: true,
        mesh: oathChest,
        chestItemIds: [
          { itemId: 'wpn_oathbreaker', quantity: 1 },
          { itemId: 'mat_frost_iron', quantity: 3 },
        ],
      },
      {
        id: 'harvest_ore_smithy',
        kind: 'pickup',
        label: 'Mine Frost Iron Vein',
        sublabel: '+2 Frost Iron Ore',
        x: -91,
        z: -8,
        radius: 2.8,
        enabled: true,
        pickupItemId: 'mat_frost_iron',
      },
    );

    // 3e. Whispering Pine Hunter Camp (84, 18)
    await this.placeWorldPiece('prop_tent', 82, 16, -0.8, 1.2, 1.6);
    await this.placeWorldPiece('prop_campfire', 85, 19, 0, 1.0, 0.6);
    await this.placeWorldPiece('prop_log_pile', 89, 21, 0.4, 1.0, 0.8);
    await this.placeWorldPiece('prop_bone_pile', 79, 23, 0, 1.0, 0);
    await this.placeWorldPiece('prop_frost_herb', 76, 14, 0, 1.2, 0);
    await this.placeWorldPiece('prop_frost_herb', 92, 11, 0.8, 1.2, 0);
    this.interactables.push({
      id: 'harvest_frost_herb_camp',
      kind: 'pickup',
      label: 'Gather Frostleaf Herb',
      sublabel: '+2 Frostleaf Herbs for alchemy',
      x: 76,
      z: 14,
      radius: 2.8,
      enabled: true,
      pickupItemId: 'mat_frost_herb',
    });

    // 3f. Frozen Reach Cavern (112, -74) — 3-Rune Rotating Oath-Stone Puzzle + Vault Chest
    await this.placeWorldPiece('env_ice_cave_arch', 112, -72, 0, 1.5, 0);
    await this.placeWorldPiece('env_rock_cliff', 102, -78, 0.4, 1.6, 3.2);
    await this.placeWorldPiece('env_rock_cliff', 122, -78, -0.5, 1.6, 3.2);
    await this.placeWorldPiece('env_rock_cliff', 112, -91, 0.1, 1.9, 4.0);
    const runeCoords: Array<[number, number]> = [
      [107, -78],
      [112, -78],
      [117, -78],
    ];
    for (let i = 0; i < 3; i++) {
      const [rx, rz] = runeCoords[i];
      const stone = await this.placeWorldPiece('prop_oath_rune_stone', rx, rz, 0, 1.05, 0.85);
      const pl = new THREE.PointLight(RUNE_COLORS[this.runeStates[i]], 2.8, 8);
      pl.position.set(rx, getTerrainHeight(rx, rz) + 1.8, rz);
      this.worldGroup.add(pl);
      this.runeVisuals.push(pl);
      this.interactables.push({
        id: `rune_stone_${i}`,
        kind: 'puzzle',
        label: `Rotate Oath Stone ${['I', 'II', 'III'][i]} (${RUNE_NAMES[this.runeStates[i]]})`,
        sublabel: 'Mural clue: I Frost · II Iron · III Breath',
        x: rx,
        z: rz,
        radius: 3.1,
        enabled: true,
        mesh: stone,
        runeIndex: i,
      });
    }
    const vaultChest = await this.placeWorldPiece('prop_chest', 112, -85, 0, 1.2, 0.8);
    this.interactables.push({
      id: 'chest_frozen_vault',
      kind: 'chest',
      label: 'Open Frozen Covenant Vault',
      sublabel: 'Locked until the Three Oath Stones align',
      x: 112,
      z: -85,
      radius: 3.2,
      enabled: true,
      mesh: vaultChest,
      chestItemIds: [
        { itemId: 'qst_covenant_tablet', quantity: 1 },
        { itemId: 'wpn_frost_axe', quantity: 1 },
      ],
      loreId: 'lore_covenant_truth',
    });

    // 3g. Silent Oath Shrine (-124, -88) — Optional discovery & Worldshatter chest
    await this.placeWorldPiece('env_oath_shrine', -124, -88, 0.4, 1.35, 1.8);
    const shrineChest = await this.placeWorldPiece('prop_chest', -120, -86, -0.5, 1.1, 0.7);
    this.interactables.push({
      id: 'chest_shrine_worldshatter',
      kind: 'chest',
      label: 'Open Silent Shrine Reliquary',
      sublabel: 'Ancient Frostheim warhammer',
      x: -120,
      z: -86,
      radius: 3.1,
      enabled: true,
      mesh: shrineChest,
      chestItemIds: [
        { itemId: 'wpn_worldshatter', quantity: 1 },
        { itemId: 'mat_frost_iron', quantity: 2 },
      ],
    });

    // 3h. Warden's Keep Dungeon & Boss Courtyard (6, -116 to 6, -146)
    await this.placeWorldPiece('env_keep_gate', 6, -122, 0, 1.65, 0);
    await this.placeWorldPiece('prop_stair_block', 6, -110, 0, 1.5, 0);
    await this.placeWorldPiece('prop_brazier', -1, -118, 0, 1.2, 0.6);
    await this.placeWorldPiece('prop_brazier', 13, -118, 0, 1.2, 0.6);
    // Keep Seal Pedestal right before outer gate (puzzle_keep_gate)
    await this.placeWorldPiece('prop_altar_pedestal', 11, -116, 0, 1.05, 0.75);
    this.interactables.push(
      {
        id: 'pedestal_keep_seal',
        kind: 'puzzle',
        label: 'Channel Oath into Keep Seal Pedestal',
        sublabel: 'Unbars the gate to the Mountain Warden’s Courtyard',
        x: 11,
        z: -116,
        radius: 3.4,
        enabled: true,
      },
      {
        id: 'checkpoint_keep_approach',
        kind: 'shrine',
        label: 'Kindle Keep Checkpoint Brazier',
        sublabel: 'Safe respawn point before facing the Mountain Warden',
        x: -1,
        z: -118,
        radius: 3.4,
        enabled: true,
      },
    );

    // Translucent oath-blue seal barrier across gate until puzzle_keep_gate is solved
    const gateY = getTerrainHeight(6, -122);
    this.keepGateBarrierMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 6.2),
      new THREE.MeshBasicMaterial({
        color: 0x6d9cb6,
        transparent: true,
        opacity: 0.42,
        side: THREE.DoubleSide,
      }),
    );
    this.keepGateBarrierMesh.position.set(6, gateY + 3.2, -122);
    this.worldGroup.add(this.keepGateBarrierMesh);
    this.colliders.push({
      id: 'col_keep_gate_barrier',
      x: 6,
      z: -122,
      radius: 4.0,
      active: true,
    });

    // Circular broken keep courtyard walls around (6, -146)
    const wallRingCount = 10;
    for (let i = 0; i < wallRingCount; i++) {
      const ang = (i / wallRingCount) * Math.PI * 2;
      // Leave southern gate entrance open (around +Z => sin(ang) > 0.75)
      if (Math.sin(ang) > 0.75) continue;
      const wx = 6 + Math.cos(ang) * 23;
      const wz = -146 + Math.sin(ang) * 23;
      await this.placeWorldPiece('env_keep_wall', wx, wz, -ang + Math.PI / 2, 1.35, 3.2);
    }

    // Two destructible Phase-2 Seal Stones inside the Warden courtyard
    const sealCoords: Array<[number, number]> = [
      [-8, -146],
      [20, -146],
    ];
    for (let i = 0; i < sealCoords.length; i++) {
      const [sx, sz] = sealCoords[i];
      const mesh = await this.placeWorldPiece('prop_seal_stone', sx, sz, 0, 1.25, 0.9);
      this.sealStones.push({
        id: `seal_stone_${i}`,
        x: sx,
        z: sz,
        hp: 70,
        maxHp: 70,
        destroyed: false,
        mesh,
      });
    }

    // Return Shortcut Oath-Gate inside Keep Courtyard (unlocks when Mountain Warden falls)
    this.shortcutPortalMesh = await this.placeWorldPiece('env_oath_shrine', 20, -134, -0.6, 0.85, 1.0);
    this.shortcutPortalMesh.visible = false;
    this.interactables.push({
      id: 'shortcut_keep_to_ravenhold',
      kind: 'shortcut',
      label: 'Take Keep Shortcut to Ravenhold',
      sublabel: 'Unlocked mountain oath-way back to village',
      x: 20,
      z: -134,
      radius: 3.6,
      enabled: false,
    });

    // 4. Populate Frostheim pine forest & perimeter cliffs (seeded deterministic layout)
    let seed = 4291;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const isClearForTree = (tx: number, tz: number) => {
      if (Math.hypot(tx, tz) > 205) return false;
      for (const lm of FROSTHEIM_LANDMARKS) {
        if (Math.hypot(tx - lm.x, tz - lm.z) < lm.discoverRadius + 5) return false;
      }
      if (Math.hypot(tx - 96, tz + 58) < 34) return false; // Frozen lake
      if (Math.hypot(tx - 6, tz + 146) < 34) return false; // Boss courtyard
      return getTerrainSlopeDeg(tx, tz) < 32;
    };

    for (let i = 0; i < 68; i++) {
      const tx = (rand() - 0.5) * 370;
      const tz = (rand() - 0.5) * 370;
      if (!isClearForTree(tx, tz)) continue;
      const sc = 0.85 + rand() * 0.55;
      await this.placeWorldPiece('env_frost_pine', tx, tz, rand() * Math.PI * 2, sc, 0.75 * sc);
    }

    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2;
      const r = 198 + (i % 3) * 8;
      await this.placeWorldPiece('env_rock_cliff', Math.cos(ang) * r, Math.sin(ang) * r, ang, 2.8, 0);
    }

    // 5. Spawn Named NPCs (real Blender rigged actors)
    const npcConfigs: Array<{
      id: string;
      name: string;
      assetId: string;
      dialogueId: string;
      x: number;
      z: number;
      yaw: number;
    }> = [
      { id: 'npc_edda', name: 'Captain Edda', assetId: 'npc_edda', dialogueId: 'dlg_edda_village', x: -6, z: 31, yaw: -0.4 },
      { id: 'npc_borin', name: 'Borin Ironhand', assetId: 'npc_borin', dialogueId: 'dlg_borin_forge', x: -21, z: 38, yaw: 1.4 },
      { id: 'npc_halvar', name: 'Halvar the Scout', assetId: 'npc_villager', dialogueId: 'dlg_halvar_camp', x: 88, z: 15, yaw: -2.1 },
      { id: 'npc_trader', name: 'Torvald (Merchant)', assetId: 'npc_villager', dialogueId: 'dlg_edda_village', x: -1, z: 42.6, yaw: Math.PI },
    ];
    for (const cfg of npcConfigs) {
      const actor = await instantiateSkinnedActor(cfg.assetId);
      const y = getTerrainHeight(cfg.x, cfg.z);
      actor.root.position.set(cfg.x, y, cfg.z);
      actor.root.rotation.y = cfg.yaw;
      this.playActorClip(actor, 'Idle', true);
      this.addToChunk(actor.root, cfg.x, cfg.z);
      this.npcs.push({
        id: cfg.id,
        name: cfg.name,
        assetId: cfg.assetId,
        dialogueId: cfg.dialogueId,
        homeX: cfg.x,
        homeZ: cfg.z,
        yaw: cfg.yaw,
        actor,
        currentClip: 'Idle',
      });
      if (cfg.id !== 'npc_trader') {
        this.interactables.push({
          id: `talk_${cfg.id}`,
          kind: 'npc',
          label: `Speak with ${cfg.name}`,
          x: cfg.x,
          z: cfg.z,
          radius: 3.4,
          enabled: true,
          dialogueNodeId: cfg.dialogueId,
        });
      }
    }

    // Add Lyra's interaction trigger before recruitment
    this.interactables.push({
      id: 'talk_npc_lyra',
      kind: 'npc',
      label: 'Speak with Lyra',
      sublabel: 'Silver-haired Oracle of the Covenant',
      x: -120,
      z: 122,
      radius: 3.6,
      enabled: true,
      dialogueNodeId: 'dlg_lyra_intro',
    });

    // 6. Spawn Frostheim Enemies & The Mountain Warden Boss (all 7 archetypes!)
    const spawns: Array<{ id: string; archetypeId: EnemyArchetypeId; x: number; z: number }> = [
      // Bridge & road outriders
      { id: 'enm_bridge_sw1', archetypeId: 'hollow_swordsman', x: -64, z: 86 },
      { id: 'enm_bridge_sw2', archetypeId: 'hollow_swordsman', x: -54, z: 74 },
      // Old Oath-Smithy guardians
      { id: 'enm_smithy_kn1', archetypeId: 'hollow_knight', x: -91, z: -15 },
      { id: 'enm_smithy_sw1', archetypeId: 'hollow_swordsman', x: -102, z: -16 },
      // Whispering Pine Forest wolves & bandits
      { id: 'enm_wolf_1', archetypeId: 'frost_wolf', x: 74, z: 22 },
      { id: 'enm_wolf_2', archetypeId: 'frost_wolf', x: 82, z: 26 },
      { id: 'enm_wolf_3', archetypeId: 'frost_wolf', x: 92, z: 24 },
      { id: 'enm_bandit_1', archetypeId: 'bandit', x: 64, z: 4 },
      { id: 'enm_bandit_2', archetypeId: 'bandit', x: 74, z: -8 },
      // Frozen Reach Cavern guardians
      { id: 'enm_ice_arch1', archetypeId: 'hollow_archer', x: 106, z: -66 },
      { id: 'enm_ice_kn1', archetypeId: 'hollow_knight', x: 117, z: -66 },
      // Silent Oath Shrine Troll
      { id: 'enm_shrine_troll', archetypeId: 'frost_troll', x: -116, z: -82 },
      // Warden's Keep outer approach gauntlet
      { id: 'enm_keep_arch1', archetypeId: 'hollow_archer', x: -2, z: -98 },
      { id: 'enm_keep_sw1', archetypeId: 'hollow_swordsman', x: 12, z: -96 },
      { id: 'enm_keep_kn1', archetypeId: 'hollow_knight', x: 6, z: -106 },
      // THE MOUNTAIN WARDEN BOSS inside Keep Courtyard
      { id: 'boss_mountain_warden', archetypeId: 'mountain_warden', x: 6, z: -150 },
    ];

    for (const sp of spawns) {
      await this.spawnEnemy(sp.id, sp.archetypeId, sp.x, sp.z);
    }
  }

  private async spawnEnemy(
    id: string,
    archetypeId: EnemyArchetypeId,
    x: number,
    z: number,
    isAdd = false,
  ): Promise<EnemyRuntime> {
    const def = ENEMY_ARCHETYPES[archetypeId];
    const actor = await instantiateSkinnedActor(def.assetId);
    const y = getTerrainHeight(x, z);
    actor.root.position.set(x, y, z);
    this.playActorClip(actor, 'Idle', true);
    this.worldGroup.add(actor.root);

    const enemy: EnemyRuntime = {
      id,
      archetypeId,
      name: def.name,
      x,
      y,
      z,
      homeX: x,
      homeZ: z,
      yaw: 0,
      hp: def.maxHp,
      maxHp: def.maxHp,
      poise: def.poise,
      maxPoise: def.poise,
      aiState: 'patrol',
      stateTimerMs: 0,
      attackCooldownMs: 600,
      awareness: 0,
      currentAttackId: null,
      hitPlayerThisSwing: false,
      actor,
      currentClip: 'Idle',
      isBoss: Boolean(def.isBoss),
      bossPhase: 1,
      isAdd,
      chunkKey: getChunkKey(x, z),
    };
    this.enemies.push(enemy);
    return enemy;
  }

  private reconcileWorldWithSave(): void {
    // Reconcile pickups, opened chests, solved puzzles, boss defeat, shortcuts
    const bladePickup = this.interactables.find((i) => i.id === 'pickup_oath_blade');
    if (bladePickup) {
      const hasBlade =
        getItemQuantity(this.save, 'wpn_iron_sword') > 0 ||
        Boolean(this.save.world.flags['claimed_oath_blade']);
      bladePickup.enabled = !hasBlade;
      if (bladePickup.mesh) bladePickup.mesh.visible = !hasBlade;
    }

    for (const inter of this.interactables) {
      if (inter.kind === 'chest' && this.save.world.openedChests.includes(inter.id)) {
        inter.enabled = false;
      }
    }

    const keepGateOpen = this.save.world.solvedPuzzles.includes('puzzle_keep_gate');
    if (this.keepGateBarrierMesh) this.keepGateBarrierMesh.visible = !keepGateOpen;
    const gateCol = this.colliders.find((c) => c.id === 'col_keep_gate_barrier');
    if (gateCol) gateCol.active = !keepGateOpen;
    const keepPed = this.interactables.find((i) => i.id === 'pedestal_keep_seal');
    if (keepPed) keepPed.enabled = !keepGateOpen;

    if (this.save.world.solvedPuzzles.includes('puzzle_frozen_reach')) {
      this.runeStates = [0, 1, 2];
      for (let i = 0; i < 3; i++) {
        if (this.runeVisuals[i]) this.runeVisuals[i].color.setHex(RUNE_COLORS[i]);
        const ri = this.interactables.find((x) => x.id === `rune_stone_${i}`);
        if (ri) ri.enabled = false;
      }
    }

    const wardenDefeated = this.save.world.defeatedBosses.includes('mountain_warden');
    const warden = this.enemies.find((e) => e.id === 'boss_mountain_warden');
    if (warden) {
      if (wardenDefeated) {
        warden.hp = 0;
        warden.aiState = 'dead';
        if (warden.actor) warden.actor.root.visible = false;
      } else {
        warden.hp = warden.maxHp;
        warden.aiState = 'patrol';
        warden.bossPhase = 1;
        warden.x = warden.homeX;
        warden.z = warden.homeZ;
        warden.y = getTerrainHeight(warden.x, warden.z);
        if (warden.actor) {
          warden.actor.root.visible = true;
          warden.actor.root.position.set(warden.x, warden.y, warden.z);
        }
      }
    }

    const shortcutOpen = this.save.world.unlockedShortcuts.includes('shortcut_keep_to_ravenhold') || wardenDefeated;
    if (this.shortcutPortalMesh) this.shortcutPortalMesh.visible = shortcutOpen;
    const scInter = this.interactables.find((i) => i.id === 'shortcut_keep_to_ravenhold');
    if (scInter) scInter.enabled = shortcutOpen;

    // Position Kaelen & Lyra
    if (this.kaelen) {
      this.kaelen.root.position.set(this.save.player.x, this.save.player.y, this.save.player.z);
      this.kaelen.root.rotation.y = this.save.player.yaw;
    }
    const lyraTalk = this.interactables.find((i) => i.id === 'talk_npc_lyra');
    if (this.save.companion.activeId === 'lyra') {
      if (lyraTalk) lyraTalk.enabled = false;
      this.lyraPos.set(
        this.save.player.x + 2.2,
        getTerrainHeight(this.save.player.x + 2.2, this.save.player.z + 2.2),
        this.save.player.z + 2.2,
      );
      if (this.lyra) this.lyra.root.position.copy(this.lyraPos);
    } else {
      if (lyraTalk) lyraTalk.enabled = true;
      this.lyraPos.set(-120, getTerrainHeight(-120, 122), 122);
      if (this.lyra) this.lyra.root.position.copy(this.lyraPos);
    }
  }

  private async refreshPlayerWeapons(): Promise<void> {
    if (!this.kaelen) return;
    const mainItem = this.save.player.equipment.mainHand ? ITEMS[this.save.player.equipment.mainHand] : null;
    const offItem = this.save.player.equipment.offHand ? ITEMS[this.save.player.equipment.offHand] : null;
    await attachWeaponToSocket(this.kaelen, mainItem?.meshAssetId ?? null, 'hand_r');
    await attachWeaponToSocket(this.kaelen, offItem?.meshAssetId ?? null, 'hand_l');
  }

  private playActorClip(actor: InstantiatedActor | null, name: string, loop = true): void {
    if (!actor || !actor.mixer) return;
    const clip = actor.clips.get(name.toLowerCase()) ?? actor.clips.get('idle');
    if (!clip) return;
    actor.mixer.stopAllAction();
    const action = actor.mixer.clipAction(clip);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    action.reset().fadeIn(0.1).play();
  }

  private setKaelenClip(name: string, loop = true): void {
    if (this.kaelenClip === name) return;
    this.kaelenClip = name;
    this.playActorClip(this.kaelen, name, loop);
  }

  private setEnemyClip(enemy: EnemyRuntime, name: string, loop = true): void {
    if (enemy.currentClip === name) return;
    enemy.currentClip = name;
    this.playActorClip(enemy.actor, name, loop);
  }

  // ---------------------------------------------------------------------------
  // Public RPG & Player Actions invoked by React Menus / Touch Controls
  // ---------------------------------------------------------------------------
  public interact(): void {
    if (this.mode !== 'playing') return;
    const prompt = this.findNearestInteractable();
    if (!prompt) return;
    const inter = this.interactables.find((i) => i.id === prompt.id);
    if (!inter || !inter.enabled) return;

    this.audio.unlock();

    if (inter.id === 'rest_ravenhold_campfire') {
      this.save.player.hp = this.save.player.maxHp;
      this.save.player.stamina = this.save.player.maxStamina;
      this.save.player.mana = this.save.player.maxMana;
      this.save.checkpointId = 'lm_ravenhold';
      this.autosaveSafe();
      this.audio.playQuestChime();
      this.notify('Rested at Ravenhold Hearth. Health, Stamina & Mana restored. Autosaved.');
      return;
    }

    if (inter.id === 'checkpoint_keep_approach') {
      this.save.player.hp = this.save.player.maxHp;
      this.save.player.stamina = this.save.player.maxStamina;
      this.save.player.mana = this.save.player.maxMana;
      this.save.checkpointId = 'lm_wardens_keep';
      this.autosaveSafe();
      this.audio.playQuestChime();
      this.notify("Warden's Keep Checkpoint kindled. Autosaved.");
      return;
    }

    if (inter.id === 'use_borin_forge') {
      this.setPaused(true, true);
      this.callbacks.onOpenSpecialUi?.('crafting');
      return;
    }

    if (inter.id === 'trade_ravenhold_stall') {
      this.setPaused(true, true);
      this.callbacks.onOpenSpecialUi?.('merchant');
      return;
    }

    if (inter.kind === 'pickup' && inter.pickupItemId) {
      const qty = inter.pickupItemId === 'wpn_iron_sword' ? 1 : 2;
      addInventoryItem(this.save, inter.pickupItemId, qty);
      if (inter.pickupItemId === 'wpn_iron_sword') {
        this.save.world.flags['claimed_oath_blade'] = true;
        equipInventoryItem(this.save, 'wpn_iron_sword');
        void this.refreshPlayerWeapons();
        this.showSubtitle('Weathered Oath Blade claimed. LMB Light Attack · RMB Heavy Cleave · Q Block/Parry.');
      }
      inter.enabled = false;
      if (inter.mesh) inter.mesh.visible = false;
      const notes = emitQuestEvent(this.save, 'collect', inter.pickupItemId, qty);
      this.audio.playQuestChime();
      this.notify(notes[0] ?? `Acquired ${ITEMS[inter.pickupItemId]?.name ?? inter.pickupItemId}.`);
      this.autosaveSafe();
      return;
    }

    if (inter.kind === 'chest' && inter.chestItemIds) {
      if (inter.id === 'chest_frozen_vault' && !this.save.world.solvedPuzzles.includes('puzzle_frozen_reach')) {
        this.notify('Vault sealed. Align the Three Oath Stones: I Frost · II Iron · III Breath.');
        return;
      }
      if (!this.save.world.openedChests.includes(inter.id)) {
        this.save.world.openedChests.push(inter.id);
        const notes: string[] = [];
        for (const item of inter.chestItemIds) {
          addInventoryItem(this.save, item.itemId, item.quantity);
          notes.push(...emitQuestEvent(this.save, 'collect', item.itemId, item.quantity));
        }
        if (inter.loreId && !this.save.world.unlockedLore.includes(inter.loreId)) {
          this.save.world.unlockedLore.push(inter.loreId);
        }
        inter.enabled = false;
        this.audio.playQuestChime();
        const names = inter.chestItemIds.map((x) => ITEMS[x.itemId]?.name ?? x.itemId).join(', ');
        this.notify(notes[0] ?? `Looted: ${names}`);
        this.autosaveSafe();
      }
      return;
    }

    if (inter.id === 'pedestal_keep_seal') {
      if (!this.save.world.solvedPuzzles.includes('puzzle_keep_gate')) {
        this.save.world.solvedPuzzles.push('puzzle_keep_gate');
        if (this.keepGateBarrierMesh) this.keepGateBarrierMesh.visible = false;
        const gateCol = this.colliders.find((c) => c.id === 'col_keep_gate_barrier');
        if (gateCol) gateCol.active = false;
        inter.enabled = false;
        const notes = emitQuestEvent(this.save, 'activate', 'puzzle_keep_gate');
        this.audio.playSpell('oath');
        this.notify(notes[0] ?? "Keep Seal unbarred! Proceed north into the Mountain Warden's Courtyard.");
        this.autosaveSafe();
      }
      return;
    }

    if (inter.kind === 'puzzle' && inter.runeIndex !== undefined) {
      const idx = inter.runeIndex;
      this.runeStates[idx] = (this.runeStates[idx] + 1) % 3;
      if (this.runeVisuals[idx]) {
        this.runeVisuals[idx].color.setHex(RUNE_COLORS[this.runeStates[idx]]);
      }
      if (inter.mesh) {
        inter.mesh.rotation.y += (Math.PI * 2) / 3;
      }
      inter.label = `Rotate Oath Stone ${['I', 'II', 'III'][idx]} (${RUNE_NAMES[this.runeStates[idx]]})`;
      this.audio.playParryRing();

      if (this.runeStates[0] === 0 && this.runeStates[1] === 1 && this.runeStates[2] === 2) {
        if (!this.save.world.solvedPuzzles.includes('puzzle_frozen_reach')) {
          this.save.world.solvedPuzzles.push('puzzle_frozen_reach');
          for (let k = 0; k < 3; k++) {
            const ri = this.interactables.find((x) => x.id === `rune_stone_${k}`);
            if (ri) ri.enabled = false;
          }
          const vault = this.interactables.find((x) => x.id === 'chest_frozen_vault');
          if (vault) vault.sublabel = 'Vault unsealed — claim the Frozen Covenant Tablet';
          const notes = emitQuestEvent(this.save, 'activate', 'puzzle_frozen_reach');
          this.audio.playQuestChime();
          this.notify(notes[0] ?? 'Three Oath Stones aligned! The Frozen Covenant Vault is open.');
          this.autosaveSafe();
        }
      } else {
        this.notify(`Stone ${['I', 'II', 'III'][idx]} set to ${RUNE_NAMES[this.runeStates[idx]]}.`);
      }
      return;
    }

    if (inter.id === 'shortcut_keep_to_ravenhold') {
      this.fastTravelTo('lm_ravenhold');
      return;
    }

    if (inter.kind === 'npc' && inter.dialogueNodeId) {
      let nodeId = inter.dialogueNodeId;
      if (inter.id === 'talk_npc_edda' && this.save.world.defeatedBosses.includes('mountain_warden')) {
        nodeId = 'dlg_edda_post_warden';
      }
      if (DIALOGUES[nodeId]) {
        this.openDialogue(nodeId);
      }
    }
  }

  private openDialogue(nodeId: string): void {
    this.exitPointerLock();
    this.keys.clear();
    this.activeDialogueNodeId = nodeId;
    this.mode = 'dialogue';
    this.callbacks.onDialogueOpen(nodeId);
    this.emitHudSnapshot();
  }

  public executeDialogueChoice(choiceId: string): void {
    if (!this.activeDialogueNodeId) return;
    const res = applyDialogueChoice(this.save, this.activeDialogueNodeId, choiceId);
    if (res.notifications.length > 0) {
      this.notify(res.notifications[0]);
      this.audio.playQuestChime();
    }

    // Reconcile Lyra recruitment immediately
    if (this.save.companion.activeId === 'lyra') {
      const lyraTalk = this.interactables.find((i) => i.id === 'talk_npc_lyra');
      if (lyraTalk) lyraTalk.enabled = false;
    }

    this.autosaveSafe();

    if (res.nextNodeId && DIALOGUES[res.nextNodeId]) {
      this.activeDialogueNodeId = res.nextNodeId;
      this.callbacks.onDialogueOpen(res.nextNodeId);
    } else {
      this.activeDialogueNodeId = null;
      this.callbacks.onDialogueOpen(null);
      if (res.openUi) {
        this.mode = 'menu';
        this.callbacks.onOpenSpecialUi?.(res.openUi);
      } else {
        this.mode = 'playing';
      }
    }
    this.emitHudSnapshot();
  }

  public closeDialogue(): void {
    this.activeDialogueNodeId = null;
    this.callbacks.onDialogueOpen(null);
    if (this.mode === 'dialogue') {
      this.mode = 'playing';
    }
    this.emitHudSnapshot();
  }

  public equipItem(itemId: string): { ok: boolean; message: string } {
    const res = equipInventoryItem(this.save, itemId);
    if (res.ok) {
      void this.refreshPlayerWeapons();
      this.callbacks.onSaveChanged(this.getSaveSnapshot());
      this.notify(res.message);
    }
    return res;
  }

  public useItem(itemId: string): { ok: boolean; message: string } {
    const res = useConsumableItem(this.save, itemId);
    if (res.ok) {
      this.audio.playSpell('oath');
      this.callbacks.onSaveChanged(this.getSaveSnapshot());
      this.notify(res.message);
      this.emitHudSnapshot();
    }
    return res;
  }

  public dropItem(itemId: string): { ok: boolean; message: string } {
    const res = dropInventoryItem(this.save, itemId);
    if (res.ok) {
      void this.refreshPlayerWeapons();
      this.callbacks.onSaveChanged(this.getSaveSnapshot());
      this.notify(res.message);
    }
    return res;
  }

  public unlockSkill(skillId: string): { ok: boolean; message: string } {
    const res = unlockSkillNode(this.save, skillId);
    if (res.ok) {
      this.audio.playQuestChime();
      this.callbacks.onSaveChanged(this.getSaveSnapshot());
      this.notify(res.message);
      this.emitHudSnapshot();
    }
    return res;
  }

  public resetSkills(): { ok: boolean; refunded: number } {
    const res = resetAllSkills(this.save);
    this.callbacks.onSaveChanged(this.getSaveSnapshot());
    this.notify(`Reset skills (${res.refunded} points refunded).`);
    this.emitHudSnapshot();
    return res;
  }

  public craftRecipe(recipeId: string): { ok: boolean; message: string } {
    const res = craftOrUpgradeRecipe(this.save, recipeId);
    if (res.ok) {
      this.audio.playParryRing();
      this.callbacks.onSaveChanged(this.getSaveSnapshot());
      this.notify(res.questNotifications[0] ?? res.message);
      this.autosaveSafe();
    }
    return { ok: res.ok, message: res.message };
  }

  public buyItem(itemId: string): { ok: boolean; message: string } {
    const res = buyFromMerchant(this.save, itemId);
    if (res.ok) {
      this.audio.playQuestChime();
      this.callbacks.onSaveChanged(this.getSaveSnapshot());
      this.notify(res.message);
      this.autosaveSafe();
    }
    return res;
  }

  public sellItem(itemId: string): { ok: boolean; message: string } {
    const res = sellToMerchant(this.save, itemId);
    if (res.ok) {
      void this.refreshPlayerWeapons();
      this.callbacks.onSaveChanged(this.getSaveSnapshot());
      this.notify(res.message);
      this.autosaveSafe();
    }
    return res;
  }

  public trackQuest(questId: string): void {
    if (this.save.quests[questId]) {
      this.save.trackedQuestId = questId;
      this.callbacks.onSaveChanged(this.getSaveSnapshot());
      this.emitHudSnapshot();
    }
  }

  public setCompanionCommand(cmd: CompanionCommand): void {
    this.save.companion.command = cmd;
    this.notify(`Lyra command: ${cmd.toUpperCase()}`);
    this.emitHudSnapshot();
  }

  public fastTravelTo(landmarkId: string): { ok: boolean; message: string } {
    const lm = FROSTHEIM_LANDMARKS.find((l) => l.id === landmarkId);
    if (!lm) return { ok: false, message: 'Unknown destination.' };
    if (!this.save.world.discoveredLandmarks.includes(lm.id)) {
      return { ok: false, message: 'Discover this landmark before fast traveling.' };
    }
    // Offset slightly south of landmark center so player never spawns inside boss or building
    const tx = lm.id === 'lm_wardens_keep' ? 6 : lm.x;
    const tz = lm.id === 'lm_wardens_keep' ? -114 : lm.z + 5;
    this.save.player.x = tx;
    this.save.player.z = tz;
    this.save.player.y = getTerrainHeight(tx, tz);
    if (this.kaelen) {
      this.kaelen.root.position.set(tx, this.save.player.y, tz);
    }
    if (this.save.companion.activeId === 'lyra') {
      this.lyraPos.set(tx + 2.2, getTerrainHeight(tx + 2.2, tz + 2), tz + 2);
      if (this.lyra) this.lyra.root.position.copy(this.lyraPos);
    }
    this.save.regionName = `Frostheim — ${lm.name}`;
    this.setPaused(false);
    this.showBanner(lm.name);
    this.notify(`Fast traveled to ${lm.name}.`);
    this.autosaveSafe();
    return { ok: true, message: `Traveled to ${lm.name}.` };
  }

  public respawnAtCheckpoint(): void {
    const cp =
      FROSTHEIM_LANDMARKS.find((l) => l.id === this.save.checkpointId) ?? FROSTHEIM_LANDMARKS[0];
    const rx = cp.id === 'lm_wardens_keep' ? -1 : cp.x;
    const rz = cp.id === 'lm_wardens_keep' ? -114 : cp.z + 4;
    this.save.player.x = rx;
    this.save.player.z = rz;
    this.save.player.y = getTerrainHeight(rx, rz);
    this.save.player.hp = this.save.player.maxHp;
    this.save.player.stamina = this.save.player.maxStamina;
    this.save.player.mana = this.save.player.maxMana;
    this.timeline = createCombatTimeline();
    this.activeBossId = null;

    // Reset Mountain Warden encounter cleanly if not yet defeated (no softlock, no lost quest progress!)
    if (!this.save.world.defeatedBosses.includes('mountain_warden')) {
      this.resetMountainWardenEncounter();
    }

    this.mode = 'playing';
    this.setKaelenClip('Idle', true);
    this.showBanner(`Respawned at ${cp.name}`);
    this.emitHudSnapshot();
  }

  private resetMountainWardenEncounter(): void {
    // Remove spawned boss adds
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].isAdd) {
        if (this.enemies[i].actor) {
          this.worldGroup.remove(this.enemies[i].actor!.root);
        }
        this.enemies.splice(i, 1);
      }
    }
    const warden = this.enemies.find((e) => e.id === 'boss_mountain_warden');
    if (warden) {
      warden.hp = warden.maxHp;
      warden.poise = warden.maxPoise;
      warden.bossPhase = 1;
      warden.aiState = 'patrol';
      warden.x = warden.homeX;
      warden.z = warden.homeZ;
      warden.y = getTerrainHeight(warden.x, warden.z);
      warden.currentAttackId = null;
      if (warden.actor) {
        warden.actor.root.visible = true;
        warden.actor.root.position.set(warden.x, warden.y, warden.z);
      }
    }
    for (const st of this.sealStones) {
      st.hp = st.maxHp;
      st.destroyed = false;
      if (st.mesh) st.mesh.visible = true;
    }
  }

  // Dev-only Blender Forge live preview hook
  public async previewDevGlb(assetId: string, buffer: ArrayBuffer, category: AssetCategory): Promise<void> {
    await registerDevPreviewGlb(assetId, buffer, category);
    if (assetId === 'chr_kaelen' && this.kaelen) {
      this.worldGroup.remove(this.kaelen.root);
      this.kaelen = await instantiateSkinnedActor('chr_kaelen');
      this.kaelen.root.position.set(this.save.player.x, this.save.player.y, this.save.player.z);
      this.worldGroup.add(this.kaelen.root);
      await this.refreshPlayerWeapons();
    }
    this.notify(`Dev Blender preview loaded for ${assetId}.`);
  }

  // Touch control hooks
  public setTouchMove(x: number, y: number): void {
    this.touchMoveX = Math.max(-1, Math.min(1, x));
    this.touchMoveY = Math.max(-1, Math.min(1, y));
  }

  public addTouchLook(dx: number, dy: number): void {
    const sens = 0.0045 * this.settings.mouseSensitivity;
    this.camYaw -= dx * sens;
    this.camPitch = Math.max(-0.2, Math.min(0.85, this.camPitch + dy * sens));
  }

  public triggerTouchAction(action: 'light' | 'heavy' | 'dodge' | 'block' | 'release_block' | 'interact' | 'lock' | 'ability1' | 'ability2' | 'ability3' | 'potion' | 'ascension'): void {
    this.audio.unlock();
    if (action === 'light') this.tryPlayerLightAttack();
    else if (action === 'heavy') this.tryPlayerHeavyAttack();
    else if (action === 'dodge') this.tryPlayerDodge();
    else if (action === 'block') this.tryPlayerGuard();
    else if (action === 'release_block') releaseGuardAction(this.timeline);
    else if (action === 'interact') this.interact();
    else if (action === 'lock') this.toggleLockOn();
    else if (action === 'ability1') this.tryAbilitySlot(0);
    else if (action === 'ability2') this.tryAbilitySlot(1);
    else if (action === 'ability3') this.tryAbilitySlot(2);
    else if (action === 'potion') this.useItem('pot_health');
    else if (action === 'ascension') this.tryDivineAscension();
  }

  // ---------------------------------------------------------------------------
  // Combat Triggers
  // ---------------------------------------------------------------------------
  private tryPlayerLightAttack(): void {
    if (this.mode !== 'playing') return;
    const mainItem = this.save.player.equipment.mainHand ? ITEMS[this.save.player.equipment.mainHand] : null;
    const attackId =
      mainItem?.moveset === 'bow'
        ? 'bow_shot'
        : this.comboStep === 0
          ? 'light_1'
          : this.comboStep === 1
            ? 'light_2'
            : 'light_3';

    const res = startAttackAction(this.timeline, attackId, this.save.player.stamina, this.save.player.mana);
    if (!res.started || !res.attack) return;
    this.save.player.stamina = Math.max(0, this.save.player.stamina - res.staminaCost);
    this.staminaRegenDelaySec = 0.7;
    this.comboStep = (this.comboStep + 1) % 3;
    this.comboResetSec = 1.15;
    this.faceLockOrCamera();
    this.setKaelenClip(res.attack.animation, false);
    this.audio.playSlash(false);

    if (res.attack.hitShape === 'projectile') {
      this.spawnPlayerProjectile(res.attack, 0xd9d1be, 32);
    } else {
      this.spawnSlashArc(this.save.player.x, this.save.player.y + 1.25, this.save.player.z, this.save.player.yaw, 0xd9d1be, res.attack.range * 0.75);
    }
  }

  private tryPlayerHeavyAttack(): void {
    if (this.mode !== 'playing') return;
    const res = startAttackAction(this.timeline, 'heavy_1', this.save.player.stamina, this.save.player.mana);
    if (!res.started || !res.attack) return;
    this.save.player.stamina = Math.max(0, this.save.player.stamina - res.staminaCost);
    this.staminaRegenDelaySec = 0.85;
    this.faceLockOrCamera();
    this.setKaelenClip('HeavyAttack', false);
    this.audio.playSlash(true);
    this.spawnSlashArc(this.save.player.x, this.save.player.y + 1.2, this.save.player.z, this.save.player.yaw, 0x6d9cb6, 2.6);
  }

  private tryPlayerDodge(): void {
    if (this.mode !== 'playing') return;
    const res = startDodgeAction(this.timeline, this.save.player.stamina, 18);
    if (!res.started) return;
    this.save.player.stamina = Math.max(0, this.save.player.stamina - res.staminaCost);
    this.staminaRegenDelaySec = 0.7;
    this.setKaelenClip('Dodge', false);
    this.audio.playFootstep(true);
  }

  private tryPlayerGuard(): void {
    if (this.mode !== 'playing') return;
    const stats = computeDerivedStats(this.save);
    const diff = DIFFICULTY_TUNING[this.settings.difficulty];
    if (startGuardAction(this.timeline, stats.parryWindowMs + diff.parryBonusMs)) {
      this.setKaelenClip('Block', true);
    }
  }

  private tryAbilitySlot(slotIndex: 0 | 1 | 2): void {
    if (this.mode !== 'playing') return;
    const slotMap = ['ability_frost_lance', 'ability_hearth_flame', 'ability_oath_wave'] as const;
    const abilityId = slotMap[slotIndex];
    if (abilityId === 'ability_oath_wave' && !this.save.player.unlockedAbilities.includes('ability_oath_wave')) {
      this.notify('Shattering Oath Wave unlocks via the Divinity skill tree or defeating the Mountain Warden.');
      return;
    }
    if (this.abilityCooldowns[slotIndex] > 0) return;
    const res = startAttackAction(this.timeline, abilityId, this.save.player.stamina, this.save.player.mana);
    if (!res.started || !res.attack) {
      this.notify('Not enough Mana or Stamina.');
      return;
    }
    this.save.player.stamina = Math.max(0, this.save.player.stamina - res.staminaCost);
    this.save.player.mana = Math.max(0, this.save.player.mana - res.manaCost);
    this.staminaRegenDelaySec = 0.7;
    this.abilityCooldowns[slotIndex] = slotIndex === 2 ? 9.0 : 4.0;
    this.faceLockOrCamera();
    this.setKaelenClip('Cast', false);

    if (abilityId === 'ability_frost_lance') {
      this.audio.playSpell('frost');
      this.spawnPlayerProjectile(res.attack, 0x6d9cb6, 28);
    } else if (abilityId === 'ability_hearth_flame') {
      this.audio.playSpell('fire');
      this.spawnSlashArc(this.save.player.x, this.save.player.y + 1.15, this.save.player.z, this.save.player.yaw, 0xd97636, 4.2);
    } else {
      this.audio.playSpell('oath');
      this.spawnSlashArc(this.save.player.x, this.save.player.y + 1.1, this.save.player.z, this.save.player.yaw, 0x7cb7d4, 5.8);
      this.triggerShake(0.28, 0.22);
    }
  }

  private tryDivineAscension(): void {
    if (this.mode !== 'playing') return;
    if (this.save.player.divineMeter < 100) {
      this.notify(`Divine Meter at ${Math.floor(this.save.player.divineMeter)}% (build via combat & parries).`);
      return;
    }
    this.save.player.divineMeter = 0;
    this.ascensionSec = 12;
    this.save.player.hp = Math.min(this.save.player.maxHp, this.save.player.hp + 25);
    this.audio.playSpell('oath');
    this.triggerShake(0.32, 0.25);
    this.showBanner('Divine Ascension — Oath Unbound');
  }

  private toggleLockOn(): void {
    if (this.lockedEnemyId) {
      this.lockedEnemyId = null;
      return;
    }
    let bestId: string | null = null;
    let bestDist = 26;
    for (const e of this.enemies) {
      if (e.aiState === 'dead') continue;
      const d = Math.hypot(e.x - this.save.player.x, e.z - this.save.player.z);
      if (d < bestDist) {
        bestDist = d;
        bestId = e.id;
      }
    }
    this.lockedEnemyId = bestId;
  }

  private faceLockOrCamera(): void {
    const target = this.lockedEnemyId
      ? this.enemies.find((e) => e.id === this.lockedEnemyId && e.aiState !== 'dead')
      : null;
    if (target) {
      this.save.player.yaw = Math.atan2(target.x - this.save.player.x, target.z - this.save.player.z);
    } else {
      this.save.player.yaw = this.camYaw + Math.PI;
    }
  }

  private spawnPlayerProjectile(attack: typeof ATTACKS[string], hexColor: number, speed: number): void {
    const dirX = Math.sin(this.save.player.yaw);
    const dirZ = Math.cos(this.save.player.yaw);
    const stats = computeDerivedStats(this.save);
    const diff = DIFFICULTY_TUNING[this.settings.difficulty];
    const mult = attack.damageType === 'frost' ? stats.spellMultiplier : stats.rangedMultiplier;
    const dmg = computeDamageAmount({
      baseDamage: attack.damage,
      weaponDamage: stats.weaponDamage,
      buildMultiplier: mult,
      armorValue: 0,
      difficultyMultiplier: diff.playerDamageMult,
      ascensionActive: this.ascensionSec > 0,
    });
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18, 0),
      new THREE.MeshBasicMaterial({ color: hexColor }),
    );
    mesh.position.set(
      this.save.player.x + dirX * 0.9,
      this.save.player.y + 1.35,
      this.save.player.z + dirZ * 0.9,
    );
    this.worldGroup.add(mesh);
    this.projectiles.push({
      id: `p_${Date.now()}_${Math.random()}`,
      fromPlayer: true,
      x: mesh.position.x,
      y: mesh.position.y,
      z: mesh.position.z,
      vx: dirX * speed,
      vy: 0,
      vz: dirZ * speed,
      damage: dmg,
      poiseDamage: attack.poiseDamage,
      ttlSec: 1.8,
      mesh,
    });
  }

  private spawnEnemyProjectile(enemy: EnemyRuntime, attack: typeof ATTACKS[string]): void {
    const dx = this.save.player.x - enemy.x;
    const dz = this.save.player.z - enemy.z;
    const dist = Math.hypot(dx, dz) || 1;
    const speed = 22;
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.08, 0.65, 5).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x6d9cb6 }),
    );
    mesh.position.set(enemy.x, enemy.y + 1.4, enemy.z);
    mesh.rotation.y = Math.atan2(dx, dz);
    this.worldGroup.add(mesh);
    this.projectiles.push({
      id: `ep_${Date.now()}_${Math.random()}`,
      fromPlayer: false,
      x: mesh.position.x,
      y: mesh.position.y,
      z: mesh.position.z,
      vx: (dx / dist) * speed,
      vy: 0,
      vz: (dz / dist) * speed,
      damage: attack.damage,
      poiseDamage: attack.poiseDamage,
      ttlSec: 2.2,
      mesh,
    });
  }

  private spawnSlashArc(x: number, y: number, z: number, yaw: number, colorHex: number, radius: number): void {
    const geo = new THREE.RingGeometry(radius * 0.55, radius, 16, 1, -Math.PI * 0.4, Math.PI * 0.8);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    this.worldGroup.add(mesh);
    this.vfxList.push({ mesh, ttlSec: 0.22, maxTtl: 0.22 });
  }

  // ---------------------------------------------------------------------------
  // Main Simulation & Render Loop (clamped deltas, hitstop separated from UI)
  // ---------------------------------------------------------------------------
  private loop = (ts: number): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);

    const rawDt = Math.max(0.001, (ts - this.lastFrameTs) / 1000);
    this.lastFrameTs = ts;
    const dt = Math.min(0.05, rawDt); // Clamp pathological deltas

    this.fpsAccum += rawDt;
    this.fpsFrames += 1;
    if (this.fpsAccum >= 0.5) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    this.updateSnow(dt);

    if (this.mode === 'title') {
      const t = ts * 0.00018;
      const orbitR = this.settings.reducedMotion ? 8.8 : 9.2;
      this.camera.position.set(
        Math.sin(t) * orbitR,
        3.25 + (this.settings.reducedMotion ? 0 : Math.sin(t * 1.4) * 0.25),
        Math.cos(t) * orbitR,
      );
      this.camera.lookAt(0, 1.8, 0);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.mode === 'playing') {
      if (this.hitstopSec > 0) {
        this.hitstopSec = Math.max(0, this.hitstopSec - dt);
      } else {
        this.stepSimulation(dt);
      }
      this.updateCamera(dt);
    }

    this.renderer.render(this.scene, this.camera);

    this.hudThrottleAccum += dt;
    if (this.hudThrottleAccum >= 0.08) {
      this.hudThrottleAccum = 0;
      this.emitHudSnapshot();
    }
  };

  private stepSimulation(dt: number): void {
    const dtMs = dt * 1000;
    this.save.playtimeSec += dt;
    this.save.world.worldTimeHours = (this.save.world.worldTimeHours + dt * 0.03) % 24;

    // UI timers
    if (this.landmarkBannerSec > 0) {
      this.landmarkBannerSec = Math.max(0, this.landmarkBannerSec - dt);
      if (this.landmarkBannerSec === 0) this.landmarkBanner = '';
    }
    if (this.notificationSec > 0) {
      this.notificationSec = Math.max(0, this.notificationSec - dt);
      if (this.notificationSec === 0) this.notificationText = '';
    }
    if (this.subtitleSec > 0) {
      this.subtitleSec = Math.max(0, this.subtitleSec - dt);
      if (this.subtitleSec === 0) this.subtitleText = '';
    }
    if (this.parryFlashSec > 0) this.parryFlashSec = Math.max(0, this.parryFlashSec - dt);
    if (this.damageFlashSec > 0) this.damageFlashSec = Math.max(0, this.damageFlashSec - dt);
    if (this.comboResetSec > 0) {
      this.comboResetSec = Math.max(0, this.comboResetSec - dt);
      if (this.comboResetSec === 0) this.comboStep = 0;
    }
    for (let i = 0; i < 4; i++) {
      if (this.abilityCooldowns[i] > 0) {
        this.abilityCooldowns[i] = Math.max(0, this.abilityCooldowns[i] - dt);
      }
    }

    // Ascension aura
    if (this.ascensionSec > 0) {
      this.ascensionSec = Math.max(0, this.ascensionSec - dt);
      this.save.player.hp = Math.min(this.save.player.maxHp, this.save.player.hp + 2.5 * dt);
      this.playerLight.color.setHex(0x9c7848);
      this.playerLight.intensity = 3.2;
    } else {
      this.playerLight.color.setHex(0x6d9cb6);
      this.playerLight.intensity = 0.85;
    }

    // Stamina & mana regen
    const diff = DIFFICULTY_TUNING[this.settings.difficulty];
    if (this.staminaRegenDelaySec > 0) {
      this.staminaRegenDelaySec = Math.max(0, this.staminaRegenDelaySec - dt);
    } else if (this.timeline.state !== 'guard') {
      this.save.player.stamina = Math.min(
        this.save.player.maxStamina,
        this.save.player.stamina + 26 * diff.staminaRegenMult * dt,
      );
    }
    this.save.player.mana = Math.min(this.save.player.maxMana, this.save.player.mana + 4.5 * dt);

    // Advance combat action state machine
    advanceCombatTimeline(this.timeline, dtMs);
    if (this.timeline.state === 'active' && this.timeline.activeAction) {
      this.evaluatePlayerActiveHitbox();
    }

    // Player locomotion & collision
    this.updatePlayerMovement(dt);

    // Stream / activate nearby chunks (keep 3x3 chunk radius visible for smooth FPS)
    const activeChunks = new Set(getActiveChunkKeys(this.save.player.x, this.save.player.z, 1));
    for (const [key, grp] of this.chunkGroups) {
      grp.visible = activeChunks.has(key);
    }

    // Discovery check across Frostheim landmarks
    this.checkLandmarkDiscovery();

    // Update Companion Lyra
    this.updateCompanionLyra(dt);

    // Update Enemies & Mountain Warden Boss
    this.updateEnemiesAndBoss(dt, dtMs);

    // Update Projectiles, Fissures, VFX
    this.updateProjectiles(dt);
    this.updateFissures(dt);
    this.updateVfx(dt);

    // Update mixers
    this.kaelen?.mixer?.update(dt);
    this.lyra?.mixer?.update(dt);
    for (const npc of this.npcs) npc.actor?.mixer?.update(dt);
    for (const e of this.enemies) e.actor?.mixer?.update(dt);

    // Keep directional sun shadow frustum centered around Kaelen
    this.sunLight.position.set(this.save.player.x + 48, this.save.player.y + 72, this.save.player.z + 36);
    this.sunLight.target.position.set(this.save.player.x, this.save.player.y, this.save.player.z);
    this.playerLight.position.set(this.save.player.x, this.save.player.y + 1.6, this.save.player.z);
  }

  private updatePlayerMovement(dt: number): void {
    const b = this.settings.bindings;
    let inX = this.touchMoveX;
    let inZ = this.touchMoveY;
    if (this.keys.has(b.forward) || this.keys.has('ArrowUp')) inZ += 1;
    if (this.keys.has(b.backward) || this.keys.has('ArrowDown')) inZ -= 1;
    if (this.keys.has(b.left) || this.keys.has('ArrowLeft')) inX -= 1;
    if (this.keys.has(b.right) || this.keys.has('ArrowRight')) inX += 1;

    const mag = Math.hypot(inX, inZ);
    if (mag > 1) {
      inX /= mag;
      inZ /= mag;
    }

    const canMove =
      this.timeline.state === 'idle' ||
      this.timeline.state === 'locomotion' ||
      this.timeline.state === 'guard' ||
      this.timeline.state === 'dodge';

    const wantSprint = (this.keys.has(b.sprint) || this.keys.has('ShiftRight')) && this.save.player.stamina > 6 && !this.isSneaking && this.timeline.state !== 'guard';
    const baseSpeed = this.timeline.state === 'dodge'
      ? 10.2
      : this.timeline.state === 'guard'
        ? 2.4
        : this.isSneaking
          ? 3.1
          : wantSprint && mag > 0.1
            ? 8.2
            : 5.2;

    if (wantSprint && mag > 0.1 && canMove && this.timeline.state !== 'dodge') {
      this.save.player.stamina = Math.max(0, this.save.player.stamina - 11 * dt);
      this.staminaRegenDelaySec = 0.55;
    }

    // Camera-relative horizontal forward/right vectors
    const fwdX = -Math.sin(this.camYaw);
    const fwdZ = -Math.cos(this.camYaw);
    const rightX = Math.cos(this.camYaw);
    const rightZ = -Math.sin(this.camYaw);

    let desiredVx = 0;
    let desiredVz = 0;
    if (this.timeline.state === 'dodge') {
      desiredVx = Math.sin(this.save.player.yaw) * baseSpeed;
      desiredVz = Math.cos(this.save.player.yaw) * baseSpeed;
    } else if (canMove && mag > 0.05) {
      desiredVx = (fwdX * inZ + rightX * inX) * baseSpeed;
      desiredVz = (fwdZ * inZ + rightZ * inX) * baseSpeed;
    }

    const accel = mag > 0.05 ? 14 : 18;
    this.playerVelX += (desiredVx - this.playerVelX) * Math.min(1, accel * dt);
    this.playerVelZ += (desiredVz - this.playerVelZ) * Math.min(1, accel * dt);

    const nextX = this.save.player.x + this.playerVelX * dt;
    const nextZ = this.save.player.z + this.playerVelZ * dt;

    // Terrain bounds + slope check + obstacle collision resolution
    let resolvedX = nextX;
    let resolvedZ = nextZ;
    if (!isInsidePlayableBounds(resolvedX, resolvedZ)) {
      resolvedX = this.save.player.x;
      resolvedZ = this.save.player.z;
    } else if (getTerrainSlopeDeg(resolvedX, resolvedZ) > MAX_WALKABLE_SLOPE_DEG && getTerrainHeight(resolvedX, resolvedZ) > this.save.player.y + 0.18) {
      resolvedX = this.save.player.x;
      resolvedZ = this.save.player.z;
    }

    for (const col of this.colliders) {
      if (!col.active) continue;
      const dx = resolvedX - col.x;
      const dz = resolvedZ - col.z;
      const minD = col.radius + 0.55;
      const d = Math.hypot(dx, dz);
      if (d < minD && d > 0.001) {
        resolvedX = col.x + (dx / d) * minD;
        resolvedZ = col.z + (dz / d) * minD;
      }
    }

    this.save.player.x = resolvedX;
    this.save.player.z = resolvedZ;

    // Gravity & jump ground clamp
    const groundY = getTerrainHeight(resolvedX, resolvedZ);
    this.playerVelY -= 22 * dt;
    this.save.player.y += this.playerVelY * dt;
    if (this.save.player.y <= groundY) {
      this.save.player.y = groundY;
      this.playerVelY = 0;
      this.playerGrounded = true;
    } else {
      this.playerGrounded = false;
    }

    // Character facing: face locked target or movement direction
    const speedHoriz = Math.hypot(this.playerVelX, this.playerVelZ);
    const lockedTarget = this.lockedEnemyId
      ? this.enemies.find((e) => e.id === this.lockedEnemyId && e.aiState !== 'dead')
      : null;

    if (lockedTarget && this.timeline.state !== 'dodge') {
      const targetYaw = Math.atan2(lockedTarget.x - this.save.player.x, lockedTarget.z - this.save.player.z);
      this.save.player.yaw = this.lerpAngle(this.save.player.yaw, targetYaw, Math.min(1, 14 * dt));
    } else if (speedHoriz > 0.35 && this.timeline.state !== 'dodge') {
      const moveYaw = Math.atan2(this.playerVelX, this.playerVelZ);
      this.save.player.yaw = this.lerpAngle(this.save.player.yaw, moveYaw, Math.min(1, 12 * dt));
    }

    if (this.kaelen) {
      this.kaelen.root.position.set(this.save.player.x, this.save.player.y, this.save.player.z);
      this.kaelen.root.rotation.y = this.save.player.yaw;
    }

    // Locomotion animation + footsteps
    if (this.timeline.state === 'idle' || this.timeline.state === 'locomotion') {
      if (speedHoriz > 0.4) {
        this.timeline.state = 'locomotion';
        this.setKaelenClip(speedHoriz > 6.2 ? 'Run' : 'Walk', true);
        this.footstepAccum += dt * (speedHoriz > 6.2 ? 2.8 : 1.9);
        if (this.footstepAccum >= 1) {
          this.footstepAccum = 0;
          this.audio.playFootstep(speedHoriz > 6.2);
        }
      } else {
        this.timeline.state = 'idle';
        this.setKaelenClip('Idle', true);
      }
    }
  }

  private evaluatePlayerActiveHitbox(): void {
    const act = this.timeline.activeAction;
    if (!act || act.attack.hitShape === 'projectile') return;

    const stats = computeDerivedStats(this.save);
    const diff = DIFFICULTY_TUNING[this.settings.difficulty];
    const px = this.save.player.x;
    const pz = this.save.player.z;
    const fwdX = Math.sin(this.save.player.yaw);
    const fwdZ = Math.cos(this.save.player.yaw);

    // Check Boss Phase-2 destructible Seal Stones first!
    for (const stone of this.sealStones) {
      if (stone.destroyed) continue;
      const dist = Math.hypot(stone.x - px, stone.z - pz);
      if (dist <= act.attack.range + 1.1 && canRegisterHitOnTarget(act, stone.id)) {
        stone.hp -= act.attack.damage;
        this.audio.playHitImpact(true);
        if (stone.hp <= 0) {
          stone.destroyed = true;
          if (stone.mesh) stone.mesh.visible = false;
          const remaining = this.sealStones.filter((s) => !s.destroyed).length;
          this.triggerShake(0.3, 0.25);
          this.notify(
            remaining > 0
              ? 'Oath Seal Stone shattered! Break the remaining stone to strip the Warden’s armor.'
              : 'All Seal Stones shattered! The Mountain Warden’s armor is exposed!',
          );
        }
      }
    }

    // Check Enemies
    for (const enemy of this.enemies) {
      if (enemy.aiState === 'dead') continue;
      const def = ENEMY_ARCHETYPES[enemy.archetypeId];
      const dx = enemy.x - px;
      const dz = enemy.z - pz;
      const dist = Math.hypot(dx, dz);
      if (dist > act.attack.range + def.radius) continue;

      if (act.attack.hitShape !== 'nova') {
        const dot = (dx * fwdX + dz * fwdZ) / (dist || 1);
        if (dot < Math.cos(act.attack.arcRad * 0.55)) continue;
      }

      if (!canRegisterHitOnTarget(act, enemy.id)) continue;

      const isStealth = this.isSneaking && enemy.aiState === 'patrol';
      const isCrit = Math.random() < stats.critChance;
      const buildMult = act.attack.damageType === 'physical' || act.attack.damageType === 'divine' ? stats.meleeMultiplier : stats.spellMultiplier;
      const remainingStones = this.sealStones.filter((s) => !s.destroyed).length;
      const armorOverride = enemy.isBoss
        ? getMountainWardenDamageTakenMultiplier(enemy.bossPhase, remainingStones)
        : def.hasShield && enemy.aiState !== 'stagger' && act.attack.blockable
          ? 0.55
          : undefined;

      const dmg = computeDamageAmount({
        baseDamage: act.attack.damage,
        weaponDamage: stats.weaponDamage,
        buildMultiplier: buildMult,
        armorValue: 8,
        difficultyMultiplier: diff.playerDamageMult,
        isCrit,
        isStealthBackstab: isStealth,
        stealthCritBonusPct: stats.stealthCritBonusPct,
        ascensionActive: this.ascensionSec > 0,
        armorOverrideMultiplier: armorOverride,
      });

      const poiseDmg = act.attack.poiseDamage * (act.attack.id === 'heavy_1' ? stats.heavyStaggerMultiplier : 1);
      this.applyDamageToEnemy(enemy, dmg, poiseDmg, act.attack.id === 'heavy_1' || isCrit || isStealth);
    }
  }

  private applyDamageToEnemy(enemy: EnemyRuntime, dmg: number, poiseDmg: number, heavyFeedback: boolean): void {
    if (enemy.aiState === 'dead') return;
    enemy.hp = Math.max(0, enemy.hp - dmg);
    enemy.poise = Math.max(0, enemy.poise - poiseDmg);
    enemy.awareness = 100;
    this.save.player.divineMeter = Math.min(100, this.save.player.divineMeter + (heavyFeedback ? 9 : 5));
    this.audio.playHitImpact(heavyFeedback);
    this.hitstopSec = heavyFeedback ? 0.065 : 0.04;
    if (heavyFeedback) this.triggerShake(0.16, 0.14);

    if (enemy.hp <= 0) {
      this.handleEnemyDeath(enemy);
      return;
    }

    // Poise break stagger (bosses resist permanent stun-lock via higher poise pool)
    if (enemy.poise <= 0 && enemy.aiState !== 'stagger') {
      enemy.poise = enemy.maxPoise;
      enemy.aiState = 'stagger';
      enemy.stateTimerMs = enemy.isBoss ? 1100 : 850;
      enemy.currentAttackId = null;
      this.setEnemyClip(enemy, 'Stagger', false);
    } else if (enemy.aiState === 'patrol' || enemy.aiState === 'suspicious') {
      enemy.aiState = 'engage';
    }

    // Mountain Warden Boss Phase Transitions!
    if (enemy.isBoss) {
      const nextPhase = getMountainWardenPhase(enemy.hp, enemy.maxHp);
      if (nextPhase.phase !== enemy.bossPhase) {
        enemy.bossPhase = nextPhase.phase;
        this.showBanner(nextPhase.transitionBanner);
        this.audio.playWardenSlam();
        this.triggerShake(0.35, 0.28);
        if (nextPhase.phase === 2) {
          // Summon at most 2 Hollow adds (never endless adds)
          const existingAdds = this.enemies.filter((x) => x.isAdd && x.aiState !== 'dead').length;
          const toSpawn = Math.max(0, Math.min(2, nextPhase.maxAdds - existingAdds));
          for (let i = 0; i < toSpawn; i++) {
            const ax = enemy.x + (i === 0 ? -7 : 7);
            const az = enemy.z + 5;
            void this.spawnEnemy(`warden_add_${Date.now()}_${i}`, 'hollow_swordsman', ax, az, true);
          }
        }
      }
    }
  }

  private handleEnemyDeath(enemy: EnemyRuntime): void {
    enemy.aiState = 'dead';
    enemy.currentAttackId = null;
    this.setEnemyClip(enemy, 'Death', false);
    if (this.lockedEnemyId === enemy.id) this.lockedEnemyId = null;

    const def = ENEMY_ARCHETYPES[enemy.archetypeId];
    this.save.player.gold += def.goldReward;
    const xpNotes = grantXp(this.save, def.xpReward);
    for (const drop of def.lootTable) {
      if (Math.random() <= drop.chance) {
        addInventoryItem(this.save, drop.itemId, drop.quantity);
      }
    }
    const qNotes = emitQuestEvent(this.save, 'defeat', enemy.archetypeId, 1);

    if (enemy.isBoss && enemy.archetypeId === 'mountain_warden') {
      this.activeBossId = null;
      if (!this.save.world.defeatedBosses.includes('mountain_warden')) {
        this.save.world.defeatedBosses.push('mountain_warden');
        this.save.world.unlockedShortcuts.push('shortcut_keep_to_ravenhold');
        this.save.world.domains.war = 'slain';
        if (!this.save.player.unlockedAbilities.includes('ability_oath_wave')) {
          this.save.player.unlockedAbilities.push('ability_oath_wave');
        }
        addInventoryItem(this.save, 'qst_warden_seal', 1);
        addInventoryItem(this.save, 'mat_warden_core', 1);
        if (this.shortcutPortalMesh) this.shortcutPortalMesh.visible = true;
        const scInter = this.interactables.find((i) => i.id === 'shortcut_keep_to_ravenhold');
        if (scInter) scInter.enabled = true;
        this.showBanner('The Mountain Warden Fallen — First Oath-Seal Claimed');
        this.showSubtitle('Shattering Oath Wave unlocked! Take the Return Shortcut east of the courtyard back to Captain Edda.');
        this.audio.playQuestChime();
      }
      this.autosaveSafe();
    } else {
      this.notify(qNotes[0] ?? xpNotes[0] ?? `Defeated ${enemy.name} (+${def.xpReward} XP, +${def.goldReward} Gold)`);
    }
  }

  private updateEnemiesAndBoss(dt: number, dtMs: number): void {
    const px = this.save.player.x;
    const pz = this.save.player.z;
    const isSprinting = this.keys.has(this.settings.bindings.sprint);

    // Attack token limit: at most 2 non-boss melee enemies telegraph/attack simultaneously
    let meleeTokensInUse = this.enemies.filter(
      (e) => !e.isBoss && (e.aiState === 'telegraph' || e.aiState === 'attack'),
    ).length;

    let bossActive: EnemyRuntime | null = null;

    for (const enemy of this.enemies) {
      if (enemy.aiState === 'dead') continue;
      const def = ENEMY_ARCHETYPES[enemy.archetypeId];
      const dx = px - enemy.x;
      const dz = pz - enemy.z;
      const dist = Math.hypot(dx, dz);

      if (dist > 78 && !enemy.isBoss) {
        if (enemy.actor) enemy.actor.root.visible = false;
        continue;
      }
      if (enemy.actor) enemy.actor.root.visible = true;

      if (enemy.isBoss && dist < 30 && this.save.world.solvedPuzzles.includes('puzzle_keep_gate')) {
        bossActive = enemy;
        this.activeBossId = enemy.id;
      }

      if (enemy.attackCooldownMs > 0) enemy.attackCooldownMs = Math.max(0, enemy.attackCooldownMs - dtMs);

      if (enemy.aiState === 'stagger') {
        enemy.stateTimerMs -= dtMs;
        if (enemy.stateTimerMs <= 0) {
          enemy.aiState = 'engage';
        }
        continue;
      }

      // Stealth / detection check when patrolling
      if (enemy.aiState === 'patrol' || enemy.aiState === 'suspicious') {
        if (enemy.isBoss && !this.save.world.solvedPuzzles.includes('puzzle_keep_gate')) {
          continue; // Warden waits behind sealed gate
        }
        const enemyFwdX = Math.sin(enemy.yaw);
        const enemyFwdZ = Math.cos(enemy.yaw);
        const inFront = (dx * enemyFwdX + dz * enemyFwdZ) / (dist || 1) > 0.2;
        const delta = computeStealthAwarenessDelta({
          distanceM: dist,
          detectionRangeM: def.detectionRange,
          isSneaking: this.isSneaking,
          isSprinting,
          inFrontCone: inFront,
          dtSec: dt,
        });
        enemy.awareness = Math.max(0, Math.min(100, enemy.awareness + delta));
        if (enemy.awareness >= 100) {
          enemy.aiState = 'engage';
        } else if (enemy.awareness >= 35) {
          enemy.aiState = 'suspicious';
          enemy.yaw = this.lerpAngle(enemy.yaw, Math.atan2(dx, dz), Math.min(1, 5 * dt));
        } else {
          enemy.aiState = 'patrol';
          this.setEnemyClip(enemy, 'Idle', true);
        }
        continue;
      }

      // Leash back if player retreats far away
      const distHome = Math.hypot(enemy.x - enemy.homeX, enemy.z - enemy.homeZ);
      if (!enemy.isBoss && dist > 38 && distHome > 26) {
        enemy.aiState = 'patrol';
        enemy.awareness = 0;
        continue;
      }

      // Telegraph -> Attack -> Recover state transitions
      if (enemy.aiState === 'telegraph') {
        enemy.yaw = this.lerpAngle(enemy.yaw, Math.atan2(dx, dz), Math.min(1, 6 * dt));
        enemy.stateTimerMs -= dtMs;
        if (enemy.stateTimerMs <= 0 && enemy.currentAttackId) {
          const atk = ATTACKS[enemy.currentAttackId];
          enemy.aiState = 'attack';
          enemy.stateTimerMs = atk ? atk.activeMs : 200;
          enemy.hitPlayerThisSwing = false;
          this.setEnemyClip(enemy, atk?.animation ?? 'Attack', false);

          if (atk?.hitShape === 'projectile') {
            this.spawnEnemyProjectile(enemy, atk);
          } else if (atk?.id === 'warden_fissure') {
            this.spawnWardenFissure(px, pz);
            this.audio.playWardenSlam();
          } else if (enemy.isBoss) {
            this.audio.playWardenSlam();
          }
        }
        continue;
      }

      if (enemy.aiState === 'attack') {
        enemy.stateTimerMs -= dtMs;
        const atk = enemy.currentAttackId ? ATTACKS[enemy.currentAttackId] : null;
        if (atk && atk.hitShape !== 'projectile' && atk.id !== 'warden_fissure' && !enemy.hitPlayerThisSwing) {
          if (dist <= atk.range + 0.65) {
            enemy.hitPlayerThisSwing = true;
            this.resolveEnemyHitOnPlayer(enemy, atk);
          }
        }
        if (enemy.stateTimerMs <= 0) {
          enemy.aiState = 'recover';
          enemy.stateTimerMs = atk ? atk.recoveryMs : 600;
          enemy.attackCooldownMs = enemy.isBoss ? 900 : 1200;
          this.setEnemyClip(enemy, 'Idle', true);
        }
        continue;
      }

      if (enemy.aiState === 'recover') {
        enemy.stateTimerMs -= dtMs;
        if (enemy.stateTimerMs <= 0) {
          enemy.aiState = 'engage';
          enemy.currentAttackId = null;
        }
        continue;
      }

      // Engage: approach / maintain ranged spacing & start telegraphed attack
      const targetYaw = Math.atan2(dx, dz);
      enemy.yaw = this.lerpAngle(enemy.yaw, targetYaw, Math.min(1, 8 * dt));

      const wantsAttack = dist <= def.attackRange && enemy.attackCooldownMs <= 0;
      const canClaimToken = enemy.isBoss || def.preferredRange > 6 || meleeTokensInUse < 2;

      if (wantsAttack && canClaimToken) {
        const pool = enemy.isBoss
          ? getMountainWardenPhase(enemy.hp, enemy.maxHp).attackIds
          : def.attacks;
        const chosenId = pool[Math.floor(Math.random() * pool.length)];
        const atk = ATTACKS[chosenId];
        if (atk) {
          enemy.currentAttackId = chosenId;
          enemy.aiState = 'telegraph';
          enemy.stateTimerMs = atk.windupMs;
          if (!enemy.isBoss && def.preferredRange <= 6) meleeTokensInUse += 1;
          this.setEnemyClip(enemy, enemy.isBoss ? atk.animation : 'Telegraph', false);
          continue;
        }
      }

      // Move toward preferred combat range
      let moveStep = 0;
      if (dist > def.preferredRange + 0.4) {
        moveStep = def.chaseSpeed * dt;
      } else if (def.preferredRange > 6 && dist < def.preferredRange - 3) {
        moveStep = -def.moveSpeed * 0.7 * dt;
      }
      if (Math.abs(moveStep) > 0.001) {
        const nx = enemy.x + (dx / (dist || 1)) * moveStep;
        const nz = enemy.z + (dz / (dist || 1)) * moveStep;
        if (isInsidePlayableBounds(nx, nz)) {
          enemy.x = nx;
          enemy.z = nz;
          enemy.y = getTerrainHeight(nx, nz);
        }
        this.setEnemyClip(enemy, enemy.isBoss ? 'Walk' : 'Run', true);
      } else {
        this.setEnemyClip(enemy, 'Idle', true);
      }

      if (enemy.actor) {
        enemy.actor.root.position.set(enemy.x, enemy.y, enemy.z);
        enemy.actor.root.rotation.y = enemy.yaw;
      }
    }

    if (!bossActive) {
      this.activeBossId = null;
    }
  }

  private resolveEnemyHitOnPlayer(enemy: EnemyRuntime, attack: typeof ATTACKS[string]): void {
    if (this.mode !== 'playing') return;
    const stats = computeDerivedStats(this.save);
    const diff = DIFFICULTY_TUNING[this.settings.difficulty];
    const scaledIncoming = computeDamageAmount({
      baseDamage: attack.damage,
      weaponDamage: 0,
      buildMultiplier: 1,
      armorValue: stats.armor,
      difficultyMultiplier: diff.enemyDamageMult,
    });

    const outcome = resolveDefenderHit({
      timeline: this.timeline,
      attack,
      incomingDamage: scaledIncoming,
      defenderStamina: this.save.player.stamina,
      guardMitigationPct: stats.guardMitigationPct,
    });

    this.save.player.divineMeter = Math.min(100, this.save.player.divineMeter + outcome.divineGain * stats.divineGainMultiplier);

    if (outcome.result === 'evaded') {
      this.notify('Evaded!');
      return;
    }

    if (outcome.result === 'parried') {
      this.audio.playParryRing();
      this.parryFlashSec = 0.45;
      this.hitstopSec = 0.075;
      enemy.aiState = 'stagger';
      enemy.stateTimerMs = outcome.attackerStaggerMs;
      enemy.currentAttackId = null;
      this.setEnemyClip(enemy, 'Stagger', false);
      this.notify('PERFECT PARRY! Counter now.');
      return;
    }

    if (outcome.result === 'blocked') {
      this.save.player.stamina = Math.max(0, this.save.player.stamina - outcome.staminaDamage);
      this.save.player.hp = Math.max(1, this.save.player.hp - outcome.hpDamage);
      this.staminaRegenDelaySec = 0.75;
      this.audio.playBlockThud();
      return;
    }

    // Direct hit or guard break
    this.save.player.stamina = Math.max(0, this.save.player.stamina - outcome.staminaDamage);
    this.save.player.hp = Math.max(0, this.save.player.hp - outcome.hpDamage);
    this.damageFlashSec = 0.35;
    this.triggerShake(0.24, 0.22);
    this.audio.playHitImpact(true);

    if (this.save.player.hp <= 0) {
      this.timeline.state = 'dead';
      this.setKaelenClip('Death', false);
      this.exitPointerLock();
      this.mode = 'dead';
      this.emitHudSnapshot();
    } else if (outcome.defenderStaggerMs > 0) {
      this.setKaelenClip('Stagger', false);
    }
  }

  private spawnWardenFissure(x: number, z: number): void {
    const y = getTerrainHeight(x, z) + 0.08;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 3.6, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x6d9cb6, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    mesh.position.set(x, y, z);
    this.worldGroup.add(mesh);
    this.fissures.push({ x, z, radius: 3.6, warnRemainingSec: 0.95, erupted: false, ttlSec: 1.55, mesh });
  }

  private updateFissures(dt: number): void {
    for (let i = this.fissures.length - 1; i >= 0; i--) {
      const f = this.fissures[i];
      f.ttlSec -= dt;
      f.warnRemainingSec -= dt;
      if (!f.erupted && f.warnRemainingSec <= 0) {
        f.erupted = true;
        (f.mesh.material as THREE.MeshBasicMaterial).color.setHex(0xd96636);
        const dist = Math.hypot(this.save.player.x - f.x, this.save.player.z - f.z);
        if (dist <= f.radius && this.timeline.dodgeIFrameMs <= 0) {
          const warden = this.enemies.find((e) => e.id === 'boss_mountain_warden');
          if (warden) {
            this.resolveEnemyHitOnPlayer(warden, ATTACKS.warden_fissure);
          }
        }
      }
      if (f.ttlSec <= 0) {
        this.worldGroup.remove(f.mesh);
        f.mesh.geometry.dispose();
        (f.mesh.material as THREE.Material).dispose();
        this.fissures.splice(i, 1);
      }
    }
  }

  private updateCompanionLyra(dt: number): void {
    if (!this.lyra || this.save.companion.activeId !== 'lyra') return;
    const cmd = this.save.companion.command;
    if (this.lyraAttackCd > 0) this.lyraAttackCd = Math.max(0, this.lyraAttackCd - dt);

    const distToPlayer = Math.hypot(this.save.player.x - this.lyraPos.x, this.save.player.z - this.lyraPos.z);
    // Safe off-camera catch-up teleport if stuck far behind
    if (cmd !== 'wait' && distToPlayer > 34) {
      this.lyraPos.set(
        this.save.player.x - Math.sin(this.save.player.yaw) * 2.8,
        getTerrainHeight(this.save.player.x, this.save.player.z),
        this.save.player.z - Math.cos(this.save.player.yaw) * 2.8,
      );
    }

    // Combat assist: fire frost ward bolts at active enemy
    if (cmd === 'assist' || cmd === 'attack') {
      const target =
        (this.lockedEnemyId ? this.enemies.find((e) => e.id === this.lockedEnemyId && e.aiState !== 'dead') : null) ??
        this.enemies.find(
          (e) =>
            e.aiState !== 'dead' &&
            e.aiState !== 'patrol' &&
            Math.hypot(e.x - this.lyraPos.x, e.z - this.lyraPos.z) < 22,
        );
      if (target && this.lyraAttackCd <= 0) {
        this.lyraAttackCd = 2.6;
        const stats = computeDerivedStats(this.save);
        const dx = target.x - this.lyraPos.x;
        const dz = target.z - this.lyraPos.z;
        const dist = Math.hypot(dx, dz) || 1;
        this.lyraYaw = Math.atan2(dx, dz);
        const mesh = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.14, 0),
          new THREE.MeshBasicMaterial({ color: 0x7cb7d4 }),
        );
        mesh.position.set(this.lyraPos.x, this.lyraPos.y + 1.4, this.lyraPos.z);
        this.worldGroup.add(mesh);
        this.projectiles.push({
          id: `lyra_${Date.now()}`,
          fromPlayer: true,
          x: mesh.position.x,
          y: mesh.position.y,
          z: mesh.position.z,
          vx: (dx / dist) * 24,
          vy: 0,
          vz: (dz / dist) * 24,
          damage: Math.round(14 * stats.companionDamageMultiplier),
          poiseDamage: 10,
          ttlSec: 1.5,
          mesh,
        });
        if (this.lyraClip !== 'Cast') {
          this.lyraClip = 'Cast';
          this.playActorClip(this.lyra, 'Cast', false);
        }
      }
    }

    // Follow offset behind Kaelen's left shoulder without blocking
    if (cmd !== 'wait' && distToPlayer > 3.6) {
      const goalX = this.save.player.x - Math.sin(this.save.player.yaw) * 2.5 - Math.cos(this.save.player.yaw) * 1.4;
      const goalZ = this.save.player.z - Math.cos(this.save.player.yaw) * 2.5 + Math.sin(this.save.player.yaw) * 1.4;
      const dx = goalX - this.lyraPos.x;
      const dz = goalZ - this.lyraPos.z;
      const d = Math.hypot(dx, dz) || 1;
      const spd = distToPlayer > 8 ? 6.8 : 4.6;
      this.lyraPos.x += (dx / d) * spd * dt;
      this.lyraPos.z += (dz / d) * spd * dt;
      this.lyraPos.y = getTerrainHeight(this.lyraPos.x, this.lyraPos.z);
      this.lyraYaw = this.lerpAngle(this.lyraYaw, Math.atan2(dx, dz), Math.min(1, 10 * dt));
      const clip = spd > 5.5 ? 'Run' : 'Walk';
      if (this.lyraClip !== clip) {
        this.lyraClip = clip;
        this.playActorClip(this.lyra, clip, true);
      }
    } else if (this.lyraAttackCd < 1.9 && this.lyraClip !== 'Idle') {
      this.lyraClip = 'Idle';
      this.playActorClip(this.lyra, 'Idle', true);
    }

    this.lyra.root.position.copy(this.lyraPos);
    this.lyra.root.rotation.y = this.lyraYaw;
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.ttlSec -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.mesh.position.set(p.x, p.y, p.z);

      let remove = p.ttlSec <= 0;
      if (!remove && p.fromPlayer) {
        for (const st of this.sealStones) {
          if (!st.destroyed && Math.hypot(st.x - p.x, st.z - p.z) < 1.25) {
            st.hp -= p.damage;
            remove = true;
            if (st.hp <= 0) {
              st.destroyed = true;
              if (st.mesh) st.mesh.visible = false;
              this.notify('Seal Stone shattered!');
            }
            break;
          }
        }
        if (!remove) {
          for (const e of this.enemies) {
            if (e.aiState === 'dead') continue;
            const def = ENEMY_ARCHETYPES[e.archetypeId];
            if (Math.hypot(e.x - p.x, e.z - p.z) < def.radius + 0.55) {
              this.applyDamageToEnemy(e, p.damage, p.poiseDamage, false);
              remove = true;
              break;
            }
          }
        }
      } else if (!remove && !p.fromPlayer) {
        if (Math.hypot(this.save.player.x - p.x, this.save.player.z - p.z) < 0.85) {
          const archer = this.enemies.find((e) => e.archetypeId === 'hollow_archer') ?? this.enemies[0];
          if (archer) {
            this.resolveEnemyHitOnPlayer(archer, ATTACKS.enm_arrow);
          }
          remove = true;
        }
      }

      if (remove) {
        this.worldGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  private updateVfx(dt: number): void {
    for (let i = this.vfxList.length - 1; i >= 0; i--) {
      const fx = this.vfxList[i];
      fx.ttlSec -= dt;
      const t = Math.max(0, fx.ttlSec / fx.maxTtl);
      (fx.mesh.material as THREE.MeshBasicMaterial).opacity = t * 0.72;
      fx.mesh.scale.setScalar(1 + (1 - t) * 0.3);
      if (fx.ttlSec <= 0) {
        this.worldGroup.remove(fx.mesh);
        fx.mesh.geometry.dispose();
        (fx.mesh.material as THREE.Material).dispose();
        this.vfxList.splice(i, 1);
      }
    }
  }

  private updateSnow(dt: number): void {
    if (!this.snowPoints || this.settings.reducedMotion) return;
    const pos = this.snowPoints.geometry.attributes.position as THREE.BufferAttribute;
    const cx = this.mode === 'title' ? 0 : this.save.player.x;
    const cz = this.mode === 'title' ? 0 : this.save.player.z;
    const cy = this.mode === 'title' ? 0 : this.save.player.y;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i) + 1.1 * dt;
      let y = pos.getY(i) - 3.6 * dt;
      let z = pos.getZ(i) + 0.7 * dt;
      if (y < cy - 2) y = cy + 22 + Math.random() * 6;
      if (x - cx > 45) x -= 90;
      if (x - cx < -45) x += 90;
      if (z - cz > 45) z -= 90;
      if (z - cz < -45) z += 90;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  private updateCamera(dt: number): void {
    const px = this.save.player.x;
    const py = this.save.player.y;
    const pz = this.save.player.z;

    // Auto-orient camera subtly toward locked target
    const locked = this.lockedEnemyId
      ? this.enemies.find((e) => e.id === this.lockedEnemyId && e.aiState !== 'dead')
      : null;
    if (locked) {
      const targetCamYaw = Math.atan2(px - locked.x, pz - locked.z);
      this.camYaw = this.lerpAngle(this.camYaw, targetCamYaw, Math.min(1, 7 * dt));
    }

    const inCombat = this.isInCombat();
    const isBossFight = Boolean(this.activeBossId);
    const boomDist = isBossFight ? 8.2 : inCombat ? 4.4 : 5.4;
    const shoulderOffset = inCombat && !isBossFight ? 0.65 : 0.35;

    const cosP = Math.cos(this.camPitch);
    const sinP = Math.sin(this.camPitch);
    const rightX = Math.cos(this.camYaw);
    const rightZ = -Math.sin(this.camYaw);

    let camX = px + Math.sin(this.camYaw) * boomDist * cosP + rightX * shoulderOffset;
    let camZ = pz + Math.cos(this.camYaw) * boomDist * cosP + rightZ * shoulderOffset;
    let camY = py + 1.65 + boomDist * sinP;

    // Spring-arm terrain collision so camera never clips below snow/slate ground
    const groundAtCam = getTerrainHeight(camX, camZ) + 0.55;
    if (camY < groundAtCam) camY = groundAtCam;

    if (this.camShakeSec > 0 && this.settings.cameraShake && !this.settings.reducedMotion) {
      this.camShakeSec = Math.max(0, this.camShakeSec - dt);
      camX += (Math.random() - 0.5) * this.camShakeAmp;
      camY += (Math.random() - 0.5) * this.camShakeAmp;
    }

    this.camera.position.lerp(new THREE.Vector3(camX, camY, camZ), Math.min(1, 14 * dt));
    if (locked) {
      this.camera.lookAt(
        (px + locked.x) * 0.5,
        Math.max(py + 1.4, (py + locked.y) * 0.5 + 1.3),
        (pz + locked.z) * 0.5,
      );
    } else {
      this.camera.lookAt(px + rightX * shoulderOffset * 0.6, py + 1.55, pz + rightZ * shoulderOffset * 0.6);
    }
  }

  private checkLandmarkDiscovery(): void {
    const px = this.save.player.x;
    const pz = this.save.player.z;
    for (const lm of FROSTHEIM_LANDMARKS) {
      const d = Math.hypot(px - lm.x, pz - lm.z);
      if (d <= lm.discoverRadius) {
        this.save.regionName = `Frostheim — ${lm.name}`;
        if (!this.save.world.discoveredLandmarks.includes(lm.id)) {
          this.save.world.discoveredLandmarks.push(lm.id);
          const xpNotes = grantXp(this.save, 35);
          const qNotes = emitQuestEvent(this.save, 'discover', lm.id);
          if (lm.id === 'lm_hunter_camp') startQuest(this.save, 'q_missing_hunter');
          if (lm.id === 'lm_frozen_reach') startQuest(this.save, 'q_voices_beneath_ice');
          this.showBanner(`Discovered: ${lm.name}`);
          this.notify(qNotes[0] ?? xpNotes[0] ?? `${lm.subtitle} (+35 XP)`);
          this.audio.playQuestChime();
          this.autosaveSafe();
        }
      }
    }
  }

  private findNearestInteractable(): ActiveInteractPrompt | null {
    let best: WorldInteractable | null = null;
    let bestD = Infinity;
    for (const inter of this.interactables) {
      if (!inter.enabled) continue;
      const d = Math.hypot(inter.x - this.save.player.x, inter.z - this.save.player.z);
      if (d <= inter.radius && d < bestD) {
        bestD = d;
        best = inter;
      }
    }
    if (!best) return null;
    return { id: best.id, kind: best.kind, label: best.label, sublabel: best.sublabel };
  }

  private isInCombat(): boolean {
    return this.enemies.some(
      (e) =>
        e.aiState !== 'dead' &&
        e.aiState !== 'patrol' &&
        Math.hypot(e.x - this.save.player.x, e.z - this.save.player.z) < 28,
    );
  }

  private emitHudSnapshot(): void {
    const { quest, objective } = getTrackedQuestObjective(this.save);
    let wpBearing: number | null = null;
    let wpDist: number | null = null;
    let wpLabel: string | null = null;

    if (objective?.waypoint) {
      const dx = objective.waypoint.x - this.save.player.x;
      const dz = objective.waypoint.z - this.save.player.z;
      wpDist = Math.round(Math.hypot(dx, dz));
      wpBearing = Math.atan2(dx, -dz);
      wpLabel = objective.waypoint.label;
    }

    let maxAwareness = 0;
    let incomingCue: HudSnapshot['incomingCue'] = 'none';
    const blips: EnemyRadarBlip[] = [];

    for (const e of this.enemies) {
      if (e.aiState === 'dead') continue;
      const dx = e.x - this.save.player.x;
      const dz = e.z - this.save.player.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 42) {
        blips.push({
          id: e.id,
          bearingRad: Math.atan2(dx, -dz),
          isBoss: e.isBoss,
          alerted: e.aiState !== 'patrol',
        });
      }
      if (e.awareness > maxAwareness && dist < 30) maxAwareness = e.awareness;
      if (e.aiState === 'telegraph' && e.currentAttackId && dist < 14) {
        const atk = ATTACKS[e.currentAttackId];
        if (atk) {
          incomingCue = atk.parryable ? 'parryable' : 'unblockable';
        }
      }
    }

    const locked = this.lockedEnemyId
      ? this.enemies.find((e) => e.id === this.lockedEnemyId && e.aiState !== 'dead')
      : null;

    let bossInfo: BossHudInfo | null = null;
    const activeBoss = this.activeBossId
      ? this.enemies.find((e) => e.id === this.activeBossId && e.aiState !== 'dead')
      : null;
    if (activeBoss) {
      const atk = activeBoss.currentAttackId ? ATTACKS[activeBoss.currentAttackId] : null;
      bossInfo = {
        id: activeBoss.id,
        name: 'The Mountain Warden',
        subtitle: getMountainWardenPhase(activeBoss.hp, activeBoss.maxHp).title,
        hp: activeBoss.hp,
        maxHp: activeBoss.maxHp,
        phase: activeBoss.bossPhase,
        sealStonesRemaining: this.sealStones.filter((s) => !s.destroyed).length,
        telegraph:
          activeBoss.aiState === 'telegraph' && atk
            ? atk.parryable
              ? 'parryable'
              : 'unblockable'
            : 'none',
      };
    }

    const mainWeapon = this.save.player.equipment.mainHand
      ? ITEMS[this.save.player.equipment.mainHand]?.name ?? 'Unarmed'
      : 'Unarmed';

    const snapshot: HudSnapshot = {
      mode: this.mode,
      regionLabel: this.save.regionName,
      landmarkBanner: this.landmarkBanner,
      notificationText: this.notificationText,
      subtitleText: this.settings.subtitles ? this.subtitleText : '',
      hp: Math.round(this.save.player.hp),
      maxHp: Math.round(this.save.player.maxHp),
      stamina: Math.round(this.save.player.stamina),
      maxStamina: Math.round(this.save.player.maxStamina),
      mana: Math.round(this.save.player.mana),
      maxMana: Math.round(this.save.player.maxMana),
      divineMeter: Math.round(this.save.player.divineMeter),
      ascensionRemainingSec: Number(this.ascensionSec.toFixed(1)),
      actionState: this.timeline.state,
      inCombat: this.isInCombat(),
      stealthState: maxAwareness >= 95 ? 'detected' : maxAwareness >= 30 ? 'caution' : 'hidden',
      stealthEyePct: Math.round(maxAwareness),
      lockedTargetName: locked ? locked.name : null,
      lockedTargetHpPct: locked ? Math.round((locked.hp / locked.maxHp) * 100) : 0,
      lockedTargetPoisePct: locked ? Math.round((locked.poise / locked.maxPoise) * 100) : 0,
      incomingCue,
      parryFlashSec: this.parryFlashSec,
      damageFlashSec: this.damageFlashSec,
      cameraHeadingRad: -this.camYaw,
      waypointBearingRad: wpBearing,
      waypointDistanceM: wpDist,
      waypointLabel: wpLabel,
      enemyBlips: blips,
      interactPrompt: this.mode === 'playing' ? this.findNearestInteractable() : null,
      trackedQuestTitle: quest?.title ?? null,
      trackedObjectiveText: objective?.description ?? null,
      boss: bossInfo,
      companionName: this.save.companion.activeId === 'lyra' ? 'Lyra' : null,
      companionCommand: this.save.companion.command,
      companionHpPct: this.lyraHp,
      equippedWeaponName: mainWeapon,
      potionCount: getItemQuantity(this.save, 'pot_health'),
      manaPotionCount: getItemQuantity(this.save, 'pot_mana'),
      abilityCooldowns: [
        Number(this.abilityCooldowns[0].toFixed(1)),
        Number(this.abilityCooldowns[1].toFixed(1)),
        Number(this.abilityCooldowns[2].toFixed(1)),
        0,
      ],
      worldTimeHours: this.save.world.worldTimeHours,
      weather: this.save.world.weather,
      playerX: Math.round(this.save.player.x),
      playerZ: Math.round(this.save.player.z),
      level: this.save.player.level,
      xp: this.save.player.xp,
      nextLevelXp: xpRequiredForLevel(this.save.player.level),
      gold: this.save.player.gold,
      skillPoints: this.save.player.skillPoints,
      pointerLocked: this.pointerLocked,
      fps: this.currentFps,
      drawCalls: this.renderer.info.render.calls,
    };

    this.callbacks.onHudUpdate(snapshot);
  }

  private showBanner(text: string): void {
    this.landmarkBanner = text;
    this.landmarkBannerSec = 3.8;
  }

  private notify(text: string): void {
    this.notificationText = text;
    this.notificationSec = 4.2;
  }

  private showSubtitle(text: string): void {
    this.subtitleText = text;
    this.subtitleSec = 6.0;
  }

  private triggerShake(durationSec: number, amplitude: number): void {
    if (!this.settings.cameraShake || this.settings.reducedMotion) return;
    this.camShakeSec = Math.max(this.camShakeSec, durationSec);
    this.camShakeAmp = Math.max(this.camShakeAmp, amplitude);
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  // ---------------------------------------------------------------------------
  // DOM & Input Listeners (cleanly unbound on dispose)
  // ---------------------------------------------------------------------------
  private onResize = (): void => {
    const w = Math.max(320, this.container.clientWidth || window.innerWidth);
    const h = Math.max(240, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.mode !== 'playing') return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.audio.unlock();
    const b = this.settings.bindings;

    if (e.code === b.dodge || e.code === b.lockOn) e.preventDefault();
    this.keys.add(e.code);

    if (e.repeat) return;
    if (e.code === b.interact) this.interact();
    else if (e.code === b.dodge) this.tryPlayerDodge();
    else if (e.code === b.jump && this.playerGrounded) {
      this.playerVelY = 7.4;
      this.playerGrounded = false;
    } else if (e.code === b.block) this.tryPlayerGuard();
    else if (e.code === b.sneak) {
      this.isSneaking = !this.isSneaking;
      this.notify(this.isSneaking ? 'Stealth stance enabled' : 'Standing stance');
    } else if (e.code === b.lockOn) this.toggleLockOn();
    else if (e.code === b.ascension) this.tryDivineAscension();
    else if (e.code === 'Digit1') this.tryAbilitySlot(0);
    else if (e.code === 'Digit2') this.tryAbilitySlot(1);
    else if (e.code === 'Digit3') this.tryAbilitySlot(2);
    else if (e.code === 'Digit4') this.useItem('pot_health');
    else if (e.code === 'Digit5') this.useItem('pot_mana');
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
    if (e.code === this.settings.bindings.block) {
      releaseGuardAction(this.timeline);
    }
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (this.mode !== 'playing') return;
    if (e.target !== this.renderer.domElement) return;
    this.audio.unlock();
    if (e.button === 0) {
      if (!this.pointerLocked && document.pointerLockElement !== this.renderer.domElement) {
        this.renderer.domElement.requestPointerLock?.();
      }
      this.tryPlayerLightAttack();
    } else if (e.button === 1) {
      e.preventDefault();
      this.toggleLockOn();
    } else if (e.button === 2) {
      this.rightMouseDrag = true;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
      this.tryPlayerHeavyAttack();
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 2) this.rightMouseDrag = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.mode !== 'playing') return;
    const sens = 0.0024 * this.settings.mouseSensitivity;
    if (this.pointerLocked) {
      this.camYaw -= e.movementX * sens;
      this.camPitch = Math.max(-0.2, Math.min(0.85, this.camPitch + e.movementY * sens));
    } else if (this.rightMouseDrag) {
      const dx = e.clientX - this.lastDragX;
      const dy = e.clientY - this.lastDragY;
      this.lastDragX = e.clientX;
      this.lastDragY = e.clientY;
      this.camYaw -= dx * sens * 1.4;
      this.camPitch = Math.max(-0.2, Math.min(0.85, this.camPitch + dy * sens * 1.4));
    }
  };

  private onContextMenu = (e: MouseEvent): void => {
    if (this.mode === 'playing' && e.target === this.renderer.domElement) {
      e.preventDefault();
    }
  };

  private onPointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.emitHudSnapshot();
  };

  private onWindowBlur = (): void => {
    this.keys.clear();
    this.rightMouseDrag = false;
    releaseGuardAction(this.timeline);
    if (this.mode === 'playing') {
      this.setPaused(true, false);
    }
  };

  private exitPointerLock(): void {
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
    this.pointerLocked = false;
  }

  private bindInputEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  public dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    this.exitPointerLock();
    this.audio.dispose();
    disposeObjectTree(this.scene);
    this.renderer.dispose();
  }
}
