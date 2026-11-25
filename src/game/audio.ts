export class SkyforgeAudio {
  private ctx: AudioContext | null = null;
  private muted = false;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private jitter(base: number): number {
    return base * (0.92 + Math.random() * 0.16);
  }

  public playSlash(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(this.jitter(520), now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.11);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playDash(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this.jitter(220), now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.09);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playHit(heavy = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = heavy ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(this.jitter(heavy ? 185 : 290), now);
    osc.frequency.exponentialRampToValueAtTime(heavy ? 48 : 88, now + (heavy ? 0.17 : 0.09));
    gain.gain.setValueAtTime(heavy ? 0.18 : 0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.18 : 0.1));
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (heavy ? 0.19 : 0.11));
  }

  public playNova(): void {
    // Skyrim Unrelenting Force ("FUS RO DAH") deep Nordic horn + thunderous wind-blast
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const horn = ctx.createOscillator();
    const fifth = ctx.createOscillator();
    const hornFilter = ctx.createBiquadFilter();
    const hornGain = ctx.createGain();
    horn.type = 'sawtooth';
    fifth.type = 'triangle';
    horn.frequency.setValueAtTime(146.8, now);
    horn.frequency.exponentialRampToValueAtTime(65.4, now + 0.55);
    fifth.frequency.setValueAtTime(220.0, now);
    fifth.frequency.exponentialRampToValueAtTime(98.0, now + 0.52);
    hornFilter.type = 'lowpass';
    hornFilter.frequency.setValueAtTime(950, now);
    hornFilter.frequency.exponentialRampToValueAtTime(220, now + 0.55);
    hornGain.gain.setValueAtTime(0.20, now);
    hornGain.gain.exponentialRampToValueAtTime(0.001, now + 0.60);
    horn.connect(hornFilter);
    fifth.connect(hornFilter);
    hornFilter.connect(hornGain).connect(ctx.destination);
    horn.start(now);
    fifth.start(now);
    horn.stop(now + 0.62);
    fifth.stop(now + 0.62);

    // Sweeping thunder-wind shockwave noise burst
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    src.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(1100, now);
    windFilter.frequency.exponentialRampToValueAtTime(260, now + 0.45);
    windFilter.Q.setValueAtTime(1.1, now);
    const windGain = ctx.createGain();
    windGain.gain.setValueAtTime(0.22, now);
    windGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
    src.connect(windFilter).connect(windGain).connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.50);
  }

  public playTelegraph(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.22);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playPickup(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.055);
      gain.gain.setValueAtTime(0.09, now + idx * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.055 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.18);
    });
  }

  public playPlayerHurt(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.24);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  private noiseBuffer: AudioBuffer | null = null;

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const len = Math.floor(ctx.sampleRate * 0.25);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  public playFootstep(sprinting = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Stone grit crunch (bandpass filtered noise)
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(this.jitter(sprinting ? 920 : 680), now);
    filter.Q.setValueAtTime(1.8, now);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(sprinting ? 0.085 : 0.055, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    src.connect(filter).connect(noiseGain).connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.07);

    // Armored boot heel tap on stone
    const osc = ctx.createOscillator();
    const tapGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(this.jitter(sprinting ? 145 : 118), now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.055);
    tapGain.gain.setValueAtTime(sprinting ? 0.095 : 0.06, now);
    tapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(tapGain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  public playJump(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this.jitter(165), now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.11);
    gain.gain.setValueAtTime(0.085, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playLand(impactSpeed = 6): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const intensity = Math.min(1, Math.max(0.3, impactSpeed / 12));

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(this.jitter(115), now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.13);
    gain.gain.setValueAtTime(0.16 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);

    this.playFootstep(true);
  }

  public playFanfare(victory: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = victory ? [392, 493.88, 587.33, 783.99] : [329.63, 293.66, 246.94, 196];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = victory ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.11);
      gain.gain.setValueAtTime(0.11, now + i * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.11 + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.11);
      osc.stop(now + i * 0.11 + 0.35);
    });
  }
}
