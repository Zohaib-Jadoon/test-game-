import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SkyforgeAudio } from './audio';
import { getDarkFantasyTextures, type DarkFantasyTextureSet } from './darkFantasyTextures';
import {
  buildEnemyModel,
  buildHeroCharacterRig,
  buildSunlitCitadelWorld,
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
  computeHitstopDuration,
  createEnemyForWave,
  isMeleeArcHit,
  PLAYER_MAX_ENERGY,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  resolveArenaBounds,
  stepEnemyAI,
  type EnemySim,
  type GameMode,
  type ProjectileSim,
} from './rules';
import type { LoadedCustomRig } from './assetLoader';

export type GamePhase = 'title' | 'playing' | 'paused' | 'victory' | 'defeat';

export interface HudSnapshot {
  phase: GamePhase;
  mode: GameMode;
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
  z: number;
  vx: number;
  vz: number;
  facingX: number;
  facingZ: number;
  hp: number;
  maxHp: number;
  energy: number;
  score: number;
  invulnTimer: number;
  dashTimer: number;
  dashCooldown: number;
  attackTimer: number;
  attackCooldown: number;
  attackDidHit: boolean;
  jumpBuffer: number;
  attackBuffer: number;
  hitFlash: number;
  squashY: number;
  gaitPhase: number;
  rig: CharacterRigParts;
  customMesh: THREE.Group | null;
  customMixer: THREE.AnimationMixer | null;
  slashArc: THREE.Mesh;
  novaRing: THREE.Mesh;
  novaTimer: number;
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
const PARTICLE_POOL_SIZE = 180;
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

export class SkyforgeEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private audio = new SkyforgeAudio();

  private phase: GamePhase = 'title';
  private mode: GameMode = 'solo';
  private activeRigId: BuiltinRigId = 'ranger';
  private customRigData: LoadedCustomRig | null = null;
  private customEnemyRigData: LoadedCustomRig | null = null;
  private customScenePropsGroup: THREE.Group | null = null;
  private darkTextures!: DarkFantasyTextureSet;

  private frameId = 0;
  private lastTime = 0;
  private disposed = false;

  private shadowTex: THREE.CanvasTexture;
  private worldClouds: THREE.Group;
  private brazierFlames: THREE.Mesh[];
  private worldDisposables: Array<{ dispose: () => void }> = [];

  private p1!: PlayerActor;
  private p2!: PlayerActor;

