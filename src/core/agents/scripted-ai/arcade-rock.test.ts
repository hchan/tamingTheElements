import { describe, expect, it } from 'vitest';
import { Cmd } from '../../sim/commands';
import type { FighterView, RockView } from '../agent';
import { ArcadeTactics } from './arcade';
import { AI_HARD, ZONER } from './arcade-ai';

const MOVE = Cmd.left | Cmd.right | Cmd.up | Cmd.down;
const box = (x: number, y: number, w: number, h: number): FighterView => ({ id: 0, x, y, w, h, hp: 1000, maxHp: 1000, flags: 1, alive: true });
const rock = (x: number, y: number, w: number, h: number): RockView => ({ x, y, w, h });
const moveOf = (cmd: number): number => cmd & MOVE;

/** Runs the rock slide alone (the rest of `apply` also edits the movement bits). */
function press(self: FighterView, rocks: RockView[], cmd: number, tick = 100): number {
  const t = new ArcadeTactics(AI_HARD, ZONER) as unknown as {
    slide(tick: number, self: FighterView, opp: FighterView, rocks: readonly RockView[], cmd: number, tagTeam: boolean): number;
  };
  return t.slide(tick, self, box(200, 300, 80, 80), rocks, cmd, false);
}

describe('rock look-ahead (SIM_VERSION 83)', () => {
  it('slides a fighter wedged on a rock corner (swept box, left+down pressed)', () => {
    expect(moveOf(press(box(1269.3, 439.8, 72, 72), [rock(1109, 286, 160, 160)], Cmd.left | Cmd.down))).toBe(Cmd.down);
    expect(moveOf(press(box(574.9, 312.0, 80, 80), [rock(651, 394, 160, 160)], Cmd.left | Cmd.down))).toBe(Cmd.left | Cmd.up);
    expect(moveOf(press(box(1010.1, 494.7, 136, 136), [rock(910, 340, 100, 160)], Cmd.left | Cmd.down))).toBe(Cmd.down);
  });

  it('Abyssor follow-on: keeps sliding down, then passes left+down once clear', () => {
    const r = [rock(910, 340, 100, 160)];
    expect(moveOf(press(box(1010.1, 498.09, 136, 136), r, Cmd.left | Cmd.down))).toBe(Cmd.down);
    expect(moveOf(press(box(1010.1, 501.31, 136, 136), r, Cmd.left | Cmd.down))).toBe(Cmd.left | Cmd.down);
  });

  it('blocks a step of 0-8 px that would hit a rock and frees a clear one', () => {
    const r = [rock(1000, 300, 100, 100)];
    expect(moveOf(press(box(915, 310, 80, 80), r, Cmd.right))).not.toBe(Cmd.right); // 5 px short: within the look-ahead
    expect(moveOf(press(box(911, 310, 80, 80), r, Cmd.right))).toBe(Cmd.right); // 9 px short: out of reach
  });

  it('drops a dash that runs into a rock, keeps guard and super and a clear dash', () => {
    const r = [rock(1000, 300, 100, 100)];
    const near = box(915, 310, 80, 80);
    const dashed = press(near, r, Cmd.right | Cmd.dash);
    expect(dashed & Cmd.dash).toBe(0);
    expect(moveOf(dashed)).not.toBe(Cmd.right);
    expect(press(near, r, Cmd.right | Cmd.guard) & Cmd.guard).toBe(Cmd.guard);
    expect(press(near, r, Cmd.right | Cmd.super) & Cmd.super).toBe(Cmd.super);
    expect(press(box(500, 310, 80, 80), r, Cmd.right | Cmd.dash)).toBe(Cmd.right | Cmd.dash);
  });

  it('leaves the command alone in an open field or with no rocks', () => {
    expect(press(box(500, 300, 80, 80), [], Cmd.left | Cmd.down)).toBe(Cmd.left | Cmd.down);
    expect(press(box(500, 300, 80, 80), [rock(1400, 500, 100, 100)], Cmd.left | Cmd.down)).toBe(Cmd.left | Cmd.down);
  });
});
