# Twisty's Tornado

Twisty's Tornado is a one-finger 3D tornado game designed for a young child on an iPad. Pick one of five colors, drag anywhere on the screen, absorb increasingly large objects, and grow from a backyard tornado into a black hole. A complete run moves through the town, solar system, galaxy, and universe before looping back to a new Earth.

[Play the current game](https://bensl84.github.io/twistys-tornado/)

![Smoothing reference view, captured in v9 before the timer HUD](docs/screenshot.png)

## Current state

The canonical game is the root `index.html`. It contains the game code and an inlined copy of three.js r158, so the game itself can open from `file://` without a build step or network connection. This v12 source refreshes the town with softer tree, vehicle and roof silhouettes, finer grass and less washed-out distance haze. The reference town scene draws about 2.20 million triangles, down from 2.36 million in v11; the game retains up to 2× display resolution. The v11 space visuals and v10 run statistics remain. GitHub Pages serves `main` from the repository root; [Pages deployment history](https://github.com/bensl84/twistys-tornado/deployments) identifies the deployed revision independently of this source document. Local test results alone are not proof of deployment or iPad readiness.

The [graphics exit gate](docs/graphics-exit-gate.md) defines measurable smoothness, frame-rate and regression requirements. Local checks are separate from final visual approval and actual-iPad performance proof.

The space stages now feature eight textured planets on animated solar orbits, Saturn/Uranus rings, an asteroid belt, the Kuiper Belt, and an Earth-orbiting Moon, satellite, shuttle and station. The Milky Way has a barred-spiral overview; the universe uses distinct galaxy forms, clusters, filaments and voids. Tap **◎** to see the whole space stage and tap again to return to play. This pauses gameplay while the solar orbits continue moving.

These are science-inspired illustrations, not a scale model or a current-position star chart. Distances, sizes and speeds are compressed; spacecraft and pickup density are fictionalized for the game. See [space graphics and verification](docs/space-visuals.md) for screenshots, references and precise boundaries.

The product name is **Twisty's Tornado**. The current browser and Apple standalone title still use the shorter legacy label **Twister**, while the web-app manifest uses **Twisty** as its short label.

Current limitations are recorded rather than hidden:

- A fresh five-seed deterministic logic run passes every acceptance gate, but there is no current physical-iPad performance receipt.
- The root page registers the service worker when served over HTTP(S), but it does not currently link `manifest.webmanifest` or an Apple touch icon. Offline caching after a web visit is implemented; full home-screen install metadata is not verified.
- `test/` is a preserved legacy v3 preview from before the current 3D rebuild. It is not a test suite, release candidate, or source of truth.
- Most gameplay and pacing values are in the `TUNING` block near the top of `index.html`; renderer geometry and presentation constants also exist elsewhere in that file.

See [the last full audit (v10)](docs/audit.md) for category ratings, evidence, risks, and the documentation ownership map.

## Timer and end-of-run results

A small live display shows time in the current form, total run time and consumed mass percentage. It counts foreground playing time, including slow-motion/hitstop and the short playable stage-win celebration, but excludes the color picker, space overview, background/context-loss time, world rebuilding, finale animation and results screen. It is a stopwatch for the whole run; the separate level clock below is the only countdown.

### Level clock

Each level has a maximum time so nobody gets bored. The start screen has three settings, remembered on the device:

| Setting | Town | Each space level |
|---|---|---|
| Quick | 45 s | 30 s |
| Normal (default) | 90 s | 60 s |
| 5 min | 5:00 | 5:00 |

The clock only ever helps. At 10 seconds left the player grows to the level's biggest size over one second, everything becomes edible, a big countdown ring appears, and an arrow points to the goal. At 0 the goal flies in and the level ends as a normal win. The level clock counts simulation ticks, so it pauses with the space overview, background time and results, and stops at the win. Tapping a setting never starts the game; only a color disc does.

Best times are kept per setting and per level in this browser's local storage (`twisty-best-v1`), never sent anywhere. A level only sets a best time when it was finished before its clock ran out. The results card shows each level's time (⏱ when the clock finished it) and marks new bests with ★.

After the universe finale, the summary stays open with three rows: **Tornado**, **Black hole**, and **Total**. Each shows time and consumption. **Play again** resumes a fresh town with the same color and zeroed statistics; reloading also starts fresh. Results are not saved between page visits.

- Farm-city mass: consumed collectible mass ÷ all generated town collectible mass.
- Game-universe mass: average of the consumed-mass fractions in solar, galaxy and universe stages, weighted equally. Unvisited stages contribute zero.
- Combined consumption score: average of farm-city and game-universe percentages, not a physical sum of town and cosmic mass.

Each object's mass proxy is its generated size cubed. Dust counts, but shaking or partially absorbed objects do not; each completed absorption counts once. Roads, terrain and decorative backgrounds are excluded. Percentages are clamped to 0–100, show one decimal, and show `<0.1%` for tiny positive amounts. Finishing a stage does not automatically set its consumption to 100%. These are game estimates, not kilograms or a measured fraction of the real universe.

## Discovery worlds, sound and helpers

Every trip through the black hole lands in a town with one new kind of thing mixed in. The first visit is the plain farm city; then Animal Farm 🐄, Dino Valley 🦖, Candy Town 🍭, Snow Town ⛄ and Castle Town 🏰; from the sixth trip on, Everything Town 🌈 mixes them all at reduced density. Each world adds things at every tier (for example chicks up to giraffes, gumdrops up to a gingerbread house), snow and candy towns get their own ground colour, and a picture card names the world when she lands in it. The trip count is kept in this browser's local storage (`twisty-loop-v1`); clearing site data returns to the plain town. The results card shows a star for every level finished before its clock and names the next world.

- **Sound:** a quiet generated tune (bright in town, slow in space), an extra sound layer by material on every absorb (rustle, clank, knock, animal boop, dino growl, candy chime, snow crunch, stone thud, star shimmer), a low hum as a black hole, and a rate limit so a super-size feast never starts more than ten sounds in 0.2 s. The 🔊 button in the bottom-right corner mutes everything and is remembered on the device.
- **Goal beacon:** a soft column of light stands over each level's goal and brightens once the clock super-sizes her.
- **Adaptive quality:** if frames run longer than 25 ms for about two seconds, the backing resolution steps down (to 80, 66, then 55 % of the start value) and steps back up after about ten seconds of headroom. `?quality=fixed` pins full quality; the graphics gate uses it.
- **Start buttons:** the colour discs are real buttons, so they work with a keyboard and assistive tech as well as touch.

## Repository map

- `index.html` — canonical game, renderer, touch controls, sound, stage logic, inlined three.js, and the `window.__sim` test harness.
- `sim.mjs` — Playwright runner for deterministic offline simulation and acceptance gates.
- `sw.js` — cache-first service worker. This branch's cache build is `2026-09-17-twister-v13-metrics-local`.
- `manifest.webmanifest` and `icon-*.png` — install metadata and icons; present but not currently referenced from `index.html`.
- `docs/screenshot.png` — v9 smoothing reference screenshot, with a fixed close-view camera; unchanged geometry in v10, before the timer HUD.
- `docs/audit.md` — the last full repository and product audit (v10 baseline).
- `docs/space-visuals.md` — space-graphics behavior, screenshots, scientific boundaries and local verification.
- `scripts/space.test.mjs` — dependency-free regression tests for planet order, orbital motion, moving-body pickup lookup and stage isolation.
- `scripts/graphics.test.mjs` — dependency-free mesh-normal, rounded-edge and resolution regression tests.
- `scripts/run-stats.test.mjs` — mass denominators, exactly-once absorption, phase totals, reset and formatting tests.
- `scripts/level-timer.test.mjs` — level-clock presets, super size at 10 s left, the goal fly-in at 0 and the clock stopping at the win.
- `scripts/worlds.test.mjs` — trip order, themed generation, a finite mesh for every themed thing, and tiers that match sizes.
- `scripts/graphics-gate.mjs` and `docs/graphics-exit-gate.md` — repeatable browser graphics checks and the acceptance contract.
- `test/` — historical v3 preview retained for reference only.
- `scripts/truth_audit.rb` — documentation classification and local-link check, copied from truth-audit skill version 2.0.0.
- `metrics-client.js` and `metrics-config.js` — optional first-party web play milestones. The published-site endpoint is empty, so this branch does not send public play data.
- `metrics/` — local SQL collector, private dashboard, synthetic demo generator and integration checks. The server deliberately binds only to loopback and has no production deployment adapter yet.

## Web metrics local preview

The first metrics release measures participating **runs**, not unique children. It records a page load when an existing metrics preference is present, actual first gameplay input, first completed absorption, stage/tier milestones, stage goals, results and actual replay starts. The finale rebuilds a new town before results; that rebuild does not count as a new run. Dashboard percentages use run starts for their denominator, group later milestones by the original run-start day/build and mark recent counts provisional while offline events may still arrive. A new player preference chosen during a visit does not retroactively create an eligible load. This cannot measure overall traffic, opt-in rate or return visits across days.

The public GitHub Pages endpoint in `metrics-config.js` is intentionally unset. To inspect the working local preview, use Node.js 24, two terminals and a locally generated admin password. Keep the password out of source files. The demo generator refuses to overwrite an existing demo database.

```powershell
node metrics/demo.mjs
$env:METRICS_LOCAL_ONLY='1'
$env:METRICS_DB_PATH="$PWD\metrics\demo.sqlite"
$env:METRICS_DATA_LABEL='SYNTHETIC DEMO — NOT REAL PLAYERS'
$env:METRICS_ADMIN_USER='ben'
$env:METRICS_ADMIN_PASSWORD='<choose-a-local-password>'
node metrics/server.mjs
```

In the second terminal, from the repository root:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8787/` for the private dashboard and `http://127.0.0.1:8000/` for the game. On the start screen, **Local test metrics** can opt into collection on this computer. Turning it off clears pending browser records. The game continues if the collector is unavailable. The dashboard uses Basic authentication on loopback for local preview; this client rejects non-loopback endpoints. A public pilot requires a separately reviewed parent participation flow, HTTPS host and authentication method.

Tests: `node --test scripts/*.test.mjs metrics/server.test.mjs`. To run the actual browser test and existing simulation/graphics gates, set `PLAYWRIGHT_PATH` to an installed Playwright package. If its bundled browser is unavailable, set `BROWSER_EXECUTABLE` to a local Chrome executable. The browser test uses ports 8000 and 8787 and keeps its synthetic database temporary.

```powershell
node --test metrics/browser.test.mjs
node sim.mjs --seeds 1-5 --render 0 --gates
node scripts/graphics-gate.mjs --seconds 5
```

The local collector stores validated milestone records for 14 days and daily totals for 90 days. It accepts only the configured game origin, has a server-side collection stop control, and never places a database/admin secret in the public game. A live rollout additionally needs an exact hosting owner, logging and backup retention review, cost controls, privacy notice/collection basis, administrator access, and a target-iPad read-back before enabling real child play data. Do not reuse a shared project whose ownership or existing data is unclear. These implementation notes do not establish legal compliance or production readiness.

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

Timer settings, a slow child and discovery worlds each have their own run; these apply the safety and `levels` gates only, because the pacing gates assume the regular bot in the plain town on Normal:

```sh
node sim.mjs --seeds 1-5 --render 0 --gates --timer quick
node sim.mjs --seeds 1-5 --render 0 --gates --slow
node sim.mjs --seeds 1-5 --render 0 --gates --timer adult --slow
node sim.mjs --seeds 1-5 --render 0 --gates --theme all
```

The first command is the fast logic and progression gate. The second is a rendered benchmark, but `sim.mjs` forces software rendering; its result is environment-specific and does not replace testing on the target iPad. Use `node scripts/graphics-gate.mjs --seconds 10` for the separate normal-browser graphics smoke gate and fixed reference screenshots.

## Release rule

Before publishing a change to any cached root asset, update `BUILD` in `sw.js`, run the deterministic and local graphics gates, and test the deployed URL. Track the remaining target-device and human signoff rows in the graphics exit gate; a local pass is not full graphics acceptance. A source change, a successful local test, a GitHub Pages deployment, and a physical-iPad result are separate evidence lanes; do not treat one as proof of the others.

The 2026-09-15 source checks do not establish physical-iPad readiness. A complete run on the target iPad remains the next device-validation step. Publishing requires the user's authorization and confirmation of the exact Pages build and live service-worker cache. To roll back, use a normal revert commit and a new cache BUILD identifier; never rewrite published history or reuse the old cache name.
