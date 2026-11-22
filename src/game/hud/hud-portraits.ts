import Phaser from 'phaser';
import type { RenderView } from '@core/index';
import { ELEMENT_COLORS } from '../fx/element-colors';
import { mute } from '../fx/grim-fx';
import { gradedHeroTexture } from '../fx/hero-grade';
import { lookup } from '../views/projectile-view';
import { elementMark } from './element-mark';
import type { HudCharacter } from './bars';
import { chipBar, chipRect, slimPortrait } from './slim-hud';
import type { HudFlags } from './hud-ctx';
import type { HudBarPainter } from './hud-bar-painter';
import { PORTRAIT, PORTRAIT_Y, benchPortraitRect, portraitX } from './hud-math';

const PORTRAIT_FRAME = 'portrait';
const TEAMS = [0, 1] as const;

/** The pooled portrait images (active heroes, then bench chips) and their frames, marks and crosses. */
export class HudPortraits {
  private images: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly flags: HudFlags,
    private readonly bars: HudBarPainter,
    /** The dark backing plate layer (owned by the scene). */
    private readonly back: () => Phaser.GameObjects.Graphics | undefined,
  ) {}

  create(): void {
    this.images = [...TEAMS, ...TEAMS.flatMap((t) => [t, t, t, t])].map(() => this.scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(99).setVisible(false));
  }

  destroy(): void {
    for (const im of this.images) im.destroy();
    this.images = [];
  }

  /** A side with no active hero: its portrait and bench pictures go. */
  hideTeam(team: number): void {
    for (const i of [team, ...[0, 1, 2, 3].map((k) => TEAMS.length + team * 4 + k)]) this.images[i]?.setVisible(false);
  }

  /** Arcade bench chip: a 68 px portrait with its element mark, a life bar under it, and a gold pulsing frame when a tag would work now (dimmed with a cross when down). */
  drawChip(gfx: Phaser.GameObjects.Graphics, view: RenderView | undefined, team: number, i: number, c: HudCharacter): void {
    const r = chipRect(team, i);
    this.back()?.fillStyle(0x070a12, 0.85).fillRect(r.x - 2, r.y - 2, r.size + 4, r.size + 4);
    const im = this.images[TEAMS.length + team * 4 + i];
    this.placePortrait(im, c, r.x, r.y, r.size, team === 1);
    im?.setAlpha(c.dead ? 0.35 : 1);
    const bar = view?.actionBar(team);
    const ready = !c.dead && !!bar && bar.swapReadyTick <= bar.tick;
    const pulse = ready && !this.flags.reduceMotion ? 0.6 + 0.4 * Math.abs(((this.flags.frame % 60) - 30) / 30) : 1;
    gfx.lineStyle(this.flags.highContrast || ready ? 3 : 2, c.dead ? 0x777777 : this.flags.highContrast ? 0xffffff : ready ? 0xb39653 : mute(ELEMENT_COLORS[c.element], 0.55, 0.72), ready ? pulse : 0.95);
    gfx.strokeRect(r.x - 2, r.y - 2, r.size + 4, r.size + 4);
    this.drawMark(gfx, c.element, r.x + 8, r.y + r.size - 8, 4);
    if (c.dead) {
      gfx.lineStyle(3, 0xff5a4a, 1);
      gfx.lineBetween(r.x + 4, r.y + 4, r.x + r.size - 4, r.y + r.size - 4);
      gfx.lineBetween(r.x + 4, r.y + r.size - 4, r.x + r.size - 4, r.y + 4);
    }
    const cb = chipBar(team, i);
    this.bars.drawBar(gfx, cb, c, false);
    // The same lost-life ghost as the main bar (a hero hit just before it tagged out keeps its trail on the bench chip).
    this.bars.drawTrail(gfx, cb, c);
  }

  /** Arcade: the active hero's picture at the end of its health bar (`arcadeAvatar`), in an element-coloured frame. */
  drawArcadeAvatar(gfx: Phaser.GameObjects.Graphics, team: number, c: HudCharacter): void {
    const a = slimPortrait(team);
    this.back()?.fillStyle(0x070a12, 0.78).fillRoundedRect(a.x - 2, a.y - 2, a.size + 4, a.size + 4, 4);
    this.placePortrait(this.images[team], c, a.x, a.y, a.size, team === 1);
    gfx.lineStyle(this.flags.highContrast ? 3 : 2, this.flags.highContrast ? 0xffffff : mute(ELEMENT_COLORS[c.element], 0.55, 0.72), 0.9);
    gfx.strokeRoundedRect(a.x - 2, a.y - 2, a.size + 4, a.size + 4, 4);
    this.drawMark(gfx, c.element, a.x + 8, a.y + 8, 6);
  }

  /** Element silhouette (white on a dark chip) so identity is never the frame colour alone: see `elementMark`. */
  private drawMark(gfx: Phaser.GameObjects.Graphics, element: HudCharacter['element'], x: number, y: number, r: number): void {
    gfx.fillStyle(0x070a12, 0.9).fillCircle(x, y, r + 3);
    gfx.lineStyle(2, 0xffffff, 1).fillStyle(0xffffff, 1);
    const m = elementMark(element, r);
    const at = (flat: readonly number[]): Phaser.Math.Vector2[] => {
      const out: Phaser.Math.Vector2[] = [];
      for (let k = 0; k + 1 < flat.length; k += 2) out.push(new Phaser.Math.Vector2(x + (flat[k] ?? 0), y + (flat[k + 1] ?? 0)));
      return out;
    };
    if (m.kind === 'circle') gfx.fillCircle(x, y, m.r);
    else if (m.kind === 'poly') {
      gfx.fillPoints(at(m.pts), true);
      if (m.hole) gfx.fillStyle(0x070a12, 1).fillPoints(at(m.hole), true);
    }
    else for (const run of m.runs) gfx.strokePoints(at(run), false);
  }

  /** Portrait frame, the active monster's picture and a small picture per benched teammate (dimmed with a cross when knocked out). */
  drawPortrait(gfx: Phaser.GameObjects.Graphics, team: number, c: HudCharacter, bench: readonly HudCharacter[]): void {
    const x = portraitX(team);
    const back = this.back();
    back?.fillStyle(0x070a12, 0.78);
    back?.fillRoundedRect(x - 3, PORTRAIT_Y - 3, PORTRAIT + 6, PORTRAIT + 6, 6);
    this.placePortrait(this.images[team], c, x, PORTRAIT_Y, PORTRAIT, team === 1);
    gfx.lineStyle(2, this.flags.highContrast ? 0xffffff : mute(ELEMENT_COLORS[c.element], 0.55, 0.72), 0.9);
    gfx.strokeRoundedRect(x - 3, PORTRAIT_Y - 3, PORTRAIT + 6, PORTRAIT + 6, 6);
    this.drawMark(gfx, c.element, x + 10, PORTRAIT_Y + 10, 8);
    // Benched teammates: their picture sits in the slot just left of their own bar.
    for (let i = 0; i < 4; i++) {
      const b = bench[i];
      const im = this.images[TEAMS.length + team * 4 + i];
      if (!b) {
        im?.setVisible(false);
        continue;
      }
      const { x: bx, y: by, size: s } = benchPortraitRect(team, i);
      back?.fillStyle(0x070a12, 0.78);
      back?.fillRoundedRect(bx - 2, by - 2, s + 4, s + 4, 4);
      this.placePortrait(im, b, bx, by, s, team === 1);
      im?.setAlpha(b.dead ? 0.35 : 1);
      gfx.lineStyle(2, b.dead ? 0x777777 : this.flags.highContrast ? ELEMENT_COLORS[b.element] : mute(ELEMENT_COLORS[b.element], 0.55, 0.72), 0.9);
      gfx.strokeRoundedRect(bx - 2, by - 2, s + 4, s + 4, 4);
      this.drawMark(gfx, b.element, bx + 6, by + s - 6, 5);
      if (b.dead) {
        gfx.lineStyle(2, 0xff5a4a, 1);
        gfx.lineBetween(bx + 3, by + 3, bx + s - 3, by + s - 3);
        gfx.lineBetween(bx + 3, by + s - 3, bx + s - 3, by + 3);
      }
    }
  }

  /** Put a character's picture (the first frame of its sprite sheet) in a pooled image, or hide the image when it has none. */
  private placePortrait(im: Phaser.GameObjects.Image | undefined, c: HudCharacter, x: number, y: number, size: number, flip: boolean): void {
    const scene = this.scene;
    const found = lookup(c.sprite);
    if (im && found && scene.textures.exists(found.key)) {
      const tex = scene.textures.get(found.key);
      const [fx = 0, fy = 0, fw = 80, fh = 80] = found.entry.coords;
      if (!tex.has(PORTRAIT_FRAME)) tex.add(PORTRAIT_FRAME, 0, fx, fy, fw, fh);
      // Grim grade (fx/hero-grade.ts): the portrait is drawn from the graded copy, which needs the portrait frame too.
      const shown = gradedHeroTexture(scene, found.key);
      if (shown !== found.key) {
        const gtex = scene.textures.get(shown);
        if (!gtex.has(PORTRAIT_FRAME)) gtex.add(PORTRAIT_FRAME, 0, fx, fy, fw, fh);
      }
      if (im.texture.key !== shown || im.frame.name !== PORTRAIT_FRAME) im.setTexture(shown, PORTRAIT_FRAME);
      im.setPosition(x, y).setDisplaySize(size, size).setFlipX(flip).setAlpha(1).setVisible(true);
    } else im?.setVisible(false);
  }
}
