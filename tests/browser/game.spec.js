import { test, expect } from "@playwright/test";

test("clean cockpit keeps Preferences and fullscreen, with sound and graphics inside Preferences", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".header-actions button")).toHaveCount(2);
  await expect(page.locator("#fullscreen-button svg")).toBeVisible();
  await expect(page.locator(".pilot-controls p")).toHaveCount(0);
  expect(await page.locator("#keyboard-guide kbd").allTextContents()).toEqual([
    "←",
    "→",
    "SPACE",
    "A",
    "P",
  ]);
  for (const width of [320, 390, 768, 1324]) {
    await page.setViewportSize({ width, height: 1249 });
    const dimensions = await page.evaluate(() => {
      const prefs = document
        .querySelector("#preferences-button")
        .getBoundingClientRect();
      const fullscreen = document
        .querySelector("#fullscreen-button")
        .getBoundingClientRect();
      const throttle = document
        .querySelector("#throttle")
        .getBoundingClientRect();
      return {
        same:
          prefs.width === fullscreen.width &&
          prefs.height === fullscreen.height,
        width: fullscreen.width,
        throttle: throttle.width,
      };
    });
    expect(dimensions.same).toBe(true);
    expect(dimensions.width).toBe(44);
    expect(dimensions.throttle).toBeLessThanOrEqual(120);
  }
  await expect(
    page.getByRole("button", { name: "Enter fullscreen", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(
      "footer, #coin-button, #pause-button, .edition, .mode-label, .screen-bottom, #flight-status",
    ),
  ).toHaveCount(0);
  await expect(page.locator("#graphics-mode")).toBeHidden();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Preferences", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Graphics mode" }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Graphics mode" })
    .selectOption("vector");
  await page.getByLabel("SOUND", { exact: true }).uncheck();
  await page.getByLabel("VECTOR GLOW", { exact: true }).uncheck();
  await page.getByText("CONTROLS & SCORING", { exact: true }).click();
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [1324, 1249],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
  await expect(
    page.getByRole("table", { name: "Keyboard and controller controls" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close preferences" }).click();
  await page
    .getByRole("button", { name: "Launch mission", exact: true })
    .click();
  await page.keyboard.press("P");
  await expect(page.locator("#overlay-title")).toHaveText("FLIGHT PAUSED");
});

async function resultLayout(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas").getBoundingClientRect();
    const panel = document
      .querySelector("#flight-overlay")
      .getBoundingClientRect();
    const style = getComputedStyle(document.querySelector("#flight-overlay"));
    return {
      high: panel.top <= canvas.top + 109,
      inside: panel.top >= canvas.top && panel.bottom <= canvas.bottom,
      transparent: style.backgroundColor === "rgba(0, 0, 0, 0)",
      canvasHeight: canvas.height,
      canvasTop: canvas.top,
      pageHeight: document.documentElement.scrollHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}

test("game over starts a fresh game without an add-fuel feature", async ({
  page,
}) => {
  await page.route(/\/src\/main\.js(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const source = (await response.text()).replace(
      "const game = createGame();",
      'const game = createGame(); game.phase = "gameover"; game.score = 75; game.time = 10; game.fuel = 50;',
    );
    await route.fulfill({ response, body: source });
  });
  await page.goto("/");
  expect((await resultLayout(page)).transparent).toBe(true);
  await expect(
    page.getByRole("button", { name: "New game", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New game", exact: true }).click();
  await expect(page.locator("#cockpit")).toHaveAttribute(
    "data-phase",
    "flying",
  );
  await expect(page.locator("#fuel-value")).toHaveText("0750");
  await expect(page.locator("#score-value")).toHaveText("00000");
  expect(await page.evaluate(() => localStorage.getItem("lunar-best"))).toBe(
    "75",
  );
});

test("cockpit opens with a crisp canvas and launches using the keyboard", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "LUNAR LANDER", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".overlay-eyebrow")).toBeHidden();
  await expect(page.locator("#overlay-message")).toBeHidden();
  await expect(page.locator("#overlay-hint")).toHaveText(
    "PRESS ENTER TO BEGIN",
  );
  await expect(
    page.getByRole("button", { name: "Launch mission" }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#cockpit")).toHaveAttribute(
    "data-phase",
    "flying",
  );
  await expect(page.locator("#fuel-value")).not.toHaveText("0000");
  expect(errors).toEqual([]);
});

test("thrust consumes fuel, left and right rotate in the expected direction", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Enter");
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(300);
  await page.keyboard.up("ArrowLeft");
  const left = await page.evaluate(() => window.lunarDiagnostics());
  expect(left.ship.angle).toBeLessThan(0);
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(700);
  await page.keyboard.up("ArrowRight");
  const right = await page.evaluate(() => window.lunarDiagnostics());
  expect(right.ship.angle).toBeGreaterThan(0);
  await page.keyboard.down("Space");
  await page.waitForTimeout(500);
  await page.keyboard.up("Space");
  const thrust = await page.evaluate(() => window.lunarDiagnostics());
  expect(thrust.fuel).toBeLessThan(right.fuel);
  expect(thrust.sound).toBe("running");
});

test("pause and preferences freeze simulation, removed fuel shortcut is inert, difficulty can change in flight", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Enter");
  await page.keyboard.press("KeyP");
  await expect(page.locator("#overlay-title")).toHaveText("FLIGHT PAUSED");
  const frozen = await page.evaluate(() => window.lunarDiagnostics());
  await page.waitForTimeout(250);
  expect((await page.evaluate(() => window.lunarDiagnostics())).ship.y).toBe(
    frozen.ship.y,
  );
  await page.keyboard.press("KeyC");
  expect((await page.evaluate(() => window.lunarDiagnostics())).fuel).toBe(
    frozen.fuel,
  );
  await page.keyboard.press("KeyP");
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const manual = await page.evaluate(() => window.lunarDiagnostics());
  await page.waitForTimeout(250);
  expect((await page.evaluate(() => window.lunarDiagnostics())).ship.y).toBe(
    manual.ship.y,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.locator('[data-difficulty="command"]').click();
  expect(
    (await page.evaluate(() => window.lunarDiagnostics())).difficulty,
  ).toBe("command");
  await page.keyboard.press("KeyM");
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(page.getByLabel("SOUND", { exact: true })).not.toBeChecked();
});

test("responsive canvas has no horizontal overflow and HUD columns never overlap", async ({
  page,
}) => {
  await page.goto("/");
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [768, 1024],
    [1280, 720],
    [1920, 1080],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        page.locator("canvas").evaluate((canvas) => {
          const expectedWidth = Math.round(
            canvas.clientWidth * Math.min(2, devicePixelRatio),
          );
          return Math.abs(canvas.width - expectedWidth) <= 1;
        }),
      )
      .toBe(true);
    const layout = await page.evaluate(() => {
      const l = document
          .querySelector(".telemetry-left")
          .getBoundingClientRect(),
        r = document.querySelector(".telemetry-right").getBoundingClientRect(),
        c = document.querySelector("canvas");
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        overlap: l.right > r.left,
        canvasWidth: c.width,
        displayWidth: c.clientWidth,
      };
    });
    expect(layout.overflow, `${width} wide overflow`).toBe(false);
    expect(layout.overlap, `${width} wide telemetry`).toBe(false);
    expect(layout.canvasWidth).toBeGreaterThanOrEqual(layout.displayWidth - 1);
  }
});

