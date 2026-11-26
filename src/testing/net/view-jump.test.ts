import { describe, expect, it } from 'vitest';
import { measureMatch, PROFILES } from './online-measure';
import { ViewJumpMeter, type ViewJumpReport } from './view-jump';

/** A clear snap for one 20 ms frame (estimate: well above a walking step; mid-size steps from the decay tail are not counted). */
const OVER_PX = 30;

async function run(profile: 'typical' | 'bad'): Promise<ViewJumpReport> {
  let meter: ViewJumpMeter | undefined;
  await measureMatch({
    ticks: 1000, batchEvery: 3, inputDelay: 4, profile: PROFILES[profile], netSeed: 11,
    onFrame: (session, world) => { meter ??= new ViewJumpMeter(world, 0, OVER_PX); meter.frame(session); },
  });
  return (meter as ViewJumpMeter).report();
}

describe('rollback correction smoother over a simulated online match', () => {
  for (const profile of ['typical', 'bad'] as const) {
    it(`${profile}: the drawn remote hero jumps less than the raw sim position (measurement, local harness)`, async () => {
      const r = await run(profile);
      process.stdout.write(`view-jump ${profile}: ${JSON.stringify(r)}\n`);
      expect(r.frames).toBeGreaterThan(500);
      
      expect(r.rawOver).toBeGreaterThan(0);
      expect(r.smoothOver).toBeLessThan(r.rawOver);
      expect(r.smoothMax).toBeLessThan(r.rawMax);
    }, 60_000);
  }
});
