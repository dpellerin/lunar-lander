// Circuit parameters verified against MAME mame0289 asteroid.cpp.
// The network is recreated with Web Audio; software envelopes remain approximations.
export function createNoise(length, sampleRate = 48000) {
  const data = new Float32Array(length);
  let register = 0,
    phase = 0,
    value = -1;
  for (let i = 0; i < length; i++) {
    phase += 12000 / sampleRate;
    while (phase >= 1) {
      phase -= 1;
      const feedback = 1 ^ ((register >> 6) & 1) ^ ((register >> 14) & 1);
      register = ((register << 1) | feedback) & 0xffff;
      value = register & 0x4000 ? 1 : -1;
    }
    data[i] = value;
  }
  return data;
}

export function thrustNoiseLevel(thrust) {
  return [1, 3, 5, 7][Math.min(3, Math.max(0, Math.floor(thrust * 4)))];
}

export function lowpassCoefficients(frequency, sampleRate) {
  const k = Math.tan((Math.PI * frequency) / sampleRate),
    b = k / (1 + k);
  return { feedforward: [b, b], feedback: [1, (k - 1) / (k + 1)] };
}

function lowpass(ctx, frequency) {
  const { feedforward, feedback } = lowpassCoefficients(
    frequency,
    ctx.sampleRate,
  );
  return ctx.createIIRFilter(feedforward, feedback);
}

export class ArcadeAudio {
  constructor() {
    this.context = null;
    this.lastWarning = -10;
    this.landingFadeUntil = 0;
  }
  async unlock() {
    if (!this.context || this.context.state === "closed") {
      const AudioContext =
        globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = (this.context = new AudioContext());
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.lastWarning = -10;
      this.landingFadeUntil = 0;
      this.master.connect(ctx.destination);
      // One complete maximal LFSR period: the loop doesn't introduce a noise seam.
      const length = Math.round((32767 / 12000) * ctx.sampleRate);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      buffer.copyToChannel(createNoise(length, ctx.sampleRate), 0);
      this.rumble = ctx.createBufferSource();
      this.rumble.buffer = buffer;
      this.rumble.loop = true;
      const rc = lowpass(ctx, 1 / (2 * Math.PI * 2247 * 0.000001));
      this.engineGain = ctx.createGain();
      this.engineGain.gain.value = 0;
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 89.5;
      band.Q.value = 7.6;
      this.explosionGain = ctx.createGain();
      this.explosionGain.gain.value = 0;
      const mix = ctx.createGain(),
        final = lowpass(ctx, 560);
      // Relative gains preserve engine/explosion balance with headroom for the tone.
      this.rumble.connect(rc).connect(this.engineGain);
      this.engineGain.connect(band).connect(mix);
      rc.connect(this.explosionGain).connect(mix);
      mix.connect(final).connect(this.master);
      this.rumble.start();
    }
    // Safari can interrupt a previously running context when a tab loses focus.
    // Retry inside every real input gesture, even if an earlier resume is pending.
    if (this.context.state !== "running") await this.context.resume();
  }
  update(thrust, lowFuel, active) {
    if (!this.context) return;
    const now = this.context.currentTime;
    // A result frame must not overwrite the touchdown fade with an instant mute.
    if (active || now >= this.landingFadeUntil) {
      this.landingFadeUntil = 0;
      this.engineGain.gain.cancelScheduledValues(now);
      this.engineGain.gain.setTargetAtTime(
        active ? (thrustNoiseLevel(thrust) / 7) * 7.6 * 0.55 : 0,
        now,
        0.008,
      );
    }
    if (active && lowFuel && now - this.lastWarning >= 0.78) {
      this.lastWarning = now;
      this.beep(3000, 0.39, 0.022);
    }
  }
  beep(frequency = 3000, duration = 0.1, volume = 0.022) {
    if (!this.context) return;
    const ctx = this.context,
      osc = ctx.createOscillator(),
      gain = ctx.createGain(),
      now = ctx.currentTime;
    osc.type = "square";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.setValueAtTime(volume, now + duration - 0.003);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start();
    osc.stop(now + duration + 0.01);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  crash() {
    if (!this.context) return;
    const gain = this.explosionGain.gain,
      now = this.context.currentTime;
    gain.cancelScheduledValues(now);
    // The cabinet steps the noise amplitude instead of playing a crash sample.
    for (let i = 0; i < 8; i++)
      gain.setValueAtTime(
        (((7 - i) / 7) * 7.6 * 0.55 * 1000) / 600,
        now + i * 0.1,
      );
    gain.setValueAtTime(0, now + 0.8);
  }
  land(hard = false) {
    if (!this.context || this.context.state !== "running") return;
    const ctx = this.context,
      noise = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      soften = ctx.createBiquadFilter(),
      lowCut = ctx.createBiquadFilter(),
      body = ctx.createBiquadFilter(),
      noiseGain = ctx.createGain(),
      now = ctx.currentTime,
      duration = hard ? 0.9 : 0.72,
      volume = hard ? 1.7 : 1.4;
    // A cushioned low impact, with a rounded attack instead of a sharp knock.
    noise.buffer = this.rumble.buffer;
    filter.type = "lowpass";
    filter.frequency.value = 160;
    filter.Q.value = 0.5;
    soften.type = "lowpass";
    soften.frequency.value = 180;
    soften.Q.value = 0.5;
    lowCut.type = "highpass";
    lowCut.frequency.value = 22;
    lowCut.Q.value = 0.5;
    body.type = "lowshelf";
    body.frequency.value = 95;
    body.gain.value = 5;
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(volume, now + 0.065);
    noiseGain.gain.exponentialRampToValueAtTime(volume * 0.7, now + 0.17);
    noiseGain.gain.exponentialRampToValueAtTime(volume * 0.12, now + 0.35);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    noise
      .connect(filter)
      .connect(soften)
      .connect(lowCut)
      .connect(body)
      .connect(noiseGain)
      .connect(this.master);
    const touchdown = {
      stop: () => {
        noise.stop();
      },
    };
    this.touchdown = touchdown;
    noise.onended = () => {
      noise.disconnect();
      filter.disconnect();
      soften.disconnect();
      lowCut.disconnect();
      body.disconnect();
      noiseGain.disconnect();
      if (this.touchdown === touchdown) this.touchdown = null;
    };
    noise.start(now);
    noise.stop(now + duration + 0.01);
    // Let the existing engine/background hum wind down underneath the impact.
    this.landingFadeUntil = now + (hard ? 1.15 : 0.95);
    const hum = this.engineGain.gain;
    const level = Math.max(hum.value, (7.6 * 0.55) / 7);
    hum.cancelScheduledValues(now);
    hum.setValueAtTime(level, now);
    hum.linearRampToValueAtTime(0, this.landingFadeUntil);
  }
  stopEffects() {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const gain of [this.engineGain.gain, this.explosionGain.gain]) {
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(0, now);
    }
    this.touchdown?.stop();
    this.landingFadeUntil = 0;
    this.lastWarning = -10;
  }
}