  private enemies: EnemySim[] = [];
  private enemyMeshes = new Map<number, EnemyMeshParts>();
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
    emissiveIntensity: 2.2,
    roughness: 0.15,
  });
  private sharedArrowGeo = new THREE.ConeGeometry(0.11, 1.05, 5);
  private sharedArrowMat = new THREE.MeshStandardMaterial({
    color: 0xff4d79,
    emissive: 0xd91c5c,
    emissiveIntensity: 2.4,
    roughness: 0.15,
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
    this.onRunComplete = callbacks.onRunComplete;

    this.isSoftwareGl = detectSoftwareWebGL();
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3a2038);
    this.scene.fog = new THREE.FogExp2(0x3a2038, 0.0115);

    this.camera = new THREE.PerspectiveCamera(46, width / Math.max(1, height), 0.2, 220);
    this.camera.position.set(7.2, 4.1, 10.6);
    this.camera.lookAt(-1.4, 1.45, 2.2);

    // Mandatory studio environment map for metallic filigree & scratched-iron reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Twilight Gothic lighting: warm rose-amber key + cool violet hemisphere fill + moonlight silver rim
    const hemi = new THREE.HemisphereLight(0x9cb4f0, 0x3b2134, 1.28);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffd8bc, 2.48);
    keyLight.position.set(16, 28, 18);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 4;
    keyLight.shadow.camera.far = 75;
    keyLight.shadow.camera.left = -24;
    keyLight.shadow.camera.right = 24;
    keyLight.shadow.camera.top = 24;
    keyLight.shadow.camera.bottom = -24;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x94c5ff, 1.05);
    rimLight.position.set(-18, 12, -16);
    this.scene.add(rimLight);

    // Load user-uploaded 6-texture Dark Fantasy PBR set + build Twilight Gothic Citadel
    this.shadowTex = createContactShadowTexture();
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.darkTextures = getDarkFantasyTextures(maxAniso);
    const world = buildSunlitCitadelWorld(this.scene, maxAniso, this.darkTextures);
    this.worldClouds = world.clouds;
    this.brazierFlames = world.brazierFlames;
    this.worldDisposables = world.disposables;

    // Pooled particle InstancedMesh
    const pGeo = new THREE.OctahedronGeometry(0.18, 0);
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

    // Bind window listeners
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('contextmenu', this.handleContextMenu);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);

    this.emitHud();
    this.renderer.render(this.scene, this.camera);
    this.lastTime = performance.now();
    this.scheduleNextFrame();
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
      z,
      vx: 0,
      vz: 0,
      facingX: 0,
      facingZ: -1,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      energy: 60,
      score: 0,
      invulnTimer: 0,
      dashTimer: 0,
      dashCooldown: 0,
      attackTimer: 0,
      attackCooldown: 0,
      attackDidHit: false,
      jumpBuffer: 0,
      attackBuffer: 0,
      hitFlash: 0,
      squashY: 1,
      gaitPhase: 0,
      rig,
      customMesh: null,
      customMixer: null,
      slashArc,
      novaRing,
      novaTimer: 0,
    };
  }

  public setBuiltinRig(rigId: BuiltinRigId): void {
    this.activeRigId = rigId;
    this.customRigData = null;
    this.rebuildP1Visual(rigId, null);
  }

  public applyCustomBlenderRig(rig: LoadedCustomRig): void {
    this.customRigData = rig;
    this.rebuildP1Visual(this.activeRigId, rig);
  }

  /**
   * Places a custom CGTrader/Blender 3D scenery prop (.glb/.gltf/.fbx) on the 4 perimeter ritual pedestals.
   */
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

  /**
   * Applies a custom CGTrader/Blender 3D monster model to newly spawned enemies.
   */
  public applyCustomEnemyRig(rig: LoadedCustomRig | null): void {
    this.customEnemyRigData = rig;
  }

  private rebuildP1Visual(rigId: BuiltinRigId, custom: LoadedCustomRig | null): void {
    const prevPos = this.p1.rig.root.position.clone();
    const prevRot = this.p1.rig.root.rotation.y;

    this.scene.remove(this.p1.rig.root);
    this.scene.remove(this.p1.novaRing);

    const rebuilt = this.createPlayerActor('p1', rigId, prevPos.x, prevPos.z);
    rebuilt.hp = this.p1.hp;
    rebuilt.energy = this.p1.energy;
    rebuilt.score = this.p1.score;
    rebuilt.facingX = this.p1.facingX;
    rebuilt.facingZ = this.p1.facingZ;
    rebuilt.rig.root.rotation.y = prevRot;

    if (custom) {
      rebuilt.rig.bodyGroup.visible = false;
      const cloned = custom.group.clone(true);
      rebuilt.rig.root.add(cloned);
      rebuilt.customMesh = cloned;
      if (custom.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(cloned);
        mixer.clipAction(custom.animations[0]).play();
        rebuilt.customMixer = mixer;
      }
    }

    this.p1 = rebuilt;
  }

  public getAudio(): SkyforgeAudio {
    return this.audio;
  }

  public setTouchInput(moveX: number, moveZ: number): void {
    this.touchMove.x = Math.max(-1, Math.min(1, moveX));
    this.touchMove.z = Math.max(-1, Math.min(1, moveZ));
  }

  public triggerMobileAction(action: 'attack' | 'dash' | 'nova'): void {
    if (this.phase !== 'playing') return;
    if (action === 'attack') this.p1.attackBuffer = 0.14;
    if (action === 'dash') this.p1.jumpBuffer = 0.14;
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
    this.keysHeld.clear();
    this.keysJustPressed.clear();

    // Spawn players in open central area facing clear vista (never facing a wall!)
    this.resetPlayer(this.p1, mode === 'solo' ? 0 : -4.2, 3.2, 0, -1);
    if (mode === 'solo') {
      this.p2.rig.root.visible = false;
    } else {
      this.p2.rig.root.visible = true;
      this.resetPlayer(this.p2, 4.2, mode === 'duel2p' ? -3.2 : 3.2, 0, mode === 'duel2p' ? 1 : -1);
    }

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
    this.emitHud();
  }

  public resumeGame(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    document.body.dataset.state = 'playing';
    this.keysHeld.clear();
    this.lastTime = performance.now();
    this.emitHud();
  }

  public returnToTitle(): void {
    this.clearEntities();
    this.phase = 'title';
    document.body.dataset.state = 'title';
    this.resetPlayer(this.p1, 0, 0, 0, 1);
    this.p2.rig.root.visible = false;
    this.keysHeld.clear();
    this.emitHud();
  }

  private resetPlayer(p: PlayerActor, x: number, z: number, fx: number, fz: number): void {
    p.x = x;
    p.z = z;
    p.vx = 0;
    p.vz = 0;
    p.facingX = fx;
    p.facingZ = fz;
    p.hp = PLAYER_MAX_HP;
    p.energy = 60;
    p.score = 0;
    p.invulnTimer = 1.2; // Safe spawn grace
    p.dashTimer = 0;
    p.dashCooldown = 0;
    p.attackTimer = 0;
    p.attackCooldown = 0;
    p.hitFlash = 0;
    p.squashY = 1;
    p.rig.root.position.set(x, 0, z);
    p.rig.root.rotation.y = Math.atan2(fx, fz);
  }

  private clearEntities(): void {
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
    this.waveSpawnTimer = 0.25; // Prompt first encounter while spawn grace protects player
    this.bannerText = `WAVE ${waveNum} / ${MAX_WAVES}`;
    this.bannerTimer = 2.0;
  }

  private spawnEnemyFromQueue(): void {
    const kind = this.waveQueue.shift();
    if (!kind) return;
    const angle = Math.random() * Math.PI * 2;
    const sim = createEnemyForWave(this.nextEnemyId++, kind, angle, this.wave);
    this.enemies.push(sim);

    const visual = buildEnemyModel(kind, this.shadowTex, this.darkTextures);
    if (this.customEnemyRigData) {
      visual.body.visible = false;
      const customClone = this.customEnemyRigData.group.clone(true);
      customClone.scale.multiplyScalar(kind === 'charger' ? 1.35 : 1.0);
      visual.root.add(customClone);
    }
    visual.root.position.set(sim.x, 0, sim.z);
    this.scene.add(visual.root);
    this.enemyMeshes.set(sim.id, visual);

    this.spawnParticles(sim.x, 1.0, sim.z, 0xc084fc, 8, 4.5);
  }

  private spawnRelic(x: number, z: number, kind: 'heal' | 'energy'): void {
    const group = new THREE.Group();
    const color = kind === 'heal' ? 0x34d399 : 0x38bdf8;
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.36, 0),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.9,
        roughness: 0.2,
      }),
    );
    core.position.y = 0.85;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.48, 0.05, 6, 16),
      new THREE.MeshStandardMaterial({ color: 0xf4d38c, metalness: 0.85, roughness: 0.25 }),
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
      if (code === 'Escape' || code === 'KeyP') {
        this.pauseGame();
      } else if (code === 'KeyM') {
        this.audio.toggleMute();
      } else if (code === 'KeyK') {
        this.tryPlayerNova(this.p1);
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
  };

  private handleVisibility = () => {
    if (document.hidden) {
      this.keysHeld.clear();
      this.keysJustPressed.clear();
    }
  };

  private handlePointerDown = (e: PointerEvent) => {
    if (this.phase !== 'playing') return;
    if (e.button === 2) {
      this.tryPlayerNova(this.p1);
    } else if (e.button === 0) {
      this.p1.attackBuffer = 0.14;
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
    this.renderer.render(this.scene, this.camera);
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

    // Ambient world animation (always alive)
    this.worldClouds.rotation.y += dt * 0.015;
    for (let i = 0; i < this.brazierFlames.length; i++) {
      const fl = this.brazierFlames[i];
      fl.rotation.y += dt * 1.4;
      const pulse = 1 + Math.sin(now * 0.006 + i) * 0.12;
      fl.scale.setScalar(pulse);
    }

    if (this.phase === 'title') {
      this.titleAngle += dt * 0.16;
      const camX = Math.sin(this.titleAngle) * 10.2;
      const camZ = 2.4 + Math.cos(this.titleAngle) * 9.8;
      this.camera.position.set(camX, 4.1 + Math.sin(this.titleAngle * 1.4) * 0.45, camZ);
      this.camera.lookAt(-1.4, 1.4, 2.2);
      this.p1.rig.root.rotation.y = Math.sin(now * 0.0009) * 0.52;
      this.p1.rig.bodyGroup.position.y = Math.sin(now * 0.003) * 0.04;
      if (this.p1.rig.cloakMesh) {
        this.p1.rig.cloakMesh.rotation.x = 0.06 + Math.sin(now * 0.0035) * 0.08;
      }
      this.p1.customMixer?.update(dt);
    } else if (this.phase === 'playing') {
      this.stepPlaying(dt);
    }

    this.updateParticles(dt);
    this.renderer.render(this.scene, this.camera);
    this.keysJustPressed.clear();
    this.scheduleNextFrame();
  }

  private stepPlaying(dt: number): void {
    this.elapsedSec += dt;
    this.trauma = Math.max(0, this.trauma - dt * 2.2);
    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - dt);
      if (this.bannerTimer === 0) this.bannerText = '';
    }

    if (this.pendingDefeat) {
      this.defeatDelay -= dt;
      this.updateCamera(dt);
      if (this.defeatDelay <= 0) {
        const outcome = this.pendingDefeat;
        this.pendingDefeat = null;
        this.phase = outcome;
        document.body.dataset.state = 'gameover';
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

    // Real-dt hitstop freeze (renders flashes/shake while sim pauses briefly)
    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.updateCamera(dt);
      return;
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // Step Player 1
    let p1mx = this.touchMove.x;
    let p1mz = this.touchMove.z;
    if (this.keysHeld.has('KeyA') || (this.mode === 'solo' && this.keysHeld.has('ArrowLeft'))) p1mx -= 1;
    if (this.keysHeld.has('KeyD') || (this.mode === 'solo' && this.keysHeld.has('ArrowRight'))) p1mx += 1;
    if (this.keysHeld.has('KeyW') || (this.mode === 'solo' && this.keysHeld.has('ArrowUp'))) p1mz -= 1;
    if (this.keysHeld.has('KeyS') || (this.mode === 'solo' && this.keysHeld.has('ArrowDown'))) p1mz += 1;

    if (this.keysJustPressed.has('Space')) this.p1.jumpBuffer = 0.14;
    if (this.keysJustPressed.has('KeyJ') || (this.mode === 'solo' && this.keysJustPressed.has('Enter'))) {
      this.p1.attackBuffer = 0.14;
    }
    this.stepPlayer(this.p1, p1mx, p1mz, dt);

    // Step Player 2 if local multiplayer
    if (this.mode !== 'solo') {
      let p2mx = 0;
      let p2mz = 0;
      if (this.keysHeld.has('ArrowLeft')) p2mx -= 1;
      if (this.keysHeld.has('ArrowRight')) p2mx += 1;
      if (this.keysHeld.has('ArrowUp')) p2mz -= 1;
      if (this.keysHeld.has('ArrowDown')) p2mz += 1;

      if (this.keysJustPressed.has('ShiftRight') || this.keysJustPressed.has('ShiftLeft')) {
        this.p2.jumpBuffer = 0.14;
      }
      if (this.keysJustPressed.has('Enter') || this.keysJustPressed.has('Slash')) {
        this.p2.attackBuffer = 0.14;
      }
      this.stepPlayer(this.p2, p2mx, p2mz, dt);
    }

    // Duel mode PvP vs Survival Wave mode
    if (this.mode === 'duel2p') {
      this.stepDuelCombat();
    } else {
      this.stepWaveAndEnemies(dt);
    }

    this.stepProjectiles(dt);
    this.stepRelics(dt);
    this.updateCamera(dt);

    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.1) {
      this.hudEmitAccum = 0;
      this.emitHud();
    }
  }

  private stepPlayer(p: PlayerActor, moveX: number, moveZ: number, dt: number): void {
    p.invulnTimer = Math.max(0, p.invulnTimer - dt);
    p.dashCooldown = Math.max(0, p.dashCooldown - dt);
    p.attackCooldown = Math.max(0, p.attackCooldown - dt);
    p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
    p.attackBuffer = Math.max(0, p.attackBuffer - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt);
    p.energy = Math.min(PLAYER_MAX_ENERGY, p.energy + dt * 10);

    const len = Math.hypot(moveX, moveZ);
    const nx = len > 0.05 ? moveX / len : 0;
    const nz = len > 0.05 ? moveZ / len : 0;

    if (len > 0.05) {
      p.facingX = nx;
      p.facingZ = nz;
    }

    // Buffered Dash
    if (p.jumpBuffer > 0 && p.dashCooldown <= 0 && p.hp > 0) {
      p.jumpBuffer = 0;
      p.dashTimer = 0.18;
      p.dashCooldown = 0.75;
      p.invulnTimer = Math.max(p.invulnTimer, 0.24);
      p.squashY = 1.2;
      p.vx = p.facingX * 19.5;
      p.vz = p.facingZ * 19.5;
      this.audio.playDash();
      this.spawnParticles(p.x, 0.9, p.z, p.id === 'p1' ? 0x38bdf8 : 0xfb923c, 10, 5.5);
    }

    // Buffered Slash / Shadow Arrow Volley
    if (p.attackBuffer > 0 && p.attackCooldown <= 0 && p.hp > 0) {
      p.attackBuffer = 0;
      p.attackTimer = 0.22;
      p.attackCooldown = 0.34;
      p.attackDidHit = false;
      p.squashY = 0.86;
      this.audio.playSlash();
      // Banshee Ranger also fires a piercing crimson shadow arrow from her carved bow!
      if (p.id === 'p1' && this.activeRigId === 'ranger' && !this.customRigData) {
        this.spawnPlayerShadowArrow(p);
      }
    }

    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
    } else if (p.hp > 0) {
      const speed = 8.4;
      const targetVx = nx * speed;
      const targetVz = nz * speed;
      const damp = 1 - Math.exp(-16 * dt);
      p.vx += (targetVx - p.vx) * damp;
      p.vz += (targetVz - p.vz) * damp;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
    }

    const clamped = resolveArenaBounds(p.x, p.z, PLAYER_RADIUS);
    p.x = clamped.x;
    p.z = clamped.z;

    // Active slash hit window
    if (p.attackTimer > 0) {
      p.attackTimer = Math.max(0, p.attackTimer - dt);
      const progress = 1 - p.attackTimer / 0.22;
      const slashMat = p.slashArc.material as THREE.MeshBasicMaterial;
      slashMat.opacity = Math.sin(progress * Math.PI) * 0.85;
      p.slashArc.rotation.z = -1.2 + progress * 2.4;
      p.rig.weaponPivot.rotation.y = -1.3 + progress * 2.6;

      if (!p.attackDidHit && progress > 0.2 && progress < 0.75) {
        this.applyPlayerSlashHits(p);
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
      p.novaRing.scale.setScalar(1 + t * 6.5);
      (p.novaRing.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.9;
    } else {
      (p.novaRing.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    // Gait-synced procedural leg animation & squash-and-stretch damping
    const horizSpeed = Math.hypot(p.vx, p.vz);
    p.gaitPhase += horizSpeed * dt * 2.1;
    p.squashY += (1 - p.squashY) * (1 - Math.exp(-14 * dt));
    const xzScale = 1 / Math.sqrt(Math.max(0.5, p.squashY));

    p.rig.root.position.set(p.x, 0, p.z);
    const targetRot = Math.atan2(p.facingX, p.facingZ);
    let diff = targetRot - p.rig.root.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.rig.root.rotation.y += diff * (1 - Math.exp(-18 * dt));

    p.rig.bodyGroup.scale.set(xzScale, p.squashY, xzScale);
    p.rig.bodyGroup.position.y = Math.abs(Math.sin(p.gaitPhase)) * (horizSpeed > 0.5 ? 0.11 : 0.02);
    const swing = horizSpeed > 0.4 ? Math.sin(p.gaitPhase) * 0.58 : 0;
    p.rig.leftLeg.rotation.x = swing;
    p.rig.rightLeg.rotation.x = -swing;
    if (p.rig.cloakMesh) {
      p.rig.cloakMesh.rotation.x = horizSpeed > 0.5 ? 0.28 + Math.sin(p.gaitPhase * 1.4) * 0.14 : 0.06;
    }

    // Hit flash tint
    for (const mat of p.rig.materialsToFlash) {
      mat.emissive.setHex(p.hitFlash > 0 ? 0xffffff : 0x000000);
      mat.emissiveIntensity = p.hitFlash > 0 ? 0.85 : 0;
    }

    p.customMixer?.update(dt);
  }

  private tryPlayerNova(p: PlayerActor): void {
    if (p.hp <= 0 || p.energy < 45) return;
    p.energy -= 45;
    p.novaTimer = 0.38;
    p.squashY = 1.24;
    this.trauma = Math.min(1, this.trauma + 0.55);
    this.audio.playNova();
    this.spawnParticles(p.x, 1.0, p.z, 0xfbbf24, 24, 9.5);

    let hitAny = false;
    for (const enemy of this.enemies) {
      if (enemy.state === 'ko') continue;
      const dist = Math.hypot(enemy.x - p.x, enemy.z - p.z);
      if (dist <= 6.2) {
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

  private applyPlayerSlashHits(p: PlayerActor): void {
    let connected = false;
    for (const enemy of this.enemies) {
      if (enemy.state === 'ko') continue;
      if (
        isMeleeArcHit(
          { x: p.x, z: p.z },
          p.facingX,
          p.facingZ,
          { x: enemy.x, z: enemy.z },
          3.45 + enemy.radius,
          0.12,
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
        other.vx = ((other.x - p.x) / knock) * 11;
        other.vz = ((other.z - p.z) / knock) * 11;
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
    enemy.hitFlash = 0.08;
    const len = Math.hypot(kx, kz) || 1;
    const impulse = heavy ? 11.5 : 6.2;
    enemy.vx = (kx / len) * impulse;
    enemy.vz = (kz / len) * impulse;

    if (enemy.hp <= 0) {
      enemy.state = 'ko';
      enemy.stateTimer = 0.36;
      enemy.hasToken = false;
      this.kills++;
      this.combo++;
      this.comboTimer = 4.2;
      this.score += calculateKillScore(enemy.kind, this.combo, this.wave);
      this.trauma = Math.min(1, this.trauma + 0.48);
      this.hitstopTimer = Math.max(this.hitstopTimer, computeHitstopDuration('kill'));
      this.audio.playHit(true);
      this.spawnParticles(enemy.x, 1.2, enemy.z, 0xfbbf24, 18, 7.5);

      if (Math.random() < 0.34) {
        this.spawnRelic(enemy.x, enemy.z, Math.random() < 0.45 ? 'heal' : 'energy');
      }
    } else {
      this.trauma = Math.min(1, this.trauma + (heavy ? 0.32 : 0.16));
      this.hitstopTimer = Math.max(
        this.hitstopTimer,
        computeHitstopDuration(heavy ? 'heavy' : 'light'),
      );
      this.audio.playHit(heavy);
      this.spawnParticles(enemy.x, 1.2, enemy.z, 0x67e8f9, 8, 5.2);
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
    this.spawnParticles(p.x, 1.1, p.z, 0xf43f5e, 16, 6.4);

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

    // Check solo / coop defeat
    const allDown =
      this.mode === 'solo' ? this.p1.hp <= 0 : this.p1.hp <= 0 && this.p2.hp <= 0;
    if (allDown && !this.pendingDefeat) {
      this.pendingDefeat = 'defeat';
      this.defeatDelay = 0.55;
    }
  }

  private stepDuelCombat(): void {
    // Periodic energy relic spawns in center during Duel
    if (this.relics.length < 2 && Math.random() < 0.008) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * 7;
      this.spawnRelic(Math.cos(ang) * dist, Math.sin(ang) * dist, 'energy');
    }
  }

  private stepWaveAndEnemies(dt: number): void {
    // Spawn from queue
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

      // Pick nearest alive player
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
      if (stepRes.meleeHit) {
        this.damagePlayer(targetPlayer, 1);
      }
      if (stepRes.spawnedProjectile) {
        const pSim: ProjectileSim = {
          id: this.nextProjectileId++,
          ...stepRes.spawnedProjectile,
        };
        this.projectiles.push(pSim);
        const mesh = new THREE.Mesh(this.sharedBoltGeo, this.sharedEnemyBoltMat);
        mesh.position.set(pSim.x, 1.2, pSim.z);
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

        // Telegraph indicator visibility
        const teleMat = visual.telegraphMesh.material as THREE.MeshBasicMaterial;
        if (e.state === 'telegraph') {
          teleMat.opacity = 0.55 + Math.sin(performance.now() * 0.03) * 0.25;
        } else {
          teleMat.opacity = 0;
        }

        // KO topple & dissolve
        if (e.state === 'ko') {
          const t = Math.max(0, e.stateTimer / 0.36);
          visual.body.rotation.x = (1 - t) * 1.45;
          visual.body.scale.setScalar(Math.max(0.05, t));
        } else {
          const flash = e.hitFlash > 0 || e.state === 'telegraph';
          for (const mat of visual.materialsToFlash) {
            mat.emissive.setHex(e.hitFlash > 0 ? 0xffffff : e.state === 'telegraph' ? 0xff4500 : 0x000000);
            mat.emissiveIntensity = flash ? (e.hitFlash > 0 ? 0.9 : 0.5) : 0;
          }
        }
      }

      if (e.state === 'ko' && e.stateTimer <= 0) {
        if (visual) {
          this.scene.remove(visual.root);
          this.enemyMeshes.delete(e.id);
        }
        this.enemies.splice(i, 1);
      }
    }

    // Wave clear check
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

  private spawnPlayerShadowArrow(p: PlayerActor): void {
    const speed = 23.0;
    const pSim: ProjectileSim = {
      id: this.nextProjectileId++,
      owner: p.id,
      x: p.x + p.facingX * 0.9,
      z: p.z + p.facingZ * 0.9,
      vx: p.facingX * speed,
      vz: p.facingZ * speed,
      radius: 0.45,
      damage: 1,
      life: 0.95,
    };
    this.projectiles.push(pSim);
    const arrowMesh = new THREE.Mesh(this.sharedArrowGeo, this.sharedArrowMat);
    arrowMesh.position.set(pSim.x, 1.25, pSim.z);
    arrowMesh.rotation.x = Math.PI / 2;
    arrowMesh.rotation.z = -Math.atan2(p.facingX, p.facingZ);
    this.scene.add(arrowMesh);
    this.projectileMeshes.set(pSim.id, arrowMesh);
    this.spawnParticles(pSim.x, 1.25, pSim.z, 0xd946ef, 5, 3.8);
  }

  private stepProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= dt;
      pr.x += pr.vx * dt;
      pr.z += pr.vz * dt;

      const mesh = this.projectileMeshes.get(pr.id);
      if (mesh) {
        mesh.position.set(pr.x, 1.25, pr.z);
        if (pr.owner === 'enemy') {
          mesh.rotation.y += dt * 8;
        }
      }

      let remove = pr.life <= 0 || Math.hypot(pr.x, pr.z) > ARENA_RADIUS + 2;

      if (!remove && pr.owner === 'enemy') {
        const targets = this.mode === 'solo' ? [this.p1] : [this.p1, this.p2];
        for (const t of targets) {
          if (t.hp > 0 && Math.hypot(t.x - pr.x, t.z - pr.z) < pr.radius + PLAYER_RADIUS) {
            this.damagePlayer(t, pr.damage);
            remove = true;
            break;
          }
        }
      } else if (!remove && (pr.owner === 'p1' || pr.owner === 'p2')) {
        for (const enemy of this.enemies) {
          if (enemy.state === 'ko') continue;
          if (Math.hypot(enemy.x - pr.x, enemy.z - pr.z) < pr.radius + enemy.radius) {
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
        if (p.hp > 0 && Math.hypot(p.x - r.x, p.z - r.z) < 1.35) {
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

  private updateCamera(dt: number): void {
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

    _vec3A.set(focusX + shakeX, 13.5 + zoomExtra * 0.55 + shakeY, focusZ + 14.5 + zoomExtra * 0.7);
    const damp = 1 - Math.exp(-7.5 * dt);
    this.camera.position.lerp(_vec3A, damp);

    _vec3B.set(focusX * 0.85, 1.1, focusZ * 0.85);
    this.camera.lookAt(_vec3B);
  }

  private emitHud(): void {
    this.onHudUpdate({
      phase: this.phase,
      mode: this.mode,
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
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver.disconnect();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('contextmenu', this.handleContextMenu);

    this.shadowTex.dispose();
    this.sharedBoltGeo.dispose();
    this.sharedEnemyBoltMat.dispose();
    this.sharedArrowGeo.dispose();
    this.sharedArrowMat.dispose();
    for (const d of this.worldDisposables) d.dispose();
    this.renderer.dispose();
  }
}
