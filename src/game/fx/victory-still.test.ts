import { describe, expect, it } from 'vitest';
import { ELEMENT_COLORS } from './element-colors';
import { POP_SCALE, flashElementOf, VICTORY_HEROES, victoryFlashFor, victoryFlashFrames, victoryStillFor, victoryStillUrl } from './victory-still';

describe('victory still gate', () => {
  it('covers the eleven approved roster24 heroes', () => {
    expect([...VICTORY_HEROES]).toEqual(['glimmaw', 'brazgor', 'kindrel', 'vortigal', 'zephra', 'nykra', 'hyalia', 'ouroth', 'umbrel', 'abyssor', 'durrok']);
  });
  it('needs a win, the hero, ?ff=roster24 and a dev or test build', () => {
    expect(victoryStillFor('kindrel', true, '?ff=roster24', true, '/')).toBe('/assets/img/victory/kindrel_victory.png');
    expect(victoryStillFor('kindrel', false, '?ff=roster24', true, '/')).toBeNull();
    expect(victoryStillFor('kindrel', true, '', true, '/')).toBeNull();
    expect(victoryStillFor('kindrel', true, '?ff=roster24', false, '/')).toBeNull();
    expect(victoryStillFor('zephra', true, '?ff=roster24', true, '/')).toBe('/assets/img/victory/zephra_victory.png');
    expect(victoryStillFor('zephra', true, '', false, '/')).toBe('/assets/img/victory/zephra_victory.png'); // released
    expect(victoryStillFor('vortigal', true, '', false, '/')).toBe('/assets/img/victory/vortigal_victory.png');
    expect(victoryStillFor('durrok', true, '', false, '/')).toBe('/assets/img/victory/durrok_victory.png');
    expect(victoryStillFor('glimmaw', true, '', false, '/')).toBe('/assets/img/victory/glimmaw_victory.png');
    expect(victoryStillFor('hyalia', true, '', false, '/')).toBe('/assets/img/victory/hyalia_victory.png');
    expect(victoryStillFor('brazgor', true, '', false, '/')).toBe('/assets/img/victory/brazgor_victory.png');
    expect(victoryStillFor('ouroth', true, '', false, '/')).toBe('/assets/img/victory/ouroth_victory.png');
    expect(victoryStillFor('fiara', true, '?ff=roster24', true, '/')).toBeNull();
  });
  it('honours a base path', () => {
    expect(victoryStillUrl('/tte', 'kindrel')).toBe('/tte/assets/img/victory/kindrel_victory.png');
  });
});

describe('victory flash fallback (no still)', () => {
  it('applies to quarrak only on a win with the flag and motion allowed', () => {
    expect(victoryFlashFor('quarrak', true, '?ff=roster24', true, false)).toBe(true);
    expect(victoryFlashFor('quarrak', true, '?ff=roster24', true, true)).toBe(false);
    expect(victoryFlashFor('quarrak', false, '?ff=roster24', true, false)).toBe(false);
    expect(victoryFlashFor('quarrak', true, '', true, false)).toBe(false);
    expect(victoryFlashFor('quarrak', true, '?ff=roster24', false, false)).toBe(false);
    expect(victoryFlashFor('kindrel', true, '?ff=roster24', true, false)).toBe(false);
    expect(victoryStillFor('quarrak', true, '?ff=roster24', true, '/')).toBeNull();
  });
  it('pops about 6% and settles back', () => {
    const f = victoryFlashFrames();
    expect(POP_SCALE).toBeCloseTo(1.06);
    expect(f.map((k) => k.transform)).toEqual(['scale(1)', 'scale(1.06)', 'scale(1)']);
  });
  it('tints the flash by the hero element: Quarrak is earth, so the earth colour and not the old gold', () => {
    expect(flashElementOf('quarrak')).toBe('earth');
    const earth = `#${ELEMENT_COLORS.earth.toString(16)}`;
    const f = victoryFlashFrames(flashElementOf('quarrak'));
    for (const k of [f[0], f[1]]) {
      expect(String(k?.['filter'])).toContain(earth);
      expect(String(k?.['filter'])).not.toContain('#ffe600');
    }
    expect(String(victoryFlashFrames('water')[0]?.['filter'])).not.toContain(earth);
  });
});
