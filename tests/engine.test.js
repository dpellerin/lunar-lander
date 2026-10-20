import test from "node:test";
import assert from "node:assert/strict";

const engine = await import("../src/engine.js").catch(() => ({}));

test("new rounds generate new landscapes while preserving resources and reproducible seed sequences", () => {
  const game = engine.createGame({ seed: 12345 }),
    copy = engine.createGame({ seed: 12345 });
  assert.deepEqual(game.terrain, copy.terrain);
  assert.notDeepEqual(game.terrain, engine.createGame({ seed: 54321 }).terrain);
  const original = structuredClone(game.terrain);
  engine.startGame(game);
  assert.deepEqual(
    game.terrain,
    original,
    "launch keeps the previewed landscape",
  );
  engine.setDifficulty(game, "cadet");
  assert.deepEqual(
    game.terrain,
    original,
    "difficulty does not move the ground",
  );
  game.phase = "result";
  game.score = 200;
  const fuel = game.fuel,
    time = game.time;
  engine.nextMission(game);
  assert.notDeepEqual(game.terrain, original);
  assert.equal(game.score, 200);
  assert.equal(game.fuel, fuel);
  assert.equal(game.time, time);
  copy.phase = "result";
  engine.nextMission(copy);
  assert.deepEqual(game.terrain, copy.terrain);
  const second = structuredClone(game.terrain);
  game.phase = "gameover";
  engine.startGame(game);
  assert.notDeepEqual(
    game.terrain,
    second,
    "a new game also starts a fresh landscape",
  );
  const distinct = new Set(
    Array.from({ length: 12 }, () =>
      JSON.stringify(engine.createGame().terrain),
    ),
  );
  assert.equal(distinct.size, 12, "normal play receives random seeds");
});

test("a new game exposes deterministic mission state and selectable difficulties", () => {
  assert.deepEqual(engine.WORLD, { width: 1600, height: 1000 });
  assert.deepEqual(
    engine.DIFFICULTIES.map(({ id, gravity }) => [id, gravity]),
    [
      ["training", 5.3],
      ["cadet", 5.3],
      ["prime", 10.6],
      ["command", 5.3],
    ],
  );
  for (const difficulty of engine.DIFFICULTIES) {
    assert.equal(typeof difficulty.name, "string");
    assert.equal(typeof difficulty.description, "string");
  }
  const game = engine.createGame({ difficulty: "prime" });
  assert.equal(game.difficulty, "prime");
  assert.equal(game.score, 0);
  assert.equal(game.mission, 1);
  assert.equal(game.result, null);
  assert.equal(game.resultTime, 0);
  assert.deepEqual(game.ship, {
    x: 180,
    y: 140,
    vx: 28,
    vy: 0,
    angle: 0,
    angularVelocity: 0,
    throttle: 0,
  });
  assert.equal(engine.createGame().difficulty, "training");
  assert.equal(
    engine.createGame({ difficulty: "unknown" }).difficulty,
    "training",
  );
});

test("terrain is continuous, wrapped, interpolated and contains four integrated bonus pads", () => {
  const game = engine.createGame({ seed: 123 });
  assert.deepEqual(game.terrain, engine.createGame({ seed: 123 }).terrain);
  assert.equal(game.terrain[0].x, 0);
  assert.equal(game.terrain.at(-1).x, engine.WORLD.width);
  assert.equal(game.terrain[0].y, game.terrain.at(-1).y);
  assert.deepEqual(
    game.pads.map((pad) => pad.multiplier),
    [2, 3, 4, 5],
  );
  assert.ok(
    game.pads[0].x2 - game.pads[0].x1 > game.pads[3].x2 - game.pads[3].x1,
  );
  for (const pad of game.pads) {
    assert.ok(
      game.terrain.some((point) => point.x === pad.x1 && point.y === pad.y),
    );
    assert.ok(
      game.terrain.some((point) => point.x === pad.x2 && point.y === pad.y),
    );
    assert.equal(engine.terrainY(game.terrain, (pad.x1 + pad.x2) / 2), pad.y);
  }
  for (let i = 1; i < game.terrain.length; i++) {
    const a = game.terrain[i - 1];
    const b = game.terrain[i];
    assert.ok(b.x > a.x);
    assert.ok(b.y >= 310 && b.y <= 940);
    assert.ok(
      Math.abs(
        engine.terrainY(game.terrain, (a.x + b.x) / 2) - (a.y + b.y) / 2,
      ) < 1e-8,
    );
  }
  assert.equal(
    engine.terrainY(game.terrain, -25),
    engine.terrainY(game.terrain, 1575),
  );
  assert.equal(
    engine.terrainY(game.terrain, 1625),
    engine.terrainY(game.terrain, 25),
  );
  game.ship.x = (game.pads[0].x1 + game.pads[0].x2) / 2;
  assert.equal(
    engine.altitude(game),
    engine.terrainY(game.terrain, game.ship.x) - game.ship.y - 11,
  );
  game.ship.y += 20;
  assert.equal(
    engine.altitude(game),
    engine.terrainY(game.terrain, game.ship.x) - game.ship.y - 11,
  );
});

