import { test, expect } from "@playwright/test";

async function setup(
  page,
  mode = "standard",
  { focusless = false, discovery = false } = {},
) {
  await page.addInitScript(
    ({ mode, focusless, discovery }) => {
      window.testPad = {
        id: "Xbox Wireless Controller (simulated)",
        connected: !discovery,
        index: 0,
        mapping: mode,
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          value: 0,
          pressed: false,
        })),
      };
      if (focusless)
        Object.defineProperty(document, "hasFocus", { value: () => false });
      Object.defineProperty(navigator, "getGamepads", {
        value: () => {
          if (mode === "blocked")
            throw new DOMException("Gamepad blocked", "SecurityError");
          return [null, window.testPad];
        },
      });
    },
    { mode, focusless, discovery },
  );
  await page.clock.install();
  await page.goto("/");
  await page.bringToFront();
  await page.clock.runFor(150);
}
async function button(page, index, value) {
  await page.evaluate(
    ({ index, value }) => {
      window.testPad.buttons[index] = { value, pressed: value >= 0.5 };
    },
    { index, value },
  );
  await page.clock.runFor(150);
}
async function press(page, index) {
  await button(page, index, 1);
  await button(page, index, 0);
}
const diagnostics = (page) => page.evaluate(() => window.lunarDiagnostics());

test("connecting a controller keeps the combined controls and playfield stable", async ({
  page,
}) => {
  await setup(page, "standard", { discovery: true });
  await expect(page.locator(".controller-panel")).toHaveCount(0);
  await expect(
    page.locator(".pilot-controls #controller-status"),
  ).toBeVisible();
  await expect(
    page.locator(".mission-controls #controller-status"),
  ).toHaveCount(0);
  const layout = () =>
    page.evaluate(() => {
      const rect = document
        .querySelector(".input-guides")
        .getBoundingClientRect();
      const canvas = document.querySelector("canvas").getBoundingClientRect();
      const deck = document
        .querySelector(".control-deck")
        .getBoundingClientRect();
      return {
        panel: rect.height,
        deck: deck.height,
        canvas: canvas.height,
        top: canvas.top,
        document: document.documentElement.scrollHeight,
      };
    });
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [768, 1024],
    [1324, 1249],
    [1920, 1080],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.clock.runFor(150);
    const before = await layout();
    await expect(page.locator("#overlay-hint")).toHaveText(
      "PRESS ENTER TO BEGIN",
    );
    await page.evaluate(() => {
      window.testPad.connected = true;
    });
    await page.clock.runFor(150);
    expect(await layout(), `${width} wide connected layout`).toEqual(before);
    await expect(page.locator("#controller-status")).toBeHidden();
    expect(await page.locator("#gamepad-guide kbd").allTextContents()).toEqual([
      "STICK",
      "RT",
      "A",
      "B",
      "Y",
      "≡",
    ]);
    await expect(page.locator("#gamepad-guide")).toContainText("START/NEXT");
    await expect(page.locator("#gamepad-guide")).toContainText("PREFS");
    await expect(page.locator("#throttle")).toBeHidden();
    await expect(page.locator("#keyboard-guide")).toHaveAttribute("hidden", "");
    await expect(page.locator("#gamepad-guide")).not.toHaveAttribute(
      "hidden",
      "",
    );
    await expect(page.locator("#controller-meter")).toBeVisible();
    await expect(page.locator("#thrust-heading")).toHaveText(
      "CONTROLLER THRUST",
    );
    await expect(page.locator("#overlay-hint")).toHaveText("PRESS A TO BEGIN");
    await expect(page.locator("#launch-button span")).toHaveText("A");
    await expect(page.locator("#controller-status")).toHaveText(
      "CONTROLLER READY · A to start",
    );
    await page.evaluate(() => {
      window.testPad.connected = false;
    });
    await page.clock.runFor(150);
    expect(await layout(), `${width} wide disconnected layout`).toEqual(before);
    await expect(page.locator("#controller-status")).toBeVisible();
    await expect(page.locator("#throttle")).toBeVisible();
    await expect(page.locator("#gamepad-guide")).toHaveAttribute("hidden", "");
    await expect(page.locator("#keyboard-guide")).not.toHaveAttribute(
      "hidden",
      "",
    );
    await expect(page.locator("#overlay-hint")).toHaveText(
      "PRESS ENTER TO BEGIN",
    );
  }
});

