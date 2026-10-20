// Seeded maps stay fixed during a round; only the next mission changes the seed.
function randomSource(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = Math.imul(state ^ (state >>> 15), 1 | state);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

const WORLD_WIDTH = 1600;

// Fractured faces get detail at several scales. Subdivision follows the length
// of the vector, including steep walls, rather than just its horizontal span.
// Each point belongs to the final polyline; there is no spline or curve render.
function rockyFace(a, b, range) {
  const points = [];
  const initial = Math.hypot(b.x - a.x, b.y - a.y) * 0.13;
  const split = (left, right, amplitude, depth) => {
    const dx = right.x - left.x,
      dy = right.y - left.y;
    const length = Math.hypot(dx, dy);
    if (length <= range(20, 34) || depth >= 10) return;
    const t = range(0.42, 0.58);
    const x = left.x + dx * t,
      y = left.y + dy * t;
    const nx = -dy / length,
      ny = dx / length;
    let offset = range(-amplitude, amplitude);
    // Perturb perpendicular to the face so steep walls get rock detail too.
    // Bound the displacement to preserve a single-valued collision skyline.
    if (Math.abs(nx) > 1e-9) {
      const limits = [
        (left.x + dx * 0.14 - x) / nx,
        (right.x - dx * 0.14 - x) / nx,
      ].sort((a, b) => a - b);
      offset = Math.max(limits[0], Math.min(limits[1], offset));
    }
    const room = offset < 0 ? y - 312 : 938 - y;
    offset = Math.sign(offset) * Math.min(Math.abs(offset), (room * 0.8) / ny);
    const mid = {
      x: x + nx * offset,
      y: y + ny * offset,
    };
    split(left, mid, amplitude * 0.6, depth + 1);
    points.push(mid);
    split(mid, right, amplitude * 0.6, depth + 1);
  };
  split(a, b, initial, 0);
  return points;
}

// Unmarked high and low ground has its own width. Unequal shoulders and several
// slightly tilted floor/crest facets avoid a single geometric apex or V-bottom.
function landform(feature, leftRoom, rightRoom, range) {
  const valley = feature.kind === "valley";
  const left = Math.min(
    range(valley ? 48 : 30, valley ? 84 : 60),
    Math.max(valley ? 32 : 0, leftRoom * (valley ? 0.24 : 0.22)),
    leftRoom * 0.42,
  );
  const right = Math.min(
    range(valley ? 48 : 30, valley ? 84 : 60),
    Math.max(valley ? 32 : 0, rightRoom * (valley ? 0.24 : 0.22)),
    rightRoom * 0.42,
  );
  const direction = valley ? -1 : 1;
  const innerLeft = left * range(0.32, 0.58);
  const innerRight = right * range(0.3, 0.6);
  return [
    { x: feature.x - left, y: feature.y + direction * left * range(0.35, 0.8) },
    {
      x: feature.x - innerLeft,
      y: feature.y + direction * innerLeft * range(0.08, 0.18),
    },
    feature,
    {
      x: feature.x + innerRight,
      y: feature.y + direction * innerRight * range(0.08, 0.18),
    },
    {
      x: feature.x + right,
      y: feature.y + direction * right * range(0.35, 0.8),
    },
  ];
}

// Clip acute turns with short, unequal straight bevels. This addresses small
// notches created by the rock detail as well as sharp tips. Pad edges stay exact.
function bevelNotches(points, pads, range) {
  const protectedX = new Set(pads.flatMap((p) => [p.x1, p.x2]));
  return points.flatMap((p, i) => {
    const a = points[i - 1],
      b = points[i + 1];
    if (!a || !b || protectedX.has(p.x) || (a.y - p.y) * (b.y - p.y) <= 0)
      return [p];
    const turn = Math.abs(
      Math.atan2(b.y - p.y, b.x - p.x) - Math.atan2(p.y - a.y, p.x - a.x),
    );
    if (turn <= 0.7) return [p];
    const left = range(0.22, 0.36),
      right = range(0.22, 0.36);
    return [
      { x: p.x + (a.x - p.x) * left, y: p.y + (a.y - p.y) * left },
      { x: p.x + (b.x - p.x) * right, y: p.y + (b.y - p.y) * right },
    ];
  });
}

export function generateTerrain(seed) {
  const random = randomSource(seed);
  const range = (a, b) => a + (b - a) * random();
  const pick = (items) => items[Math.floor(random() * items.length)];

  // Broad, unequal mountain masses, with lower ridges between the major peaks.
  // Pads are chosen from their features;
  // they do not each force a separate bowl with a pair of identical cliffs.
  const mountainCount = random() < 0.5 ? 3 : 4;
  const dominant = Math.floor(random() * mountainCount);
  const weights = Array.from({ length: mountainCount }, (_, i) =>
    i === dominant ? range(1.7, 2.3) : range(0.75, 1.1),
  );
  const total = weights.reduce((sum, n) => sum + n, 0);
  const features = [];
  const floors = Array.from({ length: mountainCount }, () => range(820, 920));
  let x = range(170, 240);
  for (let i = 0; i < mountainCount; i++) {
    const width = (WORLD_WIDTH * weights[i]) / total;
    const floor = (floors[i] + floors[(i + 1) % mountainCount]) / 2;
    const relief = i === dominant ? range(430, 530) : width * range(0.38, 0.65);
    features.push({ x, y: floors[i], kind: "valley" });
    features.push({
      x: x + width * range(0.42, 0.6),
      y: Math.max(350, floor - relief),
      kind: "summit",
    });
    x += width;
  }

  const widths = [
    [104, 128],
    [78, 96],
    [54, 70],
    [36, 46],
  ];
  const sites = [features[0]];
  const otherValley = pick(
    features.filter((p, i) => p.kind === "valley" && i > 0 && p.x < 1500),
  );
  const summit = pick(
    features.filter((p) => p.kind === "summit" && p.x < 1500),
  );
  // Vary which bonus belongs to the summit versus the second valley.
  sites.push(
    ...(random() < 0.5 ? [summit, otherValley] : [otherValley, summit]),
  );
  const pads = sites.map((site, i) => {
    const index = features.indexOf(site);
    const previous = features[(index + features.length - 1) % features.length];
    const next = features[(index + 1) % features.length];
    const leftGap = (site.x - previous.x + WORLD_WIDTH) % WORLD_WIDTH;
    const rightGap = (next.x - site.x + WORLD_WIDTH) % WORLD_WIDTH;
    const width = Math.min(
      range(...widths[i]),
      Math.min(leftGap, rightGap) * 0.8,
    );
    return {
      x1: site.x - width / 2,
      x2: site.x + width / 2,
      y: site.y,
      multiplier: i + 2,
    };
  });
  const nodes = features.flatMap((feature, i) => {
    const pad = pads[sites.indexOf(feature)];
    const previousFeature =
      features[(i + features.length - 1) % features.length];
    const nextFeature = features[(i + 1) % features.length];
    const previousPad = pads[sites.indexOf(previousFeature)];
    const nextPad = pads[sites.indexOf(nextFeature)];
    const previous =
      i > 0
        ? features[i - 1]
        : { ...features.at(-1), x: features.at(-1).x - WORLD_WIDTH };
    const next =
      i < features.length - 1
        ? features[i + 1]
        : { ...features[0], x: features[0].x + WORLD_WIDTH };
    const ownHalf = pad ? (pad.x2 - pad.x1) / 2 : 0;
    const leftRoom =
      feature.x -
      previous.x -
      ownHalf -
      (previousPad ? (previousPad.x2 - previousPad.x1) / 2 : 0);
    const rightRoom =
      next.x -
      feature.x -
      ownHalf -
      (nextPad ? (nextPad.x2 - nextPad.x1) / 2 : 0);
    if (!pad) return landform(feature, leftRoom, rightRoom, range);
    const left = Math.min(range(30, 65), leftRoom * 0.18);
    const right = Math.min(range(30, 65), rightRoom * 0.18);
    const direction = feature.kind === "valley" ? -1 : 1;
    return [
      { x: pad.x1 - left, y: pad.y + direction * left * range(0.3, 0.6) },
      { x: pad.x1, y: pad.y },
      { x: pad.x2, y: pad.y },
      { x: pad.x2 + right, y: pad.y + direction * right * range(0.3, 0.6) },
    ];
  });
  nodes.push({ ...nodes[0], x: nodes[0].x + WORLD_WIDTH });

  // The smallest site is a shelf partway along a face, with sloping ground on
  // either side. Pick a roomy face so the shelf cannot create a needle peak.
  const faces = nodes
    .slice(0, -1)
    .map((a, i) => ({ a, b: nodes[i + 1], i }))
    .filter(
      ({ a, b }) => b.y !== a.y && b.x - a.x > 60 && a.x > 60 && b.x < 1540,
    );
  const longest = Math.max(...faces.map(({ a, b }) => b.x - a.x));
  const face = pick(faces.filter(({ a, b }) => b.x - a.x >= longest * 0.85));
  const width = range(...widths[3]);
  const margin = width / 2 + Math.min(8, (face.b.x - face.a.x - width) / 4);
  const center = range(face.a.x + margin, face.b.x - margin);
  const t = (center - face.a.x) / (face.b.x - face.a.x);
  const y = face.a.y + (face.b.y - face.a.y) * t;
  const shelf = {
    x1: center - width / 2,
    x2: center + width / 2,
    y,
    multiplier: 5,
  };
  pads.push(shelf);
  nodes.splice(
    face.i + 1,
    0,
    { x: shelf.x1, y, kind: "shelf" },
    { x: shelf.x2, y, kind: "shelf" },
  );

  const fractured = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i],
      b = nodes[i + 1];
    fractured.push({ x: a.x, y: a.y });
    if (a.y !== b.y) fractured.push(...rockyFace(a, b, range));
  }
  fractured.push({ x: nodes.at(-1).x, y: nodes.at(-1).y });
  const cycle = bevelNotches(bevelNotches(fractured, pads, range), pads, range);

  // Cut the same periodic polyline at both world edges. Render and collision
  // consume these exact vertices, including the uninterrupted wraparound face.
  const right = cycle.findIndex((p) => p.x >= WORLD_WIDTH);
  const a = cycle[right - 1],
    b = cycle[right];
  const seam = a.y + ((b.y - a.y) * (WORLD_WIDTH - a.x)) / (b.x - a.x);
  const terrain = cycle
    .slice(0, -1)
    .map((p) => ({ x: p.x >= WORLD_WIDTH ? p.x - WORLD_WIDTH : p.x, y: p.y }))
    .filter((p) => p.x > 0 && p.x < WORLD_WIDTH)
    .sort((a, b) => a.x - b.x);
  terrain.unshift({ x: 0, y: seam });
  terrain.push({ x: WORLD_WIDTH, y: seam });
  return { terrain, pads };
}
