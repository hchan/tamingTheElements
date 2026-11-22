// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIM_VERSION } from '@core/index';
import type { ArenaLaunch } from '../scenes/launch';
import { OnlineClient } from '../net/ws/online-client';
import { errorFrame, Harness, matchStart, peerStatus, type TestWs } from '../../testing/net/fake-online-service';
import { FakeRelay } from '../../testing/net/fake-relay';
import { attachRelayCore } from '../../testing/net/relay-core-service';
import { ACK_STATUS, HASH_REPORT_MS, type ReportSession } from '../net/ws/match-report';
import { RESULT_DISAGREE_TEXT } from './online-quick-model';

const h$ = vi.hoisted(() => ({
  created: [] as Array<{ host: HTMLElement; launch: ArenaLaunch; destroyed: boolean }>,
}));

vi.mock('../boot/phaser-config', () => ({
  createGame: (host: HTMLElement, launch: ArenaLaunch) => {
    let once: (() => void) | undefined;
    const g = {
      host,
      launch,
      destroyed: false,
      destroy() {
        g.destroyed = true;
        queueMicrotask(() => once?.());
      },
      events: { once: (_e: string, fn: () => void) => void (once = fn) },
    };
    h$.created.push(g);
    return g;
  },
}));

import { quickMatchScreen } from './online-quick';
import { resetRestMemory } from './online-quick-model';

const WALL = 1_700_000_000_000;
const FORBIDDEN = /\b(classic|arcade|ruleset|capture|room|friend)\b/i;

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => { m.clear(); },
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, v); },
  };
}

interface Rig {
  h: Harness;
  storage: Storage;
  clients: OnlineClient[];
  mount: () => HTMLElement;
  unmounts: Array<() => void>;
}

function rig(): Rig {
  const h = new Harness();
  h.svc.simVersion = SIM_VERSION;
  h.svc.relay = new FakeRelay(h.clock, 3);
  const storage = memoryStorage();
  const clients: OnlineClient[] = [];
  const unmounts: Array<() => void> = [];
  const mount = (): HTMLElement => {
    const node = document.createElement('div');
    document.body.append(node);
    const s = quickMatchScreen({
      client: () => {
        const c = new OnlineClient(h.deps());
        clients.push(c);
        return c;
      },
      simVersion: SIM_VERSION,
      now: () => h.clock.ms,
      wallNow: () => WALL + h.clock.ms,
      after: (ms, fn) => h.after(ms, fn),
      storage,
    });
    s.mount(node);
    unmounts.push(() => { s.unmount(); });
    return node;
  };
  return { h, storage, clients, mount, unmounts };
}

const q = (n: HTMLElement, id: string): HTMLElement => {
  const e = n.querySelector<HTMLElement>(`#${id}`);
  if (!e) throw new Error(`no #${id}`);
  return e;
};
const shown = (n: HTMLElement, id: string): boolean => !q(n, id).hidden;
const click = (n: HTMLElement, id: string): void => { q(n, id).click(); };
const say = (n: HTMLElement): string => q(n, 'quickStatus').textContent;
const frames = (w: TestWs, op: number): number => w.sent.filter((m) => m[0] === op).length;

/** Advances virtual time in 50 ms steps, delivering the relay between steps. */
async function run(r: Rig, ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 50) {
    await r.h.step(50);
    r.h.svc.relay?.advance();
  }
  await r.h.flush();
}

/** Two screens matched through the queue, both Ready, the arena running on both. */
async function play(r: Rig): Promise<[HTMLElement, HTMLElement]> {
  const a = r.mount();
  const b = r.mount();
  click(a, 'quickFind');
  await r.h.flush();
  click(b, 'quickFind');
  await r.h.flush();
  r.h.svc.wire(r.h.svc.sockets[0] as TestWs, r.h.svc.sockets[1] as TestWs);
  await run(r, 100);
  click(a, 'quickReady');
  click(b, 'quickReady');
  await run(r, 3000);
  return [a, b];
}

