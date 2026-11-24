import { describe, expect, it } from 'vitest';
import { POP_SCALE, VICTORY_HEROES, victoryFlashFor, victoryFlashFrames, victoryStillFor, victoryStillUrl } from './victory-still';

describe('victory still gate', () => {
  it('covers the eleven approved roster24 heroes', () => {
    expect([...VICTORY_HEROES]).toEqual(['glimmaw', 'brazgor', 'kindrel', 'vortigal', 'zephra', 'nykra', 'hyalia', 'ouroth', 'umbrel', 'abyssor', 'durrok']);
  });
  it('needs a win, the hero, ?ff=roster24 and a dev or test build', () => {
    expect(victoryStillFor('glimmaw', true, '?ff=roster24', true, '/')).toBe('/assets/img/victory/glimmaw_victory.png');
    expect(victoryStillFor('glimmaw', false, '?ff=roster24', true, '/')).toBeNull();
    expect(victoryStillFor('glimmaw', true, '', true, '/')).toBeNull();
    expect(victoryStillFor('glimmaw', true, '?ff=roster24', false, '/')).toBeNull();
    expect(victoryStillFor('zephra', true, '?ff=roster24', true, '/')).toBe('/assets/img/victory/zephra_victory.png');
    expect(victoryStillFor('zephra', true, '', false, '/')).toBe('/assets/img/victory/zephra_victory.png'); // released
    expect(victoryStillFor('fiara', true, '?ff=roster24', true, '/')).toBeNull();
  });
  it('honours a base path', () => {
    expect(victoryStillUrl('/tte', 'glimmaw')).toBe('/tte/assets/img/victory/glimmaw_victory.png');
  });
});

describe('victory flash fallback (no still)', () => {
  it('applies to quarrak only on a win with the flag and motion allowed', () => {
    expect(victoryFlashFor('quarrak', true, '?ff=roster24', true, false)).toBe(true);
    expect(victoryFlashFor('quarrak', true, '?ff=roster24', true, true)).toBe(false);
    expect(victoryFlashFor('quarrak', false, '?ff=roster24', true, false)).toBe(false);
    expect(victoryFlashFor('quarrak', true, '', true, false)).toBe(false);
    expect(victoryFlashFor('quarrak', true, '?ff=roster24', false, false)).toBe(false);
    expect(victoryFlashFor('glimmaw', true, '?ff=roster24', true, false)).toBe(false);
    expect(victoryStillFor('quarrak', true, '?ff=roster24', true, '/')).toBeNull();
  });
  it('pops about 6% and settles back', () => {
    const f = victoryFlashFrames();
    expect(POP_SCALE).toBeCloseTo(1.06);
    expect(f.map((k) => k.transform)).toEqual(['scale(1)', 'scale(1.06)', 'scale(1)']);
  });
});
