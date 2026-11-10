import { describe, expect, it } from 'vitest';
import fixture from '../../../../tests/fixtures/legacy/abilities-effects.json';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd, NO_COMMAND } from '../commands';
import { createMatch } from '../match';
import { cooldownIdx, EntityFlag } from '../state';
import { step } from '../step';
import type { SimWorld } from '../world';
import { damageDecreasePct } from './status';

function duel(race: string): SimWorld {
  const roster = (r: string) => [{ character: characterId(r), xp: 0 }];
  return createMatch({
    simVersion: 0, seed: 1, flags: DEFAULT_SIM_FLAGS, chapter: 1, difficulty: 1, p1: roster(race), p2: roster('dummy'),
  });
}

const press = (w: SimWorld, bit: number, n = 1): void => {
  for (let i = 0; i < n; i++) step(w, [bit, NO_COMMAND]);
};
const idle = (w: SimWorld, n: number): void => {
  press(w, NO_COMMAND, n);
};

describe('self-cast abilities through step() (abilities-effects fixture)', () => {
  it('Adrenaline (pax, primary): speed 5 -> 10, 25% decrease, restored after 3 s', () => {
    const w = duel('pax');
    const s = w.state;
    press(w, Cmd.primary);
    expect([s.speed[0], damageDecreasePct(s, 0)]).toEqual([10, 25]);
    idle(w, 149);
    expect(s.speed[0]).toBe(10);
    idle(w, 1);
    expect([s.speed[0], damageDecreasePct(s, 0)]).toEqual([5, 0]);
  });

  it('Rock Armour (rokcore, primary): 75% decrease for 3 s, no speed change', () => {
    const w = duel('rokcore');
    const s = w.state;
    press(w, Cmd.primary);
    expect([s.speed[0], damageDecreasePct(s, 0)]).toEqual([7, 75]);
    idle(w, 150);
    expect(damageDecreasePct(s, 0)).toBe(0);
  });

  it('Fire Dance (lavax, secondary): speed 6 -> 8 for 5 s', () => {
    const w = duel('lavax');
    const s = w.state;
    press(w, Cmd.secondary);
    expect(s.speed[0]).toBe(8);
    idle(w, 250);
    expect(s.speed[0]).toBe(6);
  });

  for (const [race, slot, bit, ticks] of [['echo', 0, Cmd.primary, 150], ['sindarosa', 1, Cmd.secondary, 75]] as const) {
    it(`${race} translucency lasts ${String(ticks * 20)} ms and clears`, () => {
      const w = duel(race);
      const s = w.state;
      press(w, bit);
      expect((s.flags[0] ?? 0) & EntityFlag.translucent).toBe(EntityFlag.translucent);
      idle(w, ticks);
      expect((s.flags[0] ?? 0) & EntityFlag.translucent).toBe(0);
      expect(slot).toBeGreaterThanOrEqual(0);
    });
  }

  it('Fire Heal (fiara, primary) matches the fireHeal table for heal multipliers and caps', () => {
    const table = fixture.fireHeal as unknown as Record<string, { hp: { v: number } }>;
    for (const [key, want] of Object.entries(table)) {
      const [mult, hp] = key.split(':').map(Number) as [number, number];
      const w = duel('fiara');
      const s = w.state;
      s.maxHp[0] = 120;
      s.hp[0] = hp;
      s.healMult[0] = mult;
      press(w, Cmd.primary);
      expect(s.hp[0], key).toBe(Math.min(want.hp.v, 120));
    }
  });

  it('books a strict cooldown: recast only one tick after it elapses', () => {
    const w = duel('pax');
    const s = w.state;
    press(w, Cmd.primary);
    expect(s.abil[cooldownIdx(0, 0)]).toBe(0 + 750 + 1);
    press(w, Cmd.primary, 700);
    expect(damageDecreasePct(s, 0)).toBe(0);
    idle(w, 49);
    press(w, Cmd.primary); // tick 750: still on cooldown
    expect(damageDecreasePct(s, 0)).toBe(0);
    press(w, Cmd.primary); // tick 751
    expect(damageDecreasePct(s, 0)).toBe(25);
  });

  it('is blocked while frozen', () => {
    const w = duel('pax');
    w.state.flags[0] = (w.state.flags[0] ?? 0) | EntityFlag.frozen;
    press(w, Cmd.primary);
    expect(damageDecreasePct(w.state, 0)).toBe(0);
  });
});