test("a flight starts with a finite fuel supply and advances under gravity", () => {
  assert.equal(typeof engine.createGame, "function", "flight engine exists");
  const game = engine.createGame();
  assert.equal(game.phase, "ready");
  engine.startGame(game);
  const { y, vy } = game.ship;
  engine.stepGame(game, {}, 1 / 60);
  assert.equal(game.phase, "flying");
  assert.ok(game.ship.y > y);
  assert.ok(game.ship.vy > vy);
  assert.equal(game.fuel, 750);
});

function fly(game, input = {}, seconds = 1) {
  for (let i = 0; i < Math.round(seconds * 120); i++)
    engine.stepGame(game, input, 1 / 120);
  return game;
}

test("thrust opposes gravity proportionally and burns nine fuel per full-thrust second", () => {
  const coast = engine.createGame();
  const powered = engine.createGame();
  const half = engine.createGame();
  for (const game of [coast, powered, half]) engine.startGame(game);
  fly(coast);
  fly(powered, { thrust: 1 });
  fly(half, { thrust: 0.5 });
  assert.ok(powered.ship.vy < 0);
  assert.ok(powered.ship.vy < half.ship.vy && half.ship.vy < coast.ship.vy);
  assert.ok(Math.abs(powered.fuel - 741) < 1e-8);
  assert.ok(Math.abs(half.fuel - 745.5) < 1e-8);
  assert.equal(powered.ship.throttle, 1);
  engine.stepGame(powered, {}, 1 / 120);
  assert.equal(powered.ship.throttle, 0);
});

test("rotation uses fuel and tilts thrust", () => {
  const game = engine.createGame();
  engine.startGame(game);
  fly(game, { rotate: 1 });
  assert.ok(game.ship.angle > 0);
  assert.ok(Math.abs(game.fuel - 749.2) < 1e-8);
  const vx = game.ship.vx;
  fly(game, { thrust: 1 }, 0.25);
  assert.ok(game.ship.vx > vx);
});

test("assisted difficulties allow repeated full rotations in either direction and stop on release", () => {
  for (const difficulty of ["training", "cadet", "prime"]) {
    for (const rotate of [-1, 1]) {
      const game = engine.createGame({ difficulty, seed: 12345 });
      engine.startGame(game);
      game.terrain = [
        { x: 0, y: 1000 },
        { x: 1600, y: 1000 },
      ];
      Object.assign(game.ship, { x: 800, y: 80, vx: 0 });
      fly(game, { rotate }, 10);
      assert.equal(game.phase, "flying");
      assert.ok(rotate * game.ship.angle > 4 * Math.PI);
      assert.ok(Math.abs(game.fuel - 742) < 1e-8);
      const { angle } = game.ship;
      fly(game, {}, 0.25);
      assert.equal(game.ship.angle, angle);
      assert.equal(game.ship.angularVelocity, 0);
      assert.ok(Math.abs(game.fuel - 742) < 1e-8);
    }
  }
});

test("empty tanks disable controls but keep ballistic flight until impact", () => {
  const empty = engine.createGame();
  engine.startGame(empty);
  empty.fuel = 0;
  fly(empty, { thrust: 1, rotate: 1 });
  assert.equal(empty.fuel, 0);
  assert.equal(empty.ship.throttle, 0);
  assert.equal(empty.ship.angle, 0);
  assert.ok(empty.ship.vy > 0);
  assert.equal(empty.phase, "flying");
  empty.fuel = 0.01;
  engine.stepGame(empty, { thrust: 1, rotate: -1 }, 1 / 120);
  assert.equal(empty.fuel, 0);
  const angle = empty.ship.angle;
  engine.stepGame(empty, { thrust: 1, rotate: -1 }, 1 / 120);
  assert.equal(empty.ship.angle, angle);
  assert.equal(empty.ship.throttle, 0);
});

