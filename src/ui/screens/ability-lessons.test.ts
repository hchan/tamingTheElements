import { describe, expect, it } from 'vitest';
import { ARCADE_SNAG_SLOT, CHARACTERS, ROSTER_24_CHARACTERS, characterId, isLegacyCharacter, isReleased } from '@core/index';
import { DEFAULT_BINDINGS, rebind } from '../../game/platform/input/bindings';
import { ABILITY_LESSONS, SNAG_LESSON, lessonsFor, promptFor } from './ability-lessons';

/** The legacy 14 plus RELEASED_ROSTER24 (src/core/data/release.ts). */
const RELEASED = CHARACTERS.filter((c) => isLegacyCharacter(c.id) || isReleased(c.id));
const BANNED = /\b(classic|arcade|ruleset|capture)\b/i;

describe('ability lessons', () => {
  it('covers every ability of every released hero', () => {
    expect(RELEASED.length).toBeGreaterThanOrEqual(14);
    for (const c of RELEASED) {
      const lessons = lessonsFor(c.id);
      expect(lessons).toHaveLength(c.abilities.length);
      for (const l of lessons) {
        expect(l, c.id).toBeDefined();
        expect(l?.line.length, c.id).toBeGreaterThan(0);
        expect(l?.tip.length, c.id).toBeGreaterThan(0);
      }
      for (const a of c.abilities) expect(ABILITY_LESSONS.has(a), a).toBe(true);
    }
  });

  it('puts the Snag lesson on the rope box of the heroes that carry it', () => {
    for (const id of ['wispera', 'echo']) expect(ARCADE_SNAG_SLOT[id]).toBe(0);
    for (const [id, slot] of Object.entries(ARCADE_SNAG_SLOT)) {
      const lessons = lessonsFor(characterId(id));
      expect(lessons[slot as number]).toBe(SNAG_LESSON);
      expect(lessons[1 - (slot as number)]).not.toBe(SNAG_LESSON);
    }
    expect(lessonsFor(characterId('fiara')).includes(SNAG_LESSON)).toBe(false);
  });

  it('pins the Quarrak lessons', () => {
    expect(lessonsFor(characterId('quarrak')).map((l) => l?.abilityId)).toEqual(['hurl-rock', 'boulder-roll']);
    expect(ABILITY_LESSONS.get('boulder-roll')?.line).toContain('knocks the foe back');
  });

  it('pins the Nykra lessons', () => {
    expect(lessonsFor(characterId('nykra')).map((l) => l?.abilityId)).toEqual(['hoof-crash', 'kelp-lash']);
    expect(ABILITY_LESSONS.get('hoof-crash')?.line).toContain('heavy stomp');
  });

  it('pins the Abyssor lessons', () => {
    expect(lessonsFor(characterId('abyssor')).map((l) => l?.abilityId)).toEqual(['tentacle-lash', 'abyssal-pull']);
    expect(ABILITY_LESSONS.get('abyssal-pull')?.line).toContain('drags the foe in');
  });

  it('pins the Vortigal lessons', () => {
    expect(lessonsFor(characterId('vortigal')).map((l) => l?.abilityId)).toEqual(['stoop', 'talon-rake']);
    expect(ABILITY_LESSONS.get('talon-rake')?.line).toContain('wound');
  });

  it('has Umbrel lessons ready while the hero is still hidden', () => {
    const lessons = lessonsFor(characterId('umbrel'));
    expect(lessons).toHaveLength(2);
    expect(lessons.map((l) => l?.abilityId)).toEqual(['spore-burst', 'mycelium-mend']);
  });

  it('has Glimmaw lessons ready while the hero is still hidden', () => {
    const lessons = lessonsFor(characterId('glimmaw'));
    expect(lessons).toHaveLength(2);
    expect(lessons.map((l) => l?.abilityId)).toEqual(['lure-orb', 'abyss-flash']);
  });

  it('has Durrok lessons ready while the hero is still hidden', () => {
    const lessons = lessonsFor(characterId('durrok'));
    expect(lessons).toHaveLength(2);
    expect(lessons.map((l) => l?.abilityId)).toEqual(['tusk-gore', 'bristle-stomp']);
  });

  it('has Zephra lessons ready while the hero is still hidden', () => {
    const lessons = lessonsFor(characterId('zephra'));
    expect(lessons).toHaveLength(2);
    expect(lessons.map((l) => l?.abilityId)).toEqual(['static-mote', 'skitter']);
  });

  it('has Hyalia lessons ready while the hero is still hidden', () => {
    const lessons = lessonsFor(characterId('hyalia'));
    expect(lessons).toHaveLength(2);
    expect(lessons.map((l) => l?.abilityId)).toEqual(['stinging-filament', 'bell-pulse']);
  });

  it('has Ouroth lessons ready while the hero is still hidden', () => {
    const lessons = lessonsFor(characterId('ouroth'));
    expect(lessons).toHaveLength(2);
    expect(lessons.map((l) => l?.abilityId)).toEqual(['wyrm-coil', 'scorch-breath']);
  });

  it('has a lesson row for every roster24 ability, released or not', () => {
    for (const c of ROSTER_24_CHARACTERS) for (const a of c.abilities) expect(ABILITY_LESSONS.has(a), `${c.id} ${a}`).toBe(true);
  });

  it('never uses the retired words', () => {
    for (const l of [...ABILITY_LESSONS.values(), SNAG_LESSON]) expect(`${l.line} ${l.tip}`).not.toMatch(BANNED);
  });
});

describe('promptFor', () => {
  it('shows the default keyboard key and pad button', () => {
    expect(promptFor(0, DEFAULT_BINDINGS, {})).toBe('1 / A');
    expect(promptFor(1, DEFAULT_BINDINGS, {})).toBe('2 / B');
  });

  it('shows rebinds and pad overrides', () => {
    const b = rebind(DEFAULT_BINDINGS, 'slot1', ['KeyJ']);
    expect(promptFor(0, b, { primary: 2 })).toBe('J / X');
    expect(promptFor(1, b, { secondary: 5 })).toBe('2 / RB');
  });

  it('reads unbound when a key is cleared', () => {
    expect(promptFor(0, rebind(DEFAULT_BINDINGS, 'slot1', []), {})).toBe('unbound / A');
  });
});