beforeEach(() => {
  h$.created.length = 0;
  resetRestMemory();
});
afterEach(() => {
  document.body.replaceChildren();
});

describe('quick match screen', () => {
  it('Find connects and queues; Cancel leaves the queue and closes', async () => {
    const r = rig();
    const n = r.mount();
    expect(shown(n, 'quickFind')).toBe(true);
    click(n, 'quickFind');
    await r.h.flush();
    const ws = r.h.svc.sockets[0] as TestWs;
    expect(frames(ws, 0x10)).toBe(1);
    expect(shown(n, 'quickCancel')).toBe(true);
    expect(shown(n, 'quickFind')).toBe(false);
    click(n, 'quickCancel');
    expect(frames(ws, 0x11)).toBe(1);
    expect(ws.readyState).toBe(3);
    expect(shown(n, 'quickFind')).toBe(true);
    r.unmounts.forEach((u) => { u(); });
  });

  it('two screens play with the announced timing', async () => {
    const r = rig();
    r.h.svc.inputDelay = 3;
    r.h.svc.batchEvery = 2;
    await play(r);
    expect(h$.created).toHaveLength(2);
    const [x, y] = h$.created;
    expect(x?.launch.setup).toEqual(y?.launch.setup);
    expect([x?.launch.net?.side, y?.launch.net?.side]).toEqual([0, 1]);
    expect(x?.launch.net?.match).toBe(1);
    expect(x?.launch.net?.inputDelay).toBe(3);
    expect(y?.launch.net?.batchEvery).toBe(2);
    expect(x?.launch.net?.input).toBe(r.clients[0]?.transport);
    expect(y?.launch.net?.input).toBe(r.clients[1]?.transport);
    r.unmounts.forEach((u) => { u(); });
  });

  it('a service that is resting shows it, hides Find, and a remount asks nothing', async () => {
    const r = rig();
    r.h.svc.httpStatus = 503;
    r.h.svc.httpRetry = 30;
    const n = r.mount();
    click(n, 'quickFind');
    await r.h.flush();
    expect(shown(n, 'quickFind')).toBe(false);
    expect(shown(n, 'quickBack')).toBe(true);
    const fetched = r.h.svc.fetched.length;
    r.unmounts.forEach((u) => { u(); });
    const again = r.mount();
    expect(shown(again, 'quickFind')).toBe(false);
    expect(say(again)).not.toBe('');
    expect(r.h.svc.fetched).toHaveLength(fetched);
    r.unmounts.forEach((u) => { u(); });
  });

  it('a resting notice while queued shows resting', async () => {
    const r = rig();
    const n = r.mount();
    click(n, 'quickFind');
    await r.h.flush();
    (r.h.svc.sockets[0] as TestWs).serve(errorFrame(0x0b, 30));
    await r.h.flush();
    expect(shown(n, 'quickFind')).toBe(false);
    expect(shown(n, 'quickBack')).toBe(true);
    expect(shown(n, 'quickCancel')).toBe(false);
    r.unmounts.forEach((u) => { u(); });
  });

  it('a resting notice during play waits for the end of the match', async () => {
    const r = rig();
    const [a] = await play(r);
    (r.h.svc.sockets[0] as TestWs).serve(errorFrame(0x0b, 30));
    await r.h.flush();
    expect(h$.created[0]?.destroyed).toBe(false);
    expect(shown(a, 'quickLeave')).toBe(true);
    h$.created[0]?.launch.onEnd?.({ winner: 0, rounds: [2, 1] } as never);
    await r.h.flush();
    expect(shown(a, 'quickFind')).toBe(false);
    expect(shown(a, 'quickAgain')).toBe(false);
    r.unmounts.forEach((u) => { u(); });
  });

  it('a service on another protocol version asks for a reload', async () => {
    const r = rig();
    r.h.svc.serverVer = 99;
    const n = r.mount();
    click(n, 'quickFind');
    await r.h.flush();
    expect(shown(n, 'quickReload')).toBe(true);
    expect(shown(n, 'quickRetry')).toBe(false);
    r.unmounts.forEach((u) => { u(); });
  });

  it('a MATCH_START with another sim version starts no game', async () => {
    const r = rig();
    const n = r.mount();
    click(n, 'quickFind');
    await r.h.flush();
    (r.h.svc.sockets[0] as TestWs).serve(matchStart(0, 1, { simVersion: SIM_VERSION + 1 }));
    await run(r, 200);
    expect(h$.created).toHaveLength(0);
    expect(shown(n, 'quickReload')).toBe(true);
    r.unmounts.forEach((u) => { u(); });
  });

  it('an invalid input delay starts no game', async () => {
    const r = rig();
    const n = r.mount();
    click(n, 'quickFind');
    await r.h.flush();
    (r.h.svc.sockets[0] as TestWs).serve(matchStart(0, 1, { inputDelay: 99, simVersion: SIM_VERSION }));
    await run(r, 200);
    expect(h$.created).toHaveLength(0);
    expect(shown(n, 'quickRetry')).toBe(true);
    r.unmounts.forEach((u) => { u(); });
  });

  it('busy offers Try again on the same socket', async () => {
    const r = rig();
    const n = r.mount();
    click(n, 'quickFind');
    await r.h.flush();
    const ws = r.h.svc.sockets[0] as TestWs;
    ws.serve(errorFrame(8));
    await r.h.flush();
    expect(shown(n, 'quickRetry')).toBe(true);
    click(n, 'quickRetry');
    await r.h.flush();
    expect(r.h.svc.sockets).toHaveLength(1);
    expect(frames(ws, 0x10)).toBe(2);
    r.unmounts.forEach((u) => { u(); });
  });

  it('a failure shows once: the alert box, not also the status line', async () => {
    const r = rig();
    r.h.svc.refuseSockets = 2;
    const n = r.mount();
    click(n, 'quickFind');
    await r.h.flush();
    expect(shown(n, 'quickFailure')).toBe(true);
    expect(q(n, 'quickFailure').textContent).not.toBe('');
    expect(shown(n, 'quickStatus')).toBe(false);
    click(n, 'quickRetry');
    await r.h.flush();
    expect(shown(n, 'quickFailure')).toBe(false);
    expect(shown(n, 'quickStatus')).toBe(true);
    r.unmounts.forEach((u) => { u(); });
  });

  it('a refused socket fails, and Try again reaches the queue', async () => {
    const r = rig();
    r.h.svc.refuseSockets = 2;
    const n = r.mount();
    click(n, 'quickFind');
    await r.h.flush();
    expect(shown(n, 'quickRetry')).toBe(true);
    click(n, 'quickRetry');
    await r.h.flush();
    expect(shown(n, 'quickCancel')).toBe(true);
    expect(frames(r.h.svc.sockets.at(-1) as TestWs, 0x10)).toBe(1);
    r.unmounts.forEach((u) => { u(); });
  });

  it('a dropped socket while queued reconnects and queues again', async () => {
    const r = rig();
    r.h.svc.resumeSessions = false;
    const n = r.mount();
    click(n, 'quickFind');
    await r.h.flush();
    (r.h.svc.sockets[0] as TestWs).drop(1006);
    await r.h.flush();
    expect(say(n)).not.toBe('');
    await run(r, 5000);
    expect(r.h.svc.sockets.length).toBeGreaterThan(1);
    expect(frames(r.h.svc.sockets.at(-1) as TestWs, 0x10)).toBe(1);
    expect(shown(n, 'quickCancel')).toBe(true);
    r.unmounts.forEach((u) => { u(); });
  });

  it('the opponent leaving during play ends the match and stops the game', async () => {
    const r = rig();
    const [a] = await play(r);
    (r.h.svc.sockets[0] as TestWs).serve(peerStatus(1, 2));
    await r.h.flush();
    expect(h$.created[0]?.destroyed).toBe(true);
    expect(shown(a, 'quickAgain')).toBe(true);
    r.unmounts.forEach((u) => { u(); });
  });

  it('a gateway notice after the match ended leaves the end line', async () => {
    const r = rig();
    const [a] = await play(r);
    const ws = r.h.svc.sockets[0] as TestWs;
    ws.serve(peerStatus(1, 2));
    await r.h.flush();
    const end = q(a, 'quickStatus').textContent;
    ws.emit('message', { data: '{"message": "Too Many Requests"}' });
    await r.h.flush();
    expect(q(a, 'quickStatus').textContent).toBe(end);
    r.unmounts.forEach((u) => { u(); });
  });

  it('a resumed reconnect starts no second game', async () => {
    const r = rig();
    await play(r);
    (r.h.svc.sockets[0] as TestWs).drop(1006);
    await run(r, 5000);
    expect(h$.created).toHaveLength(2);
    expect(h$.created[0]?.destroyed).toBe(false);
    r.unmounts.forEach((u) => { u(); });
  });

  it('leaving while still connecting sends no queue request', async () => {
    const r = rig();
    const n = r.mount();
    click(n, 'quickFind');
    r.unmounts.forEach((u) => { u(); });
    await r.h.flush();
    expect(r.h.svc.sockets.every((s) => frames(s, 0x10) === 0)).toBe(true);
    expect(n.isConnected).toBe(true);
    expect(n.querySelector('#quickFind')).toBeNull();
  });

  it('leaving during play stops the game and closes normally', async () => {
    const r = rig();
    await play(r);
    r.unmounts[0]?.();
    await r.h.flush();
    expect(h$.created[0]?.destroyed).toBe(true);
    expect((r.h.svc.sockets[0] as TestWs).readyState).toBe(3);
    r.unmounts.forEach((u) => { u(); });
  });

  it('has a gold primary with a subline, quiet Cancel and Leave, and one Back link', () => {
    const r = rig();
    const n = r.mount();
    expect(n.querySelector('.menuPage.onlineScreen')).not.toBeNull();
    const find = q(n, 'quickFind');
    expect(find.getAttribute('aria-label')).toBe('Find an opponent');
    expect(find.dataset.sub).toBeTruthy();
    const sub = n.querySelector(`#${find.getAttribute('aria-describedby') ?? 'none'}`);
    expect(sub?.textContent).toBe(find.dataset.sub);
    expect(find.classList.contains('onlinePrimary')).toBe(true);
    expect(q(n, 'quickCancel').classList.contains('onlineQuiet')).toBe(true);
    expect(q(n, 'quickLeave').classList.contains('onlineQuiet')).toBe(true);
    const back = n.querySelector('a.menuLink');
    expect(back?.getAttribute('href')).toBe('#main');
    expect(n.querySelectorAll('a.menuLink')).toHaveLength(1);
    for (const b of n.querySelectorAll<HTMLElement>('[data-sub]')) expect(b.dataset.sub).not.toMatch(FORBIDDEN);
    r.unmounts.forEach((u) => { u(); });
  });

  it('never shows the words players must not see', async () => {
    const r = rig();
    const [a] = await play(r);
    expect(a.textContent).not.toMatch(FORBIDDEN);
    (r.h.svc.sockets[0] as TestWs).serve(peerStatus(1, 0));
    await r.h.flush();
    expect(a.textContent).not.toMatch(FORBIDDEN);
    const n = r.mount();
    click(n, 'quickFind');
    await r.h.flush();
    (r.h.svc.sockets.at(-1) as TestWs).serve(errorFrame(8));
    await r.h.flush();
    expect(n.textContent).not.toMatch(FORBIDDEN);
    r.unmounts.forEach((u) => { u(); });
  });
});

