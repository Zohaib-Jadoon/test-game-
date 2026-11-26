import { ATTACKS, MOUNTAIN_WARDEN_PHASES } from '../../content/eidrathContent';
import type {
  ActorActionState,
  AttackDefinition,
  BossPhaseDef,
  DifficultyId,
} from '../types';

export interface DifficultyTuning {
  enemyDamageMult: number;
  playerDamageMult: number;
  parryBonusMs: number;
  staminaRegenMult: number;
}

export const DIFFICULTY_TUNING: Record<DifficultyId, DifficultyTuning> = {
  story: { enemyDamageMult: 0.55, playerDamageMult: 1.35, parryBonusMs: 90, staminaRegenMult: 1.3 },
  normal: { enemyDamageMult: 1.0, playerDamageMult: 1.0, parryBonusMs: 0, staminaRegenMult: 1.0 },
  hard: { enemyDamageMult: 1.35, playerDamageMult: 0.9, parryBonusMs: -25, staminaRegenMult: 0.9 },
  oathsworn: { enemyDamageMult: 1.65, playerDamageMult: 0.85, parryBonusMs: -40, staminaRegenMult: 0.85 },
};

export interface ActiveCombatAction {
  attackInstanceId: number;
  attack: AttackDefinition;
  elapsedMs: number;
  alreadyHitIds: Set<string>;
  releaseConsumed?: boolean;
}

export interface CombatActorTimeline {
  state: ActorActionState;
  stateTimerMs: number;
  activeAction: ActiveCombatAction | null;
  dodgeIFrameMs: number;
  parryWindowMs: number;
  nextInstanceId: number;
}

export function createCombatTimeline(): CombatActorTimeline {
  return {
    state: 'idle',
    stateTimerMs: 0,
    activeAction: null,
    dodgeIFrameMs: 0,
    parryWindowMs: 0,
    nextInstanceId: 1,
  };
}

export function startAttackAction(
  timeline: CombatActorTimeline,
  attackId: string,
  currentStamina: number,
  currentMana: number,
  staminaMultiplier = 1,
): { started: boolean; staminaCost: number; manaCost: number; attack?: AttackDefinition } {
  const attack = ATTACKS[attackId];
  if (!attack) return { started: false, staminaCost: 0, manaCost: 0 };
  if (
    timeline.state === 'dead' ||
    timeline.state === 'stagger' ||
    timeline.state === 'dodge' ||
    timeline.state === 'windup' ||
    timeline.state === 'active'
  ) {
    return { started: false, staminaCost: 0, manaCost: 0 };
  }
  const manaCost = attack.manaCost ?? 0;
  const staminaCost = Math.max(0, Math.round(attack.staminaCost * staminaMultiplier));
  if (!Number.isFinite(staminaCost) || currentStamina < staminaCost || currentMana < manaCost) {
    return { started: false, staminaCost: 0, manaCost: 0 };
  }
  const instanceId = timeline.nextInstanceId++;
  timeline.state = 'windup';
  timeline.stateTimerMs = 0;
  timeline.activeAction = {
    attackInstanceId: instanceId,
    attack,
    elapsedMs: 0,
    alreadyHitIds: new Set<string>(),
  };
  return { started: true, staminaCost, manaCost, attack };
}

export function startDodgeAction(
  timeline: CombatActorTimeline,
  currentStamina: number,
  dodgeStaminaCost = 18,
): { started: boolean; staminaCost: number } {
  if (timeline.state === 'dead' || timeline.state === 'dodge' || timeline.state === 'stagger') {
    return { started: false, staminaCost: 0 };
  }
  if (currentStamina < dodgeStaminaCost) {
    return { started: false, staminaCost: 0 };
  }
  timeline.state = 'dodge';
  timeline.stateTimerMs = 500;
  timeline.dodgeIFrameMs = 180;
  timeline.activeAction = null;
  return { started: true, staminaCost: dodgeStaminaCost };
}

