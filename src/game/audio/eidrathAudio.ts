import type { GameSettings } from '../types';
import type { SurfaceKind } from '../world/frostheimTerrain';

export type MusicZone = 'menu' | 'explore' | 'village' | 'combat' | 'boss' | 'tomb';

interface SpatialEmitter {
  id: string;
  key: 'env/fire' | 'env/water' | 'env/wind';
  panner: PannerNode;
  source: AudioBufferSourceNode | null;
  started: boolean;
}

export class EidrathAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private dialogueGain: GainNode | null = null;

  private manifest: Record<string, string[]> = {};
  private buffers = new Map<string, AudioBuffer>();
  private loadingBuffers = new Map<string, Promise<AudioBuffer | null>>();
  private spatialEmitters = new Map<string, SpatialEmitter>();
  private pendingEmitters: Array<{ id: string; key: 'env/fire' | 'env/water' | 'env/wind'; pos: { x: number; y: number; z: number } }> = [];

  private currentMusicZone: MusicZone | null = null;
  private activeMusicSource: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private musicToken = 0;

  private volume = 0.75;
  private musicVol = 0.7;
  private ambienceVol = 0.8;
  private sfxVol = 0.85;
  private dialogueVol = 0.9;
  private muted = false;
  private manifestLoaded = false;

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.ambienceGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.dialogueGain = this.ctx.createGain();

      this.musicGain.connect(this.masterGain);
      this.ambienceGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.dialogueGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
      this.applyBusVolumes();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (!this.manifestLoaded) {
      void this.loadManifestAndStart();
    }
  }

  private async loadManifestAndStart(): Promise<void> {
    this.manifestLoaded = true;
    try {
      const resp = await fetch('/assets/eidrath/audio/audio_manifest.json');
      if (resp.ok) {
        this.manifest = (await resp.json()) as Record<string, string[]>;
      }
    } catch {
      // Manifest unavailable offline; fallback Web Audio synth handles SFX cleanly
    }
    for (const p of this.pendingEmitters) {
      this.createSpatialEmitterInternal(p.id, p.key, p.pos);
    }
    this.pendingEmitters = [];
    if (this.currentMusicZone) {
      const z = this.currentMusicZone;
      this.currentMusicZone = null;
      this.setMusicState(z);
    }
  }

  setSettings(volume: number, muted: boolean, buses?: Partial<Pick<GameSettings, 'musicVolume' | 'ambienceVolume' | 'sfxVolume' | 'dialogueVolume'>>): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
    if (buses?.musicVolume !== undefined) this.musicVol = buses.musicVolume;
    if (buses?.ambienceVolume !== undefined) this.ambienceVol = buses.ambienceVolume;
    if (buses?.sfxVolume !== undefined) this.sfxVol = buses.sfxVolume;
    if (buses?.dialogueVolume !== undefined) this.dialogueVol = buses.dialogueVolume;
    this.applyBusVolumes();
  }

  private applyBusVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.masterGain?.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.05);
    this.musicGain?.gain.setTargetAtTime(this.musicVol * 0.52, t, 0.08);
    this.ambienceGain?.gain.setTargetAtTime(this.ambienceVol * 0.42, t, 0.08);
    this.sfxGain?.gain.setTargetAtTime(this.sfxVol, t, 0.05);
    this.dialogueGain?.gain.setTargetAtTime(this.dialogueVol, t, 0.05);
  }

  private async getBuffer(url: string): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    const existing = this.buffers.get(url);
    if (existing) return existing;
    const inflight = this.loadingBuffers.get(url);
    if (inflight) return inflight;

    const p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((ab) => (ab && this.ctx ? this.ctx.decodeAudioData(ab) : null))
      .then((buf) => {
        if (buf) this.buffers.set(url, buf);
        this.loadingBuffers.delete(url);
        return buf;
      })
      .catch(() => {
        this.loadingBuffers.delete(url);
        return null;
      });
    this.loadingBuffers.set(url, p);
    return p;
  }

  private pickUrl(key: string): string | null {
    const arr = this.manifest[key];
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private playBufferClip(
    key: string,
    opts: { gain?: number; pitchMin?: number; pitchMax?: number; bus?: 'sfx' | 'dialogue' } = {},
  ): boolean {
    if (this.muted || !this.ctx || !this.sfxGain || this.ctx.state !== 'running') return false;
    const url = this.pickUrl(key);
    if (!url) return false;
    const pitch = (opts.pitchMin ?? 0.92) + Math.random() * ((opts.pitchMax ?? 1.08) - (opts.pitchMin ?? 0.92));
    const dest = opts.bus === 'dialogue' ? this.dialogueGain ?? this.sfxGain : this.sfxGain;
    const gainVal = opts.gain ?? 0.65;

    const cached = this.buffers.get(url);
    if (cached) {
      const src = this.ctx.createBufferSource();
      src.buffer = cached;
      src.playbackRate.value = pitch;
      const g = this.ctx.createGain();
      g.gain.value = gainVal;
      src.connect(g);
      g.connect(dest);
      src.start();
      return true;
    }
    void this.getBuffer(url).then((buf) => {
      if (!buf || !this.ctx || this.ctx.state !== 'running') return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = pitch;
      const g = this.ctx.createGain();
      g.gain.value = gainVal;
      src.connect(g);
      g.connect(dest);
      src.start();
    });
    return true;
  }

  public setMusicState(zone: MusicZone): void {
    if (this.currentMusicZone === zone) return;
    this.currentMusicZone = zone;
    if (!this.ctx || !this.musicGain) return;
    const url = this.pickUrl(`music/${zone}`);
    if (!url) return;

    const token = ++this.musicToken;
    void this.getBuffer(url).then((buf) => {
      if (!buf || token !== this.musicToken || !this.ctx || !this.musicGain) return;
      const now = this.ctx.currentTime;
      const fadeSec = 2.4;

      if (this.activeMusicSource) {
        const old = this.activeMusicSource;
        old.gain.gain.cancelScheduledValues(now);
        old.gain.gain.setValueAtTime(old.gain.gain.value, now);
        old.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
        try {
          old.source.stop(now + fadeSec + 0.1);
        } catch {
          // ignore already stopped
        }
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.85, now + fadeSec);
      src.connect(g);
      g.connect(this.musicGain);
      src.start(now);
      this.activeMusicSource = { source: src, gain: g };
    });
  }

  public registerSpatialEmitter(id: string, key: 'env/fire' | 'env/water' | 'env/wind', pos: { x: number; y: number; z: number }): void {
    if (this.spatialEmitters.has(id)) return;
    if (!this.ctx || !this.ambienceGain || !this.manifestLoaded) {
      this.pendingEmitters.push({ id, key, pos });
      return;
    }
    this.createSpatialEmitterInternal(id, key, pos);
  }

  private createSpatialEmitterInternal(id: string, key: 'env/fire' | 'env/water' | 'env/wind', pos: { x: number; y: number; z: number }): void {
    if (!this.ctx || !this.ambienceGain || this.spatialEmitters.has(id)) return;
    const url = this.pickUrl(key);
    if (!url) return;
    const panner = this.ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = key === 'env/wind' ? 18 : 3.2;
    panner.maxDistance = key === 'env/wind' ? 90 : 28;
    panner.rolloffFactor = key === 'env/wind' ? 0.45 : 1.35;
    panner.positionX.value = pos.x;
    panner.positionY.value = pos.y;
    panner.positionZ.value = pos.z;
    panner.connect(this.ambienceGain);

    const emitter: SpatialEmitter = { id, key, panner, source: null, started: false };
    this.spatialEmitters.set(id, emitter);

    void this.getBuffer(url).then((buf) => {
      if (!buf || !this.ctx || emitter.started) return;
      emitter.started = true;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(panner);
      src.start();
      emitter.source = src;
    });
  }

  public updateListener(pos: { x: number; y: number; z: number }, fwd: { x: number; y: number; z: number }): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const l = this.ctx.listener;
    if ('positionX' in l) {
      l.positionX.value = pos.x;
      l.positionY.value = pos.y;
      l.positionZ.value = pos.z;
      l.forwardX.value = fwd.x;
      l.forwardY.value = fwd.y;
      l.forwardZ.value = fwd.z;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    }
  }

  private playTone(freqStart: number, freqEnd: number, durationSec: number, type: OscillatorType, gainPeak: number): void {
    if (this.muted || !this.ctx || !this.sfxGain || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + durationSec);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gainPeak, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  playFootstep(sprinting: boolean, surface: SurfaceKind = 'snow'): void {
    const key = `footsteps/${surface}`;
    if (!this.playBufferClip(key, { gain: sprinting ? 0.56 : 0.36 })) {
      this.playTone(sprinting ? 145 : 115, 58, 0.07, 'triangle', sprinting ? 0.07 : 0.045);
    }
  }

  playUnsheathe(): void {
    if (!this.playBufferClip('combat/unsheathe', { gain: 0.55 })) {
      this.playTone(680, 980, 0.16, 'triangle', 0.08);
    }
  }

  playSlash(heavy: boolean): void {
    if (!this.playBufferClip('combat/swing', { gain: heavy ? 0.72 : 0.52, pitchMin: heavy ? 0.80 : 0.96, pitchMax: heavy ? 0.94 : 1.12 })) {
      this.playTone(heavy ? 240 : 420, heavy ? 78 : 135, heavy ? 0.22 : 0.12, 'sawtooth', heavy ? 0.14 : 0.09);
    }
  }

  playHitImpact(heavy: boolean): void {
    if (!this.playBufferClip('combat/impact', { gain: heavy ? 0.85 : 0.62, pitchMin: heavy ? 0.82 : 0.94, pitchMax: heavy ? 0.96 : 1.08 })) {
      this.playTone(heavy ? 120 : 170, 38, heavy ? 0.24 : 0.13, 'square', heavy ? 0.18 : 0.12);
    }
  }

  playParryRing(): void {
    if (!this.playBufferClip('combat/parry', { gain: 0.82 })) {
      this.playTone(980, 1460, 0.28, 'sine', 0.17);
      this.playTone(1480, 1180, 0.36, 'triangle', 0.11);
    }
  }

  playBlockThud(): void {
    if (!this.playBufferClip('combat/block', { gain: 0.68 })) {
      this.playTone(210, 92, 0.11, 'square', 0.12);
    }
  }

  playSpell(kind: 'frost' | 'fire' | 'oath'): void {
    if (!this.playBufferClip('combat/spell', { gain: kind === 'oath' ? 0.78 : 0.62 })) {
      if (kind === 'frost') this.playTone(760, 320, 0.24, 'sine', 0.12);
      else if (kind === 'fire') this.playTone(190, 95, 0.26, 'sawtooth', 0.14);
      else this.playTone(146.8, 293.6, 0.45, 'sawtooth', 0.16);
    }
  }

  playWardenSlam(): void {
    if (!this.playBufferClip('combat/roar', { gain: 0.88, pitchMin: 0.84, pitchMax: 0.96 })) {
      this.playTone(92, 28, 0.48, 'sawtooth', 0.24);
    }
  }

  playUiClick(): void {
    this.playBufferClip('ui/click', { gain: 0.40 });
  }

  playQuestChime(): void {
    this.playTone(293.66, 293.66, 0.28, 'triangle', 0.11);
    setTimeout(() => this.playTone(440, 440, 0.42, 'triangle', 0.11), 130);
  }

  dispose(): void {
    try {
      this.activeMusicSource?.source.stop();
      for (const em of this.spatialEmitters.values()) {
        em.source?.stop();
      }
      this.spatialEmitters.clear();
      void this.ctx?.close();
    } catch {
      // Safe cleanup
    }
    this.ctx = null;
    this.masterGain = null;
    this.activeMusicSource = null;
  }
}
