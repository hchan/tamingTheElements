import type Phaser from 'phaser';
import { Cmd, type Command } from '@core/index';

/**
 * View-only feedback for a swap press the sim will refuse (FUN-DESIGN 2.6): a line of text above the action bar, never
 * colour alone. The sim has no refusal event, so the reason is read from the render view just before the press is sent.
 * Pure part (`swapNotice`) plus a small Phaser text (`SwapNotice`); it never writes to the sim.
 */

/** What the view says about the pressed swap. `cooldownTicks` is the game ticks left on the team's swap cooldown. */
export interface SwapState {
  /** False outside the round's fight phase (countdown, round end). */
  readonly fighting: boolean;
  /** The active hero is frozen (Classic status), so it cannot swap. */
  readonly frozen: boolean;
  readonly stunned: boolean;
  /** The pressed slot has no living hero to bring in. */
  readonly noPartner: boolean;
  readonly cooldownTicks: number;
}

/** Index of the first swap bit set in `cmd` (0..3), or -1. */
export function swapSlotOf(cmd: Command): number {
  return [Cmd.swap1, Cmd.swap2, Cmd.swap3, Cmd.swap4].findIndex((b) => (cmd & b) !== 0);
}

/** Seconds as the tag word shows them ("2.4s"), rounded up to a tenth so the line never reads ready early. */
export const swapSeconds = (ticks: number): string => `${(Math.ceil(ticks / 5) / 10).toFixed(1)}s`;

/** The refusal line for a swap press, or undefined when nothing the view can see would refuse it. */
export function swapNotice(s: SwapState): string | undefined {
  if (s.noPartner) return "Can't swap: no partner to tag in";
  if (!s.fighting) return "Can't swap: round not started";
  if (s.frozen) return "Can't swap: frozen";
  if (s.stunned) return "Can't swap: stunned";
  if (s.cooldownTicks > 0) return `Swap ready in ${swapSeconds(s.cooldownTicks)}`;
  return undefined;
}

/** How long the line stays up (ms) and how much of that it fades over. */
export const NOTICE_MS = 1600;
const FADE_MS = 300;

/** The line's alpha `age` ms after it was shown: steady, then a fade out (no fade with reduced motion). */
export function noticeAlpha(age: number, reduced: boolean): number {
  if (age >= NOTICE_MS) return 0;
  if (reduced || age < NOTICE_MS - FADE_MS) return 1;
  return (NOTICE_MS - age) / FADE_MS;
}

/** The text object: one per Arena, made once, above the action bar's left end. */
export class SwapNotice {
  private readonly text: Phaser.GameObjects.Text;
  private shownAt = -Infinity;

  constructor(scene: Phaser.Scene, private readonly reduced: () => boolean, private readonly place?: () => { x: number; y: number; scale: number }) {
    this.text = scene.add
      .text(4, 604, '', {
        fontSize: '22px', fontStyle: 'bold', color: '#ffe066', stroke: '#000000', strokeThickness: 5,
        resolution: scene.scale.width / 1280,
      })
      .setOrigin(0, 1)
      .setDepth(103)
      .setVisible(false);
  }

  show(line: string, now: number): void {
    this.shownAt = now;
    this.text.setText(line).setAlpha(1).setVisible(true);
  }

  update(now: number): void {
    if (!this.text.visible) return;
    const box = this.place?.();
    if (box) this.text.setPosition(box.x + 4 * box.scale, box.y + 604 * box.scale).setScale(box.scale);
    const a = noticeAlpha(now - this.shownAt, this.reduced());
    if (a <= 0) this.text.setVisible(false);
    else this.text.setAlpha(a);
  }

  /** The line while it shows ('' otherwise), for the test probe. */
  get current(): string {
    return this.text.visible ? this.text.text : '';
  }

  destroy(): void {
    this.text.destroy();
  }
}
