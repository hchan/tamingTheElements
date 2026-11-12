import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '@core/index';
import { elementCue } from '../../src/game/hud/bars';
import { ELEMENT_MARKS } from '../../src/ui/element-marks';

describe('element glyphs', () => {
  it('the Versus roster (ui) uses the same glyph as the battle HUD word cue (game)', () => {
    for (const e of ELEMENTS) expect(elementCue(e).startsWith(ELEMENT_MARKS[e] ?? '?')).toBe(true);
  });
});
