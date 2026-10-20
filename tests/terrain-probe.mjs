import { generateTerrain } from "../src/terrain.js";
let min = Infinity,
  max = 0,
  reliefMin = Infinity;
const seen = new Set();
for (let seed = 0; seed < 1000; seed++) {
  const { terrain } = generateTerrain(seed);
  min = Math.min(min, terrain.length);
  max = Math.max(max, terrain.length);
  const heights = terrain.map((p) => p.y);
  reliefMin = Math.min(reliefMin, Math.max(...heights) - Math.min(...heights));
  seen.add(JSON.stringify(terrain));
}
console.log({
  minVertices: min,
  maxVertices: max,
  minimumRelief: reliefMin,
  distinctMaps: seen.size,
});
