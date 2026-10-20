import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { hardLandingApproach } from "./fixtures/hard-landing.js";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  await hardLandingApproach(page, { clearance: 120, vy: 16 });
  await page.clock.install();
  await page.goto("http://127.0.0.1:5173");
  await page.evaluate(() => document.fonts.ready);
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.evaluate(() => {
    const throttle = document.querySelector("#throttle");
    throttle.value = "20";
    throttle.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.keyboard.press("Enter");
  await page.keyboard.down("Space");
  for (let elapsed = 0; elapsed < 10000; elapsed += 50) {
    await page.clock.runFor(50);
    if (
      (await page.evaluate(() => window.lunarDiagnostics().phase)) !== "flying"
    )
      break;
  }
  await page.keyboard.up("Space");
  await mkdir("output/playwright", { recursive: true });
  const { duration } = await page.evaluate(
    () => window.lunarDiagnostics().landingBounce,
  );
  for (const [label, target] of [
    ["contact", 0.05],
    ["bounce", duration / 2],
    ["descending", duration / 2 + 0.35],
    ["settled", duration + 0.1],
  ]) {
    const age = await page.evaluate(() => window.lunarDiagnostics().resultTime);
    await page.clock.runFor(Math.max(0, target - age) * 1000);
    await page.screenshot({
      path: `output/playwright/hard-landing-${label}.png`,
      fullPage: true,
    });
  }
  await page.close();

  // Record the same approach in real time so the slower arc can be judged.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: {
      dir: "output/playwright/video",
      size: { width: 1280, height: 900 },
    },
  });
  const live = await context.newPage();
  await hardLandingApproach(live, { clearance: 120, vy: 16 });
  await live.goto("http://127.0.0.1:5173");
  await live.evaluate(async () => {
    await document.fonts.ready;
    const throttle = document.querySelector("#throttle");
    throttle.value = "20";
    throttle.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await live.keyboard.press("Enter");
  await live.keyboard.down("Space");
  await live.waitForFunction(
    () => {
      const state = window.lunarDiagnostics();
      return state.phase === "result" && state.resultTime > 4;
    },
    null,
    { timeout: 20000 },
  );
  const video = live.video();
  await context.close();
  await video.saveAs("output/playwright/hard-landing-lunar.webm");
} finally {
  await browser.close();
}
