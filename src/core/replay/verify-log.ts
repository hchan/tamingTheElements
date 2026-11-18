import { hash } from '../sim/hash';
import { createMatch } from '../sim/match';
import { step } from '../sim/step';
import { HASH_INTERVAL, setupFromHeader, type ReplayFile } from './format';
import { rleDecode } from './rle';
import { validateReplay } from './validate';

/** What a server needs: the match header (setup + seed) and the two RLE command streams. Claimed hashes are optional. */
export interface CommandLog {
  readonly header: ReplayFile['header'];
  readonly inputs: ReplayFile['inputs'];
  readonly hashes?: readonly number[];
  readonly finalHash?: number;
}

export interface VerifyLogOptions {
  /** Refuse a log recorded under a different sim version (pass `SIM_VERSION`). */
  readonly simVersion?: number;
  /** Server-authoritative seed; replaces the header's seed when given. */
  readonly seed?: number;
}

export type VerifyLogResult =
  | { readonly ok: true; readonly finalHash: number; readonly checkpoints: readonly number[]; readonly tickCount: number }
  | { readonly ok: false; readonly kind: 'invalid'; readonly message: string }
  | {
      readonly ok: false;
      readonly kind: 'mismatch';
      readonly message: string;
      /** Checkpoint tick of the first mismatch (a multiple of HASH_INTERVAL, or tickCount for the final hash). */
      readonly firstDivergentTick: number;
      readonly expected: number;
      readonly actual: number;
      readonly finalHash: number;
      readonly checkpoints: readonly number[];
    };

const bad = (message: string): VerifyLogResult => ({ ok: false, kind: 'invalid', message });

/**
 * Pure, deterministic, no-I/O server-side check: re-simulates a replay or command log and returns the final state
 * hash plus every checkpoint hash (`checkpoints[i]` is the hash at the start of tick `i * HASH_INTERVAL`).
 * When the log carries claimed hashes (`hashes` and `finalHash`) they are compared and the first divergence is
 * reported as `kind: 'mismatch'`; a log without claims is simply simulated. Never throws: malformed input, tester
 * (cheat) logs and version mismatches come back as `kind: 'invalid'`.
 */
export function verifyReplayLog(raw: unknown, options: VerifyLogOptions = {}): VerifyLogResult {
  try {
    if (typeof raw !== 'object' || raw === null) return bad('This is not a replay or command log.');
    const log = raw as Record<string, unknown>;
    const claimed = Array.isArray(log['hashes']) && typeof log['finalHash'] === 'number';
    const header: unknown = log['header'];
    let tickCount = 0;
    if (typeof header === 'object' && header !== null) {
      const t = (header as Record<string, unknown>)['tickCount'];
      if (typeof t === 'number' && Number.isInteger(t) && t >= 0 && t <= 50 * 60 * 120) tickCount = t;
    }
    // Placeholders let the shared validator check a command log that carries no claimed hashes.
    const probe: Record<string, unknown> = claimed
      ? log
      : { ...log, hashes: new Array<number>(Math.ceil(tickCount / HASH_INTERVAL)).fill(0), finalHash: 0 };
    const checked = validateReplay(probe);
    if (!checked.ok) return bad(checked.message);
    const replay = checked.value;
    const h = options.seed === undefined ? replay.header : { ...replay.header, seed: options.seed };
    if (options.seed !== undefined && !(Number.isInteger(options.seed) && options.seed >= 0 && options.seed <= 0xffffffff)) {
      return bad('The seed is invalid.');
    }
    if (options.simVersion !== undefined && h.simVersion !== options.simVersion) {
      return bad(`The log simVersion ${String(h.simVersion)} does not match ${String(options.simVersion)}.`);
    }
    const in0 = rleDecode(replay.inputs[0]);
    const in1 = rleDecode(replay.inputs[1]);
    const world = createMatch(setupFromHeader(h));
    const checkpoints: number[] = [];
    let firstBad: { tick: number; expected: number; actual: number } | undefined;
    for (let t = 0; t < h.tickCount; t++) {
      if (t % HASH_INTERVAL === 0) {
        const actual = hash(world.state);
        checkpoints.push(actual);
        const expected = replay.hashes[t / HASH_INTERVAL] as number;
        if (claimed && firstBad === undefined && actual !== expected) firstBad = { tick: t, expected, actual };
        if (firstBad !== undefined) break;
      }
      step(world, [in0[t] as number, in1[t] as number]);
    }
    if (firstBad === undefined) {
      const finalHash = hash(world.state);
      if (claimed && finalHash !== replay.finalHash) firstBad = { tick: h.tickCount, expected: replay.finalHash, actual: finalHash };
      else return { ok: true, finalHash, checkpoints, tickCount: h.tickCount };
    }
    return {
      ok: false,
      kind: 'mismatch',
      message: `DIVERGED at tick ${String(firstBad.tick)} (expected ${String(firstBad.expected)}, got ${String(firstBad.actual)})`,
      firstDivergentTick: firstBad.tick,
      expected: firstBad.expected,
      actual: firstBad.actual,
      finalHash: firstBad.actual,
      checkpoints,
    };
  } catch (e) {
    return bad(`The log could not be simulated: ${e instanceof Error ? e.message : String(e)}`);
  }
}
