import { describe, expect, it } from 'vitest';
import { ABILITIES_A, ABILITIES_B, CHARACTERS, getCharacter } from '@core/menu-index';
import type { CharacterId } from '@core/menu-index';
import { ELEMENT_ORDER, HERO_COLUMNS, describeAbilityLine, heroProfile, heroesByElement } from './hero-info';

const PLAYABLE = CHARACTERS.filter((c) => ELEMENT_ORDER.includes(c.element)).map((c) => c.id);
const FORBIDDEN = /classic|arcade|ruleset|capture/i;

describe('heroesByElement', () => {
  it('groups the playable heroes three per element in water, air, fire, earth order', () => {
    const order = heroesByElement(PLAYABLE);
    expect(order).toHaveLength(PLAYABLE.length);
    expect(PLAYABLE.length).toBe(ELEMENT_ORDER.length * HERO_COLUMNS);
    ELEMENT_ORDER.forEach((el, row) => {
      for (let c = 0; c < HERO_COLUMNS; c++) {
        expect(getCharacter(order[row * HERO_COLUMNS + c] as CharacterId).element).toBe(el);
      }
    });
  });

  it('keeps the input order within an element', () => {
    const rev = [...PLAYABLE].reverse();
    const order = heroesByElement(rev);
    expect(order.filter((id) => getCharacter(id).element === 'fire')).toEqual(rev.filter((id) => getCharacter(id).element === 'fire'));
  });
});

describe('heroProfile', () => {
  it('has a name, element, sprite, stats from the data and at least one ability for every playable hero', () => {
    for (const id of PLAYABLE) {
      const p = heroProfile(id);
      const ch = getCharacter(id);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.element).toBe(ch.element);
      expect(p.sprite).toBe(ch.sprite);
      expect(p.stats).toContainEqual(['Life', String(ch.maxHealth)]);
      expect(p.stats).toContainEqual(['Speed', String(ch.speed)]);
      expect(p.abilities.length).toBeGreaterThan(0);
    }
  });

  it('gives each ability a name, a key and a one-line description with its cooldown, and no retired words', () => {
    for (const id of PLAYABLE) {
      const p = heroProfile(id);
      expect(p.abilities.map((a) => a.key)).toEqual(['Space', 'Enter'].slice(0, p.abilities.length));
      for (const a of p.abilities) {
        expect(a.name.length).toBeGreaterThan(0);
        expect(a.description).toMatch(/\.$/);
        expect(a.description).not.toMatch(/\n/);
        expect(`${a.name} ${a.kind} ${a.description} ${p.blurb}`).not.toMatch(FORBIDDEN);
      }
    }
  });

  it('shows the data numbers: damage and cooldown come from the ability definitions', () => {
    const defs = [...ABILITIES_A, ...ABILITIES_B];
    for (const id of PLAYABLE) {
      const ch = getCharacter(id);
      const p = heroProfile(id);
      ch.abilities.forEach((aid, i) => {
        const def = defs.find((d) => d.id === aid);
        const a = p.abilities[i];
        if (!def || !a || def.kind === 'capture' || a.kind === 'Snag') return;
        expect(a.description).toContain(`Cooldown ${String(Math.round(def.cooldownMs / 100) / 10)} s.`);
      });
    }
  });

  it('replaces the capture ability with the Snag text', () => {
    const snagKinds = PLAYABLE.flatMap((id) => heroProfile(id).abilities.filter((a) => a.kind === 'Snag'));
    expect(snagKinds.length).toBeGreaterThan(0);
    for (const a of snagKinds) expect(a.name).toBe('Snag');
  });
});

describe('describeAbilityLine', () => {
  it('states damage for a ranged ability', () => {
    const def = ABILITIES_A.find((d) => d.kind === 'range' && (d.damage ?? 0) > 0);
    expect(def).toBeDefined();
    if (def) expect(describeAbilityLine(def)).toContain(`${String(def.damage)} damage`);
  });
});
