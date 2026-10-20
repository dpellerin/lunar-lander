import { generateTerrain } from "./terrain.js";

// Display-speed thresholds reconstructed from the published 6502 listing.
// The operator manual appears to transpose the speed axes; see docs/FIDELITY.md.
export function evaluateLanding(ship, pad) {
  const angle = Math.atan2(Math.sin(ship.angle), Math.cos(ship.angle));
  if (
    !pad ||
    ship.x - 9 < pad.x1 ||
    ship.x + 9 > pad.x2 ||
    Math.abs(ship.vx) >= 16 ||
    Math.abs(ship.vy) >= 32 ||
    Math.abs(angle) > Math.PI / 16
  ) {
    return { kind: "crash", points: 5, fuel: 0, message: "YOU HAVE CRASHED" };
  }
  if (Math.abs(ship.vy) >= 16) {
    return {
      kind: "hard",
      points: 15 * pad.multiplier,
      fuel: 0,
      message: "A HARD LANDING",
    };
  }
  return {
    kind: "soft",
    points: 50 * pad.multiplier,
    fuel: 50,
    message: "A PERFECT LANDING",
  };
}

export const WORLD = Object.freeze({ width: 1600, height: 1000 });

export const DIFFICULTIES = Object.freeze(
  [
    {
      id: "training",
      name: "Training",
      gravity: 5.3,
      description: "Light gravity with gentle stabilizing drag.",
    },
    {
      id: "cadet",
      name: "Cadet",
      gravity: 5.3,
      description: "Moderate gravity without flight assistance.",
    },
    {
      id: "prime",
      name: "Prime",
      gravity: 10.6,
      description: "Strong gravity demands careful fuel management.",
    },
    {
      id: "command",
      name: "Command",
      gravity: 5.3,
      description: "Moderate gravity and full inertial rotation.",
    },
  ].map(Object.freeze),
);

function wrapX(x) {
  return ((x % WORLD.width) + WORLD.width) % WORLD.width;
}

export function terrainY(terrain, x) {
  const wrapped = wrapX(x);
  for (let i = 1; i < terrain.length; i++) {
    const a = terrain[i - 1];
    const b = terrain[i];
    if (wrapped <= b.x)
      return a.y + ((b.y - a.y) * (wrapped - a.x)) / (b.x - a.x);
  }
  return terrain[0].y;
}

export function altitude(game) {
  const { ship, terrain } = game;
  const cosine = Math.cos(ship.angle);
  const sine = Math.sin(ship.angle);
  return Math.min(
    ...[-9, 9].map((x) => {
      const px = ship.x + x * cosine - 11 * sine;
      const py = ship.y + x * sine + 11 * cosine;
      return terrainY(terrain, px) - py;
    }),
  );
}

function newShip() {
  return {
    x: 180,
    y: 140,
    vx: 28,
    vy: 0,
    angle: 0,
    angularVelocity: 0,
    throttle: 0,
  };
}

export function createGame({
  difficulty = "training",
  seed = Math.floor(Math.random() * 4294967296),
} = {}) {
  const terrainSeed = seed >>> 0;
  return {
    phase: "ready",
    fuel: 750,
    time: 0,
    score: 0,
    mission: 1,
    difficulty: DIFFICULTIES.some(({ id }) => id === difficulty)
      ? difficulty
      : "training",
    result: null,
    resultTime: 0,
    landingBounce: null,
    landingSettle: null,
    ship: newShip(),
    abortTime: 0,
    abortHeld: false,
    terrainSeed,
    ...generateTerrain(terrainSeed),
  };
}

export function setDifficulty(game, id) {
  if (!DIFFICULTIES.some((difficulty) => difficulty.id === id)) return false;
  game.difficulty = id;
  return true;
}

function launch(game) {
  if (game.mission > 1) {
    game.terrainSeed = (game.terrainSeed + 0x9e3779b9) >>> 0;
    Object.assign(game, generateTerrain(game.terrainSeed));
  }
  game.ship = newShip();
  game.result = null;
  game.resultTime = 0;
  game.landingBounce = null;
  game.landingSettle = null;
  game.abortTime = 0;
  game.abortHeld = false;
  game.accumulator = 0;
  game.phase = "flying";
}

export function startGame(game) {
  if (game.phase === "gameover") {
    Object.assign(game, createGame({ difficulty: game.difficulty }));
  } else if (game.phase !== "ready" || game.fuel <= 0) {
    return false;
  }
  launch(game);
  return true;
}

