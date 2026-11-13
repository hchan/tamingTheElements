import type Phaser from 'phaser';
import { arcadeHeroScale, visualBox } from '../views/hero-scale';
import type { RenderCharacter, RenderView } from '@core/index';
import { embers, glowPair, hash01, paintEmbers, softFill, softStroke, toPts } from './grim-fx';
import { STATUS_LOOKS, StatusTracker, burstLook, expireLook, loopAlpha } from './status-fx';

/**
 * Hero-side status animation (idea buff-debuff-animation): an apply burst (a ring of ash and a shockwave), an expiry fade
 * (embers lifting off) for every status, and the looping auras the older ability-aura view lacks (freeze shards, slow weights,
 * tide waves, speed streaks, guard shell, veil flicker). Rock, fire and rush loops stay in ability-aura-view. View ticks, so it
 * holds while paused; reduced motion keeps each cue but drops the movement. Lazy chunk mounted by the Arena.
 */
const DEPTH = 6.2;
const BENCHED_OR_DEAD = 16 | 32;
/** Statuses whose loop is drawn by ability-aura-view. */
const LOOP_ELSEWHERE = new Set([1, 2, 3]);

export interface StatusFxProbe {
  /** Loops drawn this frame. */
  readonly loops: readonly { id: number; status: number }[];
  /** Apply bursts live this frame (view ticks since applied). */
  readonly bursts: readonly { id: number; status: number; age: number }[];
  /** Expiry fades live this frame. */
  readonly fades: readonly { id: number; status: number; age: number }[];
}

const states = new WeakMap<Phaser.Scene, () => StatusFxProbe>();

/** What was drawn on the last frame (test probe), or undefined before the view mounts or after teardown. */
export function statusFxState(arena: Phaser.Scene): StatusFxProbe | undefined {
  return states.get(arena)?.();
}

interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Payload extends Body {
  id: number;
  status: number;
}

function ellipse(cx: number, cy: number, rx: number, ry: number, n = 24, rot = 0): number[] {
  const o: number[] = [];
  for (let i = 0; i < n; i++) o.push(cx + Math.cos((i / n) * Math.PI * 2 + rot) * rx, cy + Math.sin((i / n) * Math.PI * 2 + rot) * ry);
  return o;
}

export function mountStatusFxView(arena: Phaser.Scene, view: RenderView, reduceMotion: () => boolean): void {
  let g: Phaser.GameObjects.Graphics | undefined;
  let glowG: Phaser.GameObjects.Graphics | undefined;
  const tracker = new StatusTracker<Payload>();
  const lastBody = new Map<number, Body>();
  let probe: StatusFxProbe = { loops: [], bursts: [], fades: [] };

  const draw = (): void => {
    const reduced = reduceMotion();
    const now = view.tick;
    const gfx = (g ??= arena.add.graphics().setDepth(DEPTH));
    gfx.clear();
    const glow = (glowG ??= arena.add.graphics().setDepth(DEPTH + 0.1));
    glow.clear();
    const pair = glowPair(gfx, glow);
    const current = new Map<string, { payload: Payload; start: number; expire: number }>();
    view.forEachCharacter((c: RenderCharacter) => {
      const body = visualBox(c.x, c.y, c.w, c.h, view.arcade() ? arcadeHeroScale(c.h) : 1, { x: 0, y: 0, w: 0, h: 0 });
      lastBody.set(c.id, body);
      if ((c.flags & BENCHED_OR_DEAD) !== 0) return;
      view.forEachStatus(c.id, (st) => {
        if (!STATUS_LOOKS[st.id]) return;
        current.set(`${String(c.id)}:${String(st.id)}`, { payload: { ...body, id: c.id, status: st.id }, start: st.startTick, expire: st.expireTick });
      });
    });
    const live = tracker.update(now, current);
    const loops: { id: number; status: number }[] = [];
    const bursts: { id: number; status: number; age: number }[] = [];
    const fades: { id: number; status: number; age: number }[] = [];

    for (const t of live) {
      const { id, status } = t.payload;
      const look = STATUS_LOOKS[status];
      const b = lastBody.get(id) ?? t.payload;
      if (!look) continue;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const age = now - t.born;
      const burst = Number.isFinite(t.born) ? burstLook(age, reduced) : undefined;
      if (burst) {
        bursts.push({ id, status, age });
        const r = b.w * (0.35 + burst.t * 0.85);
        softStroke(pair, toPts(ellipse(cx, cy, r, r * 0.8, 28)), true, look.color, burst.alpha * 0.9, 0.8);
        paintEmbers(glow, embers(cx, cy, b.w * (0.4 + burst.t * 0.9), age * 3, reduced, 14, id * 13 + status), look.color, burst.alpha * 0.7);
      }
      if (LOOP_ELSEWHERE.has(status)) continue;
      const a = loopAlpha(Number.isFinite(t.born) ? age : 99, t.expire - now, reduced);
      if (a <= 0) continue;
      loops.push({ id, status });
      drawLoop(pair, gfx, glow, status, look.color, b, now, a, reduced, id);
    }

    for (const gone of tracker.gone()) {
      const age = now - gone.at;
      const fade = expireLook(age, reduced);
      const look = STATUS_LOOKS[gone.payload.status];
      if (!fade || !look) continue;
      fades.push({ id: gone.payload.id, status: gone.payload.status, age });
      const b = lastBody.get(gone.payload.id) ?? gone.payload;
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      // The aura gutters out: a ring that shrinks and thins while ash lifts off the body.
      const r = b.w * (0.75 - 0.25 * (reduced ? 0 : age / 20));
      softStroke(pair, toPts(ellipse(cx, cy, r, r * 0.85, 24)), true, look.color, fade.alpha, 0.7);
      paintEmbers(glow, embers(cx, cy + b.h * 0.2, b.w * 0.7, age * 2, reduced, 12, gone.payload.id * 7 + gone.payload.status), look.color, fade.alpha + 0.2);
    }
    probe = { loops, bursts, fades };
  };

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    states.delete(arena);
    g?.destroy();
    g = undefined;
    glowG?.destroy();
    glowG = undefined;
    tracker.clear();
    lastBody.clear();
  };
  arena.events.on('postupdate', draw);
  arena.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => probe);
}

