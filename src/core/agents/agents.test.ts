import { describe, expect, it } from 'vitest';
import { allocEntity } from '../sim/alloc';
import { hash as hashState } from '../sim/hash';
import { step } from '../sim/step';
import { EntityFlag, EntityKind } from '../sim/state';
import { createWorld } from '../sim/world';
import { Cmd, type Command } from '../sim/commands';
import { snapshotState } from '../sim/state';
import { seedSfc32 } from '../rng/seed';
import { AgentRng } from './agent-rng';
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

  it('random bot is deterministic per seed', () => {
    const a = setup(5);
    const b = setup(5);
    const la = run(a, [new RandomBot(), new RandomBot()], 300);
    const lb = run(b, [new RandomBot(), new RandomBot()], 300);
    expect(la).toEqual(lb);
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(new Set(la).size).toBeGreaterThan(3);
    expect(la.every((c) => (c & ~0x7f) === 0)).toBe(true);
  });

  it('consulting agents never writes the sim state', () => {
    const w = setup(5);
    const before = snapshotState(w.state);
    const bots = [new RandomBot(), new RandomBot()] as const;
    const seen = new Set<Command>();
    for (let i = 0; i < 200; i++) for (const c of collectCommands(w, bots)) seen.add(c);
    expect(seen.size).toBeGreaterThan(3);
    expect(snapshotState(w.state)).toEqual(before);
  });

  it('agent streams are seedSfc32(matchSeed, ai.p1 | ai.p2), bound to the view and independent per side', () => {
    const rng = new AgentRng();
    const ref1 = seedSfc32(5, 'ai.p1');
    const ref2 = seedSfc32(5, 'ai.p2');
    for (let i = 0; i < 20; i++) expect(rng.int({ matchSeed: 5, side: 0 }, 1000)).toBe(ref1.int(1000));
    const saved = rng.save();
    expect(rng.int({ matchSeed: 5, side: 1 }, 1000)).toBe(ref2.int(1000)); // re-bound to the other side
    rng.load(saved);
    expect(rng.int({ matchSeed: 5, side: 0 }, 1000)).toBe(ref1.int(1000));
    expect(new AgentRng().save()).toBeNull();
  });

  it('gives the same hash for the same commands whether or not agents were consulted', () => {
    const script: [Command, Command][] = Array.from({ length: 300 }, (_, t) => [
      [Cmd.up, Cmd.right | Cmd.primary, Cmd.down, Cmd.left | Cmd.secondary][(t >> 4) & 3] ?? 0,
      [Cmd.left, Cmd.down | Cmd.primary, Cmd.right][(t >> 5) % 3] ?? 0,
    ]);
    const consulted = setup(11);
    const plain = setup(11);
    const bots = [new RandomBot(), new RandomBot()] as const;
    for (const cmds of script) {
      collectCommands(consulted, bots); // asked, answer ignored (like the arena's forced-command test hook)
      step(consulted, cmds);
      step(plain, cmds);
      expect(hashState(consulted.state)).toBe(hashState(plain.state));
    }
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
