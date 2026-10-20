export async function probeAudio(page, blockUntilGesture = false) {
  await page.addInitScript(
    ({ blockUntilGesture }) => {
      const NativeAudioContext =
        window.AudioContext || window.webkitAudioContext;
      window.audioGesture = false;
      for (const type of ["pointerdown", "click", "keydown", "touchend"])
        window.addEventListener(
          type,
          (event) => {
            if (event.isTrusted) window.audioGesture = true;
          },
          { capture: true, passive: true },
        );
      window.AudioContext = class extends NativeAudioContext {
        constructor(...args) {
          super(...args);
          window.testAudio = this;
          if (blockUntilGesture) super.suspend();
        }
        get state() {
          if (window.testAudioInterrupted) return "interrupted";
          return blockUntilGesture && !window.audioGesture
            ? "suspended"
            : super.state;
        }
        resume() {
          // Model Safari's pending resume when only a gamepad has been used.
          if (blockUntilGesture && !window.audioGesture)
            return new Promise(() => {});
          window.testAudioInterrupted = false;
          return super.resume();
        }
        createGain() {
          const gain = super.createGain();
          const connect = gain.connect.bind(gain);
          gain.connect = (destination, ...args) => {
            if (destination === this.destination) {
              this.meter = this.createAnalyser();
              connect(this.meter);
            }
            return connect(destination, ...args);
          };
          return gain;
        }
      };
    },
    { blockUntilGesture },
  );
}

export const rms = (page) =>
  page.evaluate(() => {
    const meter = window.testAudio?.meter;
    if (!meter) return 0;
    const data = new Float32Array(meter.fftSize);
    meter.getFloatTimeDomainData(data);
    return Math.sqrt(
      data.reduce((sum, value) => sum + value * value, 0) / data.length,
    );
  });
