import type Phaser from 'phaser';
import { SimEventKind, type Element, type SimEvent } from '@core/index';
import { ELEMENT_COLORS } from './element-colors';
import { shakeFor } from './motion';

/**
 * Cosmetic effects driven by sim events. View-only: nothing here touches sim state or the sim RNG
 * streams; particle jitter comes from a private cosmetic stream (`CosmeticRng`).
 */

/** Stable id of a sim event: (tick, sourceId, kind, seq). */
export function eventKey(e: SimEvent): string {
  return `${String(e.tick)}:${String(e.sourceId)}:${String(e.kind)}:${String(e.seq)}`;
}

/** Bounded set of seen event ids (oldest evicted first), so replayed or re-delivered events fire once. */
export class EventDeduper {
  private readonly seen = new Set<string>();

  constructor(private readonly capacity = 512) {}

  /** True the first time an event id is offered, false for repeats still inside the window. */
  firstSeen(e: SimEvent): boolean {
    const key = eventKey(e);
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    if (this.seen.size > this.capacity) {
      const oldest = this.seen.values().next();
      if (!oldest.done) this.seen.delete(oldest.value);
    }
    return true;
  }

  get size(): number {
    return this.seen.size;
  }

  clear(): void {
    this.seen.clear();
  }
}

/** Cosmetic-only xorshift32 stream, independent of the sim streams. */
export class CosmeticRng {
  private state: number;

  constructor(seed = 0x9e3779b9) {
    this.state = seed | 0 || 1;
  }

  /** Float in [0, 1). */
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x | 0;
    return (x >>> 0) / 4294967296;
  }
}

/** Where effects land; the Phaser implementation is `createPhaserFxSink`. */
export interface FxSink {
  /** White fill for 2 render frames, then `tint` for 4 (CharacterView owns the tint). */
  flash(target: number, tint: number): void;
  /** `count` particles flying out; `offsets[2i], offsets[2i + 1]` are unit-ish directions (reused buffer). */
  burst(target: number, offsets: Float32Array, count: number, color: number): void;
  /** One static spark for 100 ms: the reduced-motion stand-in for `burst`. */
  spark(target: number, color: number): void;
  shake(durationMs: number, intensity: number): void;
  /** Hit-stop jitter on `target` while the view tick is below `untilTick` (the freeze deadline, W.tick units). */
  jitter(target: number, untilTick: number): void;
  /** Floating damage number over `target`. */
  number(target: number, amount: number, scaled: boolean, counter: boolean): void;
  /**
   * The super cinematic for `caster` (Arcade): from view tick `fromTick` until `untilTick`, the freeze deadline in W.tick
   * units; `reduced` drops its motion (no slide, no punch-in) and keeps the dim, band and name.
   */
  superCut(caster: number, fromTick: number, untilTick: number, reduced: boolean, superId?: number): void;
}

/** Classic hits: six particles, an 80 ms shake and a red-ish tint after the white flash. */
export const HIT_PARTICLES = 6;
export const CLASSIC_HIT_TINT = 0xff3a3a;
/** Arcade sparks by hit strength (light, medium, heavy, super); FUN-DESIGN section 3. */
export const SPARKS_BY_STRENGTH = [6, 10, 16, 24] as const;
/** Arcade shake by hit strength: light none, then medium, heavy, super; KO has its own. */
export const SHAKE_BY_STRENGTH: readonly ([number, number] | null)[] = [null, [60, 0.002], [100, 0.004], [250, 0.008]];
export const KO_SHAKE: readonly [number, number] = [300, 0.01];
/** `hitStop.cause` of the super freeze and of the KO stop (src/core/data/arcade.ts HitStopCause). */
const SUPER_CAUSE = 2;
const KO_CAUSE = 3;
const MAX_SPARKS = SPARKS_BY_STRENGTH[3];

export { ELEMENT_COLORS };

export interface FxOptions {
  readonly reducedMotion: () => boolean;
  /** Arcade match: `hitConfirmed` drives the hit feedback (its paired `damage` is skipped). */
  readonly arcade?: boolean;
  /** Element of a character (for the hit colour), or undefined when it has no view. */
  readonly elementOf?: (id: number) => Element | undefined;
  readonly rng?: CosmeticRng;
  readonly deduper?: EventDeduper;
}

/**
 * Turns sim events into effects once each. Reduced motion keeps the flash and the damage number but drops shake,
 * jitter and flying particles (one static spark instead in Arcade).
 */
