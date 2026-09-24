#!/usr/bin/env node
// Builds index.html from src/. index.html stays committed because GitHub Pages serves it as-is (no build on deploy).
//   node scripts/build.mjs          write index.html from src/
//   node scripts/build.mjs --check  exit 1 if index.html is not exactly what src/ builds (CI runs this)
// src/page.html is the page shell. A line that is exactly `//#include <path>` or `<!--#include <path>-->` is replaced
// by that file from src/. The game fragments in src/game/ share one scope inside the TornadoGame wrapper in page.html,
// in file-name order, so they are plain code, not ES modules.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src'), out = join(root, 'index.html');
const INCLUDE = /^(?:\/\/#include (\S+)|<!--#include (\S+)-->)$/;

export function build() {
  const lines = readFileSync(join(src, 'page.html'), 'utf8').split('\n');
  return lines.map(line => {
    const m = INCLUDE.exec(line);
    if (!m) return line;
    const text = readFileSync(join(src, m[1] || m[2]), 'utf8');
    if (!text.endsWith('\n')) throw new Error(`src/${m[1] || m[2]} must end with a newline`);
    return text.slice(0, -1);
  }).join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const built = build();
  if (process.argv.includes('--check')) {
    const current = readFileSync(out, 'utf8');
    if (current === built) { console.log('index.html matches src/ build'); process.exit(0); }
    const a = current.split('\n'), b = built.split('\n');
    let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
    console.error(`index.html differs from the src/ build at line ${i + 1}. Edit src/ and run: node scripts/build.mjs`);
    process.exit(1);
  }
  writeFileSync(out, built);
  console.log(`wrote index.html (${built.length} chars)`);
}
