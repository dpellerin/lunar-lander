import { test, expect } from "@playwright/test";
import { hardLandingApproach } from "../fixtures/hard-landing.js";
import { probeAudio } from "../fixtures/audio.js";

for (const vy of [5, 24]) {
  test(`tilted ${vy === 5 ? "soft" : "hard"} touchdown thumps once and settles level`, async ({
    page,
  }) => {
    await hardLandingApproach(page, { vy, angle: -0.16 });
    await probeAudio(page);
    await page.addInitScript(() => {
      const create = AudioContext.prototype.createOscillator;
      const createBuffer = AudioContext.prototype.createBufferSource;
      window.touchdownTones = 0;
      window.touchdownImpacts = 0;
      AudioContext.prototype.createOscillator = function () {
        window.touchdownTones++;
        return create.call(this);
      };
      AudioContext.prototype.createBufferSource = function () {
        const source = createBuffer.call(this);
        const start = source.start.bind(source);
        source.start = (...args) => {
          if (!source.loop) window.touchdownImpacts++;
          return start(...args);
        };
        return source;
      };
    });
    await page.clock.install();
    await page.goto("/");
    await page.clock.pauseAt(new Date(Date.now() + 60000));
    await page.locator("#audio-unlock").click();
    await expect
      .poll(() => page.evaluate(() => window.testAudio.state))
      .toBe("running");
    await page
      .getByRole("button", { name: "Launch mission", exact: true })
      .click();
    await page.clock.runFor(50);
    const impact = await page.evaluate(() => window.lunarDiagnostics());
    expect(impact.result.kind).toBe(vy === 5 ? "soft" : "hard");
    expect(Math.abs(impact.ship.angle)).toBeGreaterThan(0.1);
    expect(await page.evaluate(() => window.touchdownTones)).toBe(0);
    expect(await page.evaluate(() => window.touchdownImpacts)).toBe(1);
    await page.clock.runFor(450);
    const mid = await page.evaluate(() => window.lunarDiagnostics());
    expect(Math.abs(mid.ship.angle)).toBeLessThan(Math.abs(impact.ship.angle));
    expect(Math.abs(mid.ship.angle)).toBeGreaterThan(0);
    await page.clock.runFor(4500);
    const settled = await page.evaluate(() => window.lunarDiagnostics());
    expect(settled.ship.angle).toBe(0);
    expect(settled.ship.y).toBe(settled.pads[0].y - 11);
    expect(settled.ship.vy).toBe(0);
    expect(settled.score).toBe(impact.score);
    expect(settled.fuel).toBe(impact.fuel);
    expect(await page.evaluate(() => window.touchdownImpacts)).toBe(1);
    await page
      .getByRole("button", { name: "Restart game", exact: true })
      .click();
    await page.locator("#confirm-restart").click();
    await page.clock.runFor(50);
    const reset = await page.evaluate(() => window.lunarDiagnostics());
    expect(reset.terrainSeed).not.toBe(settled.terrainSeed);
    expect(reset.score).toBeLessThan(settled.score);
  });
}

test("hard landing visibly rebounds once, settles on the pad and preserves its award", async ({
  page,
}) => {
  await hardLandingApproach(page);
  await page.clock.install();
  await page.goto("/");
  // Screenshots must not consume part of this short animation in wall time.
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.keyboard.press("Enter");
  await page.clock.runFor(50);
  const snapshot = () => page.evaluate(() => window.lunarDiagnostics());
  const rebound = await snapshot();
  expect(rebound.phase).toBe("result");
  expect(rebound.result.kind).toBe("hard");
  expect(rebound.ship.vy).toBeLessThan(0);
  const { surfaceY, height, duration } = rebound.landingBounce;
  const image = await page.locator("canvas").screenshot();
  await page.keyboard.down("Space");
  await page.clock.runFor((duration / 2 - rebound.resultTime) * 1000);
  const apex = await snapshot();
  expect(apex.ship.y).toBeLessThan(rebound.ship.y);
  expect(apex.ship.y).toBeGreaterThanOrEqual(surfaceY - 8);
  expect(apex.ship.y).toBeCloseTo(surfaceY - height, 2);
  expect(Math.abs(apex.ship.vy)).toBeLessThan(0.15);
  expect(image.equals(await page.locator("canvas").screenshot())).toBe(false);
  await page.clock.runFor(200);
  const descending = await snapshot();
  expect(descending.ship.y).toBeGreaterThan(apex.ship.y);
  expect(descending.ship.vy).toBeGreaterThan(0);
  expect(descending.ship.vy).toBeLessThan(2);
  await page.clock.runFor((duration - descending.resultTime) * 1000 + 100);
  await page.keyboard.up("Space");
  const settled = await snapshot();
  expect(settled.ship.y).toBe(surfaceY);
  expect(settled.ship.vy).toBe(0);
  expect(settled.ship.throttle).toBe(0);
  expect(settled.landingBounce).toBeNull();
  expect(settled.score).toBe(30);
  expect(settled.fuel).toBe(750);
  expect(settled.time).toBe(rebound.time);
  await page.clock.runFor(1500);
  expect((await snapshot()).ship).toEqual(settled.ship);
  await expect(page.locator("#overlay-title")).toHaveText("A HARD LANDING");
  await page.getByRole("button", { name: "Next mission", exact: true }).click();
  await page.clock.runFor(50);
  const next = await snapshot();
  expect(next.phase).toBe("flying");
  expect(next.landingBounce).toBeNull();
  expect(next.score).toBe(30);
});
