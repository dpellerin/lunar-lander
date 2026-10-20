import test from "node:test";
import assert from "node:assert/strict";
import { GamepadInput } from "../src/gamepad.js";

function pad(overrides = {}) {
  return {
    id: "Xbox Wireless Controller",
    index: 0,
    connected: true,
    mapping: "standard",
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })),
    ...overrides,
  };
}
function button(pad, index, value) {
  pad.buttons[index] = { value, pressed: value >= 0.5 };
}

test("right trigger preserves proportional 0–100% thrust and filters resting noise", () => {
  const input = new GamepadInput(),
    xbox = pad();
  assert.equal(input.poll([null, xbox]).ready, true);
  for (const value of [0, 0.01, 0.025, 0.1, 0.25, 0.5, 0.75, 1]) {
    button(xbox, 7, value);
    assert.equal(input.poll([xbox]).thrust, value <= 0.025 ? 0 : value);
  }
  button(xbox, 7, 0);
  assert.equal(input.poll([xbox]).thrust, 0);
});

test("analog steering uses a dead zone and D-pad steering is immediate", () => {
  const input = new GamepadInput(),
    xbox = pad();
  input.poll([xbox]);
  for (const value of [0, 0.08, -0.12, 0.14]) {
    xbox.axes[0] = value;
    assert.equal(input.poll([xbox]).rotate, 0);
  }
  xbox.axes[0] = 0.5;
  assert.ok(Math.abs(input.poll([xbox]).rotate - (0.5 - 0.14) / 0.86) < 1e-9);
  xbox.axes[0] = -1;
  assert.equal(input.poll([xbox]).rotate, -1);
  button(xbox, 15, 1);
  assert.equal(input.poll([xbox]).rotate, 1);
});

test("controller buttons fire once per press, including holds spanning multiple rounds", () => {
  const input = new GamepadInput(),
    xbox = pad();
  input.poll([xbox]);
  for (const [index, action] of [
    [0, "launch"],
    [1, "abort"],
    [3, "manual"],
    [9, "pause"],
  ]) {
    button(xbox, index, 1);
    assert.deepEqual(input.poll([xbox]).actions, [action]);
    for (let frame = 0; frame < 120; frame++)
      assert.deepEqual(input.poll([xbox]).actions, []);
    button(xbox, index, 0);
    input.poll([xbox]);
  }
});

test("the discovery press only connects and a new A press is required to launch", () => {
  const input = new GamepadInput(),
    xbox = pad();
  input.poll([]);
  button(xbox, 0, 1);
  const initial = input.poll([xbox]);
  assert.deepEqual(initial.actions, []);
  assert.equal(initial.ready, false);
  assert.equal(initial.thrust, 0);
  for (let frame = 0; frame < 120; frame++)
    assert.deepEqual(input.poll([xbox]).actions, []);
  button(xbox, 0, 0);
  assert.equal(input.poll([xbox]).ready, true);
  button(xbox, 0, 1);
  assert.deepEqual(input.poll([xbox]).actions, ["launch"]);
  // Reconnect during a paused/active round also consumes a held A.
  input.poll([]);
  assert.deepEqual(input.poll([xbox]).actions, []);
  button(xbox, 0, 0);
  input.poll([xbox]);
  button(xbox, 0, 1);
  assert.deepEqual(input.poll([xbox]).actions, ["launch"]);
});

test("initial A cannot launch while hidden or with a held trigger, stick or other action", () => {
  for (const blocked of ["hidden", "trigger", "stick", "button"]) {
    const input = new GamepadInput(),
      xbox = pad();
    button(xbox, 0, 1);
    if (blocked === "trigger") button(xbox, 7, 0.7);
    if (blocked === "stick") xbox.axes[0] = 0.5;
    if (blocked === "button") button(xbox, 3, 1);
    const state = input.poll([xbox], {
      enabled: blocked !== "hidden",
    });
    assert.deepEqual(state.actions, []);
    assert.equal(state.thrust, 0);
    assert.equal(state.ready, false);
  }
});

test("connection, focus recovery and suspend require neutral controls before arming", () => {
  const input = new GamepadInput(),
    xbox = pad();
  button(xbox, 7, 0.8);
  button(xbox, 0, 1);
  assert.equal(input.poll([xbox]).ready, false);
  assert.equal(input.poll([xbox]).thrust, 0);
  button(xbox, 7, 0);
  button(xbox, 0, 0);
  assert.equal(input.poll([xbox]).ready, true);
  button(xbox, 7, 0.4);
  assert.equal(input.poll([xbox]).thrust, 0.4);
  input.poll([xbox], { enabled: false });
  assert.equal(input.poll([xbox]).thrust, 0);
  button(xbox, 7, 0);
  input.poll([xbox]);
  button(xbox, 0, 1);
  assert.deepEqual(input.poll([xbox]).actions, ["launch"]);
  input.suspend();
  assert.deepEqual(input.poll([xbox]).actions, []);
  button(xbox, 0, 0);
  assert.equal(input.poll([xbox]).ready, true);
});

test("disconnect releases inputs, reports once and does not silently switch controllers", () => {
  const input = new GamepadInput(),
    first = pad(),
    second = pad({ index: 1 });
  input.poll([first]);
  first.axes[0] = 1;
  button(first, 7, 1);
  assert.equal(input.poll([first, second]).index, 0);
  const lost = input.poll([]);
  assert.equal(lost.disconnected, true);
  assert.equal(lost.thrust, 0);
  assert.equal(lost.rotate, 0);
  assert.equal(input.poll([]).disconnected, false);
  assert.equal(
    input.poll([first]).thrust,
    0,
    "held trigger cannot resume on reconnect",
  );
  const switched = input.poll([second]);
  assert.equal(switched.disconnected, true);
  assert.equal(switched.index, 1);
});

test("unsupported mappings and unavailable APIs never produce controller input", () => {
  const input = new GamepadInput(),
    xbox = pad({ mapping: "" });
  button(xbox, 7, 1);
  button(xbox, 0, 1);
  const unknown = input.poll([xbox]);
  assert.equal(unknown.connected, true);
  assert.equal(unknown.supported, false);
  assert.equal(unknown.thrust, 0);
  assert.deepEqual(unknown.actions, []);
  assert.equal(input.poll([], { available: false }).available, false);
  const malformed = pad();
  input.poll([malformed]);
  malformed.axes[0] = NaN;
  button(malformed, 7, Infinity);
  assert.equal(input.poll([malformed]).rotate, 0);
});
