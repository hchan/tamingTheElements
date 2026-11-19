import type Phaser from 'phaser';
import { RoundPhase, type RenderArcade, type RenderView } from '../../core';
import type { Announcer } from '../a11y/announcer';
import { SWAP_BUSY_LINE, SWAP_BUSY_TICKS, SwapNotice, busySwapDue, elementalNotice, swapRefusalLine, swapSlotOf } from '../hud/swap-notice';
import { screenBox } from '../hud/screen-box';
import { getPrefs } from '../platform/a11y/prefs';
import { actionRefusal, chargeLineFor, runLineFor } from './arena-logic';

/** What the feedback reads from its scene; getters, because these are created after the scene is. View only. */
export interface SwapFeedbackContext {
  readonly scene: Phaser.Scene;
  readonly view: () => RenderView | undefined;
  readonly audio: () => { audio: unknown } | undefined;
  readonly announcer: () => Announcer | undefined;
  readonly inputDelay: () => number;
}

/** Arcade: the refusal lines for swap, Super and Weather presses (hud/swap-notice.ts), with the pending-swap state. */
export class SwapFeedback {
  private readonly notice: SwapNotice;
  /** The game tick of a swap press nothing visible explained, until a tag-in lands (else the busy line shows); -1 none. */
  private pendingSwap = -1;

  constructor(private readonly ctx: SwapFeedbackContext) {
    this.notice = new SwapNotice(ctx.scene, () => getPrefs().reduceMotion, () => screenBox(ctx.scene));
  }

  /** The line currently shown ('' when none). */
  get current(): string { return this.notice.current; }

  destroy(): void { this.notice.destroy(); }

  update(now: number): void { this.notice.update(now); }

  /** A tag-in landed: the swap-refused line (if one is still up) is stale, and would sit under the arriving hero's banner. */
  clearOnTagIn(): void {
    this.notice.clear();
    this.pendingSwap = -1;
  }

  private refuseSound(): void {
    (this.ctx.audio()?.audio as { refuse?: () => void } | undefined)?.refuse?.();
  }

  /** Arcade: explains a swap press the sim is about to refuse, from the sim's own rules (`RenderArcade.swapBlock`). View only. */
  noteSwap(swaps: number): void {
    const view = this.ctx.view();
    const arcade = view?.arcade();
    const bar = view?.actionBar(0);
    if (!view || !arcade || !bar) return;
    // A hit-stop skips the swap on this tick but the press is sent again, so it is not a refusal.
    if (arcade.frozen) return;
    const line = swapRefusalLine(arcade.swapBlock(0, swapSlotOf(swaps)), bar.swapReadyTick - bar.tick);
    if (line !== undefined) {
      this.notice.show(line, this.ctx.scene.time.now);
      this.refuseSound();
    } else if (this.pendingSwap < 0) {
      // Only `busy` refuses it (block-stun, a dash or its recovery, a charge, hard crowd control, a super, weather
      // recovery), or a dash, charge or weather cast this same press starts will: if no tag-in follows, say so.
      this.pendingSwap = arcade.gameTick;
    }
  }

  /** A swap the sim has not taken SWAP_BUSY_TICKS game ticks after the press (plus the online input delay; hit-stop does not count): say so. */
  checkBusySwap(gameTick: number | undefined): void {
    if (gameTick === undefined || !busySwapDue(this.pendingSwap, gameTick, SWAP_BUSY_TICKS + this.ctx.inputDelay())) return;
    this.pendingSwap = -1;
    this.notice.show(SWAP_BUSY_LINE, this.ctx.scene.time.now);
    this.refuseSound();
  }

  /** Arcade: says why a Super or Weather press does nothing yet (meter or weather charge not full). View only. */
  noteAction(bits: number): void {
    const view = this.ctx.view();
    const arcade = view?.arcade();
    if (!arcade || arcade.phase !== RoundPhase.fight || arcade.frozen) return;
    const line = actionRefusal(
      bits,
      { phase: arcade.phase, frozen: arcade.frozen, meter0: arcade.meter[0], weatherCharge0: arcade.weatherCharge[0] },
      () => this.chargeLine(arcade),
      () => {
        const bar = this.ctx.view()?.actionBar(0);
        return bar ? elementalNotice(true, bar.tick, bar.elemental) : undefined;
      },
      () => { const v = this.ctx.view(); return v ? runLineFor(v, arcade) : undefined; },
    );
    if (line === undefined) return;
    this.notice.show(line, this.ctx.scene.time.now);
    this.ctx.announcer()?.say({ key: `refusal ${line}`, text: line, important: false, transient: true });
    this.refuseSound();
  }

  /** Arcade: the reason a Charge press does nothing (ranged hero, cooldown, stun, root, guard), or undefined. View only. */
  private chargeLine(arcade: RenderArcade): string | undefined {
    const view = this.ctx.view();
    return view ? chargeLineFor(view, arcade) : undefined;
  }
}
