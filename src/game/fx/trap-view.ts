import type Phaser from 'phaser';
import { TRAP_BOX_PX, TRAP_VIEW_STRIDE, type RenderView } from '@core/index';
import { LOGICAL_WIDTH } from '../boot/viewport';
import { mute } from './grim-fx';
import { paintTrap } from './trap-paint';
import { TRAP_COLORS, TRAP_RANGE_PX, trapAlpha, trapLabel, trapPhase } from './trap-fx';

/**
 * Phaser side of the Arcade trap marker (WP 39b). The Arena mounts it in every Arcade match (a lazy chunk, so Classic never
 * downloads it) and it draws each live trap of `RenderArcade.traps`: an element-coloured square (the trap's box) inside an
 * outline of its trigger range, with its words above ("P1 Fire Bomb (arming)"). Reduced motion stops the blink. One Graphics
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
      .text(0, 0, '', { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: `${String(LABEL_PX)}px`, fontStyle: 'normal', color: '#b9b09c', stroke: '#0a0806', strokeThickness: 2, resolution: arena.scale.width / LOGICAL_WIDTH })
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
    for (let i = 0; i * TRAP_VIEW_STRIDE < ar.traps.length; i++) {
      const [kind = 0, x = 0, y = 0, team = 0, armLeft = 0, lifeLeft = 0] = ar.traps.slice(i * TRAP_VIEW_STRIDE, (i + 1) * TRAP_VIEW_STRIDE);
      if (kind === 0) {
        parts.labels[i]?.setVisible(false);
        continue;
      }
      const words = trapLabel(kind, team, armLeft);
      const alpha = trapAlpha(armLeft, lifeLeft, view.tick, reduced);
      // Each kind has its own silhouette and motion (trap-paint.ts); the label and the range outline below carry the reading.
      paintTrap(g, parts.glow, kind, x, y, trapPhase(armLeft, lifeLeft, view.tick, reduced), alpha, TRAP_COLORS[kind] ?? 0xffffff);
      // The trigger range: a dark outline under a thin ash one (element-muted), so it reads on any floor; thin while arming, firmer once armed.
      // (A faint dotted ground ellipse, not a box: dashes on the floor plane, brighter once armed.)
      const rx = TRAP_RANGE_PX / 2;
      const col = mute(TRAP_COLORS[kind] ?? 0xffffff, 0.35, 0.8);
      for (let d = 0; d < 24; d++) {
        const a0 = (d / 24) * Math.PI * 2;
        const a1 = a0 + 0.14;
        g.lineStyle(1.5, col, (armLeft > 0 ? 0.22 : 0.4) * alpha).lineBetween(
          x + TRAP_BOX_PX / 2 + Math.cos(a0) * rx, y + TRAP_BOX_PX / 2 + Math.sin(a0) * rx * 0.6,
          x + TRAP_BOX_PX / 2 + Math.cos(a1) * rx, y + TRAP_BOX_PX / 2 + Math.sin(a1) * rx * 0.6);
      }
      const t = label(i);
      if (t.text !== words) t.setText(words);
      t.setPosition(x + TRAP_BOX_PX / 2, y + TRAP_BOX_PX / 2 - 31 * 0.6 - 8).setAlpha(alpha * 0.85).setVisible(armLeft > 0); // words only while it arms: the armed trap reads by its art and range ring
      markers.push({ kind, x, y, team, label: words, alpha });
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
