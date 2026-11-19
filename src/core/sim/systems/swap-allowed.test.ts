import { describe, expect, it } from 'vitest';
import { ICED_TICKS, CcKind, SNAG_ROOT_TICKS, SUPER_COST, WEATHER_COOLDOWN_TICKS } from '../../data/arcade';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { now } from '../clock';
import { Cmd, type Command } from '../commands';
import { EventSink, SimEventKind } from '../events';
import { hash } from '../hash';
import { createMatch, type MatchSetup } from '../match';
import { createRenderView } from '../view';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, EntityFlag, TeamField } from '../state';
import { step } from '../step';
import type { SimWorld } from '../world';
import { SwapBlock, swapAllowed } from './swap';
import { applyCc } from './arcade/cc';
import { isRooted } from './arcade/snag';
import { skipIntro } from './arcade/round-testkit';

const IDLE: readonly [Command, Command] = [0, 0];

function setupOf(arcade: boolean, p1: string[], extra: Partial<typeof DEFAULT_SIM_FLAGS> = {}): MatchSetup {
  return {
    simVersion: 18, seed: 4, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade, ...extra }, chapter: 1, difficulty: 1,
    p1: p1.map((c) => ({ character: characterId(c), xp: 1 })),
    p2: ['pax', 'curomo'].map((c) => ({ character: characterId(c), xp: 1 })),
  };
}

/** Team 0 is entities 0 (active), 1, 2 (bench); team 1 follows. Positions are set far apart so nothing hits. */
function duel(arcade = true, p1 = ['sindarosa', 'cyclonius', 'pax'], extra: Partial<typeof DEFAULT_SIM_FLAGS> = {}): SimWorld {
  const m = createMatch(setupOf(arcade, p1, extra));
  const w = arcade ? skipIntro(m) : m;
  w.state.x[0] = 300;
  w.state.y[0] = 200;
  return w;
}

/** Presses swap1 for team 0 for one tick; true when the sim tagged. */
const tagged = (w: SimWorld): boolean => step(w, [Cmd.swap1, 0]).some((e) => e.kind === SimEventKind.swapped);
const setFlag = (w: SimWorld, id: number, f: number): void => { w.state.flags[id] = (w.state.flags[id] ?? 0) | f; };