export function nextMission(game) {
  if (game.phase !== "result") return false;
  game.mission += 1;
  launch(game);
  return true;
}

export function restartGame(game) {
  Object.assign(
    game,
    createGame({
      difficulty: game.difficulty,
      seed: (game.terrainSeed + 0x9e3779b9) >>> 0,
    }),
  );
  return startGame(game);
}

export function abortGame(game) {
  if (game.phase !== "flying" || game.fuel <= 0 || game.abortTime > 0)
    return false;
  game.abortTime = 2;
  return true;
}

const SHIP_CONTACTS = [
  [-9, 11],
  [-6, 11],
  [-3, 11],
  [0, 11],
  [3, 11],
  [6, 11],
  [9, 11],
  [-7, 6],
  [-7, 0],
  [-5, -7],
  [0, -12],
  [5, -7],
  [7, 0],
  [7, 6],
];

function surfaceContact(game) {
  const { ship, terrain } = game;
  const cosine = Math.cos(ship.angle);
  const sine = Math.sin(ship.angle);
  let gap = Infinity;
  let surface = 0;
  for (const [x, y] of SHIP_CONTACTS) {
    const px = ship.x + x * cosine - y * sine;
    const py = ship.y + x * sine + y * cosine;
    const ground = terrainY(terrain, px);
    if (ground - py < gap) {
      gap = ground - py;
      surface = ground;
    }
  }
  return { gap, surface };
}

// Sample the swept rotated hull at subpixel spacing, then refine first contact.
// This also catches crossing a narrow ridge when the final position is clear.
function sweepMotion(game, from, dx, dy) {
  const ship = game.ship;
  const angleDelta = ship.angle - from.angle;
  const segments = Math.max(
    1,
    Math.ceil(Math.hypot(dx, dy) + Math.abs(angleDelta) * 15),
  );
  const place = (fraction) => {
    ship.x = from.x + dx * fraction;
    ship.y = from.y + dy * fraction;
    ship.angle = from.angle + angleDelta * fraction;
    return surfaceContact(game);
  };
  let contact = place(0);
  if (contact.gap <= 0) return contact;
  for (let i = 1; i <= segments; i++) {
    contact = place(i / segments);
    if (contact.gap <= 0) {
      let low = (i - 1) / segments;
      let high = i / segments;
      for (let j = 0; j < 24; j++) {
        const middle = (low + high) / 2;
        if (place(middle).gap <= 0) high = middle;
        else low = middle;
      }
      return place(high);
    }
  }
  return contact;
}

const FIXED_STEP = 1 / 120;
const MAX_FRAME = 0.25;

function advanceResult(game, elapsed) {
  game.resultTime += elapsed;
  const settle = game.landingSettle;
  if (settle) {
    const progress = Math.min(1, game.resultTime / settle.duration);
    // Ease the raised foot down, keeping the lower foot on the flat pad.
    const ease = progress * progress * (3 - 2 * progress);
    game.ship.angle = progress === 1 ? 0 : settle.angle * (1 - ease);
    game.ship.y =
      settle.padY -
      11 * Math.cos(game.ship.angle) -
      9 * Math.abs(Math.sin(game.ship.angle));
    if (progress === 1) game.landingSettle = null;
  }
  const bounce = game.landingBounce;
  if (!bounce) return;
  const t = Math.min(game.resultTime, bounce.duration);
  const liftSpeed = (bounce.gravity * bounce.duration) / 2;
  // Use flight gravity: decelerate to zero at the apex, then fall gently.
  const surfaceY = settle ? game.ship.y : bounce.surfaceY;
  game.ship.y = Math.min(
    surfaceY,
    surfaceY - liftSpeed * t + 0.5 * bounce.gravity * t * t,
  );
  game.ship.vy = -liftSpeed + bounce.gravity * t;
  if (t === bounce.duration) {
    game.ship.y = surfaceY;
    game.ship.vy = 0;
    game.landingBounce = null;
  }
}

// Time is accumulated rather than integrated with variable frame durations.
export function stepGame(game, input = {}, dt = FIXED_STEP) {
  if (!Number.isFinite(dt) || dt <= 0 || game.phase === "ready") return;
  const elapsed = Math.min(dt, MAX_FRAME);
  if (game.phase === "result" || game.phase === "gameover") {
    advanceResult(game, elapsed);
    return;
  }
  if (input.abort && !game.abortHeld) abortGame(game);
  game.abortHeld = Boolean(input.abort);
  game.accumulator = (game.accumulator || 0) + elapsed;
  while (game.accumulator + 1e-12 >= FIXED_STEP && game.phase === "flying") {
    game.accumulator = Math.max(0, game.accumulator - FIXED_STEP);
    simulateTick(game, input, FIXED_STEP);
  }
  if (game.phase !== "flying") {
    advanceResult(game, game.accumulator);
    game.accumulator = 0;
  }
}

