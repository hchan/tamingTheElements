import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isRoster24Url, manifestUrls, REDRAWN, ROSTER24_HEROES } from '../../tools/assets/build-assets';
import { CHARACTERS } from '../../src/core/data/characters';
import { RELEASED_CHARACTERS } from '../../src/game/app/arcade-pick';
import { ORACLE_PRIVATE, oracleAvailable } from '../../src/testing/legacy/oracle';

// Redrawn art (e.g. Wispera's portrait, tools/assets/wispera-art) keeps its legacy manifest URL; build-assets must never copy the legacy file over it.
const root = resolve(import.meta.dirname, '../..');

describe('build-assets REDRAWN guard', () => {
  it('every REDRAWN url is a manifest url and exists in public/assets', () => {
    const urls = new Set(manifestUrls());
    for (const url of REDRAWN.keys()) {
      expect(urls.has(url), url).toBe(true);
      expect(existsSync(resolve(root, 'public/assets', url)), url).toBe(true);
    }
  });

  it.skipIf(!oracleAvailable())('a redrawn file differs from the legacy oracle copy', () => {
    for (const url of REDRAWN.keys()) {
      const legacy = readFileSync(resolve(ORACLE_PRIVATE, url));
      const ours = readFileSync(resolve(root, 'public/assets', url));
      expect(ours.equals(legacy), url).toBe(false);
    }
  });
});

describe('build-assets roster24 guard', () => {
  it('the flagged heroes are exactly the unreleased characters, so none can slip into the released set', () => {
    const unreleased = CHARACTERS.slice(RELEASED_CHARACTERS).filter((c) => c.element !== 'void').map((c) => c.id);
    expect([...unreleased].sort()).toEqual([...ROSTER24_HEROES].sort());
  });

  it('every roster24 manifest url exists in public/assets, is flagged, and is not also REDRAWN', () => {
    const urls = manifestUrls();
    for (const h of ROSTER24_HEROES) {
      for (const url of [`img/map/${h}.png`, `img/map/${h}Large.png`]) {
        expect(urls.includes(url), url).toBe(true);
        expect(isRoster24Url(url), url).toBe(true);
        expect(REDRAWN.has(url), url).toBe(false);
        expect(existsSync(resolve(root, 'public/assets', url)), url).toBe(true);
      }
    }
  });
});
