import type Phaser from 'phaser';
import type { RenderView } from '@core/index';
import { resolutionOf, viewHeight, viewWidth } from '../boot/viewport';
import { createBench, POP_NEAR_X, POP_NEAR_Y, POP_NUMBER_CLEAR_PX, popCeil, popLaneLift, type LivePop } from './pop-lanes';
import { type Box, clearAbove, dropBelow, easeTo, easeUp, overlapsAny, slideClear } from './defence-callouts';
import { styleCombatText } from '../hud/combat-text';
import {
  CALLOUT_RECTS_KEY, CHIP_RECTS_KEY, NUMBER_BANNER_ALPHA, NUMBER_MARGIN, NUMBER_MAX_SLIDE, NUMBER_POP_GAP, POP_RECTS_KEY, hudFrame, projectToHud, viewOfCamera, type HudRect,
} from '../hud/arcade-hud';
import { POP_TICKS, popAlpha, popRise, progress } from './defence-fx';

/** Pops over the super dim (5), like the hit sparks (10). */
const POP_DEPTH = 9;
const POP_PX = 30;
/** No pop rects (never mutated; the registry's own array is only read). */
const NO_RECTS: readonly HudRect[] = [];
export const POP_POOL = 4;
const HIDDEN = Number.NEGATIVE_INFINITY;

/** The call-out words of the defence view: the pooled Texts, their placement clear of the HUD, and the published call-out rects. */
export interface PopBoard {
  /** Pops `word` over a fighter whose drawn head top is `top`, centred on `x`. `clock` is the view time. */
  spawn(x: number, top: number, word: string, color: number, flat: boolean, clock: number): void;
  /** Places the visible call-outs for this frame (`clock` is the view time, `delta` the frame time). */
  place(clock: number, delta: number): void;
  /** A new round: drops every pop. */
  reset(): void;
  /** Publishes the visible call-out rects (world px) so the HUD's damage numbers move clear of them. */
  publish(): void;
  /** The words visible now (test probe). */
  words(): string[];
  /** Destroys the Texts and withdraws the published rects. */
  destroy(): void;
}

