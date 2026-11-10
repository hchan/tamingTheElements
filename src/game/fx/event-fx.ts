import type Phaser from 'phaser';
import { SimEventKind, type SimEvent } from '@core/index';

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
  flash(target: number): void;
  /** `dx`/`dy` are unit-ish offsets, one pair per particle. */
  burst(target: number, offsets: readonly (readonly [number, number])[]): void;
  shake(durationMs: number, intensity: number): void;
}

export const HIT_PARTICLES = 6;

export interface FxOptions {
  readonly reducedMotion: () => boolean;
  readonly rng?: CosmeticRng;
  readonly deduper?: EventDeduper;
}

/** Turns sim events into effects once each. Reduced motion keeps the flash but drops shake and particles. */
export class EventFx {
  private readonly rng: CosmeticRng;
  private readonly deduper: EventDeduper;

  constructor(
    private readonly sink: FxSink,
    private readonly opts: FxOptions,
  ) {
    this.rng = opts.rng ?? new CosmeticRng();
    this.deduper = opts.deduper ?? new EventDeduper();
  }

  consume(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.kind !== SimEventKind.damage || !this.deduper.firstSeen(e)) continue;
      const target = e['target'] ?? -1;
      this.sink.flash(target);
      if (this.opts.reducedMotion()) continue;
      const offsets: [number, number][] = [];
      for (let i = 0; i < HIT_PARTICLES; i++) offsets.push([this.rng.next() * 2 - 1, this.rng.next() * 2 - 1]);
      this.sink.burst(target, offsets);
      this.sink.shake(80, 0.002);
    }
  }
}

const BURST_DISTANCE = 24;
const BURST_MS = 250;

/** Phaser-backed sink. `at` resolves an entity id to its current centre, or undefined if it has no view. */
export function createPhaserFxSink(
  scene: Phaser.Scene,
  at: (id: number) => { x: number; y: number } | undefined,
  tintOf: (id: number) => Phaser.GameObjects.Image | undefined,
): FxSink {
  // Pooled burst dots, advanced by one scene update listener that only exists while dots are in flight.
  interface Dot {
    circle: Phaser.GameObjects.Arc;
    x0: number;
    y0: number;
    dx: number;
    dy: number;
    age: number;
  }
  const free: Phaser.GameObjects.Arc[] = [];
  const live: Dot[] = [];
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
    live.length = 0;
    free.length = 0;
    detach();
  };
  function tick(_time: number, delta: number): void {
    for (let i = live.length - 1; i >= 0; i--) {
      const d = live[i];
      if (!d) continue;
      d.age += delta;
      const t = d.age / BURST_MS;
      if (t >= 1) {
        d.circle.setVisible(false);
        free.push(d.circle);
        live.splice(i, 1);
        continue;
      }
      d.circle.setPosition(d.x0 + d.dx * t, d.y0 + d.dy * t).setAlpha(1 - t);
    }
    if (live.length === 0) detach();
  }
  const attach = (): void => {
    if (attached) return;
    attached = true;
    scene.events.on('update', tick);
    scene.events.once('shutdown', drop);
    scene.events.once('destroy', drop);
  };
  return {
    flash(target): void {
      const img = tintOf(target);
      if (!img) return;
      img.setTint(0xff7777);
      scene.time.delayedCall(60, () => {
        img.clearTint();
      });
    },
    burst(target, offsets): void {
      const p = at(target);
      if (!p) return;
      for (const [dx, dy] of offsets) {
        const circle = free.pop() ?? scene.add.circle(0, 0, 3, 0xffddaa).setDepth(10);
        circle.setPosition(p.x, p.y).setAlpha(1).setVisible(true);
        live.push({ circle, x0: p.x, y0: p.y, dx: dx * BURST_DISTANCE, dy: dy * BURST_DISTANCE, age: 0 });
      }
      attach();
    },
    shake(durationMs, intensity): void {
      scene.cameras.main.shake(durationMs, intensity);
    },
  };
}
