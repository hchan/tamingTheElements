import { describe, expect, it } from 'vitest';
import legacy from '../../../../tests/fixtures/legacy/abilities-effects.json';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd, NO_COMMAND } from '../commands';
import { SimEventKind } from '../events';
import { createMatch, type MatchSetup } from '../match';
import { EntityFlag, EntityKind, TEAM_STRIDE, TeamField } from '../state';
import { step } from '../step';
import { SWAP_COOLDOWN_TICKS } from './swap';

const m = { character: characterId('pax'), xp: 1 };
const setup: MatchSetup = {
  simVersion: 1,
  seed: 7,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [m, { character: characterId('lavax'), xp: 1 }, m],
  p2: [m, m],
};
const idle = [NO_COMMAND, NO_COMMAND] as const;
const benched = (f: number | undefined): boolean => ((f ?? 0) & EntityFlag.benched) !== 0;

describe('death (detected in the sim, not the HUD: death-in-hud)', () => {
  it('kills at the end of the tick hp reaches 0 and auto-swaps to the next alive teammate', () => {
    // KNOWN-BUG:death-in-hud (intentional divergence: fixed by construction)
    const w = createMatch(setup);
    const s = w.state;
    s.hp[0] = 0;
    const events = step(w, idle);
    expect(events.filter((e) => e.kind === SimEventKind.died).map((e) => e.sourceId)).toEqual([0]);
    expect((s.flags[0] ?? 0) & EntityFlag.dead).toBeTruthy();
    expect(s.dmgMult[0]).toBe(0);
    expect(benched(s.flags[1])).toBe(false);
    expect(s.teams[TeamField.activeSlot]).toBe(1);
    expect(s.teams[TeamField.swapCooldownUntil]).toBe(SWAP_COOLDOWN_TICKS);
  });

  it('skips dead teammates and keeps the swapped-in hp', () => {
    const w = createMatch(setup);
    const s = w.state;
    s.hp[1] = 0;
    step(w, idle); // benched death: no swap
    expect(benched(s.flags[0])).toBe(false);
    const hp2 = (s.hp[2] ?? 0) - 1;
    s.hp[2] = hp2;
    s.hp[0] = 0;
    step(w, idle);
    expect(benched(s.flags[2])).toBe(false);
    expect(s.hp[2]).toBe(hp2);
  });

  it('wipes a team with no alive teammate left', () => {
    const w = createMatch(setup);
    const s = w.state;
    s.hp[3] = 0;
    s.hp[4] = 0;
    step(w, idle);
    const dead = EntityFlag.alive | EntityFlag.dead | EntityFlag.benched;
    expect([s.flags[3], s.flags[4]]).toEqual([dead, dead]);
  });
});

describe('bullets on death', () => {
  it('bullets in flight survive an enemy death (legacy Crafty("Bullet") matches nothing)', () => {
    const sindarosa = { character: characterId('sindarosa'), xp: 1 };
    const w = createMatch({ ...setup, p1: [sindarosa], p2: [sindarosa, sindarosa] });
    const s = w.state;
    step(w, [Cmd.primary, Cmd.primary]); // a Fire Blast each way
    const flying = (): number =>
      Array.from({ length: s.kind.length }, (_, i) => i).filter(
        (i) => s.kind[i] === EntityKind.projectile && ((s.flags[i] ?? 0) & EntityFlag.alive) !== 0,
      ).length;
    expect(flying()).toBe(2);
    s.hp[1] = 0;
    step(w, idle);
    expect((s.flags[1] ?? 0) & EntityFlag.dead).toBeTruthy();
    expect(flying()).toBe(2);
  });
});

describe('manual swap', () => {
  it('swapN picks the N-th teammate, then waits out the 250-tick cooldown', () => {
    const w = createMatch(setup);
    const s = w.state;
    step(w, [Cmd.swap2, NO_COMMAND]);
    expect(benched(s.flags[0])).toBe(true);
    expect(benched(s.flags[2])).toBe(false);
    step(w, [Cmd.swap1, NO_COMMAND]); // in cooldown
    expect(benched(s.flags[2])).toBe(false);
    for (let i = 0; i < SWAP_COOLDOWN_TICKS; i++) step(w, idle);
    step(w, [Cmd.swap1, NO_COMMAND]);
    expect(benched(s.flags[0])).toBe(false);
    expect(s.teams[TeamField.activeSlot]).toBe(0);
  });

  it('refuses a dead target and keeps a separate cooldown per team', () => {
    const w = createMatch(setup);
    const s = w.state;
    s.flags[1] = (s.flags[1] ?? 0) | EntityFlag.dead;
    step(w, [Cmd.swap1, Cmd.swap1]);
    expect(s.teams[TeamField.swapCooldownUntil]).toBe(0);
    expect(s.teams[TEAM_STRIDE + TeamField.swapCooldownUntil]).toBe(SWAP_COOLDOWN_TICKS);
    expect(benched(s.flags[3])).toBe(true);
  });
});