type Pair = ReturnType<typeof glowPair>;

function drawLoop(pair: Pair, gfx: Phaser.GameObjects.Graphics, glow: Phaser.GameObjects.Graphics, status: number, color: number, b: Body, now: number, a: number, reduced: boolean, id: number): void {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const t = reduced ? 0 : now;
  switch (status) {
    case 5: {
      // FREEZE: ice shards bristling around the body and a pale frost ring; hostile, so it is the spiky one.
      const pts: number[] = [];
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2 + hash01(i, id) * 0.3;
        const len = b.w * (0.62 + hash01(i, id + 5) * 0.28);
        const px = Math.cos(ang);
        const py = Math.sin(ang) * 0.85;
        const tip = [cx + px * len, cy + py * len];
        const l = [cx + px * b.w * 0.42 - py * 4, cy + py * b.w * 0.42 + px * 4];
        const r = [cx + px * b.w * 0.42 + py * 4, cy + py * b.w * 0.42 - px * 4];
        softFill(gfx, [...l, ...tip, ...r], color, 5 * a);
        pts.push(...tip);
      }
      softStroke(pair, toPts(ellipse(cx, cy, b.w * 0.45, b.h * 0.5, 20)), true, color, 0.8 * a, 0.7);
      paintEmbers(glow, embers(cx, cy, b.w * 0.6, t, reduced, 8, id + 50), color, 0.6 * a);
      break;
    }
    case 6: {
      // SLOW: heavy down-chevrons sinking off the shoulders and drips that fall, never rise.
      for (let k = 0; k < 3; k++) {
        const u = reduced ? 0.4 + k * 0.2 : (t * 0.012 + k / 3) % 1;
        const y = b.y + b.h * (0.1 + u * 0.8);
        const w = b.w * 0.42;
        softStroke(pair, toPts([cx - w, y - 6, cx, y + 4, cx + w, y - 6]), false, color, Math.sin(u * Math.PI) * a, 0.55);
      }
      for (let i = 0; i < 5; i++) {
        const u = reduced ? 0.5 : (t * (0.01 + hash01(i, id) * 0.008) + hash01(i, id + 1)) % 1;
        const x = cx + (hash01(i, id + 2) - 0.5) * b.w * 0.9;
        glow.fillStyle(color, Math.sin(u * Math.PI) * 0.6 * a).fillCircle(x, b.y + b.h * (0.3 + u * 0.7), 1.6);
      }
      break;
    }
    case 9: {
      // TIDE: two slow wave lines washing across the hero's lower half, with sodden droplets.
      for (let k = 0; k < 2; k++) {
        const pts: number[] = [];
        const y0 = b.y + b.h * (0.55 + k * 0.25);
        for (let i = 0; i <= 12; i++) pts.push(b.x - 4 + (i / 12) * (b.w + 8), y0 + Math.sin(i * 0.9 + t * 0.12 + k * 2) * 4);
        softStroke(pair, toPts(pts), false, color, 0.8 * a, 0.6);
      }
      paintEmbers(glow, embers(cx, b.y + b.h * 0.8, b.w * 0.5, t, reduced, 6, id + 90), color, 0.5 * a);
      break;
    }
    case 7: {
      // FAST: horizontal speed streaks trailing off both flanks.
      for (let k = 0; k < 4; k++) {
        const u = reduced ? 0.5 : (t * 0.03 + k / 4) % 1;
        const y = b.y + b.h * (0.2 + hash01(k, id) * 0.65);
        const len = 10 + hash01(k, id + 1) * 14;
        for (const side of [-1, 1]) {
          const x0 = cx + side * (b.w * 0.5 + u * 14);
          softStroke(pair, toPts([x0, y, x0 + side * len, y]), false, color, Math.sin(u * Math.PI) * 0.9 * a, 0.35);
        }
      }
      break;
    }
    case 8: {
      // GUARD (super armour): a faceted hex shell that breathes.
      const s = 1 + (reduced ? 0 : Math.sin(t * 0.08) * 0.03);
      const pts = ellipse(cx, cy, b.w * 0.62 * s, b.h * 0.58 * s, 6, Math.PI / 6);
      softFill(gfx, pts, color, 3 * a);
      softStroke(pair, toPts(pts), true, color, 0.9 * a, 0.7);
      break;
    }
    case 4: {
      // VEIL (translucent): a broken, flickering dashed outline.
      const n = 14;
      const pts = ellipse(cx, cy, b.w * 0.55, b.h * 0.55, n * 2, reduced ? 0 : t * 0.03);
      for (let i = 0; i < n; i += 2) {
        const seg = toPts(pts.slice(i * 4, i * 4 + 6));
        if (seg.length >= 2) softStroke(pair, seg, false, color, (0.6 + (reduced ? 0 : hash01(i + Math.floor(t / 4), id) * 0.4)) * a, 0.4);
      }
      break;
    }
    default:
      break;
  }
}
