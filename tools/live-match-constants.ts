// The one place for tools/live-match.ts pacing, waits and frame budgets. Each value is labelled CONTRACT (a number the relay or the protocol
// docs state, owner of the number in brackets) or ESTIMATE (our own choice, not measured). tests/repo/live-match.test.ts imports this file.

/** ESTIMATE: each side sends one batch per gap, so two sides stay under half the 10 frames/s stage limit. */
export const BATCH_GAP_MS = 250;
/** ESTIMATE: gap between scripted-input packets (--inputs): 10 packets/s per client, the live grant's ceiling; the real game sends 50/s. */
export const INPUT_GAP_MS = 100;
/** ESTIMATE: generous wall-clock cap per step (queue pairing of two fresh sessions should take a second or two). */
export const STEP_TIMEOUT_MS = 20_000;
/** ESTIMATE: how long to keep draining after the last batch before calling a missing batch lost (late vs lost). */
export const DRAIN_MAX_MS = 5000;

/** CONTRACT (owner of the number: the relay stage grant): frames per second the stage allows. Our pacing must stay at or below it. */
export const GRANT_FRAMES_PER_SEC = 10;
/** ESTIMATE: the grant is read as per client (sct-27 has not confirmed per client or per match); the scenarios also fit a per-match reading. */
export const GRANT_IS_PER_CLIENT = true;
/** ESTIMATE: hard cap on frames one scenario sends per side (counted by `sendCounted`; the run throws when it is exceeded). */
export const SCENARIO_FRAMES_PER_SIDE = 25;
/** CONTRACT (docs/ONLINE-PROTOCOL.md, MATCH_GRACE_MS; relay grace 10 s per sct-27): how long a silent peer is kept before it is gone. */
export const PEER_GRACE_MS = 10_000;
/** ESTIMATE: margin on top of the grace before a missing `gone` is a failure. */
export const GONE_MARGIN_MS = 5000;
/** ESTIMATE: how long a scenario waits for the relay's reaction to a hash disagreement or a bad version before reporting "no reaction". */
export const REACTION_WAIT_MS = 3000;
/** ESTIMATE: added to SIM_VERSION in HELLO for --bad-version (any value the relay cannot know). */
export const BAD_SIM_VERSION_OFFSET = 1000;
/** ESTIMATE: tick and the two differing hashes --disagree reports. */
export const DISAGREE_TICK = 50;
export const DISAGREE_HASHES = [0x1111, 0x2222] as const;
/** ESTIMATE: wall-clock budget of one scenario's steady send pacing, in frames per second per side; asserted below the grant by the tests. */
export const SCENARIO_FRAMES_PER_SEC = 1000 / BATCH_GAP_MS;
