# Development

The game runs locally with Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

The development server prints its local address. `npm run build` creates the static site in `dist/`; `npm run preview` serves that build on port 4173.

## Checks

```sh
npm test
npx playwright install chromium webkit
npm run test:browser
```

To check a production build, run the preview server and `node tests/production-check.mjs`. Set `LUNAR_URL` to check a published copy instead.

The engine tests cover terrain, flight, landings, scoring, fuel and camera behavior. Browser tests cover keyboard/controller input, Preferences and responsive layouts in Chromium and WebKit. Controller tests use simulated gamepads; they do not establish that a physical controller is paired.

Capture scripts in `tests/` save local visual checks to `qa/` or `output/playwright/`. Generated captures and recordings are excluded from Git.

## Source

- `src/engine.js`: flight, collisions, fuel, scoring and round lifecycle.
- `src/terrain.js`: seeded landscapes made entirely from straight segments, with exact flat landing pads.
- `src/renderers/vector.js`: vector drawing, glow, overview and approach camera.
- `src/renderers/index.js`: graphics-mode registry.
- `src/audio.js`: synthesized arcade sounds.
- `src/gamepad.js`: controller polling, analog input and button handling.
- `src/main.js` and `src/style.css`: controls, Preferences and responsive interface.

Pass a seed to `createGame({ seed: 123 })` for a repeatable landscape. Normal play starts with a random seed and generates a new map each round.

## Publishing

GitHub Actions tests and builds pushes and pull requests to `main`. Successful pushes to `main` deploy `dist/` to GitHub Pages. Pull requests only run checks. The Vite base path is relative, so the build works under the repository's Pages address.

See [fidelity notes](FIDELITY.md) for references and deliberate differences from the original arcade game.
