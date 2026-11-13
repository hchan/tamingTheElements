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
  /** The `arenaDemo` match runs the Arcade ruleset (dev and test builds; the menu entry is WP-arcade-entry). */
  readonly arcade: boolean;
  /** Online matches predict the missing remote input and roll back (`?ff=rollback`, dev and test builds; docs/NETCODE.md). */
  readonly rollback: boolean;
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
  /** The tour's versus splash waits for a key or click instead of its timer (`?ff=holdSplash`, dev and test builds; e2e pins the splash). */
  readonly holdSplash: boolean;
  /** Fixed seed for the battle and opponent draw (`?seed=N`, dev and test builds only), or null for the clock. */
  readonly seed: number | null;
}

export const DEFAULT_UI_FLAGS: UiFlags = {
  debugOverlay: false,
  showFps: false,
  play: false,
  forceNoWebgl: false,
  arenaDemo: false,
  arcade: false,
  rollback: false,
  cinematicDemo: false,
  record: false,
  failLoad: false,
  failSetup: false,
  failGame: false,
  failSave: false,
  cheats: false,
  holdSplash: false,
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
    arcade: on.has('arcade'),
    rollback: on.has('rollback'),
    cinematicDemo: on.has('cinematicDemo'),
    record: on.has('record'),
    failLoad: on.has('failLoad'),
    failSetup: on.has('failSetup'),
    failGame: on.has('failGame'),
    failSave: on.has('failSave'),
    holdSplash: on.has('holdSplash'),
    cheats: new URLSearchParams(search).get('cheats') === '1',
    seed,
  };
}

export function getUiFlags(search: string): UiFlags {
  // Same result as parseUiFlags in every build; the static build-mode test lets production bundles drop the parser (and
  // the env object it would be handed) from the menu entry chunk, where every byte counts.
  return import.meta.env.DEV || import.meta.env.MODE === 'test' ? parseUiFlags(search, import.meta.env) : DEFAULT_UI_FLAGS;
}
