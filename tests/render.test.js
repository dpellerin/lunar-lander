import test from "node:test";
import assert from "node:assert/strict";
import { computeCamera, VectorRenderer } from "../src/renderers/vector.js";
const fixture = (x = 180, y = 140) => ({
  ship: { x, y },
  terrain: [
    { x: 0, y: 800 },
    { x: 1600, y: 800 },
  ],
  mission: 1,
  phase: "flying",
  pads: [],
});
const point = (x, y, c, w, h) => ({
  x: 0.5 + ((x - c.x) * c.scale) / w,
  y: 0.5 + ((y - c.y) * c.scale) / h,
});
const position = (g, c, w, h) => point(g.ship.x, g.ship.y, c, w, h);

test("overview shows the whole landscape with the lander at upper left and remains fixed in flight", () => {
  for (const [w, h] of [
    [1200, 700],
    [320, 340],
    [700, 220],
    [2560, 600],
  ]) {
    const g = fixture(),
      c = computeCamera(g, w, h);
    assert.equal(c.mode, "overview");
    assert.equal(c.zoom, 1);
    const p = position(g, c, w, h);
    assert.ok(p.x < 0.4 && p.y < 0.5);
    for (const [x, y] of [
      [0, 0],
      [1600, 1000],
    ]) {
      const corner = point(x, y, c, w, h);
      assert.ok(
        corner.x >= 0 && corner.x <= 1 && corner.y >= 0 && corner.y <= 1,
      );
    }
    g.ship.x = 650;
    g.ship.y = 400;
    const next = computeCamera(g, w, h, c, 1 / 60);
    assert.equal(next.x, c.x);
    assert.equal(next.y, c.y);
    assert.equal(next.scale, c.scale);
  }
});

test("near ground snaps directly to 2.5x, frames craft top-center, and holds the closeup origin", () => {
  const g = fixture(700, 628),
    w = 1200,
    h = 700;
  const overview = computeCamera(g, w, h);
  assert.equal(overview.zoom, 1);
  g.ship.y = 630;
  const close = computeCamera(g, w, h, overview, 1 / 60);
  assert.equal(close.mode, "closeup");
  assert.equal(close.zoom, 2.5);
  assert.ok(Math.abs(close.scale / overview.scale - 2.5) < 1e-9);
  assert.ok(
    point(g.ship.x, 800, close, w, h).y < 0.95,
    "surface visible on entry",
  );
  const p = position(g, close, w, h);
  assert.ok(Math.abs(p.x - 0.5) < 1e-9 && Math.abs(p.y - 0.2) < 1e-9);
  g.ship.x += 20;
  g.ship.y += 20;
  const moved = computeCamera(g, w, h, close, 1 / 60);
  assert.equal(moved.x, close.x);
  assert.equal(moved.y, close.y);
  assert.equal(moved.zoom, 2.5);
  assert.ok(
    position(g, moved, w, h).x > 0.5,
    "ship moves across a fixed view, not pinned",
  );
});

test("closeup scrolls only at a safety boundary, keeping the hull visible through wrap, resize and ascent", () => {
  for (const [w, h] of [
    [1200, 700],
    [320, 340],
    [700, 220],
    [2560, 600],
  ]) {
    const g = fixture(1580, 700);
    let c = computeCamera(g, w, h);
    for (let i = 0; i < 600; i++) {
      g.ship.x = (1580 + i * 3) % 1600;
      g.ship.y = 700 + Math.sin(i / 60) * 50;
      c = computeCamera(g, w, h, c, 1 / 60);
      const p = position(g, c, w, h);
      assert.ok(p.x >= 0.19 && p.x <= 0.81, `horizontal safety ${w} ${i}`);
      assert.ok(p.y >= 0.19 && p.y <= 0.73, `vertical safety ${w} ${i}`);
      assert.equal(c.zoom, 2.5, "terrain changes do not hunt between scales");
    }
  }
});

test("closeup uses separate entry/exit thresholds to prevent scale chatter and returns wide on a high climb", () => {
  const g = fixture(800, 630);
  let c = computeCamera(g, 1200, 700);
  assert.equal(c.zoom, 2.5);
  for (const y of [628, 630, 620, 610, 600]) {
    g.ship.y = y;
    c = computeCamera(g, 1200, 700, c, 1 / 60);
    assert.equal(c.zoom, 2.5);
  }
  g.ship.y = 480;
  c = computeCamera(g, 1200, 700, c, 1 / 60);
  assert.equal(c.zoom, 1);
  g.ship.y = 628;
  c = computeCamera(g, 1200, 700, c, 1 / 60);
  assert.equal(c.zoom, 1);
  g.ship.y = 630;
  c = computeCamera(g, 1200, 700, c, 1 / 60);
  assert.equal(c.zoom, 2.5);
});

test("overview includes full terrain and the complete hull even during extreme ascent", () => {
  for (const [w, h] of [
    [320, 340],
    [1200, 700],
    [2560, 600],
  ])
    for (const y of [-4000, -100, 0, 140]) {
      const g = fixture(0, y),
        c = computeCamera(g, w, h);
      for (const [x, yy] of [
        [-14, y - 14],
        [14, y + 14],
        [0, 0],
        [1600, 1000],
      ]) {
        const p = point(x, yy, c, w, h);
        assert.ok(
          p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1,
          "whole hull and terrain visible",
        );
      }
    }
});

test("world wrap preserves the closeup framing instead of jumping the background", () => {
  const g = fixture(1599, 700),
    before = computeCamera(g, 1200, 700);
  const old = position(g, before, 1200, 700);
  g.ship.x = 1;
  const after = computeCamera(g, 1200, 700, before, 1 / 60),
    p = position(g, after, 1200, 700);
  assert.ok(Math.abs(p.x - old.x - 2 / before.viewWidth) < 1e-9);
  assert.ok(Math.abs(after.x - before.x + 1600) < 1e-9);
});

test("renderer retains closeup state on pause and resize, but resets to full landscape on next mission", () => {
  const ctx = new Proxy(
    {},
    { get: (t, k) => t[k] ?? (() => {}), set: (t, k, v) => ((t[k] = v), true) },
  );
  const renderer = new VectorRenderer({ getContext: () => ctx });
  renderer.resize(1200, 700);
  const g = fixture();
  renderer.render(g);
  assert.equal(renderer.camera.zoom, 1);
  g.ship.y = 700;
  renderer.render(g);
  assert.equal(renderer.camera.zoom, 2.5);
  g.ship.y = 600;
  renderer.render(g, { paused: true });
  assert.equal(renderer.camera.zoom, 2.5);
  renderer.resize(320, 340);
  renderer.render(g, { paused: true });
  assert.equal(renderer.camera.zoom, 2.5);
  const p = position(g, renderer.camera, 320, 340);
  assert.ok(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1);
  g.terrainSeed = 1;
  renderer.render(g);
  assert.equal(
    renderer.camera.mode,
    "overview",
    "restart clears the old camera hysteresis",
  );
  g.ship.y = 700;
  renderer.render(g);
  assert.equal(renderer.camera.mode, "closeup");
  g.mission = 2;
  g.ship.x = 180;
  g.ship.y = 140;
  renderer.render(g);
  assert.equal(renderer.camera.mode, "overview");
});
