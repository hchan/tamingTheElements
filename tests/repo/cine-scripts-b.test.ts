import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CALL_OF_THE_TAMER_SCRIPT } from '../../src/game/cinematics/scripts/call-of-the-tamer';
import { DISTURBANCE_SCRIPT } from '../../src/game/cinematics/scripts/disturbance';
import {
  CHAPTER_1_OBJECTIVES,
  RESTORING_BALANCE_SCRIPT,
} from '../../src/game/cinematics/scripts/restoring-balance';

const legacy = readFileSync('war/WEB-INF/private/src/scenes.js', 'utf8').replace(
  /"\s*\+\s*\n\s*"/g,
  '',
);

describe('cinematic scripts b', () => {
  for (const s of [CALL_OF_THE_TAMER_SCRIPT, RESTORING_BALANCE_SCRIPT]) {
    it(`${s.id} text matches legacy scenes.js verbatim`, () => {
      expect(legacy).toContain(`GameHelper.createScene("${s.title}"`);
      expect(legacy).toContain(`"${s.caption.text}"`);
    });
  }

  it('dark voice line matches legacy verbatim', () => {
    const voice = RESTORING_BALANCE_SCRIPT.finale?.voice ?? '';
    expect(legacy).toContain(`text("${voice}")`);
  });

  it('chains disturbance -> tamer -> balance -> chapter 1 objectives', () => {
    expect(DISTURBANCE_SCRIPT.next).toBe(CALL_OF_THE_TAMER_SCRIPT.id);
    expect(CALL_OF_THE_TAMER_SCRIPT.next).toBe(RESTORING_BALANCE_SCRIPT.id);
    expect(RESTORING_BALANCE_SCRIPT.next).toBe(CHAPTER_1_OBJECTIVES);
  });
});
