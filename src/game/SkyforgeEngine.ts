import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SkyforgeAudio } from './audio';
import { getDarkFantasyTextures, type DarkFantasyTextureSet } from './darkFantasyTextures';
import { FirstPersonViewmodel } from './firstPersonViewmodel';
import { buildUpgradedCitadelWorld } from './worldGraphics';
import {
  buildEnemyModel,
  buildHeroCharacterRig,
  createContactShadowTexture,
  type BuiltinRigId,
  type CharacterRigParts,
  type EnemyMeshParts,
} from './proceduralModels';
import {
  ARENA_RADIUS,
  buildWaveConfig,
  calculateKillScore,
  clampDeltaTime,
  computeFpsWishDirection,
  computeHitstopDuration,
  createEnemyForWave,
  FIXED_PHYSICS_DT,
  FPS_EYE_HEIGHT,
  isMeleeArcHit,
  PLAYER_MAX_ENERGY,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  separateActors,
  stepEnemyAI,
  stepFirstPersonPhysics,
  type EnemySim,
  type GameMode,
  type PlayerPhysicsState,
  type ProjectileSim,
} from './rules';
import {
  applyRigFlashTint,
  BLENDER_CITADEL_KIT,
  BLENDER_DEFAULT_PROP_URL,
  BLENDER_ENEMY_MODELS,
  BLENDER_HERO_MODELS,
  instantiateBlenderRig,
  loadBlenderAssetUrl,
  loadBlenderStaticModelUrl,
  transitionRigAnimation,
  type ImportedAssetSummary,
  type InstancedBlenderRig,
  type LoadedCustomRig,
} from './assetLoader';

export type GamePhase = 'title' | 'playing' | 'paused' | 'victory' | 'defeat';
export type CameraMode = 'fps' | 'third';

export interface HudSnapshot {
  phase: GamePhase;
  mode: GameMode;
  cameraMode: CameraMode;
  pointerLocked: boolean;
  hitmarker: 'none' | 'hit' | 'kill';
  sprinting: boolean;
  grounded: boolean;
  speed: number;
  wave: number;
  maxWaves: number;
  score: number;
  combo: number;
  kills: number;
  elapsedSec: number;
  p1Hp: number;
  p1MaxHp: number;
  p1Energy: number;
  p2Active: boolean;
  p2Hp: number;
  p2MaxHp: number;
  p2Score: number;
  winnerLabel: string;
  enemiesRemaining: number;
  bannerText: string;
  cameraHeadingRad: number;
  wordWallBearingRad: number;
  enemyBearingsRad: number[];
}

export interface TelemetrySample {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  isSoftwareGl: boolean;
}

interface PlayerActor {
  id: 'p1' | 'p2';
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  facingX: number;
  facingZ: number;
  physics: PlayerPhysicsState;
  hp: number;
  maxHp: number;
  energy: number;
  score: number;
  invulnTimer: number;
  dashTimer: number;
  dashCooldown: number;
  dashVx: number;
  dashVz: number;
  attackTimer: number;
  attackCooldown: number;
  attackDidHit: boolean;
  jumpQueued: boolean;
  dashBuffer: number;
  attackBuffer: number;
  hitFlash: number;
  squashY: number;
  gaitPhase: number;
  rig: CharacterRigParts;
  blenderRig: InstancedBlenderRig | null;
  slashArc: THREE.Mesh;
  novaRing: THREE.Mesh;
  novaTimer: number;
}

interface EnemyHpBar {
  group: THREE.Group;
  fill: THREE.Mesh;
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  color: THREE.Color;
}

interface RelicItem {
  id: number;
  kind: 'heal' | 'energy';
  x: number;
  z: number;
  mesh: THREE.Group;
  age: number;
}

const MAX_WAVES = 5;
const PARTICLE_POOL_SIZE = 220;
const MAX_PITCH = 1.01;
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scaleVec = new THREE.Vector3();
const _whiteColor = new THREE.Color(0xffffff);

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createInitialPhysics(x: number, z: number): PlayerPhysicsState {
  return {
    x,
    y: 0,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: true,
    coyoteTimer: 0.12,
    jumpBufferTimer: 0,
    stepPhase: 0,
    stepDistance: 0,
  };
}

