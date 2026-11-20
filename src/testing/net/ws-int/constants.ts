/** Tunables of the real-socket test layer (docs/REPO-MAP.md, src/testing/net/ws-int). Each value says whether it is a contract value, a choice or an estimate. */

/** [contract] Tests bind loopback only, so no test ever reaches a real network. */
export const LOOPBACK_HOST = '127.0.0.1';
/** [contract] Port 0 asks the OS for a free port, so no fixed port can clash with the dev or e2e ports. */
export const ANY_PORT = 0;
/** [contract] Schemes of the local server; the client is handed https and wss addresses and the harness maps them to these. */
export const LOCAL_WS_SCHEME = 'ws';
export const LOCAL_HTTP_SCHEME = 'http';

/** [estimate] Hang guard of `IntHarness.until`, real milliseconds. Never a wait; only turns a hang into a labelled failure, far under TEST_TIMEOUT_MS. */
export const UNTIL_CAP_MS = 15_000;
/** [choice] Start of the server's manual clock (same arbitrary start as conformance-loopback). */
export const RELAY_CLOCK_START_MS = 1_000_000;
/** [choice] LCG of the relay-backed server's randomness (Numerical Recipes constants and a fixed seed, as conformance-loopback). */
export const LCG = { seed: 12345, mul: 1664525, add: 1013904223 } as const;

/** [estimate, unconfirmed against a live gateway] Wording of API-Gateway-style failure notices. The live conformance run records the real one. */
export const GatewayNotice = { internal: 'Internal server error', throttled: 'Too Many Requests' } as const;
export type GatewayPhrase = (typeof GatewayNotice)[keyof typeof GatewayNotice];

/** [choice] retryAfterSec the kill-switch tests use. */
export const TEST_RESTING_SEC = 120;
/** [choice] Frames per direction in the golden path. */
export const GOLDEN_BATCHES = 20;
/** [choice] matchId the tests announce in MATCH_START. */
export const TEST_MATCH_ID = 1;