for (const focusless of [false, true]) {
  test(`discovery only connects, then a fresh A launches in a visible ${focusless ? "embedded page without keyboard focus" : "focused page"}`, async ({
    page,
  }) => {
    await setup(page, "standard", { focusless, discovery: true });
    expect((await diagnostics(page)).controller.connected).toBe(false);
    await expect(page.locator("#controller-status")).toHaveText(
      "CONTROLLER · Any button connects",
    );
    await page.evaluate(() => {
      window.testPad.connected = true;
      window.testPad.buttons[0] = { value: 1, pressed: true };
    });
    await page.clock.runFor(150);
    const connected = await diagnostics(page);
    expect(connected.phase).toBe("ready");
    expect(connected.controller.connected).toBe(true);
    await page.clock.runFor(500);
    expect((await diagnostics(page)).phase).toBe("ready");
    await button(page, 0, 0);
    await expect(page.locator("#controller-status")).toHaveText(
      "CONTROLLER READY · A to start",
    );
    expect((await diagnostics(page)).phase).toBe("ready");
    await press(page, 0);
    const launched = await diagnostics(page);
    expect(launched.phase).toBe("flying");
    expect(launched.paused).toBe(false);
    await expect(page.locator("#controller-status")).toHaveText(
      "CONTROLLER CONNECTED",
    );
    await button(page, 7, 0.4);
    expect((await diagnostics(page)).ship.throttle).toBeCloseTo(0.4, 5);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.clock.runFor(150);
    const hidden = await diagnostics(page);
    expect(hidden.paused).toBe(true);
    expect(hidden.controller.thrust).toBe(0);
    await press(page, 0);
    expect((await diagnostics(page)).fuel).toBe(hidden.fuel);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: false,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await press(page, 0);
    expect((await diagnostics(page)).paused).toBe(true);
    await button(page, 7, 0);
    await press(page, 0);
    expect((await diagnostics(page)).paused).toBe(false);
  });
}

test("Xbox trigger directly controls thrust and stick/D-pad steer the ship", async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator("#controller-status")).toHaveText(
    "CONTROLLER READY · A to start",
  );
  await press(page, 0);
  expect((await diagnostics(page)).phase).toBe("flying");
  for (const value of [0.1, 0.25, 0.5, 0.75, 1, 0]) {
    await button(page, 7, value);
    const state = await diagnostics(page);
    expect(state.ship.throttle).toBeCloseTo(value, 5);
    await expect(page.locator("#controller-percent")).toHaveText(
      `${Math.round(value * 100)}%`,
    );
  }
  await expect(page.locator("#throttle")).toHaveValue("65");
  await page.evaluate(() => {
    window.testPad.axes[0] = -0.5;
  });
  await page.clock.runFor(300);
  const left = await diagnostics(page);
  expect(left.ship.angle).toBeLessThan(0);
  await page.evaluate(() => {
    window.testPad.axes[0] = 0.5;
  });
  await page.clock.runFor(600);
  expect((await diagnostics(page)).ship.angle).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.testPad.axes[0] = 0;
  });
  await button(page, 14, 1);
  expect((await diagnostics(page)).controller.rotate).toBe(-1);
  await button(page, 14, 0);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.clock.runFor(100);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
  await press(page, 1);
  expect((await diagnostics(page)).ship.angle).toBe(0);
  expect((await diagnostics(page)).ship.throttle).toBe(1);
});

test("held A does not relaunch after a crash", async ({ page }) => {
  test.setTimeout(process.env.CI ? 135000 : 45000);
  await setup(page);
  await button(page, 0, 1);
  await page.clock.runFor(22000);
  const contact = await diagnostics(page);
  expect(contact.phase).toBe("result");
  expect(contact.mission).toBe(1);
  await page.clock.runFor(300);
  expect((await diagnostics(page)).mission).toBe(1);
  await button(page, 0, 0);
  await press(page, 0);
  expect((await diagnostics(page)).mission).toBe(2);
});

