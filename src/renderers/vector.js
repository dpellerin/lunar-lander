const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 1000;

function groundAt(terrain, x) {
  for (let i = 1; i < terrain.length; i++) {
    if (x <= terrain[i].x) {
      const a = terrain[i - 1],
        b = terrain[i];
      return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    }
  }
  return terrain.at(-1).y;
}

// Two discrete views, as observed in the supplied arcade gameplay reference.
// Thresholds use this recreation's world units, not the original HUD units.
export function computeCamera(game, width, height, previous = null) {
  const { ship } = game;
  const gap = groundAt(game.terrain, ship.x) - ship.y - 11;
  const closeup = previous?.mode === "closeup" ? gap < 280 : gap <= 160;
  const mode = closeup ? "closeup" : "overview",
    zoom = closeup ? 2.5 : 1;
  let scale, x, y;
  if (!closeup) {
    // Normally a fixed full-map frame. Expand only for an exceptional ascent,
    // including the hull rather than allowing the craft to leave the overview.
    const top = Math.min(0, ship.y - 32),
      bottom = Math.max(WORLD_HEIGHT, ship.y + 32);
    scale = Math.min(
      (width - 48) / (WORLD_WIDTH + 64),
      (height - 48) / (bottom - top),
    );
    x = WORLD_WIDTH / 2;
    y = (top + bottom) / 2;
  } else {
    scale =
      Math.min(
        (width - 48) / (WORLD_WIDTH + 64),
        (height - 48) / WORLD_HEIGHT,
      ) * zoom;
    const vw = width / scale,
      vh = height / scale;
    x = previous?.mode === "closeup" ? previous.x : ship.x;
    y = previous?.mode === "closeup" ? previous.y : ship.y + vh * 0.3;
    if (previous?.mode === "closeup" && previous.shipX !== undefined) {
      x += Math.round((ship.x - previous.shipX) / WORLD_WIDTH) * WORLD_WIDTH;
    }
    // The close-up stays fixed until the craft reaches its safe region's edge,
    // then scrolls just enough. Do not continuously center the craft.
    const sx = 0.5 + (ship.x - x) / vw,
      sy = 0.5 + (ship.y - y) / vh;
    x += (sx - Math.max(0.2, Math.min(0.8, sx))) * vw;
    y += (sy - Math.max(0.2, Math.min(0.72, sy))) * vh;
  }
  return {
    mode,
    zoom,
    scale,
    viewWidth: width / scale,
    viewHeight: height / scale,
    x,
    y,
    shipX: ship.x,
  };
}

// Stroke glyphs instead of filled browser text: the same visual vocabulary as an XY display.
const GLYPHS = {
  A: "04 20 44|13 33",
  B: "04 00 30 41 32 02|32 43 34 04",
  C: "40 10 01 03 14 44",
  D: "04 00 30 41 43 34 04",
  E: "40 00 04 44|02 32",
  F: "40 00 04|02 32",
  G: "40 10 01 03 14 44 42 22",
  H: "00 04|40 44|02 42",
  I: "00 40|20 24|04 44",
  J: "00 40 43 34 14 03",
  K: "00 04|40 02 44",
  L: "00 04 44",
  M: "04 00 22 40 44",
  N: "04 00 44 40",
  O: "10 30 41 43 34 14 03 01 10",
  P: "04 00 30 41 32 02",
  Q: "10 30 41 43 34 14 03 01 10|23 44",
  R: "04 00 30 41 32 02|22 44",
  S: "40 10 01 12 32 43 34 04",
  T: "00 40|20 24",
  U: "00 03 14 34 43 40",
  V: "00 24 40",
  W: "00 14 22 34 40",
  X: "00 44|40 04",
  Y: "00 22 40|22 24",
  Z: "00 40 04 44",
  0: "10 30 41 43 34 14 03 01 10|01 43",
  1: "11 20 24|14 34",
  2: "00 30 41 32 03 04 44",
  3: "00 30 41 22 43 34 04|12 22",
  4: "00 02 42|40 44",
  5: "40 00 02 32 43 34 04",
  6: "40 10 01 03 14 34 43 32 02",
  7: "00 40 14",
  8: "10 30 41 32 12 01 10|12 03 14 34 43 32",
  9: "42 12 01 10 30 41 43 34 04",
  "+": "02 42|20 24",
  "-": "02 42",
  ".": "24 25",
  ":": "21 21|23 23",
  "/": "04 40",
  " ": "",
  "×": "00 44|40 04",
  ">": "00 42 04",
  "<": "40 02 44",
};

function strokeVector(ctx, glow, dpr) {
  if (glow) {
    ctx.save();
    // Bloom under a separate crisp core. Canvas shadow blur uses backing pixels,
    // so scale its radius for Retina displays as well as the vector geometry.
    ctx.lineWidth *= 2.5;
    ctx.strokeStyle = "rgba(197, 234, 217, 0.45)";
    ctx.shadowColor = "#c5ead9";
    ctx.shadowBlur = 6 * dpr;
    ctx.stroke();
    ctx.restore();
  }
  ctx.stroke();
}

