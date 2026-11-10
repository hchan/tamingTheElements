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
}

export const DEFAULT_UI_FLAGS: UiFlags = {
  debugOverlay: false,
  showFps: false,
  play: false,
  forceNoWebgl: false,
  arenaDemo: false,
};

export interface FlagEnv {
  readonly DEV: boolean;
  readonly MODE: string;
}

export function parseUiFlags(search: string, env: FlagEnv): UiFlags {
  if (!(env.DEV || env.MODE === 'test')) return DEFAULT_UI_FLAGS;
  const raw = new URLSearchParams(search).get('ff') ?? '';
  const on = new Set(raw.split(',').map((s) => s.trim()));
  return {
    debugOverlay: on.has('debugOverlay'),
    showFps: on.has('showFps'),
    play: on.has('play'),
    forceNoWebgl: on.has('forceNoWebgl'),
    arenaDemo: on.has('arenaDemo'),
  };
}

export function getUiFlags(search: string): UiFlags {
  return parseUiFlags(search, import.meta.env);
}
