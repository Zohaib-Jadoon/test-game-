import * as THREE from 'three';

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

    if (this.currentKey === key && !options.forceRestart && this.currentAction) {
      this.currentAction.setEffectiveTimeScale(timeScale);
      return;
    }

    let nextAction = this.actions.get(key);
    if (!nextAction) {
      const clip = this.clips.get(key)!;
      nextAction = this.mixer.clipAction(clip);
      this.actions.set(key, nextAction);
    }

    nextAction.enabled = true;
    nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    nextAction.clampWhenFinished = !loop;
    nextAction.setEffectiveTimeScale(timeScale);
    nextAction.setEffectiveWeight(1.0);
    nextAction.reset();

    if (this.currentAction && this.currentAction !== nextAction) {
      nextAction.play();
      this.currentAction.crossFadeTo(nextAction, fadeSec, true);
    } else {
      nextAction.fadeIn(fadeSec).play();
    }

    this.currentKey = key;
    this.currentAction = nextAction;
    this.prevNormTime = 0;
    this.firedThisLoop.clear();
  }

  public setSpeedSync(actualSpeedMps: number, referenceSpeedMps: number): void {
    if (!this.currentAction || referenceSpeedMps <= 0.1) return;
    const ratio = Math.max(0.55, Math.min(1.65, actualSpeedMps / referenceSpeedMps));
    this.currentAction.setEffectiveTimeScale(ratio);
  }

  public update(dtSec: number): void {
    if (!this.mixer) return;
    this.mixer.update(dtSec);

    if (!this.currentAction || !this.callbacks.onEvent) return;
    const clip = this.currentAction.getClip();
    const dur = clip.duration;
    if (dur <= 0.01) return;

    const norm = (this.currentAction.time % dur) / dur;
    if (norm < this.prevNormTime) {
      this.firedThisLoop.clear();
    }

    const specs = CLIP_EVENTS[this.currentKey];
    if (specs) {
      for (const ev of specs) {
        const key = `${ev.id}_${ev.normTime}`;
        if (!this.firedThisLoop.has(key) && norm >= ev.normTime) {
          this.firedThisLoop.add(key);
          this.callbacks.onEvent(ev.id);
        }
      }
    }
    this.prevNormTime = norm;
  }

  public dispose(): void {
    this.mixer?.stopAllAction();
    this.actions.clear();
  }
}

