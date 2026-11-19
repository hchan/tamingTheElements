import type Phaser from 'phaser';
import { SimEventKind, type RenderView, type SimEvent } from '@core/index';
import { lcg, unit } from '../views/pose-vfx-math';
import { toPts } from './grim-fx';
import { SMOOTH_KIND, THROW_RAMP_MS, smoothKindForDef, throwBlend, type SmoothKind } from './ability-smooth';

/**
 * Render-side motion smoothing for the throw/pull abilities, plus placeholder Graphics (no art assets). No sim edits, no
 * Math.random, no Phaser tweens: every age counts sim ticks (20 ms each), so it holds still while paused or stepped in e2e.
 *
 * WHAT THE WIRING AGENT MUST CALL (all of it is mounted lazily next to the other fx views in Arena.ts):
 *   1. `const smoother = new MotionSmoother({ positionOf, reduced: () => getPrefs().reduceMotion })`, where
 *      `positionOf(id)` returns the entity's CURRENT sim position (RenderCharacter x/y of that id; the same box the character
 *      view draws from), or undefined when it is gone. One instance per Arena.
 *   2. Each sim step, `smoother.consume(events)` with that step's SimEvents (hitConfirmed + hitStop are read, others ignored),
 *      BEFORE the character views are placed.
 *   3. Each frame, `smoother.advance(view.tick)` once, then for every foe the character view draws,
 *      `const { dx, dy } = smoother.shiftFor(id)` and add (dx, dy) to the drawn position. {0, 0} when nothing is active.
 *      Add it to the body only (not to hit boxes, the sim stays the truth).
 *   4. `mountAbilityMotionView(arena, view, smoother, () => getPrefs().reduceMotion)` once (it draws the tendril, the shock
 *      rings and the slide dust on `postupdate` and removes itself on shutdown/destroy). Pass the same `smoother`.
 *   Everything is keyed through SMOOTH_KIND (ability-smooth.ts): delete an entry there and that sprite gets no shift and no fx.
 *
 * Shift maths: drawn = p0 + (sim - p0) * smoothstep(t / R), R = THROW_RAMP_MS (140 ms = 7 ticks), p0 = the foe's position at
 * the hit, t counted from the end of the hit-stop freeze. shift = drawn - sim = (p0 - sim) * (1 - blend). Zero slope at both
 * ends, exactly zero at t >= R, and drawn is always between p0 and sim (never passes it). Reduced motion: no shift at all.
 */

export const TICK_MS = 20;
const DEPTH = 5;

const SHIFT_KINDS: ReadonlySet<SmoothKind> = new Set<SmoothKind>(['grab', 'pull']);

export interface Shift {
  dx: number;
  dy: number;
}

export interface MotionSmootherOpts {
  /** Current sim position of an entity (top-left of its box), or undefined when gone. */
  positionOf: (id: number) => { x: number; y: number } | undefined;
  reduced?: () => boolean;
  rampMs?: number;
  /** Ability def index -> smoothing kind (default: smoothKindForDef). A seam for tests. */
  kindOf?: (defIdx: number) => SmoothKind | undefined;
}

export interface Drag {
  readonly target: number;
  readonly attacker: number;
  readonly kind: SmoothKind;
  readonly p0x: number;
  readonly p0y: number;
  /** First tick of the ramp: the hit tick plus the hit-stop freeze. */
  readonly start: number;
}

const ZERO: Readonly<Shift> = { dx: 0, dy: 0 };

export class MotionSmoother {
  private readonly drags = new Map<number, Drag>();
  private tick = 0;
  private readonly out: Shift = { dx: 0, dy: 0 };
  private readonly rampTicks: number;

  constructor(private readonly o: MotionSmootherOpts) {
    this.rampTicks = (o.rampMs ?? THROW_RAMP_MS) / TICK_MS;
  }

  /** Reads one step's events. A hitConfirmed of a grab/pull ability starts a ramp on its target; hitStop in the same batch delays the start. */
  consume(events: readonly SimEvent[]): void {
    if ((this.o.reduced?.() ?? false) && this.drags.size === 0) return;
    let freeze = 0;
    for (const e of events) if (e.kind === SimEventKind.hitStop) freeze += Math.max(0, e['ticks'] ?? 0);
    const reduced = this.o.reduced?.() ?? false;
    for (const e of events) {
      if (e.kind !== SimEventKind.hitConfirmed || reduced) continue;
      const kind = (this.o.kindOf ?? smoothKindForDef)(e['ability'] ?? -1);
      if (kind === undefined || !SHIFT_KINDS.has(kind)) continue;
      const target = e['target'] ?? -1;
      const at = this.o.positionOf(target);
      if (!at) continue;
      if (this.tick < e.tick) this.tick = e.tick;
      // A new hit on the same id restarts the ramp from the sim position at that hit.
      this.drags.set(target, { target, attacker: e['attacker'] ?? -1, kind, p0x: at.x, p0y: at.y, start: e.tick + freeze });
    }
  }

  /** Sets the current view tick (call once per frame) and drops finished ramps. */
  advance(tick: number): void {
    this.tick = tick;
    for (const [id, d] of this.drags) if (tick - d.start >= this.rampTicks) this.drags.delete(id);
  }

  /** Blend 0..1 of a live drag, or undefined. */
  progress(id: number, tick: number = this.tick): number | undefined {
    const d = this.drags.get(id);
    return d ? throwBlend(Math.max(0, tick - d.start) * TICK_MS, this.rampTicks * TICK_MS) : undefined;
  }