test("difficulty switches midflight change gravity, training drag and command inertia", () => {
  const games = Object.fromEntries(
    engine.DIFFICULTIES.map(({ id }) => {
      const game = engine.createGame({ difficulty: id });
      engine.startGame(game);
      fly(game);
      return [id, game];
    }),
  );
  assert.ok(games.training.ship.vy < games.cadet.ship.vy);
  assert.ok(games.cadet.ship.vy < games.prime.ship.vy);
  assert.ok(games.training.ship.vx < 28);
  assert.equal(games.prime.ship.vx, 28);
  const game = games.training;
  const x = game.ship.x;
  assert.equal(engine.setDifficulty(game, "command"), true);
  assert.equal(game.difficulty, "command");
  assert.equal(game.ship.x, x);
  assert.equal(engine.setDifficulty(game, "nonsense"), false);
  assert.equal(game.difficulty, "command");
  fly(game, { rotate: 1 }, 0.5);
  const angle = game.ship.angle;
  fly(game, {}, 0.5);
  assert.ok(
    game.ship.angle > angle,
    "command rotation coasts without fuel burn",
  );
  fly(game, { rotate: 1 }, 2);
  assert.ok(
    Math.abs(game.ship.angle) > Math.PI / 2,
    "command permits full rotation",
  );
  game.fuel = 0;
  const angularVelocity = game.ship.angularVelocity;
  fly(game, { rotate: -1 }, 0.1);
  assert.equal(game.ship.angularVelocity, angularVelocity);
});

function approach({
  vx = 0,
  vy = 5,
  angle = 0,
  fuel = 750,
  padIndex = 0,
} = {}) {
  const game = engine.createGame();
  engine.startGame(game);
  const pad = game.pads[padIndex];
  Object.assign(game.ship, {
    x: (pad.x1 + pad.x2) / 2,
    y: pad.y - 11 - 0.01,
    vx,
    vy,
    angle,
  });
  game.fuel = fuel;
  return game;
}

test("touchdown freezes the ship and applies score and bonus fuel exactly once", () => {
  const game = approach({ padIndex: 2 });
  engine.stepGame(game, {}, 1 / 120);
  assert.equal(game.phase, "result");
  assert.equal(game.result.kind, "soft");
  assert.equal(game.score, 200);
  assert.equal(game.fuel, 800);
  assert.equal(game.ship.y, game.pads[2].y - 11);
  const ship = { ...game.ship };
  const time = game.time;
  fly(game, { thrust: 1, rotate: 1 }, 3);
  assert.equal(
    game.phase,
    "result",
    "engine does not automatically start another mission",
  );
  assert.equal(game.score, 200);
  assert.equal(game.fuel, 800);
  assert.equal(game.time, time);
  assert.ok(game.resultTime >= 2.99);
  assert.deepEqual(game.ship, ship);
});

test("a hard landing makes one small hop and settles without awarding twice or using fuel", () => {
  for (const fuel of [750, 0]) {
    const game = approach({ vy: 24, vx: 8, fuel });
    engine.stepGame(game, {}, 1 / 120);
    assert.equal(game.result.kind, "hard");
    assert.equal(game.phase, fuel ? "result" : "gameover");
    const { surfaceY, height } = game.landingBounce;
    const { x, angle } = game.ship;
    const { score, time } = game;
    const ys = [game.ship.y];
    assert.ok(game.ship.vy < 0, "initial movement rebounds upward");
    for (let tick = 0; tick < 600; tick++) {
      engine.stepGame(game, { thrust: 1, rotate: 1, abort: true }, 1 / 120);
      ys.push(game.ship.y);
      assert.equal(game.ship.x, x);
      assert.equal(game.ship.angle, angle);
      assert.ok(game.ship.y <= surfaceY, "feet never sink into the pad");
    }
    const apex = ys.indexOf(Math.min(...ys));
    assert.ok(apex > 0);
    assert.ok(surfaceY - ys[apex] >= height - 0.01);
    assert.ok(height >= 4 && height <= 8);
    assert.ok(ys.slice(1, apex + 1).every((y, i) => y <= ys[i]));
    assert.ok(ys.slice(apex + 1).every((y, i) => y >= ys[apex + i]));
    assert.equal(game.ship.y, surfaceY);
    assert.equal(game.ship.vy, 0);
    assert.equal(game.ship.vx, 0);
    assert.equal(game.ship.throttle, 0);
    assert.equal(game.landingBounce, null);
    assert.equal(game.score, score);
    assert.equal(game.fuel, fuel);
    assert.equal(game.time, time);
    const settled = { ...game.ship };
    fly(game, {}, 2);
    assert.deepEqual(game.ship, settled, "no second bounce");
  }
});

