# Twister

A one-finger 3D tornado game for a young child on an iPad (Safari). Drag a finger, the tornado chases it, absorbs things, grows, and wins by absorbing the water tower.

- `index.html` — the whole game. One self-contained file (three.js r158 inlined), no build step, runs offline from a local file or added to the home screen. Every tunable number is in the `TUNING` block at the top.
- `sim.mjs` — headless self-test runner. Needs Playwright with Chromium (`npm i -g playwright`). It loads the page offline, drives a deterministic bot through the real touch path at a fixed 60 Hz step, and prints the acceptance-gate table:

```
node sim.mjs --seeds 1-5 --render 0          # logic-only, ~3 s per seed
node sim.mjs --seeds 1 --seconds 60 --render 1 # rendered, reports frame times
node sim.mjs --seeds 1-5 --render 0 --gates  # exit 1 if any gate fails (CI)
```

Design principles and the metric each one maps to are in the header comment of `index.html`.
