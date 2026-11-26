import * as THREE from 'three';
import { attackPoseProgress } from './motionMath';

export interface AnimEventSpec {
  id: 'foot_left' | 'foot_right' | 'swing_whoosh' | 'hitbox_start' | 'hitbox_end' | 'cast_release' | 'weapon_draw' | 'weapon_sheathe';
  normTime: number; // 0..1 within clip duration
}

export interface AnimationControllerCallbacks {
  onEvent?: (eventId: AnimEventSpec['id']) => void;
}

const CLIP_EVENTS: Record<string, AnimEventSpec[]> = {
  walk: [
    { id: 'foot_left', normTime: 0.22 },
    { id: 'foot_right', normTime: 0.72 },
  ],
  walkback: [
    { id: 'foot_left', normTime: 0.24 },
    { id: 'foot_right', normTime: 0.74 },
  ],
  strafeleft: [
    { id: 'foot_left', normTime: 0.25 },
    { id: 'foot_right', normTime: 0.75 },
  ],
  straferight: [
    { id: 'foot_right', normTime: 0.25 },
    { id: 'foot_left', normTime: 0.75 },
  ],
  crouchwalk: [
    { id: 'foot_left', normTime: 0.25 },
    { id: 'foot_right', normTime: 0.75 },
  ],
  run: [
    { id: 'foot_left', normTime: 0.18 },
    { id: 'foot_right', normTime: 0.68 },
  ],
  sprint: [
    { id: 'foot_left', normTime: 0.16 },
    { id: 'foot_right', normTime: 0.66 },
  ],
  lightattack: [
    { id: 'swing_whoosh', normTime: 0.26 },
    { id: 'hitbox_start', normTime: 0.28 },
    { id: 'hitbox_end', normTime: 0.62 },
  ],
  lightattack2: [
    { id: 'swing_whoosh', normTime: 0.24 },
    { id: 'hitbox_start', normTime: 0.26 },
    { id: 'hitbox_end', normTime: 0.60 },
  ],
  lightattack3: [
    { id: 'swing_whoosh', normTime: 0.28 },
    { id: 'hitbox_start', normTime: 0.30 },
    { id: 'hitbox_end', normTime: 0.66 },
  ],
  heavyattack: [
    { id: 'swing_whoosh', normTime: 0.38 },
    { id: 'hitbox_start', normTime: 0.40 },
    { id: 'hitbox_end', normTime: 0.74 },
  ],
  drawsword: [{ id: 'weapon_draw', normTime: 0.45 }],
  sheathesword: [{ id: 'weapon_sheathe', normTime: 0.50 }],
  cast: [{ id: 'cast_release', normTime: 0.52 }],
};

export class AnimationController {
  private mixer: THREE.AnimationMixer | null;
  private clips: Map<string, THREE.AnimationClip>;
  private actions = new Map<string, THREE.AnimationAction>();
  private currentKey = '';
  private currentRequest = '';
  private currentLoop = true;
  private targetTimeScale = 1;
  private attackPoseDriven = false;
  private currentAction: THREE.AnimationAction | null = null;
  private prevNormTime = 0;
  private firedThisLoop = new Set<string>();
  private callbacks: AnimationControllerCallbacks;

  constructor(
    mixer: THREE.AnimationMixer | null,
    clips: Map<string, THREE.AnimationClip>,
    callbacks: AnimationControllerCallbacks = {},
  ) {
    this.mixer = mixer;
    this.clips = clips;
    this.callbacks = callbacks;
  }

  public hasClip(name: string): boolean {
    return this.clips.has(name.toLowerCase());
  }

  public getCurrentClip(): string {
    return this.currentKey;
  }

  private resolveClipKey(name: string): string | null {
    const low = name.toLowerCase();
    if (this.clips.has(low)) return low;
    // Graceful semantic fallbacks across hero/NPC/enemy clip sets
    const fallbacks: Record<string, string[]> = {
      sprint: ['run', 'walk'],
      walkback: ['walk', 'run'],
      strafeleft: ['walk', 'run'],
      straferight: ['walk', 'run'],
      crouchwalk: ['walk', 'crouchidle'],
      crouchidle: ['idle'],
      turnleft: ['walk', 'idle'],
      turnright: ['walk', 'idle'],
      jump: ['dodge', 'idle'],
      fall: ['jump', 'idle'],
      land: ['idle'],
      backstep: ['dodge', 'walk'],
      parry: ['block', 'lightattack'],
      lightattack2: ['lightattack'],
      lightattack3: ['lightattack', 'heavyattack'],
      chargedattack: ['heavyattack'],
      knockdown: ['stagger', 'death'],
      recover: ['idle'],
      drawsword: ['interact', 'idle'],
      sheathesword: ['interact', 'idle'],
      telegraph: ['heavyattack', 'lightattack', 'idle'],
      attack: ['lightattack', 'heavyattack'],
    };
    for (const candidate of fallbacks[low] ?? ['idle']) {
      if (this.clips.has(candidate)) return candidate;
    }
    return this.clips.has('idle') ? 'idle' : null;
  }

