import { describe, expect, it } from 'vitest';
import legacy from '../../../../tests/fixtures/legacy/abilities-effects.json';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd, NO_COMMAND } from '../commands';
import { SimEventKind } from '../events';
import { createMatch, type MatchSetup } from '../match';
import { EntityFlag, TEAM_STRIDE, TeamField } from '../state';
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

describe('rest heal', () => {
  it('heals a benched character 0.5% maxHp every 50 ticks up to restCap (fixture healWithRest)', () => {
    // KNOWN-BUG:rest-heal-once (intentional divergence: legacy healed once, the sim repeats)
    const w = createMatch(setup);
    const s = w.state;
    s.maxHp[1] = 150;
    s.hp[1] = 50;
    s.restCap[1] = 51.2;
    const fixture = legacy.healWithRest.trace[0]?.v;
    expect(fixture).toBe(50.75);
    step(w, idle);
    expect(s.hp[1]).toBe(fixture);
    for (let i = 0; i < 49; i++) step(w, idle);
    expect(s.hp[1]).toBe(fixture);
    step(w, idle);
    expect(s.hp[1]).toBe(51.2);
  });

  it('does not heal the active or a dead character', () => {
    const w = createMatch(setup);
    const s = w.state;
    s.hp[0] = 50;
    s.restCap[0] = 100;
    s.flags[2] = (s.flags[2] ?? 0) | EntityFlag.dead;
    s.hp[2] = 0;
    s.restCap[2] = 100;
    step(w, idle);
    expect(s.hp[0]).toBe(50);
    expect(s.hp[2]).toBe(0);
  });

  it('halves the gap to the cap when benched', () => {
    const w = createMatch(setup);
    const s = w.state;
    s.hp[0] = 40;
    s.restCap[0] = 100;
    step(w, idle); // tick 0 is a heal tick; swap on tick 1
    step(w, [Cmd.swap1, NO_COMMAND]);
    expect(s.restCap[0]).toBe(70);
    expect(s.hp[0]).toBe(40);
  });
});
