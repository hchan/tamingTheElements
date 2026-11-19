import { Cmd, RoundPhase, seedSfc32, type Agent, type AgentState, type CharacterId, type ObservationView } from '@core/index';
import { ARCADE_RACES, DEFAULT_PICK, partner2For, partnerFor, type ArcadePick } from './arcade-pick';
import { TOUR_CONTINUES, buildTour, type TourRun, type TourStage } from './tour-model';

/**
 * World Tour fight setup (FUN-DESIGN 2.18, WP-tour-shell): pure helpers that turn a run into the Arcade pick and match seed of
 * its current fight. No Phaser, no DOM, no storage.
 */

/** Weather kind of the four stage elements, as `ArcadeW.stage` holds it (1 fire, 2 water, 3 earth, 4 air). */
const STAGE_KIND: Readonly<Record<string, number>> = { fire: 1, water: 2, earth: 3, air: 4 };

/** The stage element the sim draws for a match seed (round 1 takes `1 + int(4)` of the `terrain.0` stream, terrain-layout.ts). */
export const stageKindOfSeed = (seed: number): number => 1 + seedSfc32(seed >>> 0, 'terrain.0').int(4);

/**
 * The first seed at or after `seed` whose drawn stage element is `stage` (fire, water, earth or air); `seed` itself when it already
 * draws that stage. Pure and deterministic, so the sim needs no stage setting. Four draws in a row miss with odds 1/256 a try;
 * 4096 tries always find one in practice.
 */
export function seedForStage(seed: number, stage: string): number {
  const want = STAGE_KIND[stage];
  if (want === undefined) return seed >>> 0;
  for (let i = 0; i < 4096; i++) {
    const s = (seed + i) >>> 0;
    if (stageKindOfSeed(s) === want) return s;
  }
  return seed >>> 0;
}

/** The stage of the run's current fight. */
export const currentStage = (run: TourRun): TourStage => buildTour(run.hero, run.seed)[run.stage] as TourStage;

/**
 * The Arcade pick of a stage: the hero team on the player's side, the stage's opponents (lead first) and AI level on the other.
 * The sim has no terrain setting, so the stage element is chosen by the match seed (`matchSeed`).
 */
export function stagePick(run: TourRun, stage: TourStage): ArcadePick {
  const [player, partner, partner2] = run.hero as [CharacterId, CharacterId, CharacterId];
  const [enemy, ...bench] = stage.opponents as [CharacterId, ...CharacterId[]];
  return { player, partner, partner2, enemy, enemyBench: bench, level: stage.aiLevel };
}

/**
 * The match seed of a fight: derived from the run seed, the stage and the continues spent (a retry plays a different match),
 * then moved up to the first seed whose drawn stage element is the location's. The Void's location has no terrain element, so
 * any seed will do.
 */
export function matchSeed(run: TourRun, stage: TourStage): number {
  const spent = TOUR_CONTINUES - run.continues;
  const base = (run.seed ^ Math.imul(stage.index + 1, 0x9e3779b1) ^ Math.imul(spent + 1, 0x85ebca6b)) >>> 0;
  const want = STAGE_KIND[stage.terrain];
  if (want === undefined) return base;
  for (let i = 0; i < 4096; i++) {
    const seed = (base + i) >>> 0;
    if (stageKindOfSeed(seed) === want) return seed;
  }
  return base;
}

/** The one descriptor of a run's current fight: the Tour card, the versus splash and the battle all read it, so they cannot disagree. */
export interface TourFight {
  readonly stage: TourStage;
  readonly pick: ArcadePick;
  readonly seed: number;
}

export function tourFight(run: TourRun): TourFight {
  const stage = currentStage(run);
  return { stage, pick: stagePick(run, stage), seed: matchSeed(run, stage) };
}

/** The player-facing place of a stage: Fire, Water, Earth, Air, or The Eternal Void. */
export const locationName = (stage: TourStage): string =>
  stage.location === 'void' ? 'The Eternal Void' : (stage.location[0] ?? '').toUpperCase() + stage.location.slice(1);

