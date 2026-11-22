import { describe, expect, it } from 'vitest';
import { FakeRelay } from '../../src/testing/net/fake-relay';
import { Harness, peerStatus, resultAck, type TestWs } from '../../src/testing/net/fake-online-service';
import { decodeText } from '../../src/game/net/ws/text-codec';
import { SIM_VERSION } from '../../src/core/version';
import { BATCH_GAP_MS, CHAT_BURST, CHAT_BURST_GAP_MS, CHAT_BURST_SIZE, CHAT_IDLE_BEFORE_BURST_MS, CHAT_PACED_PER_SIDE, CHAT_RATE_PER_SEC, GRANT_FRAMES_PER_SEC, SCENARIO_FRAMES_PER_SEC, SCENARIO_FRAMES_PER_SIDE } from '../../tools/live-match-constants';
import { RelayCore, encodeText as relayEncode } from '../../src/core/relay';
import { InMemoryStore } from '../../src/core/relay/testing';
import { badVersion, HELP, runPaired, SCENARIOS, type MatchEv, type Peer, type Rig } from '../../tools/live-match-scenarios';
import { main } from '../../tools/live-match';

describe('live-match constants and flags', () => {
  it('keeps pacing and budgets under the frames/s grant', () => {
    expect(SCENARIO_FRAMES_PER_SEC * 2).toBeLessThanOrEqual(GRANT_FRAMES_PER_SEC); // even if the grant were per match
    expect(SCENARIO_FRAMES_PER_SIDE).toBeLessThanOrEqual(25);
    expect(BATCH_GAP_MS).toBeGreaterThanOrEqual(100);
  });
  it('--help lists every scenario and needs no address; unknown or combined flags are config errors', async () => {
    for (const s of SCENARIOS) expect(HELP).toContain(`--${s}`);
    const lines: string[] = [];
    process.argv = ['node', 'live-match', '--help'];
    expect(await main({}, (l) => lines.push(l))).toBe(0);
    expect(lines.join('\n')).toBe(HELP);
    process.argv = ['node', 'live-match', '--bogus'];
    expect(await main({ TTE_RELAY_URL: 'https://relay.example.invalid' }, (l) => lines.push(l))).toBe(2);
    process.argv = ['node', 'live-match', '--resume', '--gone'];
    expect(await main({ TTE_RELAY_URL: 'https://relay.example.invalid' }, (l) => lines.push(l))).toBe(2);
  });
});

async function setup(core?: { chat: boolean }): Promise<{ h: Harness; a: Peer; b: Peer; wa: TestWs; wb: TestWs; m: MatchEv; rig: Rig; steps: string[] }> {
  const h = new Harness();
  if (core === undefined) h.svc.relay = new FakeRelay(h.clock, 1);
  else {
    // The in-repo RelayCore behind the in-memory sockets (as src/testing/net/relay-core-service.ts, but with chat switchable).
    const rc = new RelayCore(new InMemoryStore(() => h.clock.ms), { send: (id, text) => { (h.svc.sockets[Number(id.slice(1))] as TestWs).emit('message', { data: text }); }, close: () => undefined }, { chat: core.chat });
    let lcg = 7;
    const ctx = { now: () => h.clock.ms, randomInt: (n: number) => { lcg = (Math.imul(lcg, 1103515245) + 12345) >>> 0; return lcg % n; } };
    h.svc.onFrame = (ws, bytes) => { void rc.handle(`c${String(h.svc.sockets.indexOf(ws as TestWs))}`, relayEncode(bytes), ctx); };
  }
  const a = { name: 'A', ...h.client() };
  const b = { name: 'B', ...h.client() };
  const ra = a.c.connect(); await h.flush();
  const rb = b.c.connect(); await h.flush();
  await ra; await rb;
  const [wa, wb] = [h.svc.sockets[0] as TestWs, h.svc.sockets[1] as TestWs];
  h.svc.wire(wa, wb);
  a.c.joinQueue(); b.c.joinQueue(); await h.flush();
  if (core !== undefined) await h.step(10);
  const m = a.events.find((e): e is MatchEv => e.t === 'match') as MatchEv;
  const steps: string[] = [];
  const rig: Rig = {
    sleep: async (ms) => { await h.step(ms); h.svc.relay?.advance(); await h.flush(); },
    now: () => h.clock.ms,
    step: (l) => { steps.push(l); },
    drop: (p) => {
      if (p !== a) return;
      wa.drop(1006);
      wb.serve(peerStatus(m.matchId, 0));
      h.after(500, () => { wb.serve(peerStatus(m.matchId, 1)); });
    },
    leave: (p) => { p.c.close(); wb.serve(peerStatus(m.matchId, 2)); },
    raw: (p, text) => { const bytes = decodeText(text); if (bytes !== undefined) h.svc.onFrame(p === a ? wa : wb, bytes); },
    spawn: (name, v) => { const c = new (a.c.constructor as new (d: unknown) => Peer['c'])(h.deps(true, { simVersion: v })); const events: Peer['events'] = []; c.onEvent = (e) => { events.push(e); }; return { name, c, events }; },
  };
  return { h, a, b, wa, wb, m, rig, steps };
}

