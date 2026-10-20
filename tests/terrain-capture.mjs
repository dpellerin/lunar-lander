import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1320, height: 1060 },
  deviceScaleFactor: 1,
});
try {
  await page.goto("http://127.0.0.1:5173");
  await page.evaluate(async () => {
    const { VectorRenderer } = await import("/src/renderers/vector.js");
    const { createGame, startGame, nextMission, terrainY } =
      await import("/src/engine.js");
    document.body.innerHTML = '<main id="gallery"></main>';
    const style = document.createElement("style");
    style.textContent = `
      html,body { margin:0; padding:0; background:#090c0b; color:#dce4df; overflow:visible; }
      #gallery { display:grid; grid-template-columns:640px 640px; gap:20px; padding:10px; }
      #gallery section { margin:0; }
      #gallery h2 { font:12px monospace; margin:14px 0; letter-spacing:1px; }
      #gallery canvas { display:block; position:static; width:640px; height:460px; background:#000; }
    `;
    document.head.append(style);
    const game = createGame({ seed: 7 });
    const draw = (label, approach = false) => {
      const box = document.createElement("section");
      box.innerHTML = `<h2>${label}</h2><canvas></canvas>`;
      document.querySelector("#gallery").append(box);
      const renderer = new VectorRenderer(box.querySelector("canvas"));
      renderer.glow = false;
      renderer.resize(640, 460);
      const fixture = structuredClone(game);
      if (approach) {
        const basins = fixture.terrain.filter(
          (p, i, t) =>
            i > 0 &&
            i < t.length - 1 &&
            t[i - 1].y < p.y &&
            t[i + 1].y < p.y &&
            p.y > 800 &&
            p.y - terrainY(t, p.x - 60) > 15 &&
            p.y - terrainY(t, p.x + 60) > 15,
        );
        const basin = basins.sort((a, b) => b.y - a.y)[0];
        const center = basin.x;
        fixture.ship.x = center;
        fixture.ship.y = basin.y - 130;
        // A valid stationary close-up after the craft has descended within it.
        renderer.cameraMission = fixture.mission;
        renderer.camera = {
          mode: "closeup",
          x: center,
          y: fixture.ship.y + 110,
          shipX: center,
        };
      }
      renderer.render(fixture);
    };
    draw("ROUND 1 / BASIN DETAIL / VECTOR GLOW OFF", true);
    draw("ROUND 1 / OVERVIEW");
    startGame(game);
    for (let round = 2; round <= 3; round++) {
      game.phase = "result";
      nextMission(game);
      draw(`ROUND ${round} / OVERVIEW`);
    }
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  await mkdir("qa", { recursive: true });
  await page.screenshot({ path: "qa/terrain-rocky.png", fullPage: true });
  // Also show the playable app, using a deterministic seed for repeatable QA.
  await page.addInitScript(() => {
    Math.random = () => 7 / 4294967296;
  });
  await page.clock.install();
  await page.goto("http://127.0.0.1:5173");
  await page.getByRole("button", { name: "Launch mission" }).click();
  await page.clock.runFor(4000);
  await page.screenshot({
    path: "qa/terrain-rocky-gameplay.png",
    fullPage: true,
  });
} finally {
  await browser.close();
}
