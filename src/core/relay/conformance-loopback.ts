import type { ConformanceAdapter, ConformanceClient, ConformanceHooks } from './conformance-kit';
import { RelayCore, type RelayOptions } from './core';
import { LoopbackSender } from './loopback';
import { InMemoryStore } from './memory-store';
import type { RelayCtx } from './store';

/** A LoopbackSender that also tells the client side about closes (as a socket would). */
class ClosingSender extends LoopbackSender {
  readonly onClose = new Map<string, (code: number) => void>();
  override close(conn: string, code: number): void {
    super.close(conn, code);
    this.onClose.get(conn)?.(code);
  }
}

export interface LoopbackConformance {
  readonly adapter: ConformanceAdapter;
  readonly hooks: ConformanceHooks;
  readonly core: RelayCore;
  readonly store: InMemoryStore;
  readonly sender: LoopbackSender;
}

/**
 * RelayCore + InMemoryStore + LoopbackSender wired as a conformance target, in process: the reference for how a backend glues its own
 * sockets (`handle` per message, `handleClose` per socket close, `sweep` on a timer). Time is a manual clock; randomness a fixed LCG.
 */
export function createLoopbackConformance(options: RelayOptions = {}): LoopbackConformance {
  const clock = { t: 1_000_000 };
  let x = 12345;
  let resting: RelayCtx['resting'];
  const ctx = (): RelayCtx => ({
    now: () => clock.t,
    randomInt: (n) => {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      return x % n;
    },
    ...(resting === undefined ? {} : { resting }),
  });
  const store = new InMemoryStore(() => clock.t);
  const sender = new ClosingSender();
  const core = new RelayCore(store, sender, options);
  let next = 0;
  const adapter: ConformanceAdapter = {
    connect(): Promise<ConformanceClient> {
      const id = `loop-${String(++next)}`;
      let open = true;
      const shut = (): void => {
        if (!open) return;
        open = false;
        void core.handleClose(id, ctx());
      };
      const client: ConformanceClient = {
        send: (bytes) => (open ? core.handle(id, bytes.slice(), ctx()) : undefined),
        sendText: (text) => (open ? core.handle(id, text, ctx()) : undefined),
        onFrame: (cb) => {
          sender.listen(id, cb);
        },
        onClose: (cb) =>
          sender.onClose.set(id, (code) => {
            cb(code);
            shut();
          }),
        close: () => {
          shut();
        },
      };
      return Promise.resolve(client);
    },
  };
  const hooks: ConformanceHooks = {
    settleMs: 0,
    timeoutMs: 100,
    setResting: (s) => {
      resting = s === null ? undefined : { retryAfterSec: s };
    },
    advanceTime: async (ms) => {
      clock.t += ms;
      await core.sweep(ctx());
    },
  };
  return { adapter, hooks, core, store, sender };
}
