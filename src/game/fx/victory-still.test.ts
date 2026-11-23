import { describe, expect, it } from 'vitest';
import { VICTORY_HEROES, victoryStillFor, victoryStillUrl } from './victory-still';

describe('victory still gate', () => {
  it('covers Glimmaw only', () => {
    expect([...VICTORY_HEROES]).toEqual(['glimmaw']);
  });
  it('needs a win, the hero, ?ff=roster24 and a dev or test build', () => {
    expect(victoryStillFor('glimmaw', true, '?ff=roster24', true, '/')).toBe('/assets/img/victory/glimmaw_victory.png');
    expect(victoryStillFor('glimmaw', false, '?ff=roster24', true, '/')).toBeNull();
    expect(victoryStillFor('glimmaw', true, '', true, '/')).toBeNull();
    expect(victoryStillFor('glimmaw', true, '?ff=roster24', false, '/')).toBeNull();
    expect(victoryStillFor('fiara', true, '?ff=roster24', true, '/')).toBeNull();
  });
  it('honours a base path', () => {
    expect(victoryStillUrl('/tte', 'glimmaw')).toBe('/tte/assets/img/victory/glimmaw_victory.png');
  });
});
