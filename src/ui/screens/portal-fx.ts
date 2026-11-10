/** ChaoticFire: fiery canvas effect shown while hovering the portal (final boss entry) button. Cosmetic only. */
import { getPrefs } from '../../game/platform/a11y/prefs';

export interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

export interface FxCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): FxContext | null;
}

export interface FxContext {
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  fill(): void;
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
}

export interface FxTarget {
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
}

export interface PortalFxOptions {
  canvas: FxCanvas;
  /** Element whose hover/focus drives the effect (the portal button). */
  target: FxTarget;
  /** Cosmetic randomness; the UI layer may use Math.random. */
  rng?: () => number;
  reducedMotion?: () => boolean;
  requestFrame?: (cb: () => void) => number;
  cancelFrame?: (id: number) => void;
  maxEmbers?: number;
}

export interface PortalFx {
  readonly running: boolean;
  readonly emberCount: number;
  dispose(): void;
}

const START_EVENTS = ['mouseenter', 'focus'] as const;
const STOP_EVENTS = ['mouseleave', 'blur'] as const;
const TWO_PI = 6.283185307179586;

/** Effective reduce-motion: the Settings choice if saved, else the OS `prefers-reduced-motion`. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && getPrefs().reduceMotion;
}

/** Advance embers one frame: drift with jitter, rise, age. Returns the surviving embers (mutated in place). */
export function stepEmbers(embers: Ember[], rng: () => number): Ember[] {
  let w = 0;
  for (const e of embers) {
    e.x += e.vx + (rng() - 0.5) * 1.5;
    e.y += e.vy;
    e.life += 1;
    if (e.life < e.maxLife) embers[w++] = e;
  }
  embers.length = w;
  return embers;
}

export function spawnEmber(width: number, height: number, rng: () => number): Ember {
  return {
    x: rng() * width,
    y: height,
    vx: (rng() - 0.5) * 1.2,
    vy: -(0.8 + rng() * 2),
    life: 0,
    maxLife: 20 + Math.floor(rng() * 30),
    size: 2 + rng() * 4,
  };
}

export function createPortalFx(opts: PortalFxOptions): PortalFx {
  const { canvas, target } = opts;
  const rng = opts.rng ?? Math.random;
  const reduced = opts.reducedMotion ?? prefersReducedMotion;
  const request = opts.requestFrame ?? ((cb: () => void) => window.requestAnimationFrame(cb));
  const cancel =
    opts.cancelFrame ??
    ((id: number) => {
      window.cancelAnimationFrame(id);
    });
  const maxEmbers = opts.maxEmbers ?? 60;
  const ctx = canvas.getContext('2d');
  const embers: Ember[] = [];
  let frame: number | null = null;
  let active = false;
  let disposed = false;

  const draw = (): void => {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const e of embers) {
      const t = e.life / e.maxLife;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = t < 0.4 ? '#ffd24a' : t < 0.7 ? '#ff7a18' : '#c0200a';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size * (1 - t * 0.5), 0, TWO_PI);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  const tick = (): void => {
    frame = null;
    if (!active || disposed) return;
    if (embers.length < maxEmbers) embers.push(spawnEmber(canvas.width, canvas.height, rng));
    stepEmbers(embers, rng);
    draw();
    frame = request(tick);
  };

  const stopLoop = (): void => {
    if (frame !== null) cancel(frame);
    frame = null;
  };

  const start = (): void => {
    if (disposed || active) return;
    active = true;
    if (reduced()) {
      // Reduced motion: one static glow frame, no animation loop.
      for (let i = 0; i < 12; i++) {
        const e = spawnEmber(canvas.width, canvas.height, rng);
        e.y = canvas.height * (0.4 + rng() * 0.6);
        e.life = Math.floor(e.maxLife / 3);
        embers.push(e);
      }
      draw();
      return;
    }
    frame = request(tick);
  };

  const stop = (): void => {
    active = false;
    stopLoop();
    embers.length = 0;
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  };

  for (const t of START_EVENTS) target.addEventListener(t, start);
  for (const t of STOP_EVENTS) target.addEventListener(t, stop);

  return {
    get running() {
      return frame !== null;
    },
    get emberCount() {
      return embers.length;
    },
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      for (const t of START_EVENTS) target.removeEventListener(t, start);
      for (const t of STOP_EVENTS) target.removeEventListener(t, stop);
    },
  };
}