/** `parseTeam` for the Play picker, where a slot can be empty: undefined unless all three slots hold a known hero (an empty slot is never filled in for the player; a repeat is still repaired by `parseTeam`). */
export function parseCompleteTeam(raw: { readonly hero1?: string; readonly hero2?: string; readonly hero3?: string }): CharacterId[] | undefined {
  const known = [raw.hero1, raw.hero2, raw.hero3].every((h) => ARCADE_RACES.some((r) => r === h));
  return known ? parseTeam(raw) : undefined;
}

/** The picker's three selects to a team: a known lead, then partners that repeat nobody (a repeat is replaced). */
export function parseTeam(raw: { readonly hero1?: string; readonly hero2?: string; readonly hero3?: string }): CharacterId[] {
  const first = ARCADE_RACES.find((r) => r === raw.hero1) ?? DEFAULT_PICK.player;
  const second = partnerFor(first, raw.hero2);
  return [first, second, partner2For(first, second, raw.hero3)];
}

/** Ticks of a round's fight phase in which the opening rush may run (3 s at 50 Hz). */
export const OPENING_TICKS = 150;
/** Centre gap (larger axis, px) at which the rush hands the fighter back to its own AI. */
export const OPENING_NEAR_PX = 240;

const MOVE_MASK = Cmd.up | Cmd.down | Cmd.left | Cmd.right;

/**
 * Tour stage 1 opening rush (QA r122): the Easy AI waits out a reaction delay and then walks about 800 px, so the first
 * seconds of "Fight!" are dead. This wraps the foe's Agent: from the start of each round's fight phase, while the centre gap
 * is above OPENING_NEAR_PX, it closes in (the inner AI's own move bits win when it has any, else straight at the foe) and
 * presses dash as an edge whenever the dash is ready. App only: the sim, its spawn points and the inner AI are untouched; the
 * inner agent is observed every tick so its own state advances as before. Integers only, no randomness.
 */
export function openingRush(inner: Agent): Agent {
  let left = 0;
  let prevPhase = -1;
  let dashed = false;
  return {
    id: inner.id,
    observe: (view: ObservationView, tick: number) => {
      const cmd = inner.observe(view, tick);
      const phase = view.arcade?.phase ?? -1;
      if (phase === RoundPhase.fight && prevPhase !== RoundPhase.fight) left = OPENING_TICKS;
      prevPhase = phase;
      const self = view.self;
      const opp = view.opponent;
      if (phase !== RoundPhase.fight || left <= 0 || !self || !opp || !view.arcade) {
        dashed = false;
        return cmd;
      }
      left--;
      const dx = opp.x + opp.w / 2 - (self.x + self.w / 2);
      const dy = opp.y + opp.h / 2 - (self.y + self.h / 2);
      if (Math.max(Math.abs(dx), Math.abs(dy)) <= OPENING_NEAR_PX) {
        left = 0;
        dashed = false;
        return cmd;
      }
      const towardX = dx > opp.w / 2 ? Cmd.right : dx < -opp.w / 2 ? Cmd.left : 0;
      const towardY = dy > opp.h / 2 ? Cmd.down : dy < -opp.h / 2 ? Cmd.up : 0;
      const move = (cmd & MOVE_MASK) !== 0 ? cmd & MOVE_MASK : towardX | towardY;
      const dash = !dashed && view.arcade.dashIn === 0 && towardX !== 0 && (move & towardX) !== 0;
      dashed = dash;
      return (cmd & ~MOVE_MASK) | move | (dash ? Cmd.dash : 0);
    },
    save: (): AgentState => ({ inner: inner.save(), left, prevPhase, dashed }),
    load: (state: AgentState) => {
      const st = state as { readonly inner: AgentState; readonly left: number; readonly prevPhase: number; readonly dashed: boolean } | null;
      inner.load(st?.inner ?? null);
      left = st?.left ?? 0;
      prevPhase = st?.prevPhase ?? -1;
      dashed = st?.dashed ?? false;
    },
  };
}
