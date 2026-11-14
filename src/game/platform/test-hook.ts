import type { DesyncInfo, SessionStats, SessionStatus } from '@core/index';
import { installFpsOverlay, wantsFpsOverlay } from './fps-overlay';

export interface ProbeCharacter {
  readonly id: number;
  readonly team: number;
  readonly x: number;
  readonly y: number;
  /** Box width (a giant hero is wider than 80). */
  readonly w: number;
  readonly hp: number;
  readonly maxHp: number;
}

/** Read-only view of a running online match's lockstep session, for the two-context e2e proof (`__TTE__.net()`). */
export interface NetProbe {
  readonly side: 0 | 1;
  readonly status: SessionStatus;
  readonly simTick: number;
  /** First hash mismatch found, if any. */
  readonly desync: DesyncInfo | undefined;
  /** Winning team (0 or 1), -1 for a draw, null while undecided. */
  readonly winner: number | null;
  /** Every confirmed local checkpoint `[tick, hash]` (the hashes sent for desync checks). */
  readonly checkpoints: readonly (readonly [number, number])[];
  readonly stats: SessionStats;
}

/** Deterministic control of the running Arena for e2e: pauses the real-time driver, then steps by hand. */
export interface ArenaProbe {
  readonly tick: number;
  readonly paused: boolean;
  hash(): number;
  /** The online session's state, or undefined outside an online match. */
  net(): NetProbe | undefined;
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
  /** Action bar slot rects in logical screen px (1280x720) as drawn through the live camera; fixed in Arcade whatever the pan. */
  actionBarScreen(): { x: number; y: number; size: number }[];
  /** Player 2's mirrored readout slots (local two-player only; empty otherwise), same units as `actionBarScreen`. */
  actionBar2Screen(): { x: number; y: number; size: number }[];
  actionSlots(): { x: number; y: number; size: number; cmd: number; kind: string; label: string; disabled: boolean; highlight: boolean }[];
  /** Commands emitted by pointer presses on action slots, oldest first. */
  clicks(): number[];
  /** True when the player's action bar offers Capture (chapter 2 onward, or tester mode "all abilities"). */
  captureGranted(): boolean;
  /** The player team's roster with current/max/rest-cap health (tester bench HUD data), entity id order. */
  bench(): { id: number; name: string; active: boolean; dead: boolean; hp: number; maxHp: number; restCap: number }[];
  /** First tick the player's swap is usable again (0 = ready). */
  swapReadyTick(): number;
  /** Arcade: the refused-swap line while it shows ('' otherwise). */
  swapNotice(): string;
  /** Runs a tester cheat (only while tester mode is on). */
  cheat(c: 'myHp25' | 'enemyHp25' | 'win' | 'freezeEnemy' | 'captureWin'): void;
  /** True while the main camera shake effect is running (reduced motion keeps it false). */
  shaking(): boolean;
  /**
   * Hit feedback as drawn: per active character its tint and Phaser tint mode (2 = additive: the hit-flash wash); live
   * damage-number labels, the combo hits and the hyper meter shown per team (Arcade only; empty and [0, 0] in Classic).
   */
  /** Let view effects (hit flash) age in real time while the sim stays paused. */
  ageFx(on: boolean): void;
  fx(): { tints: { id: number; tint: number; mode: number }[]; numbers: string[]; combo: [number, number]; meter: [number, number] };
  /**
   * The super cinematic frame while one runs (Arcade; async, as its code loads on the first super): dim alpha, band alpha, slide (0 in place), punch-in zoom, the
   * texts shown and the camera zoom over the fit zoom; undefined otherwise (always in Classic).
   */
  /** Arcade pan camera (WP 38b): framing centre x and zoom, the camera's real zoom over the fit zoom and the world x of the view's left edge (logical units; Phaser's raw scrollX also depends on the render resolution, so it is not used). */
  camera(): Promise<{ centerX: number; zoom: number; camZoom: number; scrollX: number }>;
  /** The KO wash and hit rings (renderer-only): wash desaturation 0..0.7, ring count; undefined before the first one. */
  shockFx(): Promise<{ washAge: number; wash: number; rings: number; superNumbers: number; superNumberSize: number } | undefined>;
  /** Jumps a running wash and its rings to `ms` in and draws that frame, so a screenshot can catch the peak with the sim paused. */
  shockSeek(ms: number): Promise<void>;
  superFx(): Promise<{ dim: number; bandAlpha: number; slide: number; zoom: number; name: string; sub: string; camZoom: number } | undefined>;
  /** The per-element super burst drawn on the last frame (ability-graphics-audit-defects), or undefined. */
  superBurst(): Promise<{ element: string; shape: string; age: number; paths: number } | undefined>;
  /**
   * Arcade only (async: its code is a lazy chunk): the round HUD as drawn, i.e. the banner texts, whether the banner is
   * up and its scale, the timer text and the round wins shown per team; undefined before it is built and in Classic.
   */
  rounds(): Promise<{ main: string; sub: string; visible: boolean; scale: number; timer: string; won: readonly [number, number] } | undefined>;
  /**
   * Arcade only (async: a lazy chunk): the defence view's last frame (WP-arcade-defence-view): visible afterimages, trail
   * dots, guard shields, guard bars (their meters), the projectiles of the last tick, live sparks and rings, the words
   * popped and the fighters drawn with a Snag rope (FUN-DESIGN 2.20); undefined in Classic.
   */
  defence(): Promise<{
    ghosts: number; trails: number; shields: number; bars: readonly number[]; projectiles: number; sparks: number; rings: number; pops: readonly string[];
    roots: number;
  } | undefined>;
  /** The stage's ambient particles (view only): emitters running and live particles; 0 under reduced motion. */
  stageAmbient(): { emitters: number; particles: number };
  /**
   * Arcade only (async: a lazy chunk): the weather view's last frame (WP-arcade-weather-view): the weather drawn (0 none),
   * its HUD badge text and time-bar fill (px), the sky tint alpha, the particles drawn, and the called line ('' when
   * none) with its scale; undefined in Classic.
   */
  weather(): Promise<{ kind: number; label: string; fill: number; tint: number; particles: number; call: string; callScale: number } | undefined>;
  /** True once the lazy Arcade views (round, weather, tag, defence) are mounted and the Hud runs; events before it are not drawn. */
  viewsReady(): boolean;
  /**
   * Arcade 2v2 and 3v3 only (async: a lazy chunk): the tag view's last frame (WP-arcade-tag-view): per team its active
   * line, a line per bench hero and the tag word, the "TAG!" call ('' when none) and its scale, live entrance flashes (and
   * whether one is a KO entrance), and the swap-slot caption; undefined in Classic and 1v1.
   */
  tag(): Promise<{
    lines: readonly (readonly string[])[]; call: string; callScale: number; flashes: number; ko: boolean; caption: string;
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
  /** Arcade only (async: a lazy chunk): the trap markers drawn on the last frame (WP 39b), or undefined before the view mounts. */
  traps(): Promise<readonly { kind: number; x: number; y: number; team: number; label: string; alpha: number }[] | undefined>;
  /** The words beside each side's main HUD bar (name, element, health words, `Life hp/max`). */
  heroLabels(): string[];
  /** The buff auras and heal pops drawn on the last frame (ability-graphics-audit-defects). */
  abilityFx(): Promise<{ auras: readonly { id: number; kind: string; shape: string }[]; pops: readonly { id: number; word: string }[]; lashes: readonly { team: number; age: number }[] } | undefined>;
  /** Dev/test only: gives an entity a timed status (a StatusId) for `ticks` sim ticks. */
  grantStatus(id: number, status: number, ticks: number): void;
  /** Hero status effects drawn on the last frame (buff-debuff-animation). */
  statusFx(): Promise<{ loops: readonly { id: number; status: number }[]; bursts: readonly { id: number; status: number; age: number }[]; fades: readonly { id: number; status: number; age: number }[] } | undefined>;
  cleanse(): Promise<{ active: readonly { id: number; element: string; age: number }[]; parts: number; reduced: boolean; started: number } | undefined>;
  /** The melee danger-zone outlines drawn on the last frame (ability-telegraphs). */
  dangerZones(): Promise<readonly { id: number; x: number; y: number; w: number; h: number; alpha: number }[] | undefined>;
  /** Own-element patch effects drawn on the last frame (own-element-tile-effects WP 1); undefined outside Arcade. */
  ownElement(): Promise<{ active: readonly { id: number; team: number; kind: number; age: number; pulse: boolean }[]; parts: number; reduced: boolean } | undefined>;
  /** Arcade Versus only: the 8-way aim arrow as drawn (logical px, Phaser angle in degrees), or undefined. */
  aim(): { visible: boolean; x: number; y: number; angle: number } | undefined;
  /** Arcade only: sets a team's hyper meter (0..3000), so a test can start a super at once. */
  setMeter(team: number, value: number): void;
  /**
   * Arcade only: puts weather `kind` (1 Sun .. 5 Eclipse) up for WEATHER_TICKS as if `team` had cast it, and hands the
   * views its `weatherChanged` event; for weathers no Arcade race can cast (Eclipse: no void race is offered).
   */
  setWeather(kind: number, team: number): void;
  /** Arcade only: sets both teams' round wins, so one double KO (both at 0 hp) makes the 2-2 draw that starts sudden death. */
  setRoundsWon(won0: number, won1: number): void;
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
  /**
   * The pose layer's sprite sheets (async: a lazy chunk; WP-sheet-view): the sprites whose atlas is loaded and, per drawn
   * character, the texture key, frame name, mirror, rotation, whether the grim grade is drawn and the body's display height
   * (the frame's visual box for portrait rigs); undefined before the layer is mounted.
   */
  sheets(): Promise<{
    loaded: string[];
    characters: { id: number; texture: string; frame: string; flipX: boolean; rotation: number; graded: boolean; bodyHeight: number }[];
  } | undefined>;
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
  /** Every `playSfx` request as `kind:element`, in order (test builds only; asserts wiring without an audio device). */
  sfxLog?: string[];
  cinematic?: CinematicProbe;
  state(): HookState;
  /** Hash of the running arena's sim state, or 0 outside a battle. */
  hash(): number;
  /** The running online match's lockstep session (side, status, tick, desync, checkpoints, stats), or undefined when there is none. */
  net(): NetProbe | undefined;
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
      sfxLog: [],
      state: () => ({
        route: window.location.hash,
        mountedRoute: document.getElementById('menu')?.dataset.mountedRoute ?? '',
        scene: hook.scene,
        tick: hook.arena?.tick ?? -1,
        paused: hook.arena?.paused ?? false,
      }),
      hash: () => hook.arena?.hash() ?? 0,
      net: () => hook.arena?.net(),
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
