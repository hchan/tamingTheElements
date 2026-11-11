import { installFpsOverlay, wantsFpsOverlay } from './fps-overlay';

export interface ProbeCharacter {
  readonly id: number;
  readonly team: number;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly maxHp: number;
}

/** Deterministic control of the running Arena for e2e: pauses the real-time driver, then steps by hand. */
export interface ArenaProbe {
  readonly tick: number;
  readonly paused: boolean;
  hash(): number;
  /** Active (alive, not benched) characters. */
  characters(): ProbeCharacter[];
  /** Pauses the real-time driver and runs n sim ticks with the given commands (default: no input). */
  step(n: number, cmds?: readonly [number, number]): void;
  /** Pauses the real-time driver and runs n ticks with the agents (the real keyboard) deciding the commands. */
  stepLive(n: number): void;
  /** Sets a character's current health (e.g. 0 to win, or <=25% to make it capturable). */
  setHp(id: number, hp: number): void;
  /** Moves a character and sets its facing (0..7 clockwise from east), keeping the previous position in sync. */
  place(id: number, x: number, y: number, dir: number): void;
  /** Action bar slots in logical 1280x720 coordinates. */
  actionSlots(): { x: number; y: number; size: number; cmd: number; kind: string; label: string; disabled: boolean; highlight: boolean }[];
  /** Commands emitted by pointer presses on action slots, oldest first. */
  clicks(): number[];
  /** True when the player's action bar offers Capture (chapter 2 onward, or tester mode "all abilities"). */
  captureGranted(): boolean;
  /** The player team's roster with current/max/rest-cap health (tester bench HUD data), entity id order. */
  bench(): { id: number; name: string; active: boolean; dead: boolean; hp: number; maxHp: number; restCap: number }[];
  /** First tick the player's swap is usable again (0 = ready). */
  swapReadyTick(): number;
  /** Runs a tester cheat (only while tester mode is on). */
  cheat(c: 'myHp25' | 'enemyHp25' | 'win' | 'freezeEnemy' | 'captureWin'): void;
  /** True while the main camera shake effect is running (reduced motion keeps it false). */
  shaking(): boolean;
  /**
   * Hit feedback as drawn: per active character its tint and Phaser tint mode (1 = fill: the white hit flash); live
   * damage-number labels, the combo hits and the hyper meter shown per team (Arcade only; empty and [0, 0] in Classic).
   */
  /** Let view effects (hit flash) age in real time while the sim stays paused. */
  ageFx(on: boolean): void;
  fx(): { tints: { id: number; tint: number; mode: number }[]; numbers: string[]; combo: [number, number]; meter: [number, number] };
  /**
   * The super cinematic frame while one runs (Arcade; async, as its code loads on the first super): dim alpha, band alpha, slide (0 in place), punch-in zoom, the
   * texts shown and the camera zoom over the fit zoom; undefined otherwise (always in Classic).
   */
  superFx(): Promise<{ dim: number; bandAlpha: number; slide: number; zoom: number; name: string; sub: string; camZoom: number } | undefined>;
  /**
   * Arcade only (async: its code is a lazy chunk): the round HUD as drawn, i.e. the banner texts, whether the banner is
   * up and its scale, the timer text and the round wins shown per team; undefined before it is built and in Classic.
   */
  rounds(): Promise<{ main: string; sub: string; visible: boolean; scale: number; timer: string; won: readonly [number, number] } | undefined>;
  /**
   * Arcade only (async: a lazy chunk): the defence view's last frame (WP-arcade-defence-view): visible afterimages, trail
   * dots, guard shields, guard bars (their meters), the projectiles of the last tick, live sparks and rings, and the words
   * popped; undefined in Classic.
   */
  defence(): Promise<{
    ghosts: number; trails: number; shields: number; bars: readonly number[]; projectiles: number; sparks: number; rings: number; pops: readonly string[];
  } | undefined>;
  /**
   * Arcade only (async: a lazy chunk): the weather view's last frame (WP-arcade-weather-view): the weather drawn (0 none),
   * its HUD badge text and time-bar fill (px), the sky tint alpha, the particles drawn, and the called line ('' when
   * none) with its scale; undefined in Classic.
   */
  weather(): Promise<{ kind: number; label: string; fill: number; tint: number; particles: number; call: string; callScale: number } | undefined>;
  /** True once the lazy Arcade views (round, weather, tag, defence) are mounted and the Hud runs; events before it are not drawn. */
  viewsReady(): boolean;
  /**
   * Arcade 2v2 only (async: a lazy chunk): the tag view's last frame (WP-arcade-tag-view): per team its active, bench and
   * tag lines, the "TAG!" call ('' when none) and its scale, live entrance flashes (and whether one is a KO entrance),
   * and the swap-slot caption; undefined in Classic and 1v1.
   */
  tag(): Promise<{
    lines: readonly (readonly [string, string, string])[]; call: string; callScale: number; flashes: number; ko: boolean; caption: string;
  } | undefined>;
  /**
   * Arcade only (async: a lazy chunk): the terrain view's last frame (WP-arcade-terrain-view): the stage drawn (1 fire ..
   * 4 air, 0 none), the patches drawn and their flat rectangles (x, y, w, h), each patch's word, the patch and glow alpha,
   * the particles and sparks drawn, the backdrop element, the next backdrop's alpha during a swap and the buff badge text.
   */
  terrain(): Promise<{
    stage: number; patches: number; rects: readonly number[]; labels: readonly string[]; alpha: number; glow: number;
    particles: number; sparks: number; backdrop: string; nextBackdrop: number; badge: string;
  } | undefined>;
  /** Arcade Versus only: the 8-way aim arrow as drawn (logical px, Phaser angle in degrees), or undefined. */
  aim(): { visible: boolean; x: number; y: number; angle: number } | undefined;
  /** Arcade only: sets a team's hyper meter (0..3000), so a test can start a super at once. */
  setMeter(team: number, value: number): void;
  /**
   * Arcade only: puts weather `kind` (1 Sun .. 5 Eclipse) up for WEATHER_TICKS as if `team` had cast it, and hands the
   * views its `weatherChanged` event; for weathers no Arcade race can cast (Eclipse: no void race is offered).
   */
  setWeather(kind: number, team: number): void;
  /** Arcade only: sets a team's weather charge (0..1000 per mille), so a test can cast at once (WP-arcade-weather-charge). */
  setWeatherCharge(team: number, value: number): void;
  /** Key codes bound per action in the running battle's keyboard agent. */
  boundCodes(): Record<string, readonly string[]>;
  /** Whether the battle's audio is muted (Ctrl-M toggles), and whether the first gesture has unlocked it. */
  audio(): { muted: boolean; unlocked: boolean } | undefined;
  /**
   * The Arcade audio layers (async: a lazy chunk; WP-arcade-audio-layers): whether they are on this battle's audio, the
   * cues played, the voices sounding, the synth nodes still connected over every battle (0 after teardown) and whether
   * the KO music cut is on. `mounted` is false in Classic.
   */
  arcadeAudio(): Promise<{ mounted: boolean; played: number; voices: number; nodes: number; musicCut: boolean }>;
}

