import { Cmd, DEFAULT_SIM_FLAGS, EntityFlag, METER_BAR, RUN_AWAY_NAME, RUN_TOWARDS_NAME, RoundPhase, WEATHER_CHARGE_FULL, characterId, type MatchSetup, type RenderArcade, type RenderView } from '@core/index';
import { chargeNotice } from '../hud/swap-notice';
import type { MatchEnd } from './launch';

/**
 * The pure decisions of the Arena scene (no Phaser, no DOM), pulled out so they can be unit-tested: which hero is active, why an
 * action press is refused, how a replay frame advances, the demo setup and the end-of-match report. View side only; nothing here
 * writes to the sim.
 */

/** The first living, un-benched hero of team 0 in view order (the one the player controls), or undefined with none. */
export function activeHeroOf(view: Pick<RenderView, 'forEachCharacter'>): { id: number; flags: number } | undefined {
  let found: { id: number; flags: number } | undefined;
  view.forEachCharacter((c) => {
    if (c.team === 0 && (c.flags & (EntityFlag.dead | EntityFlag.benched)) === 0 && !found) found = { id: c.id, flags: c.flags };
  });
  return found;
}

/** Why a Charge press does nothing, in the order the sim checks: frozen, stunned, rooted, guarding (undefined: none of them). */
export function chargeBlockedBy(flags: number, a: { stunned: boolean; rooted: boolean; guarding: boolean }): string | undefined {
  if ((flags & EntityFlag.frozen) !== 0) return 'frozen';
  if (a.stunned) return 'stunned';
  if (a.rooted) return 'rooted';
  if (a.guarding) return 'guarding';
  return undefined;
}

/** The refusal line for a Charge press from the view (no living active hero: no line). */
export function chargeLineFor(view: Pick<RenderView, 'forEachCharacter'>, arcade: RenderArcade): string | undefined {
  const hero = activeHeroOf(view);
  if (!hero) return undefined;
  const blocked = chargeBlockedBy(hero.flags, { stunned: arcade.stunned(hero.id), rooted: arcade.rooted(hero.id), guarding: arcade.guarding(hero.id) });
  return chargeNotice({ fighting: arcade.phase === RoundPhase.fight, chargeIn: arcade.chargeIn(hero.id), blocked });
}

/** The refusal line for a Run press: nothing while a run is on (a second press stops it), else stunned, else rooted, else the seconds left ("Run Away in 3 s"). */
export function runLineFor(view: Pick<RenderView, 'forEachCharacter' | 'actionBar'>, arcade: RenderArcade): string | undefined {
  const hero = activeHeroOf(view);
  const run = view.actionBar(0)?.run;
  if (!hero || !run || arcade.running(hero.id)) return undefined;
  if (arcade.stunned(hero.id)) return "Can't run while stunned";
  if (arcade.rooted(hero.id)) return "Can't run while rooted";
  const left = arcade.runIn(hero.id);
  return left > 0 ? `${run.away ? RUN_AWAY_NAME : RUN_TOWARDS_NAME} in ${String(Math.ceil(left / 50))} s` : undefined;
}

/**
 * The line for a Super, Weather, Charge, Elemental or Run press that does nothing yet, or undefined (no refusal). Only during the
 * fight and not in a hit-stop; the first set bit of that priority order wins. `charge` and `elemental` are read lazily.
 */
export function actionRefusal(
  bits: number,
  a: { phase: number; frozen: boolean; meter0: number; weatherCharge0: number },
  charge: () => string | undefined,
  elemental: () => string | undefined,
  run: () => string | undefined = () => undefined,
): string | undefined {
  if (a.phase !== RoundPhase.fight || a.frozen) return undefined;
  if ((bits & Cmd.super) !== 0 && a.meter0 < METER_BAR) return 'Super not ready';
  if ((bits & Cmd.weather) !== 0 && a.weatherCharge0 < WEATHER_CHARGE_FULL) return 'Weather not ready';
  if ((bits & Cmd.charge) !== 0) return charge();
  if ((bits & Cmd.elemental) !== 0) return elemental();
  if ((bits & Cmd.run) !== 0) return run();
  return undefined;
}

/**
 * One replay frame at a playback speed: 0.5 runs a tick every other frame (the parity flips each call), 1 and 2 run that many
 * ticks every frame.
 */
export function playbackFrame(speed: number, slowFrame: boolean): { slowFrame: boolean; ticks: number } {
  if (speed === 0.5) {
    const flipped = !slowFrame;
    return { slowFrame: flipped, ticks: flipped ? 0 : 1 };
  }
  return { slowFrame, ticks: Math.max(1, speed) };
}

/** The match report: the `matchEnded` event's winner (or an online session's, or -1) plus roster slots and Arcade round wins. */
export function buildMatchEnd(
  over: Readonly<Record<string, number>> | undefined,
  sessionWinner: number | null | undefined,
  activeSlot: number,
  capturedIndices: readonly number[],
): MatchEnd {
  return {
    winner: over ? (over['winner'] ?? -1) : (sessionWinner ?? -1),
    activeSlot,
    capturedIndices,
    ...(over?.['won0'] === undefined ? {} : { rounds: [over['won0'], over['won1'] ?? 0] as const }),
  };
}

/** The launch-less demo match (`?ff=arenaDemo`): `hero` (`?hero=` or `?p1=`) replaces the first hero and `foe` (`?foe=`) the opponent's; `arcade` turns the Arcade ruleset on. */
export function demoMatch(base: MatchSetup, hero: string | null, arcade: boolean, foe: string | null = null, cc = false): MatchSetup {
  const withLead = hero ? { ...base, p1: [{ character: characterId(hero), xp: 0 }, ...base.p1.slice(1)] } : base;
  const withHero = foe ? { ...withLead, p2: [{ character: characterId(foe), xp: 0 }, ...base.p2.slice(1)] } : withLead;
  return arcade ? { ...withHero, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true, ...(cc ? { withCrowdControl: true } : {}) } } : withHero;
}

/**
 * Whether frame-timed view effects hold their frame: while the sim is paused (pause dialog, hidden tab, overlay, replay
 * pause, match end, e2e manual stepping), unless the test hook's `ageFx(true)` lets them age on real frames.
 */
export function effectsHeld(paused: boolean, ageing: boolean): boolean {
  return paused && !ageing;
}
