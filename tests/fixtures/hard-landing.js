// Browser-only approach fixture; the playable game has no state mutation hook.
export async function hardLandingApproach(
  page,
  { clearance = 0.01, vy = 24 } = {},
) {
  await page.addInitScript(() => {
    Math.random = () => 7 / 4294967296;
    Object.defineProperty(navigator, "getGamepads", { value: () => [] });
  });
  await page.route(/\/src\/engine\.js(?:\?.*)?$/, async (route) => {
    const response = await route.fetch();
    const source = (await response.text()).replace(
      "game.ship = newShip();",
      `game.ship = newShip();
       if (game.mission === 1) {
         const pad = game.pads[0];
         Object.assign(game.ship, {
           x: (pad.x1 + pad.x2) / 2, y: pad.y - 11 - ${clearance},
           vx: 0, vy: ${vy}, angle: 0
         });
       }`,
    );
    await route.fulfill({ response, body: source });
  });
}