  /** The offset to add to the foe's drawn position this frame: (p0 - sim) * (1 - blend). The returned object is reused. */
  shiftFor(id: number, tick: number = this.tick): Readonly<Shift> {
    const d = this.drags.get(id);
    if (!d || (this.o.reduced?.() ?? false)) return ZERO;
    const now = this.o.positionOf(id);
    if (!now) return ZERO;
    const k = 1 - (this.progress(id, tick) ?? 1);
    this.out.dx = (d.p0x - now.x) * k;
    this.out.dy = (d.p0y - now.y) * k;
    return this.out;
  }

  /** Live drags (for fx and tests). */
  active(): IterableIterator<Drag> {
    return this.drags.values();
  }

  /** Drops everything (new round, scene restart). */
  clear(): void {
    this.drags.clear();
  }
}

/** Shock rings by ability sprite: dust ring (Pax) or frost puff (Curomo). Placeholder colours. */
const RING: Readonly<Record<string, number>> = { groundShock: 0xb89a6a, iceShock: 0xbfe3f2 };
const RING_TICKS = 16;
const TENDRIL_COLOR = 0x5a2f7a;
const DUST_COLOR = 0xa8957a;

export interface MotionViewProbe {
  readonly tendrils: number;
  readonly rings: number;
  readonly dust: number;
}

const probes = new WeakMap<Phaser.Scene, () => MotionViewProbe>();

/** What was drawn on the last frame (test probe). */
export function abilityMotionState(arena: Phaser.Scene): MotionViewProbe | undefined {
  return probes.get(arena)?.();
}

/** Mounts the placeholder fx. See the header comment for the call list. */
export function mountAbilityMotionView(arena: Phaser.Scene, view: RenderView, smoother: MotionSmoother, reduceMotion: () => boolean): void {
  let g: Phaser.GameObjects.Graphics | undefined;
  const seen = new Map<number, number>(); // shock box id -> first-seen tick
  const pos = new Map<number, { x: number; y: number; w: number; h: number }>();
  let drawn: MotionViewProbe = { tendrils: 0, rings: 0, dust: 0 };

  const draw = (): void => {
    const reduced = reduceMotion();
    const now = view.tick;
    const gfx = (g ??= arena.add.graphics().setDepth(DEPTH));
    gfx.clear();
    let tendrils = 0;
    let rings = 0;
    let dust = 0;
    pos.clear();
    view.forEachCharacter((c) => pos.set(c.id, { x: c.x, y: c.y, w: c.w, h: c.h }));

    // Shock casts: a ground ring from the first sight of the melee box (SMOOTH_KIND says which sprites).
    const live = new Set<number>();
    view.forEachProjectile((p) => {
      if (SMOOTH_KIND[p.sprite] !== 'shock') return;
      live.add(p.id);
      if (!seen.has(p.id)) seen.set(p.id, now);
      const age = now - (seen.get(p.id) ?? now);
      const color = RING[p.sprite];
      if (color === undefined || age > RING_TICKS) return;
      const t = age / RING_TICKS;
      const r = (reduced ? 0.7 : 0.35 + 0.65 * t) * (p.w / 2);
      gfx.lineStyle(reduced ? 3 : 4 * (1 - t) + 1, color, 0.7 * (1 - t));
      gfx.strokeEllipse(p.x + p.w / 2, p.y + p.h, r * 2, r * 0.7);
      rings++;
    }, true);
    for (const id of [...seen.keys()]) if (!live.has(id)) seen.delete(id);

    for (const d of smoother.active()) {
      const age = now - d.start;
      if (age < 0) continue;
      const foe = pos.get(d.target);
      if (!foe) continue;
      const sh = smoother.shiftFor(d.target, now);
      const fx = foe.x + sh.dx + foe.w / 2;
      const fy = foe.y + sh.dy + foe.h;
      const fade = 1 - Math.min(1, age / (THROW_RAMP_MS / TICK_MS));
      if (d.kind === 'pull') {
        const c = pos.get(d.attacker);
        if (c) {
          // Tendril: caster -> foe, bowed by a seeded offset; straight under reduced motion.
          const bow = reduced ? 0 : (unit(lcg(d.target * 7919 + d.start)) - 0.5) * 40 * fade;
          const x0 = c.x + c.w / 2;
          const y0 = c.y + c.h / 2;
          const y1 = fy - foe.h / 2;
          const cx = (x0 + fx) / 2;
          const cy = (y0 + y1) / 2 + bow;
          const flat: number[] = [];
          for (let i = 0; i <= 8; i++) {
            const u = i / 8;
            const a = (1 - u) * (1 - u);
            const b = 2 * (1 - u) * u;
            const e = u * u;
            flat.push(a * x0 + b * cx + e * fx, a * y0 + b * cy + e * y1);
          }
          const pts = toPts(flat);
          gfx.lineStyle(6, 0x000000, 0.2 * fade).strokePoints(pts, false);
          gfx.lineStyle(3, TENDRIL_COLOR, 0.8 * fade).strokePoints(pts, false);
          tendrils++;
        }
      }
      // Slide dust under the foe (grab and pull): seeded puffs, none under reduced motion.
      if (!reduced) {
        let s = lcg(d.target * 31 + Math.floor(age / 2));
        for (let i = 0; i < 3; i++) {
          s = lcg(s);
          const ox = (unit(s) - 0.5) * foe.w;
          s = lcg(s);
          const rr = 3 + unit(s) * 5;
          gfx.fillStyle(DUST_COLOR, 0.35 * fade).fillCircle(fx + ox, fy - 2, rr);
          dust++;
        }
      }
    }
    drawn = { tendrils, rings, dust };
  };

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    probes.delete(arena);
    g?.destroy();
    g = undefined;
    seen.clear();
  };
  arena.events.on('postupdate', draw);
  arena.events.once('shutdown', off).once('destroy', off);
  probes.set(arena, () => drawn);
}
