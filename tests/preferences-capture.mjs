import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1324, height: 1249 },
    deviceScaleFactor: 1,
  });
  await page.addInitScript(() => {
    Math.random = () => 7 / 4294967296;
    Object.defineProperty(navigator, "getGamepads", {
      value: () => (window.capturePad ? [window.capturePad] : []),
    });
  });
  await page.clock.install();
  await page.goto("http://127.0.0.1:5173");
  await page.evaluate(() => document.fonts.ready);
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await mkdir("output/playwright", { recursive: true });
  const deck = await page.locator(".control-deck").boundingBox();
  await page.screenshot({
    path: "output/playwright/controller-start-prompt.png",
    clip: {
      x: deck.x,
      y: deck.y,
      width: deck.width,
      height: deck.height,
    },
  });
  await page.evaluate(() => {
    window.capturePad = {
      id: "Xbox Wireless Controller (simulated)",
      index: 0,
      connected: true,
      mapping: "standard",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })),
    };
  });
  await page.clock.runFor(150);
  await page.locator(".control-deck").screenshot({
    path: "output/playwright/controller-flight-controls.png",
  });
  await page.screenshot({
    path: "output/playwright/controller-ready-splash.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    window.capturePad = null;
  });
  await page.clock.runFor(150);
  await page.keyboard.press("Enter");
  await page.clock.runFor(4000);
  await page.screenshot({
    path: "output/playwright/clean-cockpit.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    window.capturePad = {
      id: "Xbox Wireless Controller (simulated)",
      index: 0,
      connected: true,
      mapping: "standard",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, () => ({ value: 0, pressed: false })),
    };
  });
  await page.clock.runFor(150);
  await page.screenshot({
    path: "output/playwright/compact-controller-connected.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByText("CONTROLS & SCORING", { exact: true }).click();
  await page.locator("#preferences").screenshot({
    path: "output/playwright/preferences-reference.png",
  });
  await page.screenshot({
    path: "output/playwright/preferences-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(50);
  await page.screenshot({
    path: "output/playwright/preferences-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close preferences" }).click();
  await page.clock.runFor(100);
  await page.screenshot({
    path: "output/playwright/clean-cockpit-mobile.png",
    fullPage: true,
  });
} finally {
  await browser.close();
}
