import type Phaser from 'phaser';
import { CALLOUT_RECTS_KEY, NUMBER_SLOTS, POP_RECTS_KEY, TAG_CALL_KEY, clampNumber, clearOfPops, numberAlpha, numberLabel, numberRise, projectToHud, type ArcadeHudModel, type HudRect } from './arcade-hud';
import { styleCombatText } from './combat-text';
import { NUMBER_H_MIN } from './combo-anchor';
import { cutNumberFadeOf } from './cut-numbers';
import { hudText, type HudFlags } from './hud-ctx';

/** Arcade damage numbers: pooled texts that float up, kept on screen and clear of the live pops, call-outs, combo counters and each other (DMGNUM-1). */
export class HudNumbers {
  /** Pooled texts, created on first use: one per damage-number slot. */
  private texts: (Phaser.GameObjects.Text | undefined)[] = [];
  private serials: number[] = [];
  /** Per number slot: how far the pop/call-out solver moved it from its spot (kept while it lives, so it never jumps back). */
  private readonly shift = new Float32Array(NUMBER_SLOTS * 2);
  /** This frame's obstacles for a damage number (live pops and call-outs in Hud px, then the numbers already placed) and how many are set. */
  readonly obstacles: { x: number; y: number; w: number; h: number }[] = [];
  private obstacleCount = 0;
  /** How many leading `obstacles` are live pops and call-outs. */
  popCount = 0;
  private readonly corner = { x: 0, y: 0 };
  private readonly cleared = { x: 0, y: 0 };
  private readonly avoid: HudRect[] = [];
  private readonly projected = { x: 0, y: 0 };
  /** The tallest damage number seen this match (at least the 38 px hit size): the number lane's height. */
  numberH = NUMBER_H_MIN;

  constructor(private readonly scene: Phaser.Scene, private readonly flags: HudFlags) {}

  /** Test probe: the visible damage numbers' boxes in Hud px (origin is bottom centre). */
  boxes(): { x: number; y: number; w: number; h: number }[] {
    const out: { x: number; y: number; w: number; h: number }[] = [];
    for (const t of this.texts) if (t?.visible && t.alpha > 0) out.push({ x: t.x - t.displayWidth / 2, y: t.y - t.displayHeight, w: t.displayWidth, h: t.displayHeight });
    return out;
  }

  /** Test probe: the live white pops' and call-outs' boxes the numbers keep clear of, in Hud px. */
  popBoxes(): { x: number; y: number; w: number; h: number }[] {
    return this.obstacles.slice(0, this.popCount).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
  }

  /** Fills `obstacles` with the live white pops' and call-outs' rects (world px under POP_RECTS_KEY / CALLOUT_RECTS_KEY) projected to Hud px. */
  collectObstacles(from: HudRect | undefined, frame: HudRect): void {
    let k = 0;
    if (from) {
      const sx = frame.w / from.w;
      const sy = frame.h / from.h;
      for (const key of [POP_RECTS_KEY, CALLOUT_RECTS_KEY]) {
        const rects = this.scene.registry.get(key) as HudRect[] | undefined;
        if (!rects) continue;
        for (const w of rects) {
          const c = projectToHud(w.x, w.y, from, frame, this.corner);
          const r = (this.obstacles[k] ??= { x: 0, y: 0, w: 0, h: 0 });
          r.x = c.x;
          r.y = c.y;
          r.w = w.w * sx;
          r.h = w.h * sy;
          k++;
        }
      }
    }
    this.popCount = k;
    this.obstacleCount = k;
  }

  /** Place this frame's numbers, after the combo counters (`comboTexts`), which they keep clear of. */
  draw(model: ArcadeHudModel, from: HudRect | undefined, frame: HudRect, dim: number, comboTexts: readonly (Phaser.GameObjects.Text | undefined)[]): void {
    const reduced = this.flags.reduceMotion;
    const avoid = this.avoid;
    avoid.length = 0;
    for (const c of comboTexts) if (c?.visible) avoid.push({ x: c.x - (c.originX * c.displayWidth), y: c.y - c.originY * c.displayHeight, w: c.displayWidth, h: c.displayHeight });
    const call = this.scene.registry.get(TAG_CALL_KEY) as HudRect | undefined;
    if (call && call.w > 0) avoid.push(call);
    const total = model.numbers.length;
    // Oldest first, so a newer number moves clear of an older one and an older number never jumps.
    for (let k = 0; k < total; k++) {
      const i = (model.nextSlot + k) % total;
      const n = model.numbers[i];
      let t = this.texts[i];
      if (!n?.live) {
        t?.setVisible(false);
        continue;
      }
      // Under the status chips (102) and the round banner (110).
      t ??= this.texts[i] = hudText(this.scene, 24).setOrigin(0.5, 1).setDepth(101);
      if (this.serials[i] !== n.serial) {
        this.serials[i] = n.serial;
        this.shift[i * 2] = 0;
        this.shift[i * 2 + 1] = 0;
        // Scaled hits are grey and smaller, counters gold and labelled: never colour alone.
        styleCombatText(t.setText(numberLabel(n.amount, n.counter)), n.scaled ? 'scaled' : n.counter ? 'counter' : 'number').setFontSize(n.scaled ? 28 : 38);
      }
      const p = from ? projectToHud(n.x, n.y, from, frame, this.projected) : this.projected;
      if (!from) { p.x = n.x; p.y = n.y; }
      const baseY = p.y + numberRise(n.age, reduced);
      const halfW = t.displayWidth / 2;
      const h = t.displayHeight;
      if (h > this.numberH) this.numberH = h;
      const moved = clearOfPops(p.x + (this.shift[i * 2] ?? 0), baseY + (this.shift[i * 2 + 1] ?? 0), halfW, h, frame, this.obstacles, this.obstacleCount, this.cleared);
      this.shift[i * 2] = moved.x - p.x;
      this.shift[i * 2 + 1] = moved.y - baseY;
      const at = clampNumber(moved.x, moved.y, halfW, h, frame, avoid);
      t.setPosition(at.x, at.y).setAlpha(numberAlpha(n.age) * dim * cutNumberFadeOf(this.scene.registry, at.y - h, at.y)).setVisible(true);
      const r = (this.obstacles[this.obstacleCount] ??= { x: 0, y: 0, w: 0, h: 0 });
      r.x = at.x - halfW;
      r.y = at.y - h;
      r.w = halfW * 2;
      r.h = h;
      this.obstacleCount++;
    }
  }

  /** Scene shutdown: drop the pooled texts and per-match memory. */
  destroy(): void {
    for (const t of this.texts) t?.destroy();
    this.texts = [];
    this.serials = [];
    this.numberH = NUMBER_H_MIN;
    this.popCount = 0;
    this.obstacleCount = 0;
  }
}
