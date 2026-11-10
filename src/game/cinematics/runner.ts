/** Phaser-free, data-driven cinematic sequencer. The scene feeds it elapsed time and key presses. */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface TweenTarget extends Partial<Rect> {
  readonly alpha?: number;
  /** Added to the current rotation, in degrees. */
  readonly spin?: number;
}

export type CinematicStep =
  | { readonly kind: 'background'; readonly key: string }
  | { readonly kind: 'header'; readonly text: string; readonly ms: number }
  | { readonly kind: 'caption'; readonly text: string }
  | { readonly kind: 'sprite'; readonly id: string; readonly key: string; readonly rect: Rect; readonly alpha: number }
  /** Starts a tween and moves on at once; pair with `wait` to block. */
  | { readonly kind: 'tween'; readonly id: string; readonly to: TweenTarget; readonly ms: number }
  | { readonly kind: 'wait'; readonly ms: number }
  | { readonly kind: 'waitKey' };

export interface CinematicSink {
  background(key: string): void;
  header(text: string): void;
  /** Called when the header time is up. */
  headerDone(): void;
  caption(text: string): void;
  sprite(id: string, key: string, rect: Rect, alpha: number): void;
  tween(id: string, to: TweenTarget, ms: number): void;
  /** Called once, when the script ends or is skipped. */
  done(skipped: boolean): void;
}

export type CinematicScript = readonly CinematicStep[];

/** Runs steps in order; `header`, `wait` and `waitKey` block, everything else completes instantly. */
export class CinematicRunner {
  private index = 0;
  private remaining = 0;
  private waitingKey = false;
  private blocking: 'header' | 'wait' | undefined;
  private finished = false;

  constructor(
    private readonly script: CinematicScript,
    private readonly sink: CinematicSink,
  ) {
    this.pump();
  }

  get isDone(): boolean {
    return this.finished;
  }

  /** Advances by elapsed milliseconds (the scene's update delta; cosmetic time only). */
  advance(dtMs: number): void {
    if (this.finished || this.waitingKey || this.blocking === undefined) return;
    this.remaining -= dtMs;
    if (this.remaining > 0) return;
    if (this.blocking === 'header') this.sink.headerDone();
    this.blocking = undefined;
    this.pump();
  }

  /** Any key: releases a `waitKey` step. */
  key(): void {
    if (this.finished || !this.waitingKey) return;
    this.waitingKey = false;
    this.pump();
  }

  /** Skip button: jumps to the end. */
  skip(): void {
    this.finish(true);
  }

  private finish(skipped: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.sink.done(skipped);
  }

  private pump(): void {
    while (!this.finished && !this.waitingKey && this.blocking === undefined) {
      const step = this.script[this.index++];
      if (!step) {
        this.finish(false);
        return;
      }
      switch (step.kind) {
        case 'background':
          this.sink.background(step.key);
          break;
        case 'header':
          this.sink.header(step.text);
          this.blocking = 'header';
          this.remaining = step.ms;
          break;
        case 'caption':
          this.sink.caption(step.text);
          break;
        case 'sprite':
          this.sink.sprite(step.id, step.key, step.rect, step.alpha);
          break;
        case 'tween':
          this.sink.tween(step.id, step.to, step.ms);
          break;
        case 'wait':
          this.blocking = 'wait';
          this.remaining = step.ms;
          break;
        case 'waitKey':
          this.waitingKey = true;
          break;
      }
    }
  }
}
