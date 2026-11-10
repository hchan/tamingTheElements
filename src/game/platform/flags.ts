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
  /** Failure injection for the e2e suite (`?ff=failLoad|failSetup|failGame|failSave`, dev and test builds only). */
  readonly failLoad: boolean;
  readonly failSetup: boolean;
  readonly failGame: boolean;
  readonly failSave: boolean;
  /** Turns tester mode on at load (`?cheats=1`, dev and test builds only; production uses the cheat code). */
  readonly cheats: boolean;
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
  failLoad: false,
  failSetup: false,
  failGame: false,
  failSave: false,
  cheats: false,
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
    failLoad: on.has('failLoad'),
    failSetup: on.has('failSetup'),
    failGame: on.has('failGame'),
    failSave: on.has('failSave'),
    cheats: new URLSearchParams(search).get('cheats') === '1',
    seed,
  };
}

export function getUiFlags(search: string): UiFlags {
  return parseUiFlags(search, import.meta.env);
}
