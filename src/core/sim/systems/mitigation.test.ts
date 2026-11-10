import { describe, expect, it } from 'vitest';
import fixture from '../../../../tests/fixtures/legacy/abilities-effects.json';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd, NO_COMMAND } from '../commands';
import { createMatch } from '../match';
import { step } from '../step';
import type { SimWorld } from '../world';

function duel(attacker: string, victim: string, gap: number): SimWorld {
  const roster = (r: string) => [{ character: characterId(r), xp: 0 }];
  const world = createMatch({
    simVersion: 0, seed: 1, flags: DEFAULT_SIM_FLAGS, chapter: 1, difficulty: 1, p1: roster(victim), p2: roster(attacker),
  });
  const s = world.state;
  s.x[1] = (s.x[0] ?? 0) + gap;
  s.px[1] = s.x[1];
  s.y[1] = s.y[0] ?? 0;
  s.py[1] = s.y[0] ?? 0;
  return world;
}

/** Victim (team 0) optionally casts its primary, then the attacker (team 1) fires `bit`; returns damage taken. */
function taken(attacker: string, victim: string, gap: number, bit: number, cast: boolean): number {
  const w = duel(attacker, victim, gap);
  const s = w.state;
  const hp0 = s.hp[0] ?? 0;
  for (let t = 0; t < 40; t++) step(w, [cast && t === 0 ? Cmd.primary : NO_COMMAND, t === 0 ? bit : NO_COMMAND]);
  return hp0 - (s.hp[0] ?? 0);
}

describe('incoming-damage decrease (rockArmour fixture)', () => {
  const armour = fixture.rockArmour as unknown as { armoured: { dec: number } };

  it('Rock Armour cuts a projectile hit by 75% (Stick 10 -> 2.5)', () => {
    expect(armour.armoured.dec).toBe(75);
    expect(taken('dummy', 'rokcore', 120, Cmd.primary, false)).toBe(10);
    expect(taken('dummy', 'rokcore', 120, Cmd.primary, true)).toBe(2.5);
  });

  it('Rock Armour cuts a melee hit by 75% (Ground Shock 25 -> 6.25)', () => {
    expect(taken('pax', 'rokcore', 100, Cmd.secondary, false)).toBe(25);
    expect(taken('pax', 'rokcore', 100, Cmd.secondary, true)).toBe(6.25);
  });

  it('Adrenaline cuts incoming damage by 25%', () => {
    expect(taken('dummy', 'pax', 120, Cmd.primary, true)).toBe(7.5);
  });
});
