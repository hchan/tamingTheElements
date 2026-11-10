/** Minimal canvas surface needed to probe WebGL support (a fake in tests). */
export interface ProbeCanvas {
  getContext(contextId: string): unknown;
}

interface LoseContext {
  loseContext(): void;
}

/** Releases a probe context right away so it does not count against the browser's context limit. */
function release(gl: unknown): void {
  try {
    const ext = (gl as { getExtension?: (n: string) => unknown } | null)?.getExtension?.('WEBGL_lose_context');
    (ext as LoseContext | null | undefined)?.loseContext();
  } catch {
    // best effort
  }
}

/** True when the canvas yields a WebGL2 or WebGL context. Phaser 4 is WebGL-only, so there is no canvas fallback. */
export function hasWebgl(canvas: ProbeCanvas): boolean {
  try {
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    release(gl);
    return gl != null;
  } catch {
    return false;
  }
}

export function detectWebgl(forceNoWebgl: boolean, createCanvas: () => ProbeCanvas): boolean {
  return !forceNoWebgl && hasWebgl(createCanvas());
}