export class SkyforgeEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private audio = new SkyforgeAudio();

  private phase: GamePhase = 'title';
  private mode: GameMode = 'solo';
  private cameraMode: CameraMode = 'fps';
  private activeRigId: BuiltinRigId = 'ranger';
  private customRigData: LoadedCustomRig | null = null;
  private customEnemyRigData: LoadedCustomRig | null = null;
  private customScenePropsGroup: THREE.Group | null = null;
  private pillarMeshSlots: THREE.Group[] = [];
  private spireMeshSlots: THREE.Group[] = [];
  private wordWallSlot!: THREE.Group;
  private pineSlots: THREE.Group[] = [];
  private darkTextures!: DarkFantasyTextureSet;
  private viewmodel!: FirstPersonViewmodel;

  // First-Person Look & Feel State
  private fpsYaw = 0; // 0 looks along -Z toward center arena & Eclipse Blood-Moon
  private fpsPitch = -0.05;
  private pointerLocked = false;
  private dragLooking = false;
  private dragPointerId: number | null = null;
  private lastDragX = 0;
  private lastDragY = 0;
  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private smoothBobAmp = 0;
  private smoothCamRoll = 0;
  private landDip = 0;
  private landDipVel = 0;
  private currentFov = 74;
  private physicsAccum = 0;
  private hitmarkerTimer = 0;
  private hitmarkerKill = false;
  private touchSprint = false;

  private frameId = 0;
  private lastTime = 0;
  private disposed = false;

  private shadowTex: THREE.CanvasTexture;
  private worldClouds: THREE.Group;
  private brazierFlames: THREE.Mesh[];
  private brazierLights: THREE.PointLight[];
  private emberPoints: THREE.Points;
  private emberVelocities: Float32Array;
  private sanctuarySigil: THREE.Mesh;
  private flashLight: THREE.PointLight;
  private worldDisposables: Array<{ dispose: () => void }> = [];

  private p1!: PlayerActor;
  private p2!: PlayerActor;

  private enemies: EnemySim[] = [];
  private enemyMeshes = new Map<number, EnemyMeshParts>();
  private enemyBlenderRigs = new Map<number, InstancedBlenderRig>();
  private enemyHpBars = new Map<number, EnemyHpBar>();
  private builtinEnemyRigs = new Map<'charger' | 'kiter' | 'swarmer', LoadedCustomRig>();
  private rigLoadToken = 0;
  private nextEnemyId = 1;
  private waveQueue: Array<'charger' | 'kiter' | 'swarmer'> = [];
  private waveSpawnTimer = 0;
  private waveSpeedMult = 1;
  private waveMaxTokens = 3;

  private projectiles: ProjectileSim[] = [];
  private projectileMeshes = new Map<number, THREE.Mesh>();
  private nextProjectileId = 1;
  private sharedBoltGeo = new THREE.OctahedronGeometry(0.32, 0);
  private sharedEnemyBoltMat = new THREE.MeshStandardMaterial({
    color: 0xe879f9,
    emissive: 0xc026d3,
    emissiveIntensity: 3.4,
    roughness: 0.14,
  });
  private sharedArrowGeo = new THREE.ConeGeometry(0.085, 1.15, 6);
  private sharedArrowMat = new THREE.MeshStandardMaterial({
    color: 0xff5c8a,
    emissive: 0xff1e56,
    emissiveIntensity: 4.0,
    roughness: 0.12,
  });
  private sharedHpBgGeo = new THREE.PlaneGeometry(1.18, 0.14);
  private sharedHpBgMat = new THREE.MeshBasicMaterial({
    color: 0x120b1c,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthTest: true,
  });
  private sharedHpFillGeo = new THREE.PlaneGeometry(1.10, 0.08);
  private sharedHpFillMat = new THREE.MeshBasicMaterial({
    color: 0xf43f5e,
    side: THREE.DoubleSide,
    depthTest: true,
  });

  private relics: RelicItem[] = [];
  private nextRelicId = 1;

  private particleInst: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;

  private wave = 1;
  private score = 0;
  private combo = 0;
  private comboTimer = 0;
  private kills = 0;
  private elapsedSec = 0;
  private bannerText = '';
  private bannerTimer = 0;
  private hitstopTimer = 0;
  private trauma = 0;
  private titleAngle = 0.4;
  private defeatDelay = 0;
  private pendingDefeat: 'victory' | 'defeat' | null = null;
  private winnerLabel = '';

  // Input states
  private keysHeld = new Set<string>();
  private keysJustPressed = new Set<string>();
  private touchMove = { x: 0, z: 0 };

  // Callbacks
  private onHudUpdate: (hud: HudSnapshot) => void;
  private onTelemetry: (t: TelemetrySample) => void;
  private onBuiltinRigLoaded?: (rigId: BuiltinRigId, summary: ImportedAssetSummary) => void;
  private onRunComplete: (summary: {
    outcome: 'victory' | 'defeat';
    score: number;
    wave: number;
    kills: number;
    durationSec: number;
    mode: GameMode;
    rigUsed: string;
  }) => void;

  private hudEmitAccum = 0;
  private telemetryAccum = 0;
  private frameCounter = 0;
  private frameMsAccum = 0;

  private resizeObserver: ResizeObserver;

  constructor(
    container: HTMLElement,
    callbacks: {
      onHudUpdate: (hud: HudSnapshot) => void;
      onTelemetry: (t: TelemetrySample) => void;
      onBuiltinRigLoaded?: (rigId: BuiltinRigId, summary: ImportedAssetSummary) => void;
      onRunComplete: (summary: {
        outcome: 'victory' | 'defeat';
        score: number;
        wave: number;
        kills: number;
        durationSec: number;
        mode: GameMode;
        rigUsed: string;
      }) => void;
    },
  ) {
    this.container = container;
    this.onHudUpdate = callbacks.onHudUpdate;
    this.onTelemetry = callbacks.onTelemetry;
    this.onBuiltinRigLoaded = callbacks.onBuiltinRigLoaded;
    this.onRunComplete = callbacks.onRunComplete;

    this.isSoftwareGl = detectSoftwareWebGL();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x22364d);
    this.scene.fog = new THREE.FogExp2(0x3a4f66, 0.0108);

    this.camera = new THREE.PerspectiveCamera(54, width / Math.max(1, height), 0.08, 280);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(7.2, 4.1, 10.6);
    this.camera.lookAt(-1.4, 1.45, 2.2);
    this.scene.add(this.camera);

    // High-contrast studio PMREM environment reflections for steel, frost glaze & armor
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Crisp Skyrim Nordic Alpine Lighting (cold arctic sky + snowy ground bounce + warm braziers)
    const hemi = new THREE.HemisphereLight(0xb8d8f8, 0x3b4856, 1.18);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xf2f6ff, 2.75);
    keyLight.position.set(18, 30, -24);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(this.isSoftwareGl ? 1024 : 2048, this.isSoftwareGl ? 1024 : 2048);
    keyLight.shadow.camera.near = 4;
    keyLight.shadow.camera.far = 85;
    keyLight.shadow.camera.left = -26;
    keyLight.shadow.camera.right = 26;
    keyLight.shadow.camera.top = 26;
    keyLight.shadow.camera.bottom = -26;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.025;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x88c4ff, 1.15);
    rimLight.position.set(-18, 16, 20);
    this.scene.add(rimLight);

    // Dynamic pooled combat flash light (arrow/blade impact / Dragon Shout)
    this.flashLight = new THREE.PointLight(0x7dd3fc, 0, 16, 1.6);
    this.flashLight.position.set(0, 2, 0);
    this.scene.add(this.flashLight);

    // Skyrim Nordic Mountain Sanctuary World
    this.shadowTex = createContactShadowTexture();
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.darkTextures = getDarkFantasyTextures(maxAniso);
    const world = buildUpgradedCitadelWorld(this.scene, maxAniso, this.isSoftwareGl, this.darkTextures);
    this.worldClouds = world.clouds;
    this.brazierFlames = world.brazierFlames;
    this.brazierLights = world.brazierLights;
    this.emberPoints = world.emberPoints;
    this.emberVelocities = world.emberVelocities;
    this.sanctuarySigil = world.sanctuarySigil;
    this.pillarMeshSlots = world.pillarMeshSlots;
    this.spireMeshSlots = world.spireMeshSlots;
    this.wordWallSlot = world.wordWallSlot;
    this.pineSlots = world.pineSlots;
    this.worldDisposables = world.disposables;

    // First-Person Weapon Viewmodel attached to camera (hidden on Title screen)
    this.viewmodel = new FirstPersonViewmodel(this.activeRigId, this.darkTextures);
    this.viewmodel.root.visible = false;
    this.camera.add(this.viewmodel.root);

    // Selective HDR Bloom Post-Processing on Hardware GPU
    if (!this.isSoftwareGl) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.42,
        0.38,
        0.92,
      );
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    }

    // Pooled particle InstancedMesh
    const pGeo = new THREE.OctahedronGeometry(0.16, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleInst = new THREE.InstancedMesh(pGeo, pMat, PARTICLE_POOL_SIZE);
    this.particleInst.frustumCulled = false;
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.4,
        scale: 0,
        color: new THREE.Color(0xffffff),
      });
      _mat4.makeTranslation(0, -100, 0);
      this.particleInst.setMatrixAt(i, _mat4);
      this.particleInst.setColorAt(i, _whiteColor);
    }
    this.particleInst.instanceMatrix.needsUpdate = true;
    this.scene.add(this.particleInst);

    // Build P1 (Banshee Ranger default) and P2 actors
    this.p1 = this.createPlayerActor('p1', 'ranger', 0, 2.5);
    this.p2 = this.createPlayerActor('p2', 'ember', 3.5, 2.5);
    this.p2.rig.root.visible = false;

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Bind input & pointer-lock listeners
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    document.addEventListener('visibilitychange', this.handleVisibility);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('contextmenu', this.handleContextMenu);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.emitHud();
    this.renderFrame();
    this.lastTime = performance.now();
    this.scheduleNextFrame();
    void this.preloadBlenderAssets();
  }

  private renderFrame(): void {
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private isFpsActive(): boolean {
    return this.phase === 'playing' && this.mode === 'solo' && this.cameraMode === 'fps';
  }

  private releasePointerLock(): void {
    try {
      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
    } catch {
      // Ignore browser sandbox pointer-lock errors
    }
    this.pointerLocked = false;
    this.dragLooking = false;
    this.dragPointerId = null;
  }

  private requestPointerLockSafe(): void {
    try {
      const el = this.renderer.domElement;
      if (document.pointerLockElement !== el && typeof el.requestPointerLock === 'function') {
        const maybePromise = el.requestPointerLock() as unknown as Promise<void> | undefined;
        if (maybePromise && typeof maybePromise.catch === 'function') {
          maybePromise.catch(() => {});
        }
      }
    } catch {
      // Fallback drag-look works seamlessly if pointer lock is unavailable
    }
  }

  private triggerCombatFlash(x: number, y: number, z: number, hex: number, intensity = 16): void {
    if (this.isSoftwareGl) return;
    this.flashLight.color.setHex(hex);
    this.flashLight.position.set(x, y, z);
    this.flashLight.intensity = intensity;
  }

  private async preloadBlenderAssets(): Promise<void> {
    const heroToken = ++this.rigLoadToken;
    const p1Task = loadBlenderAssetUrl(BLENDER_HERO_MODELS[this.activeRigId], { targetHeight: 2.08 })
      .then((loaded) => {
        if (this.disposed || this.customRigData || heroToken !== this.rigLoadToken) return;
        this.attachPlayerBlenderRig(this.p1, loaded);
        this.onBuiltinRigLoaded?.(this.activeRigId, loaded.summary);
      })
      .catch(() => {});

    const p2Task = loadBlenderAssetUrl(BLENDER_HERO_MODELS.ember, { targetHeight: 2.08 })
      .then((loaded) => {
        if (this.disposed) return;
        this.attachPlayerBlenderRig(this.p2, loaded);
      })
      .catch(() => {});

    const enemyTasks = (['charger', 'kiter', 'swarmer'] as const).map((kind) => {
      const cfg = BLENDER_ENEMY_MODELS[kind];
      return loadBlenderAssetUrl(cfg.url, {
        targetHeight: cfg.targetHeight,
        groundFeet: cfg.groundFeet,
      })
        .then((loaded) => {
          if (this.disposed) return;
          this.builtinEnemyRigs.set(kind, loaded);
        })
        .catch(() => {});
    });

    const propTask = loadBlenderAssetUrl(BLENDER_DEFAULT_PROP_URL, { targetHeight: 2.45 })
      .then((loaded) => {
        if (this.disposed || this.customScenePropsGroup) return;
        this.applyCustomSceneProp(loaded);
      })
      .catch(() => {});

    const pillarKitTask = loadBlenderStaticModelUrl(BLENDER_CITADEL_KIT.brazierPillar)
      .then((template) => {
        if (this.disposed) return;
        for (const slot of this.pillarMeshSlots) {
          slot.clear();
          slot.add(template.clone(true));
        }
      })
      .catch(() => {});

    const spireKitTask = loadBlenderStaticModelUrl(BLENDER_CITADEL_KIT.cathedralSpire)
      .then((template) => {
        if (this.disposed) return;
        for (const slot of this.spireMeshSlots) {
          slot.clear();
          slot.add(template.clone(true));
        }
      })
      .catch(() => {});

    const wordWallTask = loadBlenderStaticModelUrl(BLENDER_CITADEL_KIT.nordicWordWall)
      .then((template) => {
        if (this.disposed) return;
        this.wordWallSlot.clear();
        this.wordWallSlot.add(template.clone(true));
      })
      .catch(() => {});

    const pineTask = loadBlenderStaticModelUrl(BLENDER_CITADEL_KIT.nordicPine)
      .then((template) => {
        if (this.disposed) return;
        for (const slot of this.pineSlots) {
          slot.clear();
          slot.add(template.clone(true));
        }
      })
      .catch(() => {});

    await Promise.allSettled([
      p1Task,
      p2Task,
      propTask,
      pillarKitTask,
      spireKitTask,
      wordWallTask,
      pineTask,
      ...enemyTasks,
    ]);
  }

  private attachPlayerBlenderRig(actor: PlayerActor, loaded: LoadedCustomRig): void {
    if (actor.blenderRig) {
      actor.rig.root.remove(actor.blenderRig.group);
      actor.blenderRig.dispose();
      actor.blenderRig = null;
    }
    const inst = instantiateBlenderRig(loaded);
    actor.rig.bodyGroup.visible = false;
    actor.rig.root.add(inst.group);
    actor.blenderRig = inst;
  }

  private rebuildViewmodel(rigId: BuiltinRigId): void {
    const wasVisible = this.viewmodel.root.visible;
    this.camera.remove(this.viewmodel.root);
    this.viewmodel.dispose();
    this.viewmodel = new FirstPersonViewmodel(rigId, this.darkTextures);
    this.viewmodel.root.visible = wasVisible;
    this.camera.add(this.viewmodel.root);
  }

  private createPlayerActor(
    id: 'p1' | 'p2',
    rigId: BuiltinRigId | 'ember',
    x: number,
    z: number,
  ): PlayerActor {
    const rig = buildHeroCharacterRig(rigId, this.shadowTex, this.darkTextures);
    rig.root.position.set(x, 0, z);
    this.scene.add(rig.root);

    const slashGeo = new THREE.RingGeometry(1.1, 2.75, 18, 1, -Math.PI * 0.45, Math.PI * 0.9);
    const slashMat = new THREE.MeshBasicMaterial({
      color: id === 'p1' ? 0xf43f5e : 0xfb923c,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const slashArc = new THREE.Mesh(slashGeo, slashMat);
    slashArc.rotation.x = -Math.PI / 2;
    slashArc.position.y = 1.1;
    rig.root.add(slashArc);

    const novaGeo = new THREE.RingGeometry(0.6, 1.15, 28);
    const novaMat = new THREE.MeshBasicMaterial({
      color: id === 'p1' ? 0xc084fc : 0xf97316,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const novaRing = new THREE.Mesh(novaGeo, novaMat);
    novaRing.rotation.x = -Math.PI / 2;
    novaRing.position.y = 0.14;
    this.scene.add(novaRing);

    return {
      id,
      x,
      y: 0,
      z,
      vx: 0,
      vz: 0,
      facingX: 0,
      facingZ: -1,
      physics: createInitialPhysics(x, z),
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      energy: 60,
      score: 0,
      invulnTimer: 0,
      dashTimer: 0,
      dashCooldown: 0,
      dashVx: 0,
      dashVz: 0,
      attackTimer: 0,
      attackCooldown: 0,
      attackDidHit: false,
      jumpQueued: false,
      dashBuffer: 0,
      attackBuffer: 0,
      hitFlash: 0,
      squashY: 1,
      gaitPhase: 0,
      rig,
      blenderRig: null,
      slashArc,
      novaRing,
      novaTimer: 0,
    };
  }

  public setBuiltinRig(rigId: BuiltinRigId): void {
    this.activeRigId = rigId;
    this.customRigData = null;
    this.rebuildViewmodel(rigId);
    this.rebuildP1Visual(rigId, null);
    const token = ++this.rigLoadToken;
    void loadBlenderAssetUrl(BLENDER_HERO_MODELS[rigId], { targetHeight: 2.08 })
      .then((loaded) => {
        if (this.disposed || this.customRigData || token !== this.rigLoadToken) return;
        this.attachPlayerBlenderRig(this.p1, loaded);
        this.onBuiltinRigLoaded?.(rigId, loaded.summary);
      })
      .catch(() => {});
  }

  public applyCustomBlenderRig(rig: LoadedCustomRig): void {
    this.rigLoadToken++;
    this.customRigData = rig;
    this.rebuildP1Visual(this.activeRigId, rig);
  }

  public applyCustomSceneProp(rig: LoadedCustomRig | null): void {
    if (this.customScenePropsGroup) {
      this.scene.remove(this.customScenePropsGroup);
      this.customScenePropsGroup = null;
    }
    if (!rig) return;
    const container = new THREE.Group();
    const angles = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
    for (const ang of angles) {
      const clone = rig.group.clone(true);
      clone.scale.multiplyScalar(1.45);
      clone.position.set(Math.cos(ang) * (ARENA_RADIUS - 1.4), 0, Math.sin(ang) * (ARENA_RADIUS - 1.4));
      clone.rotation.y = -ang - Math.PI / 2;
      container.add(clone);
    }
    this.customScenePropsGroup = container;
    this.scene.add(container);
  }

  public applyCustomEnemyRig(rig: LoadedCustomRig | null): void {
    this.customEnemyRigData = rig;
  }

  private rebuildP1Visual(rigId: BuiltinRigId, custom: LoadedCustomRig | null): void {
    const prevPos = this.p1.rig.root.position.clone();
    const prevRot = this.p1.rig.root.rotation.y;
    const prevPhysics = { ...this.p1.physics };

    this.p1.blenderRig?.dispose();
    this.scene.remove(this.p1.rig.root);
    this.scene.remove(this.p1.novaRing);

    const rebuilt = this.createPlayerActor('p1', rigId, prevPos.x, prevPos.z);
    rebuilt.physics = prevPhysics;
    rebuilt.x = prevPhysics.x;
    rebuilt.y = prevPhysics.y;
    rebuilt.z = prevPhysics.z;
    rebuilt.hp = this.p1.hp;
    rebuilt.energy = this.p1.energy;
    rebuilt.score = this.p1.score;
    rebuilt.facingX = this.p1.facingX;
    rebuilt.facingZ = this.p1.facingZ;
    rebuilt.rig.root.rotation.y = prevRot;
    rebuilt.rig.root.visible = !this.isFpsActive();

    if (custom) {
      this.attachPlayerBlenderRig(rebuilt, custom);
    }

    this.p1 = rebuilt;
  }

  public getAudio(): SkyforgeAudio {
    return this.audio;
  }

  public toggleCameraMode(): CameraMode {
    if (this.mode !== 'solo') {
      this.cameraMode = 'third';
      return this.cameraMode;
    }
    this.cameraMode = this.cameraMode === 'fps' ? 'third' : 'fps';
    this.syncCameraVisibility();
    if (this.cameraMode === 'third') {
      this.releasePointerLock();
    }
    this.emitHud();
    return this.cameraMode;
  }

  private syncCameraVisibility(): void {
    const fps = this.isFpsActive();
    this.p1.rig.root.visible = !fps;
    this.viewmodel.root.visible = fps;
  }

  public setTouchInput(moveX: number, moveZ: number): void {
    this.touchMove.x = Math.max(-1, Math.min(1, moveX));
    this.touchMove.z = Math.max(-1, Math.min(1, moveZ));
  }

  public setTouchSprint(active: boolean): void {
    this.touchSprint = active;
  }

  public addLookDelta(dx: number, dy: number): void {
    if (!this.isFpsActive()) return;
    const sens = 0.0042;
    this.fpsYaw -= dx * sens;
    this.fpsPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.fpsPitch - dy * sens));
    this.lookDeltaX = Math.max(-0.5, Math.min(0.5, this.lookDeltaX + dx * sens));
    this.lookDeltaY = Math.max(-0.5, Math.min(0.5, this.lookDeltaY + dy * sens));
  }

  public triggerMobileAction(action: 'attack' | 'dash' | 'nova' | 'jump'): void {
    if (this.phase !== 'playing') return;
    if (action === 'attack') this.p1.attackBuffer = 0.14;
    if (action === 'dash') this.p1.dashBuffer = 0.14;
    if (action === 'jump') this.p1.jumpQueued = true;
    if (action === 'nova') this.tryPlayerNova(this.p1);
  }

  public startGame(mode: GameMode): void {
    this.mode = mode;
    this.phase = 'playing';
    document.body.dataset.state = 'playing';
    this.clearEntities();

    this.wave = 1;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.kills = 0;
    this.elapsedSec = 0;
    this.hitstopTimer = 0;
    this.trauma = 0;
    this.pendingDefeat = null;
    this.defeatDelay = 0;
    this.winnerLabel = '';
    this.physicsAccum = 0;
    this.landDip = 0;
    this.landDipVel = 0;
    this.hitmarkerTimer = 0;
    this.keysHeld.clear();
    this.keysJustPressed.clear();

    // Start facing north (-Z) directly toward the Gothic Cathedral Arch & Eclipse Blood-Moon
    this.fpsYaw = 0;
    this.fpsPitch = -0.04;
    this.currentFov = mode === 'solo' && this.cameraMode === 'fps' ? 74 : 52;
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();

    this.resetPlayer(this.p1, mode === 'solo' ? 0 : -4.2, mode === 'solo' ? 7.5 : 3.2, 0, -1);
    if (mode === 'solo') {
      this.p2.rig.root.visible = false;
    } else {
      this.p2.rig.root.visible = true;
      this.resetPlayer(this.p2, 4.2, mode === 'duel2p' ? -3.2 : 3.2, 0, mode === 'duel2p' ? 1 : -1);
    }

    this.syncCameraVisibility();

    if (mode === 'duel2p') {
      this.bannerText = 'LOCAL 2P DUEL — FIRST TO 5 KOs';
      this.bannerTimer = 2.4;
      this.waveQueue = [];
    } else {
      this.startWave(1);
    }

    this.audio.playDash();
    this.emitHud();
  }

  public pauseGame(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    document.body.dataset.state = 'paused';
    this.keysHeld.clear();
    this.releasePointerLock();
    this.emitHud();
  }

  public resumeGame(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    document.body.dataset.state = 'playing';
    this.keysHeld.clear();
    this.syncCameraVisibility();
    this.lastTime = performance.now();
    this.emitHud();
  }

  public returnToTitle(): void {
    this.clearEntities();
    this.releasePointerLock();
    this.phase = 'title';
    document.body.dataset.state = 'title';
    this.resetPlayer(this.p1, 0, 0, 0, 1);
    this.p1.rig.root.visible = true;
    this.p2.rig.root.visible = false;
    this.viewmodel.root.visible = false;
    this.currentFov = 54;
    this.camera.fov = 54;
    this.camera.updateProjectionMatrix();
    this.keysHeld.clear();
    this.emitHud();
  }

  private resetPlayer(p: PlayerActor, x: number, z: number, fx: number, fz: number): void {
    p.x = x;
    p.y = 0;
    p.z = z;
    p.vx = 0;
    p.vz = 0;
    p.facingX = fx;
    p.facingZ = fz;
    p.physics = createInitialPhysics(x, z);
    p.hp = PLAYER_MAX_HP;
    p.energy = 60;
    p.score = 0;
    p.invulnTimer = 1.2;
    p.dashTimer = 0;
    p.dashCooldown = 0;
    p.dashVx = 0;
    p.dashVz = 0;
    p.attackTimer = 0;
    p.attackCooldown = 0;
    p.jumpQueued = false;
    p.dashBuffer = 0;
    p.attackBuffer = 0;
    p.hitFlash = 0;
    p.squashY = 1;
    p.rig.root.position.set(x, 0, z);
    p.rig.root.rotation.y = Math.atan2(fx, fz);
  }

  private clearEntities(): void {
    for (const [, eb] of this.enemyBlenderRigs) {
      eb.dispose();
    }
    this.enemyBlenderRigs.clear();
    for (const [, bar] of this.enemyHpBars) {
      this.scene.remove(bar.group);
    }
    this.enemyHpBars.clear();
    for (const [, em] of this.enemyMeshes) {
      this.scene.remove(em.root);
    }
    this.enemyMeshes.clear();
    this.enemies = [];

    for (const [, pm] of this.projectileMeshes) {
      this.scene.remove(pm);
    }
    this.projectileMeshes.clear();
    this.projectiles = [];

    for (const r of this.relics) {
      this.scene.remove(r.mesh);
    }
    this.relics = [];
  }

  private startWave(waveNum: number): void {
    this.wave = waveNum;
    const cfg = buildWaveConfig(waveNum, this.mode);
    this.waveQueue = [...cfg.composition];
    this.waveSpeedMult = cfg.speedMultiplier;
    this.waveMaxTokens = cfg.maxConcurrentAttackers;
    this.waveSpawnTimer = 0.25;
    this.bannerText = `WAVE ${waveNum} / ${MAX_WAVES}`;
    this.bannerTimer = 2.0;
  }

  private spawnEnemyFromQueue(): void {
    const kind = this.waveQueue.shift();
    if (!kind) return;
    // Bias wave-1 first enemies into front-facing vista so FPS players spot action immediately
    const angle =
      this.enemies.length < 2 && this.wave === 1
        ? -Math.PI * 0.5 + (Math.random() - 0.5) * 1.15
        : Math.random() * Math.PI * 2;
    const sim = createEnemyForWave(this.nextEnemyId++, kind, angle, this.wave);
    this.enemies.push(sim);

    const visual = buildEnemyModel(kind, this.shadowTex, this.darkTextures);
    const enemyAsset = this.customEnemyRigData ?? this.builtinEnemyRigs.get(kind) ?? null;
    if (enemyAsset) {
      visual.body.visible = false;
      const inst = instantiateBlenderRig(enemyAsset);
      if (this.customEnemyRigData && kind === 'charger') {
        inst.group.scale.multiplyScalar(1.25);
      }
      visual.root.add(inst.group);
      this.enemyBlenderRigs.set(sim.id, inst);
    }
    visual.root.position.set(sim.x, 0, sim.z);
    this.scene.add(visual.root);
    this.enemyMeshes.set(sim.id, visual);

    // Floating 3D enemy HP bar (hidden until damaged)
    const barGroup = new THREE.Group();
    const bg = new THREE.Mesh(this.sharedHpBgGeo, this.sharedHpBgMat);
    const fill = new THREE.Mesh(this.sharedHpFillGeo, this.sharedHpFillMat);
    fill.position.z = 0.01;
    barGroup.add(bg, fill);
    barGroup.visible = false;
    barGroup.position.set(sim.x, kind === 'charger' ? 2.75 : kind === 'swarmer' ? 1.65 : 2.55, sim.z);
    this.scene.add(barGroup);
    this.enemyHpBars.set(sim.id, { group: barGroup, fill });

    this.spawnParticles(sim.x, 1.0, sim.z, 0xc084fc, 10, 4.8);
  }

  private spawnRelic(x: number, z: number, kind: 'heal' | 'energy'): void {
    const group = new THREE.Group();
    const color = kind === 'heal' ? 0x34d399 : 0x38bdf8;
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.36, 0),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 3.2,
        roughness: 0.15,
      }),
    );
    core.position.y = 0.85;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.05, 6, 16),
      new THREE.MeshStandardMaterial({ color: 0xf4d38c, metalness: 0.88, roughness: 0.22 }),
    );
    ring.position.y = 0.85;
    ring.rotation.x = Math.PI / 2;
    group.add(core, ring);
    group.position.set(x, 0, z);
    this.scene.add(group);
    this.relics.push({ id: this.nextRelicId++, kind, x, z, mesh: group, age: 0 });
  }

  private spawnParticles(
    x: number,
    y: number,
    z: number,
    hex: number,
    count: number,
    speed: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % PARTICLE_POOL_SIZE;
      const ang = Math.random() * Math.PI * 2;
      const spd = speed * (0.4 + Math.random() * 0.8);
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.z = z;
      slot.vx = Math.cos(ang) * spd;
      slot.vy = 2.2 + Math.random() * 4.5;
      slot.vz = Math.sin(ang) * spd;
      slot.maxLife = 0.28 + Math.random() * 0.34;
      slot.life = slot.maxLife;
      slot.scale = 0.65 + Math.random() * 0.9;
      slot.color.setHex(hex);
    }
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const code = e.code;
    if (
      code === 'Space' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight'
    ) {
      if (this.phase === 'playing') e.preventDefault();
    }

    if (!this.keysHeld.has(code)) {
      this.keysJustPressed.add(code);
    }
    this.keysHeld.add(code);

    if (this.phase === 'playing') {
      if (code === 'KeyP' || (code === 'Escape' && !this.pointerLocked)) {
        this.pauseGame();
      } else if (code === 'KeyM') {
        this.audio.toggleMute();
      } else if (code === 'KeyV') {
        this.toggleCameraMode();
      } else if (code === 'KeyK' || code === 'KeyQ') {
        this.tryPlayerNova(this.p1);
      } else if (code === 'KeyE') {
        this.p1.dashBuffer = 0.14;
      } else if (code === 'Space') {
        this.p1.jumpQueued = true;
      }
    } else if (this.phase === 'paused') {
      if (code === 'Escape' || code === 'KeyP') {
        this.resumeGame();
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keysHeld.delete(e.code);
  };

  private handleBlur = () => {
    this.keysHeld.clear();
    this.keysJustPressed.clear();
    this.dragLooking = false;
    this.dragPointerId = null;
  };

  private handleVisibility = () => {
    if (document.hidden) {
      this.keysHeld.clear();
      this.keysJustPressed.clear();
      this.releasePointerLock();
    }
  };

  private handlePointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
    this.emitHud();
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.isFpsActive()) return;
    if (document.pointerLockElement !== this.renderer.domElement) return;
    const sens = 0.0022;
    const dx = Math.max(-180, Math.min(180, e.movementX));
    const dy = Math.max(-180, Math.min(180, e.movementY));
    this.fpsYaw -= dx * sens;
    this.fpsPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.fpsPitch - dy * sens));
    this.lookDeltaX = Math.max(-0.5, Math.min(0.5, this.lookDeltaX + dx * sens));
    this.lookDeltaY = Math.max(-0.5, Math.min(0.5, this.lookDeltaY + dy * sens));
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (this.phase !== 'playing') return;
    if (this.isFpsActive() && e.pointerType === 'mouse') {
      if (!this.pointerLocked) {
        this.requestPointerLockSafe();
        this.dragLooking = true;
        this.dragPointerId = e.pointerId;
        this.lastDragX = e.clientX;
        this.lastDragY = e.clientY;
      }
    }
    if (e.button === 2) {
      if (this.isFpsActive()) {
        this.p1.dashBuffer = 0.14;
      } else {
        this.tryPlayerNova(this.p1);
      }
    } else if (e.button === 0) {
      this.p1.attackBuffer = 0.14;
    }
  };

  private handlePointerMove = (e: PointerEvent) => {
    if (!this.isFpsActive() || this.pointerLocked) return;
    if (!this.dragLooking || this.dragPointerId !== e.pointerId) return;
    const dx = e.clientX - this.lastDragX;
    const dy = e.clientY - this.lastDragY;
    this.lastDragX = e.clientX;
    this.lastDragY = e.clientY;
    this.addLookDelta(dx, dy);
  };

  private handlePointerUp = (e: PointerEvent) => {
    if (this.dragPointerId === e.pointerId) {
      this.dragLooking = false;
      this.dragPointerId = null;
    }
  };

  private handleContextMenu = (e: MouseEvent) => {
    if (this.phase === 'playing') e.preventDefault();
  };

  private handleResize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.bloomPass?.resolution.set(w, h);
    this.renderFrame();
  }

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateAtmosphere(dt: number, now: number): void {
    this.worldClouds.rotation.y += dt * 0.014;
    this.sanctuarySigil.rotation.z += dt * 0.09;
    (this.sanctuarySigil.material as THREE.MeshBasicMaterial).opacity =
      0.46 + Math.sin(now * 0.0024) * 0.14;

    for (let i = 0; i < this.brazierFlames.length; i++) {
      const fl = this.brazierFlames[i];
      fl.rotation.y += dt * 1.6;
      const pulse = 1 + Math.sin(now * 0.007 + i * 1.7) * 0.14;
      fl.scale.set(0.85 * pulse, 1.35 * pulse, 0.85 * pulse);
    }

    for (let i = 0; i < this.brazierLights.length; i++) {
      this.brazierLights[i].intensity =
        16 + Math.sin(now * 0.011 + i * 2.1) * 3.5 + Math.sin(now * 0.027 + i) * 1.4;
    }

    if (this.flashLight.intensity > 0.05) {
      this.flashLight.intensity *= Math.exp(-15 * dt);
    } else {
      this.flashLight.intensity = 0;
    }

    // Animate gently drifting Skyrim alpine snowflakes falling in mountain wind
    const posAttr = this.emberPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    const count = arr.length / 3;
    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      arr[i3] += (this.emberVelocities[i3] + Math.sin(now * 0.0012 + i) * 0.35) * dt;
      arr[i3 + 1] += this.emberVelocities[i3 + 1] * dt;
      arr[i3 + 2] += (this.emberVelocities[i3 + 2] + Math.cos(now * 0.001 + i) * 0.35) * dt;
      if (arr[i3 + 1] < 0.05 || Math.hypot(arr[i3], arr[i3 + 2]) > ARENA_RADIUS + 8) {
        arr[i3 + 1] = 13.5 + ((i * 19) % 10) * 0.25;
        const ang = (i * 2.39996 + now * 0.0001) % (Math.PI * 2);
        const rad = ((i * 73) % 100) * 0.01 * (ARENA_RADIUS + 3.5);
        arr[i3] = Math.cos(ang) * rad;
        arr[i3 + 2] = Math.sin(ang) * rad;
      }
    }
    posAttr.needsUpdate = true;
  }

  private tick(): void {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = clampDeltaTime(rawDt);

    // Telemetry sampling
    this.frameCounter++;
    this.frameMsAccum += rawDt * 1000;
    this.telemetryAccum += Math.min(rawDt, 0.25);
    if (this.telemetryAccum >= 0.8) {
      const avgMs = this.frameMsAccum / Math.max(1, this.frameCounter);
      const fps = Math.round(1000 / Math.max(1, avgMs));
      this.onTelemetry({
        fps: Math.min(144, fps),
        frameMs: Number(avgMs.toFixed(1)),
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        isSoftwareGl: this.isSoftwareGl,
      });
      this.frameCounter = 0;
      this.frameMsAccum = 0;
      this.telemetryAccum = 0;
    }

    this.updateAtmosphere(dt, now);

    if (this.phase === 'title') {
      this.titleAngle += dt * 0.16;
      const camX = Math.sin(this.titleAngle) * 10.2;
      const camZ = 2.4 + Math.cos(this.titleAngle) * 9.8;
      this.camera.position.set(camX, 3.8 + Math.sin(this.titleAngle * 1.4) * 0.4, camZ);
      this.camera.lookAt(-1.2, 1.45, 2.0);
      this.p1.rig.root.rotation.y = Math.sin(now * 0.0009) * 0.52;
      this.p1.rig.bodyGroup.position.y = Math.sin(now * 0.003) * 0.04;
      if (this.p1.rig.cloakMesh) {
        this.p1.rig.cloakMesh.rotation.x = 0.06 + Math.sin(now * 0.0035) * 0.08;
      }
      if (this.p1.blenderRig) {
        transitionRigAnimation(this.p1.blenderRig, 'idle', 0.16);
        this.p1.blenderRig.mixer?.update(dt);
      }
    } else if (this.phase === 'playing') {
      this.stepPlaying(dt, now * 0.001);
    }

    this.updateParticles(dt);
    this.renderFrame();
    this.keysJustPressed.clear();
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.scheduleNextFrame();
  }

  private stepPlaying(dt: number, nowSec: number): void {
    this.elapsedSec += dt;
    this.trauma = Math.max(0, this.trauma - dt * 2.4);
    this.hitmarkerTimer = Math.max(0, this.hitmarkerTimer - dt);
    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - dt);
      if (this.bannerTimer === 0) this.bannerText = '';
    }

    if (this.pendingDefeat) {
      this.defeatDelay -= dt;
      this.updateCamera(dt, nowSec);
      if (this.defeatDelay <= 0) {
        const outcome = this.pendingDefeat;
        this.pendingDefeat = null;
        this.phase = outcome;
        document.body.dataset.state = 'gameover';
        this.releasePointerLock();
        this.audio.playFanfare(outcome === 'victory');
        this.emitHud();
        this.onRunComplete({
          outcome,
          score: this.score,
          wave: this.wave,
          kills: this.kills,
          durationSec: Math.round(this.elapsedSec),
          mode: this.mode,
          rigUsed: this.customRigData ? this.customRigData.summary.fileName : this.activeRigId,
        });
      }
      return;
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.updateCamera(dt, nowSec);
      return;
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    const fps = this.isFpsActive();

    // Smooth keyboard look fallback in Solo FPS (Arrow keys)
    if (fps) {
      const turnSpeed = 2.35;
      if (this.keysHeld.has('ArrowLeft')) {
        this.fpsYaw += turnSpeed * dt;
        this.lookDeltaX -= turnSpeed * dt * 0.45;
      }
      if (this.keysHeld.has('ArrowRight')) {
        this.fpsYaw -= turnSpeed * dt;
        this.lookDeltaX += turnSpeed * dt * 0.45;
      }
      if (this.keysHeld.has('ArrowUp')) {
        this.fpsPitch = Math.min(MAX_PITCH, this.fpsPitch + 1.5 * dt);
      }
      if (this.keysHeld.has('ArrowDown')) {
        this.fpsPitch = Math.max(-MAX_PITCH, this.fpsPitch - 1.5 * dt);
      }
    }

    // Compute Player 1 wish direction (camera-relative in FPS, world-relative in 3rd-person)
    let fwdInput = -this.touchMove.z;
    let rightInput = this.touchMove.x;
    if (this.keysHeld.has('KeyW')) fwdInput += 1;
    if (this.keysHeld.has('KeyS')) fwdInput -= 1;
    if (this.keysHeld.has('KeyD')) rightInput += 1;
    if (this.keysHeld.has('KeyA')) rightInput -= 1;
    if (!fps && this.mode === 'solo') {
      if (this.keysHeld.has('ArrowUp')) fwdInput += 1;
      if (this.keysHeld.has('ArrowDown')) fwdInput -= 1;
      if (this.keysHeld.has('ArrowRight')) rightInput += 1;
      if (this.keysHeld.has('ArrowLeft')) rightInput -= 1;
    }

    const p1Wish = fps
      ? computeFpsWishDirection(fwdInput, rightInput, this.fpsYaw)
      : { x: rightInput, z: -fwdInput };
    const p1Sprint =
      this.touchSprint ||
      this.keysHeld.has('ShiftLeft') ||
      (this.mode === 'solo' && this.keysHeld.has('ShiftRight'));

    if (this.keysJustPressed.has('KeyJ') || (this.mode === 'solo' && this.keysJustPressed.has('Enter'))) {
      this.p1.attackBuffer = 0.14;
    }

    // Player 2 input (local multiplayer)
    let p2mx = 0;
    let p2mz = 0;
    if (this.mode !== 'solo') {
      if (this.keysHeld.has('ArrowLeft')) p2mx -= 1;
      if (this.keysHeld.has('ArrowRight')) p2mx += 1;
      if (this.keysHeld.has('ArrowUp')) p2mz -= 1;
      if (this.keysHeld.has('ArrowDown')) p2mz += 1;
      if (this.keysJustPressed.has('ShiftRight')) this.p2.dashBuffer = 0.14;
      if (this.keysJustPressed.has('Enter') || this.keysJustPressed.has('Slash')) {
        this.p2.attackBuffer = 0.14;
      }
    }

    this.stepPlayerCombatAndPhysics(this.p1, p1Wish.x, p1Wish.z, p1Sprint, fps, dt);
    if (this.mode !== 'solo') {
      this.stepPlayerCombatAndPhysics(this.p2, p2mx, p2mz, false, false, dt);
    }

    // Duel mode PvP vs Survival Wave mode
    if (this.mode === 'duel2p') {
      this.stepDuelCombat();
    } else {
      this.stepWaveAndEnemies(dt);
    }

    // Keep enemies separated from each other and outside FPS camera near plane
    separateActors(
      this.enemies,
      this.mode === 'solo' ? [this.p1] : [this.p1, this.p2],
    );

    this.stepProjectiles(dt);
    this.stepRelics(dt);
    this.updateCamera(dt, nowSec);

    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.08) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }
  }

  private stepPlayerCombatAndPhysics(
    p: PlayerActor,
    wishX: number,
    wishZ: number,
    sprinting: boolean,
    isFpsPlayer: boolean,
    dt: number,
  ): void {
    p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    p.dashBuffer = Math.max(0, p.dashBuffer - dt);
    p.attackBuffer = Math.max(0, p.attackBuffer - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    p.energy = Math.min(PLAYER_MAX_ENERGY, p.energy + dt * 10);

    if (isFpsPlayer) {
      p.facingX = -Math.sin(this.fpsYaw);
      p.facingZ = -Math.cos(this.fpsYaw);
    } else {
      const len = Math.hypot(wishX, wishZ);
      if (len > 0.05) {
        p.facingX = wishX / len;
        p.facingZ = wishZ / len;
      }
    }

    // Buffered Directional Shadow Dash
    if (p.dashBuffer > 0 && p.dashCooldown <= 0 && p.hp > 0) {
      p.dashBuffer = 0;
      p.dashTimer = 0.18;
      p.dashCooldown = 0.72;
      p.invulnTimer = Math.max(p.invulnTimer, 0.26);
      p.squashY = 1.18;
      const wLen = Math.hypot(wishX, wishZ);
      const dx = wLen > 0.08 ? wishX / wLen : p.facingX;
      const dz = wLen > 0.08 ? wishZ / wLen : p.facingZ;
      p.dashVx = dx * 20.5;
      p.dashVz = dz * 20.5;
      this.audio.playDash();
      this.spawnParticles(p.x, p.y + 0.9, p.z, p.id === 'p1' ? 0x38bdf8 : 0xfb923c, 12, 5.8);
      if (p.blenderRig) transitionRigAnimation(p.blenderRig, 'dash', 0.05);
    }

    if (p.dashTimer > 0) {
      p.dashTimer = Math.max(0, p.dashTimer - dt);
    }

    // Buffered Attack / 3D Crosshair-Aimed Shadow Arrow Volley
    if (p.attackBuffer > 0 && p.attackCooldown <= 0 && p.hp > 0) {
      p.attackBuffer = 0;
      p.attackTimer = 0.22;
      p.attackCooldown = 0.30;
      p.attackDidHit = false;
      p.squashY = 0.86;
      this.audio.playSlash();
      if (p.blenderRig) transitionRigAnimation(p.blenderRig, 'attack', 0.05);
      if (p.id === 'p1' && this.activeRigId === 'ranger') {
        this.spawnPlayerShadowArrow(p, isFpsPlayer);
      }
    }

    // Deterministic Fixed-Timestep Walk, Sprint, Jump, Gravity, and Wall-Slide Physics
    let localAccum = this.physicsAccum + dt;
    let substeps = 0;
    let jumpTrigger = p.jumpQueued;
    p.jumpQueued = false;

    while (localAccum >= FIXED_PHYSICS_DT && substeps < 4) {
      const res = stepFirstPersonPhysics(
        p.physics,
        {
          wishX: p.hp > 0 ? wishX : 0,
          wishZ: p.hp > 0 ? wishZ : 0,
          sprint: sprinting && p.hp > 0,
          jumpPressed: jumpTrigger && p.hp > 0,
          dashActive: p.dashTimer > 0,
          dashVx: p.dashVx,
          dashVz: p.dashVz,
        },
        FIXED_PHYSICS_DT,
        PLAYER_RADIUS,
      );
      jumpTrigger = false;
      localAccum -= FIXED_PHYSICS_DT;
      substeps++;

      if (p.id === 'p1') {
        if (res.jumped) {
          this.audio.playJump();
          this.landDipVel -= 1.6;
        }
        if (res.landed) {
          this.audio.playLand(res.impactSpeed);
          this.landDipVel += Math.min(3.2, res.impactSpeed * 0.24);
          this.spawnParticles(p.physics.x, 0.12, p.physics.z, 0xc8a96e, 8, 3.2);
        }
        if (res.footstepTriggered) {
          this.audio.playFootstep(sprinting);
        }
      }
    }
    if (p.id === 'p1') {
      this.physicsAccum = localAccum;
    }

    p.x = p.physics.x;
    p.y = p.physics.y;
    p.z = p.physics.z;
    p.vx = p.physics.vx;
    p.vz = p.physics.vz;

    // Active slash hit window
    if (p.attackTimer > 0) {
      p.attackTimer = Math.max(0, p.attackTimer - dt);
      const progress = 1 - p.attackTimer / 0.22;
      const slashMat = p.slashArc.material as THREE.MeshBasicMaterial;
      slashMat.opacity = isFpsPlayer ? 0 : Math.sin(progress * Math.PI) * 0.85;
      p.slashArc.rotation.z = -1.2 + progress * 2.4;
      p.rig.weaponPivot.rotation.y = -1.3 + progress * 2.6;

      if (!p.attackDidHit && progress > 0.18 && progress < 0.78) {
        this.applyPlayerSlashHits(p, isFpsPlayer);
      }
    } else {
      (p.slashArc.material as THREE.MeshBasicMaterial).opacity = 0;
      p.rig.weaponPivot.rotation.y *= Math.max(0, 1 - dt * 12);
    }

    // Nova ring VFX
    if (p.novaTimer > 0) {
      p.novaTimer = Math.max(0, p.novaTimer - dt);
      const t = 1 - p.novaTimer / 0.38;
      p.novaRing.position.set(p.x, 0.16, p.z);
      p.novaRing.scale.setScalar(1 + t * 6.8);
      (p.novaRing.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.92;
    } else {
      (p.novaRing.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    // Visual body transform & Blender skeletal animations (visible in 3rd-person / 2P)
    const horizSpeed = Math.hypot(p.vx, p.vz);
    p.gaitPhase += horizSpeed * dt * 2.1;
    p.squashY += (1 - p.squashY) * (1 - Math.exp(-14 * dt));
    const xzScale = 1 / Math.sqrt(Math.max(0.5, p.squashY));

    p.rig.root.position.set(p.x, p.y, p.z);
    const targetRot = Math.atan2(p.facingX, p.facingZ);
    let diff = targetRot - p.rig.root.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.rig.root.rotation.y += diff * (1 - Math.exp(-18 * dt));

    p.rig.bodyGroup.scale.set(xzScale, p.squashY, xzScale);
    p.rig.bodyGroup.position.y =
      p.physics.grounded && horizSpeed > 0.5 ? Math.abs(Math.sin(p.gaitPhase)) * 0.11 : 0;
    const swing = p.physics.grounded && horizSpeed > 0.4 ? Math.sin(p.gaitPhase) * 0.58 : 0;
    p.rig.leftLeg.rotation.x = swing;
    p.rig.rightLeg.rotation.x = -swing;
    if (p.rig.cloakMesh) {
      p.rig.cloakMesh.rotation.x =
        horizSpeed > 0.5 ? 0.28 + Math.sin(p.gaitPhase * 1.4) * 0.14 : 0.06;
    }

    for (const mat of p.rig.materialsToFlash) {
      mat.emissive.setHex(p.hitFlash > 0 ? 0xffffff : 0x000000);
      mat.emissiveIntensity = p.hitFlash > 0 ? 0.85 : 0;
    }

    if (p.blenderRig) {
      p.blenderRig.group.scale.set(xzScale, p.squashY, xzScale);
      if (p.dashTimer <= 0 && p.attackTimer <= 0) {
        transitionRigAnimation(p.blenderRig, horizSpeed > 0.55 ? 'run' : 'idle', 0.12);
      }
      applyRigFlashTint(p.blenderRig, p.hitFlash > 0 ? 0xffffff : null, 0.85);
      p.blenderRig.mixer?.update(dt);
    }
  }

  private tryPlayerNova(p: PlayerActor): void {
    if (p.hp <= 0 || p.energy < 45) return;
    p.energy -= 45;
    p.novaTimer = 0.42;
    p.squashY = 1.24;
    this.trauma = Math.min(1, this.trauma + 0.55);
    this.audio.playNova();
    this.bannerText = 'FUS RO DAH!';
    this.bannerTimer = 1.1;
    this.triggerCombatFlash(p.x, p.y + 1.5, p.z, 0x7dd3fc, 28);
    this.spawnParticles(p.x, p.y + 1.1, p.z, 0xbae6fd, 32, 12.0);

    let hitAny = false;
    for (const enemy of this.enemies) {
      if (enemy.state === 'ko') continue;
      const dist = Math.hypot(enemy.x - p.x, enemy.z - p.z);
      if (dist <= 6.8) {
        this.damageEnemy(enemy, 3, enemy.x - p.x, enemy.z - p.z, true);
        hitAny = true;
      }
    }

    if (this.mode === 'duel2p') {
      const other = p.id === 'p1' ? this.p2 : this.p1;
      const dist = Math.hypot(other.x - p.x, other.z - p.z);
      if (dist <= 5.6 && other.invulnTimer <= 0) {
        this.damagePlayer(other, 2);
        hitAny = true;
      }
    }

    if (hitAny) {
      this.hitstopTimer = Math.max(this.hitstopTimer, computeHitstopDuration('heavy'));
    }
  }

  private applyPlayerSlashHits(p: PlayerActor, isFpsPlayer: boolean): void {
    let connected = false;
    const reachBonus = isFpsPlayer ? 0.65 : 0;
    const minDot = isFpsPlayer ? 0.25 : 0.12;
    for (const enemy of this.enemies) {
      if (enemy.state === 'ko') continue;
      if (
        isMeleeArcHit(
          { x: p.x, z: p.z },
          p.facingX,
          p.facingZ,
          { x: enemy.x, z: enemy.z },
          3.55 + reachBonus + enemy.radius,
          minDot,
        )
      ) {
        this.damageEnemy(enemy, 1, enemy.x - p.x, enemy.z - p.z, false);
        connected = true;
      }
    }

    if (this.mode === 'duel2p') {
      const other = p.id === 'p1' ? this.p2 : this.p1;
      if (
        other.invulnTimer <= 0 &&
        isMeleeArcHit(
          { x: p.x, z: p.z },
          p.facingX,
          p.facingZ,
          { x: other.x, z: other.z },
          3.2,
          0.15,
        )
      ) {
        this.damagePlayer(other, 1);
        const knock = Math.hypot(other.x - p.x, other.z - p.z) || 1;
        other.physics.vx = ((other.x - p.x) / knock) * 11;
        other.physics.vz = ((other.z - p.z) / knock) * 11;
        connected = true;
      }
    }

    if (connected) {
      p.attackDidHit = true;
      p.energy = Math.min(PLAYER_MAX_ENERGY, p.energy + 12);
    }
  }

  private damageEnemy(
    enemy: EnemySim,
    dmg: number,
    kx: number,
    kz: number,
    heavy: boolean,
  ): void {
    enemy.hp -= dmg;
    enemy.hitFlash = 0.09;
    const len = Math.hypot(kx, kz) || 1;
    const impulse = heavy ? 11.5 : 6.2;
    enemy.vx = (kx / len) * impulse;
    enemy.vz = (kz / len) * impulse;

    this.hitmarkerTimer = 0.18;
    this.hitmarkerKill = enemy.hp <= 0;

    if (enemy.hp <= 0) {
      enemy.state = 'ko';
      enemy.stateTimer = 0.36;
      enemy.hasToken = false;
      this.kills++;
      this.combo++;
      this.comboTimer = 4.2;
      this.score += calculateKillScore(enemy.kind, this.combo, this.wave);
      this.trauma = Math.min(1, this.trauma + 0.44);
      this.hitstopTimer = Math.max(this.hitstopTimer, computeHitstopDuration('kill'));
      this.audio.playHit(true);
      this.triggerCombatFlash(enemy.x, 1.3, enemy.z, 0xfbbf24, 22);
      this.spawnParticles(enemy.x, 1.2, enemy.z, 0xfbbf24, 22, 8.2);

      if (Math.random() < 0.34) {
        this.spawnRelic(enemy.x, enemy.z, Math.random() < 0.45 ? 'heal' : 'energy');
      }
    } else {
      this.trauma = Math.min(1, this.trauma + (heavy ? 0.28 : 0.14));
      this.hitstopTimer = Math.max(
        this.hitstopTimer,
        computeHitstopDuration(heavy ? 'heavy' : 'light'),
      );
      this.audio.playHit(heavy);
      this.triggerCombatFlash(enemy.x, 1.3, enemy.z, 0x67e8f9, 14);
      this.spawnParticles(enemy.x, 1.2, enemy.z, 0x67e8f9, 10, 5.5);
    }
  }

  private damagePlayer(p: PlayerActor, dmg: number): void {
    if (p.invulnTimer > 0 || p.hp <= 0) return;
    p.hp = Math.max(0, p.hp - dmg);
    p.invulnTimer = 0.95;
    p.hitFlash = 0.14;
    p.squashY = 0.74;
    this.trauma = Math.min(1, this.trauma + 0.58);
    this.hitstopTimer = Math.max(this.hitstopTimer, computeHitstopDuration('playerHurt'));
    this.audio.playPlayerHurt();
    this.triggerCombatFlash(p.x, p.y + 1.3, p.z, 0xf43f5e, 18);
    this.spawnParticles(p.x, p.y + 1.1, p.z, 0xf43f5e, 16, 6.4);

    if (this.mode === 'duel2p' && p.hp <= 0) {
      const winner = p.id === 'p1' ? this.p2 : this.p1;
      winner.score += 1;
      this.score = Math.max(this.p1.score, this.p2.score) * 500;
      this.kills = this.p1.score + this.p2.score;
      if (winner.score >= 5) {
        this.winnerLabel = winner.id === 'p1' ? 'PLAYER 1 WINS DUEL' : 'PLAYER 2 WINS DUEL';
        this.pendingDefeat = 'victory';
        this.defeatDelay = 0.55;
      } else {
        this.bannerText = `${winner.id === 'p1' ? 'PLAYER 1' : 'PLAYER 2'} SCORES (${this.p1.score} - ${this.p2.score})`;
        this.bannerTimer = 1.6;
        this.resetPlayer(this.p1, -5.5, 0, 1, 0);
        this.resetPlayer(this.p2, 5.5, 0, -1, 0);
      }
      return;
    }

    const allDown =
      this.mode === 'solo' ? this.p1.hp <= 0 : this.p1.hp <= 0 && this.p2.hp <= 0;
    if (allDown && !this.pendingDefeat) {
      this.pendingDefeat = 'defeat';
      this.defeatDelay = 0.55;
    }
  }

  private stepDuelCombat(): void {
    if (this.relics.length < 2 && Math.random() < 0.008) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * 7;
      this.spawnRelic(Math.cos(ang) * dist, Math.sin(ang) * dist, 'energy');
    }
  }

  private stepWaveAndEnemies(dt: number): void {
    if (this.waveQueue.length > 0 && this.enemies.length < 7) {
      this.waveSpawnTimer -= dt;
      if (this.waveSpawnTimer <= 0) {
        this.spawnEnemyFromQueue();
        this.waveSpawnTimer = Math.max(0.85, 1.95 - this.wave * 0.18);
      }
    }

    const activeTokens = this.enemies.filter((e) => e.hasToken && e.state !== 'ko').length;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const visual = this.enemyMeshes.get(e.id);
      const hpBar = this.enemyHpBars.get(e.id);

      let targetPlayer = this.p1;
      if (this.mode === 'coop2p' && this.p2.hp > 0) {
        if (this.p1.hp <= 0) {
          targetPlayer = this.p2;
        } else {
          const d1 = Math.hypot(this.p1.x - e.x, this.p1.z - e.z);
          const d2 = Math.hypot(this.p2.x - e.x, this.p2.z - e.z);
          if (d2 < d1) targetPlayer = this.p2;
        }
      }

      const stepRes = stepEnemyAI(
        e,
        { x: targetPlayer.x, z: targetPlayer.z },
        dt,
        this.waveSpeedMult,
        activeTokens,
        this.waveMaxTokens,
      );

      if (stepRes.telegraphStarted) {
        this.audio.playTelegraph();
      }
      if (stepRes.meleeHit && targetPlayer.y < 1.35) {
        this.damagePlayer(targetPlayer, 1);
      }
      if (stepRes.spawnedProjectile) {
        const pSim: ProjectileSim = {
          id: this.nextProjectileId++,
          ...stepRes.spawnedProjectile,
        };
        this.projectiles.push(pSim);
        const mesh = new THREE.Mesh(this.sharedBoltGeo, this.sharedEnemyBoltMat);
        mesh.position.set(pSim.x, pSim.y, pSim.z);
        this.scene.add(mesh);
        this.projectileMeshes.set(pSim.id, mesh);
      }

      if (visual) {
        visual.root.position.set(e.x, 0, e.z);
        visual.root.rotation.y = e.rotY;
        if (visual.spinner) {
          visual.spinner.rotation.y += dt * 2.8;
          visual.spinner.rotation.z += dt * 1.4;
        }

        const teleMat = visual.telegraphMesh.material as THREE.MeshBasicMaterial;
        if (e.state === 'telegraph') {
          teleMat.opacity = 0.55 + Math.sin(performance.now() * 0.03) * 0.25;
        } else {
          teleMat.opacity = 0;
        }

        const eb = this.enemyBlenderRigs.get(e.id);
        if (e.state === 'ko') {
          const t = Math.max(0, e.stateTimer / 0.36);
          visual.body.rotation.x = (1 - t) * 1.45;
          visual.body.scale.setScalar(Math.max(0.05, t));
          if (eb) {
            eb.group.rotation.x = (1 - t) * 1.45;
            eb.group.scale.setScalar(Math.max(0.05, t));
          }
        } else {
          const flash = e.hitFlash > 0 || e.state === 'telegraph';
          const flashHex = e.hitFlash > 0 ? 0xffffff : e.state === 'telegraph' ? 0xff4500 : null;
          const flashIntensity = e.hitFlash > 0 ? 0.9 : 0.55;
          for (const mat of visual.materialsToFlash) {
            mat.emissive.setHex(flashHex ?? 0x000000);
            mat.emissiveIntensity = flash ? flashIntensity : 0;
          }
          if (eb) {
            if (e.state === 'attack' || e.state === 'telegraph') {
              transitionRigAnimation(eb, 'attack', 0.08);
            } else if (e.state === 'approach' || e.state === 'orbit') {
              transitionRigAnimation(eb, 'run', 0.12);
            } else {
              transitionRigAnimation(eb, 'idle', 0.12);
            }
            applyRigFlashTint(eb, flash ? flashHex : null, flashIntensity);
            eb.mixer?.update(dt);
          }
        }
      }

      if (hpBar) {
        const showBar = e.state !== 'ko' && e.hp > 0 && e.hp < e.maxHp;
        hpBar.group.visible = showBar;
        if (showBar) {
          const yOff = e.kind === 'charger' ? 2.85 : e.kind === 'swarmer' ? 1.65 : 2.55;
          hpBar.group.position.set(e.x, yOff, e.z);
          hpBar.group.lookAt(this.camera.position);
          const ratio = Math.max(0.05, e.hp / Math.max(1, e.maxHp));
          hpBar.fill.scale.x = ratio;
          hpBar.fill.position.x = -(1 - ratio) * 0.55;
        }
      }

      if (e.state === 'ko' && e.stateTimer <= 0) {
        const eb = this.enemyBlenderRigs.get(e.id);
        if (eb) {
          eb.dispose();
          this.enemyBlenderRigs.delete(e.id);
        }
        if (hpBar) {
          this.scene.remove(hpBar.group);
          this.enemyHpBars.delete(e.id);
        }
        if (visual) {
          this.scene.remove(visual.root);
          this.enemyMeshes.delete(e.id);
        }
        this.enemies.splice(i, 1);
      }
    }

    if (this.waveQueue.length === 0 && this.enemies.length === 0 && !this.pendingDefeat) {
      if (this.wave >= MAX_WAVES) {
        this.winnerLabel = 'ALL 5 CITADEL WAVES CLEARED';
        this.pendingDefeat = 'victory';
        this.defeatDelay = 0.45;
      } else {
        this.score += 400 * this.wave;
        this.audio.playPickup();
        this.startWave(this.wave + 1);
      }
    }
  }

  private spawnPlayerShadowArrow(p: PlayerActor, isFpsPlayer: boolean): void {
    const speed = isFpsPlayer ? 32.0 : 24.0;
    let ox = p.x + p.facingX * 0.9;
    let oy = p.y + 1.25;
    let oz = p.z + p.facingZ * 0.9;
    let vx = p.facingX * speed;
    let vy = 0;
    let vz = p.facingZ * speed;

    if (isFpsPlayer) {
      const cosP = Math.cos(this.fpsPitch);
      const dirX = -Math.sin(this.fpsYaw) * cosP;
      const dirY = Math.sin(this.fpsPitch);
      const dirZ = -Math.cos(this.fpsYaw) * cosP;
      ox = p.x + dirX * 0.85;
      oy = FPS_EYE_HEIGHT + p.y - 0.14 + dirY * 0.85;
      oz = p.z + dirZ * 0.85;
      vx = dirX * speed;
      vy = dirY * speed;
      vz = dirZ * speed;
    }

    const pSim: ProjectileSim = {
      id: this.nextProjectileId++,
      owner: p.id,
      x: ox,
      y: oy,
      z: oz,
      vx,
      vy,
      vz,
      radius: 0.48,
      damage: 1,
      life: 1.05,
    };
    this.projectiles.push(pSim);
    const arrowMesh = new THREE.Mesh(this.sharedArrowGeo, this.sharedArrowMat);
    arrowMesh.position.set(ox, oy, oz);
    // Align cone tip (+Y) with 3D velocity vector
    _vec3A.set(vx, vy, vz).normalize();
    arrowMesh.quaternion.setFromUnitVectors(_vec3B.set(0, 1, 0), _vec3A);
    this.scene.add(arrowMesh);
    this.projectileMeshes.set(pSim.id, arrowMesh);
    this.triggerCombatFlash(ox, oy, oz, 0xff2b5e, 14);
    this.spawnParticles(ox, oy, oz, 0xd946ef, 6, 4.2);
  }

  private stepProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.z += pr.vz * dt;

      const mesh = this.projectileMeshes.get(pr.id);
      if (mesh) {
        mesh.position.set(pr.x, pr.y, pr.z);
        if (pr.owner === 'enemy') {
          mesh.rotation.y += dt * 8;
        }
      }

      let remove =
        pr.life <= 0 ||
        pr.y < 0.05 ||
        pr.y > 18 ||
        Math.hypot(pr.x, pr.z) > ARENA_RADIUS + 2.5;

      if (!remove && pr.owner === 'enemy') {
        const targets = this.mode === 'solo' ? [this.p1] : [this.p1, this.p2];
        for (const t of targets) {
          const hitHeight = pr.y >= t.y - 0.2 && pr.y <= t.y + 2.1;
          if (t.hp > 0 && hitHeight && Math.hypot(t.x - pr.x, t.z - pr.z) < pr.radius + PLAYER_RADIUS) {
            this.damagePlayer(t, pr.damage);
            remove = true;
            break;
          }
        }
      } else if (!remove && (pr.owner === 'p1' || pr.owner === 'p2')) {
        for (const enemy of this.enemies) {
          if (enemy.state === 'ko') continue;
          const enemyHeight = enemy.kind === 'charger' ? 2.5 : enemy.kind === 'swarmer' ? 1.55 : 2.3;
          const hitHeight = pr.y >= -0.15 && pr.y <= enemyHeight + 0.35;
          if (hitHeight && Math.hypot(enemy.x - pr.x, enemy.z - pr.z) < pr.radius + enemy.radius + 0.15) {
            this.damageEnemy(enemy, pr.damage, pr.vx, pr.vz, false);
            this.p1.energy = Math.min(PLAYER_MAX_ENERGY, this.p1.energy + 8);
            remove = true;
            break;
          }
        }
        if (!remove && this.mode === 'duel2p') {
          const other = pr.owner === 'p1' ? this.p2 : this.p1;
          if (other.hp > 0 && Math.hypot(other.x - pr.x, other.z - pr.z) < pr.radius + PLAYER_RADIUS) {
            this.damagePlayer(other, pr.damage);
            remove = true;
          }
        }
      }

      if (remove) {
        if (mesh) {
          this.scene.remove(mesh);
          this.projectileMeshes.delete(pr.id);
        }
        this.projectiles.splice(i, 1);
      }
    }
  }

  private stepRelics(dt: number): void {
    const players = this.mode === 'solo' ? [this.p1] : [this.p1, this.p2];
    for (let i = this.relics.length - 1; i >= 0; i--) {
      const r = this.relics[i];
      r.age += dt;
      r.mesh.rotation.y += dt * 2.2;
      r.mesh.position.y = Math.sin(r.age * 4) * 0.16;

      let picked = false;
      for (const p of players) {
        if (p.hp > 0 && Math.hypot(p.x - r.x, p.z - r.z) < 1.55) {
          if (r.kind === 'heal') {
            p.hp = Math.min(p.maxHp, p.hp + 1);
          } else {
            p.energy = Math.min(PLAYER_MAX_ENERGY, p.energy + 40);
          }
          this.score += 100;
          this.audio.playPickup();
          this.spawnParticles(r.x, 1.0, r.z, r.kind === 'heal' ? 0x34d399 : 0x38bdf8, 12, 4.8);
          picked = true;
          break;
        }
      }

      if (picked || r.age > 18) {
        this.scene.remove(r.mesh);
        this.relics.splice(i, 1);
      }
    }
  }

  private updateParticles(dt: number): void {
    let anyChanged = false;
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyChanged = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _mat4.makeTranslation(0, -100, 0);
        this.particleInst.setMatrixAt(i, _mat4);
        continue;
      }
      p.vy -= 14 * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.08, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const s = p.scale * (p.life / p.maxLife);
      _vec3A.set(p.x, p.y, p.z);
      _scaleVec.set(s, s, s);
      _mat4.compose(_vec3A, _quat, _scaleVec);
      this.particleInst.setMatrixAt(i, _mat4);
      this.particleInst.setColorAt(i, p.color);
    }
    if (anyChanged) {
      this.particleInst.instanceMatrix.needsUpdate = true;
      if (this.particleInst.instanceColor) this.particleInst.instanceColor.needsUpdate = true;
    }
  }

  private updateCamera(dt: number, nowSec: number): void {
    // Spring-damper landing camera dip
    const springK = 140;
    const springDamp = 18;
    const accel = -springK * this.landDip - springDamp * this.landDipVel;
    this.landDipVel += accel * dt;
    this.landDip = Math.max(-0.22, Math.min(0.32, this.landDip + this.landDipVel * dt));

    if (this.isFpsActive()) {
      const horizSpeed = Math.hypot(this.p1.vx, this.p1.vz);
      const sprinting =
        this.touchSprint ||
        this.keysHeld.has('ShiftLeft') ||
        this.keysHeld.has('ShiftRight');
      const dashing = this.p1.dashTimer > 0;

      // Dynamic FOV punch for sprint & dash immersion
      const targetFov = dashing ? 85 : sprinting && horizSpeed > 5.5 ? 80 : 74;
      this.currentFov += (targetFov - this.currentFov) * (1 - Math.exp(-10 * dt));
      if (Math.abs(this.camera.fov - this.currentFov) > 0.05) {
        this.camera.fov = this.currentFov;
        this.camera.updateProjectionMatrix();
      }

      // Smooth grounded head-bob synchronized with walk cycle
      const targetBob = this.p1.physics.grounded ? Math.min(1, horizSpeed / 8.5) : 0;
      this.smoothBobAmp += (targetBob - this.smoothBobAmp) * (1 - Math.exp(-12 * dt));
      const bobY = Math.sin(this.p1.physics.stepPhase * 2) * 0.052 * this.smoothBobAmp;
      const bobSide = Math.cos(this.p1.physics.stepPhase) * 0.024 * this.smoothBobAmp;

      // Subtle strafe bank roll
      const rightX = Math.cos(this.fpsYaw);
      const rightZ = -Math.sin(this.fpsYaw);
      const strafeSpeed = this.p1.vx * rightX + this.p1.vz * rightZ;
      const targetRoll = Math.max(-0.032, Math.min(0.032, -strafeSpeed * 0.0034));
      this.smoothCamRoll += (targetRoll - this.smoothCamRoll) * (1 - Math.exp(-11 * dt));

      const shake = this.trauma * this.trauma * 0.065;
      const shakePitch = (Math.random() * 2 - 1) * shake;
      const shakeYaw = (Math.random() * 2 - 1) * shake;

      this.camera.position.set(
        this.p1.x + rightX * bobSide,
        FPS_EYE_HEIGHT + this.p1.y + bobY - this.landDip * 0.35,
        this.p1.z + rightZ * bobSide,
      );
      this.camera.rotation.set(
        this.fpsPitch + shakePitch,
        this.fpsYaw + shakeYaw,
        this.smoothCamRoll,
        'YXZ',
      );

      // Update animated 3D First-Person Weapon Viewmodel
      const attackProgress = this.p1.attackTimer > 0 ? 1 - this.p1.attackTimer / 0.22 : 0;
      this.viewmodel.update({
        dt,
        nowSec,
        stepPhase: this.p1.physics.stepPhase,
        horizontalSpeed: horizSpeed,
        grounded: this.p1.physics.grounded,
        sprinting,
        dashing,
        attackProgress,
        lookDeltaX: this.lookDeltaX,
        lookDeltaY: this.lookDeltaY,
        landDip: this.landDip,
      });
      return;
    }

    // 3rd-Person / Local 2P Arena Camera
    if (Math.abs(this.camera.fov - 52) > 0.1) {
      this.currentFov += (52 - this.currentFov) * (1 - Math.exp(-8 * dt));
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    let focusX = this.p1.x;
    let focusZ = this.p1.z;
    let zoomExtra = 0;

    if (this.mode !== 'solo' && this.p2.hp > 0) {
      focusX = (this.p1.x + this.p2.x) * 0.5;
      focusZ = (this.p1.z + this.p2.z) * 0.5;
      const sep = Math.hypot(this.p1.x - this.p2.x, this.p1.z - this.p2.z);
      zoomExtra = Math.min(10, sep * 0.45);
    }

    const shake = this.trauma * this.trauma * 0.65;
    const shakeX = (Math.random() * 2 - 1) * shake;
    const shakeY = (Math.random() * 2 - 1) * shake;

    _vec3A.set(
      focusX + shakeX,
      13.5 + zoomExtra * 0.55 + shakeY,
      focusZ + 14.5 + zoomExtra * 0.7,
    );
    const damp = 1 - Math.exp(-7.5 * dt);
    this.camera.position.lerp(_vec3A, damp);

    _vec3B.set(focusX * 0.85, 1.1 + this.p1.y * 0.3, focusZ * 0.85);
    this.camera.lookAt(_vec3B);
  }

  private emitHud(): void {
    const horizSpeed = Math.hypot(this.p1.vx, this.p1.vz);
    const sprinting =
      horizSpeed > 8.2 &&
      (this.touchSprint ||
        this.keysHeld.has('ShiftLeft') ||
        (this.mode === 'solo' && this.keysHeld.has('ShiftRight')));

    const headingRad = -this.fpsYaw;
    const wrapRel = (angle: number) => {
      let a = (angle + Math.PI) % (Math.PI * 2);
      if (a < 0) a += Math.PI * 2;
      return a - Math.PI;
    };
    const wordWallAz = Math.atan2(0 - this.p1.x, -(-(ARENA_RADIUS + 1.1) - this.p1.z));
    const wordWallBearingRad = wrapRel(wordWallAz - headingRad);
    const enemyBearingsRad: number[] = [];
    for (const enemy of this.enemies) {
      if (enemy.state === 'ko') continue;
      const az = Math.atan2(enemy.x - this.p1.x, -(enemy.z - this.p1.z));
      enemyBearingsRad.push(Number(wrapRel(az - headingRad).toFixed(3)));
    }

    this.onHudUpdate({
      phase: this.phase,
      mode: this.mode,
      cameraMode: this.mode === 'solo' ? this.cameraMode : 'third',
      pointerLocked: this.pointerLocked,
      hitmarker:
        this.hitmarkerTimer > 0 ? (this.hitmarkerKill ? 'kill' : 'hit') : 'none',
      sprinting,
      grounded: this.p1.physics.grounded,
      speed: Number(horizSpeed.toFixed(1)),
      wave: this.wave,
      maxWaves: MAX_WAVES,
      score: Math.round(this.score),
      combo: this.combo,
      kills: this.kills,
      elapsedSec: Math.round(this.elapsedSec),
      p1Hp: this.p1.hp,
      p1MaxHp: this.p1.maxHp,
      p1Energy: Math.round(this.p1.energy),
      p2Active: this.mode !== 'solo',
      p2Hp: this.p2.hp,
      p2MaxHp: this.p2.maxHp,
      p2Score: this.p2.score,
      winnerLabel: this.winnerLabel,
      enemiesRemaining: this.enemies.length + this.waveQueue.length,
      bannerText: this.bannerText,
      cameraHeadingRad: headingRad,
      wordWallBearingRad,
      enemyBearingsRad,
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.releasePointerLock();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('contextmenu', this.handleContextMenu);

    this.viewmodel.dispose();
    this.p1.blenderRig?.dispose();
    this.p2.blenderRig?.dispose();
    for (const [, eb] of this.enemyBlenderRigs) eb.dispose();
    this.enemyBlenderRigs.clear();

    this.shadowTex.dispose();
    this.sharedBoltGeo.dispose();
    this.sharedEnemyBoltMat.dispose();
    this.sharedArrowGeo.dispose();
    this.sharedArrowMat.dispose();
    this.sharedHpBgGeo.dispose();
    this.sharedHpBgMat.dispose();
    this.sharedHpFillGeo.dispose();
    this.sharedHpFillMat.dispose();
    for (const d of this.worldDisposables) d.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
  }
}
