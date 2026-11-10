// `pnpm size:check`: gzip size of every chunk in dist/ against tools/ci/size-budget.json, and a check that the menu entry
// does not pull in the Phaser chunk. Run it after `pnpm build` (a `--mode test` e2e build also writes dist/ and is larger).
// `pnpm size:check --print` prints the measured sizes and a suggested budget file (measured + headroom). See docs/PERFORMANCE.md.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_BUDGET = join(here, 'size-budget.json');
export const DEFAULT_DIST = resolve(here, '../../dist');
export const HEADROOM = 1.1;

export interface Budget {
  /** Max gzip bytes per chunk, keyed by the file name without its content hash (`index`, `phaser`, ...). */
  readonly chunks: Readonly<Record<string, number>>;
  /** Max gzip bytes of everything in dist/ (html, js, css). */
  readonly totalGzip: number;
}

export interface Measured {
  /** Chunk name without hash, e.g. `index` for `assets/index-BRhiXssy.js`. */
  readonly name: string;
  readonly file: string;
  readonly gzip: number;
}

const HASHED = /^(.+)-[A-Za-z0-9_-]{8}\.(js|css)$/;

/** `assets/index-BRhiXssy.js` -> `index`; `assets/index-qa-ONtr7.css` -> `index.css`. Unhashed names pass through. */
export function chunkName(file: string): string {
  const base = file.slice(file.lastIndexOf('/') + 1);
  const m = HASHED.exec(base);
  if (m === null) return base;
  return m[2] === 'css' ? `${m[1] ?? base}.css` : (m[1] ?? base);
}

export function measureDist(dist: string): Measured[] {
  const out: Measured[] = [];
  const add = (rel: string): void => {
    out.push({ name: rel === 'index.html' ? 'index.html' : chunkName(rel), file: rel, gzip: gzipSync(readFileSync(join(dist, rel)), { level: 9 }).length });
  };
  add('index.html');
  const assets = join(dist, 'assets');
  if (existsSync(assets)) {
    for (const f of readdirSync(assets).sort()) if (/\.(js|css)$/.test(f)) add(`assets/${f}`);
  }
  return out;
}

/** Budget suggestion: each measured chunk plus ~10% headroom, rounded up to 100 bytes. */
export function suggestBudget(measured: readonly Measured[]): Budget {
  const round = (n: number): number => Math.ceil((n * HEADROOM) / 100) * 100;
  const chunks: Record<string, number> = {};
  for (const m of measured) if (m.name !== 'index.html') chunks[m.name] = round(m.gzip);
  return { chunks, totalGzip: round(measured.reduce((a, m) => a + m.gzip, 0)) };
}

const HOW_TO_RAISE =
  'To raise a budget deliberately: run `pnpm build && pnpm size:check --print`, copy the new value into tools/ci/size-budget.json, ' +
  'and explain the increase (what was added, why it cannot be lazy-loaded) in the commit message. Never raise it just to turn CI green.';

/** Pure check: returns failure messages (empty when everything is within budget). */
export function checkSizes(measured: readonly Measured[], budget: Budget): string[] {
  const failures: string[] = [];
  const seen = new Set<string>();
  for (const m of measured) {
    if (m.name === 'index.html') continue;
    seen.add(m.name);
    const max = budget.chunks[m.name];
    if (max === undefined) failures.push(`chunk "${m.name}" (${m.file}, ${String(m.gzip)} B gzip) has no budget; add it to size-budget.json`);
    else if (m.gzip > max) failures.push(`chunk "${m.name}" is ${String(m.gzip)} B gzip, budget ${String(max)} B (+${String(m.gzip - max)})`);
  }
  for (const name of Object.keys(budget.chunks)) {
    if (!seen.has(name)) failures.push(`budgeted chunk "${name}" is not in dist/ (renamed or removed? update size-budget.json)`);
  }
  const total = measured.reduce((a, m) => a + m.gzip, 0);
  if (total > budget.totalGzip) failures.push(`total is ${String(total)} B gzip, budget ${String(budget.totalGzip)} B`);
  return failures;
}

/** Local `./x.js` specifiers an ES module imports statically (`import ... from "./x.js"`, `import "./x.js"`). */
export function staticImports(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*)["'](\.{1,2}\/[^"']+\.js)["']/g)) out.push(m[1] ?? '');
  return out;
}

/**
 * The menu must load without Phaser: index.html must not reference the phaser chunk (script, modulepreload, stylesheet), and the
 * entry chunk must not statically import it (directly or transitively). Dynamic `import()` is how Phaser is loaded on play.
 */
export function checkMenuIsPhaserFree(dist: string): string[] {
  const failures: string[] = [];
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  const isPhaser = (p: string): boolean => chunkName(p) === 'phaser';
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1] ?? '');
  for (const r of refs) if (isPhaser(r)) failures.push(`index.html references the phaser chunk (${r}); it must only load on play`);
  if (/modulepreload/.test(html) && refs.some(isPhaser)) failures.push('index.html preloads the phaser chunk');
  const entries = refs.filter((r) => r.endsWith('.js'));
  const visited = new Set<string>();
  const walk = (rel: string, via: string): void => {
    const file = rel.replace(/^\//, '');
    if (visited.has(file)) return;
    visited.add(file);
    const path = join(dist, file);
    if (!existsSync(path)) return;
    for (const imp of staticImports(readFileSync(path, 'utf8'))) {
      const target = join(dirname(file), imp).replace(/\\/g, '/');
      if (isPhaser(target)) failures.push(`${via} statically imports the phaser chunk (via ${file})`);
      else walk(target, via);
    }
  };
  for (const e of entries) walk(e.replace(/^.*?(assets\/)/, '$1'), `entry ${e}`);
  if (entries.length === 0) failures.push('index.html has no module script; is dist/ a real build?');
  return failures;
}

function main(argv: readonly string[]): number {
  const print = argv.includes('--print');
  const dist = DEFAULT_DIST;
  if (!existsSync(join(dist, 'index.html'))) {
    console.error('size:check: dist/ not found; run `pnpm build` first.');
    return 1;
  }
  const measured = measureDist(dist);
  const w = Math.max(...measured.map((m) => m.file.length));
  for (const m of measured) console.log(`${m.file.padEnd(w)}  ${String(m.gzip).padStart(8)} B gzip`);
  if (print) {
    console.log(`\nSuggested budget (measured + 10%):\n${JSON.stringify(suggestBudget(measured), null, 2)}`);
    return 0;
  }
  const budget = JSON.parse(readFileSync(DEFAULT_BUDGET, 'utf8')) as Budget;
  const failures = [...checkSizes(measured, budget), ...checkMenuIsPhaserFree(dist)];
  if (failures.length > 0) {
    console.error(`\nsize:check FAILED:\n${failures.map((f) => `  - ${f}`).join('\n')}\n\n${HOW_TO_RAISE}`);
    return 1;
  }
  console.log('\nsize:check: within budget; menu entry is Phaser-free.');
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
