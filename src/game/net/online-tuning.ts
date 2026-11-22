/**
 * Client-side online feel tuning (one module; tests import it).
 *
 * The relay's MATCH_START suggests `inputDelay` (measured live 2026-11-22: 4 with batchEvery 3). Each input tick of delay is
 * 20 ms of lag between a key press and the move on screen (arithmetic, 50 Hz). Rollback (ROLLBACK_WINDOW) hides late remote
 * input, so the client keeps its own delay low and lets the session raise it on stalls (adaptive, up to maxInputDelay).
 * Owner, 2026-11-22: "I want very responsive". 2 is an estimate, not a measurement; lower it to 1 if live play shows no stalls.
 */
export const ONLINE_MAX_START_INPUT_DELAY = 2;

/** The delay the client starts with: the relay's suggestion, capped. */
export const startInputDelay = (relayDelay: number): number => Math.min(relayDelay, ONLINE_MAX_START_INPUT_DELAY);