export function startGuardAction(
  timeline: CombatActorTimeline,
  parryWindowMs = 180,
): boolean {
  if (timeline.state === 'dead' || timeline.state === 'stagger' || timeline.state === 'dodge') {
    return false;
  }
  if (timeline.state !== 'guard') {
    timeline.parryWindowMs = parryWindowMs;
  }
  timeline.state = 'guard';
  timeline.activeAction = null;
  return true;
}

export function releaseGuardAction(timeline: CombatActorTimeline): void {
  if (timeline.state === 'guard') {
    timeline.state = 'idle';
    timeline.parryWindowMs = 0;
  }
}

export function advanceCombatTimeline(timeline: CombatActorTimeline, dtMs: number): void {
  const clampedMs = Math.max(0, Math.min(100, dtMs));
  if (timeline.dodgeIFrameMs > 0) {
    timeline.dodgeIFrameMs = Math.max(0, timeline.dodgeIFrameMs - clampedMs);
  }
  if (timeline.parryWindowMs > 0) {
    timeline.parryWindowMs = Math.max(0, timeline.parryWindowMs - clampedMs);
  }

  if (timeline.state === 'dead') return;

  if (timeline.state === 'dodge' || timeline.state === 'stagger') {
    timeline.stateTimerMs -= clampedMs;
    if (timeline.stateTimerMs <= 0) {
      timeline.state = 'idle';
      timeline.stateTimerMs = 0;
    }
    return;
  }

  if (timeline.activeAction) {
    const act = timeline.activeAction;
    act.elapsedMs += clampedMs;
    const { windupMs, activeMs, recoveryMs } = act.attack;
    if (act.elapsedMs < windupMs) {
      timeline.state = 'windup';
    } else if (act.elapsedMs < windupMs + activeMs) {
      timeline.state = 'active';
    } else if (act.elapsedMs < windupMs + activeMs + recoveryMs) {
      timeline.state = 'recovery';
    } else {
      timeline.activeAction = null;
      timeline.state = 'idle';
    }
  }
}

/** Consume the attack release exactly once, after windup; cancellation before active releases nothing. */
export function consumeAttackRelease(timeline: CombatActorTimeline): AttackDefinition | null {
  const action = timeline.activeAction;
  if (timeline.state !== 'active' || !action || action.releaseConsumed) return null;
  action.releaseConsumed = true;
  return action.attack;
}

export function canRegisterHitOnTarget(action: ActiveCombatAction | null, targetId: string): boolean {
  if (!action) return false;
  if (action.alreadyHitIds.has(targetId)) return false;
  action.alreadyHitIds.add(targetId);
  return true;
}

export interface DamageCalcInput {
  baseDamage: number;
  weaponDamage: number;
  buildMultiplier: number;
  armorValue: number;
  difficultyMultiplier: number;
  isCrit?: boolean;
  isStealthBackstab?: boolean;
  stealthCritBonusPct?: number;
  ascensionActive?: boolean;
  armorOverrideMultiplier?: number;
}

export function computeDamageAmount(input: DamageCalcInput): number {
  const raw = Math.max(1, input.baseDamage + input.weaponDamage * 0.65);
  const armorMitigation =
    input.armorOverrideMultiplier !== undefined
      ? input.armorOverrideMultiplier
      : 100 / (100 + Math.max(0, input.armorValue) * 1.4);
  const critMult = input.isCrit ? 1.45 : 1.0;
  const stealthMult = input.isStealthBackstab ? 1.75 + (input.stealthCritBonusPct ?? 0) / 100 : 1.0;
  const ascensionMult = input.ascensionActive ? 1.35 : 1.0;
  const total = raw * input.buildMultiplier * armorMitigation * input.difficultyMultiplier * critMult * stealthMult * ascensionMult;
  return Math.max(1, Math.round(total));
}

