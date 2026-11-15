import { ALL_ABILITIES, ABILITY_NAMES, TRAP_DESCRIPTIONS, TRAP_NAMES } from '@core/index';

/**
 * Kit-specific words for the action bar (ideas/brainstorm/action-bar-rethink-hero-kits.md, presentation slice): each hero's two ability
 * boxes wear the ability's own name and the Trap box wears the trap its element really plants, instead of the generic Attack, Special
 * and Trap. Display only: the sim is untouched, and every name is one the Guide already shows (`ABILITY_NAMES`, `TRAP_NAMES`).
 */

/** Short forms for the label strip (a strip holds about nine letters at the 10 px floor); everything else uses the full name. */
const SHORT: Readonly<Record<string, string>> = {
  'circus-of-slime': 'Slime Ring',
  'strangling-branches': 'Branches',
  'translucent-flame': 'Flame',
  'entangling-vines': 'Vines',
  'shards-of-ice': 'Shards',
  'crimson-fire': 'Crimson',
  'steal-health': 'Steal',
  'ground-shock': 'Shock',
  'rock-armour': 'Rock Armr',
  'rock-pellet': 'Pellet',
  'sonar-blast': 'Sonar',
  'slime-blast': 'Slime',
  'fire-dance': 'Dance',
  'fire-blast': 'Blast',
  'cinder-spray': 'Cinder',
  'boulder-roll': 'Boulder',
  'stinging-filament': 'Filament',
  'forge-gore': 'Gore',
  'molten-hide': 'Mol. Hide',
  'abyss-flash': 'Flash',
  'bristle-stomp': 'Stomp',
  'static-mote': 'Mote',
};

const BY_SPRITE = new Map<string, string>(ALL_ABILITIES.map((d) => [d.sprite, d.id]));

/** The ability id behind a bar sprite key, or undefined (empty, unknown). */
export function abilityIdOfSprite(sprite: string): string | undefined {
  return sprite === '' ? undefined : BY_SPRITE.get(sprite);
}

/** Full player-facing ability name for a bar sprite ("Shards of Ice"), or undefined. */
export function abilityNameOfSprite(sprite: string): string | undefined {
  const id = abilityIdOfSprite(sprite);
  return id === undefined ? undefined : ABILITY_NAMES.get(id as never);
}

/** The compact name that fits a label strip ("Shards"), or undefined. */
export function abilityShortOfSprite(sprite: string): string | undefined {
  const id = abilityIdOfSprite(sprite);
  if (id === undefined) return undefined;
  return SHORT[id] ?? abilityNameOfSprite(sprite);
}

/** The trap a hero of element `kind` plants (1 fire, 2 water, 3 earth, 4 air: the `TrapKind` order): its name, else 'Trap'. */
export function trapNameOfElement(kind: number | undefined): string {
  const n = kind === undefined ? '' : (TRAP_NAMES[kind] ?? '');
  return n === '' ? 'Trap' : n;
}

/** The label-strip form of the trap name ("Bomb" for the Fire Bomb: "Fire Bomb 0/2" would shrink below the 10 px floor on a phone). */
export function trapShortOfElement(kind: number | undefined): string {
  const n = trapNameOfElement(kind);
  return n === 'Fire Bomb' ? 'Bomb' : n;
}

/** One-line effect of the trap a hero of element `kind` plants, else undefined. */
export function trapTextOfElement(kind: number | undefined): string | undefined {
  const t = kind === undefined ? '' : (TRAP_DESCRIPTIONS[kind] ?? '');
  return t === '' ? undefined : t;
}
