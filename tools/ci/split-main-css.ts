// ONE-SHOT (css-split, base main 8f89a234): cut src/ui/styles/main.css into src/ui/styles/main/NN-name.css partials
// plus an import-only main.css, without moving or editing a rule. Kept because it produced the committed files;
// it refuses to run once main.css already has @import lines. Run: corepack pnpm exec tsx tools/ci/split-main-css.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../src/ui/styles');
const mainPath = resolve(root, 'main.css');

/** [file, anchor]: the anchor is the start of the range's first line, at column 0, unique in main.css. */
const PARTS: readonly (readonly [string, string])[] = [
  ['01-base.css', ':root {'],
  ['02-menu-controls.css', '/* Native buttons styled as the legacy t'],
  ['03-main-menu.css', '/* Theme: one centred column of cards on'],
  ['04-settings.css', '/* Settings: option chips in a wrapping '],
  ['05-action-bar.css', '/* Touch/action buttons: transparent ove'],
  ['06-versus-picker.css', '/* Versus hero select (Street Fighter / '],
  ['07-hero-grid.css', '/* Hero select (Versus and Play): elemen'],
  ['08-picker-dnd.css', '/* Picker layout (the pointer drag-and-d'],
  ['09-help-first-run.css', '/* Help: Controls tables (text, never co'],
  ['10-picker-layout.css', '/* Unselect (team slots): empty placehol'],
  ['11-tour-splash.css', '/* Tour versus splash: two big portraits'],
  ['12-short-window-help.css', '/* Short desktop windows (720p): a small'],
  ['14-online.css', '/* Play intro: one compact line of small'],
  ['15-picker-720p.css', '/* qa-r15: at a short desktop window (72'],
  ['16-settings-sections.css', '/* Settings sections (QA r24): collapsib'],
  ['17-tour-victory.css', '/* World Tour victory (qa-r25): a mystic'],
  ['18-touch-targets.css', '/* 1v1 has one slot, so a pick is one'],
  ['19-tour-stage.css', '/* Tour stage card: scannable fact rows '],
  ['22-online-live.css', '/* Online, connected and in a match: no '],
];

const src = readFileSync(mainPath, 'utf8');
if (/^@import /m.test(src)) throw new Error('main.css already has @import lines: already split');
const lines = src.split('\n');
const first = lines[0] ?? '';
if (!first.startsWith('/* Ported from war/')) throw new Error('line 1 is not the Ported-from comment');

const starts = PARTS.map(([file, anchor]) => {
  const hits = lines.flatMap((l, i) => (i > 0 && l.startsWith(anchor) ? [i] : []));
  if (hits.length !== 1) throw new Error(`${file}: anchor matched ${String(hits.length)} lines`);
  return hits[0] as number;
});
starts.forEach((s, i) => {
  if (i > 0 && s <= (starts[i - 1] as number)) throw new Error(`anchor order broken at ${PARTS[i]?.[0] ?? ''}`);
});
if (starts[0] !== 1) throw new Error('first partial must start at line 2');

mkdirSync(resolve(root, 'main'), { recursive: true });
const bodies = PARTS.map((_p, i) => lines.slice(starts[i], starts[i + 1] ?? lines.length).join('\n'));
const joined = bodies.map((b, i) => (i < bodies.length - 1 ? `${b}\n` : b)).join('');
if (joined !== lines.slice(1).join('\n')) throw new Error('concatenation differs from the original body');

PARTS.forEach(([file], i) => {
  const b = bodies[i] as string;
  writeFileSync(resolve(root, 'main', file), i < bodies.length - 1 ? `${b}\n` : b);
});

const head = `${first}
/* Always-loaded app CSS (imported once, from src/game/app/main.ts), cut from one file without moving a rule
   (css-split). The import order below IS the cascade: at equal specificity a later file wins, so never
   reorder these lines. Put a new rule in its area's file; a fix that must beat a later file goes in that
   file. Partials use relative paths only and are never imported from TS. */
`;
writeFileSync(mainPath, head + PARTS.map(([f]) => `@import './main/${f}';\n`).join(''));
console.log(`split into ${String(PARTS.length)} partials`);
