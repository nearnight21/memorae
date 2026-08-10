/**
 * A highly tailored Web Audio Synthesizer to create 100% local, high-fidelity,
 * zero-dependency cozy camping ambient sounds (crackling campfire bonfire,
 * washing forest wind, and night crickets).
 */

class CampfireAmbientSynth {
  private ctx: AudioContext | null = null;
  private isRunning: boolean = false;

  // Nodes
  private masterGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private fireGain: GainNode | null = null;
  private cricketsGain: GainNode | null = null;

  // Intervals/timers to stop
  private cricketTimer: number | null = null;
  private crackleInterval: number | null = null;
  private windLfoTimer: number | null = null;

  constructor() {
    // Lazy initialized on play to circumvent browser autoplay bans
  }

  private initContext() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    this.ctx = new AudioContextClass();

    // Master volume gain node
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime); // moderate default volume
    this.masterGain.connect(this.ctx.destination);

    // Sub-modules
    this.setupWind();
    this.setupFireRumble();
    this.setupCracking();
    this.setupCrickets();
  }

  // Create a buffer packed with white noise
  private createNoiseBuffer(): AudioBuffer {
    if (!this.ctx) throw new Error('No context');
    const bufferSize = 2 * this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  // Setup the sweeping low wind gusts
  private setupWind() {
    if (!this.ctx || !this.masterGain) return;

    try {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.createNoiseBuffer();
      noise.loop = true;

      const windFilter = this.ctx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.setValueAtTime(200, this.ctx.currentTime);
      windFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);

      this.windGain = this.ctx.createGain();
      this.windGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

      noise.connect(windFilter);
      windFilter.connect(this.windGain);
      this.windGain.connect(this.masterGain);
      noise.start(0);

      // Program variable wind speed LFO (Low Frequency Swell)
      let phase = 0;
      const modulateWind = () => {
        if (!this.isRunning || !this.ctx || !windFilter || !this.windGain) return;
        phase += 0.05;
        // Gust frequency sweeps between 120Hz and 450Hz
        const freq = 200 + Math.sin(phase * 0.4) * 80 + Math.cos(phase * 0.1) * 40;
        // Wind intensity modulates slightly with frequency
        const gainVal = 0.04 + (Math.sin(phase * 0.45) + 1) * 0.035;

        windFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.45);
        this.windGain.gain.setTargetAtTime(gainVal, this.ctx.currentTime, 0.5);

        this.windLfoTimer = window.setTimeout(modulateWind, 200);
      };

      modulateWind();
    } catch (e) {
      console.warn('Failed to start synthesize wind', e);
    }
  }

  // Setup the low bassy fire flame rumble
  private setupFireRumble() {
    if (!this.ctx || !this.masterGain) return;

    try {
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = this.createNoiseBuffer();
      noiseSource.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(160, this.ctx.currentTime);
      filter.Q.setValueAtTime(2.0, this.ctx.currentTime);

      this.fireGain = this.ctx.createGain();
      this.fireGain.gain.setValueAtTime(0.18, this.ctx.currentTime);

      noiseSource.connect(filter);
      filter.connect(this.fireGain);
      this.fireGain.connect(this.masterGain);
      noiseSource.start(0);

      // Fast micro-tremors in fire rumble intensity (fire flicker)
      const flicker = () => {
        if (!this.isRunning || !this.ctx || !this.fireGain) return;
        const rumbleVal = 0.12 + Math.random() * 0.12;
        this.fireGain.gain.setTargetAtTime(rumbleVal, this.ctx.currentTime, 0.05);
        setTimeout(flicker, 40 + Math.random() * 60);
      };
      flicker();
    } catch (e) {
      console.warn('Fire rumble error', e);
    }
  }

  // Setup the crisp "pops" and "crackles" of burning firewood embers
  private setupCracking() {
    if (!this.ctx || !this.masterGain) return;

    const playCrackle = () => {
      if (!this.isRunning || !this.ctx || !this.masterGain) return;

      try {
        // High-pass filtered noise pulse to create crisp wood ticking/snapping
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.createNoiseBuffer();

        const hpFilter = this.ctx.createBiquadFilter();
        hpFilter.type = 'highpass';
        // Randomize the bite frequency of the wood snapping
        hpFilter.frequency.setValueAtTime(700 + Math.random() * 2500, this.ctx.currentTime);

        const crackleGain = this.ctx.createGain();
        crackleGain.gain.setValueAtTime(0.0, this.ctx.currentTime);
        // Instant trigger, short fadeout
        crackleGain.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.12, this.ctx.currentTime + 0.002);
        crackleGain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.02 + Math.random() * 0.06);

        noise.connect(hpFilter);
        hpFilter.connect(crackleGain);
        crackleGain.connect(this.masterGain);

        noise.start(0);
        noise.stop(this.ctx.currentTime + 0.1);
      } catch (err) {
        // Safe fail
      }

      // Schedule next random pop
      const delay = 80 + Math.random() * 650;
      this.crackleInterval = window.setTimeout(playCrackle, delay);
    };

    playCrackle();
  }

  // Setup distant twilight forest crickets
  private setupCrickets() {
    if (!this.ctx || !this.masterGain) return;

    this.cricketsGain = this.ctx.createGain();
    this.cricketsGain.gain.setValueAtTime(0.02, this.ctx.currentTime);
    this.cricketsGain.connect(this.masterGain);

    const playChirpGroup = () => {
      if (!this.isRunning || !this.ctx || !this.cricketsGain) return;

      const now = this.ctx.currentTime;
      // Synthesize a triple-pulsed cicada/cricket chirp (sh-sh-sh)
      let timeOffset = 0;
      for (let i = 0; i < 4; i++) {
        try {
          const osc = this.ctx.createOscillator();
          osc.type = 'sine';
          // Cricket chirp frequency is generally high-pitch (3800Hz - 4200Hz)
          osc.frequency.setValueAtTime(3900 + Math.random() * 200, now + timeOffset);

          const chirpEnvelope = this.ctx.createGain();
          chirpEnvelope.gain.setValueAtTime(0.0001, now + timeOffset);
          chirpEnvelope.gain.exponentialRampToValueAtTime(0.05 + Math.random() * 0.05, now + timeOffset + 0.01);
          chirpEnvelope.gain.exponentialRampToValueAtTime(0.0001, now + timeOffset + 0.06);

          osc.connect(chirpEnvelope);
          chirpEnvelope.connect(this.cricketsGain);

          osc.start(now + timeOffset);
          osc.stop(now + timeOffset + 0.08);
        } catch (e) {
          // ignore
        }
        timeOffset += 0.12; // gap between ripples
      }

      // Repeat chirps in couples or triplets every few seconds
      const delay = 1800 + Math.random() * 2500;
      this.cricketTimer = window.setTimeout(playChirpGroup, delay);
    };

    // Delay start of crickets so they don't immediately blend
    this.cricketTimer = window.setTimeout(playChirpGroup, 2000);
  }

  public setVolume(volumeValue: number) {
    this.initContext();
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        Math.max(0, Math.min(1, volumeValue)),
        this.ctx.currentTime,
        0.1
      );
    }
  }

  public async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  public stop() {
    this.isRunning = false;

    if (this.cricketTimer) {
      clearTimeout(this.cricketTimer);
      this.cricketTimer = null;
    }
    if (this.crackleInterval) {
      clearTimeout(this.crackleInterval);
      this.crackleInterval = null;
    }
    if (this.windLfoTimer) {
      clearTimeout(this.windLfoTimer);
      this.windLfoTimer = null;
    }

    if (this.ctx) {
      try {
        this.ctx.close();
      } catch (err) {
        // Safe close catch
      }
      this.ctx = null;
    }
  }

  public getActiveState(): boolean {
    return this.isRunning;
  }
}

export const appAmbientSynth = new CampfireAmbientSynth();