/** Test control of the running Cinematic scene. */
export interface CinematicProbe {
  readonly finished: boolean;
  /** Presses the Skip button. */
  skip(): void;
  /** Destroys the whole Phaser game (like exit-to-menu); `settled()` resolves after Phaser's destroy event. */
  destroyGame(): void;
}

export interface HookState {
  readonly route: string;
  /** The hash whose screen has finished mounting ('' while a switch is in progress); `route` flips earlier, on hashchange. */
  readonly mountedRoute: string;
  readonly scene: string | undefined;
  readonly tick: number;
  readonly paused: boolean;
}

export interface TestHook {
  readonly ready: boolean;
  readonly version: number;
  /** Name of the active game scene, set by scenes in test builds. */
  scene?: string;
  arena?: ArenaProbe;
  cinematic?: CinematicProbe;
  state(): HookState;
  /** Hash of the running arena's sim state, or 0 outside a battle. */
  hash(): number;
  /** Pauses the driver and steps the running arena n ticks (manual stepping mode). */
  step(n: number): void;
  /** Imports a save (JSON text) into the save store and refreshes the current screen. */
  loadSave(json: string): Promise<boolean>;
  /** Number of window/document listeners currently held by a battle (0 after exit-to-menu). */
  listeners(): number;
  /** Resolves once any in-flight game teardown has completed. */
  settled(): Promise<void>;
}

declare global {
  interface Window {
    __TTE__?: TestHook;
  }
}

/** Live count of listeners added through `counted`, exposed by the test hook to catch leaks. */
export const listenerCount = { n: 0 };

/** Resolves when the most recent game teardown (Phaser destroys asynchronously) has finished. */
export const teardown: { settled: Promise<void> } = { settled: Promise.resolve() };

type Add = EventTarget['addEventListener'];
type Remove = EventTarget['removeEventListener'];

/** Wraps an event target so every add/remove is tallied in `listenerCount`. */
export function counted<T extends Pick<EventTarget, 'addEventListener' | 'removeEventListener'>>(target: T): T {
  const add: Add = (type, listener, options) => {
    target.addEventListener(type, listener, options);
    listenerCount.n++;
  };
  const remove: Remove = (type, listener, options) => {
    target.removeEventListener(type, listener, options);
    listenerCount.n--;
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop === 'addEventListener') return add;
      if (prop === 'removeEventListener') return remove;
      const v = Reflect.get(t, prop, t) as unknown;
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
  });
}

/**
 * Exposes `window.__TTE__` for e2e tests. The guard is statically replaced by Vite, so production
 * builds drop the whole body (and the property name) as dead code. E2E builds use `--mode test`.
 */
export function installTestHook(version: number, loadSave: (json: string) => Promise<boolean>): void {
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    const hook: TestHook = {
      ready: true,
      version,
      state: () => ({
        route: window.location.hash,
        mountedRoute: document.getElementById('menu')?.dataset.mountedRoute ?? '',
        scene: hook.scene,
        tick: hook.arena?.tick ?? -1,
        paused: hook.arena?.paused ?? false,
      }),
      hash: () => hook.arena?.hash() ?? 0,
      step: (n) => {
        hook.arena?.step(n);
      },
      loadSave,
      listeners: () => listenerCount.n,
      settled: () => teardown.settled,
    };
    window.__TTE__ = hook;
    if (wantsFpsOverlay(window.location.search)) installFpsOverlay();
  }
}