test("hard-landing rebound uses flight gravity and slows through the apex before a gentle fall", () => {
  for (const { id, gravity } of engine.DIFFICULTIES) {
    const game = approach({ vy: 24 });
    engine.setDifficulty(game, id);
    engine.stepGame(game, {}, 1 / 120);
    const { surfaceY, height, duration } = game.landingBounce;
    assert.equal(game.landingBounce.gravity, gravity);
    assert.ok(
      duration > 2,
      "a small rebound lasts several seconds in low gravity",
    );
    const at = (seconds) => {
      while (game.resultTime < seconds - 1e-9)
        engine.stepGame(game, {}, Math.min(0.1, seconds - game.resultTime));
    };
    at(duration / 2 - 0.2);
    const risingSpeed = game.ship.vy;
    assert.ok(risingSpeed < 0);
    assert.ok(Math.abs(risingSpeed + gravity * 0.2) < 1e-8);
    at(duration / 2);
    assert.ok(
      Math.abs(game.ship.vy) < 1e-8,
      "vertical speed reaches zero at the apex",
    );
    assert.ok(Math.abs(game.ship.y - (surfaceY - height)) < 1e-8);
    at(duration / 2 + 0.2);
    assert.ok(game.ship.vy > 0 && game.ship.vy < 3, "descent begins gently");
    assert.ok(Math.abs(game.ship.vy - gravity * 0.2) < 1e-8);
    assert.ok(
      Math.abs(game.ship.y - (surfaceY - height + 0.5 * gravity * 0.2 ** 2)) <
        1e-8,
    );
    at(duration + 0.1);
    assert.equal(game.ship.y, surfaceY);
    assert.equal(game.ship.vy, 0);
    assert.equal(game.landingBounce, null);
  }
});

test("hard-landing bounce timing is independent of frame size and clears on relaunch", () => {
  const a = approach({ vy: 20 }),
    b = structuredClone(a);
  for (const game of [a, b]) engine.stepGame(game, {}, 1 / 120);
  fly(a, {}, 0.3);
  for (let frame = 0; frame < 3; frame++) engine.stepGame(b, {}, 0.1);
  assert.ok(Math.abs(a.ship.y - b.ship.y) < 1e-9);
  assert.ok(Math.abs(a.ship.vy - b.ship.vy) < 1e-9);
  assert.ok(a.landingBounce);
  assert.equal(engine.nextMission(a), true);
  assert.equal(a.landingBounce, null);
  assert.equal(a.resultTime, 0);
  assert.deepEqual(a.ship, engine.createGame().ship);
  const soft = approach();
  const crash = approach({ vy: 40 });
  for (const game of [soft, crash]) {
    engine.stepGame(game, {}, 1 / 120);
    assert.equal(game.landingBounce, null);
  }
});

