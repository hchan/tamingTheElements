/** Mutable per-frame HUD state shared by reference between the `Hud` scene and its view helpers (which never import the scene). */
export interface HudFlags {
  /** High-contrast palette (accessibility pref). */
  highContrast: boolean;
  /** Reduced motion (accessibility pref): steady glows, no pulses. */
  reduceMotion: boolean;
  /** Last frame's delta in ms. */
  frameMs: number;
  /** Frames drawn since the scene started. */
  frame: number;
  /** An Arcade match (slim HUD) rather than the Classic plates. */
  arcade: boolean;
}

export const newHudFlags = (): HudFlags => ({ highContrast: false, reduceMotion: false, frameMs: 1000 / 60, frame: 0, arcade: false });
