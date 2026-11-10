/**
 * Procedural Web Audio API Synthesizer (Studio / Livestream Grade)
 * Zero external asset dependencies. Generates rich, dynamic, multi-layered procedural sound effects
 * with stereo panning, master dynamics compression (preventing clipping), velocity sensitivity,
 * crowd cheers, tactile impacts, and triumphant victory fanfares.
 */

export class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  public _isMuted: boolean = false;
  public masterVolume: number = 0.75;

  // Rate-limiting timestamps to prevent audio clustering / clipping
  private lastImpactTime: number = 0;
  private lastWallBounceTime: number = 0;
  private lastSliceTime: number = 0;
  private lastShowdownTime: number = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      const savedMute = localStorage.getItem('arena_sound_muted');
      this._isMuted = savedMute === 'true';
      const savedVol = localStorage.getItem('arena_sound_volume');
      if (savedVol !== null) {
        const v = parseFloat(savedVol);
        if (!isNaN(v) && v >= 0 && v <= 1) {
          this.masterVolume = v;
        }
      }

      // Auto-unlock AudioContext on first user interaction (touch, pointer, or key)
      const unlockAudio = () => {
        this.initContext();
        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      };
      window.addEventListener('pointerdown', unlockAudio, { once: true });
      window.addEventListener('keydown', unlockAudio, { once: true });
    }
  }

  public get isMuted(): boolean {
    return this._isMuted;
  }

  public getIsMuted(): boolean {
    return this._isMuted;
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public setMasterVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      try {
        const targetVol = this._isMuted ? 0 : this.masterVolume;
        this.masterGain.gain.setValueAtTime(targetVol, this.ctx.currentTime);
      } catch {}
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('arena_sound_volume', this.masterVolume.toString());
    }
  }

  public toggleMute(): boolean {
    this._isMuted = !this._isMuted;
    if (this.masterGain && this.ctx) {
      try {
        const targetVol = this._isMuted ? 0 : this.masterVolume;
        this.masterGain.gain.setValueAtTime(targetVol, this.ctx.currentTime);
      } catch {}
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('arena_sound_muted', this._isMuted ? 'true' : 'false');
    }
    return this._isMuted;
  }

  /**
   * Initializes master audio bus:
   * Source Node -> [Stereo Panner] -> Dynamics Compressor (glue & limiter) -> Master Gain -> Audio Destination
   */
  private initContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();

        // Master Compressor to avoid clipping and give punchy broadcast glue
        try {
          this.compressor = this.ctx.createDynamicsCompressor();
          this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
          this.compressor.knee.setValueAtTime(20, this.ctx.currentTime);
          this.compressor.ratio.setValueAtTime(6, this.ctx.currentTime);
          this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
          this.compressor.release.setValueAtTime(0.12, this.ctx.currentTime);

          // Master Gain Node
          this.masterGain = this.ctx.createGain();
          const targetVol = this._isMuted ? 0 : this.masterVolume;
          this.masterGain.gain.setValueAtTime(targetVol, this.ctx.currentTime);

          this.compressor.connect(this.masterGain);
          this.masterGain.connect(this.ctx.destination);
        } catch {
          // Fallback if compressor creation fails
        }
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  /**
   * Connects an audio node into the mastered signal chain with optional stereo panning (-1.0 to 1.0)
   */
  private routeToMaster(source: AudioNode, ctx: AudioContext, panX: number = 0): AudioNode {
    try {
      const target = this.compressor || this.masterGain || ctx.destination;

      if (ctx.createStereoPanner && Math.abs(panX) > 0.05) {
        const panner = ctx.createStereoPanner();
        const clampedPan = Math.max(-0.95, Math.min(0.95, panX));
        panner.pan.setValueAtTime(clampedPan, ctx.currentTime);
        source.connect(panner);
        panner.connect(target);
        return panner;
      } else {
        source.connect(target);
        return target;
      }
    } catch {
      try {
        source.connect(ctx.destination);
      } catch {}
      return ctx.destination;
    }
  }

  /**
   * Generates a short white-noise buffer for transients, whooshes, and crowd roar
   */
  private getNoiseBuffer(ctx: AudioContext, durationSec: number = 0.5): AudioBuffer | null {
    try {
      const sampleRate = ctx.sampleRate || 44100;
      const bufferSize = Math.floor(sampleRate * durationSec);
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      return buffer;
    } catch {
      return null;
    }
  }

  /**
   * Session Start: High energy broadcast flourish
   */
  public playSessionStart(): void {
    if (this.isMuted || this.masterVolume <= 0) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      [330, 440, 660, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + i * 0.06;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.22, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

        osc.connect(gain);
        this.routeToMaster(gain, ctx, (i - 1.5) * 0.3);

        osc.start(start);
        osc.stop(start + 0.27);
      });
    } catch {}
  }

  /**
   * Kinetic Ball-to-Ball Collision Impact:
   * Multi-layered sound:
   * 1. Transient click / snap (punchy attack)
   * 2. Resonant sub-bass thud (depth & weight that scales with relative velocity)
   */
  public playImpact(relSpeed: number = 3.0, panX: number = 0): void {
    if (this.isMuted || this.masterVolume <= 0) return;
    const nowMs = performance.now();
    if (nowMs - this.lastImpactTime < 28) return; // Rate-limiting prevents sound clustering
    this.lastImpactTime = nowMs;

    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const speedNorm = Math.min(10.0, Math.max(1.5, relSpeed));
      const intensity = (speedNorm - 1.5) / 8.5; // 0.0 to 1.0

      // Layer 1: Sub-bass body thud
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';

      const startFreq = 85 + intensity * 60; // 85Hz - 145Hz
      const endFreq = 32 + intensity * 10;
      subOsc.frequency.setValueAtTime(startFreq, now);
      subOsc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.08);

      const subVol = 0.12 + intensity * 0.22;
      subGain.gain.setValueAtTime(subVol, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09 + intensity * 0.04);

      subOsc.connect(subGain);
      this.routeToMaster(subGain, ctx, panX);
      subOsc.start(now);
      subOsc.stop(now + 0.14);

      // Layer 2: Transient punch click
      const clickOsc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(260 + intensity * 180, now);
      clickOsc.frequency.exponentialRampToValueAtTime(80, now + 0.025);

      const clickVol = 0.08 + intensity * 0.16;
      clickGain.gain.setValueAtTime(clickVol, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

      clickOsc.connect(clickGain);
      this.routeToMaster(clickGain, ctx, panX);
      clickOsc.start(now);
      clickOsc.stop(now + 0.035);
    } catch {}
  }

  /**
   * Wall / Perimeter Ricochet: Elastic rim bounce ping
   */
  public playWallBounce(speed: number = 3.0, panX: number = 0): void {
    if (this.isMuted || this.masterVolume <= 0) return;
    const nowMs = performance.now();
    if (nowMs - this.lastWallBounceTime < 40) return;
    this.lastWallBounceTime = nowMs;

    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      const baseFreq = 420 + Math.min(200, speed * 25);
      osc.frequency.setValueAtTime(baseFreq, now);
      osc.frequency.exponentialRampToValueAtTime(260, now + 0.07);

      const vol = Math.min(0.2, 0.06 + speed * 0.02);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

      osc.connect(gain);
      this.routeToMaster(gain, ctx, panX);

      osc.start(now);
      osc.stop(now + 0.08);
    } catch {}
  }

  /**
   * Line Slice / Laser Swoosh: Razor-sharp cutting whoosh in Line Battle
   */
  public playSlice(panX: number = 0): void {
    if (this.isMuted || this.masterVolume <= 0) return;
    const nowMs = performance.now();
    if (nowMs - this.lastSliceTime < 50) return;
    this.lastSliceTime = nowMs;

    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Layer 1: Sawtooth laser whip
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1180, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.09);

      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      this.routeToMaster(gain, ctx, panX);
      osc.start(now);
      osc.stop(now + 0.1);

      // Layer 2: Filtered air slice noise
      const noise = this.getNoiseBuffer(ctx, 0.1);
      if (noise) {
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noise;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1800, now);
        filter.Q.setValueAtTime(3.0, now);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.14, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        noiseSource.connect(filter);
        filter.connect(noiseGain);
        this.routeToMaster(noiseGain, ctx, panX);

        noiseSource.start(now);
        noiseSource.stop(now + 0.085);
      }
    } catch {}
  }

  /**
   * Grab Action: Tactile snap when latching onto an opponent
   */
  public playGrab(panX: number = 0): void {
    if (this.isMuted || this.masterVolume <= 0) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(740, now + 0.07);

      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      this.routeToMaster(gain, ctx, panX);

      osc.start(now);
      osc.stop(now + 0.09);
    } catch {}
  }

  /**
   * Ability Collect Chime: Sparkling crystalline 5-note arpeggio
   */
  public playPickup(): void {
    if (this.isMuted || this.masterVolume <= 0) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // C5, E5, G5, B5, C6 bell arpeggio
      const notes = [523.25, 659.25, 783.99, 987.77, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.038;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.18, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);

        osc.connect(gain);
        this.routeToMaster(gain, ctx, (idx - 2) * 0.2);

        osc.start(start);
        osc.stop(start + 0.2);
      });
    } catch {}
  }

  /**
   * Ability Activate: Futuristic energy power surge
   */
  public playAbilityActivate(): void {
    if (this.isMuted || this.masterVolume <= 0) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(960, now + 0.18);

      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      this.routeToMaster(gain, ctx);

      osc.start(now);
      osc.stop(now + 0.21);
    } catch {}
  }

  /**
   * Ability Impact / Shockwave Detonation: Heavy punch bass drop
   */
  public playAbilityImpact(panX: number = 0): void {
    if (this.isMuted || this.masterVolume <= 0) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Heavy sub kick
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(32, now + 0.28);

      gain.gain.setValueAtTime(0.38, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(gain);
      this.routeToMaster(gain, ctx, panX);

      osc.start(now);
      osc.stop(now + 0.29);

      // Rumble noise burst
      const noise = this.getNoiseBuffer(ctx, 0.2);
      if (noise) {
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noise;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(450, now);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.18, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        noiseSrc.connect(filter);
        filter.connect(noiseGain);
        this.routeToMaster(noiseGain, ctx, panX);

        noiseSrc.start(now);
        noiseSrc.stop(now + 0.23);
      }
    } catch {}
  }

  /**
   * Countdown Beeps: High precision arcade tones (3, 2, 1)
   */
  public playCountdown(seconds: number): void {
    if (this.isMuted || this.masterVolume <= 0) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      const freq1 = seconds === 1 ? 987.77 : 783.99; // B5 for 1, G5 for 3,2
      const freq2 = seconds === 1 ? 1975.5 : 1567.98; // Octave overtone
      const duration = seconds === 1 ? 0.26 : 0.14;

      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(freq1, now);
      osc2.frequency.setValueAtTime(freq2, now);

      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      this.routeToMaster(gain, ctx);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + duration + 0.02);
      osc2.stop(now + duration + 0.02);
    } catch {}
  }

  /**
   * GO Signal: Explosive, punchy chord when the arena unfreezes
   */
  public playGoSignal(): void {
    if (this.isMuted || this.masterVolume <= 0) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Kick transient
      const kick = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(150, now);
      kick.frequency.exponentialRampToValueAtTime(45, now + 0.12);
      kickGain.gain.setValueAtTime(0.35, now);
      kickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      kick.connect(kickGain);
      this.routeToMaster(kickGain, ctx);
      kick.start(now);
      kick.stop(now + 0.15);

      // Vibrant major chord (C5, G5, C6, E6)
      [523.25, 783.99, 1046.5, 1318.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

        osc.connect(gain);
        this.routeToMaster(gain, ctx, (idx - 1.5) * 0.25);

        osc.start(now);
        osc.stop(now + 0.45);
      });
    } catch {}
  }

  /**
   * Elimination: Punchy 808 sub-drop and dissolving vaporize sound
   */
  public playElimination(panX: number = 0): void {
    if (this.isMuted || this.masterVolume <= 0) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Sub-bass drop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.38);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      osc.connect(gain);
      this.routeToMaster(gain, ctx, panX);

      osc.start(now);
      osc.stop(now + 0.4);

      // Vaporizing noise hiss
      const noise = this.getNoiseBuffer(ctx, 0.25);
      if (noise) {
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noise;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(900, now);
        filter.frequency.exponentialRampToValueAtTime(200, now + 0.25);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.12, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        noiseSrc.connect(filter);
        filter.connect(noiseGain);
        this.routeToMaster(noiseGain, ctx, panX);

        noiseSrc.start(now);
        noiseSrc.stop(now + 0.26);
      }
    } catch {}
  }

  /**
   * Final 2 Showdown: Intense heartbeat thump when only 2 countries remain alive
   */
  public playShowdown(): void {
    if (this.isMuted || this.masterVolume <= 0) return;
    const nowMs = performance.now();
    if (nowMs - this.lastShowdownTime < 6000) return; // Trigger at most once per match
    this.lastShowdownTime = nowMs;

    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Double heartbeat thump (lub-dub)
      [0, 0.16].forEach((delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        const start = now + delay;
        osc.frequency.setValueAtTime(65, start);
        osc.frequency.exponentialRampToValueAtTime(32, start + 0.12);

        gain.gain.setValueAtTime(0.3, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.13);

        osc.connect(gain);
        this.routeToMaster(gain, ctx);

        osc.start(start);
        osc.stop(start + 0.15);
      });
    } catch {}
  }

  /**
   * Victory Fanfare: Triumphant multi-stage melody + stadium crowd cheering
   */
  public playVictory(): void {
    if (this.isMuted || this.masterVolume <= 0) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Celebratory melody progression
      const chords = [
        { freq: 392.0, delay: 0 },       // G4
        { freq: 440.0, delay: 0.12 },    // A4
        { freq: 523.25, delay: 0.24 },   // C5
        { freq: 659.25, delay: 0.38 },   // E5
        { freq: 783.99, delay: 0.54 },   // G5 (High climax)
      ];

      chords.forEach(({ freq, delay }, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + delay;
        const duration = idx === chords.length - 1 ? 0.95 : 0.24;

        osc.type = idx === chords.length - 1 ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.26, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

        osc.connect(gain);
        this.routeToMaster(gain, ctx, (idx - 2) * 0.2);

        osc.start(start);
        osc.stop(start + duration + 0.05);
      });

      // Accompany with celebratory crowd cheer swell
      this.playCrowdCheer(ctx, now + 0.2);
    } catch {}
  }

  /**
   * Stadium Crowd Cheer / Applause Simulation
   */
  private playCrowdCheer(ctx: AudioContext, startTime: number): void {
    try {
      const noise = this.getNoiseBuffer(ctx, 1.8);
      if (!noise) return;

      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = noise;

      // Bandpass filter centered at speech / cheering formant frequencies
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1050, startTime);
      filter.Q.setValueAtTime(1.8, startTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.18, startTime + 0.35); // Swell
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.7); // Fade

      noiseSource.connect(filter);
      filter.connect(gain);
      this.routeToMaster(gain, ctx);

      noiseSource.start(startTime);
      noiseSource.stop(startTime + 1.75);
    } catch {}
  }

  /**
   * Round Completion / Next Round Chime
   */
  public playRoundComplete(): void {
    if (this.isMuted || this.masterVolume <= 0) return;
    const ctx = this.initContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      [440, 554.37, 659.25, 880].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + idx * 0.055;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.16, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);

        osc.connect(gain);
        this.routeToMaster(gain, ctx);

        osc.start(start);
        osc.stop(start + 0.24);
      });
    } catch {}
  }
}

export const soundSynth = new SoundSynthesizer();
