import { describe, expect, it } from 'vitest';
import { COMBAT_LOOKS, isMutedLight, type CombatTone } from './combat-text';

describe('combat text look', () => {
  it('every tone is a pale muted fill with a thin outline (no flat white or saturated yellow)', () => {
    for (const [tone, l] of Object.entries(COMBAT_LOOKS) as [CombatTone, (typeof COMBAT_LOOKS)[CombatTone]][]) {
      expect(isMutedLight(l.color) || tone === 'scaled', tone).toBe(true);
      expect(l.outline, tone).toBeLessThanOrEqual(4);
      expect(l.glowBlur, tone).toBeGreaterThan(0);
    }
  });
  it('rejects the old flat colours', () => {
    expect(isMutedLight('#ffffff')).toBe(false);
    expect(isMutedLight('#ffd23f')).toBe(false);
    expect(isMutedLight('#ffe066')).toBe(false);
  });
});
