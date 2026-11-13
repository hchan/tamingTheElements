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
  /**
   * 3v3 tag team (WP-arcade-3v3): the player's third race, with `partner` set, never the same as `player` or `partner`;
   * the AI's third race also comes from the seed (`enemyPartners`).
   */
  readonly partner2?: CharacterId;
  /**
   * Local two-player: a second human (Player 2, `enemy` is their race) instead of the AI; `level` is unused. A duel between two
   * teams (WP-pvp-3heroes): `partner`/`partner2` are Player 1's bench, `enemyBench` Player 2's (same size, 0 to 2 heroes).
   */
  readonly local?: true;
  /** Player 2's bench in local two-player (no seed draw); absent against the AI, whose bench `enemyPartners` draws. */
  readonly enemyBench?: readonly CharacterId[];
}

/** Form values as the picker sends them; `size` is '2' or '3' for a 2v2 or 3v3 tag team (anything else is 1v1). */
export interface PickForm {
  readonly player: string;
  readonly enemy: string;
  readonly level: string;
  readonly size?: string;
  readonly partner?: string;
  readonly partner2?: string;
  /** Player 2's second and third hero in local two-player. */
  readonly enemyPartner?: string;
  readonly enemyPartner2?: string;
  /** 'local' for two players on this computer (anything else is the AI). */
  readonly mode?: string;
}

const race = (raw: string | undefined, fallback: CharacterId): CharacterId => ARCADE_RACES.find((r) => r === raw) ?? fallback;

/** Default: the owner playtest's Sindarosa (FUN-DESIGN section 7) against a ranged opponent, AI Normal, 1v1. */
export const DEFAULT_PICK: ArcadePick = { player: 'sindarosa' as CharacterId, enemy: 'fiara' as CharacterId, level: 'normal' };

const PAX = 'pax' as CharacterId;

const CUROMO = 'curomo' as CharacterId;

/** The 2v2 partner: the raw race when known and not the lead's, else Pax (earth), else the first other race. */
export const partnerFor = (player: CharacterId, raw?: string): CharacterId =>
  [race(raw, PAX), PAX, ...ARCADE_RACES].find((r) => r !== player) ?? PAX;

/** The 3v3 third race: the raw race when known and not already on the team, else Curomo (water), else the first free race. */
export const partner2For = (player: CharacterId, partner: CharacterId, raw?: string): CharacterId =>
  [race(raw, CUROMO), CUROMO, ...ARCADE_RACES].find((r) => r !== player && r !== partner) ?? CUROMO;

/** The tag team part of a pick for the form's size: none (1v1), `partner` (2v2) or both partners (3v3). */
function team(player: CharacterId, raw: PickForm): Pick<ArcadePick, 'partner' | 'partner2'> {
  if (raw.size !== '2' && raw.size !== '3') return {};
  const partner = partnerFor(player, raw.partner);
  return raw.size === '3' ? { partner, partner2: partner2For(player, partner, raw.partner2) } : { partner };
}

/** Player 2's bench in local two-player: the same size as Player 1's, each hero distinct within the team (mirrors across teams are fine). */
function bench(enemy: CharacterId, raw: PickForm): CharacterId[] {
  if (raw.size !== '2' && raw.size !== '3') return [];
  const second = partnerFor(enemy, raw.enemyPartner);
  return raw.size === '3' ? [second, partner2For(enemy, second, raw.enemyPartner2)] : [second];
}

/**
 * False when a hero the form sent is blank (the player emptied that slot in the picker): `parsePick` would quietly fill it with a
 * default, so the caller checks this first and does not start. Fields the form left out (a disabled slot) are not required.
 */
export const isCompletePick = (raw: PickForm): boolean =>
  [raw.player, raw.enemy, raw.partner, raw.partner2, raw.enemyPartner, raw.enemyPartner2].every((h) => h !== '');

/** Form values to a pick; anything unknown falls back to the default, and no race is on a tag team twice. */
export function parsePick(raw: PickForm): ArcadePick {
  const player = race(raw.player, DEFAULT_PICK.player);
  const enemy = race(raw.enemy, DEFAULT_PICK.enemy);
  return {
    player,
    enemy,
    level: ARCADE_AI_LEVELS.find((l) => l === raw.level) ?? DEFAULT_PICK.level,
    ...(raw.mode === 'local' ? { local: true as const, ...team(player, raw), enemyBench: bench(enemy, raw) } : team(player, raw)),
  };
}
