import { test, expect } from "@playwright/test";

test("arcade camera starts wide, snaps once to fixed closeup, and keeps craft visible across resize", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 0.123456;
  });
  await page.clock.install();
  await page.goto("/");
  await page.keyboard.press("Enter");
  const initial = await page.evaluate(() => {
    const s = window.lunarDiagnostics(),
      canvas = document.querySelector("canvas");
    return {
      zoom: s.camera.zoom,
      x: 0.5 + ((s.ship.x - s.camera.x) * s.camera.scale) / canvas.clientWidth,
      y: 0.5 + ((s.ship.y - s.camera.y) * s.camera.scale) / canvas.clientHeight,
    };
  });
  expect(initial.zoom).toBe(1);
  expect(initial.x).toBeLessThan(0.4);
  expect(initial.y).toBeLessThan(0.4);
  await page.evaluate(() => {
    window.cameraSamples = [];
    const sample = () => {
      const { camera: c, ship: s, phase } = window.lunarDiagnostics(),
        canvas = document.querySelector("canvas");
      window.cameraSamples.push({
        time: performance.now(),
        zoom: c.zoom,
        mode: c.mode,
        cx: c.x,
        cy: c.y,
        x: 0.5 + ((s.x - c.x) * c.scale) / canvas.clientWidth,
        y: 0.5 + ((s.y - c.y) * c.scale) / canvas.clientHeight,
        phase,
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.clock.runFor(18000);
  const samples = await page.evaluate(() => window.cameraSamples);
  const first = samples.findIndex((s) => s.zoom === 2.5);
  expect(first).toBeGreaterThan(1);
  expect(new Set(samples.map((s) => s.zoom))).toEqual(new Set([1, 2.5]));
  for (const s of samples) {
    expect(s.x).toBeGreaterThan(0);
    expect(s.x).toBeLessThan(1);
    expect(s.y).toBeGreaterThan(0);
    expect(s.y).toBeLessThan(1);
  }
  for (const s of samples.slice(0, first)) {
    expect(s.cx).toBe(samples[0].cx);
    expect(s.cy).toBe(samples[0].cy);
  }
  const snap = samples[first];
  expect(snap.x).toBeCloseTo(0.5, 2);
  expect(snap.y).toBeCloseTo(0.2, 2);
  const after = samples[first + 10];
  expect(after.cx).toBe(snap.cx);
  expect(after.cy).toBe(snap.cy);
  expect(after.x).toBeGreaterThan(snap.x);
  await page.keyboard.press("KeyA");
  await page.clock.runFor(2500);
  for (const [width, height] of [
    [390, 844],
    [1800, 600],
    [320, 740],
  ]) {
    await page.setViewportSize({ width, height });
    await page.clock.runFor(100);
    const p = await page.evaluate(() => {
      const { camera: c, ship: s } = window.lunarDiagnostics(),
        canvas = document.querySelector("canvas");
      return {
        x: 0.5 + ((s.x - c.x) * c.scale) / canvas.clientWidth,
        y: 0.5 + ((s.y - c.y) * c.scale) / canvas.clientHeight,
        zoom: c.zoom,
      };
    });
    expect([1, 2.5]).toContain(p.zoom);
    expect(p.x).toBeGreaterThan(0.05);
    expect(p.x).toBeLessThan(0.95);
    expect(p.y).toBeGreaterThan(0.05);
    expect(p.y).toBeLessThan(0.95);
  }
});
