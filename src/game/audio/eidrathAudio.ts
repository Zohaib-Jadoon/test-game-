export class EidrathAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private windNode: AudioNode | null = null;
  private droneOsc: OscillatorNode | null = null;
  private volume = 0.75;
  private muted = false;
  private ambienceStarted = false;

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (!this.ambienceStarted && this.ctx && this.masterGain) {
      this.startNordicAmbience();
    }
  }

  setSettings(volume: number, muted: boolean): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
    }
  }

  private startNordicAmbience(): void {
    if (!this.ctx || !this.masterGain) return;
    this.ambienceStarted = true;
    try {
      // Restrained low Nordic horn/cello drone (D2 = 73.42 Hz)
      const osc = this.ctx.createOscillator();
      const droneGain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.value = 73.42;
      filter.type = 'lowpass';
      filter.frequency.value = 180;
      droneGain.gain.value = 0.032;
      osc.connect(filter);
      filter.connect(droneGain);
      droneGain.connect(this.masterGain);
      osc.start();
      this.droneOsc = osc;

      // Cold Frostheim mountain wind (filtered pink-ish noise buffer)
      const bufferLen = this.ctx.sampleRate * 3;
      const buffer = this.ctx.createBuffer(1, bufferLen, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0;
      for (let i = 0; i < bufferLen; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.96 * b0 + white * 0.04;
        data[i] = b0 * 1.4;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 420;
      windFilter.Q.value = 1.6;
      const windGain = this.ctx.createGain();
      windGain.gain.value = 0.045;
      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(this.masterGain);
      noise.start();
      this.windNode = noise;
    } catch {
      // Ignore Web Audio restrictions when autoplay blocked
    }
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType,
    gainPeak: number,
  ): void {
    if (this.muted || !this.ctx || !this.masterGain || this.ctx.state !== 'running') return;
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
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  }

  playFootstep(sprinting: boolean): void {
    this.playTone(sprinting ? 145 : 115, 58, 0.07, 'triangle', sprinting ? 0.07 : 0.045);
  }

  playSlash(heavy: boolean): void {
    this.playTone(heavy ? 240 : 420, heavy ? 78 : 135, heavy ? 0.22 : 0.12, 'sawtooth', heavy ? 0.14 : 0.09);
  }

  playHitImpact(heavy: boolean): void {
    this.playTone(heavy ? 120 : 170, 38, heavy ? 0.24 : 0.13, 'square', heavy ? 0.18 : 0.12);
  }

  playParryRing(): void {
    this.playTone(980, 1460, 0.28, 'sine', 0.17);
    this.playTone(1480, 1180, 0.36, 'triangle', 0.11);
  }

  playBlockThud(): void {
    this.playTone(210, 92, 0.11, 'square', 0.12);
  }

  playSpell(kind: 'frost' | 'fire' | 'oath'): void {
    if (kind === 'frost') {
      this.playTone(760, 320, 0.24, 'sine', 0.12);
    } else if (kind === 'fire') {
      this.playTone(190, 95, 0.26, 'sawtooth', 0.14);
    } else {
      this.playTone(146.8, 293.6, 0.45, 'sawtooth', 0.16);
      this.playTone(440, 220, 0.42, 'triangle', 0.12);
    }
  }

  playWardenSlam(): void {
    this.playTone(92, 28, 0.48, 'sawtooth', 0.24);
  }

  playQuestChime(): void {
    this.playTone(293.66, 293.66, 0.28, 'triangle', 0.11);
    setTimeout(() => this.playTone(440, 440, 0.42, 'triangle', 0.11), 130);
  }

  dispose(): void {
    try {
      this.droneOsc?.stop();
      if (this.windNode && 'stop' in this.windNode) {
        (this.windNode as AudioBufferSourceNode).stop();
      }
      void this.ctx?.close();
    } catch {
      // Safe cleanup
    }
    this.ctx = null;
    this.masterGain = null;
    this.ambienceStarted = false;
  }
}
