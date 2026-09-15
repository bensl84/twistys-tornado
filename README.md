# Twisty's Tornado

Twisty's Tornado is a one-finger 3D tornado game designed for a young child on an iPad. Pick one of five colors, drag anywhere on the screen, absorb increasingly large objects, and grow from a backyard tornado into a black hole. A complete run moves through the town, solar system, galaxy, and universe before looping back to a new Earth.

[Play the current game](https://bensl84.github.io/twistys-tornado/)

![Smoothing reference view, captured in v9 before the timer HUD](docs/screenshot.png)

## Current state

The canonical game is the root `index.html`. It contains the game code and an inlined copy of three.js r158, so the game itself can open from `file://` without a build step or network connection. This v10 release adds run statistics on top of the v9 smoothing update: rounded object edges, preserved smooth shading, a smoother tornado and soft shadows, and up to 2× display resolution. The prior published v8 space update is commit `1e779931b914192a576510fcd2b8b19b56ab4ed1`. GitHub Pages serves `main` from the repository root; [Pages deployment history](https://github.com/bensl84/twistys-tornado/deployments) identifies the deployed revision independently of this source document. The user authorized v10 publication on 2026-09-15; local test results alone are not proof of deployment or iPad readiness.

The [graphics exit gate](docs/graphics-exit-gate.md) defines measurable smoothness, frame-rate and regression requirements. Local checks are separate from final visual approval and actual-iPad performance proof.

The space stages now feature eight textured planets on animated solar orbits, Saturn/Uranus rings, an asteroid belt, the Kuiper Belt, and an Earth-orbiting Moon, satellite, shuttle and station. The Milky Way has a barred-spiral overview; the universe uses distinct galaxy forms, clusters, filaments and voids. Tap **◎** to see the whole space stage and tap again to return to play. This pauses gameplay while the solar orbits continue moving.

These are science-inspired illustrations, not a scale model or a current-position star chart. Distances, sizes and speeds are compressed; spacecraft and pickup density are fictionalized for the game. See [space graphics and verification](docs/space-visuals.md) for screenshots, references and precise boundaries.

The product name is **Twisty's Tornado**. The current browser and Apple standalone title still use the shorter legacy label **Twister**, while the web-app manifest uses **Twisty** as its short label.

Current limitations are recorded rather than hidden:

- A fresh five-seed deterministic logic run passes every acceptance gate, but there is no current physical-iPad performance receipt.
- The root page registers the service worker when served over HTTP(S), but it does not currently link `manifest.webmanifest` or an Apple touch icon. Offline caching after a web visit is implemented; full home-screen install metadata is not verified.
- `test/` is a preserved legacy v3 preview from before the current 3D rebuild. It is not a test suite, release candidate, or source of truth.
- Most gameplay and pacing values are in the `TUNING` block near the top of `index.html`; renderer geometry and presentation constants also exist elsewhere in that file.

See [the current audit](docs/audit.md) for category ratings, evidence, risks, and the documentation ownership map.

## Timer and end-of-run results

A small live display shows time in the current form, total run time and consumed mass percentage. It counts foreground playing time, including slow-motion/hitstop and the short playable stage-win celebration, but excludes the color picker, space overview, background/context-loss time, world rebuilding, finale animation and results screen. It is a stopwatch, not a countdown or win condition.

After the universe finale, the summary stays open with three rows: **Tornado**, **Black hole**, and **Total**. Each shows time and consumption. **Play again** resumes a fresh town with the same color and zeroed statistics; reloading also starts fresh. Results are not saved between page visits.

- Farm-city mass: consumed collectible mass ÷ all generated town collectible mass.
- Game-universe mass: average of the consumed-mass fractions in solar, galaxy and universe stages, weighted equally. Unvisited stages contribute zero.
- Combined consumption score: average of farm-city and game-universe percentages, not a physical sum of town and cosmic mass.

Each object's mass proxy is its generated size cubed. Dust counts, but shaking or partially absorbed objects do not; each completed absorption counts once. Roads, terrain and decorative backgrounds are excluded. Percentages are clamped to 0–100, show one decimal, and show `<0.1%` for tiny positive amounts. Finishing a stage does not automatically set its consumption to 100%. These are game estimates, not kilograms or a measured fraction of the real universe.

## Repository map

- `index.html` — canonical game, renderer, touch controls, sound, stage logic, inlined three.js, and the `window.__sim` test harness.
- `sim.mjs` — Playwright runner for deterministic offline simulation and acceptance gates.
- `sw.js` — cache-first service worker. This release's cache build is `2026-09-15-twister-v10-stats`.
- `manifest.webmanifest` and `icon-*.png` — install metadata and icons; present but not currently referenced from `index.html`.
- `docs/screenshot.png` — v9 smoothing reference screenshot, with a fixed close-view camera; unchanged geometry in v10, before the timer HUD.
- `docs/audit.md` — current repository and product audit.
- `docs/space-visuals.md` — space-graphics behavior, screenshots, scientific boundaries and local verification.
- `scripts/space.test.mjs` — dependency-free regression tests for planet order, orbital motion, moving-body pickup lookup and stage isolation.
- `scripts/graphics.test.mjs` — dependency-free mesh-normal, rounded-edge and resolution regression tests.
- `scripts/run-stats.test.mjs` — mass denominators, exactly-once absorption, phase totals, reset and formatting tests.
- `scripts/graphics-gate.mjs` and `docs/graphics-exit-gate.md` — repeatable browser graphics checks and the acceptance contract.
- `test/` — historical v3 preview retained for reference only.
- `scripts/truth_audit.rb` — documentation classification and local-link check, copied from truth-audit skill version 2.0.0.

## Run locally

For the game alone, open `index.html` directly in a WebGL-capable browser.

To exercise service-worker behavior, serve the repository over HTTP and open the printed localhost address:

```sh
python3 -m http.server 8000
```

Service workers do not register from `file://` pages.

## Run the deterministic test

Run the focused geometry and orbital regression tests with Node.js alone:

```sh
node --test scripts/*.test.mjs
```

The runner requires Node.js plus Playwright with Chromium. This repository does not currently pin that dependency. Install Playwright locally or globally, or point `PLAYWRIGHT_PATH` at an existing installation.

```sh
node sim.mjs --seeds 1-5 --render 0 --gates
node sim.mjs --seeds 1 --seconds 60 --render 1
```

The first command is the fast logic and progression gate. The second is a rendered benchmark, but `sim.mjs` forces software rendering; its result is environment-specific and does not replace testing on the target iPad. Use `node scripts/graphics-gate.mjs --seconds 10` for the separate normal-browser graphics smoke gate and fixed reference screenshots.

## Release rule

Before publishing a change to any cached root asset, update `BUILD` in `sw.js`, run the deterministic and local graphics gates, and test the deployed URL. Track the remaining target-device and human signoff rows in the graphics exit gate; a local pass is not full graphics acceptance. A source change, a successful local test, a GitHub Pages deployment, and a physical-iPad result are separate evidence lanes; do not treat one as proof of the others.

The 2026-09-15 source checks do not establish physical-iPad readiness. A complete run on the target iPad remains the next device-validation step. Publishing requires the user's authorization and confirmation of the exact Pages build and live service-worker cache. To roll back, use a normal revert commit and a new cache BUILD identifier; never rewrite published history or reuse the old cache name.
