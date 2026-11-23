import { describe, expect, it } from 'vitest';
import { VICTORY_HEROES, victoryStillFor, victoryStillUrl } from './victory-still';

describe('victory still gate', () => {
  it('covers the seven approved roster24 heroes', () => {
    expect([...VICTORY_HEROES]).toEqual(['glimmaw', 'brazgor', 'kindrel', 'vortigal', 'zephra', 'nykra', 'hyalia']);
  });
  it('needs a win, the hero, ?ff=roster24 and a dev or test build', () => {
    expect(victoryStillFor('glimmaw', true, '?ff=roster24', true, '/')).toBe('/assets/img/victory/glimmaw_victory.png');
    expect(victoryStillFor('glimmaw', false, '?ff=roster24', true, '/')).toBeNull();
    expect(victoryStillFor('glimmaw', true, '', true, '/')).toBeNull();
    expect(victoryStillFor('glimmaw', true, '?ff=roster24', false, '/')).toBeNull();
    expect(victoryStillFor('zephra', true, '?ff=roster24', true, '/')).toBe('/assets/img/victory/zephra_victory.png');
    expect(victoryStillFor('fiara', true, '?ff=roster24', true, '/')).toBeNull();
  });
  it('honours a base path', () => {
    expect(victoryStillUrl('/tte', 'glimmaw')).toBe('/tte/assets/img/victory/glimmaw_victory.png');
  });
});
