import { CHARACTERS, type CharacterId } from '@core/index';

/**
 * Arcade Versus picks (FUN-DESIGN WP 11 and WP 20), the part the picker needs at once (in the `arcade-versus` chunk): the
 * races, AI levels, team sizes and the form-to-pick parser. The match builder (`arcade-setup.ts`) is its own lazy chunk,
 * loaded with the battle.
 */

/** The 12 playable races (the two void characters are story-only). */
export const ARCADE_RACES: readonly CharacterId[] = CHARACTERS.filter((c) => c.element !== 'void').map((c) => c.id);

/**
 * AI levels offered (FUN-DESIGN 2.11, WP-arcade-ai-personalities): the index is the core AI level (`ARCADE_AI_KNOBS`
 * row: Easy never supers, combo caps 1, 3 and 5, slower or faster reactions, parries and dodges).
 */
export const ARCADE_AI_LEVELS = ['easy', 'normal', 'hard'] as const;
export type ArcadeAiLevel = (typeof ARCADE_AI_LEVELS)[number];

export interface ArcadePick {
  readonly player: CharacterId;
  readonly enemy: CharacterId;
  readonly level: ArcadeAiLevel;
  /**
   * 2v2 tag team (FUN-DESIGN 2.6, WP-arcade-tag-view): the player's second race, never the same as `player`; absent in
   * 1v1. The AI's second race is drawn from the match seed (`enemyPartner` in `arcade-setup.ts`).
   */
  readonly partner?: CharacterId;
}

/** Form values as the picker sends them; `size` is '2' for a 2v2 tag team (anything else is 1v1). */
export interface PickForm {
  readonly player: string;
  readonly enemy: string;
  readonly level: string;
  readonly size?: string;
  readonly partner?: string;
}

const race = (raw: string | undefined, fallback: CharacterId): CharacterId => ARCADE_RACES.find((r) => r === raw) ?? fallback;

/** Default: the owner playtest's Sindarosa (FUN-DESIGN section 7) against a ranged opponent, AI Normal, 1v1. */
export const DEFAULT_PICK: ArcadePick = { player: 'sindarosa' as CharacterId, enemy: 'fiara' as CharacterId, level: 'normal' };

const PAX = 'pax' as CharacterId;

/** The 2v2 partner: the raw race when known and not the lead's, else Pax (earth), else the first other race. */
export const partnerFor = (player: CharacterId, raw?: string): CharacterId =>
  [race(raw, PAX), PAX, ...ARCADE_RACES].find((r) => r !== player) ?? PAX;

/** Form values to a pick; anything unknown falls back to the default, and a 2v2 partner is never the lead's race. */
export function parsePick(raw: PickForm): ArcadePick {
  const player = race(raw.player, DEFAULT_PICK.player);
  return {
    player,
    enemy: race(raw.enemy, DEFAULT_PICK.enemy),
    level: ARCADE_AI_LEVELS.find((l) => l === raw.level) ?? DEFAULT_PICK.level,
    ...(raw.size === '2' ? { partner: partnerFor(player, raw.partner) } : {}),
  };
}