describe('frozen swap', () => {
  it('a frozen character cannot swap (legacy KeyDown ignores every key while frozen)', () => {
    const w = createMatch(setup);
    const s = w.state;
    s.flags[0] = (s.flags[0] ?? 0) | EntityFlag.frozen;
    step(w, [Cmd.swap1, NO_COMMAND]);
    expect([benched(s.flags[0]), benched(s.flags[1])]).toEqual([false, true]);
    expect(s.teams[TeamField.swapCooldownUntil]).toBe(0);
    s.flags[0] = EntityFlag.alive;
    step(w, [Cmd.swap1, NO_COMMAND]);
    expect([benched(s.flags[0]), benched(s.flags[1])]).toEqual([true, false]);
  });
});

describe('rest heal', () => {
  it('heals a benched character 0.5% maxHp every 50 ticks from the bench and stops at restCap (fixture healWithRest)', () => {
    // Legacy HealWithRest: Crafty delay(fn, 1000, -1) repeats forever until the heal passes maxHealthWithRest.
    const w = createMatch(setup);
    const s = w.state;
    s.maxHp[1] = 150;
    s.hp[1] = 50;
    s.restCap[1] = 51.2;
    const trace = legacy.healWithRest.trace.map((t) => t.v);
    expect(trace.slice(0, 2)).toEqual([50.75, 51.2]);
    expect(legacy.healWithRest.destroyedAtCap).toBe(true);
    for (let i = 0; i < 50; i++) step(w, idle);
    expect(s.hp[1]).toBe(50); // the timer started with the match: first heal at tick 50
    step(w, idle);
    expect(s.hp[1]).toBe(trace[0]);
    for (let i = 0; i < 49; i++) step(w, idle);
    expect(s.hp[1]).toBe(trace[0]);
    step(w, idle);
    expect(s.hp[1]).toBe(trace[1]);
    expect(s.expireTick[1]).toBe(0); // clamped at the cap: the timer is gone (legacy destroys it)
    s.hp[1] = 50;
    for (let i = 0; i < 200; i++) step(w, idle);
    expect(s.hp[1]).toBe(50);
  });

  it('starts the timer at the bench tick', () => {
    const w = createMatch(setup);
    const s = w.state;
    step(w, idle);
    s.hp[0] = 40;
    s.restCap[0] = 100;
    step(w, [Cmd.swap1, NO_COMMAND]); // benched on tick 1
    expect(s.expireTick[0]).toBe(51);
    for (let i = 0; i < 49; i++) step(w, idle);
    expect(s.hp[0]).toBe(40);
    step(w, idle);
    expect(s.hp[0]).toBe(40 + (s.maxHp[0] ?? 0) * 0.005);
  });

  it('does not heal the active player or a dead character (fixture healWithRest)', () => {
    const w = createMatch(setup);
    const s = w.state;
    s.hp[0] = 50;
    s.restCap[0] = 100;
    s.expireTick[0] = 1;
    s.flags[2] = (s.flags[2] ?? 0) | EntityFlag.dead;
    s.hp[2] = 50;
    s.restCap[2] = 100;
    for (let i = 0; i < 160; i++) step(w, idle);
    expect([s.hp[0], s.hp[2]]).toEqual([legacy.healWithRest.activePlayerHp, legacy.healWithRest.deadBenchedHp]);
  });

  it('keeps healing an enemy that is back in play while its timer runs (legacy isBenched quirk)', () => {
    // KNOWN-BUG:rest-heal-enemy-in-play (replicated)
    const w = createMatch(setup);
    const s = w.state;
    s.hp[3] = 50;
    s.restCap[3] = 100;
    s.expireTick[3] = 1;
    step(w, idle);
    step(w, idle);
    expect(s.hp[3]).toBe(50 + (s.maxHp[3] ?? 0) * 0.005);
  });

  it('halves the gap to the cap when benched', () => {
    const w = createMatch(setup);
    const s = w.state;
    s.hp[0] = 40;
    s.restCap[0] = 100;
    step(w, [Cmd.swap1, NO_COMMAND]);
    expect(s.restCap[0]).toBe(70);
    expect(s.hp[0]).toBe(40);
  });
});
