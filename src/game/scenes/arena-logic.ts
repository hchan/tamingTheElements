import { Cmd, DEFAULT_SIM_FLAGS, EntityFlag, METER_BAR, RoundPhase, WEATHER_CHARGE_FULL, characterId, type MatchSetup, type RenderArcade, type RenderView } from '@core/index';
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

/**
 * The line for a Super, Weather, Charge or Elemental press that does nothing yet, or undefined (no refusal). Only during the
 * fight and not in a hit-stop; the first set bit of that priority order wins. `charge` and `elemental` are read lazily.
 */
export function actionRefusal(
  bits: number,
  a: { phase: number; frozen: boolean; meter0: number; weatherCharge0: number },
  charge: () => string | undefined,
  elemental: () => string | undefined,
): string | undefined {
  if (a.phase !== RoundPhase.fight || a.frozen) return undefined;
  if ((bits & Cmd.super) !== 0 && a.meter0 < METER_BAR) return 'Super not ready';
  if ((bits & Cmd.weather) !== 0 && a.weatherCharge0 < WEATHER_CHARGE_FULL) return 'Weather not ready';
  if ((bits & Cmd.charge) !== 0) return charge();
  if ((bits & Cmd.elemental) !== 0) return elemental();
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

/** The launch-less demo match (`?ff=arenaDemo`): `hero` (the `?p1=` slug) replaces the first hero; `arcade` turns the Arcade ruleset on. */
export function demoMatch(base: MatchSetup, hero: string | null, arcade: boolean): MatchSetup {
  const withHero = hero ? { ...base, p1: [{ character: characterId(hero), xp: 0 }, ...base.p1.slice(1)] } : base;
  return arcade ? { ...withHero, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true } } : withHero;
}
