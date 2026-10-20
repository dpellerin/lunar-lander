import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));
await page.goto("http://127.0.0.1:5173");
await page.waitForTimeout(800);
await mkdir("qa", { recursive: true });
await page.screenshot({ path: "qa/desktop.png", fullPage: true });
console.log(
  await page.evaluate(() => ({
    title: document.title,
    screen: document
      .querySelector("#flight-screen")
      .getBoundingClientRect()
      .toJSON(),
    overflow: document.documentElement.scrollWidth > innerWidth,
    diagnostics: window.lunarDiagnostics?.(),
  })),
);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(200);
await page.screenshot({ path: "qa/mobile.png", fullPage: true });
console.log(
  await page.evaluate(() => ({
    mobile: {
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      screen: document
        .querySelector("#flight-screen")
        .getBoundingClientRect()
        .toJSON(),
    },
  })),
);
await browser.close();
