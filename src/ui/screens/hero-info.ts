import {
  ALL_ABILITIES,
  ABILITY_NAMES,
  ARCADE_SNAG_SLOT,
  CHARACTER_TEXT,
  FIRE_BLAST_FALLOFF,
  SNAG_DESCRIPTION,
  SNAG_NAME,
  describeAbility,
  HERO_STYLE,
  SIZE_ONE,
  getCharacter,
  sizeOfSlug,
} from '@core/menu-index';
import type { AbilityDef, AbilityDefB, CharacterId, HeroStyle } from '@core/menu-index';

/**
 * What the hero select shows about a hero, generated from the character and ability data in `src/core/data` (never typed by hand),
 * so a retuned number or a new ability shows up here with no edit. Pure: no DOM.
 */

/** Element rows of the select, top to bottom. */
export const ELEMENT_ORDER: readonly string[] = ['water', 'air', 'fire', 'earth'];
/** Heroes per element in the released roster (three each), so the grid is three columns wide; see `heroColumns` for 24 heroes. */
export const HERO_COLUMNS = 3;
/** Columns on a phone, whatever the roster size: an element with six heroes wraps to two rows of three. */
export const PHONE_COLUMNS = 3;

/** Most heroes any one element has among `races`: the grid's width on desktop (3 for 12 heroes, 6 for 24). */
export function heroesPerElement(races: readonly CharacterId[]): number {
  const n = new Map<string, number>();
  for (const id of races) n.set(getCharacter(id).element, (n.get(getCharacter(id).element) ?? 0) + 1);
  return Math.max(HERO_COLUMNS, ...n.values());
}

/**
 * Columns the grid really has right now: the CSS grid's resolved track count (it is 3 on a phone and `heroesPerElement` on
 * desktop), or `fallback` where layout is unavailable (jsdom). The cursor's up and down move by this.
 */
export function heroColumns(grid: Element, fallback: number): number {
  const tracks = getComputedStyle(grid).gridTemplateColumns.trim();
  const n = tracks === '' || tracks === 'none' ? 0 : tracks.split(/\s+/).length;
  return n > 0 ? n : fallback;
}

export type { HeroStyle };

/** Player-facing word for a style (shown next to the badge icon, so the style is never colour or icon alone). */
export const STYLE_WORDS: Readonly<Record<HeroStyle, string>> = { melee: 'Melee', ranged: 'Ranged' };

/** Melee or ranged: `HERO_STYLE` (the one source) for a hero that has a row, else from the first ability's kind (a projectile means ranged). */
export function heroStyle(id: CharacterId): HeroStyle {
  const known = HERO_STYLE[id];
  if (known) return known;
  const first = DEFS.get(getCharacter(id).abilities[0] ?? '');
  return first?.kind === 'range' || first?.kind === 'omni' ? 'ranged' : 'melee';
}

/** Races sorted into element rows (stable within a row), the order the grid and its cursor use. */
export function heroesByElement(races: readonly CharacterId[]): CharacterId[] {
  const rank = (id: CharacterId): number => {
    const i = ELEMENT_ORDER.indexOf(getCharacter(id).element);
    return i < 0 ? ELEMENT_ORDER.length : i;
  };
  return races
    .map((id, i) => ({ id, i }))
    .sort((a, b) => rank(a.id) - rank(b.id) || a.i - b.i)
    .map((r) => r.id);
}

/** Player-facing word for each ability kind (text, so the panel never leans on colour or an icon alone). */
const KIND_WORDS: Readonly<Record<AbilityDef['kind'], string>> = {
  range: 'Ranged', omni: 'All round', melee: 'Melee', buff: 'Buff', debuff: 'Debuff', heal: 'Heal', capture: 'Snag',
};
/** A decorative mark per kind, the fallback icon. */
const KIND_MARKS: Readonly<Record<AbilityDef['kind'], string>> = {
  range: '➤', omni: '✺', melee: '⚔', buff: '▲', debuff: '▼', heal: '✚', capture: '⌇',
};

/** Keys of the two ability slots on the keyboard (Player 1's defaults, Player 2's fixed keys; `src/game/input`). */
const SLOT_KEYS: readonly (readonly [p1: string, p2: string])[] = [['Space', 'U'], ['Enter', 'O']];

const DEFS: ReadonlyMap<string, AbilityDef | AbilityDefB> = new Map(ALL_ABILITIES.map((a) => [a.id as string, a]));

/** Milliseconds as a short word: 0.6 s, 15 s. */
const secs = (ms: number): string => `${String(Math.round(ms / 100) / 10)} s`;

