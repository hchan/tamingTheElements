/** Rollback window (ticks of remote-input prediction) used by the game; tests import it from here. Contract value. */
export const ROLLBACK_WINDOW = 6;

/**
 * Most ticks a peer's batch may reach past our own newest local tick before the session reports a desync
 * ('batch-ahead'). Contract value: one full packet (MAX_INPUTS_PER_PACKET = 64, 1.28 s at 50 Hz). The honest
 * lead is about ROLLBACK_WINDOW + 8 (max input delay) + 1 = 15 ticks (estimate), so this is a 4x margin.
 */
export const BATCH_AHEAD_SLACK = 64;

/**
 * Most stalled wall ticks the online driver will repay by catching up (see `CatchUp`). Tunable; 15 ticks = 300 ms at 50 Hz
 * (estimate of the longest stall worth hiding; a longer one is forgiven rather than fast-forwarded).
 */
export const ONLINE_CATCH_UP_MAX_DEBT = 15;
