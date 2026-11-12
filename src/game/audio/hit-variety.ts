/**
 * Hit variety for the sampled `damage` cue (view only, no sim state, no random): the legacy sample is replayed at a
 * playback rate that falls from 1.15 (nil hit) to 0.85 (200 damage or more) and steps through a fixed 5-step cycle
 * (-0.04, +0.02, -0.02, +0.04, 0), so back-to-back hits differ. It uses the sample rate alone: no new asset, no licence.
 * Kept tiny because it ships in the main chunk (size budget). `amount` is the sim's whole-number damage (missing counts as 0).
 */
export const hitRate = (amount = 0, n = 0): number => 1.15 - Math.min(Math.max(amount, 0), 200) * 0.0015 + (((n * 3) % 5) - 2) * 0.02;