/** One plain line saying what an ability does, from its data: damage, duration, cooldown and the data's own effect note. */
export function describeAbilityLine(def: AbilityDef | AbilityDefB): string {
  const x = def as Partial<AbilityDefB>;
  const d = describeAbility(def, 0);
  const dmg = d.damage !== undefined && d.damage > 0 ? String(d.damage) : undefined;
  const parts: string[] = [];
  switch (def.kind) {
    case 'range':
      parts.push(dmg ? `Shoots for ${dmg} damage` : 'Shoots a projectile');
      break;
    case 'omni':
      parts.push(dmg ? `Fires every way for ${dmg} damage each` : 'Fires every way');
      break;
    case 'melee':
      parts.push(dmg ? `Close strike for ${dmg} damage` : 'Close-range strike');
      break;
    case 'debuff':
      parts.push(dmg ? `Hits for ${dmg} damage and weakens the foe` : 'Weakens the foe');
      break;
    case 'heal':
      parts.push(`Restores ${String(def.heal ?? 0)} health`);
      break;
    case 'buff':
      parts.push('Powers you up');
      break;
    case 'capture':
      return SNAG_DESCRIPTION;
  }
  if (x.speedDelta !== undefined && x.speedDelta !== 0) {
    parts.push(x.speedDelta < 0 ? `foe moves ${String(-x.speedDelta)} slower` : `speed +${String(x.speedDelta)}`);
  }
  if (x.damageDecreasePercentage !== undefined) parts.push(`${String(x.damageDecreasePercentage)}% less damage taken`);
  if (def.durationMs !== undefined) parts.push(`lasts ${secs(def.durationMs)}`);
  let line = parts.join(', ');
  const note = d.additional;
  if (note !== undefined && note !== '') line += `. ${note.charAt(0).toUpperCase()}${note.slice(1)}`;
  line = line.replace(/\.?$/, '.');
  const falloff = String(def.id) === 'fire-blast' ? ` ${FIRE_BLAST_FALLOFF}` : '';
  return `${line}${falloff} Cooldown ${secs(def.cooldownMs)}.`;
}

export interface AbilityInfo {
  readonly name: string;
  /** Keyboard key labels for Player 1 and Player 2. */
  readonly key: string;
  readonly keyP2: string;
  readonly kind: string;
  readonly mark: string;
  /** Sprite name under `assets/img/fx/` for the icon (the mark shows when it is missing); absent for Snag. */
  readonly sprite?: string;
  readonly description: string;
}

export interface HeroProfile {
  readonly id: CharacterId;
  readonly name: string;
  readonly element: string;
  readonly alignment: string;
  readonly style: HeroStyle;
  readonly blurb: string;
  /** Sprite name under `assets/img/map/` (the portrait's source). */
  readonly sprite: string;
  readonly stats: readonly (readonly [label: string, value: string])[];
  readonly abilities: readonly AbilityInfo[];
}

/** The first sentence of the lore text, trimmed for the panel. */
function firstSentence(text: string): string {
  const m = /^.*?[.!?](?=\s|$)/.exec(text.trim());
  return (m ? m[0] : text).replace(/\s+/g, ' ').trim();
}

/** Body size as a multiplier word (`1x`, `1.5x`, `0.7x`); bigger heroes have more life and hit harder but walk slower. */
export function sizeWord(size: number): string {
  return `${String(size / SIZE_ONE)}x`;
}

export function heroProfile(id: CharacterId, life?: number): HeroProfile {
  const ch = getCharacter(id);
  const snag = ARCADE_SNAG_SLOT[id];
  const abilities: AbilityInfo[] = [];
  ch.abilities.forEach((aid, i) => {
    const def = DEFS.get(aid);
    if (!def) return;
    const keys = SLOT_KEYS[i] ?? ['', ''];
    const isSnag = i === snag;
    abilities.push({
      name: isSnag ? SNAG_NAME : (ABILITY_NAMES.get(aid) ?? (aid)),
      key: keys[0],
      keyP2: keys[1],
      kind: isSnag ? KIND_WORDS.capture : KIND_WORDS[def.kind],
      mark: isSnag ? KIND_MARKS.capture : KIND_MARKS[def.kind],
      ...(isSnag ? {} : { sprite: def.sprite }),
      description: isSnag ? SNAG_DESCRIPTION : describeAbilityLine(def),
    });
  });
  return {
    id,
    name: CHARACTER_TEXT.get(id)?.name ?? (id),
    element: ch.element,
    alignment: ch.alignment,
    style: heroStyle(id),
    blurb: firstSentence(CHARACTER_TEXT.get(id)?.description ?? ''),
    sprite: ch.sprite,
    stats: [
      ['Life', String(life ?? ch.maxHealth)],
      ['Speed', String(ch.speed)],
      ['Size', sizeWord(sizeOfSlug(id))],
      ['Alignment', ch.alignment],
    ],
    abilities,
  };
}
