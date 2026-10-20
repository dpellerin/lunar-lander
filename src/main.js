import "./style.css";
import {
  createGame,
  startGame,
  stepGame,
  nextMission,
  setDifficulty,
  abortGame,
  altitude,
  DIFFICULTIES,
} from "./engine.js";
import { VectorRenderer } from "./renderers/vector.js";
import {
  registerRenderer,
  createRenderer,
  renderers,
} from "./renderers/index.js";
import { ArcadeAudio } from "./audio.js";
import { GamepadInput } from "./gamepad.js";

registerRenderer(VectorRenderer);
const game = createGame();
const audio = new ArcadeAudio();
const controller = new GamepadInput();
let controllerState = controller.state;
let controllerSoundAttempted = false;
let renderer,
  paused = false,
  helpOpen = false,
  accumulator = 0,
  lastTime = 0,
  previousPhase = game.phase,
  highScore = 0;
try {
  highScore = Number(localStorage.getItem("lunar-best")) || 0;
} catch {
  /* Private browsing can deny storage. */
}
const keys = new Set(),
  touch = { rotate: 0, thrust: 0 };
let throttle = 0.65;

const app = document.querySelector("#app");
app.innerHTML = `
  <header class="masthead">
    <div class="identity"><span class="insignia" aria-hidden="true">⌁</span><div><h1>LUNAR LANDER</h1><p>FLIGHT CONSOLE <span>/</span> 1979</p></div></div>
    <div class="header-actions"><button id="preferences-button" class="utility" aria-label="Preferences" title="Preferences (?)">⚙</button><button id="fullscreen-button" class="utility" aria-label="Enter fullscreen" title="Enter fullscreen"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path id="fullscreen-icon" d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/></svg></button></div>
  </header>
  <section id="cockpit" aria-label="Lunar flight simulator">
    <div class="screen-top"><span id="mission-label">MISSION 01</span></div>
    <div id="flight-screen">
      <canvas id="game-canvas" role="img" aria-label="White vector lunar terrain and lander. Flight telemetry is listed above the terrain."></canvas>
      <div class="telemetry telemetry-left" aria-label="Mission telemetry">
        <div><span>SCORE</span><strong id="score-value">00000</strong></div>
        <div><span>TIME</span><strong id="time-value">000</strong></div>
        <div><span>FUEL</span><strong id="fuel-value">0750</strong></div>
      </div>
      <div class="telemetry telemetry-right" aria-label="Flight telemetry">
        <div><span>ALTITUDE</span><strong id="altitude-value">0000</strong></div>
        <div><span>HORIZONTAL SPEED</span><strong id="horizontal-value">00 →</strong></div>
        <div><span>VERTICAL SPEED</span><strong id="vertical-value">00 ↓</strong></div>
      </div>
      <div id="flight-overlay" class="flight-overlay">
        <div class="overlay-eyebrow" hidden></div>
        <h2 id="overlay-title">LUNAR LANDER</h2>
        <p id="overlay-message" hidden></p>
        <button id="launch-button" class="launch-button" aria-label="Launch mission">LAUNCH MISSION <span>↵</span></button>
        <p id="overlay-hint" class="overlay-hint">PRESS ENTER TO BEGIN</p>
      </div>
      <div id="fuel-alert" class="fuel-alert" hidden>LOW FUEL</div>
      <div id="event-announcement" class="sr-only" role="status" aria-live="polite"></div>
      <div class="screen-corner top-left"></div><div class="screen-corner top-right"></div><div class="screen-corner bottom-left"></div><div class="screen-corner bottom-right"></div>
    </div>

  </section>
  <section class="control-deck" aria-label="Flight controls">
    <div class="mission-controls"><div class="panel-label"><span>01</span> SELECT MISSION</div><div class="difficulty-options" role="group" aria-label="Mission difficulty">${DIFFICULTIES.map((d, i) => `<button data-difficulty="${d.id}" aria-pressed="${i === 0}" title="${d.description}"><span class="level-number">${i + 1}</span>${d.name}</button>`).join("")}</div><p id="difficulty-description">${DIFFICULTIES[0].description}</p></div>
    <div class="pilot-controls">
      <div class="panel-label"><span>02</span> FLIGHT CONTROLS</div>
      <div class="input-guides">
        <div id="keyboard-controls">
          <div id="keyboard-guide" class="key-guide"><span><kbd>←</kbd><kbd>→</kbd><label>ROTATE</label></span><span><kbd class="wide-key">SPACE</kbd><label>THRUST</label></span><span><kbd>A</kbd><label>ABORT</label></span><span><kbd>P</kbd><label>PAUSE</label></span></div>
          <span id="controller-status" role="status" aria-live="polite">CONTROLLER · Any button connects</span>
        </div>
        <div id="gamepad-guide" class="key-guide" hidden><span><kbd class="wide-key">STICK</kbd><label>ROTATE</label></span><span><kbd>RT</kbd><label>THRUST</label></span><span><kbd>A</kbd><label>START/NEXT</label></span><span><kbd>B</kbd><label>ABORT</label></span><span><kbd>Y</kbd><label>PREFS</label></span><span><kbd>≡</kbd><label>PAUSE</label></span></div>
      </div>
    </div>
    <div class="thrust-controls"><div class="panel-label"><span>03</span> <span id="thrust-heading">KEYBOARD THRUST</span><span class="thrust-value"><output id="throttle-label">65%</output><output id="controller-percent" hidden>0%</output></span></div><div class="throttle-row"><input id="throttle" aria-label="Thrust power" type="range" min="10" max="100" value="65" step="5"><div id="controller-thrust" hidden><meter id="controller-meter" aria-label="Right trigger thrust" min="0" max="1" value="0">0%</meter></div></div></div>
  </section>
  <div class="touch-controls" aria-label="Touch flight controls"><button data-touch="left" aria-label="Rotate left">↶</button><button data-touch="right" aria-label="Rotate right">↷</button><button data-touch="thrust" aria-label="Fire thruster">THRUST</button><button id="touch-abort">ABORT</button></div>

  <dialog id="preferences" aria-labelledby="preferences-title"><div class="manual-heading"><h2 id="preferences-title">Preferences</h2><button id="close-preferences" class="utility" aria-label="Close preferences">×</button></div><div class="preference-settings"><label><input type="checkbox" id="sound-toggle" checked> SOUND</label><label><input type="checkbox" id="glow-toggle" checked> VECTOR GLOW</label><label class="graphics-label">GRAPHICS <select id="graphics-mode" aria-label="Graphics mode">${[...renderers].map(([id, R]) => `<option value="${id}">${R.label}</option>`).join("")}</select></label><button id="controller-enable" class="utility text-utility" hidden>ENABLE SOUND</button></div><details class="flight-manual">
      <summary>CONTROLS & SCORING</summary>
      <table class="reference-table controls-table" aria-label="Keyboard and controller controls">
        <colgroup><col style="width:34%"><col style="width:28%"><col style="width:38%"></colgroup>
        <thead><tr><th scope="col">ACTION</th><th scope="col">KEYBOARD</th><th scope="col">CONTROLLER</th></tr></thead>
        <tbody>
          <tr><th scope="row">Launch / next</th><td>Enter</td><td>A</td></tr>
          <tr><th scope="row">Rotate</th><td>← / →</td><td>Left stick / D-pad</td></tr>
          <tr><th scope="row">Thrust</th><td>Space</td><td>RT</td></tr>
          <tr><th scope="row">Full thrust</th><td>Shift + Space</td><td>RT fully pressed</td></tr>
          <tr><th scope="row">Adjust power</th><td>[ / ]</td><td>RT position</td></tr>
          <tr><th scope="row">Abort</th><td>A</td><td>B</td></tr>
          <tr><th scope="row">Pause / resume</th><td>P / Esc</td><td>Menu</td></tr>
          <tr><th scope="row">Preferences</th><td>?</td><td>Y</td></tr>
          <tr><th scope="row">Close preferences</th><td>Esc</td><td>B / Y</td></tr>
          <tr><th scope="row">Mute</th><td>M</td><td>—</td></tr>
          <tr><th scope="row">Fullscreen</th><td>F</td><td>—</td></tr>
        </tbody>
      </table>
      <h3 id="scoring-title">SCORING</h3>
      <table class="reference-table scoring-table" aria-labelledby="scoring-title">
        <colgroup><col style="width:34%"><col style="width:46%"><col style="width:20%"></colgroup>
        <thead><tr><th scope="col">RESULT</th><th scope="col">POINTS</th><th scope="col">FUEL</th></tr></thead>
        <tbody>
          <tr><th scope="row">Soft landing</th><td>50 × pad bonus</td><td>+50</td></tr>
          <tr><th scope="row">Hard landing</th><td>15 × pad bonus</td><td>—</td></tr>
          <tr><th scope="row">Crash</th><td>5</td><td>—</td></tr>
        </tbody>
      </table>
    </details></dialog>
`;

