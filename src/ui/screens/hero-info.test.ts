import { describe, expect, it } from 'vitest';
import { ABILITIES_A, ALL_ABILITIES, CHARACTERS, FIRE_BLAST_FALLOFF, HERO_STYLE, getCharacter, sizeOfSlug } from '@core/menu-index';
import type { CharacterId } from '@core/menu-index';
import { ELEMENT_ORDER, HERO_COLUMNS, describeAbilityLine, heroProfile, heroStyle, heroesByElement, sizeWord } from './hero-info';

const PLAYABLE = CHARACTERS.slice(0, 14).filter((c) => ELEMENT_ORDER.includes(c.element)).map((c) => c.id);
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
      expect(heroProfile(id, 123).stats).toContainEqual(['Life', '123']);
      expect(p.stats).toContainEqual(['Speed', String(ch.speed)]);
      expect(p.stats).toContainEqual(['Size', sizeWord(sizeOfSlug(id))]);
      expect(p.abilities.length).toBeGreaterThan(0);
    }
  });

  it('words the size stat as a multiplier from the size data', () => {
    expect(sizeWord(100)).toBe('1x');
    expect(sizeWord(150)).toBe('1.5x');
    expect(sizeWord(60)).toBe('0.6x');
    expect(heroProfile('rokcore' as CharacterId).stats).toContainEqual(['Size', '2x']);
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
    const defs = ALL_ABILITIES;
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

describe('fire blast falloff text', () => {
  it('shows on Sindarosa\'s Fire Blast only, and uses no forbidden words', () => {
    const abilities = heroProfile('sindarosa' as CharacterId).abilities;
    expect(abilities[0]?.description).toContain(FIRE_BLAST_FALLOFF);
    expect(abilities[1]?.description).not.toContain(FIRE_BLAST_FALLOFF);
    expect(FIRE_BLAST_FALLOFF).not.toMatch(FORBIDDEN);
  });
});

describe('heroStyle', () => {
  it('reads HERO_STYLE for every styled hero (one source)', () => {
    for (const id of Object.keys(HERO_STYLE) as CharacterId[]) expect(heroStyle(id)).toBe(HERO_STYLE[id]);
  });
});
