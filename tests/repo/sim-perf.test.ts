// Sim performance gate (docs/PERFORMANCE.md). Bounds are deliberately generous so a loaded CI machine never trips them;
// they exist to catch an order-of-magnitude regression (an accidental O(n^2), a per-tick state copy).
// Wall-clock is read with performance.now() in this TEST only; src/core itself never reads a clock.
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import { splitmix32 } from '../../src/core/rng/seed';
import { Cmd, type Command } from '../../src/core/sim/commands';
import { createMatch } from '../../src/core/sim/match';
import { EntityFlag, EntityKind, MAX_ENTITIES, type SimState } from '../../src/core/sim/state';
import { step } from '../../src/core/sim/step';
import { applyBuff, listStatuses } from '../../src/core/sim/systems/status';
import type { SimWorld } from '../../src/core/sim/world';

const TICKS = 1000;
const RUNS = 7;
/** Budget per tick (ms): the design target (docs/PERFORMANCE.md); the median of RUNS must stay under it. */
const MEDIAN_TICK_MS_BOUND = 0.5;
/** Wall-clock bound for 1000 ticks (20 s of game time), for the fastest of RUNS, on a loaded machine. */
const THOUSAND_TICKS_MS_BOUND = 2000;

/** Pre-built, repeating command stream (movement plus both ability buttons) so the timed loop builds nothing itself. */
const STREAM: readonly Command[] = (() => {
  const next = splitmix32(0xbadc0de);
  const bits = [Cmd.up, Cmd.down, Cmd.left, Cmd.right, Cmd.primary, Cmd.secondary, Cmd.primary | Cmd.right, Cmd.secondary | Cmd.up];
  return Array.from({ length: 512 }, () => bits[next() % bits.length] ?? 0);
})();
const cmd = (t: number, side: number): Command => STREAM[(t * 2 + side * 7) % STREAM.length] ?? 0;

function battle(): SimWorld {
  return createMatch({
    simVersion: 1,
    seed: 20260101,
    flags: DEFAULT_SIM_FLAGS,
    chapter: 1,
    difficulty: 1,
    p1: [
      { character: characterId('fiara'), xp: 100 },
      { character: characterId('curomo'), xp: 100 },
    ],
    p2: [
      { character: characterId('curomo'), xp: 100 },
      { character: characterId('fiara'), xp: 100 },
    ],
  });
}

/** One tick of the workload: 2 teams, pseudo-random commands, and a status buff refreshed every 60 ticks. */
function tick(world: SimWorld, t: number): void {
  if (t % 60 === 0) {
    applyBuff(world, 0, 'adrenaline');
    applyBuff(world, 2, 'fire-dance');
  }
  step(world, [cmd(t, 0), cmd(t, 1)]);
}

function median(xs: number[]): number {
  return [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
}

function liveOfKind(s: SimState, kind: number): number {
  let n = 0;
  for (let i = 0; i < MAX_ENTITIES; i++) if (((s.flags[i] ?? 0) & EntityFlag.alive) !== 0 && s.kind[i] === kind) n++;
  return n;
}

describe('sim performance', () => {
  it('the workload really exercises projectiles and statuses', () => {
    const world = battle();
    let maxProjectiles = 0;
    let statuses = 0;
    for (let t = 0; t < TICKS; t++) {
      tick(world, t);
      maxProjectiles = Math.max(maxProjectiles, liveOfKind(world.state, EntityKind.projectile));
      statuses = Math.max(statuses, listStatuses(world.state, 0).length + listStatuses(world.state, 2).length);
    }
    expect(maxProjectiles).toBeGreaterThan(0);
    expect(statuses).toBeGreaterThan(0);
  });

  it(`a tick averages under ${String(MEDIAN_TICK_MS_BOUND)} ms (median of ${String(RUNS)} runs); ${String(TICKS)} ticks finish in bounded time`, () => {
    const warm = battle();
    for (let t = 0; t < 300; t++) tick(warm, t); // warm-up so the JIT has compiled the systems
    const perTick: number[] = [];
    const total: number[] = [];
    for (let r = 0; r < RUNS; r++) {
      const world = battle();
      const t0 = performance.now();
      for (let t = 0; t < TICKS; t++) tick(world, t);
      const ms = performance.now() - t0;
      total.push(ms);
      perTick.push(ms / TICKS);
    }
    const msPerTick = median(perTick);
    console.info(`sim perf: median ${msPerTick.toFixed(4)} ms/tick, ${median(total).toFixed(1)} ms per ${String(TICKS)} ticks`);
    expect(msPerTick).toBeLessThan(MEDIAN_TICK_MS_BOUND);
    expect(Math.min(...total)).toBeLessThan(THOUSAND_TICKS_MS_BOUND);
  });
});

describe('sim steady-state allocation', () => {
  const views = (s: SimState): ArrayBufferView[] => Object.values(s).filter((v) => ArrayBuffer.isView(v));

  it('step() never reallocates or replaces simulation state (structural check)', () => {
    const world = battle();
    const before = views(world.state);
    const buffers = before.map((v) => v.buffer);
    for (let t = 0; t < 3000; t++) tick(world, t);
    const after = views(world.state);
    expect(after).toHaveLength(before.length);
    after.forEach((v, i) => {
      expect(v).toBe(before[i]);
      expect(v.buffer).toBe(buffers[i]);
    });
  });

  it('retained heap and ArrayBuffer memory do not grow over many ticks (heap-growth heuristic)', () => {
    // Per-tick garbage (the event sink and event objects) is young-generation and gets collected; what must not happen is
    // RETAINED growth. Force a full GC before each reading so only live data is measured, then allow generous slack.
    setFlagsFromString('--expose-gc');
    const gc = runInNewContext('gc') as () => void;
    const world = battle();
    for (let t = 0; t < 2000; t++) tick(world, t); // reach steady state
    gc();
    const before = process.memoryUsage();
    for (let t = 2000; t < 22_000; t++) tick(world, t);
    gc();
    const after = process.memoryUsage();
    const growthMb = (after.heapUsed - before.heapUsed) / 1e6;
    const bufGrowth = after.arrayBuffers - before.arrayBuffers;
    console.info(`sim alloc: retained heap growth ${growthMb.toFixed(3)} MB, arrayBuffers growth ${String(bufGrowth)} B over 20000 ticks`);
    // Retaining even 100 bytes per tick would be 2 MB over 20000 ticks; 4 MB tolerates V8 and vitest bookkeeping noise.
    expect(growthMb).toBeLessThan(4);
    expect(bufGrowth).toBeLessThan(1_000_000);
  });
});
