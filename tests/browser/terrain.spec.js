import { test, expect } from "@playwright/test";

test("three consecutive rounds render distinct faceted terrain while flight resources carry", async ({
  page,
}) => {
  test.setTimeout(process.env.CI ? 240000 : 60000);
  await page.addInitScript(() => {
    Math.random = () => 7 / 4294967296;
  });
  await page.clock.install();
  await page.goto("/");
  let current = await page.evaluate(() => window.lunarDiagnostics());
  const seen = new Set([JSON.stringify(current.terrain)]);
  await page.keyboard.press("Enter");
  for (let round = 1; round <= 2; round++) {
    await page.clock.runFor(24000);
    const contact = await page.evaluate(() => window.lunarDiagnostics());
    expect(contact.phase).toBe("result");
    expect(contact.terrain).toEqual(current.terrain);
    await page.keyboard.press("Enter");
    await page.clock.runFor(50);
    const next = await page.evaluate(() => window.lunarDiagnostics());
    expect(next.mission).toBe(round + 1);
    expect(next.terrainSeed).not.toBe(current.terrainSeed);
    expect(seen.has(JSON.stringify(next.terrain))).toBe(false);
    seen.add(JSON.stringify(next.terrain));
    expect(next.score).toBe(contact.score);
    expect(next.fuel).toBe(contact.fuel);
    expect(next.terrain.length).toBeGreaterThanOrEqual(90);
    expect(next.terrain.length).toBeLessThanOrEqual(240);
    for (const pad of next.pads) {
      const a = next.terrain.findIndex((p) => p.x === pad.x1);
      expect(next.terrain[a + 1]).toEqual({ x: pad.x2, y: pad.y });
      expect(next.terrain[a].y).toBe(pad.y);
      expect(next.terrain[a - 1].y).not.toBe(pad.y);
      expect(next.terrain[a + 2].y).not.toBe(pad.y);
    }
    current = next;
  }
});
