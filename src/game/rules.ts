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
  z: number;
  vx: number;
  vz: number;
  owner: 'enemy' | 'p1' | 'p2';
  radius: number;
  damage: number;
  life: number;
}

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
  let nx = x;
  let nz = z;

  // Push outside circular arena pillars
  for (const p of obstacles) {
    const dx = nx - p.x;
    const dz = nz - p.z;
    const minDist = p.radius + entityRadius;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist) {
      const dist = Math.sqrt(distSq) || 0.0001;
      nx = p.x + (dx / dist) * minDist;
      nz = p.z + (dz / dist) * minDist;
    }
  }

  // Keep inside floating basalt plateau rim
  const maxR = ARENA_RADIUS - entityRadius;
  const rSq = nx * nx + nz * nz;
  if (rSq > maxR * maxR) {
    const r = Math.sqrt(rSq);
    nx = (nx / r) * maxR;
    nz = (nz / r) * maxR;
  }

  return { x: nx, z: nz };
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
          z: enemy.z + enemy.aimDirZ * 0.9,
          vx: enemy.aimDirX * boltSpeed,
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
