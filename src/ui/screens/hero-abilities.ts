import { ABILITIES_A, ABILITIES_B, ABILITY_NAMES, getCharacter, type AbilityDef, type CharacterId } from '@core/index';

/** Player-facing word for each ability kind (text, so the summary never leans on colour or an icon alone). */
const KIND_WORDS: Readonly<Record<AbilityDef['kind'], string>> = {
  range: 'Ranged',
  omni: 'All round',
  melee: 'Melee',
  buff: 'Buff',
  debuff: 'Debuff',
  heal: 'Heal',
  capture: 'Snag',
};
/** A short mark per kind (decorative; the word beside it carries the meaning). */
const KIND_MARKS: Readonly<Record<AbilityDef['kind'], string>> = {
  range: '➤', omni: '✺', melee: '⚔', buff: '▲', debuff: '▼', heal: '✚', capture: '⌇',
};

export interface AbilityChip {
  readonly name: string;
  readonly kind: string;
  readonly mark: string;
}

const DEFS: ReadonlyMap<string, AbilityDef> = new Map([...ABILITIES_A, ...ABILITIES_B].map((a) => [a.id, a]));

/** The hero's abilities as name + kind word, from the shared data (display names in ABILITY_NAMES). */
export function abilityChips(id: CharacterId): AbilityChip[] {
  const out: AbilityChip[] = [];
  for (const aid of getCharacter(id).abilities) {
    const def = DEFS.get(aid);
    const name = ABILITY_NAMES.get(aid);
    if (!def || !name) continue;
    out.push({ name, kind: KIND_WORDS[def.kind], mark: KIND_MARKS[def.kind] });
  }
  return out;
}

/** Screen-reader sentence: "Abilities: Fireball, ranged; Fire Heal, heal." */
export function abilitiesSpeech(id: CharacterId): string {
  const chips = abilityChips(id);
  return chips.length === 0 ? '' : `Abilities: ${chips.map((c) => `${c.name}, ${c.kind.toLowerCase()}`).join('; ')}.`;
}
