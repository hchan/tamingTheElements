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

/** Phaser-backed sink. `at` resolves an entity id to its current centre, or undefined if it has no view. */
export function createPhaserFxSink(
  scene: Phaser.Scene,
  at: (id: number) => { x: number; y: number } | undefined,
  tintOf: (id: number) => Phaser.GameObjects.Image | undefined,
): FxSink {
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
        const dot = scene.add.circle(p.x, p.y, 3, 0xffddaa).setDepth(10);
        scene.tweens.add({
          targets: dot,
          x: p.x + dx * 24,
          y: p.y + dy * 24,
          alpha: 0,
          duration: 250,
          onComplete: () => {
            dot.destroy();
          },
        });
      }
    },
    shake(durationMs, intensity): void {
      scene.cameras.main.shake(durationMs, intensity);
    },
  };
}
