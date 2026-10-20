import { chromium, webkit } from "@playwright/test";
for (const [name, engine] of [
  ["chromium", chromium],
  ["webkit", webkit],
]) {
  const browser = await engine.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.LUNAR_URL || "http://127.0.0.1:4173");
  await page.evaluate(() => document.fonts.ready);
  await page
    .getByRole("button", { name: "Launch mission", exact: true })
    .click();
  await page.keyboard.down("Space");
  await page.waitForTimeout(400);
  await page.keyboard.up("Space");
  const result = await page.evaluate(() => ({
    status: document.querySelector("#cockpit").dataset.phase,
    fuel: document.querySelector("#fuel-value").textContent,
    canvas: document.querySelector("canvas").width,
    devHook: typeof window.lunarDiagnostics,
    fonts: document.fonts.check('12px "IBM Plex Mono"'),
  }));
  console.log(name, JSON.stringify({ ...result, errors }));
  if (
    result.status !== "flying" ||
    Number(result.fuel) >= 750 ||
    errors.length ||
    !result.fonts ||
    result.devHook !== "undefined"
  )
    throw new Error("Production smoke test failed");
  await browser.close();
}
