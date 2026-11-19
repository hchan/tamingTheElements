import { ALL_ABILITIES, ARCADE_SNAG_SLOT, getCharacter, type CharacterId } from '@core/index';
import { abilityShortOfSprite } from '../hud/kit-names';

/** The two action-bar names of a hero's ability boxes ("Blast", "Flame"), as the bar's label strip shows them; the Snag box reads "Snag". Undefined for an unknown hero. */
export function leadAbilityNames(hero: string): readonly [string, string] | undefined {
  let abilities: readonly string[];
  try { abilities = getCharacter(hero as CharacterId).abilities; } catch { return undefined; }
  const snagSlot = ARCADE_SNAG_SLOT[hero];
  const name = (slot: number): string => {
    if (slot === snagSlot) return 'Snag';
    const def = ALL_ABILITIES.find((d) => d.id === abilities[slot]);
    return (def === undefined ? undefined : abilityShortOfSprite(def.sprite)) ?? (slot === 0 ? 'Attack' : 'Second attack');
  };
  return [name(0), name(1)];
}