const $ = (selector) => document.querySelector(selector);
const canvas = $("#game-canvas"),
  screen = $("#flight-screen");
renderer = createRenderer("vector", canvas);
function resize() {
  const { width, height } = screen.getBoundingClientRect();
  renderer.resize(width, height, window.devicePixelRatio || 1);
  renderer.render(game, { now: performance.now() / 1000, paused });
}
new ResizeObserver(resize).observe(screen);
window.addEventListener("resize", resize);

function announce(message) {
  $("#event-announcement").textContent = message;
}
function unlock() {
  audio.unlock().catch(() => {
    announce("Sound is unavailable. Flight controls remain active.");
  });
}
function suspendController() {
  controller.suspend();
  controllerState.ready = false;
  controllerState.thrust = 0;
  controllerState.rotate = 0;
  controllerState.actions = [];
}
function clearInput() {
  keys.clear();
  touch.rotate = 0;
  touch.thrust = 0;
}
function launch() {
  unlock();
  if (game.phase === "ready") startGame(game);
  else if (game.phase === "result") nextMission(game);
  else if (game.phase === "gameover") {
    startGame(game);
    paused = false;
  } else if (game.phase === "flying") {
    togglePause();
    return;
  }
  clearInput();
  accumulator = 0;
  updateUI();
}
function togglePause() {
  if (game.phase !== "flying") return;
  paused = !paused;
  if (paused) suspendController();
  clearInput();
  updateUI();
}
function showPreferences() {
  helpOpen = true;
  suspendController();
  clearInput();
  $("#preferences").showModal();
  audio.update(0, false, false);
}
function closePreferences() {
  $("#preferences").close();
  helpOpen = false;
  suspendController();
  lastTime = performance.now() / 1000;
  clearInput();
}
function fullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else
    document.documentElement
      .requestFullscreen?.()
      .catch(() => announce("Fullscreen is not available in this browser."));
}
function mute() {
  audio.setMuted(!audio.muted);
  $("#sound-toggle").checked = !audio.muted;
}
function setThrottle(value) {
  throttle = Math.max(0.1, Math.min(1, value));
  $("#throttle").value = String(Math.round(throttle * 100));
  $("#throttle-label").value = `${Math.round(throttle * 100)}%`;
}
$("#launch-button").addEventListener("click", launch);
$("#preferences-button").addEventListener("click", showPreferences);
$("#close-preferences").addEventListener("click", closePreferences);
$("#preferences").addEventListener("cancel", (event) => {
  event.preventDefault();
  closePreferences();
});
$("#sound-toggle").addEventListener("change", (event) => {
  unlock();
  audio.setMuted(!event.target.checked);
});
$("#fullscreen-button").addEventListener("click", fullscreen);
$("#controller-enable").addEventListener("click", unlock);
canvas.addEventListener("pointerdown", unlock);
$("#throttle").addEventListener("input", (event) =>
  setThrottle(Number(event.target.value) / 100),
);
$("#glow-toggle").addEventListener("change", (event) => {
  renderer.glow = event.target.checked;
});
$("#graphics-mode").addEventListener("change", (event) => {
  renderer.dispose();
  renderer = createRenderer(event.target.value, canvas);
  renderer.glow = $("#glow-toggle").checked;
  resize();
});
for (const button of document.querySelectorAll("[data-difficulty]"))
  button.addEventListener("click", () => {
    setDifficulty(game, button.dataset.difficulty);
    for (const b of document.querySelectorAll("[data-difficulty]"))
      b.setAttribute("aria-pressed", String(b === button));
    $("#difficulty-description").textContent = DIFFICULTIES.find(
      (d) => d.id === game.difficulty,
    ).description;
  });