test("rotated body and leg contacts detect slopes before the ship center reaches terrain", () => {
  const slope = engine.createGame();
  engine.startGame(slope);
  slope.terrain = [
    { x: 0, y: 800 },
    { x: 380, y: 800 },
    { x: 410, y: 650 },
    { x: 1600, y: 800 },
  ];
  slope.pads = [];
  const x = 395;
  const surface = engine.terrainY(slope.terrain, x);
  Object.assign(slope.ship, { x, y: surface - 13, vx: 0, vy: 5, angle: 0 });
  engine.stepGame(slope, {}, 1 / 120);
  assert.equal(
    slope.phase,
    "result",
    "right leg meets rising slope before center foot",
  );
  assert.equal(slope.result.kind, "crash");
  assert.equal(slope.score, 5);
  const inverted = approach();
  inverted.difficulty = "command";
  inverted.ship.angle = Math.PI;
  inverted.ship.y = inverted.pads[0].y - 11.5;
  engine.stepGame(inverted, {}, 1 / 120);
  assert.equal(
    inverted.phase,
    "result",
    "inverted nose touches before unrotated feet",
  );
  assert.equal(inverted.result.kind, "crash");
  assert.ok(inverted.ship.y <= inverted.pads[0].y - 12 + 1e-6);
  const hard = approach({ vy: 20, vx: 10 });
  engine.stepGame(hard, {}, 1 / 120);
  assert.equal(hard.result.kind, "hard");
  assert.equal(hard.score, 30);
  assert.equal(hard.fuel, 750);
  const fast = approach({ vy: 32 });
  engine.stepGame(fast, {}, 1 / 120);
  assert.equal(fast.result.kind, "crash");
});

test("next mission relaunches only from a result while retaining resources and elapsed time", () => {
  const game = approach();
  engine.stepGame(game, {}, 1 / 120);
  const { score, fuel, time, difficulty } = game;
  assert.equal(engine.nextMission(game), true);
  assert.equal(game.phase, "flying");
  assert.equal(game.mission, 2);
  assert.deepEqual(game.ship, engine.createGame().ship);
  assert.equal(game.score, score);
  assert.equal(game.fuel, fuel);
  assert.equal(game.time, time);
  assert.equal(game.difficulty, difficulty);
  assert.equal(game.result, null);
  assert.equal(game.resultTime, 0);
  assert.equal(engine.nextMission(game), false);
  assert.equal(game.mission, 2);
});

test("fuel exhaustion ends the run and New Game resets resources while retaining difficulty", () => {
  for (const vy of [5, 20, 40]) {
    const game = approach({ fuel: 0, vy });
    engine.setDifficulty(game, "cadet");
    engine.stepGame(game, {}, 1 / 120);
    assert.equal(game.phase, "gameover");
    const oldTerrain = structuredClone(game.terrain);
    assert.equal(engine.nextMission(game), false);
    assert.equal(engine.startGame(game), true);
    assert.equal(game.phase, "flying");
    assert.equal(game.fuel, 750);
    assert.equal(game.score, 0);
    assert.equal(game.time, 0);
    assert.equal(game.mission, 1);
    assert.equal(game.difficulty, "cadet");
    assert.equal(game.result, null);
    assert.equal(game.landingBounce, null);
    assert.notDeepEqual(game.terrain, oldTerrain);
    assert.deepEqual(game.ship, engine.createGame().ship);
    assert.equal(
      engine.startGame(game),
      false,
      "start cannot reset an active mission",
    );
  }
});

test("abort performs one timed upright full-thrust burn and ignores retriggers while active", () => {
  const game = engine.createGame();
  assert.equal(engine.abortGame(game), false, "ready state cannot abort");
  engine.startGame(game);
  Object.assign(game.ship, { angle: 1, angularVelocity: 2, vy: 20 });
  assert.equal(engine.abortGame(game), true);
  assert.equal(engine.abortGame(game), false);
  fly(game, { rotate: -1, abort: true });
  assert.equal(game.ship.angle, 0);
  assert.equal(game.ship.angularVelocity, 0);
  assert.equal(game.ship.throttle, 1);
  assert.ok(game.ship.vy < 20);
  assert.ok(Math.abs(game.fuel - 675) < 1e-8);
  fly(game, { abort: true });
  assert.ok(Math.abs(game.fuel - 600) < 1e-8);
  fly(game, { abort: true }, 0.25);
  assert.ok(
    Math.abs(game.fuel - 600) < 1e-8,
    "holding abort does not start another burn",
  );
  assert.equal(game.ship.throttle, 0);
  engine.stepGame(game, {}, 1 / 120);
  engine.stepGame(game, { abort: true }, 1 / 120);
  assert.equal(
    game.ship.throttle,
    1,
    "a fresh press can request another completed abort",
  );
  const low = engine.createGame();
  engine.startGame(low);
  low.fuel = 1;
  assert.equal(engine.abortGame(low), true);
  fly(low);
  assert.equal(low.fuel, 0);
  assert.equal(low.ship.throttle, 0);
  assert.equal(engine.abortGame(low), false);
});

