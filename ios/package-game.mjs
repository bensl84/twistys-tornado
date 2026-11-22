import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { build } from '../scripts/build.mjs';

const output = process.argv[2];
if (!output) throw new Error('Pass the destination for the bundled game HTML.');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, build('ios'));
