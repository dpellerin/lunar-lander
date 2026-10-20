import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

// Visual QA with simulated input, not a physical-controller connection check.
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.addInitScript(() => {
    Math.random = () => 7 / 4294967296;
    window.capturePad = {
      id: "Xbox Wireless Controller (simulated)",
      index: 0,
      connected: true,
      mapping: "standard",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })),
    };
    Object.defineProperty(navigator, "getGamepads", {
      value: () => [window.capturePad],
    });
  });
  await page.clock.install();
  await page.goto("http://127.0.0.1:5173");
  await page.bringToFront();
  await page.clock.runFor(150);
  await page.getByRole("button", { name: "Launch mission" }).click();
  await page.clock.runFor(100);
  await page.evaluate(() => {
    window.capturePad.buttons[7] = { value: 0.45, pressed: false };
  });
  await page.clock.runFor(3000);
  await page.evaluate(() => document.fonts.ready);
  await mkdir("qa", { recursive: true });
  await page.screenshot({ path: "qa/controller-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(100);
  await page.screenshot({ path: "qa/controller-mobile.png", fullPage: true });
} finally {
  await browser.close();
}