/** `reduced()` is read on every placement (the view refreshes it once a second). */
export function createPopBoard(scene: Phaser.Scene, view: RenderView, reduced: () => boolean): PopBoard {
  const texts: Phaser.GameObjects.Text[] = [];
  // Call-out rects in WORLD px (one reused array under CALLOUT_RECTS_KEY), so the HUD's damage numbers move clear of the words.
  let calloutRects: { x: number; y: number; w: number; h: number }[] | undefined;
  const publish = (): void => {
    const reg = scene.registry as Phaser.Data.DataManager | undefined;
    if (!reg) return;
    if (!calloutRects) reg.set(CALLOUT_RECTS_KEY, (calloutRects = []));
    let k = 0;
    for (const t of texts) {
      if (!t.visible || t.alpha <= 0.05) continue;
      const r = calloutRects[k] ?? { x: 0, y: 0, w: 0, h: 0 };
      calloutRects[k++] = r;
      r.x = t.x - t.displayWidth * t.originX;
      r.y = t.y - t.displayHeight * t.originY;
      r.w = t.displayWidth;
      r.h = t.displayHeight;
    }
    calloutRects.length = k;
  };
  // Pops: x, y, from, reduced per text.
  const popData = new Float64Array(POP_POOL * 4).fill(HIDDEN);
  // Per text: the TARGET lift (px) it must be pushed up to clear a white pop or an earlier call-out (a ratchet, it never drops while
  // the call-out lives) and the target x it slides to (NaN = not slid); `shownLift` / `shownX` are what is drawn, eased toward them
  // (easeUp / easeTo). `dropY` is the bottom (NaN = none) it was dropped to under an obstacle when no room was left above (a ratchet
  // too, so nothing bobs), `headTop` the drawn head top (a drop never goes lower) and `held` is 0 until its first visible frame.
  // Scratch for the camera / HUD maps and the obstacle list is reused so placement allocates nothing.
  const lift = new Float64Array(POP_POOL);
  const shownLift = new Float64Array(POP_POOL);
  const slideX = new Float64Array(POP_POOL).fill(Number.NaN);
  const shownX = new Float64Array(POP_POOL).fill(Number.NaN);
  const dropY = new Float64Array(POP_POOL).fill(Number.NaN);
  const headTop = new Float64Array(POP_POOL);
  const held = new Uint8Array(POP_POOL);
  const obst: Box[] = [];
  const coBox: Box[] = Array.from({ length: POP_POOL }, () => ({ x: 0, y: 0, w: 0, h: 0 }));
  const resetEased = (i: number): void => {
    lift[i] = 0;
    shownLift[i] = 0;
    slideX[i] = Number.NaN;
    shownX[i] = Number.NaN;
    dropY[i] = Number.NaN;
    held[i] = 0;
  };
  const camView = { x: 0, y: 0, w: 1, h: 1 };
  const hudView = { x: 0, y: 0, w: 1, h: 1 };
  const hudPt = { x: 0, y: 0 };
  let placed = 0;
  let s = 1;
  let chips: readonly (readonly HudRect[])[] | undefined;
  const bench = createBench(); // the bench row under the scrim is a ceiling obstacle too
  // World y of the lowest line a call-out centred on cx may reach: the HUD ceiling (scrim and chips) mapped back to the world.
  const ceilAt = (cx: number, halfW: number): number => {
    const hx = projectToHud(cx, 0, camView, hudView, hudPt).x;
    return projectToHud(hx, Math.max(popCeil(chips, hx - halfW / s, hx + halfW / s), bench.ceil(hx - halfW / s, hx + halfW / s)), hudView, camView, hudPt).y;
  };

  function text(slot: number): Phaser.GameObjects.Text {
    let t = texts[slot];
    if (!t) {
      t = scene.add
        .text(0, 0, '', {
          fontSize: `${String(POP_PX)}px`, fontStyle: 'bold', resolution: resolutionOf(scene),
        })
        .setOrigin(0.5, 1)
        .setDepth(POP_DEPTH)
        .setVisible(false);
      texts[slot] = t;
    }
    return t;
  }

  const spawn = (x: number, top: number, word: string, color: number, flat: boolean, clock: number): void => {
    const live: LivePop[] = [];
    for (let i = 0; i < POP_POOL; i++) if (texts[i]?.visible) live.push({ x: popData[i * 4] ?? 0, y: popData[i * 4 + 1] ?? 0 });
    const base = top - 4 - POP_NUMBER_CLEAR_PX;
    let slot = 0;
    for (let i = 1; i < POP_POOL; i++) if ((popData[i * 4 + 2] ?? 0) < (popData[slot * 4 + 2] ?? 0)) slot = i;
    const t = text(slot);
    styleCombatText(t.setText(word), 'call', `#${color.toString(16).padStart(6, '0')}`).setVisible(true);
    popData[slot * 4] = x;
    popData[slot * 4 + 1] = base - popLaneLift(live, x, base);
    resetEased(slot);
    headTop[slot] = top;
    popData[slot * 4 + 2] = clock;
    popData[slot * 4 + 3] = flat ? 1 : 0;
  };

  /**
   * Places the visible call-outs, oldest first. Each placed call-out joins the obstacles (the white pops plus the call-outs before it),
   * so pinned ones avoid each other. Target position: up the stored lane, lifted clear of the obstacles (never dropping back while
   * one lives), under the scrim and the status chips, slid sideways where the ceiling leaves no room, else dropped under the obstacle
   * (never lower than the head top), else dimmed while it still overlaps. The drawn position eases to the target over about 105 ms
   * (`delta` is the frame time, so it keeps moving in hit-stop); the hard ceiling applies after the ease. A spawn frame snaps, and with
   * reduced motion the placement is made once on the first visible frame and then held: only the ceiling can move it (camera pan),
   * a later gold number never does, it dims the call-out while they overlap.
   */
  function place(clock: number, delta: number): void {
    const isReduced = reduced();
    const reg = scene.registry as Phaser.Data.DataManager | undefined;
    const pops = (reg?.get(POP_RECTS_KEY) as readonly HudRect[] | undefined) ?? NO_RECTS;
    const cam = (scene.cameras as Phaser.Cameras.Scene2D.CameraManager | undefined)?.main;
    const vw = viewWidth(scene);
    const vh = viewHeight(scene);
    const proj = cam !== undefined && Number.isFinite(vw) && Number.isFinite(vh);
    let xLo = 0;
    let xHi = 0;
    chips = undefined;
    if (proj) {
      viewOfCamera(cam, camView);
      hudFrame(vw, hudView, vh);
      s = camView.w / hudView.w; // world px per HUD px
      xLo = camView.x + NUMBER_MARGIN * s;
      xHi = camView.x + camView.w - NUMBER_MARGIN * s;
      chips = reg?.get(CHIP_RECTS_KEY) as (readonly (readonly HudRect[])[]) | undefined;
      bench.refresh((cb) => { view.forEachCharacter(cb); });
    }
    const clampX = (x: number, hw: number): number => (proj ? Math.min(Math.max(x, xLo + hw), xHi - hw) : x);
    let nObst = pops.length;
    for (let k = 0; k < nObst; k++) obst[k] = pops[k] as Box;
    placed = 0;
    for (let n = 0; n < POP_POOL; n++) {
      let i = -1;
      let oldest = Infinity;
      for (let k = 0; k < POP_POOL; k++) {
        const from = popData[k * 4 + 2] ?? 0;
        if ((placed & (1 << k)) === 0 && texts[k]?.visible && from < oldest) {
          oldest = from;
          i = k;
        }
      }
      const t0 = texts[i];
      if (!t0) break;
      placed |= 1 << i;
      const p = progress(clock, oldest, POP_TICKS);
      if (p >= 1) {
        t0.setVisible(false);
        continue;
      }
      obst.length = nObst;
      const storedX = popData[i * 4] ?? 0;
      const storedY = popData[i * 4 + 1] ?? 0;
      const natural = storedY - popRise(p, popData[i * 4 + 3] === 1);
      const halfW = t0.displayWidth / 2;
      const h = t0.displayHeight;
      const first = held[i] === 0;
      const hold = isReduced && !first;
      const snap = isReduced || first;
      const slid = slideX[i] ?? Number.NaN;
      const dropped = dropY[i] ?? Number.NaN;
      let cx = storedX; // the drawn x
      let bottom: number; // the drawn bottom
      let tx = storedX; // the target x and bottom: what the others avoid and what is judged for overlap
      let tb: number;
      if (hold) {
        const sx = shownX[i] ?? Number.NaN;
        cx = Number.isFinite(sx) ? clampX(sx, halfW) : storedX;
        bottom = Number.isFinite(dropped) ? dropped : natural - (shownLift[i] ?? 0);
        if (proj) bottom = Math.max(bottom, ceilAt(cx, halfW) + h);
        tx = cx;
        tb = bottom;
      } else {
        // A younger call-out stays a lane above an older one that was lifted.
        let lf = lift[i] ?? 0;
        for (let j = 0; j < POP_POOL; j++) {
          if (j === i || (placed & (1 << j)) === 0 || !texts[j]?.visible) continue;
          if (Math.abs((popData[j * 4] ?? 0) - storedX) < POP_NEAR_X && Math.abs((popData[j * 4 + 1] ?? 0) - storedY) < POP_NEAR_Y) lf = Math.max(lf, lift[j] ?? 0);
        }
        if (proj && Number.isFinite(slid)) tx = clampX(slid, halfW);
        if (Number.isFinite(dropped)) tb = dropped;
        else {
          tb = clearAbove(tx, natural - lf, halfW, h, obst, NUMBER_POP_GAP);
          lift[i] = natural - tb;
          if (proj) {
            tb = Math.max(tb, ceilAt(tx, halfW) + h);
            if (overlapsAny(tx, tb, halfW, h, obst, NUMBER_POP_GAP)) {
              const nx = slideClear(tx, tb, halfW, h, obst, NUMBER_POP_GAP, xLo, xHi, NUMBER_MAX_SLIDE * s, camView.x + camView.w / 2, storedX);
              if (nx !== tx) {
                slideX[i] = tx = nx;
                tb = Math.max(clearAbove(tx, natural - lf, halfW, h, obst, NUMBER_POP_GAP), ceilAt(tx, halfW) + h);
              }
            }
            if (overlapsAny(tx, tb, halfW, h, obst, NUMBER_POP_GAP)) {
              const nb = dropBelow(tx, tb, halfW, h, obst, NUMBER_POP_GAP, headTop[i] ?? tb);
              if (nb !== tb) dropY[i] = tb = nb;
            }
          }
        }
        // Drawn: the lift and the slide ease toward their targets; a drop is instant (down moves do not ease).
        const sl = easeUp(shownLift[i] ?? 0, lift[i] ?? 0, delta, snap);
        shownLift[i] = sl;
        bottom = Number.isFinite(dropY[i]) ? tb : natural - sl;
        if (proj && Number.isFinite(slideX[i])) {
          const sx = shownX[i] ?? Number.NaN;
          shownX[i] = easeTo(Number.isFinite(sx) ? sx : storedX, tx, delta, snap);
          cx = clampX(shownX[i] ?? tx, halfW);
        }
        if (proj) bottom = Math.max(bottom, ceilAt(cx, halfW) + h);
      }
      held[i] = 1;
      const dim = overlapsAny(tx, tb, halfW, h, obst, NUMBER_POP_GAP);
      const box = coBox[i] as Box;
      box.x = tx - halfW;
      box.y = tb - h;
      box.w = 2 * halfW;
      box.h = h;
      obst[nObst++] = box;
      t0.setPosition(cx, bottom).setAlpha(dim ? Math.min(popAlpha(p), NUMBER_BANNER_ALPHA) : popAlpha(p));
    }
  }

  return {
    spawn,
    place,
    reset(): void {
      for (let i = 0; i < POP_POOL; i++) {
        popData[i * 4 + 2] = HIDDEN;
        resetEased(i);
        texts[i]?.setVisible(false);
      }
    },
    publish,
    words(): string[] {
      const out: string[] = [];
      for (const t of texts) if (t.visible) out.push(t.text);
      return out;
    },
    destroy(): void {
      for (const t of texts) t.destroy();
      texts.length = 0;
      if (calloutRects) (scene.registry as Phaser.Data.DataManager | undefined)?.remove(CALLOUT_RECTS_KEY);
      calloutRects = undefined;
    },
  };
}