// Throttle uses the same live keyboard shortcuts after pointer adjustment.
$("#throttle").addEventListener("pointerup", (event) => event.target.blur());
$("#graphics-mode").addEventListener("change", (event) => event.target.blur());
for (const button of document.querySelectorAll("button"))
  button.addEventListener("pointerup", () => button.blur());

const gameKeys = new Set([
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "KeyA",
  "KeyP",
  "KeyM",
  "KeyF",
  "Enter",
  "Escape",
  "BracketLeft",
  "BracketRight",
  "ShiftLeft",
  "ShiftRight",
]);
window.addEventListener("keydown", (event) => {
  const tag = document.activeElement?.tagName;
  if (helpOpen) return;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
  if (gameKeys.has(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === "Enter") launch();
  if (event.code === "KeyP" || event.code === "Escape") togglePause();
  if (event.code === "KeyA" && !paused) {
    unlock();
    abortGame(game);
  }
  if (event.code === "KeyM") mute();
  if (event.code === "KeyF") fullscreen();
  if (event.code === "BracketLeft") setThrottle(throttle - 0.05);
  if (event.code === "BracketRight") setThrottle(throttle + 0.05);
  if (event.key === "?") {
    event.preventDefault();
    showPreferences();
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => {
  clearInput();
  suspendController();
  if (game.phase === "flying") {
    paused = true;
    updateUI();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearInput();
    suspendController();
    if (game.phase === "flying") paused = true;
  }
  lastTime = 0;
});
document.addEventListener("fullscreenchange", () => {
  $("#fullscreen-icon").setAttribute(
    "d",
    document.fullscreenElement
      ? "M3 8h5V3M16 3v5h5M21 16h-5v5M8 21v-5H3"
      : "M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5",
  );
  $("#fullscreen-button").title = document.fullscreenElement
    ? "Exit fullscreen"
    : "Enter fullscreen";
  $("#fullscreen-button").setAttribute(
    "aria-label",
    document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen",
  );
});

for (const button of document.querySelectorAll("[data-touch]")) {
  const control = button.dataset.touch;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    unlock();
    if (control === "thrust") touch.thrust = 1;
    else touch.rotate = control === "left" ? -1 : 1;
  });
  const release = () => {
    if (control === "thrust") touch.thrust = 0;
    else touch.rotate = 0;
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}
$("#touch-abort").addEventListener("click", () => {
  if (!paused) {
    unlock();
    abortGame(game);
  }
});

const pad = (value, length) =>
  String(Math.max(0, Math.floor(value))).padStart(length, "0");
function updateUI() {
  updateControllerUI();
  const flying = game.phase === "flying";
  $("#score-value").textContent = pad(game.score, 5);
  $("#time-value").textContent = pad(game.time, 3);
  $("#fuel-value").textContent = pad(game.fuel, 4);
  $("#altitude-value").textContent = pad(altitude(game), 4);
  $("#horizontal-value").textContent =
    `${pad(Math.abs(game.ship.vx), 2)} ${game.ship.vx < 0 ? "←" : "→"}`;
  $("#vertical-value").textContent =
    `${pad(Math.abs(game.ship.vy), 2)} ${game.ship.vy < 0 ? "↑" : "↓"}`;
  $("#mission-label").textContent = `MISSION ${pad(game.mission, 2)}`;
  $("#cockpit").dataset.phase = game.phase;
  $("#fuel-alert").hidden = !(flying && game.fuel < 100);
  $("#fuel-alert").textContent = game.fuel <= 0 ? "FUEL DEPLETED" : "LOW FUEL";
  $("#fuel-value").classList.toggle("warning", game.fuel < 100);
  const finished = game.phase === "result" || game.phase === "gameover";
  const overlay = $("#flight-overlay");
  overlay.classList.toggle("round-result", finished);
  overlay.hidden = flying && !paused;
  const controllerConnected = Boolean(controllerState.supported);
  $(".overlay-eyebrow").hidden = game.phase === "ready";
  $("#overlay-message").hidden = game.phase === "ready";
  if (game.phase === "ready") {
    $("#overlay-hint").textContent = controllerConnected
      ? "PRESS A TO BEGIN"
      : "PRESS ENTER TO BEGIN";
    $("#launch-button span").textContent = controllerConnected ? "A" : "↵";
    return;
  }
  const title = $("#overlay-title"),
    message = $("#overlay-message"),
    button = $("#launch-button"),
    hint = $("#overlay-hint");
  $(".overlay-eyebrow").textContent =
    paused && flying
      ? "FLIGHT ON HOLD"
      : game.phase === "gameover"
        ? "FUEL SUPPLY EXHAUSTED"
        : `MISSION ${pad(game.mission, 2)} / ${game.result?.kind === "crash" ? "SURFACE IMPACT" : "TOUCHDOWN"}`;
  if (paused && flying) {
    title.textContent = "FLIGHT PAUSED";
    message.textContent = "Take a breath. The Moon can wait.";
    button.innerHTML = "RESUME FLIGHT <span>↵</span>";
    button.setAttribute("aria-label", "Resume flight");
    hint.textContent = controllerConnected
      ? "MENU OR A TO RESUME"
      : "P OR ENTER TO RESUME";
  } else if (game.phase === "gameover") {
    title.textContent = "END OF MISSION";
    message.textContent = `${game.score} POINTS · ${Math.floor(game.time)} SECONDS IN FLIGHT`;
    button.innerHTML = "NEW GAME <span>↵</span>";
    button.setAttribute("aria-label", "New game");
    hint.textContent = controllerConnected
      ? "PRESS A TO START AGAIN"
      : "PRESS ENTER TO START AGAIN";
  } else if (game.phase === "result") {
    title.textContent = game.result.message;
    message.textContent = `+${game.result.points} POINTS${game.result.fuel ? " · +50 FUEL UNITS" : ""}`;
    button.innerHTML = "NEXT MISSION <span>↵</span>";
    button.setAttribute("aria-label", "Next mission");
    hint.textContent = controllerConnected
      ? "PRESS A TO FLY AGAIN"
      : "PRESS ENTER TO FLY AGAIN";
  }
  button.querySelector("span").textContent = controllerConnected ? "A" : "↵";
  if (game.score > highScore) {
    highScore = game.score;
    try {
      localStorage.setItem("lunar-best", String(highScore));
    } catch {
      /* Storage is optional. */
    }
  }
}

function updateControllerUI() {
  const state = controllerState;
  let status;
  if (!state.available)
    status =
      "Controller input unavailable here. Open the game in Safari or Chrome.";
  else if (!state.connected)
    status =
      game.phase === "ready"
        ? "CONTROLLER · Any button connects"
        : "CONTROLLER · Press A to connect";
  else if (!state.supported)
    status = "Controller detected · This controller layout is not supported.";
  else if (!state.enabled)
    status =
      "Controller connected · Return to the game tab to enable controls.";
  else if (!state.ready)
    status =
      "Controller connected · Release the stick, trigger and buttons to continue.";
  else
    status =
      game.phase === "ready"
        ? "CONTROLLER READY · A to start"
        : "CONTROLLER CONNECTED";
  if ($("#controller-status").textContent !== status)
    $("#controller-status").textContent = status;
  $("#controller-status").title = status;
  $("#keyboard-controls").hidden = Boolean(state.supported);
  $("#keyboard-guide").hidden = Boolean(state.supported);
  $("#gamepad-guide").hidden = !state.supported;
  $("#throttle").hidden = Boolean(state.supported);
  $("#throttle-label").hidden = Boolean(state.supported);
  $("#controller-percent").hidden = !state.supported;
  $("#thrust-heading").textContent = state.supported
    ? "CONTROLLER THRUST"
    : "KEYBOARD THRUST";
  $("#controller-thrust").hidden = !state.supported;
  $("#controller-meter").value = state.thrust;
  $("#controller-percent").value = `${Math.round(state.thrust * 100)}%`;
  $("#controller-enable").hidden =
    !state.supported || audio.muted || audio.context?.state === "running";
}

function pollController() {
  let pads = [],
    available = typeof navigator.getGamepads === "function";
  try {
    if (available) pads = navigator.getGamepads();
  } catch {
    available = false;
  }
  const wasConnected = controllerState.supported;
  controllerState = controller.poll(pads, {
    available,
    // Embedded webviews may leave keyboard focus in the surrounding chat.
    // Controller intent belongs to the visible game; blur still pauses flight.
    enabled: !document.hidden,
  });
  if (!wasConnected && controllerState.supported)
    controllerSoundAttempted = false;
  if (controllerState.disconnected && game.phase === "flying") {
    paused = true;
    accumulator = 0;
    clearInput();
    suspendController();
    controllerState.thrust = 0;
    controllerState.rotate = 0;
    controllerState.actions = [];
    announce("Controller disconnected. Flight paused.");
    updateUI();
  }
  if (
    !controllerSoundAttempted &&
    (controllerState.actions.length ||
      controllerState.thrust ||
      controllerState.rotate)
  ) {
    controllerSoundAttempted = true;
    unlock();
  }
  for (const action of controllerState.actions) {
    if (helpOpen) {
      if (action === "manual" || action === "abort" || action === "pause")
        closePreferences();
      continue;
    }
    if (action === "launch" && (game.phase !== "flying" || paused)) launch();
    else if (action === "pause") {
      if (game.phase === "flying") togglePause();
      else launch();
    } else if (action === "manual") showPreferences();
    else if (action === "abort" && !paused) abortGame(game);
  }
}

let uiTimer = 0;
function frame(timestamp) {
  pollController();
  const now = timestamp / 1000;
  const elapsed = lastTime ? Math.min(0.1, Math.max(0, now - lastTime)) : 0;
  lastTime = now;
  if (!paused && !helpOpen) {
    accumulator += elapsed;
    const input = {
      rotate:
        touch.rotate ||
        controllerState.rotate ||
        (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0),
      thrust: Math.max(
        controllerState.thrust,
        touch.thrust || keys.has("Space")
          ? keys.has("ShiftLeft") || keys.has("ShiftRight")
            ? 1
            : throttle
          : 0,
      ),
    };
    while (accumulator >= 1 / 120) {
      stepGame(game, input, 1 / 120);
      accumulator -= 1 / 120;
    }
  } else accumulator = 0;
  if (game.phase !== previousPhase) {
    if (game.result && (game.phase === "result" || game.phase === "gameover")) {
      if (game.result.kind === "crash") audio.crash();
      announce(`${game.result.message}. ${game.result.points} points.`);
      clearInput();
      suspendController();
    }
    previousPhase = game.phase;
    updateUI();
  }
  audio.update(
    game.ship.throttle || 0,
    game.fuel < 100,
    game.phase === "flying" && !paused && !helpOpen,
  );
  renderer.render(game, { now, paused: paused || helpOpen });
  uiTimer += elapsed;
  if (uiTimer > 0.08) {
    uiTimer = 0;
    updateUI();
  }
  requestAnimationFrame(frame);
}
updateUI();
resize();
requestAnimationFrame(frame);

// Read-only diagnostics for deterministic browser QA; simulation state stays private.
if (import.meta.env.DEV)
  Object.defineProperty(window, "lunarDiagnostics", {
    value: () => ({
      phase: game.phase,
      fuel: game.fuel,
      score: game.score,
      difficulty: game.difficulty,
      paused,
      result: game.result ? { ...game.result } : null,
      resultTime: game.resultTime,
      landingBounce: game.landingBounce ? { ...game.landingBounce } : null,
      controller: { ...controllerState, actions: [...controllerState.actions] },
      ship: { ...game.ship },
      camera: { ...renderer.camera },
      sound: audio.context?.state || "locked",
      canvas: { width: canvas.width, height: canvas.height },
      mission: game.mission,
      terrainSeed: game.terrainSeed,
      terrain: game.terrain.map((point) => ({ ...point })),
      pads: game.pads.map((pad) => ({ ...pad })),
    }),
  });
