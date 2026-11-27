import { describe, expect, it } from 'vitest';
import { KO_FALLBACK_HEROES } from './ko-fallback';
import { KO_STILL_HEROES, RESULT_STILL_SIZE, koStillFor, koStillUrl } from './ko-still';

describe('ko still', () => {
  it('covers the 16 approved heroes (files pinned in tests/repo/ko-frames), and none of them keeps the fallback', () => {
    expect([...KO_STILL_HEROES].sort()).toEqual(['abyssor', 'brazgor', 'curomo', 'durrok', 'glimmaw', 'hyalia', 'kindrel', 'nykra', 'ouroth', 'pax', 'quarrak', 'sindarosa', 'treenoc', 'umbrel', 'vortigal', 'zephra']);
    for (const h of KO_STILL_HEROES) {
      expect(KO_FALLBACK_HEROES.has(h), h).toBe(false);
    }
  });

  it('needs a loss and an eligible hero; released heroes need no flag', () => {
    expect(koStillFor('umbrel', true, '', false, '/')).toBe('/assets/img/ko/umbrel_ko.png');
    expect(koStillFor('nykra', true, '?ff=roster24', true, '/x')).toBe('/x/assets/img/ko/nykra_ko.png');
    expect(koStillFor('abyssor', true, '?ff=roster24', true, '/x')).toBe('/x/assets/img/ko/abyssor_ko.png');
    expect(koStillFor('nykra', false, '', false, '/')).toBeNull();
    expect(koStillFor('fiara', true, '', false, '/')).toBeNull();
    expect(koStillUrl('/g/', 'nykra')).toBe('/g/assets/img/ko/nykra_ko.png');
  });

  it('sizes result stills by height as well as width (aspect kept, not cropped) so the buttons stay above a 720p fold', () => {
    expect(RESULT_STILL_SIZE).toMatch(/max-width:min\(300px,60vw\)/);
    expect(RESULT_STILL_SIZE).toMatch(/max-height:min\(\d+px,\d+vh\)/);
    expect(RESULT_STILL_SIZE).toContain('object-fit:contain');
    expect(RESULT_STILL_SIZE).not.toMatch(/(^|;)height:\d/);
  });
});
