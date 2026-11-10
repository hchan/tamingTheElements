// Stage 1 of the asset pipeline: copy the legacy runtime assets listed in the manifest into public/.
// Run: pnpm assets:build. Idempotent; verifies sha256 of every copied file. Never touches war/.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import manifest from '../../src/game/assets/manifest.generated.json' with { type: 'json' };

const root = resolve(import.meta.dirname, '../..');
const legacyDir = resolve(root, 'war/WEB-INF/private');
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

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

if (import.meta.main) {
  let copied = 0;
  const skipped: string[] = [];
  for (const url of manifestUrls()) {
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
  const faviconSrc = resolve(root, 'war/favicon.png');
  const favicon = resolve(root, 'public/favicon.png');
  mkdirSync(dirname(favicon), { recursive: true });
  copyFileSync(faviconSrc, favicon);
  if (sha256(favicon) !== sha256(faviconSrc)) throw new Error('sha256 mismatch: favicon.png');
  console.log(`copied ${copied} assets + favicon; skipped known-missing: ${skipped.join(', ') || 'none'}`);
}
