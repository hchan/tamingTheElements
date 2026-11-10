// Shared helpers for the visual QA pipeline (docs/VISUAL-QA.md). Page-side code is passed as strings because tsconfig.node
// has no DOM lib.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

export { ARENA_READY, START, characters, collectErrors, fixture, goToHash, seedViaGameMaster, startBattle, waitForRoute } from '../e2e/parity/helpers';

export interface Vp {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly mobile: boolean;
}

export const VIEWPORTS: readonly Vp[] = [
  { key: '1280x720', width: 1280, height: 720, mobile: false },
  { key: '390x844', width: 390, height: 844, mobile: true },
];

export const OUT_DIR = join(process.cwd(), 'test-results', 'visual');
export const MANIFEST = join(OUT_DIR, 'manifest.json');

export interface ManifestEntry {
  readonly name: string;
  readonly file: string;
  readonly viewport: string;
  readonly screen: string;
  readonly note: string;
  readonly bytes: number;
  readonly sha256: string;
  /** False for shots that depend on wall-clock time (cinematic frames). */
  readonly deterministic: boolean;
}

interface Manifest {
  version: 1;
  entries: ManifestEntry[];
}

function readManifest(): Manifest {
  if (!existsSync(MANIFEST)) return { version: 1, entries: [] };
  return JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
}

/** Hides animation, transitions, carets and the mouse cursor so DOM screens are stable. */
export async function freeze(page: Page): Promise<void> {
  await page.addStyleTag({
    content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;cursor:none!important}',
  });
}

/** Regions that legitimately change between runs; masked in regression shots. */
export function masks(page: Page): ReturnType<Page['locator']>[] {
  return [page.locator('#versionStamp'), page.locator('#fpsOverlay')];
}

/** Saves `<name>-<viewport>.png` under test-results/visual/ and records it in manifest.json (replacing a same-named entry). */
export async function shoot(
  page: Page,
  vp: Vp,
  screen: string,
  state: string,
  note: string,
  deterministic = true,
): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const name = `${state}-${vp.key}`;
  const file = `${name}.png`;
  const buf = await page.screenshot({
    path: join(OUT_DIR, file),
    animations: 'disabled',
    caret: 'hide',
  });
  const m = readManifest();
  const entry: ManifestEntry = {
    name,
    file,
    viewport: vp.key,
    screen,
    note,
    bytes: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    deterministic,
  };
  m.entries = [...m.entries.filter((e) => e.name !== name), entry].sort((a, b) => a.name.localeCompare(b.name));
  writeFileSync(MANIFEST, `${JSON.stringify(m, null, 2)}\n`);
}

/** Layout facts recorded next to the pixels so a reviewer sees the numbers behind "not centred". */
export async function canvasBox(page: Page): Promise<{ x: number; y: number; w: number; h: number; iw: number; ih: number } | null> {
  return page.evaluate(`(() => {
    const c = document.querySelector('#game canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, iw: window.innerWidth, ih: window.innerHeight };
  })()`);
}

export const STEP = (n: number, a: number, b: number): string => `window.__TTE__.arena.step(${String(n)}, [${String(a)}, ${String(b)}])`;

/** Command bits (src/core/sim/commands.ts). */
export const CMD = {
  up: 1, down: 2, left: 4, right: 8, primary: 16, secondary: 32, capture: 64, dash: 1 << 11, guard: 1 << 12, super: 1 << 13,
  weather: 1 << 14, charge: 1 << 15,
} as const;
