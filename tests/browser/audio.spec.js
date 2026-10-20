import { test, expect } from "@playwright/test";

import { probeAudio, rms } from "../fixtures/audio.js";

test("sound produces an output signal after launch and cannot be muted by M", async ({
  page,
}) => {
  await probeAudio(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Launch mission", exact: true })
    .click();
  await page.keyboard.press("KeyM");
  await page.keyboard.down("Space");
  await expect.poll(() => rms(page)).toBeGreaterThan(0.001);
  await page.keyboard.up("Space");
  await page.keyboard.press("KeyP");
  await expect.poll(() => rms(page)).toBeLessThan(0.0001);
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(page.locator("#sound-toggle, #controller-enable")).toHaveCount(
    0,
  );
});

for (const gesture of ["click", "key"]) {
  test(`controller-only audio blocking recovers on a real ${gesture} with a pending resume`, async ({
    page,
  }) => {
    await probeAudio(page, true);
    await page.addInitScript(() => {
      window.audioPad = {
        id: "Xbox Wireless Controller (simulated)",
        connected: true,
        index: 0,
        mapping: "standard",
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          value: 0,
          pressed: false,
        })),
      };
      Object.defineProperty(navigator, "getGamepads", {
        value: () => [window.audioPad],
      });
    });
    await page.clock.install();
    await page.goto("/");
    await page.clock.runFor(150);
    const before = await page.locator(".throttle-row").boundingBox();
    await page.evaluate(() => {
      window.audioPad.buttons[0] = { value: 1, pressed: true };
    });
    await page.clock.runFor(150);
    await page.evaluate(() => {
      window.audioPad.buttons[0] = { value: 0, pressed: false };
    });
    await page.clock.runFor(150);
    await expect(page.locator("#cockpit")).toHaveAttribute(
      "data-phase",
      "flying",
    );
    await expect(
      page.getByRole("button", { name: "CLICK FOR SOUND" }),
    ).toBeVisible();
    expect(await page.locator(".throttle-row").boundingBox()).toEqual(before);
    if (gesture === "click")
      await page.getByRole("button", { name: "CLICK FOR SOUND" }).click();
    else await page.keyboard.press("Space");
    await expect
      .poll(() => page.evaluate(() => window.testAudio.state))
      .toBe("running");
    await expect(page.locator("#audio-unlock")).toBeHidden();
    await page.evaluate(() => {
      window.audioPad.buttons[7] = { value: 1, pressed: true };
    });
    await page.clock.runFor(150);
    await expect.poll(() => rms(page)).toBeGreaterThan(0.001);
    await expect(page.locator("#controller-meter")).toBeVisible();
    // Recover another Safari interruption using the held controller trigger.
    await page.evaluate(async () => {
      await window.testAudio.suspend();
      window.testAudioInterrupted = true;
    });
    await page.clock.runFor(150);
    await expect
      .poll(() => page.evaluate(() => window.testAudio.state))
      .toBe("running");
    await expect.poll(() => rms(page)).toBeGreaterThan(0.001);
    expect(await page.locator(".throttle-row").boundingBox()).toEqual(before);
  });
}
