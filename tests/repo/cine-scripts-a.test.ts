import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORACLE_PRIVATE, oracleAvailable } from '@testing/legacy/oracle';
import { DISTURBANCE_SCRIPT } from '../../src/game/cinematics/scripts/disturbance';
import { PRIA_SCRIPT } from '../../src/game/cinematics/scripts/pria';

// Oracle-only checks: they read scenes.js from the restored legacy tree (pnpm oracle:restore) and are skipped without it.
const oracle = oracleAvailable();
const legacy = oracle
  ? readFileSync(resolve(ORACLE_PRIVATE, 'src/scenes.js'), 'utf8').replace(/"\s*\+\s*\n\s*"/g, '')
  : '';

describe('cinematic scripts a', () => {
  for (const s of [PRIA_SCRIPT, DISTURBANCE_SCRIPT]) {
    it.skipIf(!oracle)(`${s.id} text matches legacy scenes.js verbatim`, () => {
      expect(legacy).toContain(`GameHelper.createScene("${s.title}"`);
      expect(legacy).toContain(`"${s.caption.text}"`);
    });
  }

  it('chains pria -> disturbance', () => {
    expect(PRIA_SCRIPT.next).toBe(DISTURBANCE_SCRIPT.id);
  });
});