export interface IncomingHitOutcome {
  result: 'evaded' | 'parried' | 'blocked' | 'guard_broken' | 'hit';
  hpDamage: number;
  staminaDamage: number;
  attackerStaggerMs: number;
  defenderStaggerMs: number;
  divineGain: number;
}

export function resolveDefenderHit(params: {
  timeline: CombatActorTimeline;
  attack: AttackDefinition;
  incomingDamage: number;
  defenderStamina: number;
  guardMitigationPct: number;
}): IncomingHitOutcome {
  const { timeline, attack, incomingDamage, defenderStamina, guardMitigationPct } = params;

  if (timeline.state === 'dead') {
    return { result: 'evaded', hpDamage: 0, staminaDamage: 0, attackerStaggerMs: 0, defenderStaggerMs: 0, divineGain: 0 };
  }

  // Dodge i-frames avoid damage cleanly
  if (timeline.dodgeIFrameMs > 0) {
    return { result: 'evaded', hpDamage: 0, staminaDamage: 0, attackerStaggerMs: 0, defenderStaggerMs: 0, divineGain: 4 };
  }

  // Guard / Parry evaluation
  if (timeline.state === 'guard') {
    if (timeline.parryWindowMs > 0 && attack.parryable) {
      return {
        result: 'parried',
        hpDamage: 0,
        staminaDamage: 0,
        attackerStaggerMs: 1450,
        defenderStaggerMs: 0,
        divineGain: 18,
      };
    }

    if (attack.blockable) {
      const staminaCost = Math.max(10, Math.round(attack.poiseDamage * 0.65));
      if (defenderStamina >= staminaCost) {
        const chipFactor = Math.max(0.05, 1 - Math.min(0.95, 0.72 + guardMitigationPct / 100));
        return {
          result: 'blocked',
          hpDamage: Math.round(incomingDamage * chipFactor),
          staminaDamage: staminaCost,
          attackerStaggerMs: 0,
          defenderStaggerMs: 0,
          divineGain: 5,
        };
      }
      // Guard broken from depleted stamina
      timeline.state = 'stagger';
      timeline.stateTimerMs = 900;
      timeline.activeAction = null;
      return {
        result: 'guard_broken',
        hpDamage: Math.round(incomingDamage * 0.65),
        staminaDamage: defenderStamina,
        attackerStaggerMs: 0,
        defenderStaggerMs: 900,
        divineGain: 2,
      };
    }
  }

  // Direct hit
  const staggerMs = attack.poiseDamage >= 45 ? 450 : 0;
  if (staggerMs > 0) {
    timeline.state = 'stagger';
    timeline.stateTimerMs = staggerMs;
    timeline.activeAction = null;
  }
  return {
    result: 'hit',
    hpDamage: Math.max(1, incomingDamage),
    staminaDamage: 0,
    attackerStaggerMs: 0,
    defenderStaggerMs: staggerMs,
    divineGain: 3,
  };
}

export function getMountainWardenPhase(hp: number, maxHp: number): BossPhaseDef {
  const pct = maxHp > 0 ? hp / maxHp : 0;
  if (pct <= MOUNTAIN_WARDEN_PHASES[2].hpThresholdPct) {
    return MOUNTAIN_WARDEN_PHASES[2];
  }
  if (pct <= MOUNTAIN_WARDEN_PHASES[1].hpThresholdPct) {
    return MOUNTAIN_WARDEN_PHASES[1];
  }
  return MOUNTAIN_WARDEN_PHASES[0];
}

export function getMountainWardenDamageTakenMultiplier(
  phase: 1 | 2 | 3,
  sealStonesRemaining: number,
): number {
  if (phase === 3) {
    return 1.15; // Cracked armor takes bonus damage
  }
  if (phase === 2) {
    // 2 intact Seal Stones grant 38% damage reduction (0.62); each broken stone strips half
    if (sealStonesRemaining >= 2) return 0.62;
    if (sealStonesRemaining === 1) return 0.82;
    return 1.05;
  }
  return 0.92;
}

