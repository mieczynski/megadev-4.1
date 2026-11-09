// Saves one rig page as a self-contained HTML file (ADR 0001: no client JS, so the copy is the
// page). A command, not a browser's "save as" — the preview for review is made this way (plan § 3).
//
//   pnpm preview /digest/2026-10-28 var/preview.html
//
// LANE_MARKER comes from the environment: set, the banner carries it; unset, the banner reads
// "no marker set" (plan § 4).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from '../src/app.js';

const path = process.argv[2] ?? '/digest/2026-10-28';
const out = process.argv[3] ?? 'var/preview.html';

const res = await createApp().request(path);
if (res.status !== 200) {
  console.error(`rig · ${path} → ${res.status}`);
  process.exit(1);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, await res.text());
console.log(`rig · ${path} → ${out}`);
