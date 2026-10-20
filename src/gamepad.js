// W3C standard layout: Xbox A/B/X/Y, Menu, left stick, D-pad and right trigger.
const ACTIONS = { launch: 0, abort: 1, manual: 3, pause: 9 };
const clamp = (value, min, max) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;

function buttonValue(pad, index) {
  const button = pad.buttons?.[index];
  return Number.isFinite(button?.value)
    ? clamp(button.value, 0, 1)
    : button?.pressed
      ? 1
      : 0;
}

function stick(value) {
  const axis = clamp(value, -1, 1);
  const deadzone = 0.14;
  return Math.abs(axis) <= deadzone
    ? 0
    : (Math.sign(axis) * (Math.abs(axis) - deadzone)) / (1 - deadzone);
}

export class GamepadInput {
  constructor() {
    this.token = null;
    this.previous = {};
    this.ready = false;
    this.state = {
      available: true,
      connected: false,
      supported: false,
      enabled: false,
      ready: false,
      thrust: 0,
      rotate: 0,
      actions: [],
      disconnected: false,
    };
  }

  // After interrupted input, a neutral controller is required before flight
  // controls or button actions can resume. Held buttons never auto-repeat.
  suspend() {
    this.ready = false;
  }

  poll(pads, { enabled = true, available = true } = {}) {
    const connected = available
      ? Array.from(pads || []).filter((pad) => pad?.connected)
      : [];
    const identity = (pad) => `${pad.index}:${pad.id}`;
    const pad =
      connected.find(
        (p) => p.mapping === "standard" && identity(p) === this.token,
      ) ||
      connected.find((p) => p.mapping === "standard") ||
      connected[0];
    const supported = pad?.mapping === "standard";
    const token = supported ? identity(pad) : null;
    const changed = token !== this.token;
    const disconnected = this.token !== null && changed;
    const pressed = {};
    let rotate = 0,
      thrust = 0;
    if (supported) {
      rotate =
        buttonValue(pad, 15) - buttonValue(pad, 14) || stick(pad.axes?.[0]);
      const trigger = buttonValue(pad, 7);
      // Remove resting trigger noise without scaling or quantizing its range.
      thrust = trigger > 0.025 ? trigger : 0;
      for (const [action, index] of Object.entries(ACTIONS))
        pressed[action] =
          Boolean(pad.buttons?.[index]?.pressed) ||
          buttonValue(pad, index) >= 0.5;
    }
    // Discovery only connects: consume the exposing button, then require a
    // neutral controller before accepting a new press to launch or resume.
    if (changed) this.previous = pressed;
    if (changed || !supported || !enabled) this.ready = false;
    if (
      supported &&
      enabled &&
      !rotate &&
      !thrust &&
      !Object.values(pressed).some(Boolean)
    )
      this.ready = true;
    const active = supported && enabled && this.ready;
    const actions = active
      ? Object.keys(ACTIONS).filter(
          (action) => pressed[action] && !this.previous[action],
        )
      : [];
    this.previous = pressed;
    this.token = token;
    this.state = {
      available,
      connected: Boolean(pad),
      supported,
      enabled,
      ready: this.ready,
      id: pad?.id || null,
      index: pad?.index ?? null,
      thrust: active ? thrust : 0,
      rotate: active ? rotate : 0,
      actions,
      disconnected,
    };
    return this.state;
  }
}
