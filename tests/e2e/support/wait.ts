import type { Page } from '@playwright/test';

// Page-side code is passed as strings because tsconfig.node has no DOM lib.
/** Page-side expression: the arena scene is up and its views are ready. */
export const ARENA_READY = `window.__TTE__ && window.__TTE__.scene === 'Arena' && !!window.__TTE__.arena && window.__TTE__.arena.viewsReady()`;

/** Page-side snapshot of the test hook, as a JSON string (never throws page-side). */
const APP_SNAPSHOT = `(() => { try { const t = window.__TTE__; if (!t) return 'no __TTE__'; const s = typeof t.state === 'function' ? t.state() : {}; return JSON.stringify({ ready: t.ready, scene: t.scene, state: s }); } catch (e) { return 'snapshot failed: ' + String(e); } })()`;

/** Best-effort app state for failure messages: resolves to a string within `ms`, never rejects, never hangs. */
export async function appSnapshot(page: Page, ms = 2_000): Promise<string> {
  try {
    const guard = new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve('snapshot unavailable (page busy or closed)');
      }, ms).unref();
    });
    const snap = page.evaluate<string>(APP_SNAPSHOT).catch((e: unknown) => `snapshot unavailable (${String(e).slice(0, 80)})`);
    return await Promise.race([snap, guard]);
  } catch {
    return 'snapshot unavailable';
  }
}

export interface WaitOptions {
  /** Omit to keep the configured actionTimeout (30 s), exactly as a bare `page.waitForFunction`. */
  timeout?: number;
}

/**
 * `page.waitForFunction` with a self-explaining failure: names what was awaited, the predicate and the app state at the time.
 * Same predicate and timeout semantics as the bare call, so migrating a wait here never weakens it.
 */
export async function waitFor(page: Page, what: string, predicate: string, opts: WaitOptions = {}): Promise<void> {
  try {
    await page.waitForFunction(predicate, undefined, opts.timeout === undefined ? undefined : { timeout: opts.timeout });
  } catch (cause) {
    const reason = cause instanceof Error ? (cause.message.split('\n')[0] ?? '') : String(cause);
    const snap = await appSnapshot(page);
    const after = opts.timeout === undefined ? 'the action timeout' : `${String(opts.timeout)} ms`;
    throw new Error(`timed out after ${after} waiting for ${what}\n  predicate: ${predicate.slice(0, 160)}\n  app: ${snap}\n  cause: ${reason}`, {
      cause,
    });
  }
}

/** Waits for the paused arena (scene Arena, views ready). */
export async function waitForArena(page: Page, opts: WaitOptions = {}): Promise<void> {
  await waitFor(page, 'arena ready (scene Arena, views ready)', ARENA_READY, opts);
}
