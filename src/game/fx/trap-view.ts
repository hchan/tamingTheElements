import type Phaser from 'phaser';
import { TRAP_BOX_PX, TRAP_VIEW_STRIDE, arcadePlayfield, type RenderView } from '@core/index';
import { clampSpanX } from '../views/hero-scale';
import { resolutionOf } from '../boot/viewport';
import { mute } from './grim-fx';
import { TRAP_DECAL_R, paintTrap } from './trap-paint';
import { TRAP_COLORS, TRAP_DECAL_HALF_PX, labelX, trapAlpha, trapLabel, trapPhase, trapRangeDashes } from './trap-fx';

/**
 * Phaser side of the Arcade trap marker (WP 39b). The Arena mounts it in every Arcade match (a lazy chunk, so Classic never
 * downloads it) and it draws each live trap of `RenderArcade.traps`: an element-coloured square (the trap's box) inside an
 * outline of its trigger range, with its words above ("Fire Bomb (arming)"). Reduced motion stops the blink. One Graphics
 * plus one Text per trap slot, made on first use and reused; one `postupdate` listener, removed with the scene.
 */
const DEPTH = -0.6;
const LABEL_PX = 15;

export interface TrapMarker {
  readonly kind: number;
  readonly x: number;
  readonly y: number;
  readonly team: number;
  readonly label: string;
  readonly alpha: number;
  /** The drawn extent (decal, ring and label) left and right edges, px; inside the arena at a wall. */
  readonly drawnL: number;
  readonly drawnR: number;
}

const states = new WeakMap<Phaser.Scene, () => readonly TrapMarker[]>();

/** The markers drawn on the last frame (test probe), or undefined before the view mounts or after teardown. */
export function trapState(arena: Phaser.Scene): readonly TrapMarker[] | undefined {
  return states.get(arena)?.();
}

export function mountTrapView(arena: Phaser.Scene, view: RenderView, reduceMotion: () => boolean): void {
  let parts: { g: Phaser.GameObjects.Graphics; glow: Phaser.GameObjects.Graphics; labels: Phaser.GameObjects.Text[] } | undefined;
  let markers: TrapMarker[] = [];

  const label = (i: number): Phaser.GameObjects.Text => {
    const made = parts?.labels[i];
    if (made) return made;
    const t = arena.add
      .text(0, 0, '', { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: `${String(LABEL_PX)}px`, fontStyle: 'normal', color: '#b9b09c', stroke: '#0a0806', strokeThickness: 2, resolution: resolutionOf(arena) })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH + 0.05);
    if (parts) parts.labels[i] = t;
    return t;
  };

  const draw = (): void => {
    const ar = view.arcade();
    if (!ar) return;
    parts ??= { g: arena.add.graphics().setDepth(DEPTH), glow: arena.add.graphics().setDepth(DEPTH + 0.02).setBlendMode(1), labels: [] };
    const g = parts.g.clear();
    parts.glow.clear();
    const reduced = reduceMotion();
    markers = [];
    const pf = arcadePlayfield();
    for (let i = 0; i * TRAP_VIEW_STRIDE < ar.traps.length; i++) {
      const [kind = 0, x = 0, y = 0, team = 0, armLeft = 0, lifeLeft = 0] = ar.traps.slice(i * TRAP_VIEW_STRIDE, (i + 1) * TRAP_VIEW_STRIDE);
      if (kind === 0) {
        parts.labels[i]?.setVisible(false);
        continue;
      }
      const words = trapLabel(kind, team, armLeft);
      const alpha = trapAlpha(armLeft, lifeLeft, view.tick, reduced);
      // At a side wall the decal tucks in (max 7 px) and the ring and label are cut at the wall instead of running off screen.
      const cx = x + TRAP_BOX_PX / 2;
      const cy = y + TRAP_BOX_PX / 2;
      const tuck = clampSpanX(cx - TRAP_DECAL_HALF_PX, cx + TRAP_DECAL_HALF_PX, pf.x, pf.x + pf.w);
      // Each kind has its own silhouette and motion (trap-paint.ts); the label and the range outline below carry the reading.
      paintTrap(g, parts.glow, kind, x + tuck, y, trapPhase(armLeft, lifeLeft, view.tick, reduced), alpha, TRAP_COLORS[kind] ?? 0xffffff);
      // The trigger range: a dark outline under a thin ash one (element-muted), so it reads on any floor; thin while arming, firmer once armed.
      // (A faint dotted ground ellipse, not a box: dashes on the floor plane, brighter once armed.)
      const col = mute(TRAP_COLORS[kind] ?? 0xffffff, 0.35, 0.8);
      const dashes = trapRangeDashes(cx, cy, pf.x, pf.x + pf.w);
      g.lineStyle(1.5, col, (armLeft > 0 ? 0.22 : 0.4) * alpha);
      let drawnL = cx - TRAP_DECAL_HALF_PX + tuck;
      let drawnR = cx + TRAP_DECAL_HALF_PX + tuck;
      for (let k = 0; k + 3 < dashes.length; k += 4) {
        const x0 = dashes[k] ?? 0;
        const x1 = dashes[k + 2] ?? 0;
        const wall = x0 === x1; // the wall line closes the ring: solid, 5 px, warm bronze (not white), spanning the whole ring so it reads at 1280x720
        if (wall) g.lineStyle(5, 0x9a5f2a, (armLeft > 0 ? 0.6 : 0.8) * alpha);
        g.lineBetween(x0, dashes[k + 1] ?? 0, x1, dashes[k + 3] ?? 0);
        if (wall) g.lineStyle(1.5, col, (armLeft > 0 ? 0.22 : 0.4) * alpha);
        drawnL = Math.min(drawnL, x0, x1);
        drawnR = Math.max(drawnR, x0, x1);
      }
      const t = label(i);
      if (t.text !== words) t.setText(words);
      t.setPosition(labelX(cx, t.displayWidth, pf.x, pf.x + pf.w), cy - TRAP_DECAL_R * 0.6 - 8).setAlpha(alpha * 0.85).setVisible(armLeft > 0); // words only while it arms: the armed trap reads by its art and range ring
      if (armLeft > 0) {
        drawnL = Math.min(drawnL, t.x - t.displayWidth / 2);
        drawnR = Math.max(drawnR, t.x + t.displayWidth / 2);
      }
      markers.push({ kind, x, y, team, label: words, alpha, drawnL, drawnR });
    }
  };

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    states.delete(arena);
    parts?.g.destroy();
    parts?.glow.destroy();
    for (const t of parts?.labels ?? []) t.destroy();
    parts = undefined;
  };
  arena.events.on('postupdate', draw);
  arena.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => markers);
}
