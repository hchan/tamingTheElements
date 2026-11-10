import { describe, expect, it } from 'vitest';
import { allocEntity } from '../sim/alloc';
import { hash as hashState } from '../sim/hash';
import { step } from '../sim/step';
import { EntityFlag, EntityKind } from '../sim/state';
import { createWorld } from '../sim/world';
import { Cmd, type Command } from '../sim/commands';
import { collectCommands, createObservationView, type Agent } from './agent';
import { RandomBot } from './random-bot';
import { ReplayAgent } from './replay-agent';

function setup(seed = 5) {
  const world = createWorld(seed);
  const s = world.state;
  for (const team of [0, 1]) {
    const id = allocEntity(s);
    s.kind[id] = EntityKind.character;
    s.team[id] = team;
    s.flags[id] = EntityFlag.alive;
    s.x[id] = 200 + team * 600;
    s.y[id] = 300;
    s.w[id] = 80;
    s.h[id] = 80;
    s.hp[id] = 100;
    s.maxHp[id] = 100;
    s.speed[id] = 5;
  }
  return world;
}

function run(world: ReturnType<typeof setup>, agents: [Agent, Agent], n: number): Command[] {
  const log: Command[] = [];
  for (let i = 0; i < n; i++) {
    const cmds = collectCommands(world, agents);
    log.push(cmds[0]);
    step(world, cmds);
  }
  return log;
}

describe('agents', () => {
  it('view is a read-only copy of the world', () => {
    const world = setup();
    const v = createObservationView(world, 0);
    expect(v.self?.x).toBe(200);
    expect(v.opponent?.x).toBe(800);
    world.state.x[v.self?.id ?? 0] = 1;
    expect(v.self?.x).toBe(200);
  });

  it('random bot is deterministic per seed and its state lives in the world', () => {
    const a = setup(5);
    const b = setup(5);
    const la = run(a, [new RandomBot(), new RandomBot()], 300);
    const lb = run(b, [new RandomBot(), new RandomBot()], 300);
    expect(la).toEqual(lb);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(new Set(la).size).toBeGreaterThan(3);
    expect(la.every((c) => (c & ~0x7f) === 0)).toBe(true);
  });

  it('draws only from the own ai stream', () => {
    const w = setup(5);
    const before = w.state.rng.slice();
    createObservationView(w, 0).aiInt(10);
    const changed = [...w.state.rng].map((x, i) => x !== before[i]);
    expect(changed.slice(12, 16).some(Boolean)).toBe(true);
    expect(changed.slice(0, 12).some(Boolean)).toBe(false);
    expect(changed.slice(16).some(Boolean)).toBe(false);
  });

  it('replay agent reproduces a recorded run and is idle past the end', () => {
    const a = setup(9);
    const log = run(a, [new RandomBot(), new ReplayAgent([])], 200);
    const b = setup(9);
    run(b, [new ReplayAgent(log), new ReplayAgent([])], 200);
    expect(b.state.x[0]).toBe(a.state.x[0]);
    expect(b.state.y[0]).toBe(a.state.y[0]);
    const r = new ReplayAgent([Cmd.up]);
    expect(r.observe(createObservationView(b, 0), 5)).toBe(0);
  });
});