test("X warns before restarting; B cancels and a fresh A confirms after release", async ({
  page,
}) => {
  await setup(page);
  await press(page, 0);
  await button(page, 7, 1);
  const before = await diagnostics(page);
  await button(page, 2, 1);
  await expect(page.locator("#restart-confirmation")).toBeVisible();
  const warned = await diagnostics(page);
  expect(warned.terrainSeed).toBe(before.terrainSeed);
  expect(warned.fuel).toBeLessThanOrEqual(before.fuel);
  expect(warned.score).toBe(before.score);
  await page.clock.runFor(300);
  expect((await diagnostics(page)).ship).toEqual(warned.ship);
  expect((await diagnostics(page)).fuel).toBe(warned.fuel);
  await button(page, 0, 1);
  await expect(page.locator("#restart-confirmation")).toBeVisible();
  for (const index of [0, 2, 7]) await button(page, index, 0);
  await press(page, 1);
  await expect(page.locator("#restart-confirmation")).toBeHidden();
  expect((await diagnostics(page)).terrainSeed).toBe(before.terrainSeed);
  expect((await diagnostics(page)).fuel).toBe(warned.fuel);
  await press(page, 2);
  await press(page, 0);
  const reset = await diagnostics(page);
  expect(reset.phase).toBe("flying");
  expect(reset.score).toBe(0);
  expect(reset.fuel).toBe(750);
  expect(reset.mission).toBe(1);
  expect(reset.terrainSeed).not.toBe(before.terrainSeed);
  expect(reset.ship.throttle).toBe(0);
  await page.clock.runFor(300);
  expect((await diagnostics(page)).terrainSeed).toBe(reset.terrainSeed);
  expect((await diagnostics(page)).fuel).toBe(750);
  await press(page, 3);
  await expect(page.locator("#preferences")).toBeVisible();
  await press(page, 2);
  await expect(page.locator("#restart-confirmation")).toBeVisible();
  await press(page, 1);
  await expect(page.locator("#preferences")).toBeVisible();
  expect((await diagnostics(page)).terrainSeed).toBe(reset.terrainSeed);
  await press(page, 2);
  await press(page, 0);
  await expect(page.locator("#preferences")).toBeHidden();
  expect((await diagnostics(page)).terrainSeed).not.toBe(reset.terrainSeed);
  await expect(page.locator("#restart-key")).toHaveText("X");
});

test("Menu pauses, held inputs cannot resume, and the manual blocks controller thrust", async ({
  page,
}) => {
  await setup(page);
  await press(page, 0);
  await button(page, 7, 0.8);
  await press(page, 9);
  const paused = await diagnostics(page);
  expect(paused.paused).toBe(true);
  await press(page, 0);
  expect((await diagnostics(page)).paused).toBe(true);
  expect((await diagnostics(page)).fuel).toBe(paused.fuel);
  await button(page, 7, 0);
  await press(page, 9);
  expect((await diagnostics(page)).paused).toBe(false);
  await press(page, 3);
  await expect(page.locator("#preferences")).toBeVisible();
  const frozen = await diagnostics(page);
  await button(page, 7, 0.6);
  await press(page, 1);
  await expect(page.locator("#preferences")).not.toBeVisible();
  expect((await diagnostics(page)).ship.throttle).toBe(0);
  expect((await diagnostics(page)).fuel).toBe(frozen.fuel);
  await button(page, 7, 0);
  await button(page, 7, 0.6);
  expect((await diagnostics(page)).ship.throttle).toBeCloseTo(0.6, 5);
  // Keyboard pause/resume must also require a released controller trigger.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.clock.runFor(150);
  expect((await diagnostics(page)).ship.throttle).toBe(0);
  await button(page, 7, 0);
  await button(page, 7, 0.6);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.clock.runFor(150);
  const blurred = await diagnostics(page);
  expect(blurred.paused).toBe(true);
  expect(blurred.controller.thrust).toBe(0);
  await press(page, 0);
  expect((await diagnostics(page)).fuel).toBe(blurred.fuel);
  await button(page, 7, 0);
  await press(page, 0);
  expect((await diagnostics(page)).paused).toBe(false);
});

test("disconnect pauses flight and reconnect requires neutral inputs before resuming", async ({
  page,
}) => {
  await setup(page);
  await press(page, 0);
  await button(page, 7, 0.5);
  await page.evaluate(() => {
    window.testPad.connected = false;
  });
  await page.clock.runFor(150);
  const lost = await diagnostics(page);
  expect(lost.paused).toBe(true);
  expect(lost.controller.thrust).toBe(0);
  await expect(page.locator("#controller-status")).toContainText(
    "Press A to connect",
  );
  await page.evaluate(() => {
    window.testPad.connected = true;
  });
  await press(page, 0);
  expect((await diagnostics(page)).paused).toBe(true);
  expect((await diagnostics(page)).fuel).toBe(lost.fuel);
  await button(page, 7, 0);
  await press(page, 0);
  expect((await diagnostics(page)).paused).toBe(false);
  await button(page, 7, 1);
  expect((await diagnostics(page)).ship.throttle).toBe(1);
});

for (const mode of ["blocked", "unmapped"]) {
  test(`keyboard remains usable when controller access is ${mode}`, async ({
    page,
  }) => {
    await setup(page, mode);
    await expect(page.locator("#controller-status")).toContainText(
      mode === "blocked" ? "unavailable" : "not supported",
    );
    await page.keyboard.press("Enter");
    await page.keyboard.down("Space");
    await page.clock.runFor(200);
    expect((await diagnostics(page)).ship.throttle).toBeCloseTo(0.65, 5);
    await page.keyboard.up("Space");
  });
}
