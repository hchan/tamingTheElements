export interface ProbeCharacter {
  readonly id: number;
  readonly team: number;
  readonly x: number;
  readonly y: number;
}

/** Deterministic control of the running Arena for e2e: pauses the real-time driver, then steps by hand. */
export interface ArenaProbe {
  readonly tick: number;
  hash(): number;
  /** Active (alive, not benched) characters. */
  characters(): ProbeCharacter[];
  /** Pauses the real-time driver and runs n sim ticks with the given commands (default: no input). */
  step(n: number, cmds?: readonly [number, number]): void;
}

export interface TestHook {
  readonly ready: boolean;
  readonly version: number;
  /** Name of the active game scene, set by scenes in test builds. */
  scene?: string;
  arena?: ArenaProbe;
}

declare global {
  interface Window {
    __TTE__?: TestHook;
  }
}

/**
 * Exposes `window.__TTE__` for e2e tests. The guard is statically replaced by Vite, so production
 * builds drop the whole body (and the property name) as dead code. E2E builds use `--mode test`.
 */
export function installTestHook(version: number): void {
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    window.__TTE__ = { ready: true, version };
  }
}
