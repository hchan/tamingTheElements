// Tunable values for tools/live-browser-match.ts (one place; the tool imports them).
/** Sim ticks of the short match (50 Hz, so 6 s of sim). A contract with the dev/test-only `?matchticks=` flag, not a measurement. */
export const LIVE_BROWSER_MATCH_TICKS = 300;
/** Wait for each setup step (queue, match, arena), ms. An estimate: the live queue pairs two waiting clients in seconds. */
export const LIVE_BROWSER_STEP_MS = 45_000;
/** Wait for the match to end after the arena shows, ms. An estimate: 6 s of sim plus software-GL slowdown and the lockstep delay. */
export const LIVE_BROWSER_END_MS = 120_000;
/** Origin the local build is served under (the deployed game's public origin; the relay's CORS allows it and not localhost). Contract value. */
export const LIVE_BROWSER_PAGE_ORIGIN = 'https://hchan.github.io';
