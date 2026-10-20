import { test, expect } from "@playwright/test";

import { probeAudio, rms } from "../fixtures/audio.js";

test("touchdown whump sustains while the background hum fades, and restart stops effects", async ({
  page,
}) => {
  await probeAudio(page);
  await page.goto("/");
  await page.locator("#audio-unlock").click();
  await page.evaluate(async () => {
    const { ArcadeAudio } = await import("/src/audio.js");
    window.landingAudio = new ArcadeAudio();
    await window.landingAudio.unlock();
  });
  for (const hard of [false, true]) {
    const samples = await page.evaluate(async (hard) => {
      const sound = window.landingAudio;
      sound.update(0, false, true);
      await new Promise((resolve) => setTimeout(resolve, 150));
      sound.land(hard);
      // Reproduce the result-frame updates that previously cut the hum off.
      const timer = setInterval(() => sound.update(0, false, false), 16);
      const read = () => {
        const meter = window.testAudio.meter;
        const data = new Float32Array(meter.fftSize);
        meter.getFloatTimeDomainData(data);
        return {
          hum: sound.engineGain.gain.value,
          rms: Math.sqrt(
            data.reduce((sum, value) => sum + value * value, 0) / data.length,
          ),
        };
      };
      const samples = [];
      for (const delay of [60, 200, 340, 850]) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        samples.push(read());
      }
      clearInterval(timer);
      return samples;
    }, hard);
    expect(samples[0].rms).toBeGreaterThan(0.01);
    expect(samples[1].rms).toBeGreaterThan(0.005);
    expect(samples[1].hum).toBeGreaterThan(0.1);
    expect(samples[2].hum).toBeGreaterThan(0.05);
    expect(samples[2].hum).toBeLessThan(samples[1].hum);
    expect(samples[1].hum).toBeLessThan(samples[0].hum);
    expect(samples[3].hum).toBeLessThan(0.0001);
    expect(samples[3].rms).toBeLessThan(0.0001);
  }
  await page.evaluate(() => {
    window.landingAudio.crash();
    window.landingAudio.land(true);
    window.landingAudio.stopEffects();
  });
  await page.waitForTimeout(100);
  expect(await rms(page)).toBeLessThan(0.0001);
});

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
    await expect(page.locator("#audio-unlock")).toBeHidden();
    expect(await page.locator(".throttle-row").boundingBox()).toEqual(before);
    if (gesture === "click")
      await page.locator("canvas").click({ position: { x: 20, y: 150 } });
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

test("splash sound unlock happens before controller launch without moving the game", async ({
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
      buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [window.audioPad],
    });
  });
  await page.clock.install();
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(150);
  const sound = page.locator("#flight-overlay #audio-unlock");
  await expect(sound).toBeVisible();
  await expect(page.locator(".control-deck #audio-unlock")).toHaveCount(0);
  const launchBefore = await page.locator("#launch-button").boundingBox();
  const canvasBefore = await page.locator("canvas").boundingBox();
  const deckBefore = await page.locator(".control-deck").boundingBox();
  await sound.click();
  await expect
    .poll(() => page.evaluate(() => window.testAudio.state))
    .toBe("running");
  await expect(sound).toBeHidden();
  await expect(page.locator("#cockpit")).toHaveAttribute("data-phase", "ready");
  expect(await page.locator("#launch-button").boundingBox()).toEqual(
    launchBefore,
  );
  expect(await page.locator("canvas").boundingBox()).toEqual(canvasBefore);
  expect(await page.locator(".control-deck").boundingBox()).toEqual(deckBefore);
  await page.evaluate(() => {
    window.audioPad.buttons[0] = { value: 1, pressed: true };
  });
  await page.clock.runFor(150);
  await expect(page.locator("#cockpit")).toHaveAttribute(
    "data-phase",
    "flying",
  );
  await page.evaluate(() => {
    window.audioPad.buttons[7] = { value: 1, pressed: true };
  });
  await page.clock.runFor(150);
  await expect.poll(() => rms(page)).toBeGreaterThan(0.001);
});

test("keyboard activation of splash sound does not launch the mission", async ({
  page,
}) => {
  await probeAudio(page, true);
  await page.goto("/");
  await page.locator("#audio-unlock").focus();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.testAudio.state))
    .toBe("running");
  await expect(page.locator("#cockpit")).toHaveAttribute("data-phase", "ready");
  await expect(page.locator("#audio-unlock")).toBeHidden();
});
