# Twisty's Tornado Audit

Audit date: 2026-09-15

Source reviewed: the local 2026-09-15 whole-game smoothing and run-statistics update based on `1e779931b914192a576510fcd2b8b19b56ab4ed1`

Source cache build: `2026-09-15-twister-v10-stats`. Publication was authorized on 2026-09-15; deployment history independently records the deployed commit. The prior published v8 space update is the base commit above.

Live surface: <https://bensl84.github.io/twistys-tornado/>; [deployment history](https://github.com/bensl84/twistys-tornado/deployments) tracks publication separately from the local evidence below

Overall rating: **7.0/10** (equal-weight mean of the categories below)

## Executive assessment

Twisty's Tornado is a strong, unusually focused child-oriented game prototype. The core loop is understandable without text, the tornado has immediate one-finger response, the growth ladder produces frequent feedback, and the automated bot completes every stage reliably across multiple seeds. The game is already playable and distinctive.

It is not yet release-proven on its actual target device. The largest remaining risks are physical-iPad frame rate, incomplete home-screen metadata, weak accessibility outside the intended touch-only use case, an unpinned test environment, and a very large single-file implementation that makes future changes harder to review safely.

## Ratings

Scores describe the local repository after documentation reconciliation, the space-graphics update and whole-game smoothing. The 7.0 overall rating is retained: improved visuals do not resolve the outstanding iPad, accessibility, install and release-engineering gaps. A 10 requires direct evidence, not just plausible source code.

| Category | Score | Evidence and reason |
|---|---:|---|
| Product clarity and audience fit | 8/10 | The game has one obvious verb, no punishment or monetization, and a clear young-child/iPad audience. The goal is communicated through scale and feedback rather than instructions, but that has not been freshly observed with the target child. |
| Core gameplay and controls | 9/10 | Touch and mouse smoke tests start the game immediately. The deterministic harness measures one-frame input response in all five seeds. |
| Progression and pacing | 9/10 | All five seeds reached the town goal in 70.4–81.7 seconds and completed the solar, galaxy, and universe stages. Tier intervals stayed within 7–18 seconds. |
| Visual and audio feedback | 8/10 | Textured orbiting planets, rings and belts, a barred-spiral Milky Way, and distinct galaxy forms complement the toy-like town. The local update fixes faceted curved shading, bevels substantial box edges, smooths the tornado and shadows, and increases display resolution. Fixed reference screenshots were inspected. Final moving-gameplay art approval and physical-device audio evaluation remain open. |
| Mobile and iPad UX | 7/10 | One-finger input, fixed viewport behavior, a non-blocking landscape hint, safe-area-aware placement, and context-loss handling are present. No 2026-09-15 physical-iPad run was performed. |
| Accessibility | 4/10 | Start choices have labels, but they are generic `div` elements rather than keyboard-operable controls. The experience relies heavily on color, motion, graphics, and audio, with no reduced-motion or mute control. |
| Reliability and recovery | 8/10 | Five seeded progression simulations completed with zero console errors and invalid-number events. Separate real-browser checks proved touch drag/release, map pause/resume, repeated stage changes and the live finale returning to a new Earth. WebGL startup/context-loss recovery has source support, not a fresh recovery exercise. |
| Performance and resource use | 6/10 | The town contains roughly 7,700 objects; space fields roughly 4,500–5,300. Objects are instanced and graphics resources stabilized over three stage cycles. The reference town draws about 2.36 million triangles at DPR 2; smoothing has a real GPU cost. Short desktop samples reach approximately 60 FPS across all four stationary grown scenes, not a full-run or iPad benchmark. A separate earlier forced-software run measured 4 FPS. Target-device proof remains missing. |
| Offline and install experience | 6/10 | The game makes zero network requests when loaded from `file://`, and a cache-first service worker exists. The page does not link the web manifest or Apple touch icon, so install metadata is incomplete. |
| Test coverage and automation | 7/10 | The bot checks progression, pacing, visibility, response, errors, memory and offline behavior across five seeds. Twenty dependency-free orbital/geometry/statistics tests cover shading, exactly-once consumed mass, normalized percentages, time totals and reset. The browser graphics gate checks resolution, frame pacing, touch, resource counts and results/replay. Playwright is not pinned, there is no CI workflow, and desktop checks are not target-device validation. |
| Architecture and maintainability | 5/10 | Game state, simulation, renderer, audio and bot are separated inside the source, but almost everything lives in one large HTML file with an inlined dependency and presentation constants outside `TUNING`. Cached procedural textures and moving-body lookup are isolated helpers, not a modular build. |
| Documentation and truth hygiene | 8/10 | The README, screenshot, audit, legacy-folder status, verification boundaries, and install limitations now agree. The versioned truth checker prevents unclassified Markdown and broken local links. |
| Release engineering | 4/10 | Cache invalidation depends on manually changing one string. The Pages destination, revert-with-fresh-cache rollback and graphics/device exit criteria are documented, but the test toolchain is unpinned, there is no CI workflow, and the physical-device gate has not been passed. |
| Security and privacy | 9/10 | The game is static, account-free, analytics-free, and can run entirely offline. It accepts no personal data and has no backend. The remaining point reflects normal browser/PWA hardening and dependency-update concerns. |

