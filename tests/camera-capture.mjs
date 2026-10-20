import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.clock.install();
await page.goto("http://127.0.0.1:5173");
await page.keyboard.press("Enter");
for (const [label, ms] of [
  ["early", 8000],
  ["approach", 5000],
  ["close", 2000],
]) {
  await page.clock.runFor(ms);
  await page.screenshot({ path: `qa/camera-${label}.png` });
  console.log(
    label,
    JSON.stringify(
      await page.evaluate(() => {
        const { camera: c, ship: s, phase } = window.lunarDiagnostics(),
          canvas = document.querySelector("canvas"),
          w = canvas.clientWidth,
          h = canvas.clientHeight;
        return {
          phase,
          zoom: c.zoom,
          shipScreen: {
            x: 0.5 + ((s.x - c.x) * c.scale) / w,
            y: 0.5 + ((s.y - c.y) * c.scale) / h,
          },
        };
      }),
    ),
  );
}
await page.setViewportSize({ width: 390, height: 844 });
await page.clock.runFor(100);
await page.screenshot({ path: "qa/camera-narrow.png", fullPage: true });
await browser.close();
