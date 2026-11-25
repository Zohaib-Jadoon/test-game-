export type GameMode = 'solo' | 'coop2p' | 'duel2p';
export type EnemyKind = 'charger' | 'kiter' | 'swarmer';

export interface Vec2 {
  x: number;
  z: number;
}

export interface PillarObstacle {
  x: number;
  z: number;
  radius: number;
}

export interface EnemySim {
  id: number;
  kind: EnemyKind;
  x: number;
  z: number;
  vx: number;
  vz: number;
  rotY: number;
  hp: number;
  maxHp: number;
  radius: number;
  state: 'approach' | 'orbit' | 'telegraph' | 'attack' | 'recover' | 'ko';
  stateTimer: number;
  attackCooldown: number;
  aimDirX: number;
  aimDirZ: number;
  hitFlash: number;
  hasToken: boolean;
  orbitSign: number;
}

export interface ProjectileSim {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  owner: 'enemy' | 'p1' | 'p2';
  radius: number;
  damage: number;
  life: number;
}

export interface PlayerPhysicsState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  stepPhase: number;
  stepDistance: number;
}

export interface PlayerPhysicsInput {
  wishX: number;
  wishZ: number;
  sprint: boolean;
  jumpPressed: boolean;
  dashActive: boolean;
  dashVx: number;
  dashVz: number;
}

export interface PlayerPhysicsStepResult {
  jumped: boolean;
  landed: boolean;
  impactSpeed: number;
  footstepTriggered: boolean;
  horizontalSpeed: number;
}

export const FIXED_PHYSICS_DT = 1 / 120;
export const WALK_SPEED = 7.4;
export const SPRINT_SPEED = 11.2;
export const PLAYER_GRAVITY = 27.5;
export const PLAYER_JUMP_SPEED = 9.8;
export const COYOTE_TIME_SEC = 0.12;
export const JUMP_BUFFER_SEC = 0.14;
export const FPS_EYE_HEIGHT = 1.66;

export interface WaveConfig {
  wave: number;
  spawnBudget: number;
  speedMultiplier: number;
  maxConcurrentAttackers: number;
  composition: EnemyKind[];
}

export const ARENA_RADIUS = 19.5;
export const PLAYER_RADIUS = 0.68;
export const PLAYER_MAX_HP = 5;
export const PLAYER_MAX_ENERGY = 100;

export const ARENA_PILLARS: readonly PillarObstacle[] = [
  { x: -8.5, z: -7.5, radius: 1.45 },
  { x: 8.5, z: -7.5, radius: 1.45 },
  { x: -8.5, z: 7.5, radius: 1.45 },
  { x: 8.5, z: 7.5, radius: 1.45 },
];

export function clampDeltaTime(rawDt: number): number {
  if (!Number.isFinite(rawDt) || rawDt < 0) return 0;
  return Math.min(rawDt, 0.05);
}

export function resolveArenaBounds(
  x: number,
  z: number,
  entityRadius: number,
  obstacles: readonly PillarObstacle[] = ARENA_PILLARS,
): Vec2 {
  const res = resolveArenaBoundsWithSlide(x, z, 0, 0, entityRadius, obstacles);
  return { x: res.x, z: res.z };
}

/**
 * Resolves collisions against circular arena pillars and the plateau perimeter while
 * projecting velocity onto the collision tangent so walking along walls slides smoothly
 * without sticking, jitter, or tunneling.
 */
