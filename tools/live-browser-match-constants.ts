// Tunable values for tools/live-browser-match.ts (one place; the tool imports them).
/** Sim ticks of the short match (50 Hz, so 6 s of sim). A contract with the dev/test-only `?matchticks=` flag, not a measurement. */
export const LIVE_BROWSER_MATCH_TICKS = 300;
/** Wait for each setup step (queue, match, arena), ms. An estimate: the live queue pairs two waiting clients in seconds. */
export const LIVE_BROWSER_STEP_MS = 45_000;
/** Wait for the match to end after the arena shows, ms. An estimate: 6 s of sim plus software-GL slowdown and the lockstep delay. */
export const LIVE_BROWSER_END_MS = 120_000;
/** Origin the local build is served under (the deployed game's public origin; the relay's CORS allows it and not localhost). Contract value. */
export const LIVE_BROWSER_PAGE_ORIGIN = 'https://hchan.github.io';
/** Matches per invocation when `--runs` is not given. Contract with the CLI, not a measurement. */
export const LIVE_BROWSER_DEFAULT_RUNS = 1;
/** Upper bound for `--runs`. Estimate: a guard against a typo, since each run is a real match on the live relay (the 12-run pass is the transport bar). */
export const LIVE_BROWSER_MAX_RUNS = 50;
/** Pause between sequential runs, ms. Estimate (same 5 s as the old throwaway loop) so the relay sees the previous sessions gone. */
export const LIVE_BROWSER_RUN_GAP_MS = 5000;
