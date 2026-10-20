import { createGame, startGame, stepGame, altitude } from "../src/engine.js";
const results = [];
for (const seed of [1, 7, 123, 999, 12345]) {
  const game = createGame({ seed });
  startGame(game);
  const pad = game.pads[0],
    target = (pad.x1 + pad.x2) / 2;
  let aligned = false;
  for (let tick = 0; tick < 120 * 150 && game.phase === "flying"; tick++) {
    const s = game.ship;
    if (Math.abs(target - s.x) < 6 && Math.abs(s.vx) < 1) aligned = true;
    const desiredVx = Math.max(-12, Math.min(12, (target - s.x) * 0.2));
    const ax = Math.max(-12, Math.min(12, (desiredVx - s.vx) * 0.7));
    const gap = altitude(game);
    const targetVy = aligned
      ? Math.min(18, Math.max(1, gap * 0.2))
      : Math.max(-12, Math.min(12, (200 - s.y) * 0.4));
    const up = 5.3 - (targetVy - s.vy) * 0.8;
    const targetAngle = Math.max(
      -1,
      Math.min(1, Math.atan2(ax, Math.max(1, up))),
    );
    const rotate = Math.max(-1, Math.min(1, (targetAngle - s.angle) * 10));
    const thrust = Math.max(
      0,
      Math.min(1, Math.hypot(ax, Math.max(0, up)) / 22),
    );
    stepGame(game, { rotate, thrust }, 1 / 120);
  }
  results.push({
    seed,
    kind: game.result?.kind,
    points: game.score,
    fuel: game.fuel,
    time: game.time,
  });
}
console.log(JSON.stringify(results, null, 2));
if (results.some((r) => r.kind !== "soft")) process.exitCode = 1;
