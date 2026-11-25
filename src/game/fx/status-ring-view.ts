import type Phaser from 'phaser';
import { arcadePlayfield, type RenderCharacter, type RenderView } from '@core/index';
import { arcadeHeroScale, visualBox } from '../views/hero-scale';
import { mute, toPts } from './grim-fx';
import { StatusTracker, expireLook, loopAlpha, ringFraction } from './status-fx';
import { RING_ART, createRingArt } from './status-ring-art';
import { RING_STATUSES, ringFrame, stackRings, type RingArgs, type RingBody, type RingFrame } from './status-ring';

/**
 * Feet rings for freeze, slow, speed, tide and daze (status-ring.ts). Far halves go on a Graphics under the hero, near halves on
 * one over it (as the Snag rope), motes on an additive layer. View ticks, so it holds while paused. Mounted by status-fx-view.
 */
const BACK_DEPTH = -0.2;
const FRONT_DEPTH = 6.15;
const BENCHED_OR_DEAD = 16 | 32;

export interface StatusRingProbe {
  readonly rings: readonly { id: number; status: number; scale: number }[];
}
const states = new WeakMap<Phaser.Scene, () => StatusRingProbe>();
const drawn = new WeakMap<Phaser.Scene, ReadonlySet<string>>();

/** `id:status` keys that got a ring this frame; the body loop of a ring status is skipped only for these (a third status past the two-ring cap keeps its loop). */
export function statusRingDrawn(arena: Phaser.Scene): ReadonlySet<string> | undefined {
  return drawn.get(arena);
}

/** What was drawn on the last frame (test probe), or undefined before the view mounts or after teardown. */
export function statusRingState(arena: Phaser.Scene): StatusRingProbe | undefined {
  return states.get(arena)?.();
}

interface Payload extends RingBody {
  id: number;
  status: number;
  element: RenderCharacter['element'];
}

export function mountStatusRingView(arena: Phaser.Scene, view: RenderView, reduceMotion: () => boolean, highContrast: () => boolean): void {
  const back = arena.add.graphics().setDepth(BACK_DEPTH);
  const front = arena.add.graphics().setDepth(FRONT_DEPTH);
  const glow = arena.add.graphics().setDepth(FRONT_DEPTH + 0.05).setBlendMode(1);
  const tracker = new StatusTracker<Payload>();
  const lastScale = new Map<string, number>();
  const art = createRingArt(arena, import.meta.env.BASE_URL);
  const plates = new Map<string, Phaser.GameObjects.Image>();
  const usedPlates = new Set<string>();
  const moteColor = mute(0xe8e4d8, 0.5, 1);
  let probe: StatusRingProbe = { rings: [] };

  const paint = (f: RingFrame): void => {
    for (const s of f.segs) {
      const g = s.far ? back : front;
      const pts = toPts(s.pts);
      if (s.fill) {
        g.fillStyle(s.color, s.alpha * (s.width > 0 ? 0.5 : 1)).fillPoints(pts, true);
        if (s.width <= 0) continue;
      }
      g.lineStyle(s.width + 2, s.under ?? 0x000000, s.alpha * (s.under === undefined ? 0.25 : 0.85)).strokePoints(pts, s.closed);
      g.lineStyle(s.width, s.color, s.alpha).strokePoints(pts, s.closed);
    }
    for (const m of f.motes) glow.fillStyle(m.color ?? moteColor, m.a * 0.7).fillCircle(m.x, m.y, m.r);
  };

  /** The painted plate for a ring (a flattened ellipse at the feet); the caller then draws only the timer arc. */
  const plate = (key: string, status: number, f: RingFrame, alpha: number): void => {
    const def = RING_ART[status];
    if (!def) return;
    let im = plates.get(key);
    if (!im) {
      im = arena.add.image(0, 0, def.key).setDepth(BACK_DEPTH + 0.05);
      plates.set(key, im);
    }
    usedPlates.add(key);
    im.setVisible(true).setPosition(f.cx, f.cy).setDisplaySize(f.rx * 2.5, f.ry * 2.5).setAlpha(Math.min(0.85, alpha));
  };

  const draw = (): void => {
    const reduced = reduceMotion();
    const hc = highContrast();
    const now = view.tick;
    back.clear();
    front.clear();
    glow.clear();
    usedPlates.clear();
    const current = new Map<string, { payload: Payload; start: number; expire: number }>();
    const heroStatuses = new Map<number, number[]>();
    view.forEachCharacter((c: RenderCharacter) => {
      if ((c.flags & BENCHED_OR_DEAD) !== 0) return;
      const body = visualBox(c.x, c.y, c.w, c.h, view.arcade() ? arcadeHeroScale(c.h) : 1, { x: 0, y: 0, w: 0, h: 0 }, view.arcade() ? arcadePlayfield().w : undefined);
      view.forEachStatus(c.id, (st) => {
        if (!RING_STATUSES.includes(st.id)) return;
        current.set(`${String(c.id)}:${String(st.id)}`, { payload: { ...body, id: c.id, status: st.id, element: c.element }, start: st.startTick, expire: st.expireTick });
        heroStatuses.set(c.id, [...(heroStatuses.get(c.id) ?? []), st.id]);
      });
    });
    const live = tracker.update(now, current);
    const rings: { id: number; status: number; scale: number }[] = [];
    const keys = new Set<string>();
    for (const [id, list] of heroStatuses) {
      for (const { status, scale } of stackRings(list)) {
        const t = live.find((x) => x.payload.id === id && x.payload.status === status);
        if (!t) continue;
        const age = Number.isFinite(t.born) ? now - t.born : 99;
        const alpha = loopAlpha(age, t.expire - now, reduced);
        if (alpha <= 0) continue;
        rings.push({ id, status, scale });
        keys.add(`${String(id)}:${String(status)}`);
        lastScale.set(`${String(id)}:${String(status)}`, scale);
        const key = `${String(id)}:${String(status)}`;
        const textured = art.path(status) === 'texture';
        const frame = ringFrame({ status, element: t.payload.element, id, body: t.payload, now, alpha, fraction: ringFraction(now, t.start, t.expire), scale, reduced, highContrast: hc, plate: textured });
        if (textured) plate(key, status, frame, alpha);
        paint(frame);
      }
    }
    // Expiry: the ring shrinks and thins for a moment (expireLook), as the body loops do.
    for (const gone of tracker.gone()) {
      const p = gone.payload;
      const key = `${String(p.id)}:${String(p.status)}`;
      const fade = expireLook(now - gone.at, reduced);
      if (!fade) {
        lastScale.delete(key);
        continue;
      }
      const base = lastScale.get(key);
      if (base === undefined) continue;
      const textured = art.path(p.status) === 'texture';
      const args: RingArgs = { status: p.status, element: p.element, id: p.id, body: p, now, alpha: fade.alpha, fraction: 0, scale: base * (1 - (reduced ? 0 : 0.25 * ((now - gone.at) / 20))), reduced, highContrast: hc, plate: textured };
      const frame = ringFrame(args);
      if (textured) plate(key, p.status, frame, fade.alpha);
      paint(frame);
    }
    for (const [k, im] of plates) if (!usedPlates.has(k)) im.setVisible(false);
    probe = { rings };
    drawn.set(arena, keys);
  };

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    states.delete(arena);
    drawn.delete(arena);
    back.destroy();
    front.destroy();
    glow.destroy();
    for (const im of plates.values()) im.destroy();
    plates.clear();
    art.dispose();
    tracker.clear();
  };
  arena.events.on('postupdate', draw);
  arena.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => probe);
}