export function resolveArenaBoundsWithSlide(
  x: number,
  z: number,
  vx: number,
  vz: number,
  entityRadius: number,
  obstacles: readonly PillarObstacle[] = ARENA_PILLARS,
): { x: number; z: number; vx: number; vz: number; collided: boolean } {
  let nx = x;
  let nz = z;
  let nvx = vx;
  let nvz = vz;
  let collided = false;

  // Two passes guarantee clean resolution if wedged near a pillar + rim
  for (let pass = 0; pass < 2; pass++) {
    for (const p of obstacles) {
      const dx = nx - p.x;
      const dz = nz - p.z;
      const minDist = p.radius + entityRadius;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq) || 0.0001;
        const surfX = dx / dist;
        const surfZ = dz / dist;
        nx = p.x + surfX * minDist;
        nz = p.z + surfZ * minDist;
        const inward = nvx * surfX + nvz * surfZ;
        if (inward < 0) {
          nvx -= surfX * inward;
          nvz -= surfZ * inward;
        }
        collided = true;
      }
    }

    const maxR = ARENA_RADIUS - entityRadius;
    const rSq = nx * nx + nz * nz;
    if (rSq > maxR * maxR) {
      const r = Math.sqrt(rSq);
      const inwardNormalX = -nx / r;
      const inwardNormalZ = -nz / r;
      nx = (nx / r) * maxR;
      nz = (nz / r) * maxR;
      const vn = nvx * inwardNormalX + nvz * inwardNormalZ;
      if (vn < 0) {
        nvx -= inwardNormalX * vn;
        nvz -= inwardNormalZ * vn;
      }
      collided = true;
    }
  }

  return { x: nx, z: nz, vx: nvx, vz: nvz, collided };
}

/**
 * Computes normalized camera-relative world movement direction from local forward/right inputs.
 * Matches Three.js YXZ FPS camera where yaw = 0 looks along -Z, forward = (-sin(yaw), -cos(yaw)),
 * right = (cos(yaw), -sin(yaw)).
 */
export function computeFpsWishDirection(
  forwardInput: number,
  rightInput: number,
  yaw: number,
): Vec2 {
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);
  const fx = -sinY;
  const fz = -cosY;
  const rx = cosY;
  const rz = -sinY;

  const wx = fx * forwardInput + rx * rightInput;
  const wz = fz * forwardInput + rz * rightInput;
  const len = Math.hypot(wx, wz);
  if (len <= 0.0001) return { x: 0, z: 0 };
  const clampedMag = Math.min(1, len);
  return { x: (wx / len) * clampedMag, z: (wz / len) * clampedMag };
}

/**
 * Deterministic fixed-step First-Person character physics with ground friction,
 * snappy acceleration, air control, gravity, coyote time, jump buffering,
 * smooth wall-sliding, and stride-accurate footstep cadence.
 */
