import { RelayCore, decodeText, encodeText, type RelayEvent } from '../../core/relay';
import { InMemoryStore } from '../../core/relay/testing';
import type { FakeService, TestWs } from './fake-online-service';

/** Puts the real RelayCore behind the in-memory sockets of a FakeService (HTTP and tickets stay the fake's). Frames are handled as they arrive. */
export function attachRelayCore(svc: FakeService, clock: { ms: number }): { events: RelayEvent[]; acks: Array<{ conn: number; status: number }> } {
  svc.relay = undefined;
  const events: RelayEvent[] = [];
  const acks: Array<{ conn: number; status: number }> = [];
  const core = new RelayCore(new InMemoryStore(() => clock.ms), {
    send: (id, text) => {
      const i = Number(id.slice(1));
      const b = decodeText(text);
      if (b?.[0] === 0x51) acks.push({ conn: i, status: b[2] ?? -1 });
      (svc.sockets[i] as TestWs).emit('message', { data: text });
    },
    close: () => undefined,
  }, { onEvent: (e) => { events.push(e); } });
  let lcg = 7;
  const ctx = { now: () => clock.ms, randomInt: (n: number) => { lcg = (Math.imul(lcg, 1103515245) + 12345) >>> 0; return lcg % n; } };
  svc.onFrame = (ws, b) => { void core.handle(`c${String(svc.sockets.indexOf(ws as TestWs))}`, encodeText(b), ctx); };
  return { events, acks };
}