/** The same two screens, but the service behind the sockets is the real RelayCore over an in-memory store (not the FakeRelay). */
function relayRig(): Rig & ReturnType<typeof attachRelayCore> {
  const r = rig();
  return { ...r, ...attachRelayCore(r.h.svc, r.h.clock) };
}

/** What the arena would hand the screen: a session that has one checkpoint (tick 50) with `hash`, ended at tick 120. */
const sessionWith = (hash: number, extra: Partial<ReportSession> = {}): ReportSession => ({
  simTick: 120,
  forfeitReason: undefined,
  desync: undefined,
  checkpoints: () => [[50, hash]],
  hashAt: (t) => (t === 120 ? 999 : undefined),
  ...extra,
});
const statusOf = (i: number, s: ReportSession): void => {
  h$.created[i]?.launch.net?.onStatus?.(s.desync === undefined ? 'running' : 'desync', s as never);
};
const endOf = (i: number, winner: number): void => {
  h$.created[i]?.launch.onEnd?.({ winner, activeSlot: 0, capturedIndices: [] });
};
const count = (r: Rig, i: number, op: number): number => frames(r.h.svc.sockets[i] as TestWs, op);

describe('online result reporting (RelayCore)', () => {
  it('sends HASH about once a second and one RESULT at the end; both get RESULT_ACK 0', async () => {
    const r = relayRig();
    await play(r);
    expect(h$.created).toHaveLength(2);
    for (const i of [0, 1]) statusOf(i, sessionWith(111));
    await run(r, 100);
    expect(count(r, 0, 0x41)).toBe(1);
    // Inside HASH_REPORT_MS no second HASH (only one checkpoint exists anyway).
    await run(r, HASH_REPORT_MS);
    for (const i of [0, 1]) statusOf(i, sessionWith(111));
    expect(count(r, 0, 0x41)).toBe(1);
    for (const i of [0, 1]) endOf(i, 0);
    await run(r, 200);
    expect([count(r, 0, 0x50), count(r, 1, 0x50)]).toEqual([1, 1]);
    expect(r.acks.filter((a) => a.status === ACK_STATUS.agreed).map((a) => a.conn).sort()).toEqual([0, 1]);
    expect(r.events.find((e) => e.kind === 'result')).toMatchObject({ agreed: true, winner: 0, ticks: 120, finalHash: 999 });
    // The ack stopped the resend.
    await run(r, 2000);
    expect([count(r, 0, 0x50), count(r, 1, 0x50)]).toEqual([1, 1]);
    r.unmounts.forEach((u) => { u(); });
  });

  it('different hashes at one checkpoint give RESULT_ACK 2 to both and offer the report', async () => {
    const r = relayRig();
    const [a, b] = await play(r);
    statusOf(0, sessionWith(111));
    statusOf(1, sessionWith(222));
    await run(r, 200);
    expect(r.acks.map((x) => x.status)).toEqual([ACK_STATUS.disagreed, ACK_STATUS.disagreed]);
    for (const n of [a, b]) {
      expect(say(n)).toBe(RESULT_DISAGREE_TEXT);
      expect(shown(n, 'quickReport')).toBe(true);
    }
    r.unmounts.forEach((u) => { u(); });
  });

  it('a desync the session found is sent as DESYNC once, then RESULT, and the answer stops the resend', async () => {
    const r = relayRig();
    await play(r);
    const bad = sessionWith(111, { desync: { tick: 50, local: 111, remote: 222 } });
    statusOf(0, bad);
    statusOf(0, bad);
    await run(r, 100);
    expect([count(r, 0, 0x42), count(r, 0, 0x50)]).toEqual([1, 1]);
    expect(r.events.find((e) => e.kind === 'desync')).toMatchObject({ tick: 50, by: 0 });
    await run(r, 2000);
    // The peer sent nothing, so the ACK says "waiting" (1): the 500 ms resend stops, and the slow re-poll (RESULT_REPOLL_MS) sends RESULT once more.
    expect([count(r, 0, 0x42), count(r, 0, 0x50)]).toEqual([1, 2]);
    r.unmounts.forEach((u) => { u(); });
  });
});
