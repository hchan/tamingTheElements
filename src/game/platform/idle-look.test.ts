import { describe, expect, it } from 'vitest';
import { CHARACTERS, ELEMENTS } from '@core/index';
import { ELEMENT_IDLE_DEFAULTS, IDLE_LOOKS, idleLookOf } from './idle-look';

/** Sprites that intentionally have no idle look. */
const ALLOW_NONE = new Set(['dummyTarget']);

describe('idle looks', () => {
  it('every character sprite resolves to a look (only the allow-list may be none)', () => {
    for (const c of CHARACTERS) {
      const look = idleLookOf(c.sprite, c.element);
      if (ALLOW_NONE.has(c.sprite)) expect(look.element, c.sprite).toBe('none');
      else expect(look.element, c.sprite).not.toBe('none');
    }
  });
  it('a row agrees with its character element, and no row is stale', () => {
    const sprites = new Map(CHARACTERS.map((c) => [c.sprite, c.element]));
    for (const [sprite, look] of Object.entries(IDLE_LOOKS)) {
      expect(sprites.has(sprite), `stale row ${sprite}`).toBe(true);
      if (!ALLOW_NONE.has(sprite)) expect(look.element, sprite).toBe(sprites.get(sprite));
    }
    for (const s of ALLOW_NONE) expect(sprites.has(s), `stale allow-list ${s}`).toBe(true);
  });
  it('every core element has a default of its own element', () => {
    for (const el of ELEMENTS) {
      expect(ELEMENT_IDLE_DEFAULTS[el].element).toBe(el);
      expect(idleLookOf('unknownNewHero', el)).toBe(ELEMENT_IDLE_DEFAULTS[el]);
    }
    expect(idleLookOf('x', 'plasma').element).toBe('none');
  });
  it('amounts and mouth anchors are in range', () => {
    for (const look of [...Object.values(IDLE_LOOKS), ...Object.values(ELEMENT_IDLE_DEFAULTS)]) {
      expect(look.amount).toBeGreaterThanOrEqual(0);
      expect(look.amount).toBeLessThanOrEqual(1);
      for (const f of look.mouth ?? []) {
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }
    }
  });
});
