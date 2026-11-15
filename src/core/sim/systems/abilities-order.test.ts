import { describe, expect, it } from 'vitest';
import { MAX_ABILITY_DEFS } from '../state';
import { ABILITY_DEFS } from './melee';
import { ABILITY_DEFS as PROJECTILE_DEFS } from './projectile';

/**
 * An ability's defId is its index in ABILITY_DEFS and is hashed (entity `defId`), so the order is append-only: new
 * abilities go at the end, existing indices never move (roster plan WP 0.1, SIM_VERSION 68).
 */
const PINNED = [
  'capture', 'wind-cone', 'tornado', 'stick', 'fire-blast', 'icicles', 'hurl-rock', 'sonar-blast', 'fireball',
  'crimson-fire', 'rock-pellet', 'slime-blast', 'shards-of-ice', 'circus-of-slime', 'chaos-bolt', 'chaos-orb',
  'elemental-advantage-fire-cone', 'ground-shock', 'adrenaline', 'translucent-flame', 'ice-blast', 'steal-health',
  'fire-heal', 'ice-shock', 'rock-armour', 'hurricane', 'fade', 'fire-dance', 'strangling-branches', 'entangling-vines',
] as const;

describe('ability def order', () => {
  it('pins indices 0-29 by id (append-only)', () => {
    expect(ABILITY_DEFS.slice(0, PINNED.length).map((d) => d.id)).toEqual(PINNED);
  });

  it('melee and projectile index the same table', () => {
    expect(PROJECTILE_DEFS.map((d) => d.id)).toEqual(ABILITY_DEFS.map((d) => d.id));
  });

  it('ids are unique and every index is below MAX_ABILITY_DEFS', () => {
    expect(new Set(ABILITY_DEFS.map((d) => d.id)).size).toBe(ABILITY_DEFS.length);
    expect(ABILITY_DEFS.length).toBeLessThan(MAX_ABILITY_DEFS);
  });
});
