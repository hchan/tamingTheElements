/** Minimal canvas surface needed to probe WebGL support (a fake in tests). */
export interface ProbeCanvas {
  getContext(contextId: string): unknown;
}

/** True when the canvas yields a WebGL2 or WebGL context. Phaser 4 is WebGL-only, so there is no canvas fallback. */
export function hasWebgl(canvas: ProbeCanvas): boolean {
  try {
    return canvas.getContext('webgl2') != null || canvas.getContext('webgl') != null;
  } catch {
    return false;
  }
}

export function detectWebgl(forceNoWebgl: boolean, createCanvas: () => ProbeCanvas): boolean {
  return !forceNoWebgl && hasWebgl(createCanvas());
}
