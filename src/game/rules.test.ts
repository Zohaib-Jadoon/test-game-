import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_PILLARS,
  ARENA_RADIUS,
  buildWaveConfig,
  calculateKillScore,
  clampDeltaTime,
  createEnemyForWave,
  isMeleeArcHit,
  resolveArenaBounds,
  stepEnemyAI,
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