test("fixed substeps make frame-sized advances match 120 Hz and reject invalid time deltas", () => {
  const a = engine.createGame({ difficulty: "command", seed: 123 });
  const b = engine.createGame({ difficulty: "command", seed: 123 });
  engine.startGame(a);
  engine.startGame(b);
  const input = { rotate: 0.2, thrust: 0.65 };
  fly(a, input, 1);
  for (let i = 0; i < 10; i++) engine.stepGame(b, input, 0.1);
  for (const key of ["x", "y", "vx", "vy", "angle", "angularVelocity"]) {
    assert.ok(
      Math.abs(a.ship[key] - b.ship[key]) < 1e-9,
      `${key} is independent of frame partition`,
    );
  }
  assert.ok(Math.abs(a.fuel - b.fuel) < 1e-9);
  const snapshot = structuredClone(b);
  for (const dt of [0, -1, NaN, Infinity]) engine.stepGame(b, input, dt);
  assert.deepEqual(b, snapshot);
  engine.stepGame(b, input, 10);
  assert.ok(
    b.time - snapshot.time <= 0.25 + 1e-9,
    "background tab deltas are clamped",
  );
  const partial = engine.createGame();
  engine.startGame(partial);
  engine.stepGame(partial, {}, 1 / 240);
  assert.equal(partial.time, 0, "partial simulation ticks accumulate");
  engine.stepGame(partial, {}, 1 / 240);
  assert.equal(partial.time, 1 / 120);
});

test("swept contacts stop high-speed flight at a ridge even when both tick endpoints are clear", () => {
  const game = engine.createGame({ difficulty: "prime" });
  engine.startGame(game);
  game.terrain = [
    { x: 0, y: 900 },
    { x: 100, y: 900 },
    { x: 110, y: 600 },
    { x: 120, y: 900 },
    { x: 1600, y: 900 },
  ];
  game.pads = [];
  Object.assign(game.ship, { x: 80, y: 700, vx: 10000, vy: 0 });
  engine.stepGame(game, {}, 1 / 120);
  assert.equal(game.phase, "result");
  assert.equal(game.result.kind, "crash");
  assert.ok(
    game.ship.x < 110,
    "stops at first ridge contact, not beyond the ridge",
  );
  const falling = approach({ vy: 20000 });
  falling.ship.y -= 200;
  engine.stepGame(falling, {}, 0.25);
  assert.equal(falling.result.kind, "crash");
  assert.ok(falling.ship.y <= falling.pads[0].y - 11 + 1e-6);
});

test("ship wraps horizontally and is gently returned from above the visible world", () => {
  const game = engine.createGame({ difficulty: "prime" });
  engine.startGame(game);
  game.ship.x = 1599.9;
  game.ship.vx = 28;
  engine.stepGame(game, {}, 1 / 120);
  assert.ok(game.ship.x >= 0 && game.ship.x < 1);
  game.ship.x = 0.1;
  game.ship.vx = -28;
  engine.stepGame(game, {}, 1 / 120);
  assert.ok(game.ship.x > 1599 && game.ship.x < 1600);
  game.ship.y = -1;
  game.ship.vy = -20;
  engine.stepGame(game, {}, 1 / 120);
  assert.ok(game.ship.y < -1, "top is not an invisible solid wall");
  assert.ok(game.ship.vy < 0, "velocity is not snapped at top");
  const normal = engine.createGame({ difficulty: "prime" });
  engine.startGame(normal);
  normal.ship.vy = -20;
  engine.stepGame(normal, {}, 1 / 120);
  assert.ok(
    game.ship.vy > normal.ship.vy,
    "soft return applies above the world",
  );
  assert.equal(game.phase, "flying");
});

test("relaunch clears an interrupted abort and partial-tick state", () => {
  const game = approach({ vy: 15.5 });
  engine.abortGame(game);
  engine.stepGame(game, {}, 1 / 120);
  assert.equal(game.phase, "result");
  assert.ok(game.abortTime > 0);
  engine.nextMission(game);
  const fuel = game.fuel;
  engine.stepGame(game, {}, 1 / 120);
  assert.equal(
    game.ship.throttle,
    0,
    "an old abort never leaks into a new mission",
  );
  assert.equal(game.fuel, fuel);
  assert.equal(game.abortTime, 0);
  const ready = engine.createGame();
  engine.stepGame(ready, { thrust: 1 }, 0.2);
  assert.equal(ready.time, 0);
  assert.equal(ready.fuel, 750);
  engine.startGame(ready);
  engine.stepGame(ready, {}, 1 / 240);
  assert.equal(ready.time, 0);
});