describe('live-match scenarios against FakeRelay', () => {
  it('resume: A drops, reconnects resumed, B sees disconnected then back, batches flow again', async () => {
    const { rig, a, b, m, steps } = await setup();
    expect(await runPaired('resume', rig, a, b, m)).toBe(true);
    expect(steps.join('\n')).toMatch(/A reconnected=true resumed-match=true B saw disconnected=true back=true/);
  });
  it('gone: B sees the peer gone', async () => {
    const { rig, a, b, m } = await setup();
    expect(await runPaired('gone', rig, a, b, m)).toBe(true);
  });
  it('rematch: a second matchId on the same sockets', async () => {
    const { rig, a, b, m, wa, wb } = await setup();
    const t = runPaired('rematch', rig, a, b, m);
    await rig.sleep(1500);
    wa.serve(resultAck(m.matchId)); wb.serve(resultAck(m.matchId));
    expect(await t).toBe(true);
    expect(a.events.filter((e) => e.t === 'match').map((e) => e.matchId)).toEqual([1, 2]);
  });
  it('disagree: reports and survives', async () => {
    const { rig, a, b, m, wa, wb, steps } = await setup();
    const t = runPaired('disagree', rig, a, b, m);
    await rig.sleep(4000);
    wa.serve(resultAck(m.matchId)); wb.serve(resultAck(m.matchId));
    expect(await t).toBe(true);
    expect(steps.some((s) => s.startsWith('disagree: A events='))).toBe(true);
  });
  it('malformed: the link survives junk and carries later batches', async () => {
    const { rig, a, b, m, steps } = await setup();
    expect(await runPaired('malformed', rig, a, b, m)).toBe(true);
    expect(steps.join('\n')).toContain('alive=true');
  });
  it('bad-version: a refused protocol is update-needed; an accepting relay is only reported', async () => {
    const x = await setup();
    expect(await badVersion(x.rig, SIM_VERSION)).toBe(true);
    expect(x.steps.join('\n')).toContain('bad-version: connected');
    const y = await setup();
    y.h.svc.serverVer = 99;
    expect(await badVersion(y.rig, SIM_VERSION)).toBe(true);
    expect(y.steps.join('\n')).toContain('kind=update-needed');
  });
  it('a scenario cannot exceed its per-side frame budget', async () => {
    const { rig, a, b, m } = await setup();
    await expect((async () => { for (let i = 0; i < 6; i++) await runPaired('malformed', rig, a, b, m); })()).rejects.toThrow(/frame budget/);
  });
});

describe('live-match --chat against the in-repo RelayCore', () => {
  it('chat constants: lines stay under the frame budget and the grant; the idle refills the bucket', () => {
    expect(CHAT_PACED_PER_SIDE + 1 + 1 + CHAT_BURST_SIZE).toBeLessThanOrEqual(SCENARIO_FRAMES_PER_SIDE); // paced + RESULT + one after it + burst
    expect(2 * (1000 / CHAT_BURST_GAP_MS)).toBeLessThanOrEqual(GRANT_FRAMES_PER_SEC);
    expect(CHAT_IDLE_BEFORE_BURST_MS).toBeGreaterThanOrEqual((CHAT_BURST * 1000) / CHAT_RATE_PER_SEC);
    expect(CHAT_BURST_SIZE).toBeGreaterThan(CHAT_BURST);
  });
  it('chat on: lines forward, the burst is refused in part, no close, RESULT agreed, peak rate reported', async () => {
    const { rig, a, b, m, steps } = await setup({ chat: true });
    expect(a.c.chatSupported()).toBe(true);
    expect(await runPaired('chat', rig, a, b, m)).toBe(true);
    const log = steps.join('\n');
    expect(log).toMatch(/chat: A->B paced 5\/5 after-result 1\/1 ok=true/);
    expect(log).toMatch(/chat: burst A delivered \d+ refused \d+/);
    expect(log).toMatch(/chat: peak \d+ frames\/s/);
    expect(log).not.toMatch(/SKIPPED/);
    expect(a.events.some((e) => e.t === 'closed') || b.events.some((e) => e.t === 'closed')).toBe(false);
  });
  it('chat on: the log never carries line text', async () => {
    const { rig, a, b, m, steps } = await setup({ chat: true });
    await runPaired('chat', rig, a, b, m);
    expect(steps.join('\n')).not.toMatch(/line [AB]/i);
  });
  it('chat off: skipped with a clear message, nothing sent', async () => {
    const { rig, a, b, m, steps } = await setup({ chat: false });
    expect(a.c.chatSupported()).toBe(false);
    expect(await runPaired('chat', rig, a, b, m)).toBe(true);
    expect(steps.join('\n')).toMatch(/chat: SKIPPED.*chat is off/);
    expect(steps.join('\n')).not.toMatch(/peak/);
  });
});
