import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:5173");
await page.evaluate(async () => {
  const { generateTerrain } = await import("/src/terrain.js");
  const { terrain, pads } = generateTerrain(123);
  document.body.innerHTML =
    '<canvas id="study" width="1440" height="900" style="position:static;width:1440px;height:900px;background:black"></canvas>';
  const c = document.querySelector("canvas").getContext("2d");
  const draw = (x0, y0, w, h, label) => {
    const s = Math.min(w / 1600, h / 1000);
    c.strokeStyle = "#ececec";
    c.lineWidth = 1.2;
    c.beginPath();
    terrain.forEach((p, i) =>
      i
        ? c.lineTo(x0 + p.x * s, y0 + p.y * s)
        : c.moveTo(x0 + p.x * s, y0 + p.y * s),
    );
    c.stroke();
    c.fillStyle = "#bbb";
    c.font = "16px monospace";
    c.fillText(label, x0, y0 + 20);
    for (const p of pads)
      c.fillText(
        `${p.multiplier}X`,
        x0 + ((p.x1 + p.x2) * s) / 2 - 10,
        y0 + p.y * s + 24,
      );
  };
  draw(60, 20, 1320, 680, "NEW CONTOUR / SEED 123");
  // Magnify a rock face to inspect actual geometric shoulders, not antialiasing.
  c.save();
  c.beginPath();
  c.rect(0, 640, 1440, 260);
  c.clip();
  c.translate(-450, -70);
  draw(0, 0, 2400, 1500, "");
  c.restore();
});
await page.screenshot({ path: "qa/terrain-contour-study.png" });
await browser.close();