export function stepFirstPersonPhysics(
  state: PlayerPhysicsState,
  input: PlayerPhysicsInput,
  dt: number,
  entityRadius = PLAYER_RADIUS,
): PlayerPhysicsStepResult {
  const safeDt = Math.max(0, Math.min(dt, 0.05));
  let jumped = false;
  let landed = false;
  let impactSpeed = 0;
  let footstepTriggered = false;

  if (input.jumpPressed) {
    state.jumpBufferTimer = JUMP_BUFFER_SEC;
  } else {
    state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - safeDt);
  }

  if (state.grounded) {
    state.coyoteTimer = COYOTE_TIME_SEC;
  } else {
    state.coyoteTimer = Math.max(0, state.coyoteTimer - safeDt);
  }

  if (input.dashActive) {
    state.vx = input.dashVx;
    state.vz = input.dashVz;
  } else {
    const wishMag = Math.hypot(input.wishX, input.wishZ);
    const normMag = wishMag > 1 ? 1 / wishMag : 1;
    const wx = input.wishX * normMag;
    const wz = input.wishZ * normMag;
    const maxSpeed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
    const targetVx = wx * maxSpeed;
    const targetVz = wz * maxSpeed;

    // Grounded: snappy Quake/Destiny-style accel + crisp stop friction; Air: responsive air strafe
    const accelRate = state.grounded
      ? wishMag > 0.05
        ? 18.0
        : 15.0
      : wishMag > 0.05
        ? 6.5
        : 1.4;
    const blend = 1 - Math.exp(-accelRate * safeDt);
    state.vx += (targetVx - state.vx) * blend;
    state.vz += (targetVz - state.vz) * blend;

    if (state.grounded && wishMag <= 0.05 && Math.hypot(state.vx, state.vz) < 0.08) {
      state.vx = 0;
      state.vz = 0;
    }
  }

  // Execute buffered jump with coyote-time forgiveness
  if (state.jumpBufferTimer > 0 && state.coyoteTimer > 0) {
    state.vy = PLAYER_JUMP_SPEED;
    state.grounded = false;
    state.coyoteTimer = 0;
    state.jumpBufferTimer = 0;
    jumped = true;
  }

  // Vertical integration (gravity)
  if (!state.grounded || state.vy > 0) {
    state.vy -= PLAYER_GRAVITY * safeDt;
    state.y += state.vy * safeDt;
    if (state.y <= 0) {
      impactSpeed = Math.abs(state.vy);
      state.y = 0;
      state.vy = 0;
      state.grounded = true;
      if (impactSpeed > 2.2) {
        landed = true;
      }
    }
  }

  // Horizontal integration + smooth tangent wall-slide collision
  const prevX = state.x;
  const prevZ = state.z;
  const resolved = resolveArenaBoundsWithSlide(
    state.x + state.vx * safeDt,
    state.z + state.vz * safeDt,
    state.vx,
    state.vz,
    entityRadius,
  );
  state.x = resolved.x;
  state.z = resolved.z;
  state.vx = resolved.vx;
  state.vz = resolved.vz;

  const actualStepDist = Math.hypot(state.x - prevX, state.z - prevZ);
  const horizontalSpeed = Math.hypot(state.vx, state.vz);

  // Stride-accurate footstep phase (only advances on real grounded movement, never while running into a wall!)
  if (state.grounded && actualStepDist > 0.0005 && horizontalSpeed > 0.45 && !input.dashActive) {
    const strideLen = input.sprint ? 2.55 : 2.15;
    const prevCycle = Math.floor(state.stepDistance / strideLen);
    state.stepDistance += actualStepDist;
    const nextCycle = Math.floor(state.stepDistance / strideLen);
    state.stepPhase += (actualStepDist / strideLen) * Math.PI;
    if (nextCycle > prevCycle) {
      footstepTriggered = true;
    }
  }

  return {
    jumped,
    landed,
    impactSpeed,
    footstepTriggered,
    horizontalSpeed,
  };
}

/**
 * Separates overlapping actors cleanly so enemies never stack on top of each other
 * or clip inside the First-Person player camera.
 */
export function separateActors(
  enemies: EnemySim[],
  players: readonly { x: number; z: number; hp: number }[],
): void {
  // Enemy-to-enemy separation
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.state === 'ko') continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.state === 'ko') continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const minDist = a.radius + b.radius + 0.18;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        let nx: number;
        let nz: number;
        if (dist > 1e-4) {
          nx = dx / dist;
          nz = dz / dist;
        } else {
          const tieAngle = (a.id * 2.39996 + b.id * 1.1) % (Math.PI * 2);
          nx = Math.cos(tieAngle);
          nz = Math.sin(tieAngle);
        }
        const push = (minDist - dist) * 0.5;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
      }
    }
  }

  // Keep enemies out of player camera near-plane
  for (const e of enemies) {
    if (e.state === 'ko') continue;
    for (const p of players) {
      if (p.hp <= 0) continue;
      const dx = e.x - p.x;
      const dz = e.z - p.z;
      const minDist = e.radius + PLAYER_RADIUS + 0.35;
      const distSq = dx * dx + dz * dz;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        const nx = dist > 1e-4 ? dx / dist : Math.cos(e.id * 2.39996);
        const nz = dist > 1e-4 ? dz / dist : Math.sin(e.id * 2.39996);
        e.x = p.x + nx * minDist;
        e.z = p.z + nz * minDist;
      }
    }
    const clamped = resolveArenaBounds(e.x, e.z, e.radius);
    e.x = clamped.x;
    e.z = clamped.z;
  }
}

