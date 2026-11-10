import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DISTURBANCE_SCRIPT } from '../../src/game/cinematics/scripts/disturbance';
import { PRIA_SCRIPT } from '../../src/game/cinematics/scripts/pria';

const legacy = readFileSync('war/WEB-INF/private/src/scenes.js', 'utf8').replace(
  /"\s*\+\s*\n\s*"/g,
  '',
);

describe('cinematic scripts a', () => {
  for (const s of [PRIA_SCRIPT, DISTURBANCE_SCRIPT]) {
    it(`${s.id} text matches legacy scenes.js verbatim`, () => {
      expect(legacy).toContain(`GameHelper.createScene("${s.title}"`);
      expect(legacy).toContain(`"${s.caption.text}"`);
    });
  }

  it('chains pria -> disturbance', () => {
    expect(PRIA_SCRIPT.next).toBe(DISTURBANCE_SCRIPT.id);
  });
});
