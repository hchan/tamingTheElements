import { describe, expect, it } from 'vitest';
import fixture from '../../../../tests/fixtures/legacy/abilities-range.json';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd, NO_COMMAND } from '../commands';
import { createMatch } from '../match';
import { EntityKind, MAX_ENTITIES } from '../state';
import { step } from '../step';

interface Num { v: number }
interface Entry { speed: number; damage: Num; w: Num; h: Num; bullets: { x: number; y: number }[] }
const iceBlast = (fixture.abilities as unknown as Record<string, Entry>)['Ice Blast'] as Entry;

function duel() {
  const roster = (r: string) => [{ character: characterId(r), xp: 0 }];
  const world = createMatch({
    simVersion: 0, seed: 1, flags: DEFAULT_SIM_FLAGS, chapter: 1, difficulty: 1, p1: roster('morblass'), p2: roster('dummy'),
  });
  const s = world.state;
  s.x[1] = (s.x[0] ?? 0) + 300;
  s.px[1] = s.x[1];
  s.y[1] = s.y[0] ?? 0;
  s.py[1] = s.y[0] ?? 0;
  return world;
}

describe('Ice Blast cast from the primary slot (abilities-range fixture)', () => {
  it('spawns one bullet with the legacy geometry, speed and damage', () => {
    const world = duel();
    const s = world.state;
    step(world, [Cmd.primary, NO_COMMAND]);
    const id = Array.from({ length: MAX_ENTITIES }, (_, i) => i).find((i) => s.kind[i] === EntityKind.projectile) ?? -1;
    expect(id).toBeGreaterThanOrEqual(0);
    expect([s.w[id], s.h[id], s.speed[id]]).toEqual([iceBlast.w.v, iceBlast.h.v, iceBlast.speed]);
    expect(s.hp[id]).toBe(iceBlast.damage.v);
  });

  it('hits for 15, slows the target by 2 and restores its speed after 3 s', () => {
    const world = duel();
    const s = world.state;
    const hp0 = s.hp[1] ?? 0;
    const speed0 = s.speed[1] ?? 0;
    step(world, [Cmd.primary, NO_COMMAND]);
    for (let t = 0; t < 60; t++) step(world, [NO_COMMAND, NO_COMMAND]);
    expect(hp0 - (s.hp[1] ?? 0)).toBe(15);
    expect(s.speed[1]).toBe(Math.max(speed0 - 2, speed0 - 2 < 0 ? speed0 / 2 : 0));
    for (let t = 0; t < 160; t++) step(world, [NO_COMMAND, NO_COMMAND]);
    expect(s.speed[1]).toBeCloseTo(speed0, 10);
  });

  it('books the 6 s cooldown', () => {
    const world = duel();
    step(world, [Cmd.primary, NO_COMMAND]);
    for (let t = 0; t < 298; t++) step(world, [Cmd.primary, NO_COMMAND]);
    const n = Array.from({ length: MAX_ENTITIES }, (_, i) => i).filter((i) => world.state.kind[i] === EntityKind.projectile);
    expect(n.length).toBeLessThanOrEqual(1);
  });
});
