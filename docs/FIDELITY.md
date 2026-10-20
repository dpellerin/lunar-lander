# Fidelity notes

## What this build is

An independent, playable recreation using hand-authored white vector artwork and synthesized audio. No Atari ROMs, extracted vector ROMs, or sampled cabinet sounds are included. The renderer is separate from the flight model so new graphic modes need not change game rules.

## Reference-backed behavior

- Four selectable missions, midflight mission changes, rotation fuel use, analog-style throttle, emergency abort, continuing approaches while fuel remains, 750 starting fuel, good/hard/crash awards of 50/15/5, 2×–5× landing-site bonuses, and 50 fuel for a good landing.
- Automatic 2.5× approach close-up and altitude measured over local terrain.
- Command uses moderate gravity with rotation momentum, not Prime's strong gravity. The published listing's gravity ratio is 1:1:2:1; Training also damps velocity. Absolute simulation units here are calibrated rather than ROM-exact.

## Landing-speed conflict

The operator manual says vertical speed over 15 and horizontal over 31. The annotated disassembly at `0x7212–0x722d`, with its HUD conversion, instead indicates **horizontal <16**, **good vertical <16**, **hard vertical 16–31**, **crash vertical ≥32**. This build follows the code-derived interpretation. Accepted angle codes 7,8,9 correspond approximately to upright ±11.25°. This is static source interpretation, not validation against a running original ROM.

## Sound network

Recreated from pinned MAME `mame0289` circuit parameters:

- 16-bit XNOR noise, taps 6 and 14, output bit 14, reset zero, 12 kHz clock.
- Initial RC low-pass, 2247 Ω / 1 µF.
- Thrust band-pass 89.5 Hz / Q=7.6; discrete noise levels 1/3/5/7.
- Parallel explosion noise and shared first-order 560 Hz low-pass.
- 3 kHz low-fuel square-wave warning below 100 fuel, approximately 0.39 s on/off. No invented music or landing jingle.

Web Audio uses a looping generated LFSR buffer, IIR first-order filters, a biquad band-pass and band-limited square oscillator. Explosion decay is stepped but not the exact ROM schedule; gain/headroom is normalized for browser playback. Even MAME approximates portions of the physical analog circuitry. Do not describe this build as a recording or exact cabinet emulation.

## Deliberate differences / remaining fidelity work

- Terrain, lander geometry, UI typography and surrounding console are independently redrawn, not exact original assets.
- The simulation runs at 120 Hz, not the arcade's roughly 41 Hz update cadence. Original fixed-point arithmetic, nonlinear 16-level thrust table, all Prime fuel/thrust adjustments and exact abort timing are not replicated.
- Abort uses a 2-second stronger burn with smooth drift braking and nominal 150 fuel consumption.
- Hard landings use a single rebound with the same gravity as the flight model. The tuned rise is 4–8 world units; time aloft follows the ballistic arc (roughly 2.5–3.5 seconds at normal gravity, shorter in Prime). Vertical speed reaches zero at the apex before the gentle descent. Bounce height and settling are calibrated for this recreation rather than decoded original-ROM behavior.
- Camera uses a fixed full-landscape overview and a discrete 2.5× close-up (user-tuned from the original-style 4×), retaining the two-scale behavior observed in the user-supplied [gameplay video](https://www.youtube.com/watch?v=EqBmZKLZEJY). Sampled frames bracket the overview→close-up cut between 55.5 and 56.0 seconds; the craft appears around 50% screen width / 20% height after the cut, moves within a stationary close-up, then the terrain scrolls as it nears a boundary. This build uses a safety region (20–80% horizontal / 20–72% vertical), with entry at 160 world units above local terrain and return to overview at 280. These thresholds and boundaries are calibrated to this recreation, not claimed as decoded ROM constants. New missions restore the overview. Extreme ascent expands the overview only as needed to keep the craft visible. The auxiliary overview is a modern addition.
- A fresh procedurally generated landscape appears each round. Unequal mountain masses include a broad dominant peak, lower ridges scaled to their width, and basins with several uneven floor facets. Recursive displacement adds rock detail perpendicular to each face at several scales, including steep walls. Acute small notches are clipped with straight bevels; rendering uses only straight segments. The generator does not interpolate a cubic curve. Landing sites occupy valley floors, summits and shelves, with exact flat surfaces shared by drawing and collision. Pads are kept inside the available space between landforms. Both the overview and approach screenshots supplied by the user guide the scale and silhouette; they are visual references, not an exact original coordinate dataset. Normal play starts with a random seed; each subsequent round advances through a deterministic sequence of seeds. The current round stays fixed during flight, pause and difficulty changes.
- Crash fuel-loss formula and any crash multiplier edge cases are not replicated. This build awards 5 points for crashes with no additional fuel deduction beyond fuel already consumed.
- The player explicitly launches the next mission rather than waiting for an automatic arcade sequence. Fuel cannot be added during play. After exhaustion, New Game resets score, time and fuel on a new landscape; the original credit-based continuation mechanism is not reproduced.
- Pausing, keyboard power selection, touch controls, Xbox/gamepad input, fullscreen, locally saved high score and Preferences and the flight manual are modern additions. A controller's right trigger supplies continuous proportional thrust, independently of the keyboard slider; the original cabinet used a physical thrust lever.

## Sources

1. [Atari operator manual, 4th printing](https://archive.org/download/arcade-game-manuals/Lunar_Lander_TM-136_4th_Printing.pdf)
2. [Annotated 6502 disassembly](https://v.st/~th/llander/llander.html)
3. [MAME mame0289 Atari driver and discrete audio](https://github.com/mamedev/mame/blob/mame0289/src/mame/atari/asteroid.cpp)
4. [MAME discrete filter implementation](https://github.com/mamedev/mame/blob/mame0289/src/devices/sound/disc_flt.hxx)

No independently licensed, non-ROM original terrain-coordinate dataset was located in these references. That is a bounded research finding, not a claim that none exists.
