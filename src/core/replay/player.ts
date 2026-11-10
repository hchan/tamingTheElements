import { hash } from '../sim/hash';
import { createMatch } from '../sim/match';
import { step } from '../sim/step';
import { HASH_INTERVAL, setupFromHeader, type ReplayFile } from './format';
import { rleDecode } from './rle';

export interface ReplayVerdict {
  readonly ok: boolean;
  /** Checkpoint tick (a multiple of HASH_INTERVAL, or tickCount for the final hash) of the first mismatch. */
  readonly firstDivergentTick?: number;
  readonly expected?: number;
  readonly actual?: number;
  readonly finalHash: number;
}

/** Re-simulates a replay, checking every recorded hash on the fly; stops at the first mismatch. */
export function playReplay(replay: ReplayFile, simVersion?: number): ReplayVerdict {
  const { header } = replay;
  if (simVersion !== undefined && header.simVersion !== simVersion) {
    throw new Error(`replay simVersion ${String(header.simVersion)} != ${String(simVersion)}`);
  }
  const in0 = rleDecode(replay.inputs[0]);
  const in1 = rleDecode(replay.inputs[1]);
  if (in0.length !== header.tickCount || in1.length !== header.tickCount) {
    throw new Error('replay input length does not match tickCount');
  }
  const world = createMatch(setupFromHeader(header));
  for (let t = 0; t < header.tickCount; t++) {
    if (t % HASH_INTERVAL === 0) {
      const actual = hash(world.state);
      const expected = replay.hashes[t / HASH_INTERVAL];
      if (actual !== expected) return { ok: false, firstDivergentTick: t, expected, actual, finalHash: actual };
    }
    step(world, [in0[t] as number, in1[t] as number]);
  }
  const finalHash = hash(world.state);
  if (finalHash !== replay.finalHash) {
    return { ok: false, firstDivergentTick: header.tickCount, expected: replay.finalHash, actual: finalHash, finalHash };
  }
  return { ok: true, finalHash };
}
