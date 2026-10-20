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
