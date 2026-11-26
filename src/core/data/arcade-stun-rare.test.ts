import { describe, expect, it } from 'vitest';
import { ALL_ABILITIES } from './abilities-all';
import { HIT_STUN_OVERRIDE, HIT_STUN_TICKS, HitStrength, hitStrengthFor, hitStunFor } from './arcade';

/** SIM_VERSION 117: stun is a rare skill; every other ability only flinches (the heavy hit-stun at most). */
const REAL_STUNS = ['tornado', 'ice-blast', 'wyrm-coil'];

describe('stun is rare (SIM_VERSION 117)', () => {
  it('only Tornado, Ice Blast and Wyrm Coil stun longer than a heavy hit', () => {
    const heavy = HIT_STUN_TICKS[2];
    const longer = Object.keys(HIT_STUN_OVERRIDE).filter((slug) => hitStunFor(slug, 2) > heavy).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(longer).toEqual([...REAL_STUNS].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it('Tornado, Ice Blast and Wyrm Coil are not super hits, so they obey both stun caps', () => {
    for (const slug of REAL_STUNS) {
      const def = ALL_ABILITIES.find((d) => d.id === slug);
      expect(def, slug).toBeDefined();
      const strength = hitStrengthFor(slug, def?.damage ?? 0, def?.kind === 'melee');
      expect(strength, slug).toBeLessThan(HitStrength.super);
    }
  });

  it('no strength table entry outside the supers stuns longer than a flinch', () => {
    expect(HIT_STUN_TICKS.slice(0, 3).every((t) => t <= 20)).toBe(true);
  });
});
