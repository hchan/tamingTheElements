import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifestUrls, REDRAWN } from '../../tools/assets/build-assets';
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
