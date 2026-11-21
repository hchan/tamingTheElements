import Phaser from 'phaser';
import type { RenderView } from '@core/index';
import { mute } from '../fx/grim-fx';
import { ROOT_ICON, STATUS_LOOKS, StatusTracker, chipBlink, chipFlash, chipPop } from '../fx/status-fx';
import { crisp, phoneBoost } from '../boot/viewport';
import { isPortraitPlay } from '../boot/portrait-play';
import { BUFF_SLOT, collectBuffs } from './buffs';
import { CC_ICONS, CHIP_FONT, CHIP_MAX, CHIP_Y, PORTRAIT_CHIP_MAX, collectStatusChips } from './status-icons';
import { CHIP_RECTS_KEY, type HudRect } from './arcade-hud';
import { dashSegments, type HudCharacter } from './bars';
import { CHIP_BOTTOM, SLIM_H, getChipDrop } from './slim-hud';
import { HUD_FONT, type HudFlags } from './hud-ctx';
import { chipRowTop } from './hud-math';

/** Portrait phone: the status chips start this far under the HUD bar's fill (SLIM_H + 2), so they never touch it. */
const PHONE_CHIP_GAP = 6;

/** Where a status chip was and its colour, kept so the expire flash can outline it after it ends. */
interface ChipLook {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly color: number;
}

/** What the chips read from the scene (never the scene itself). */
export interface HudStatusChipsDeps {
  /** The name/life label of a side (the chips sit under its measured height). */
  readonly label: (team: number) => Phaser.GameObjects.Text | undefined;
  /** Portrait play: the lowest logical y of the names and the SUPER row (written by the scene's `dropChips`). */
  readonly portraitBottom: () => number;
}

/** Arcade status chips (pooled words, published rects) and the Classic buff squares. */
export class HudStatusChips {
  private chipTrackers: StatusTracker<ChipLook>[] = [];
  /** Per team: the longest hit-stun left seen since it began (the STUN chip's bar total). */
  private readonly stunTotals: number[] = [0, 0];
  /** Arcade status chip words, pooled per side: index team * CHIP_MAX + slot. */
  private chipTexts: (Phaser.GameObjects.Text | undefined)[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly flags: HudFlags,
    private readonly deps: HudStatusChipsDeps,
  ) {}

  destroy(): void {
    for (const t of this.chipTexts) t?.destroy();
    this.scene.registry.remove(CHIP_RECTS_KEY);
    this.chipTexts = [];
  }

  /** Classic buffs: a row of plus or cross squares in the free column under the health words. */
  drawLegacyBuffs(gfx: Phaser.GameObjects.Graphics, view: RenderView, c: HudCharacter, x: number): void {
    for (const b of collectBuffs(view, c.id, x, this.flags.highContrast)) {
      gfx.lineStyle(this.flags.highContrast ? 2 : 1, this.flags.highContrast ? 0xffffff : 0x111111, 1);
      gfx.strokeRect(b.x, b.y, BUFF_SLOT, BUFF_SLOT);
      // Remaining-time fill: the slot drains as the status runs out.
      const remain = (1 - b.elapsed) * BUFF_SLOT;
      gfx.fillStyle(b.color, 1);
      gfx.fillRect(b.x, b.y + BUFF_SLOT - remain, BUFF_SLOT, remain);
      // Shape cue: a plus for a buff, a cross for a debuff.
      gfx.lineStyle(2, 0x000000, 1);
      const cx = b.x + BUFF_SLOT / 2;
      const cy = b.y + BUFF_SLOT / 2;
      const r = BUFF_SLOT / 4;
      if (b.glyph === 'plus') {
        gfx.lineBetween(cx - r, cy, cx + r, cy);
        gfx.lineBetween(cx, cy - r, cx, cy + r);
      } else {
        gfx.lineBetween(cx - r, cy - r, cx + r, cy + r);
        gfx.lineBetween(cx - r, cy + r, cx + r, cy - r);
      }
    }
  }