  public play(name: string, options: { loop?: boolean; fadeSec?: number; timeScale?: number; forceRestart?: boolean } = {}): void {
    if (!this.mixer) return;
    const key = this.resolveClipKey(name);
    if (!key) return;

    const loop = options.loop ?? true;
    const fadeSec = options.fadeSec ?? 0.16;
    const timeScale = options.timeScale ?? 1.0;

    if (this.currentKey === key && this.currentRequest === name.toLowerCase() && this.currentLoop === loop && !options.forceRestart && this.currentAction) {
      this.targetTimeScale = timeScale;
      return;
    }

    let nextAction = this.actions.get(key);
    if (!nextAction) {
      const clip = this.clips.get(key)!;
      nextAction = this.mixer.clipAction(clip);
      this.actions.set(key, nextAction);
    }

    const locomotion = /^(walk|walkback|run|sprint|strafeleft|straferight|crouchwalk)$/;
    const previous = this.currentAction;
    const preservePhase = Boolean(previous && loop && this.currentLoop && !options.forceRestart && locomotion.test(this.currentRequest) && locomotion.test(name.toLowerCase()));
    const phase = preservePhase && previous ? (previous.time / Math.max(previous.getClip().duration, 0.001)) % 1 : 0;
    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    nextAction.clampWhenFinished = !loop;
    nextAction.setEffectiveTimeScale(timeScale);
    nextAction.setEffectiveWeight(1.0);
    nextAction.time = phase * nextAction.getClip().duration;
    this.targetTimeScale = timeScale;
    this.attackPoseDriven = false;

    if (this.currentAction && this.currentAction !== nextAction) {
      nextAction.play();
      this.currentAction.crossFadeTo(nextAction, fadeSec, false);
    } else {
      // Restarting the same action must not fade through the unanimated bind pose.
      nextAction.play();
    }

    this.currentKey = key;
    this.currentRequest = name.toLowerCase();
    this.currentLoop = loop;
    this.currentAction = nextAction;
    this.prevNormTime = phase;
    this.firedThisLoop.clear();
    // Mark events before the retained gait phase as already consumed.
    for (const ev of CLIP_EVENTS[name.toLowerCase()] ?? CLIP_EVENTS[key] ?? []) {
      if (ev.normTime <= phase) this.firedThisLoop.add(`${ev.id}_${ev.normTime}`);
    }
  }

  public setSpeedSync(actualSpeedMps: number, referenceSpeedMps: number): void {
    if (!this.currentAction || referenceSpeedMps <= 0.1) return;
    const ratio = Math.max(0.55, Math.min(1.65, actualSpeedMps / referenceSpeedMps));
    this.targetTimeScale = ratio;
  }

  /** Drive attack clips from the same authoritative timeline as damage and release. */
  public syncAttackPose(elapsedMs: number, windupMs: number, activeMs: number, recoveryMs: number): void {
    if (!this.currentAction || this.currentLoop) return;
    const specs = CLIP_EVENTS[this.currentRequest] ?? CLIP_EVENTS[this.currentKey] ?? [];
    const start = specs.find((event) => event.id === 'hitbox_start' || event.id === 'cast_release')?.normTime ?? 0.35;
    const end = specs.find((event) => event.id === 'hitbox_end')?.normTime ?? Math.max(start + 0.15, 0.7);
    const progress = attackPoseProgress(elapsedMs, windupMs, activeMs, recoveryMs, start, end);
    this.attackPoseDriven = true;
    this.currentAction.enabled = true;
    this.currentAction.paused = false;
    this.currentAction.setEffectiveTimeScale(0);
    this.currentAction.time = Math.min(this.currentAction.getClip().duration - 0.00001, progress * this.currentAction.getClip().duration);
  }

  public update(dtSec: number): void {
    if (!this.mixer) return;
    if (this.currentAction && !this.attackPoseDriven) {
      const current = this.currentAction.getEffectiveTimeScale();
      this.currentAction.setEffectiveTimeScale(current + (this.targetTimeScale - current) * (1 - Math.exp(-12 * dtSec)));
    }
    this.mixer.update(dtSec);

    if (!this.currentAction || !this.callbacks.onEvent) return;
    const clip = this.currentAction.getClip();
    const dur = clip.duration;
    if (dur <= 0.01) return;

    // LoopOnce clamps time at duration: modulo would turn the final frame into 0
    // and could silently drop a late event or incorrectly replay earlier events.
    const norm = this.currentLoop
      ? (this.currentAction.time % dur) / dur
      : Math.max(0, Math.min(1, this.currentAction.time / dur));
    const specs = CLIP_EVENTS[this.currentRequest] ?? CLIP_EVENTS[this.currentKey] ?? [];
    const emitThrough = (end: number) => {
      for (const ev of specs) {
        const key = `${ev.id}_${ev.normTime}`;
        if (!this.firedThisLoop.has(key) && end >= ev.normTime) {
          this.firedThisLoop.add(key);
          this.callbacks.onEvent?.(ev.id);
        }
      }
    };
    if (this.currentLoop && norm < this.prevNormTime) {
      emitThrough(1);
      this.firedThisLoop.clear();
    }
    emitThrough(norm);
    this.prevNormTime = norm;
  }

  public dispose(): void {
    this.mixer?.stopAllAction();
    this.actions.clear();
    this.currentAction = null;
    this.currentKey = '';
    this.currentRequest = '';
    this.attackPoseDriven = false;
    this.firedThisLoop.clear();
  }
}