export class EventFx {
  private readonly rng: CosmeticRng;
  private readonly deduper: EventDeduper;
  private readonly offsets = new Float32Array(MAX_SPARKS * 2);
  /** Last `hitConfirmed` (tick, source, victim, strength), to pair it with the `hitStop` that follows it. */
  private hitTick = -1;
  private hitSource = -1;
  /** The `superId` of the latest `superStarted` (it precedes its freeze's `hitStop` in the same step). */
  private superId = 0;
  private hitTarget = -1;
  private hitStrength = 0;

  constructor(
    private readonly sink: FxSink,
    private readonly opts: FxOptions,
  ) {
    this.rng = opts.rng ?? new CosmeticRng();
    this.deduper = opts.deduper ?? new EventDeduper();
  }

  consume(events: readonly SimEvent[]): void {
    for (const e of events) {
      const k = e.kind;
      if (k === SimEventKind.superStarted) this.superId = e['superId'] ?? 0;
      if (k === SimEventKind.damage ? this.opts.arcade === true : k !== SimEventKind.hitConfirmed && k !== SimEventKind.hitStop) continue;
      if (!this.deduper.firstSeen(e)) continue;
      if (k === SimEventKind.damage) this.classicHit(e['target'] ?? -1);
      else if (k === SimEventKind.hitConfirmed) this.arcadeHit(e);
      else this.hitStop(e);
    }
  }

  private fill(count: number): Float32Array {
    for (let i = 0; i < count * 2; i++) this.offsets[i] = this.rng.next() * 2 - 1;
    return this.offsets;
  }

  private classicHit(target: number): void {
    this.sink.flash(target, CLASSIC_HIT_TINT);
    if (this.opts.reducedMotion()) return;
    this.sink.burst(target, this.fill(HIT_PARTICLES), HIT_PARTICLES, 0xffddaa);
    this.sink.shake(80, 0.002);
  }

  private arcadeHit(e: SimEvent): void {
    const target = e['target'] ?? -1;
    const strength = Math.min(3, Math.max(0, e['strength'] ?? 0));
    const color = ELEMENT_COLORS[this.opts.elementOf?.(e['attacker'] ?? -1) ?? 'void'];
    this.hitTick = e.tick;
    this.hitSource = e.sourceId;
    this.hitTarget = target;
    this.hitStrength = strength;
    this.sink.flash(target, color);
    this.sink.number(target, e['amount'] ?? 0, (e['scalePm'] ?? 1000) < 1000, e['counter'] === 1);
    if (this.opts.reducedMotion()) {
      this.sink.spark(target, color);
      return;
    }
    const n = SPARKS_BY_STRENGTH[strength] ?? HIT_PARTICLES;
    this.sink.burst(target, this.fill(n), n, color);
  }

  /**
   * The stop that follows a hit: victim jitter for the freeze, and the shake by strength (or the KO shake). The super
   * freeze (emitted right after `superStarted`, with the caster as its source) is the super cinematic instead; it does
   * not shake (only a hit's own stop does, so no stale strength from an earlier hit).
   */
  private hitStop(e: SimEvent): void {
    const reduced = this.opts.reducedMotion();
    const until = e.tick + 1 + (e['ticks'] ?? 0);
    const cause = e['cause'];
    if (cause === SUPER_CAUSE) {
      this.sink.superCut(e.sourceId, e.tick, until, reduced, this.superId);
      return;
    }
    const paired = e.tick === this.hitTick && e.sourceId === this.hitSource;
    if (!reduced && paired) this.sink.jitter(this.hitTarget, until);
    const s = cause === KO_CAUSE ? KO_SHAKE : paired ? SHAKE_BY_STRENGTH[this.hitStrength] : null;
    const shake = s ? shakeFor(s[0], s[1], reduced) : null;
    if (shake) this.sink.shake(shake.durationMs, shake.intensity);
  }
}

const BURST_DISTANCE = 24;
const BURST_MS = 250;
/** Particles start a quarter of the way out, so a burst reads as a ring even on its first (or a paused) frame. */
const BURST_START = 0.25;
const SPARK_MS = 100;
/** Pool size of spark dots: at most this many in flight; extra particles are dropped. */
export const SPARK_POOL = 64;

/** What the Phaser sink needs from the arena's character views (the image and element feed the super cut-in). */
export interface FxTarget {
  readonly image: Phaser.GameObjects.Image;
  readonly element: Element;
  flash(tint: number): void;
  jitter(untilTick: number): void;
}

/** A character's box centre and height in logical px. */
export interface FxPoint {
  readonly x: number;
  readonly y: number;
  readonly h: number;
}

