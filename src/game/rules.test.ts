import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_PILLARS,
  ARENA_RADIUS,
  buildWaveConfig,
  calculateKillScore,
  clampDeltaTime,
  computeFpsWishDirection,
  createEnemyForWave,
  FIXED_PHYSICS_DT,
  isMeleeArcHit,
  resolveArenaBounds,
  resolveArenaBoundsWithSlide,
  separateActors,
  stepEnemyAI,
  stepFirstPersonPhysics,
  type PlayerPhysicsState,
} from './rules';

test('clampDeltaTime clamps spikes to 0.05s and guards invalid inputs', () => {
  assert.equal(clampDeltaTime(0.016), 0.016);
  assert.equal(clampDeltaTime(0.4), 0.05);
  assert.equal(clampDeltaTime(-1), 0);
  assert.equal(clampDeltaTime(Number.NaN), 0);
});

test('resolveArenaBounds keeps actors inside plateau and outside stone pillars', () => {
  const outside = resolveArenaBounds(50, 0, 0.7);
  assert.ok(Math.hypot(outside.x, outside.z) <= ARENA_RADIUS - 0.69);

  const p0 = ARENA_PILLARS[0];
  const insidePillar = resolveArenaBounds(p0.x + 0.1, p0.z, 0.7);
  assert.ok(Math.hypot(insidePillar.x - p0.x, insidePillar.z - p0.z) >= p0.radius + 0.69);
});

test('buildWaveConfig scales spawn budget, speed, and enemy archetype diversity', () => {
  const w1 = buildWaveConfig(1, 'solo');
  const w4 = buildWaveConfig(4, 'solo');
  const w4Coop = buildWaveConfig(4, 'coop2p');

  assert.ok(w4.spawnBudget > w1.spawnBudget);
  assert.ok(w4.speedMultiplier > w1.speedMultiplier);
  assert.ok(w4Coop.spawnBudget > w4.spawnBudget);
  assert.ok(w4.composition.includes('charger'));
  assert.ok(w4.composition.includes('kiter'));
  assert.ok(w4.composition.includes('swarmer'));
});

test('Charger enemy respects telegraph windup before charging and attack token pool limit', () => {
  const charger = createEnemyForWave(1, 'charger', 0, 2);
  charger.x = 6;
  charger.z = 0;
  charger.attackCooldown = 0;

  // Token pool full -> stays approaching without starting telegraph
  const blocked = stepEnemyAI(charger, { x: 0, z: 0 }, 0.05, 1, 3, 3);
  assert.equal(blocked.telegraphStarted, false);
  assert.equal(charger.state, 'approach');

  // Token available -> enters telegraph windup
  const started = stepEnemyAI(charger, { x: 0, z: 0 }, 0.05, 1, 1, 3);
  assert.equal(started.telegraphStarted, true);
  assert.equal(charger.state, 'telegraph');
  assert.equal(charger.hasToken, true);
});

test('Kiter enemy fires dodgeable projectile after completing telegraph windup', () => {
  const kiter = createEnemyForWave(2, 'kiter', 0, 2);
  kiter.x = 10;
  kiter.z = 0;
  kiter.attackCooldown = 0;

  const r1 = stepEnemyAI(kiter, { x: 0, z: 0 }, 0.05, 1, 0, 3);
  assert.equal(r1.telegraphStarted, true);
  assert.equal(kiter.state, 'telegraph');

  let fired = null;
  for (let i = 0; i < 15; i++) {
    const step = stepEnemyAI(kiter, { x: 0, z: 0 }, 0.05, 1, 1, 3);
    if (step.spawnedProjectile) fired = step.spawnedProjectile;
  }
  assert.ok(fired !== null, 'Kiter should fire a projectile after telegraph completes');
  assert.equal(fired?.owner, 'enemy');
});

