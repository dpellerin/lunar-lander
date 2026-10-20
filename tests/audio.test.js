import test from "node:test";
import assert from "node:assert/strict";
const audio = await import("../src/audio.js").catch(() => ({}));
test("arcade noise is deterministic, bipolar and usable at any sample rate", () => {
  assert.equal(typeof audio.createNoise, "function", "sound synthesis exists");
  const a = audio.createNoise(48000),
    b = audio.createNoise(48000);
  assert.equal(a.length, 48000);
  assert.deepEqual(a, b);
  assert.ok(a.some((v) => v > 0));
  assert.ok(a.some((v) => v < 0));
  assert.ok(a.every((v) => Math.abs(v) <= 1));
});

test("arcade sound circuitry exposes discrete thrust levels and stable first-order filters", () => {
  assert.equal(typeof audio.thrustNoiseLevel, "function");
  assert.equal(audio.thrustNoiseLevel(0), 1);
  assert.equal(audio.thrustNoiseLevel(0.2), 1);
  assert.equal(audio.thrustNoiseLevel(0.4), 3);
  assert.equal(audio.thrustNoiseLevel(0.65), 5);
  assert.equal(audio.thrustNoiseLevel(1), 7);
  const filter = audio.lowpassCoefficients(560, 48000);
  assert.equal(filter.feedforward.length, 2);
  assert.equal(filter.feedback.length, 2);
  assert.ok(Math.abs(filter.feedback[1]) < 1);
  const gain =
    (filter.feedforward[0] + filter.feedforward[1]) / (1 + filter.feedback[1]);
  assert.ok(Math.abs(gain - 1) < 1e-9);
});

test("audio resumes Safari interruptions and recreates a closed context at full gain", async () => {
  const previous = globalThis.AudioContext;
  const contexts = [];
  class AudioContextStub {
    constructor() {
      this.state = "suspended";
      this.sampleRate = 48000;
      this.currentTime = 0;
      this.destination = {};
      this.resumeCalls = 0;
      contexts.push(this);
    }
    node() {
      return {
        connect: (node) => node,
        start() {},
        gain: { value: 0 },
        frequency: { value: 0 },
        Q: { value: 0 },
      };
    }
    createGain() {
      return this.node();
    }
    createBuffer() {
      return { copyToChannel() {} };
    }
    createBufferSource() {
      return this.node();
    }
    createIIRFilter() {
      return this.node();
    }
    createBiquadFilter() {
      return this.node();
    }
    async resume() {
      this.resumeCalls++;
      this.state = "running";
    }
  }
  globalThis.AudioContext = AudioContextStub;
  try {
    const sound = new audio.ArcadeAudio();
    await sound.unlock();
    assert.equal(sound.master.gain.value, 0.55);
    const original = sound.context;
    original.state = "interrupted";
    await sound.unlock();
    assert.equal(sound.context, original);
    assert.equal(original.resumeCalls, 2);
    assert.equal(original.state, "running");
    original.state = "closed";
    sound.lastWarning = 200;
    await sound.unlock();
    assert.equal(contexts.length, 2);
    assert.notEqual(sound.context, original);
    assert.equal(sound.context.state, "running");
    assert.equal(sound.master.gain.value, 0.55);
    assert.equal(sound.lastWarning, -10);
  } finally {
    if (previous) globalThis.AudioContext = previous;
    else delete globalThis.AudioContext;
  }
});
