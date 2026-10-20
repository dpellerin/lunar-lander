import test from "node:test";
import assert from "node:assert/strict";
import { generateTerrain } from "../src/terrain.js";
import {
  createGame,
  startGame,
  stepGame,
  terrainY,
  nextMission,
} from "../src/engine.js";

test("rocky contours retain visible facets and broad basins across 1000 seeds", () => {
  for (let seed = 0; seed < 1000; seed++) {
    const { terrain: points, pads } = generateTerrain(seed);
    assert.ok(
      points.length >= 90 && points.length <= 240,
      `seed ${seed}: enough facets for rock detail without micro-curves`,
    );
    const lengths = [];
    let corners = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      if (a.y !== b.y) {
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        lengths.push(length);
        assert.ok(
          length <= 40,
          "steep walls have detail as well as the horizontal slopes",
        );
      }
      if (
        i === points.length - 1 ||
        pads.some((p) => p.x1 === b.x || p.x2 === b.x)
      )
        continue;
      const c = points[i + 1];
      const turn = Math.abs(
        Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x),
      );
      if (turn > 0.12) corners++;
      // Inspect a neighborhood, not just the angle at a single tiny vertex.
      // This catches a V-bottom that has merely been hidden by extra samples.
      if (a.y < b.y && c.y < b.y) {
        const leftRise = b.y - terrainY(points, b.x - 24);
        const rightRise = b.y - terrainY(points, b.x + 24);
        if (leftRise >= 15 && rightRise >= 15)
          assert.ok(
            Math.atan2(leftRise, 24) + Math.atan2(rightRise, 24) <= 1.4,
            `seed ${seed}: a deep valley needs a broad floor, not a V-notch`,
          );
      }
      if (a.y > b.y && c.y > b.y) {
        const leftDrop = terrainY(points, b.x - 24) - b.y;
        const rightDrop = terrainY(points, b.x + 24) - b.y;
        assert.ok(
          leftDrop < 30 || rightDrop < 30,
          `seed ${seed}: no tall needle crest in a narrow span`,
        );
      }
    }
    lengths.sort((a, b) => a - b);
    const median = lengths[Math.floor(lengths.length / 2)];
    assert.ok(
      median >= 10 && median <= 32,
      "straight facets stay visible rather than forming dense smooth curves",
    );
    assert.ok(
      corners >= points.length * 0.3,
      "rock faces have frequent, irregular changes of direction",
    );
  }
});

test("all generated pads have a clear vertical touchdown corridor", () => {
  for (let seed = 0; seed < 200; seed++)
    for (let i = 0; i < 4; i++) {
      const game = createGame({ seed });
      startGame(game);
      const pad = game.pads[i];
      Object.assign(game.ship, {
        x: (pad.x1 + pad.x2) / 2,
        y: pad.y - 11 - 0.01,
        vx: 0,
        vy: 5,
      });
      stepGame(game, {}, 1 / 120);
      assert.equal(game.result?.kind, "soft", `seed ${seed}, pad ${i}`);
      assert.equal(game.score, 50 * pad.multiplier);
    }
});

test("seeds are reproducible and successive rounds never reuse an earlier sampled landscape", () => {
  assert.deepEqual(generateTerrain(123), generateTerrain(123));
  const seen = new Set();
  // Cross the unsigned seed boundary and exercise the actual round lifecycle.
  const game = createGame({ seed: 0xfffffffe });
  for (let round = 0; round < 256; round++) {
    const signature = JSON.stringify(game.terrain);
    assert.ok(!seen.has(signature), `round ${round + 1} has a fresh landscape`);
    seen.add(signature);
    const preview = structuredClone(game.terrain);
    if (round === 0) startGame(game);
    stepGame(game, {}, 1 / 120);
    assert.deepEqual(
      game.terrain,
      preview,
      "the terrain stays fixed during flight",
    );
    game.phase = "result";
    nextMission(game);
  }
});

test("faceted geometry wraps seamlessly and preserves exact landing surfaces across 1000 seeds", () => {
  const seen = new Set();
  for (let seed = 0; seed < 1000; seed++) {
    const { terrain: points, pads } = generateTerrain(seed);
    const signature = JSON.stringify(points);
    assert.ok(!seen.has(signature), `seed ${seed} has distinct terrain`);
    seen.add(signature);
    assert.equal(points[0].x, 0);
    assert.equal(points.at(-1).x, 1600);
    assert.equal(points[0].y, points.at(-1).y);
    assert.deepEqual(
      pads.map((p) => p.multiplier),
      [2, 3, 4, 5],
    );
    const heights = points.map((p) => p.y);
    assert.ok(Math.max(...heights) - Math.min(...heights) >= 330);
    const firstSlope = (points[1].y - points[0].y) / points[1].x;
    const lastSlope =
      (points.at(-1).y - points.at(-2).y) / (1600 - points.at(-2).x);
    assert.ok(
      Math.abs(firstSlope - lastSlope) < 1e-8,
      "no artificial corner at the map seam",
    );
    for (let i = 1; i < points.length; i++) {
      assert.ok(
        points[i].x > points[i - 1].x,
        "strictly ordered collision skyline",
      );
      assert.ok(
        Number.isFinite(points[i].y) &&
          points[i].y >= 310 &&
          points[i].y <= 940,
      );
      if (points[i].y === points[i - 1].y)
        assert.ok(
          pads.some((p) => p.x1 === points[i - 1].x && p.x2 === points[i].x),
          "only designated pads are flat",
        );
    }
    for (const pad of pads) {
      const first = points.findIndex((p) => p.x === pad.x1);
      assert.ok(first > 0);
      assert.equal(points[first + 1].x, pad.x2);
      assert.equal(points[first].y, pad.y);
      assert.equal(points[first + 1].y, pad.y);
      assert.notEqual(
        points[first - 1].y,
        pad.y,
        "no unmarked flat extension to the left",
      );
      assert.notEqual(
        points[first + 2].y,
        pad.y,
        "no unmarked flat extension to the right",
      );
      assert.equal(terrainY(points, (pad.x1 + pad.x2) / 2), pad.y);
      assert.ok(
        pad.x2 - pad.x1 >= 36 && pad.x2 - pad.x1 <= 128,
        "both landing feet fit",
      );
    }
  }
});
