import { describe, expect, it } from 'vitest';
import { TIP_MAX_MS, tipExpired, slotTip, tipPlacement } from './action-bar';
import { COMMON_EFFECT, elementalEffect } from '../platform/ability-text';

const kinds = ['ability', 'capture', 'swap', 'trap', 'elemental', 'super', 'guard', 'dash', 'weather', 'charge', 'cleanse'] as const;

describe('slot tooltips', () => {
  it('every kind has a title and a one-line effect with no banned words', () => {
    for (const kind of kinds) {
      const t = slotTip({ kind, cmd: 0, element: kind === 'elemental' ? 1 : undefined });
      expect(t.title).not.toBe('');
      expect(t.text.length).toBeGreaterThan(10);
      expect(`${t.title} ${t.text}`).not.toMatch(/classic|arcade|ruleset|capture/i);
    }
  });
  it('uses the shared Guide text and names the elemental', () => {
    expect(slotTip({ kind: 'dash', cmd: 0 }).text).toBe(COMMON_EFFECT.dash);
    expect(slotTip({ kind: 'elemental', cmd: 0, element: 2 })).toEqual({ title: 'Tidecall', text: elementalEffect('water') });
    expect(slotTip({ kind: 'elemental', cmd: 0, element: 1 }).title).toBe('Ember');
  });
  it('places the tip above the box and inside the screen', () => {
    expect(tipPlacement({ x: 0, y: 640, size: 72 }, 300, 80)).toEqual({ x: 4, y: 552 });
    expect(tipPlacement({ x: 1250, y: 640, size: 72 }, 300, 80).x).toBe(1280 - 300 - 4);
  });
  it('a tip expires after TIP_MAX_MS so it can never stay pinned for a fight', () => {
    expect(tipExpired(1000, 1000 + TIP_MAX_MS - 1)).toBe(false);
    expect(tipExpired(1000, 1000 + TIP_MAX_MS)).toBe(true);
  });
});
