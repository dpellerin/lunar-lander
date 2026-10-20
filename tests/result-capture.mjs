import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.addInitScript(() => {
    Math.random = () => 7 / 4294967296;
    Object.defineProperty(navigator, "getGamepads", { value: () => [] });
  });
  await page.clock.install();
  await page.goto("http://127.0.0.1:5173");
  await page.keyboard.press("Enter");
  for (let elapsed = 0; elapsed < 30000; elapsed += 250) {
    await page.clock.runFor(250);
    if (
      (await page.evaluate(() => window.lunarDiagnostics().phase)) !== "flying"
    )
      break;
  }
  await page.clock.runFor(150);
  await page.evaluate(() => document.fonts.ready);
  await mkdir("output/playwright", { recursive: true });
  const label = process.argv[2] || "result";
  await page.screenshot({
    path: `output/playwright/${label}-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(50);
  await page.screenshot({
    path: `output/playwright/${label}-mobile.png`,
    fullPage: true,
  });
} finally {
  await browser.close();
}
