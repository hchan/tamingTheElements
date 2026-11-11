import { describe, expect, it } from 'vitest';
import { CHARACTER_HEIGHT } from '../data/chapters';
import { characterId } from '../data/ids';
import { DEFAULT_SIM_FLAGS } from '../flags';
import { Cmd, type Command } from './commands';
import { createMatch, type MatchSetup } from './match';
import { skipIntro } from './systems/arcade/round-testkit';
import { step } from './step';
import { CLASSIC_BAR_ARENA, DEFAULT_ARENA, type SimWorld } from './world';

/** Top edge of the action bar (`BAR_Y` in src/game/hud/action-bar.ts, pinned against it in tests/repo). */
const BAR_Y = 640;

function match(inset: boolean): SimWorld {
  const roster = (c: string): MatchSetup['p1'] => [{ character: characterId(c), xp: 1 }];
  const setup: MatchSetup = {
    simVersion: 24, seed: 5, flags: { ...DEFAULT_SIM_FLAGS, walkAboveActionBar: inset }, chapter: 1, difficulty: 1,
    p1: roster('sindarosa'), p2: roster('pax'),
  };
  return skipIntro(createMatch(setup));
}

/** Holds Down for `id` and returns its bottom edge afterwards. */
function walkDown(w: SimWorld, id: number, ticks: number): number {
  const s = w.state;
  s.hp[1 - id] = 1_000_000;
  const cmds: [Command, Command] = [0, 0];
  cmds[id] = Cmd.down;
  for (let i = 0; i < ticks; i++) step(w, cmds);
  return (s.y[id] ?? 0) + (s.h[id] ?? 0);
}

describe('Classic action bar inset (walkAboveActionBar)', () => {
  it('ends the arena exactly at the action bar and keeps the legacy arena otherwise', () => {
    expect(CLASSIC_BAR_ARENA.y + CLASSIC_BAR_ARENA.h).toBe(BAR_Y);
    expect(CLASSIC_BAR_ARENA.y).toBe(DEFAULT_ARENA.y);
    expect(match(true).arena).toBe(CLASSIC_BAR_ARENA);
    expect(match(false).arena).toBe(DEFAULT_ARENA);
  });

  it('the hero cannot enter the bar zone', () => {
    expect(walkDown(match(true), 0, 600)).toBeLessThanOrEqual(BAR_Y);
  });

  it('the enemy cannot enter the bar zone either', () => {
    expect(walkDown(match(true), 1, 600)).toBeLessThanOrEqual(BAR_Y);
  });

  it('start rows stay inside the inset arena', () => {
    expect((match(true).state.y[0] ?? 0) + CHARACTER_HEIGHT).toBeLessThanOrEqual(BAR_Y);
  });

  // KNOWN-BUG:classic-walks-behind-action-bar: the legacy arena (flag off) is replicated; this is the intended behaviour.
  it.fails('legacy arena: the hero cannot enter the bar zone', () => {
    expect(walkDown(match(false), 0, 600)).toBeLessThanOrEqual(BAR_Y);
  });
});

describe('Classic swap in place (walkSwapInPlace)', () => {
  function swapped(inPlace: boolean): [number, number, number] {
    const roster = (c: string): MatchSetup['p1'] => [{ character: characterId(c), xp: 1 }, { character: characterId('pax'), xp: 1 }];
    const setup: MatchSetup = {
      simVersion: 24, seed: 5, flags: { ...DEFAULT_SIM_FLAGS, walkSwapInPlace: inPlace }, chapter: 1, difficulty: 1,
      p1: roster('sindarosa'), p2: [{ character: characterId('pax'), xp: 1 }],
    };
    const w = skipIntro(createMatch(setup));
    const s = w.state;
    s.hp[1] = 1_000_000;
    for (let i = 0; i < 40; i++) step(w, [Cmd.down | Cmd.right, 0]);
    const fromX = s.x[0] ?? 0;
    step(w, [Cmd.swap1, 0]);
    const to = [1, 2, 3].find((id) => ((s.flags[id] ?? 0) & 8) === 0 && s.team[id] === 0 && id !== 0) ?? 1;
    return [fromX, s.x[to] ?? 0, s.x[0] ?? 0];
  }

  it('the swapped-in hero stands where the outgoing one was when on, and at the team start when off', () => {
    const [fromX, toX] = swapped(true);
    expect(Math.abs(toX - fromX)).toBeLessThan(10);
    const [fromOff, toOff] = swapped(false);
    expect(Math.abs(toOff - fromOff)).toBeGreaterThan(10);
  });
});
