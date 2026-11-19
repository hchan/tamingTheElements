// Integrate art-director-approved splash backdrops into public/assets/img/splash (WP splash-backdrops-integrate).
// Run: pnpm exec tsx tools/assets/splash-gen/integrate.ts <approval.json> [<dir with the approved PNGs>]
// The PNG dir defaults to <approval.json dir>/out. Refuses to run without an approval.json (art-autonomy rule 1).
// Slots without an approved element are simply absent from splash.json; consumers fall back to the neutral art.
// The legacy-driven src/game/assets/manifest.generated.json is NOT touched: it is generated from the legacy tree
// (extract-legacy-manifest.ts, entry counts pinned by tests), and repo-made art (menu/, hud/) is loaded straight from public/.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

export const SPLASH_SLOTS = ['plate', 'team', 'vs', 'win', 'lose', 'hero', 'help'] as const;
export const SPLASH_ELEMENTS = ['fire', 'water', 'earth', 'air'] as const;
export type SplashIndex = Record<string, Record<string, string>>;
export interface SplashJob { key: string; slot: string; element: string; src: string; url: string; width: number; height: number }

const root = resolve(import.meta.dirname, '../../..');
const OUT_URL_DIR = 'img/splash';

/** Parse an approval.json (format: {"bd_<slot>_<element>": {approved, reviewer, beats_shipped}}) into conversion jobs; throws on anything unapproved or malformed. */
export function planJobs(approval: unknown, pngDir: string, exists: (p: string) => boolean = existsSync): SplashJob[] {
  if (typeof approval !== 'object' || approval === null || Array.isArray(approval)) throw new Error('approval.json must be an object');
  const jobs: SplashJob[] = [];
  for (const [key, v] of Object.entries(approval as Record<string, unknown>)) {
    const m = /^bd_([a-z]+)_([a-z]+)$/.exec(key);
    const slot = m?.[1] ?? '';
    const element = m?.[2] ?? '';
    if (!(SPLASH_SLOTS as readonly string[]).includes(slot) || !(SPLASH_ELEMENTS as readonly string[]).includes(element)) {
      throw new Error(`unsupported approval key "${key}" (want bd_<slot>_<element>)`);
    }
    const e = v as { approved?: unknown; reviewer?: unknown; beats_shipped?: unknown };
    if (typeof e?.approved !== 'string' || e.reviewer !== 'art-director' || e.beats_shipped !== true) {
      throw new Error(`"${key}" is not an art-director approval with beats_shipped`);
    }
    const f = /^(bd_[a-z]+_[a-z]+)_r\d+[a-z]?_\d+_(\d+)x(\d+)\.png$/.exec(e.approved);
    if (f === null || f[1] !== key) throw new Error(`"${key}": approved file "${e.approved}" does not match the naming scheme`);
    const src = resolve(pngDir, basename(e.approved));
    if (!exists(src)) throw new Error(`"${key}": ${src} not found`);
    jobs.push({ key, slot, element, src, url: `${OUT_URL_DIR}/${slot}-${element}.webp`, width: Number(f[2]), height: Number(f[3]) });
  }
  if (jobs.length === 0) throw new Error('approval.json has no entries');
  return jobs;
}

/** Merge jobs into the slot -> element -> url index (kept sorted so reruns and later approval batches stay byte-stable). */
export function mergeIndex(prev: SplashIndex, jobs: readonly SplashJob[]): SplashIndex {
  const out: SplashIndex = {};
  for (const [s, els] of Object.entries(prev)) out[s] = { ...els };
  for (const j of jobs) (out[j.slot] ??= {})[j.element] = j.url;
  const sorted: SplashIndex = {};
  for (const s of Object.keys(out).sort()) {
    const els = out[s] ?? {};
    sorted[s] = Object.fromEntries(Object.keys(els).sort().map((e) => [e, els[e] ?? '']));
  }
  return sorted;
}

if (import.meta.main) {
  const approvalPath = process.argv[2];
  if (approvalPath === undefined || !existsSync(approvalPath)) throw new Error('usage: integrate.ts <approval.json> [pngDir]; approval.json is required (art-autonomy rule 1)');
  const pngDir = resolve(process.argv[3] ?? resolve(dirname(approvalPath), 'out'));
  const jobs = planJobs(JSON.parse(readFileSync(approvalPath, 'utf8')) as unknown, pngDir);
  const outDir = resolve(root, 'public/assets', OUT_URL_DIR);
  mkdirSync(outDir, { recursive: true });
  for (const j of jobs) {
    execFileSync('python3', ['-I', resolve(import.meta.dirname, 'convert.py'), j.src, resolve(root, 'public/assets', j.url), String(j.width), String(j.height)]);
    console.log(`${basename(j.src)} -> ${j.url}`);
  }
  const indexPath = resolve(outDir, 'splash.json');
  const prev = existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, 'utf8')) as SplashIndex) : {};
  writeFileSync(indexPath, `${JSON.stringify(mergeIndex(prev, jobs), null, 2)}\n`);
}