test('calculateKillScore and isMeleeArcHit compute accurate combat values', () => {
  const s1 = calculateKillScore('swarmer', 1, 1);
  const sCombo = calculateKillScore('charger', 5, 3);
  assert.equal(s1, 120);
  assert.ok(sCombo > s1 * 3);

  assert.equal(isMeleeArcHit({ x: 0, z: 0 }, 0, 1, { x: 0, z: 2.2 }, 3.0), true);
  assert.equal(isMeleeArcHit({ x: 0, z: 0 }, 0, 1, { x: 0, z: -2.2 }, 3.0), false);
});

test('FPS wish direction maps camera yaw to normalized world movement vectors', () => {
  const fwd0 = computeFpsWishDirection(1, 0, 0);
  assert.ok(Math.abs(fwd0.x) < 1e-6 && Math.abs(fwd0.z + 1) < 1e-6);

  const right0 = computeFpsWishDirection(0, 1, 0);
  assert.ok(Math.abs(right0.x - 1) < 1e-6 && Math.abs(right0.z) < 1e-6);

  // Diagonal input must not exceed unit magnitude
  const diag = computeFpsWishDirection(1, 1, 0.7);
  assert.ok(Math.hypot(diag.x, diag.z) <= 1.0001);
});

test('stepFirstPersonPhysics supports smooth walk, sprint, jump arc, landing, and footstep cadence', () => {
  const state: PlayerPhysicsState = {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    grounded: true,
    coyoteTimer: 0.12,
    jumpBufferTimer: 0,
    stepPhase: 0,
    stepDistance: 0,
  };

  let footsteps = 0;
  for (let i = 0; i < 120; i++) {
    const res = stepFirstPersonPhysics(
      state,
      { wishX: 0, wishZ: -1, sprint: false, jumpPressed: false, dashActive: false, dashVx: 0, dashVz: 0 },
      FIXED_PHYSICS_DT,
    );
    if (res.footstepTriggered) footsteps++;
  }
  assert.ok(state.z < -5.5, 'Player should walk smoothly forward');
  assert.ok(footsteps >= 2, 'Grounded walking should trigger stride-synced footsteps');

  // Trigger jump and verify parabolic lift and clean landing back at y = 0
  let maxHeight = 0;
  let sawLand = false;
  for (let i = 0; i < 140; i++) {
    const res = stepFirstPersonPhysics(
      state,
      { wishX: 0, wishZ: 0, sprint: false, jumpPressed: i === 0, dashActive: false, dashVx: 0, dashVz: 0 },
      FIXED_PHYSICS_DT,
    );
    if (state.y > maxHeight) maxHeight = state.y;
    if (res.landed) sawLand = true;
  }
  assert.ok(maxHeight > 1.3 && maxHeight < 2.4, `Expected realistic jump arc height, got ${maxHeight}`);
  assert.equal(state.y, 0);
  assert.equal(state.grounded, true);
  assert.equal(sawLand, true);
});

test('resolveArenaBoundsWithSlide preserves tangential velocity along pillars and separates overlapping actors', () => {
  const p0 = ARENA_PILLARS[0];
  const slide = resolveArenaBoundsWithSlide(p0.x + p0.radius + 0.5, p0.z, -5, 6, 0.68);
  assert.equal(slide.collided, true);
  assert.ok(Math.abs(slide.vx) < 0.05, 'Inward normal velocity should be stripped');
  assert.ok(slide.vz > 5.5, 'Tangential slide velocity along pillar should remain smooth');

  const e1 = createEnemyForWave(1, 'swarmer', 0, 1);
  const e2 = createEnemyForWave(2, 'swarmer', 0, 1);
  e1.x = 0.2;
  e1.z = 0;
  e2.x = 0.2;
  e2.z = 0;
  separateActors([e1, e2], [{ x: 0, z: 0, hp: 5 }]);
  assert.ok(Math.hypot(e1.x, e1.z) >= e1.radius + 0.68 + 0.3, 'Enemy must stay outside FPS camera near plane');
  assert.ok(Math.hypot(e2.x - e1.x, e2.z - e1.z) > 0.1, 'Overlapping enemies must separate');
});
