/** Online end-of-match linger: keeps an ended lockstep session receiving and re-sending (see `lingerSession`). */

/** Linger cadence floor in ms: 10 BATCH/s (choice, estimate; the live grant is 150 client-sent frames/s total, GRANT_FRAMES_PER_SEC in tools/live-match-constants.ts). */
export const LINGER_MIN_MS = 100;
/** Wall-clock ms per sim tick at 50 Hz. */
export const LINGER_TICK_MS = 20;

/** Linger interval: the normal batch rate, `max(LINGER_MIN_MS, batchEvery * 20)` ms (choice, estimate; was a fixed 20 ms, about 50 BATCH/s). */
export function lingerIntervalMs(batchEvery: number = 1): number {
  return Math.max(LINGER_MIN_MS, batchEvery * LINGER_TICK_MS);
}

/** The slice of LockstepSession the linger needs. */
export interface Lingerable {
  update(localCommand: 0): unknown;
}

/** Starts the linger (wall clock, not the paused driver); returns the stop function. */
export function lingerSession(session: Lingerable, batchEvery: number = 1): () => void {
  const t = setInterval(() => { session.update(0); }, lingerIntervalMs(batchEvery));
  return () => { clearInterval(t); };
}