## Verification evidence

### Passed

- Target fingerprint: correct repository owner, remote, branch, upstream, and clean starting worktree.
- Prior v8 publication: the space update was pushed and verified live. That receipt does not prove publication of the local v10 smoothing/statistics update.
- Five-seed logic run: seeds 1–5 completed town, solar, galaxy, and universe.
- Town time to first absorb: 0.93–1.10 seconds.
- Town win time: 70.4–81.7 seconds.
- Input response: one simulation frame in every seed.
- Town visible-next-goal coverage: 97.10–97.55%.
- Maximum active feedback gap: 0.68–0.69 seconds.
- Maximum town dead time: 1.63–2.78 seconds.
- Console errors, invalid-number events, and attempted network requests: zero.
- Town and later-stage heap-window growth remained below the harness's 5% gate. Negative windows reflect garbage collection, not proof of leak absence.
- Current orbital, graphics and statistics regression tests: 20/20 passed.
- Post-update real touch events in desktop Chrome: drag, release, map toggle, paused gameplay and continuing solar orbits passed.
- Three full stage-rebuild cycles stabilized geometry/texture counts after warm-up; a separate live universe finale returned to a new Earth and cleared its overlays.
- Current local browser gate checks actual antialiasing and DPR 1/2 backing dimensions, fixed landscape/portrait views, one-frame touch response, resource stability and finale reset. Short stationary grown-scene samples are desktop smoke evidence, not sustained busy-gameplay performance.
- Separate v10 UI checks passed: visible timer and size-weighted consumed mass; carry between forms/stages; overview pause; synthetic visibility-change pause; live ending animation into persistent results; correct displayed values; paused fresh-town state; mobile 390×844 layout; Play again reset; fresh reload; zero browser errors. Stage goals were forced to isolate transitions, not a full manual playthrough. The timer is wall-clock foreground play time, distinct from the bot's slow-motion-adjusted simulation time.
- See the [graphics exit gate](graphics-exit-gate.md) for measurable acceptance criteria and the [v8 space verification record](space-visuals.md) for feature-specific evidence and scientific boundaries.

### Not proved

- Current Safari performance, sound, touch feel, memory behavior, offline relaunch, and stage loop on the actual target iPad.
- Home-screen name/icon behavior, because the page does not link the manifest or Apple touch icon.
- A pinned, cross-machine rendered benchmark. The repeatable local graphics script records source/browser/viewport and measures active rendering, but the browser dependency and hardware are not pinned. The earlier forced-software Chrome run reached only 4 FPS; that is a harness-environment warning, not an estimate of iPad GPU performance.
- Automated deployment or exercised rollback. The publication path is now confirmed as GitHub Pages from `main:/`, and the documented rollback is a normal revert plus a fresh service-worker BUILD. This local audit itself is not a deployment receipt.

