import { PLAY_AGAIN_ACK_WAIT_MS, RESULT_REPOLL_CAP_MS, RESULT_REPOLL_MS, RETRY_MS, type WebSocketTransport } from './transport';

/**
 * Client-owned RESULT timers (not the arena's session.update, so they survive arena teardown and desync stops).
 * `begin` (RESULT sent): every RETRY_MS the transport retry is ticked until an ACK. ACK 1 (waiting): the transport retry stops and RESULT is
 * re-sent every RESULT_REPOLL_MS until ACK 0/2 or RESULT_REPOLL_CAP_MS. `stop` ends everything; nothing is sent after it.
 * A lobby action (Play again) is held back by `defer` until the first ACK or PLAY_AGAIN_ACK_WAIT_MS.
 */
export class ResultPoll {
  private active = false;
  private timer: (() => void) | undefined;
  private since = 0;
  private held: (() => void) | undefined;
  private cancelHeld: (() => void) | undefined;

  constructor(
    private readonly transport: WebSocketTransport,
    private readonly d: { readonly now: () => number; readonly after: (ms: number, fn: () => void) => () => void },
  ) {}

  /** RESULT sent and not yet answered by ACK 0/2. */
  get open(): boolean { return this.active; }

  begin(): void {
    this.timer?.();
    this.active = true;
    const pump = (): void => {
      if (!this.active) return;
      this.transport.tick();
      this.timer = this.d.after(RETRY_MS, pump);
    };
    this.timer = this.d.after(RETRY_MS, pump);
  }

  /** RESULT_ACK for the current match: status 1 keeps polling (unless an action waits, which then runs), 0/2 ends it. */
  onAck(status: number): void {
    if (status === 1 && this.active && this.held === undefined) this.waiting();
    else {
      this.stop();
      this.held?.();
    }
  }

  /** Runs `action` now, or (while RESULT is unanswered) after the first ACK or PLAY_AGAIN_ACK_WAIT_MS; a newer action replaces an older one. */
  defer(action: () => void): void {
    if (!this.active) { action(); return; }
    this.dropHeld();
    const go = (): void => {
      this.dropHeld();
      this.stop();
      action();
    };
    this.held = go;
    this.cancelHeld = this.d.after(PLAY_AGAIN_ACK_WAIT_MS, go);
  }

  stop(): void {
    this.active = false;
    this.since = 0;
    this.timer?.();
    this.timer = undefined;
  }

  /** A new match or the end: nothing is sent or run any more. */
  reset(): void {
    this.stop();
    this.dropHeld();
  }

  private waiting(): void {
    this.timer?.();
    this.transport.stopRetry();
    if (this.since === 0) this.since = this.d.now() || 1;
    const poll = (): void => {
      if (!this.active) return;
      if (this.d.now() - this.since >= RESULT_REPOLL_CAP_MS) { this.stop(); return; }
      this.transport.resendResult();
      this.timer = this.d.after(RESULT_REPOLL_MS, poll);
    };
    this.timer = this.d.after(RESULT_REPOLL_MS, poll);
  }

  private dropHeld(): void {
    this.cancelHeld?.();
    this.cancelHeld = this.held = undefined;
  }
}
