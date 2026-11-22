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
const PLATFORM = /^(?:\/\/#(web|ios|end)|<!--#(web|ios|end)-->)$/;

export function build(platform = 'web') {
  function render(path) {
    const source = readFileSync(join(src, path), 'utf8');
    if (!source.endsWith('\n')) throw new Error(`src/${path} must end with a newline`);
    let section = null;
    const output = [];
    for (const line of source.slice(0, -1).split('\n')) {
      const marker = PLATFORM.exec(line);
      if (marker) {
        const tag = marker[1] || marker[2];
        if (tag === 'end' ? !section : section) throw new Error(`Unexpected ${tag} marker in src/${path}`);
        section = tag === 'end' ? null : tag;
      } else if (!section || section === platform) {
        const include = INCLUDE.exec(line);
        output.push(include ? render(include[1] || include[2]) : line);
      }
    }
    if (section) throw new Error(`Unclosed ${section} section in src/${path}`);
    return output.join('\n');
  }
  return render('page.html') + '\n';
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