function simulateTick(game, input, dt) {
  game.time += dt;
  const aborting = game.abortTime > 0 && game.fuel > 0;
  let thrust = aborting
    ? Math.min(1, game.abortTime / dt)
    : Math.max(0, Math.min(1, input.thrust || 0));
  let rotate = aborting ? 0 : Math.max(-1, Math.min(1, input.rotate || 0));
  if (aborting) {
    game.ship.angle = 0;
    game.ship.angularVelocity = 0;
  }
  const from = { x: game.ship.x, y: game.ship.y, angle: game.ship.angle };
  const requestedFuel =
    ((aborting ? 75 : 9) * thrust + 0.8 * Math.abs(rotate)) * dt;
  const poweredFraction =
    requestedFuel > 0 ? Math.min(1, game.fuel / requestedFuel) : 0;
  thrust *= poweredFraction;
  rotate *= poweredFraction;
  if (game.difficulty === "command") {
    game.ship.angularVelocity += rotate * 2.8 * dt;
    game.ship.angle += game.ship.angularVelocity * dt;
  } else {
    game.ship.angularVelocity = rotate * 1.4;
    game.ship.angle += game.ship.angularVelocity * dt;
  }
  game.ship.throttle = thrust;
  game.fuel = Math.max(0, game.fuel - requestedFuel);
  if (aborting)
    game.abortTime =
      game.abortTime - dt > 1e-9 && game.fuel > 0 ? game.abortTime - dt : 0;
  const acceleration = aborting ? 33 : 22;
  if (aborting) game.ship.vx *= Math.exp(-1.8 * dt * thrust);
  game.ship.vx += Math.sin(game.ship.angle) * acceleration * thrust * dt;
  const gravity = DIFFICULTIES.find(({ id }) => id === game.difficulty).gravity;
  game.ship.vy +=
    (gravity - Math.cos(game.ship.angle) * acceleration * thrust) * dt;
  // A spring and upward damping, not an invisible collision plane.
  if (game.ship.y < 0)
    game.ship.vy +=
      (-game.ship.y * 0.6 + Math.max(0, -game.ship.vy) * 0.8) * dt;
  if (game.difficulty === "training") {
    const drag = Math.exp(-0.012 * dt);
    game.ship.vx *= drag;
    game.ship.vy *= drag;
  }
  const contact = sweepMotion(game, from, game.ship.vx * dt, game.ship.vy * dt);
  if (contact.gap <= 0) {
    const cosine = Math.cos(game.ship.angle);
    const sine = Math.sin(game.ship.angle);
    const footXs = [-9, 9].map((x) => game.ship.x + x * cosine - 11 * sine);
    const pad = game.pads.find(
      (pad) =>
        game.ship.x - 9 >= pad.x1 &&
        game.ship.x + 9 <= pad.x2 &&
        footXs.every((x) => x >= pad.x1 && x <= pad.x2) &&
        Math.abs(pad.y - contact.surface) < 1e-6,
    );
    game.ship.y += contact.gap;
    game.result = evaluateLanding(game.ship, pad);
    const impactVy = game.ship.vy;
    if (game.result.kind !== "crash") {
      const angle = Math.atan2(
        Math.sin(game.ship.angle),
        Math.cos(game.ship.angle),
      );
      game.ship.angle = angle;
      game.ship.vx = 0;
      game.ship.vy = 0;
      game.ship.angularVelocity = 0;
      game.landingSettle = { angle, padY: pad.y, duration: 0.9 };
    }
    if (game.result.kind === "hard") {
      const height = Math.max(4, Math.min(8, Math.abs(impactVy) * 0.25));
      game.landingBounce = {
        surfaceY: pad.y - 11,
        height,
        gravity,
        duration: 2 * Math.sqrt((2 * height) / gravity),
      };
      game.ship.vx = 0;
      game.ship.angularVelocity = 0;
    }
    const exhausted = game.fuel <= 0;
    game.score += game.result.points;
    game.fuel += game.result.fuel;
    game.resultTime = 0;
    game.phase = exhausted ? "gameover" : "result";
    game.ship.throttle = 0;
  }
  game.ship.x = wrapX(game.ship.x);
}
