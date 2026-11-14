import { createMatch, hash, headerFromSetup, rleEncode, HASH_INTERVAL, type DesyncInfo, type LockstepSession, type MatchSetup, type ReplayFile, type SessionStats } from '@core/index';

/** What "Save report" downloads: where the two games parted, plus a `replay` member that `pnpm replay:verify` can re-run (extract it to its own file). */
export interface DesyncReport {
  readonly kind: 'tte-desync-report';
  readonly setup: MatchSetup;
  readonly side: 0 | 1;
  readonly desync: DesyncInfo | undefined;
  readonly stats: SessionStats;
  readonly localCheckpoints: readonly (readonly [number, number])[];
  /** Replay format: commands as stepped on this side, hashes as this side computed them, up to the last consecutive checkpoint. */
  readonly replay: ReplayFile;
}

type Evidence = Pick<LockstepSession, 'side' | 'desync' | 'stats' | 'checkpoints' | 'commandLog' | 'simTick'>;

/** Pure: builds the report from the setup and a session's read-only evidence. */
export function buildDesyncReport(setup: MatchSetup, session: Evidence): DesyncReport {
  const checkpoints = session.checkpoints();
  const byTick = new Map<number, number>(checkpoints.map(([t, h]) => [t, h]));
  // Tick 0 is not a session checkpoint; the replay needs it and it depends only on the setup.
  byTick.set(0, hash(createMatch(setup).state));
  const [c0, c1] = session.commandLog();
  const known = Math.min(c0.length, c1.length, session.simTick);
  // A replay is checkable only while every checkpoint is known, so it stops at the last consecutive one.
  let ticks = 0;
  const hashes: number[] = [];
  for (let t = 0; byTick.has(t) && t <= known; t += HASH_INTERVAL) {
    hashes.push(byTick.get(t) as number);
    ticks = t;
  }
  const replay: ReplayFile = {
    header: headerFromSetup(setup, ticks),
    inputs: [rleEncode(c0.slice(0, ticks)), rleEncode(c1.slice(0, ticks))],
    hashes,
    finalHash: byTick.get(ticks) as number,
  };
  return { kind: 'tte-desync-report', setup, side: session.side, desync: session.desync, stats: { ...session.stats }, localCheckpoints: checkpoints, replay };
}