  /**
   * Arcade: one chip per active buff or debuff under the bar (shape, word and seconds; the bar under it drains), pooled texts.
   * The sim already exposes every status, so this only reads the view (`collectStatusChips`).
   */
  drawStatusChips(gfx: Phaser.GameObjects.Graphics, view: RenderView | undefined, team: number, c: HudCharacter, x: number, benched: boolean): void {
    if (!view) return;
    const scene = this.scene;
    // At least 16 px (times the phone boost), and below the hero's health words as measured (they wrap to several lines when boosted).
    const label = this.deps.label(team);
    // Portrait phone: the chips stack directly under the name line, beside the big portrait (the bench chips sit further in, so they never meet).
    const phone = isPortraitPlay(scene.game);
    const px = Math.round(16 * phoneBoost(scene, 2));
    const top = chipRowTop(phone ? Math.max(SLIM_H + PHONE_CHIP_GAP, Math.ceil(this.deps.portraitBottom()) + 2) : Math.max(CHIP_Y, SLIM_H + 2, benched ? CHIP_BOTTOM + getChipDrop() : 0), label);
    // The first stunLeft seen after a calm tick is the stun's length (it drains from there); a re-stun that outlasts it raises it.
    const stunLeft = view.arcade()?.stunLeft(c.id) ?? 0;
    this.stunTotals[team] = stunLeft > 0 ? Math.max(this.stunTotals[team] ?? 0, stunLeft) : 0;
    const chips = collectStatusChips(view, team, c.id, c.element, x, this.flags.highContrast, { scale: px / CHIP_FONT, top, ...(phone ? { max: PORTRAIT_CHIP_MAX, perRow: 1, alignRight: team === 1 } : {}) }, this.stunTotals[team]);
    const now = view.tick;
    const reduced = this.flags.reduceMotion;
    const tracker = (this.chipTrackers[team] ??= new StatusTracker<ChipLook>(12));
    const cur = new Map<string, { payload: ChipLook; start: number; expire: number }>();
    for (const chip of chips) cur.set(chip.key, { payload: { x: chip.x, y: chip.y, w: chip.w, h: chip.h, color: chip.color }, start: 0, expire: 0 });
    const rects = this.chipRects(team);
    rects.length = chips.length;
    chips.forEach((chip, i) => (rects[i] = { x: chip.x, y: chip.y, w: chip.w, h: chip.h }));
    const born = new Map(tracker.update(now, cur).map((t) => [t.key, t.born]));
    chips.forEach((chip, i) => {
      const slot = team * CHIP_MAX + i;
      const t = (this.chipTexts[slot] ??= scene.add
        .text(0, 0, '', crisp(scene, { fontFamily: HUD_FONT, fontSize: `${String(px)}px`, color: '#d8d2c4', fontStyle: 'normal', stroke: '#0a0806', strokeThickness: 2 }))
        .setDepth(102));
      const age = now - (born.get(chip.key) ?? Number.NEGATIVE_INFINITY);
      // Apply pop: the chip swells about its centre and settles; a flash washes over it (no motion under reduced motion).
      const pop = chipPop(age, reduced);
      const w = chip.w * pop;
      const h = chip.h * pop;
      // Portrait phone: the swell grows down and inward only, so it never climbs into the HUD bar or under the portrait (qa-r98).
      const x = phone ? (team === 1 ? chip.x + chip.w - w : chip.x) : chip.x - (w - chip.w) / 2;
      const y = phone ? chip.y : chip.y - (h - chip.h) / 2;
      const low = chip.secs !== null && chip.secs <= 1;
      const shown = !low || chipBlink(now % 49, reduced);
      t.setFontSize(px).setText(chip.text).setPosition(chip.x + 4, chip.y + Math.round((chip.h - t.height) / 2)).setVisible(true).setAlpha(shown ? 1 : 0.45);
      gfx.fillStyle(0x0d0b09, 0.78).fillRect(x, y, w, h);
      const flash = chipFlash(age, reduced);
      if (flash > 0) gfx.fillStyle(mute(chip.color, 0.5, 1.3), flash * 0.5).fillRect(x, y, w, h);
      // Time bar along the foot of the chip, draining to the left.
      gfx.fillStyle(chip.color, shown ? 0.85 : 0.4).fillRect(chip.x + 1, chip.y + chip.h - 3, Math.round((chip.w - 2) * chip.remaining), 2);
      // Shape icon in a draining timer ring at the chip's right end: the silhouette codes the status without colour.
      const id = /^s(\d+)$/.exec(chip.key);
      const icon = id ? (STATUS_LOOKS[Number(id[1])]?.icon ?? CC_ICONS[chip.key]) : chip.key === 'root' ? ROOT_ICON : CC_ICONS[chip.key];
      if (icon) {
        const r = Math.max(5, Math.round(chip.h / 2) - 2);
        const cx = chip.x + chip.w - r - 4;
        const cy = chip.y + chip.h / 2;
        gfx.lineStyle(1, chip.color, 0.3).strokeCircle(cx, cy, r);
        gfx.lineStyle(2, chip.color, shown ? 0.9 : 0.4).beginPath().arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * chip.remaining, false).strokePath();
        gfx.lineStyle(1.5, chip.color, 0.95);
        for (let k = 0; k + 3 < icon.length; k += 2) gfx.lineBetween(cx + (icon[k] ?? 0) * r * 0.55, cy + (icon[k + 1] ?? 0) * r * 0.55, cx + (icon[k + 2] ?? 0) * r * 0.55, cy + (icon[k + 3] ?? 0) * r * 0.55);
      }
      // Buffs have a solid frame, debuffs a dashed one (so the two differ without colour).
      gfx.lineStyle(this.flags.highContrast ? 2 : 1, chip.color, this.flags.highContrast ? 1 : 0.75);
      if (chip.hostile) {
        for (const [a, b] of dashSegments(chip.x, chip.x + chip.w, [6, 3])) {
          gfx.lineBetween(a, chip.y, b, chip.y);
          gfx.lineBetween(a, chip.y + chip.h, b, chip.y + chip.h);
        }
        gfx.lineBetween(chip.x, chip.y, chip.x, chip.y + chip.h);
        gfx.lineBetween(chip.x + chip.w, chip.y, chip.x + chip.w, chip.y + chip.h);
      } else gfx.strokeRect(chip.x, chip.y, chip.w, chip.h);
    });
    // An ended chip leaves nothing behind (an empty outlined box read as clutter: qa-r3-label-clutter).
    this.hideChips(team, chips.length);
  }

  /** The team's published chip rects (one array per team under CHIP_RECTS_KEY, reused every frame). */
  private chipRects(team: number): HudRect[] {
    let all = this.scene.registry.get(CHIP_RECTS_KEY) as HudRect[][] | undefined;
    if (!all) this.scene.registry.set(CHIP_RECTS_KEY, (all = [[], []]));
    return (all[team] ??= []);
  }

  hideChips(team: number, from: number): void {
    if (from === 0) this.chipRects(team).length = 0;
    for (let i = from; i < CHIP_MAX; i++) this.chipTexts[team * CHIP_MAX + i]?.setVisible(false);
  }
}
