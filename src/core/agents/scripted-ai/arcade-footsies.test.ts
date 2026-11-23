import { describe, expect, it } from 'vitest';
import { Cmd } from '../../sim/commands';
import { ARCADE_AI_ZONE_HOLD_PX } from './arcade-ai';
import { FOOTSIE_HOLD_TICKS, FOOTSIE_PUNISH_PX, FOOTSIE_RANGED_IN_PX, footsieStep, type FootsieCtx } from './arcade-footsies';

const box = (x: number) => ({ x, y: 0, w: 40, h: 40 });
const ctx = (over: Partial<FootsieCtx> = {}): FootsieCtx => ({ tick: 3, prevCmd: 0, ranged: false, punishable: false, ...over });

describe('footsieStep', () => {
  it('holds the previous step against a reversal off the reversal tick, and allows it on the tick', () => {
    const c = ctx({ prevCmd: Cmd.right });
    expect(footsieStep(box(0), box(300), Cmd.left, c)).toBe(Cmd.right);
    expect(footsieStep(box(0), box(300), Cmd.left, { ...c, tick: FOOTSIE_HOLD_TICKS * 2 })).toBe(Cmd.left);
  });

  it('never touches a dash, guard, super, charge, trap or run command', () => {
    for (const bit of [Cmd.dash, Cmd.guard, Cmd.super, Cmd.charge, Cmd.trap, Cmd.run]) {
      const cmd = bit | Cmd.left;
      expect(footsieStep(box(0), box(100), cmd, ctx({ prevCmd: Cmd.right, punishable: true }))).toBe(cmd);
    }
  });

  it('punishes a recovering foe in reach with a step in and the primary press, but not out of reach or when not punishable', () => {
    const near = box(FOOTSIE_PUNISH_PX - 40);
    expect(footsieStep(box(0), near, 0, ctx({ punishable: true }))).toBe(Cmd.right | Cmd.primary);
    expect(footsieStep(box(0), box(FOOTSIE_PUNISH_PX + 100), 0, ctx({ punishable: true }))).toBe(0);
    expect(footsieStep(box(0), near, 0, ctx())).toBe(0);
  });

  it('walks a ranged hero in between the in-band and the zoning hold, only with nothing to do', () => {
    const r = ctx({ ranged: true });
    const far = box(FOOTSIE_RANGED_IN_PX + 40);
    expect(footsieStep(box(0), far, 0, r)).toBe(Cmd.right);
    expect(footsieStep(box(0), far, Cmd.primary, r)).toBe(Cmd.primary);
    expect(footsieStep(box(0), box(FOOTSIE_RANGED_IN_PX - 100), 0, r)).toBe(0);
    expect(footsieStep(box(0), box(ARCADE_AI_ZONE_HOLD_PX + 100), 0, r)).toBe(0);
  });
});