export function strokeText(
  ctx,
  text,
  x,
  y,
  height,
  align = "left",
  glow = false,
  dpr = 1,
) {
  const cell = height / 4;
  const spacing = cell * 6;
  const total = text.length * spacing - cell * 2;
  let origin =
    x - (align === "center" ? total / 2 : align === "right" ? total : 0);
  ctx.beginPath();
  for (const char of String(text).toUpperCase()) {
    for (const path of (GLYPHS[char] || "").split("|")) {
      const points = path.split(" ").filter(Boolean);
      points.forEach((point, i) => {
        const px = origin + Number(point[0]) * cell,
          py = y + Number(point[1]) * cell;
        if (!i) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
    }
    origin += spacing;
  }
  strokeVector(ctx, glow, dpr);
}

const SHIP_PATHS = [
  [
    [-5, -10],
    [5, -10],
    [8, -5],
    [5, 0],
    [-5, 0],
    [-8, -5],
    [-5, -10],
  ],
  [
    [-6, 0],
    [6, 0],
    [7, 5],
    [-7, 5],
    [-6, 0],
  ],
  [
    [-6, 2],
    [-9, 11],
    [-9, 11],
  ],
  [
    [6, 2],
    [9, 11],
    [9, 11],
  ],
  [
    [-3, 5],
    [-5, 8],
    [5, 8],
    [3, 5],
  ],
];

export class VectorRenderer {
  static id = "vector";
  static label = "Classic vector";
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = 1;
    this.height = 1;
    this.glow = true;
  }
  resize(width, height, dpr = 1) {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(2, dpr);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
  }
  render(game, { now = 0, paused = false } = {}) {
    const ctx = this.ctx,
      w = this.width,
      h = this.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#e4eee9";
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = 0;
    const sameMission =
      this.cameraMission === game.mission &&
      this.cameraTerrainSeed === game.terrainSeed;
    const previous = sameMission ? this.camera : null;
    const cam = computeCamera(game, w, h, previous);
    this.camera = cam;
    this.cameraMission = game.mission;
    this.cameraTerrainSeed = game.terrainSeed;
    const project = (x, y) => [
      (x - cam.x) * cam.scale + w / 2,
      (y - cam.y) * cam.scale + h / 2,
    ];
    ctx.save();
    // The terrain remains a continuous, unfilled chain of vectors.
    ctx.beginPath();
    for (const offset of [-WORLD_WIDTH, 0, WORLD_WIDTH]) {
      game.terrain.forEach((p, i) => {
        const [x, y] = project(p.x + offset, p.y);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
    }
    strokeVector(ctx, this.glow, this.dpr);
    for (const pad of game.pads) {
      const [x, y] = project((pad.x1 + pad.x2) / 2, pad.y);
      if (x < -40 || x > w + 40 || y < -40 || y > h + 40) continue;
      ctx.lineWidth = 1.5;
      const a = project(pad.x1, pad.y),
        b = project(pad.x2, pad.y);
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.lineTo(...b);
      strokeVector(ctx, this.glow, this.dpr);
      ctx.lineWidth = 0.9;
      strokeText(
        ctx,
        `${pad.multiplier}X`,
        x,
        y + 14,
        9,
        "center",
        this.glow,
        this.dpr,
      );
    }
    const [sx, sy] = project(game.ship.x, game.ship.y);
    const shipScale = Math.max(0.72, cam.scale);
    if (game.result?.kind === "crash" && game.phase !== "flying") {
      const age = game.resultTime || 0;
      if (age < 2.5) {
        for (let i = 0; i < 12; i++) {
          const angle = i * 2.399,
            speed = 18 + (i % 4) * 14;
          const x = sx + Math.cos(angle) * age * speed,
            y = sy + Math.sin(angle) * age * speed + age * age * 12;
          ctx.globalAlpha = Math.max(0, 1 - age / 2.5);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(
            x + Math.cos(angle + age) * 8,
            y + Math.sin(angle + age) * 8,
          );
          strokeVector(ctx, this.glow, this.dpr);
        }
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.translate(sx, sy);
      ctx.rotate(game.ship.angle);
      ctx.scale(shipScale, shipScale);
      ctx.lineWidth = 1 / shipScale;
      ctx.beginPath();
      for (const path of SHIP_PATHS)
        path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      strokeVector(ctx, this.glow, this.dpr);
      const thrust = game.ship.throttle || 0;
      if (thrust > 0 && game.phase === "flying" && !paused) {
        const flame =
          9 + thrust * 19 + (Math.sin(now * 43) + Math.sin(now * 71)) * 3;
        ctx.beginPath();
        ctx.moveTo(-4, 8);
        ctx.lineTo(-2, flame);
        ctx.lineTo(0, flame + 5);
        ctx.lineTo(3, flame - 3);
        ctx.lineTo(4, 8);
        strokeVector(ctx, this.glow, this.dpr);
      }
    }
    ctx.restore();
    if (cam.zoom > 1.05) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#82938b";
      const miniWidth = Math.min(160, w * 0.22),
        miniHeight = miniWidth / 1.6,
        mx = w - miniWidth - 18,
        my = h - miniHeight - 18;
      ctx.save();
      ctx.strokeStyle = "#52615a";
      ctx.lineWidth = 0.7;
      ctx.strokeRect(mx, my, miniWidth, miniHeight);
      ctx.beginPath();
      game.terrain.forEach((p, i) => {
        const x = mx + (p.x / 1600) * miniWidth,
          y = my + (p.y / 1000) * miniHeight;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
      ctx.strokeStyle = "#d5e2db";
      const px = mx + (game.ship.x / 1600) * miniWidth,
        py = my + (game.ship.y / 1000) * miniHeight;
      ctx.strokeRect(px - 2, py - 2, 4, 4);
      ctx.restore();
    }
  }
  dispose() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
