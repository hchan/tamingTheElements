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
  actionSlots(): { x: number; y: number; size: number; cmd: number }[];
  /** Commands emitted by pointer presses on action slots, oldest first. */
  clicks(): number[];
  /** True when the player's action bar offers Capture (chapter 2 onward). */
  captureGranted(): boolean;
  /** True while the main camera shake effect is running (reduced motion keeps it false). */
  shaking(): boolean;
  /** Key codes bound per action in the running battle's keyboard agent. */
  boundCodes(): Record<string, readonly string[]>;
  /** Whether the battle's audio is muted (Ctrl-M toggles), and whether the first gesture has unlocked it. */
  audio(): { muted: boolean; unlocked: boolean } | undefined;
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
  }
}