export function buildWaveConfig(wave: number, mode: GameMode): WaveConfig {
  const safeWave = Math.max(1, Math.floor(wave));
  const coopBonus = mode === 'coop2p' ? 2 : 0;
  const spawnBudget = Math.min(18, 3 + safeWave * 2 + coopBonus);
  const speedMultiplier = Math.min(1.55, 1 + (safeWave - 1) * 0.08);
  const maxConcurrentAttackers = Math.min(5, 2 + Math.floor(safeWave / 2));

  const composition: EnemyKind[] = [];
  for (let i = 0; i < spawnBudget; i++) {
    if (safeWave === 1) {
      composition.push(i % 3 === 2 ? 'kiter' : 'swarmer');
    } else if (safeWave === 2) {
      composition.push(i % 4 === 0 ? 'charger' : i % 2 === 0 ? 'kiter' : 'swarmer');
    } else {
      const mod = i % 5;
      if (mod === 0) composition.push('charger');
      else if (mod === 1 || mod === 3) composition.push('kiter');
      else composition.push('swarmer');
    }
  }

  return {
    wave: safeWave,
    spawnBudget,
    speedMultiplier,
    maxConcurrentAttackers,
    composition,
  };
}

export function createEnemyForWave(
  id: number,
  kind: EnemyKind,
  angle: number,
  wave: number,
): EnemySim {
  const spawnDist = ARENA_RADIUS - 3.2;
  const x = Math.cos(angle) * spawnDist;
  const z = Math.sin(angle) * spawnDist;
  const hpBonus = Math.floor((wave - 1) * 0.6);

  if (kind === 'charger') {
    const maxHp = 4 + hpBonus;
    return {
      id,
      kind,
      x,
      z,
      vx: 0,
      vz: 0,
      rotY: 0,
      hp: maxHp,
      maxHp,
      radius: 1.0,
      state: 'approach',
      stateTimer: 0.4,
      attackCooldown: 1.4,
      aimDirX: 0,
      aimDirZ: 1,
      hitFlash: 0,
      hasToken: false,
      orbitSign: 1,
    };
  }
  if (kind === 'kiter') {
    const maxHp = 2 + Math.floor(hpBonus * 0.6);
    return {
      id,
      kind,
      x,
      z,
      vx: 0,
      vz: 0,
      rotY: 0,
      hp: maxHp,
      maxHp,
      radius: 0.72,
      state: 'orbit',
      stateTimer: 0.5,
      attackCooldown: 1.6,
      aimDirX: 0,
      aimDirZ: 1,
      hitFlash: 0,
      hasToken: false,
      orbitSign: id % 2 === 0 ? 1 : -1,
    };
  }
  const maxHp = 2 + Math.floor(hpBonus * 0.5);
  return {
    id,
    kind: 'swarmer',
    x,
    z,
    vx: 0,
    vz: 0,
    rotY: 0,
    hp: maxHp,
    maxHp,
    radius: 0.62,
    state: 'approach',
    stateTimer: 0.3,
    attackCooldown: 0.9,
    aimDirX: 0,
    aimDirZ: 1,
    hitFlash: 0,
    hasToken: false,
    orbitSign: id % 2 === 0 ? 1 : -1,
  };
}

export interface EnemyStepResult {
  spawnedProjectile: Omit<ProjectileSim, 'id'> | null;
  meleeHit: boolean;
  telegraphStarted: boolean;
}

