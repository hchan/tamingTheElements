// Stage 1 of the asset pipeline: copy the legacy runtime assets listed in the manifest into public/.
// Run: pnpm assets:build. Idempotent; verifies sha256 of every copied file. Reads the legacy tree restored by `pnpm oracle:restore` (.oracle/war); never writes it.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ORACLE_WAR, ORACLE_PRIVATE, oracleAvailable } from '../../src/testing/legacy/oracle';
import manifest from '../../src/game/assets/manifest.generated.json' with { type: 'json' };

const root = resolve(import.meta.dirname, '../..');
const legacyDir = ORACLE_PRIVATE;
const outDir = resolve(root, 'public/assets');

/** Manifest entries whose file is absent from the legacy tree (legacy bug; nothing to copy). */
const KNOWN_MISSING = new Set(['img/map/priaUnbalancedLarge.png']);

export function manifestUrls(): string[] {
  const urls = new Set<string>();
  for (const group of [manifest.sprites, manifest.mapSprites, manifest.backgrounds]) {
    for (const e of Object.values(group) as { url: string; urlLarge?: string }[]) {
      urls.add(e.url);
      if (e.urlLarge !== undefined) urls.add(e.urlLarge);
    }
  }
  for (const s of manifest.sounds) urls.add(s.url);
  return [...urls].sort();
}

/** Manifest URLs whose legacy file was redrawn in the repo; build-assets must never copy the legacy file over them. */
export const REDRAWN: ReadonlyMap<string, string> = new Map([
  ['img/map/wisperaLarge.png', 'tools/assets/wispera-art (owner-picked "Refined 2", 2026-11-16)'],
]);

/** The 12 unreleased Roster 24 heroes (behind `?ff=roster24`). Their map art is repo-owned (tools/assets/roster24-art, SDXL-Turbo, licence terms an open owner question): never copied from the legacy tree, and a missing file fails the build. */
export const ROSTER24_HEROES: readonly string[] = ['kindrel', 'nykra', 'quarrak', 'hyalia', 'brazgor', 'glimmaw', 'durrok', 'zephra', 'ouroth', 'abyssor', 'vortigal', 'umbrel'];
export const isRoster24Url = (url: string): boolean => ROSTER24_HEROES.some((h) => url === `img/map/${h}.png` || url === `img/map/${h}Large.png`);

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

if (import.meta.main) {
  if (!oracleAvailable()) throw new Error('legacy tree not found: run `pnpm oracle:restore` first');
  let copied = 0;
  const skipped: string[] = [];
  for (const url of manifestUrls()) {
    // Redrawn effect sprites are generated in the repo by tools/assets/fx-gen, not copied from the legacy tree.
    if (url.startsWith('img/fx/')) {
      if (!existsSync(resolve(outDir, url))) throw new Error(`generated asset missing (run tools/assets/fx-gen): ${url}`);
      continue;
    }
    if (isRoster24Url(url)) {
      if (!existsSync(resolve(outDir, url))) throw new Error(`roster24 asset missing (tools/assets/roster24-art): ${url}`);
      continue;
    }
    if (REDRAWN.has(url)) {
      if (!existsSync(resolve(outDir, url))) throw new Error(`redrawn asset missing: ${url} (${REDRAWN.get(url) ?? ''})`);
      continue;
    }
    const src = resolve(legacyDir, url);
    if (!existsSync(src)) {
      if (KNOWN_MISSING.has(url)) {
        skipped.push(url);
        continue;
      }
      throw new Error(`manifest asset missing from legacy tree: ${url}`);
    }
    const dest = resolve(outDir, url);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    if (sha256(src) !== sha256(dest)) throw new Error(`sha256 mismatch: ${url}`);
    copied++;
  }
  const faviconSrc = resolve(ORACLE_WAR, 'favicon.png');
  const favicon = resolve(root, 'public/favicon.png');
  mkdirSync(dirname(favicon), { recursive: true });
  copyFileSync(faviconSrc, favicon);
  if (sha256(favicon) !== sha256(faviconSrc)) throw new Error('sha256 mismatch: favicon.png');
  console.log(`copied ${copied} assets + favicon; skipped known-missing: ${skipped.join(', ') || 'none'}`);
}
