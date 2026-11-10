export interface TestHook {
  readonly ready: boolean;
  readonly version: number;
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
