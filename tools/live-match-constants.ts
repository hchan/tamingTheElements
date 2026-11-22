// The one place for tools/live-match.ts pacing, waits and frame budgets. Each value is labelled CONTRACT (a number the relay or the protocol
// docs state, owner of the number in brackets) or ESTIMATE (our own choice, not measured). tests/repo/live-match.test.ts imports this file.

/** ESTIMATE: each side sends one batch per gap, so two sides stay far below the 150 frames/s grant (scripted scenarios keep their older, lower pacing). */
export const BATCH_GAP_MS = 250;
/** ESTIMATE: gap between scripted-input packets (--inputs): 10 packets/s per client, the live grant's ceiling; the real game sends 50/s. */
export const INPUT_GAP_MS = 100;
/** ESTIMATE: generous wall-clock cap per step (queue pairing of two fresh sessions should take a second or two). */
export const STEP_TIMEOUT_MS = 20_000;
/** ESTIMATE: how long to keep draining after the last batch before calling a missing batch lost (late vs lost). */
export const DRAIN_MAX_MS = 5000;

/** CONTRACT (owner of the number: the project owner, 2026-11-21, "yes, 150/s"; raised from 10): client-sent frames per second, ALL our live clients combined. One real-pace match sends about 103/s (computed; harness measured 103-105/s), so this allows one match at a time at batchEvery 1. */
export const GRANT_FRAMES_PER_SEC = 150;
/** The 150/s grant is a total across all our live clients (owner, 2026-11-21), not per client. One live runner at a time. */
export const GRANT_IS_PER_CLIENT = false;
/** ESTIMATE: hard cap on frames one scenario sends per side (counted by `sendCounted`; the run throws when it is exceeded). */
export const SCENARIO_FRAMES_PER_SIDE = 25;
/** CONTRACT (docs/ONLINE-PROTOCOL.md, MATCH_GRACE_MS; relay grace 10 s per sct-27): how long a silent peer is kept before it is gone. */
export const PEER_GRACE_MS = 10_000;
/** CONTRACT (per sct-27, relay code): `gone` comes from a sweep that runs once a minute, so it arrives 10 to about 70 s after the drop. */
export const GONE_SWEEP_MS = 60_000;
/** ESTIMATE: lag of the socket-closed notice plus slack on top of the sweep before a missing `gone` is a failure. */
export const GONE_MARGIN_MS = GONE_SWEEP_MS + 20_000;
/** ESTIMATE: how long a scenario waits for the relay's reaction to a hash disagreement or a bad version before reporting "no reaction". */
export const REACTION_WAIT_MS = 3000;
/** ESTIMATE: added to SIM_VERSION in HELLO for --bad-version (any value the relay cannot know). */
export const BAD_SIM_VERSION_OFFSET = 1000;
/** ESTIMATE: tick and the two differing hashes --disagree reports. */
export const DISAGREE_TICK = 50;
export const DISAGREE_HASHES = [0x1111, 0x2222] as const;
/** ESTIMATE: wall-clock budget of one scenario's steady send pacing, in frames per second per side; asserted below the grant by the tests. */
export const SCENARIO_FRAMES_PER_SEC = 1000 / BATCH_GAP_MS;