export function stepEnemyAI(
  enemy: EnemySim,
  target: Vec2,
  dt: number,
  speedMult: number,
  activeTokens: number,
  maxTokens: number,
): EnemyStepResult {
  let spawnedProjectile: Omit<ProjectileSim, 'id'> | null = null;
  let meleeHit = false;
  let telegraphStarted = false;

  if (enemy.state === 'ko') {
    enemy.stateTimer -= dt;
    enemy.x += enemy.vx * dt;
    enemy.z += enemy.vz * dt;
    enemy.vx *= Math.max(0, 1 - dt * 5);
    enemy.vz *= Math.max(0, 1 - dt * 5);
    return { spawnedProjectile, meleeHit, telegraphStarted };
  }

  enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
  enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);

  const dx = target.x - enemy.x;
  const dz = target.z - enemy.z;
  const dist = Math.sqrt(dx * dx + dz * dz) || 0.0001;
  const dirX = dx / dist;
  const dirZ = dz / dist;

  if (enemy.kind === 'charger') {
    if (enemy.state === 'approach') {
      enemy.rotY = Math.atan2(dirX, dirZ);
      const moveSpeed = 2.8 * speedMult;
      enemy.vx = dirX * moveSpeed;
      enemy.vz = dirZ * moveSpeed;
      enemy.x += enemy.vx * dt;
      enemy.z += enemy.vz * dt;

      if (dist < 11.5 && enemy.attackCooldown <= 0 && (enemy.hasToken || activeTokens < maxTokens)) {
        enemy.hasToken = true;
        enemy.state = 'telegraph';
        enemy.stateTimer = 0.65;
        enemy.aimDirX = dirX;
        enemy.aimDirZ = dirZ;
        enemy.vx = 0;
        enemy.vz = 0;
        telegraphStarted = true;
      }
    } else if (enemy.state === 'telegraph') {
      enemy.rotY = Math.atan2(enemy.aimDirX, enemy.aimDirZ);
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) {
        enemy.state = 'attack';
        enemy.stateTimer = 0.55;
        const rushSpeed = 14.5 * speedMult;
        enemy.vx = enemy.aimDirX * rushSpeed;
        enemy.vz = enemy.aimDirZ * rushSpeed;
      }
    } else if (enemy.state === 'attack') {
      enemy.x += enemy.vx * dt;
      enemy.z += enemy.vz * dt;
      enemy.stateTimer -= dt;
      if (dist < enemy.radius + PLAYER_RADIUS + 0.35) {
        meleeHit = true;
        enemy.state = 'recover';
        enemy.stateTimer = 0.75;
        enemy.hasToken = false;
        enemy.attackCooldown = 2.1;
      } else if (enemy.stateTimer <= 0) {
        enemy.state = 'recover';
        enemy.stateTimer = 0.65;
        enemy.hasToken = false;
        enemy.attackCooldown = 1.9;
      }
    } else if (enemy.state === 'recover') {
      enemy.vx *= Math.max(0, 1 - dt * 8);
      enemy.vz *= Math.max(0, 1 - dt * 8);
      enemy.x += enemy.vx * dt;
      enemy.z += enemy.vz * dt;
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) {
        enemy.state = 'approach';
      }
    }
  } else if (enemy.kind === 'kiter') {
    enemy.rotY = Math.atan2(dirX, dirZ);
    const idealDist = 9.5;
    if (enemy.state === 'orbit' || enemy.state === 'approach') {
      const tangentX = -dirZ * enemy.orbitSign;
      const tangentZ = dirX * enemy.orbitSign;
      const radialBias = dist < idealDist - 1.5 ? -0.8 : dist > idealDist + 2.0 ? 0.75 : 0;
      const speed = 3.6 * speedMult;
      enemy.vx = (tangentX * 0.85 + dirX * radialBias) * speed;
      enemy.vz = (tangentZ * 0.85 + dirZ * radialBias) * speed;
      enemy.x += enemy.vx * dt;
      enemy.z += enemy.vz * dt;

      if (dist < 15.5 && enemy.attackCooldown <= 0 && (enemy.hasToken || activeTokens < maxTokens)) {
        enemy.hasToken = true;
        enemy.state = 'telegraph';
        enemy.stateTimer = 0.5;
        enemy.aimDirX = dirX;
        enemy.aimDirZ = dirZ;
        telegraphStarted = true;
      }
    } else if (enemy.state === 'telegraph') {
      enemy.aimDirX = dirX;
      enemy.aimDirZ = dirZ;
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) {
        const boltSpeed = 11.2 * speedMult;
        spawnedProjectile = {
          x: enemy.x + enemy.aimDirX * 0.9,
          y: 1.35,
          z: enemy.z + enemy.aimDirZ * 0.9,
          vx: enemy.aimDirX * boltSpeed,
          vy: 0,
          vz: enemy.aimDirZ * boltSpeed,
          owner: 'enemy',
          radius: 0.34,
          damage: 1,
          life: 2.6,
        };
        enemy.state = 'recover';
        enemy.stateTimer = 0.45;
        enemy.hasToken = false;
        enemy.attackCooldown = 2.0;
      }
    } else if (enemy.state === 'recover') {
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) {
        enemy.state = 'orbit';
      }
    }
  } else {
    // Swarmer: agile flanker that circles and leaps with telegraph
    enemy.rotY = Math.atan2(dirX, dirZ);
    if (enemy.state === 'approach') {
      const flankWeight = dist > 4.2 ? 0.42 : 0.15;
      const fx = dirX + -dirZ * enemy.orbitSign * flankWeight;
      const fz = dirZ + dirX * enemy.orbitSign * flankWeight;
      const flen = Math.sqrt(fx * fx + fz * fz) || 1;
      const speed = 4.9 * speedMult;
      enemy.vx = (fx / flen) * speed;
      enemy.vz = (fz / flen) * speed;
      enemy.x += enemy.vx * dt;
      enemy.z += enemy.vz * dt;

      if (dist < 4.2 && enemy.attackCooldown <= 0 && (enemy.hasToken || activeTokens < maxTokens)) {
        enemy.hasToken = true;
        enemy.state = 'telegraph';
        enemy.stateTimer = 0.34;
        enemy.aimDirX = dirX;
        enemy.aimDirZ = dirZ;
        telegraphStarted = true;
      }
    } else if (enemy.state === 'telegraph') {
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) {
        enemy.state = 'attack';
        enemy.stateTimer = 0.28;
        const leapSpeed = 12.2 * speedMult;
        enemy.vx = enemy.aimDirX * leapSpeed;
        enemy.vz = enemy.aimDirZ * leapSpeed;
      }
    } else if (enemy.state === 'attack') {
      enemy.x += enemy.vx * dt;
      enemy.z += enemy.vz * dt;
      enemy.stateTimer -= dt;
      if (dist < enemy.radius + PLAYER_RADIUS + 0.25) {
        meleeHit = true;
        enemy.state = 'recover';
        enemy.stateTimer = 0.55;
        enemy.hasToken = false;
        enemy.attackCooldown = 1.4;
      } else if (enemy.stateTimer <= 0) {
        enemy.state = 'recover';
        enemy.stateTimer = 0.45;
        enemy.hasToken = false;
        enemy.attackCooldown = 1.25;
      }
    } else if (enemy.state === 'recover') {
      enemy.stateTimer -= dt;
      if (enemy.stateTimer <= 0) {
        enemy.state = 'approach';
      }
    }
  }

  const clamped = resolveArenaBounds(enemy.x, enemy.z, enemy.radius);
  enemy.x = clamped.x;
  enemy.z = clamped.z;

  return { spawnedProjectile, meleeHit, telegraphStarted };
}

export function calculateKillScore(kind: EnemyKind, combo: number, wave: number): number {
  const base = kind === 'charger' ? 250 : kind === 'kiter' ? 160 : 120;
  const comboMult = Math.min(4, 1 + Math.max(0, combo - 1) * 0.25);
  const waveMult = 1 + (Math.max(1, wave) - 1) * 0.15;
  return Math.round(base * comboMult * waveMult);
}

export function isMeleeArcHit(
  attacker: Vec2,
  facingX: number,
  facingZ: number,
  target: Vec2,
  reach: number,
  minDot = 0.2,
): boolean {
  const dx = target.x - attacker.x;
  const dz = target.z - attacker.z;
  const distSq = dx * dx + dz * dz;
  if (distSq > reach * reach) return false;
  const dist = Math.sqrt(distSq);
  if (dist < 0.001) return true;
  const dot = (dx / dist) * facingX + (dz / dist) * facingZ;
  return dot >= minDot;
}

export function computeHitstopDuration(event: 'light' | 'heavy' | 'kill' | 'playerHurt'): number {
  switch (event) {
    case 'kill':
      return 0.06;
    case 'heavy':
      return 0.045;
    case 'playerHurt':
      return 0.055;
    case 'light':
    default:
      return 0.025;
  }
}