/**
 * Phaser-backed sink. `viewOf` resolves an entity id to its character view and `at` to its current sim position (not
 * the last drawn one, which lags a placement or a step made between two renders); `numberAt` receives floating damage
 * numbers (the Arcade HUD model) in logical coordinates; `paused` holds particles while the sim is paused; `viewTick` is the
 * view tick (the super cinematic runs on it). The super cinematic code is loaded on the first super (Arcade only).
 */
export function createPhaserFxSink(
  scene: Phaser.Scene,
  viewOf: (id: number) => FxTarget | undefined,
  at: (id: number) => FxPoint | undefined,
  paused: () => boolean,
  viewTick: () => number,
  numberAt?: (x: number, y: number, amount: number, scaled: boolean, counter: boolean) => void,
): FxSink {
  // Pooled dots (at most SPARK_POOL): dots[0..live) are in flight, advanced by one scene update listener that only
  // exists while dots are in flight. Finished dots are swapped behind `live`, so nothing allocates after warm-up.
  interface Dot {
    circle: Phaser.GameObjects.Arc;
    x0: number;
    y0: number;
    dx: number;
    dy: number;
    age: number;
    life: number;
  }
  const dots: Dot[] = [];
  let live = 0;
  let attached = false;
  const detach = (): void => {
    if (!attached) return;
    attached = false;
    scene.events.off('update', tick);
    scene.events.off('shutdown', drop);
    scene.events.off('destroy', drop);
  };
  /** Scene is going away: Phaser destroys the circles with it, so just forget them. */
  const drop = (): void => {
    dots.length = 0;
    live = 0;
    detach();
  };
  function tick(_time: number, delta: number): void {
    if (paused()) return;
    for (let i = live - 1; i >= 0; i--) {
      const d = dots[i];
      if (!d) continue;
      d.age += delta;
      const t = d.age / d.life;
      if (t >= 1) {
        d.circle.setVisible(false);
        live--;
        dots[i] = dots[live] ?? d;
        dots[live] = d;
        continue;
      }
      const k = BURST_START + (1 - BURST_START) * t;
      d.circle.setPosition(d.x0 + d.dx * k, d.y0 + d.dy * k).setAlpha(1 - t);
    }
    if (live === 0) detach();
  }
  const attach = (): void => {
    if (attached) return;
    attached = true;
    scene.events.on('update', tick);
    scene.events.once('shutdown', drop);
    scene.events.once('destroy', drop);
  };
  const centre = at;
  const spawn = (x: number, y: number, dx: number, dy: number, color: number, radius: number, life: number): void => {
    if (live >= SPARK_POOL) return;
    let d = dots[live];
    if (!d) {
      d = { circle: scene.add.circle(0, 0, radius, color).setDepth(10), x0: 0, y0: 0, dx: 0, dy: 0, age: 0, life };
      dots.push(d);
    }
    d.circle.setRadius(radius).setFillStyle(color).setPosition(x + dx * BURST_START, y + dy * BURST_START).setAlpha(1).setVisible(true);
    d.x0 = x;
    d.y0 = y;
    d.dx = dx;
    d.dy = dy;
    d.age = 0;
    d.life = life;
    live++;
    attach();
  };
  return {
    flash(target, tint): void {
      viewOf(target)?.flash(tint);
    },
    burst(target, offsets, count, color): void {
      const p = centre(target);
      if (!p) return;
      for (let i = 0; i < count; i++) {
        spawn(p.x, p.y, (offsets[2 * i] ?? 0) * BURST_DISTANCE, (offsets[2 * i + 1] ?? 0) * BURST_DISTANCE, color, 4, BURST_MS);
      }
    },
    spark(target, color): void {
      const p = centre(target);
      if (p) spawn(p.x, p.y, 0, 0, color, 8, SPARK_MS);
    },
    shake(durationMs, intensity): void {
      scene.cameras.main.shake(durationMs, intensity);
    },
    jitter(target, untilTick): void {
      viewOf(target)?.jitter(untilTick);
    },
    number(target, amount, scaled, counter): void {
      const p = centre(target);
      if (p && numberAt) numberAt(p.x, p.y - p.h / 2, amount, scaled, counter);
    },
    superCut(caster, fromTick, untilTick, reduced, superId): void {
      const v = viewOf(caster);
      if (v) void import('./super-view').then((m) => { m.superCut(scene, v, fromTick, untilTick, reduced, viewTick, paused, superId); });
    },
  };
}