test("altitude measures the lowest rotated landing foot against interpolated terrain", () => {
  const game = engine.createGame();
  game.ship.angle = 0.5;
  const cosine = Math.cos(game.ship.angle);
  const sine = Math.sin(game.ship.angle);
  const gaps = [-9, 9].map((x) => {
    const px = game.ship.x + x * cosine - 11 * sine;
    const py = game.ship.y + x * sine + 11 * cosine;
    return engine.terrainY(game.terrain, px) - py;
  });
  assert.ok(Math.abs(engine.altitude(game) - Math.min(...gaps)) < 1e-9);
});

test("a tilted touchdown with a rotated foot outside the pad is not a safe landing", () => {
  const game = approach({ angle: -0.16 });
  const pad = game.pads[0];
  game.ship.x = pad.x2 - 9.2;
  engine.stepGame(game, {}, 1 / 120);
  assert.equal(game.phase, "result");
  assert.equal(
    game.result.kind,
    "crash",
    "both actual rotated feet must fit the pad",
  );
});

test("a soft upright touchdown on a bonus pad awards points and fuel", () => {
  assert.equal(
    typeof engine.evaluateLanding,
    "function",
    "landing rules exist",
  );
  const pad = { x1: 100, x2: 180, y: 600, multiplier: 4 };
  assert.deepEqual(
    engine.evaluateLanding({ x: 140, vx: 2, vy: 5, angle: 0 }, pad),
    {
      kind: "soft",
      points: 200,
      fuel: 50,
      message: "A PERFECT LANDING",
    },
  );
});

test("landing rules distinguish hard contact, unsafe speed, tilt and missed pads", () => {
  const pad = { x1: 100, x2: 180, y: 600, multiplier: 3 };
  const ship = { x: 140, vx: 0, vy: 20, angle: 0 };
  assert.equal(engine.evaluateLanding(ship, pad).kind, "hard");
  assert.equal(engine.evaluateLanding(ship, pad).points, 45);
  assert.equal(engine.evaluateLanding(ship, pad).fuel, 0);
  for (const change of [{ vy: 32 }, { vx: 16 }, { angle: 0.6 }, { x: 102 }]) {
    const result = engine.evaluateLanding({ ...ship, ...change }, pad);
    assert.equal(result.kind, "crash");
    assert.equal(result.points, 5);
  }
  assert.equal(engine.evaluateLanding(ship, undefined).kind, "crash");
});

test("code-derived landing thresholds keep the manual axis discrepancy explicit", () => {
  const pad = { x1: 100, x2: 180, multiplier: 5 },
    ship = { x: 140, vx: 15.9, vy: 15.9, angle: Math.PI / 16 };
  assert.equal(engine.evaluateLanding(ship, pad).kind, "soft");
  assert.equal(engine.evaluateLanding({ ...ship, vy: 16 }, pad).kind, "hard");
  assert.equal(engine.evaluateLanding({ ...ship, vy: 31.9 }, pad).kind, "hard");
  assert.equal(engine.evaluateLanding({ ...ship, vy: 32 }, pad).kind, "crash");
  assert.equal(engine.evaluateLanding({ ...ship, vx: -16 }, pad).kind, "crash");
  assert.equal(
    engine.evaluateLanding({ ...ship, angle: 0.2 }, pad).kind,
    "crash",
  );
});

test("abort brakes sideways motion with a stronger emergency engine burn", () => {
  const game = engine.createGame({ difficulty: "cadet" });
  engine.startGame(game);
  const powered = engine.createGame({ difficulty: "cadet" });
  engine.startGame(powered);
  engine.abortGame(game);
  fly(game, {}, 1);
  fly(powered, { thrust: 1 }, 1);
  assert.ok(Math.abs(game.ship.vx) < Math.abs(powered.ship.vx));
  assert.ok(game.ship.vy < powered.ship.vy);
});
