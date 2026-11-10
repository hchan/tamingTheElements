/** UI/platform feature flags: default off; `?ff=a,b` overrides only in dev or test builds. */
export interface UiFlags {
  readonly debugOverlay: boolean;
  readonly showFps: boolean;
  /** Enter the Phaser play path (temporary until the router has a play route). */
  readonly play: boolean;
  /** Pretend WebGL is unavailable, to exercise the error screen. */
  readonly forceNoWebgl: boolean;
  /** Play path starts a random-bot vs random-bot Arena after Preload. */
  readonly arenaDemo: boolean;
  /** Enemy uses the scripted AI instead of the random bot (falls back to the bot until the AI is complete). */
  readonly aiScripted: boolean;
  /** Play path starts the intro cinematic after Preload. */
  readonly cinematicDemo: boolean;
  /** Record playtests (`?ff=record`, dev and test builds); production uses the Settings checkbox instead. */
  readonly record: boolean;
  /** Fixed seed for the battle and opponent draw (`?seed=N`, dev and test builds only), or null for the clock. */
  readonly seed: number | null;
}

export const DEFAULT_UI_FLAGS: UiFlags = {
  debugOverlay: false,
  showFps: false,
  play: false,
  forceNoWebgl: false,
  arenaDemo: false,
  aiScripted: false,
  cinematicDemo: false,
  record: false,
  seed: null,
};

export interface FlagEnv {
  readonly DEV: boolean;
  readonly MODE: string;
}

export function parseUiFlags(search: string, env: FlagEnv): UiFlags {
  if (!(env.DEV || env.MODE === 'test')) return DEFAULT_UI_FLAGS;
  const raw = new URLSearchParams(search).get('ff') ?? '';
  const rawSeed = new URLSearchParams(search).get('seed');
  const seed = rawSeed !== null && /^\d{1,10}$/.test(rawSeed) ? Number(rawSeed) >>> 0 : null;
  const on = new Set(raw.split(',').map((s) => s.trim()));
  return {
    debugOverlay: on.has('debugOverlay'),
    showFps: on.has('showFps'),
    play: on.has('play'),
    forceNoWebgl: on.has('forceNoWebgl'),
    arenaDemo: on.has('arenaDemo'),
    aiScripted: on.has('aiScripted'),
    cinematicDemo: on.has('cinematicDemo'),
    record: on.has('record'),
    seed,
  };
}

export function getUiFlags(search: string): UiFlags {
  return parseUiFlags(search, import.meta.env);
}