## Findings and recommended order

1. **High — prove the complete loop on the target iPad.** Record device model, iPadOS version, Safari/home-screen mode, current build, frame behavior, sound, touch response, offline relaunch, and whether the second Earth appears.
2. **High — finish PWA metadata.** Link `manifest.webmanifest` and the 180px Apple touch icon from `index.html`, then verify a fresh home-screen installation. This remains outside the graphics update's scope.
3. **Medium — make tests reproducible.** Add a pinned Playwright development dependency and a CI job for the five-seed logic gate. Keep rendered and physical-device results as separate gates.
4. **Medium — define the legacy `test/` disposition.** It is now clearly labeled as historical. Remove or relocate it only with explicit approval because it is tracked evidence, not an active release surface.
5. **Medium — reduce single-file change risk.** Keep the offline bundle as a release artifact, but generate it from reviewable source modules or add a reproducible dependency-vendoring step with a verified three.js hash.
6. **Medium — improve inclusive controls.** Use actual buttons for the color choices and consider mute and reduced-motion options without adding text-heavy menus to the child flow.

## Documentation ownership map

| Artifact | Question answered | Status | Editable or generated | Freshness rule |
|---|---|---|---|---|
| `README.md` | What is the game, what is canonical, and how is it run, tested, and released? | Maintained source of truth | Editable | Update with product, path, test, install, or release-process changes. |
| `docs/audit.md` | How healthy is the current game and what evidence supports that rating? | Maintained assessment | Editable | Re-run evidence and update date, commit, scores, and findings when the audit changes. |
| `docs/space-visuals.md` | What space graphics are implemented, how accurate are they, and what local evidence supports them? | Maintained feature/verification record | Editable | Update with graphics behavior, verification or publication changes. |
| `docs/graphics-exit-gate.md` | How is smoothness accepted, and which checks still require the target device or human approval? | Maintained acceptance contract | Editable | Update thresholds deliberately; refresh source/build and receipts with graphics changes. |
| `docs/solar-system.png`, `docs/milky-way.png`, `docs/cosmic-web.png` | What do the local space overviews look like? | Current local visual evidence | Generated browser screenshots | Replace when the space views change; do not imply deployment. |
| `docs/screenshot.png` | What did the smoothing change in the fixed close-view fixture? | v9 geometry reference, before the v10 timer HUD | Generated by a local rendered run | Relabel or replace when graphics geometry changes. |
| `docs/graphics-before.png` | What did v8 look like before smoothing in the matching close-view fixture? | Historical comparison evidence | Generated browser screenshot | Preserve as the labeled v8 baseline, not current visual truth. |
| `docs/graphics-local-receipt.json` | Which source/browser passed the local graphics checks? | Dated local evidence, not release proof | Generated by graphics gate | Replace with a fresh successful run when the tested HTML changes. |
| `docs/2026-09-15-twistys-tornado-handoff.json` | What remains after the local smoothing work? | Dated continuation trace | Editable handoff | Reconcile against current Git state and receipts before resuming. |
| `index.html` header | What design principles and telemetry fields shape the game? | Maintained implementation note | Editable with code | Update with game-design or telemetry changes. |
| `test/` | What did the pre-rebuild v3 preview contain? | Historical code snapshot, not current truth | Preserve unless deletion is approved | Do not use for current claims. |

## Migration decision

No tracked or untracked file was deleted or moved. Town and space screenshots retain their labeled v9 graphics references. V10 adds the timer, end-of-run summary and statistics tests on top of the graphics exit contract, with docs distinguishing source evidence from deployment evidence and the prior v8 build. The historical `test/` snapshot remains intact and explicitly classified.
