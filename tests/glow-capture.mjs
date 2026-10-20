import { chromium, webkit } from "@playwright/test";
import { mkdir } from "node:fs/promises";

await mkdir("output/playwright", { recursive: true });
for (const engine of [chromium, webkit]) {
  const browser = await engine.launch();
  try {
    for (const dpr of [1, 2]) {
      const page = await browser.newPage({
        viewport: { width: 1240, height: 480 },
        deviceScaleFactor: dpr,
      });
      await page.clock.install();
      await page.goto("http://127.0.0.1:5173");
      await page.clock.runFor(100);
      await page
        .getByRole("button", { name: "Preferences", exact: true })
        .click();
      const readings = {};
      for (const glow of [false, true]) {
        await page.getByLabel("VECTOR GLOW", { exact: true }).setChecked(glow);
        await page.clock.runFor(50);
        readings[glow] = await page.locator("canvas").evaluate((canvas) => {
          const data = canvas
            .getContext("2d")
            .getImageData(0, 0, canvas.width, canvas.height).data;
          let light = 0;
          for (let i = 0; i < data.length; i += 4)
            light +=
              ((data[i] + data[i + 1] + data[i + 2]) * data[i + 3]) / 255;
          return light;
        });
      }
      if (readings.true < readings.false * 1.5)
        throw new Error(
          `${engine.name()} DPR ${dpr}: glow difference too small`,
        );
      console.log(
        `${engine.name()} DPR ${dpr}: toggle changes emitted light by ${(readings.true / readings.false).toFixed(2)}x`,
      );
      if (engine === chromium && dpr === 2) {
        await page.evaluate(async () => {
          const { VectorRenderer } = await import("/src/renderers/vector.js");
          const { createGame } = await import("/src/engine.js");
          const game = createGame({ seed: 7 });
          const pad = game.pads[1];
          game.ship.x = (pad.x1 + pad.x2) / 2;
          game.ship.y = pad.y - 130;
          document.body.innerHTML = '<main id="glow-comparison"></main>';
          const style = document.createElement("style");
          style.textContent = `
            html,body { margin:0; padding:0; background:#101310; }
            #glow-comparison { display:grid; grid-template-columns:600px 600px; gap:16px; padding:12px; }
            #glow-comparison h2 { font:13px monospace; color:#dce4df; margin:8px 0 12px; letter-spacing:1px; }
            #glow-comparison canvas { display:block; position:static; width:600px; height:400px; background:#030705; }
          `;
          document.head.append(style);
          for (const glow of [false, true]) {
            const section = document.createElement("section");
            section.innerHTML = `<h2>VECTOR GLOW ${glow ? "ON" : "OFF"}</h2><canvas></canvas>`;
            document.querySelector("#glow-comparison").append(section);
            const renderer = new VectorRenderer(
              section.querySelector("canvas"),
            );
            renderer.glow = glow;
            renderer.resize(600, 400, devicePixelRatio);
            renderer.render(game, { paused: true });
          }
        });
        await page.locator("#glow-comparison").screenshot({
          path: "output/playwright/vector-glow-comparison.png",
          scale: "css",
        });
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
