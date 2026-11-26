/** Pure motion timing helpers; shared by runtime and regression tests. */
export function damp(from: number, to: number, rate: number, dt: number): number {
  return to + (from - to) * Math.exp(-Math.max(0, rate) * Math.max(0, dt));
}
export function motionSubsteps(dt: number): number[] {
  const total = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
  const count = Math.max(1, Math.ceil(total / 0.05));
  return Array.from({ length: count }, () => total / count);
}
export type Gait = 'Idle' | 'Walk' | 'Run' | 'Sprint';
export function selectGait(previous: Gait, speed: number, walkOnly: boolean): Gait {
  if (speed < (previous === 'Idle' ? 0.35 : 0.22)) return 'Idle';
  if (walkOnly) return 'Walk';
  if (speed >= (previous === 'Sprint' ? 5.7 : 6.4)) return 'Sprint';
  if (speed >= (previous === 'Run' || previous === 'Sprint' ? 4.1 : 4.7)) return 'Run';
  return 'Walk';
}
export function attackPoseProgress(elapsedMs: number, windupMs: number, activeMs: number, recoveryMs: number, start: number, end: number): number {
  const w = Math.max(0, windupMs), a = Math.max(0, activeMs), r = Math.max(0, recoveryMs);
  const elapsed = Math.max(0, elapsedMs);
  if (elapsed < w) return start * elapsed / Math.max(w, 1);
  if (elapsed < w + a) return start + (end - start) * (elapsed - w) / Math.max(a, 1);
  if (elapsed < w + a + r) return end + (1 - end) * (elapsed - w - a) / Math.max(r, 1);
  return 1;
}
