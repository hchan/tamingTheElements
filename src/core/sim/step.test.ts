import { describe, expect, it } from 'vitest';
import { Cmd } from './commands';
import { step } from './step';
import { EntityFlag, EntityKind } from './state';
import { allocEntity } from './alloc';
import { createWorld } from './world';

function setup(x = 100, y = 200) {
  const world = createWorld(1, { x: 0, y: 0, w: 400, h: 400 });
  const s = world.state;
  const id = allocEntity(s);
  s.kind[id] = EntityKind.character;
  s.team[id] = 0;
  s.x[id] = x;
  s.y[id] = y;
  s.w[id] = 80;
  s.h[id] = 80;
  s.speed[id] = 7;
  return { world, id };
}

describe('movement', () => {
  it('moves tick-exact on each dir8 input', () => {
    const table: [number, number, number][] = [
      [Cmd.right, 107, 200],
      [Cmd.left, 93, 200],
      [Cmd.up, 100, 193],
      [Cmd.down, 100, 207],
      [Cmd.right | Cmd.down, 107, 207],
      [Cmd.left | Cmd.up, 93, 193],
    ];
    for (const [cmd, x, y] of table) {
      const { world, id } = setup();
      step(world, [cmd, 0]);
      expect([world.state.x[id], world.state.y[id]]).toEqual([x, y]);
      step(world, [cmd, 0]);
      expect([world.state.x[id], world.state.y[id]]).toEqual([x + (x - 100), y + (y - 200)]);
    }
  });

  it('does not move without input or when frozen', () => {
    const { world, id } = setup();
    step(world, [0, 0]);
    expect(world.state.x[id]).toBe(100);
    world.state.flags[id] = (world.state.flags[id] ?? 0) | EntityFlag.frozen;
    step(world, [Cmd.right, 0]);
    expect(world.state.x[id]).toBe(100);
  });

  it('updates facing like bindNewDirection (x wins, idle keeps)', () => {
    const { world, id } = setup();
    step(world, [Cmd.down, 0]);
    expect(world.state.dir[id]).toBe(6);
    step(world, [Cmd.left | Cmd.up, 0]);
    expect(world.state.dir[id]).toBe(4);
    step(world, [0, 0]);
    expect(world.state.dir[id]).toBe(4);
  });

  it('the player (team 0) reverts the whole step at a wall, like Fourway stopOnSolids', () => {
    for (const [x, y, cmd] of [[318, 200, Cmd.right | Cmd.down], [100, 318, Cmd.down | Cmd.right], [318, 318, Cmd.right]] as const) {
      const { world, id } = setup(x, y);
      step(world, [cmd, 0]);
      expect([world.state.x[id], world.state.y[id]]).toEqual([x, y]);
    }
  });

  it('the enemy (team 1) restores x first, then y, then both, like resetIfOutOfBounds', () => {
    // KNOWN-BUG:bounds-y-typo is harmless: the misspelt `this.Y` lands in a variable that is never read.
    const table: [number, number, number, number][] = [
      [318, 200, 318, 207], // x restored: slides down
      [100, 318, 107, 318], // x alone does not free it: y restored, keeps the new x
      [318, 318, 318, 318], // neither alone: both restored
    ];
    for (const [x, y, ex, ey] of table) {
      const { world, id } = setup(x, y);
      world.state.team[id] = 1;
      step(world, [0, Cmd.right | Cmd.down]);
      expect([world.state.x[id], world.state.y[id]]).toEqual([ex, ey]);
    }
  });

  it('advances the tick and gives unique event ids', () => {
    const { world, id } = setup();
    const s = world.state;
    const id2 = allocEntity(s);
    s.kind[id2] = EntityKind.character;
    s.team[id2] = 1;
    s.w[id2] = 80;
    s.h[id2] = 80;
    s.speed[id2] = 7;
    s.x[id2] = 200;
    s.y[id2] = 200;
    const keys = new Set<string>();
    for (let t = 0; t < 5; t++) {
      const ev = step(world, [Cmd.right, Cmd.left]);
      expect(ev.length).toBe(2);
      for (const e of ev) {
        expect(e.tick).toBe(t);
        keys.add([e.tick, e.sourceId, e.kind, e.seq].join('/'));
      }
      expect(ev.map((e) => e.seq)).toEqual([0, 1]);
    }
    expect(keys.size).toBe(10);
    expect(id).not.toBe(id2);
  });
});