export function computeStealthAwarenessDelta(params: {
  distanceM: number;
  detectionRangeM: number;
  isSneaking: boolean;
  isSprinting: boolean;
  inFrontCone: boolean;
  dtSec: number;
}): number {
  if (params.distanceM > params.detectionRangeM) {
    return -35 * params.dtSec;
  }
  const proximity = 1 - params.distanceM / Math.max(1, params.detectionRangeM);
  const visibility = params.inFrontCone ? 1.25 : 0.45;
  const stance = params.isSneaking ? 0.35 : params.isSprinting ? 1.65 : 1.0;
  return (22 + proximity * 95) * visibility * stance * params.dtSec;
}

export type BufferedCombatAction = 'light_attack' | 'heavy_attack' | 'dodge' | 'parry' | 'cast';

export interface CombatInputBuffer {
  action: BufferedCombatAction | null;
  expiresAtMs: number;
}

export function createCombatInputBuffer(): CombatInputBuffer {
  return { action: null, expiresAtMs: 0 };
}

export function queueCombatInput(
  buf: CombatInputBuffer,
  action: BufferedCombatAction,
  nowMs: number,
  windowMs = 240,
): void {
  buf.action = action;
  buf.expiresAtMs = nowMs + windowMs;
}

export function consumeBufferedInput(buf: CombatInputBuffer, nowMs: number): BufferedCombatAction | null {
  if (!buf.action) return null;
  const act = nowMs <= buf.expiresAtMs ? buf.action : null;
  buf.action = null;
  buf.expiresAtMs = 0;
  return act;
}

export interface WeaponMovesetTiming {
  windupMult: number;
  activeMult: number;
  recoveryMult: number;
  staminaMult: number;
  poiseMult: number;
  weightClass: 'fast' | 'balanced' | 'heavy';
}

export function getWeaponMovesetTiming(weaponId: string): WeaponMovesetTiming {
  const id = weaponId.toLowerCase();
  if (id.includes('nightpiercer') || id.includes('dagger') || id.includes('estoc')) {
    return { windupMult: 0.78, activeMult: 0.88, recoveryMult: 0.80, staminaMult: 0.85, poiseMult: 0.85, weightClass: 'fast' };
  }
  if (id.includes('worldshatter') || id.includes('greatsword') || id.includes('oathbreaker') || id.includes('hammer')) {
    return { windupMult: 1.32, activeMult: 1.18, recoveryMult: 1.28, staminaMult: 1.25, poiseMult: 1.45, weightClass: 'heavy' };
  }
  return { windupMult: 1.0, activeMult: 1.0, recoveryMult: 1.0, staminaMult: 1.0, poiseMult: 1.0, weightClass: 'balanced' };
}

export function computeChargedAttackMultiplier(chargeSec: number): { damageMult: number; poiseBonus: number; isFullyCharged: boolean } {
  const t = Math.max(0, Math.min(1, chargeSec / 0.85));
  return {
    damageMult: 1.0 + t * 0.85,
    poiseBonus: Math.round(t * 28),
    isFullyCharged: chargeSec >= 0.75,
  };
}

export type HitDirection = 'front' | 'back' | 'left' | 'right';

export function classifyHitDirection(
  attackerPos: { x: number; z: number },
  defenderPos: { x: number; z: number },
  defenderYaw: number,
): HitDirection {
  const dx = attackerPos.x - defenderPos.x;
  const dz = attackerPos.z - defenderPos.z;
  const fwdX = Math.sin(defenderYaw);
  const fwdZ = Math.cos(defenderYaw);
  const rightX = Math.cos(defenderYaw);
  const rightZ = -Math.sin(defenderYaw);
  const dotFwd = dx * fwdX + dz * fwdZ;
  const dotRight = dx * rightX + dz * rightZ;
  if (Math.abs(dotFwd) >= Math.abs(dotRight)) {
    return dotFwd >= 0 ? 'front' : 'back';
  }
  return dotRight >= 0 ? 'right' : 'left';
}