describe('swapAllowed', () => {
  it('is 0 when a tag is allowed', () => {
    const w = duel();
    expect(swapAllowed(w, 0)).toBe(0);
    expect(swapAllowed(w, 0, 0)).toBe(0);
    expect(swapAllowed(w, 0, 1)).toBe(0);
  });
  it('WAIT outside the fight phase', () => {
    const w = createMatch(setupOf(true, ['sindarosa', 'pax']));
    step(w, IDLE);
    expect(swapAllowed(w, 0) & SwapBlock.wait).toBe(SwapBlock.wait);
    expect(tagged(w)).toBe(false);
  });
  it('cooldown', () => {
    const w = duel();
    w.state.teams[TeamField.swapCooldownUntil] = now(w.state) + 10;
    expect(swapAllowed(w, 0) & SwapBlock.cooldown).toBe(SwapBlock.cooldown);
    expect(swapAllowed(w, 1) & SwapBlock.cooldown).toBe(0);
  });
  it('STUN while hit-stunned', () => {
    const w = duel();
    w.state.arcade[0 * ARCADE_E + ArcadeE.stunUntil] = now(w.state) + 30;
    expect(swapAllowed(w, 0) & SwapBlock.stun).toBe(SwapBlock.stun);
    expect(swapAllowed(w, 0) & SwapBlock.busy).toBe(0);
  });
  it('frozen (any ruleset; Arcade: the recovery after a melee cast)', () => {
    for (const arcade of [true, false]) {
      const w = duel(arcade);
      setFlag(w, 0, EntityFlag.frozen);
      expect(swapAllowed(w, 0) & SwapBlock.frozen).toBe(SwapBlock.frozen);
      expect(tagged(w)).toBe(false);
    }
  });
  it('a Snag root does not refuse a tag, and the incoming hero is not rooted', () => {
    const w = duel();
    w.state.arcade[0 * ARCADE_E + ArcadeE.rootUntil] = now(w.state) + SNAG_ROOT_TICKS;
    expect(isRooted(w.state, 0)).toBe(true);
    expect(swapAllowed(w, 0, 0)).toBe(0);
    expect(tagged(w)).toBe(true);
    expect(isRooted(w.state, 1)).toBe(false);
  });
  it('a super in progress is busy and refuses the tag', () => {
    const w = duel();
    w.state.arcade[ARCADE_TEAM_BASE + ArcadeT.meter] = SUPER_COST;
    step(w, [Cmd.super, 0]);
    expect((w.state.arcade[ARCADE_TEAM_BASE + 0 * ARCADE_T + ArcadeT.superState] ?? 0) - 1).toBeGreaterThanOrEqual(0);
    expect(swapAllowed(w, 0, 0) & SwapBlock.busy).toBe(SwapBlock.busy);
    expect(tagged(w)).toBe(false);
  });
  it('hard crowd control refuses the tag', () => {
    const w = duel(true, undefined, { withCrowdControl: true });
    applyCc(w, new EventSink(now(w.state)), 3, 3, 0, CcKind.iced, ICED_TICKS);
    expect(swapAllowed(w, 0, 0)).not.toBe(0);
    expect(tagged(w)).toBe(false);
  });
  it('Arcade melee recovery shows the frozen bit and refuses the tag', () => {
    const w = duel(true, ['curomo', 'pax']);
    step(w, [Cmd.primary, 0]);
    let seen = false;
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) {
      const bits = swapAllowed(w, 0, 0);
      if ((bits & SwapBlock.frozen) !== 0) seen = true;
      const t = tagged(w);
      expect(t).toBe(bits === 0);
      ok = t;
    }
    expect(seen).toBe(true);
    expect(ok).toBe(true);
  });
  it('reads do not write', () => {
    const w = duel();
    const h = hash(w.state);
    const ar = createRenderView(w).arcade();
    for (const team of [0, 1]) for (let slot = -1; slot <= 3; slot++) { swapAllowed(w, team, slot); ar?.swapBlock(team, slot); }
    expect(hash(w.state)).toBe(h);
  });
  it('busy while block-stunned', () => {
    const w = duel();
    w.state.arcade[0 * ARCADE_E + ArcadeE.blockUntil] = now(w.state) + 20;
    expect(swapAllowed(w, 0)).toBe(SwapBlock.busy);
  });
  it('no active hero', () => {
    const w = duel();
    for (const id of [0, 1, 2]) setFlag(w, id, EntityFlag.dead);
    expect(swapAllowed(w, 0) & SwapBlock.noActive).toBe(SwapBlock.noActive);
  });
  it('no partner in the slot', () => {
    const w = duel();
    expect(swapAllowed(w, 0, 2) & SwapBlock.noTarget).toBe(SwapBlock.noTarget);
    expect(swapAllowed(w, 1, 1) & SwapBlock.noTarget).toBe(SwapBlock.noTarget);
    setFlag(w, 1, EntityFlag.dead);
    expect(swapAllowed(w, 0, 0)).toBe(0);
    setFlag(w, 2, EntityFlag.dead);
    expect(swapAllowed(w, 0, 0) & SwapBlock.noTarget).toBe(SwapBlock.noTarget);
  });
  it('matches what the sim does with a swap1 press', () => {
    const preps: [(w: SimWorld) => void, boolean][] = [
      [() => undefined, true],
      [(w) => { w.state.teams[TeamField.swapCooldownUntil] = now(w.state) + 5; }, true],
      [(w) => { w.state.arcade[ArcadeE.stunUntil] = now(w.state) + 5; }, true],
      [(w) => { w.state.arcade[ArcadeE.blockUntil] = now(w.state) + 5; }, true],
      [(w) => { setFlag(w, 1, EntityFlag.dead); setFlag(w, 2, EntityFlag.dead); }, false],
      [(w) => { w.state.arcade[ArcadeE.rootUntil] = now(w.state) + SNAG_ROOT_TICKS; }, true],
      [(w) => { w.state.arcade[ArcadeE.dashUntil] = now(w.state) + 5; }, true],
      [(w) => { w.state.arcade[ArcadeE.chargeUntil] = now(w.state) + 5; }, true],
      [(w) => { w.state.arcade[ArcadeE.weatherReadyAt] = now(w.state) + WEATHER_COOLDOWN_TICKS; }, true],
    ];
    for (const [prep, expectsTag] of preps) {
      const w = duel();
      prep(w);
      let did = false;
      for (let i = 0; i < 40; i++) {
        const allowed = swapAllowed(w, 0, 0) === 0;
        const t = tagged(w);
        expect(t).toBe(allowed);
        if (t) { did = true; break; }
      }
      expect(did).toBe(expectsTag);
    }
    const c = duel(false);
    expect(swapAllowed(c, 0, 0)).toBe(0);
    expect(tagged(c)).toBe(true);
    expect(swapAllowed(c, 0, 0) & SwapBlock.cooldown).toBe(SwapBlock.cooldown);
  });
  it('the render view hands the HUD the same bits', () => {
    const w = duel();
    const ar = createRenderView(w).arcade();
    w.state.arcade[ArcadeE.stunUntil] = now(w.state) + 30;
    expect(ar?.swapBlock(0)).toBe(swapAllowed(w, 0));
    expect(ar?.swapBlock(0)).toBeGreaterThan(0);
  });
  it('the render view passes the slot through', () => {
    const w = duel();
    const ar = createRenderView(w).arcade();
    expect(ar?.swapBlock(0, 2)).toBe(swapAllowed(w, 0, 2));
    expect((ar?.swapBlock(0, 2) ?? 0) & SwapBlock.noTarget).toBe(SwapBlock.noTarget);
    expect(ar?.swapBlock(0, 0)).toBe(0);
  });
});
