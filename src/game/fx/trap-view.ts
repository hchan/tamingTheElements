import type Phaser from 'phaser';
import { TRAP_BOX_PX, TRAP_VIEW_STRIDE, type RenderView } from '@core/index';
import { LOGICAL_WIDTH } from '../boot/viewport';
import { TRAP_COLORS, TRAP_RANGE_PX, trapAlpha, trapLabel } from './trap-fx';

/**
 * Phaser side of the Arcade trap marker (WP 39b). The Arena mounts it in every Arcade match (a lazy chunk, so Classic never
 * downloads it) and it draws each live trap of `RenderArcade.traps`: an element-coloured square (the trap's box) inside an
 * outline of its trigger range, with its words above ("P1 Fire Bomb (arming)"). Reduced motion stops the blink. One Graphics
 * plus one Text per trap slot, made on first use and reused; one `postupdate` listener, removed with the scene.
 */
const DEPTH = -0.6;
const LABEL_PX = 18;

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
  let parts: { g: Phaser.GameObjects.Graphics; labels: Phaser.GameObjects.Text[] } | undefined;
  let markers: TrapMarker[] = [];

  const label = (i: number): Phaser.GameObjects.Text => {
    const made = parts?.labels[i];
    if (made) return made;
    const t = arena.add
      .text(0, 0, '', { fontSize: `${String(LABEL_PX)}px`, fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 4, resolution: arena.scale.width / LOGICAL_WIDTH })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH + 0.05);
    if (parts) parts.labels[i] = t;
    return t;
  };

  const draw = (): void => {
    const ar = view.arcade();
    if (!ar) return;
    parts ??= { g: arena.add.graphics().setDepth(DEPTH), labels: [] };
    const g = parts.g.clear();
    const reduced = reduceMotion();
    markers = [];
    const margin = (TRAP_RANGE_PX - TRAP_BOX_PX) / 2;
    for (let i = 0; i * TRAP_VIEW_STRIDE < ar.traps.length; i++) {
      const [kind = 0, x = 0, y = 0, team = 0, armLeft = 0, lifeLeft = 0] = ar.traps.slice(i * TRAP_VIEW_STRIDE, (i + 1) * TRAP_VIEW_STRIDE);
      if (kind === 0) {
        parts.labels[i]?.setVisible(false);
        continue;
      }
      const words = trapLabel(kind, team, armLeft);
      const alpha = trapAlpha(armLeft, lifeLeft, view.tick, reduced);
      g.fillStyle(0x000000, 0.25 * alpha).fillRect(x + 3, y + 3, TRAP_BOX_PX, TRAP_BOX_PX);
      g.fillStyle(TRAP_COLORS[kind] ?? 0xffffff, 0.8 * alpha).fillRect(x, y, TRAP_BOX_PX, TRAP_BOX_PX);
      g.lineStyle(3, 0x000000, alpha).strokeRect(x, y, TRAP_BOX_PX, TRAP_BOX_PX);
      // The trigger range: a bright outline over a dark one, so it reads on any floor; thin while arming, solid once armed.
      g.lineStyle(armLeft > 0 ? 1 : 3, 0x000000, 0.7 * alpha).strokeRect(x - margin - 1, y - margin - 1, TRAP_RANGE_PX + 2, TRAP_RANGE_PX + 2);
      g.lineStyle(armLeft > 0 ? 1 : 2, 0xffffff, alpha).strokeRect(x - margin, y - margin, TRAP_RANGE_PX, TRAP_RANGE_PX);
      const t = label(i);
      if (t.text !== words) t.setText(words);
      t.setPosition(x + TRAP_BOX_PX / 2, y - margin - 2).setAlpha(alpha).setVisible(true);
      markers.push({ kind, x, y, team, label: words, alpha });
    }
  };

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    states.delete(arena);
    parts?.g.destroy();
    for (const t of parts?.labels ?? []) t.destroy();
    parts = undefined;
  };
  arena.events.on('postupdate', draw);
  arena.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => markers);
}