test("crash results use a high transparent overlay without shifting the playfield", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Math.random = () => 7 / 4294967296;
  });
  await page.clock.install();
  await page.goto("/");
  await page.keyboard.press("Enter");
  const flightLayout = await resultLayout(page);
  for (let elapsed = 0; elapsed < 22000; elapsed += 250) {
    await page.clock.runFor(250);
    if (
      (await page.evaluate(() => window.lunarDiagnostics().phase)) !== "flying"
    )
      break;
  }
  await expect(page.locator("#cockpit")).toHaveAttribute(
    "data-phase",
    "result",
  );
  const result = await page.evaluate(() => window.lunarDiagnostics());
  expect(result.score).toBe(5);
  expect(result.camera.zoom).toBeGreaterThan(1);
  const impactLayout = await resultLayout(page);
  expect(impactLayout.canvasHeight).toBe(flightLayout.canvasHeight);
  expect(impactLayout.canvasTop).toBe(flightLayout.canvasTop);
  expect(impactLayout.pageHeight).toBe(flightLayout.pageHeight);
  expect(impactLayout.transparent).toBe(true);
  const impact = await page.locator("canvas").screenshot();
  await page.clock.runFor(300);
  const debris = await page.locator("canvas").screenshot();
  expect(impact.equals(debris), "crash debris continues animating").toBe(false);
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [1280, 720],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.clock.runFor(50);
    const layout = await resultLayout(page);
    expect(layout.high, `${width} wide result stays high`).toBe(true);
    expect(layout.inside, `${width} wide result stays in the playfield`).toBe(
      true,
    );
    expect(layout.transparent).toBe(true);
    expect(layout.overflow, `${width} wide result fits`).toBe(false);
  }
  await page.clock.runFor(1000);
  expect((await page.evaluate(() => window.lunarDiagnostics())).score).toBe(5);
  await page.getByRole("button", { name: "Next mission", exact: true }).click();
  await page.clock.runFor(50);
  const next = await page.evaluate(() => window.lunarDiagnostics());
  expect(next.mission).toBe(2);
  expect(next.phase).toBe("flying");
  expect(next.score).toBe(5);
  await expect(page.locator("#flight-overlay")).toBeHidden();
  await page.keyboard.press("KeyP");
  await expect(page.locator("#flight-screen #flight-overlay")).toBeVisible();
});

test("thrust-power keyboard shortcut remains usable after adjusting the slider with a pointer", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Enter");
  await page.locator("#throttle").click();
  await page.keyboard.down("Space");
  await page.waitForTimeout(200);
  const state = await page.evaluate(() => window.lunarDiagnostics());
  await page.keyboard.up("Space");
  expect(state.ship.throttle).toBeGreaterThan(0);
});
