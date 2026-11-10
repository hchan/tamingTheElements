import type Phaser from 'phaser';
import { EntityFlag, arcadePlayfield, type RenderCharacter, type RenderView } from '@core/index';

/**
 * Arcade 8-way aim indicator (FUN-DESIGN 2.12, WP-arcade-8way-aim): one arrow at AIM_RADIUS_PX from the player's
 * controlled character, pointing along its cast aim (`RenderArcade.aim`). View only. It ships in the Arcade Versus chunk
 * (the launch's `arcadeView` hook), so Classic never downloads it. One Graphics per scene, drawn once and only moved
 * and turned per frame (no allocation); it has no tween or pulse, so reduced motion needs no variant; it is a shape
 * with a dark outline, not a colour cue.
 */

/** Centre of the arrow from the character's centre, in logical px (the character box is 80 px). */
export const AIM_RADIUS_PX = 64;
/** Over the characters (0), under the super dim (5) and the hit sparks (10). */
export const AIM_DEPTH = 4;
/** Half the arrow's longest extent (its 22 px tip to tail, 14 px forward): it is hidden when any of that leaves the playfield. */
const ARROW_REACH_PX = 14;
/** Game object name, for the test probe. */
export const AIM_NAME = 'aim';
const BENCHED_OR_DEAD = EntityFlag.benched | EntityFlag.dead;

export interface AimPose {
  x: number;
  y: number;
  /** Phaser angle in degrees, 0..315 (clockwise on screen). */
  angle: number;
}

/**
 * Where the arrow sits for character `c` (interpolated by `alpha` like its sprite) aiming along dir8 `dir`: dir8 runs
 * counter-clockwise on screen (DIR8_X/Y: 1 is north-east), so the clockwise angle is (8 - dir) * 45 degrees.
 */
export function aimPose(c: Pick<RenderCharacter, 'x' | 'y' | 'px' | 'py' | 'w' | 'h'>, dir: number, alpha: number, out: AimPose): AimPose {
  const rad = (-dir * Math.PI) / 4;
  out.x = c.px + (c.x - c.px) * alpha + c.w / 2 + Math.cos(rad) * AIM_RADIUS_PX;
  out.y = c.py + (c.y - c.py) * alpha + c.h / 2 + Math.sin(rad) * AIM_RADIUS_PX;
  out.angle = ((8 - dir) & 7) * 45; // as rotationForDir: the arrow turns like the bullet it announces
  return out;
}

/**
 * True when an arrow centred at height `y` lies inside the Arcade playfield's vertical band (so it never draws over the
 * action bar or the top HUD when a fighter stands at an edge and aims outwards; the sides are the canvas edge).
 */
export function insidePlayfield(y: number): boolean {
  const pf = arcadePlayfield();
  return y - ARROW_REACH_PX >= pf.y && y + ARROW_REACH_PX <= pf.y + pf.h;
}

/** Mounts the indicator in the Arena `scene` (ArenaLaunch.arcadeView); it removes itself when the scene shuts down. */
export function mountAimIndicator(scene: Phaser.Scene, view: RenderView, alpha: () => number): void {
  const g = scene.add.graphics().setName(AIM_NAME).setDepth(AIM_DEPTH).setVisible(false);
  g.lineStyle(3, 0x101010, 1).fillStyle(0xffffff, 0.95);
  g.fillTriangle(14, 0, -8, -11, -8, 11).strokeTriangle(14, 0, -8, -11, -8, 11);
  const pose: AimPose & { shown: boolean } = { x: 0, y: 0, angle: 0, shown: false };
  const visit = (c: RenderCharacter): void => {
    if (pose.shown || c.team !== 0 || (c.flags & BENCHED_OR_DEAD) !== 0) return;
    pose.shown = true;
    aimPose(c, view.arcade()?.aim(c.id) ?? c.dir, alpha(), pose);
  };
  const draw = (): void => {
    pose.shown = false;
    view.forEachCharacter(visit);
    // Hidden without a player character in play (the last pose is kept, never shown) and outside the playfield.
    g.setVisible((pose.shown as boolean) && insidePlayfield(pose.y)).setPosition(pose.x, pose.y).setAngle(pose.angle);
  };
  scene.events.on('postupdate', draw);
  const off = (): void => {
    scene.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    g.destroy();
  };
  scene.events.once('shutdown', off);
  scene.events.once('destroy', off);
}
