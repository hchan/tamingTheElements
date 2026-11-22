// Scenario flags of tools/live-match.ts (--resume --gone --rematch --disagree --bad-version --malformed). Each runs after the normal pairing,
// sends at most SCENARIO_FRAMES_PER_SIDE frames per side, never faster than BATCH_GAP_MS, and reports what the relay did. All time and
// socket access goes through `Rig`, so tests/repo/live-match.test.ts runs the same code against FakeRelay on a virtual clock.
import { encodePacket } from '../src/core/net/packet';
import { encodeText } from '../src/game/net/ws/text-codec';
import type { ChatIn, ChatRefused, OnlineClient, OnlineEvent } from '../src/game/net/ws/online-client';
import { RateCounter } from './live-rate';
import { BAD_SIM_VERSION_OFFSET, BATCH_GAP_MS, CHAT_BURST, CHAT_BURST_GAP_MS, CHAT_BURST_SIZE, CHAT_GAP_MS, CHAT_IDLE_BEFORE_BURST_MS, CHAT_PACED_PER_SIDE, DISAGREE_HASHES, DISAGREE_TICK, DRAIN_MAX_MS, GONE_MARGIN_MS, GRANT_FRAMES_PER_SEC, PEER_GRACE_MS, REACTION_WAIT_MS, SCENARIO_FRAMES_PER_SIDE, STEP_TIMEOUT_MS } from './live-match-constants';

export const SCENARIOS = ['resume', 'gone', 'rematch', 'disagree', 'bad-version', 'malformed', 'chat'] as const;
export type Scenario = (typeof SCENARIOS)[number];
export interface Peer { readonly name: string; readonly c: OnlineClient; readonly events: OnlineEvent[] }
export type MatchEv = Extract<OnlineEvent, { t: 'match' }>;
export interface Rig {
  sleep(ms: number): Promise<void>;
  now(): number;
  step(line: string): void;
  /** Breaks the peer's current socket without a clean close (the client then reconnects by itself). */
  drop(p: Peer): void;
  /** The peer leaves for good (clean close). */
  leave(p: Peer): void;
  /** Sends `text` as-is on the peer's current socket (it need not be a valid frame). */
  raw(p: Peer, text: string): void;
  /** A fresh, unconnected peer announcing `simVersion` in its HELLO. */
  spawn(name: string, simVersion: number): Peer;
}

const sent = new WeakMap<Peer, number>();
/** Client-sent frames of every scenario on this rig, by time (both sides together: the 150/s grant is a total). */
const rates = new WeakMap<Rig, RateCounter>();
const rateOf = (rig: Rig): RateCounter => { let r = rates.get(rig); if (r === undefined) { r = new RateCounter(); rates.set(rig, r); } return r; };
/** Every frame a scenario sends goes through here: the per-side budget is enforced, the send time is recorded, then one gap is paced. */
async function sendCounted(rig: Rig, p: Peer, send: () => void, gapMs = BATCH_GAP_MS): Promise<void> {
  const n = (sent.get(p) ?? 0) + 1;
  if (n > SCENARIO_FRAMES_PER_SIDE) throw new Error(`frame budget exceeded on ${p.name} (${String(SCENARIO_FRAMES_PER_SIDE)})`);
  sent.set(p, n);
  rateOf(rig).record(rig.now());
  send();
  await rig.sleep(gapMs);
}
const sendBatch = (rig: Rig, p: Peer, m: MatchEv, i: number): Promise<void> => sendCounted(rig, p, () => { p.c.transport.send(encodePacket({ match: m.matchId, flags: 0, ack: 0, firstTick: i, inputs: [], hashes: [] })); });
const pump = (p: Peer): number => { let n = 0; while (p.c.transport.receive() !== undefined) n++; return n; };
const count = (p: Peer, t: OnlineEvent['t']): number => p.events.filter((e) => e.t === t).length;

async function until(rig: Rig, label: string, ms: number, f: () => boolean): Promise<boolean> {
  const end = rig.now() + ms;
  while (!f()) {
    if (rig.now() >= end) { rig.step(`no ${label} within ${String(ms)} ms`); return false; }
    await rig.sleep(50);
  }
  return true;
}

async function exchange(rig: Rig, a: Peer, b: Peer, m: MatchEv, from: number, n: number): Promise<{ A: number; B: number }> {
  const got = { A: 0, B: 0 };
  for (let i = from; i < from + n; i++) {
    await sendBatch(rig, a, m, i);
    await sendBatch(rig, b, m, i);
    got.A += pump(a); got.B += pump(b);
  }
  await rig.sleep(BATCH_GAP_MS);
  got.A += pump(a); got.B += pump(b);
  return got;
}

async function resume(rig: Rig, a: Peer, b: Peer, m: MatchEv): Promise<boolean> {
  const first = await exchange(rig, a, b, m, 0, 5);
  rig.step(`resume: before the drop A got ${String(first.A)}, B got ${String(first.B)}`);
  rig.drop(a);
  const back = await until(rig, 'A reconnected', PEER_GRACE_MS + 5000, () => a.events.some((e) => e.t === 'reconnected'));
  const resumedEv = (): OnlineEvent | undefined => a.events.find((e) => e.t === 'match' && e.resumed);
  await until(rig, 'resumed MATCH_START on A', REACTION_WAIT_MS, () => resumedEv() !== undefined); // It follows WELCOME in a later frame, so `reconnected` alone is too early.
  const again = resumedEv();
  const ev = (s: string): boolean => b.events.some((e) => e.t === 'peer' && e.status === s);
  await until(rig, 'peer back on B', PEER_GRACE_MS, () => ev('back'));
  rig.step(`resume: A reconnected=${String(back)} resumed-match=${String(again !== undefined)} B saw disconnected=${String(ev('disconnected'))} back=${String(ev('back'))}`);
  const next = await exchange(rig, a, b, m, 5, 5);
  rig.step(`resume: after the resume A got ${String(next.A)}, B got ${String(next.B)}`);
  // The relay sends `disconnected` and `back` only if it recorded the close before A returned (sct-27), so seeing neither is not a failure; seeing one without the other is.
  return back && again !== undefined && ev('disconnected') === ev('back') && next.B > 0;
}

async function gone(rig: Rig, a: Peer, b: Peer, m: MatchEv): Promise<boolean> {
  await exchange(rig, a, b, m, 0, 3);
  rig.leave(a);
  const ok = await until(rig, 'peer gone on B', PEER_GRACE_MS + GONE_MARGIN_MS, () => b.events.some((e) => e.t === 'peer' && e.status === 'gone'));
  rig.step(`gone: B peer events=${b.events.filter((e) => e.t === 'peer').map((e) => (e.t === 'peer' ? e.status : '')).join(',')}`);
  return ok;
}

async function rematch(rig: Rig, a: Peer, b: Peer, m: MatchEv): Promise<boolean> {
  await exchange(rig, a, b, m, 0, 3);
  for (const p of [a, b]) await sendCounted(rig, p, () => { p.c.transport.sendResult(m.matchId, 0, 0, 100, 0xabcd); });
  const acked = await until(rig, 'result-ack on both', STEP_TIMEOUT_MS, () => count(a, 'result-ack') > 0 && count(b, 'result-ack') > 0);
  a.c.joinQueue(); await rig.sleep(BATCH_GAP_MS); b.c.joinQueue();
  const second = await until(rig, 'second match on both', STEP_TIMEOUT_MS, () => count(a, 'match') > 1 && count(b, 'match') > 1);
  const m2 = a.events.filter((e): e is MatchEv => e.t === 'match')[1];
  rig.step(`rematch: matchId ${String(m.matchId)} -> ${String(m2?.matchId)}`);
  if (!acked || !second || m2 === undefined || m2.matchId === m.matchId) return false;
  const got = await exchange(rig, a, b, m2, 0, 3);
  rig.step(`rematch: second match batches A=${String(got.A)} B=${String(got.B)}`);
  return got.A > 0 && got.B > 0;
}

/** Observation: differing HASH and DESYNC frames, then differing RESULTs; passes unless the link dies. */
async function disagree(rig: Rig, a: Peer, b: Peer, m: MatchEv): Promise<boolean> {
  const [ha, hb] = DISAGREE_HASHES;
  await exchange(rig, a, b, m, 0, 2);
  await sendCounted(rig, a, () => { a.c.transport.sendHash(m.matchId, DISAGREE_TICK, ha); });
  await sendCounted(rig, b, () => { b.c.transport.sendHash(m.matchId, DISAGREE_TICK, hb); });
  await sendCounted(rig, a, () => { a.c.transport.sendDesync(m.matchId, DISAGREE_TICK, ha, hb); });
  await sendCounted(rig, b, () => { b.c.transport.sendDesync(m.matchId, DISAGREE_TICK, hb, ha); });
  await rig.sleep(REACTION_WAIT_MS);
  pump(a); pump(b);
  a.c.transport.stopRetry(); b.c.transport.stopRetry();
  await sendCounted(rig, a, () => { a.c.transport.sendResult(m.matchId, 0, 0, 100, ha); });
  await sendCounted(rig, b, () => { b.c.transport.sendResult(m.matchId, 0, 0, 100, hb); });
  await until(rig, 'result-ack on both', REACTION_WAIT_MS, () => count(a, 'result-ack') > 0 && count(b, 'result-ack') > 0);
  a.c.transport.stopRetry(); b.c.transport.stopRetry();
  for (const p of [a, b]) rig.step(`disagree: ${p.name} events=${p.events.filter((e) => e.t !== 'queue').map((e) => (e.t === 'result-ack' ? `result-ack:${String(e.status)}` : e.t === 'error' ? `error:${e.failure.kind}` : e.t)).join(',')} lastError=${JSON.stringify(p.c.transport.lastError ?? null)}`);
  return !a.events.some((e) => e.t === 'closed') && !b.events.some((e) => e.t === 'closed');
}

async function malformed(rig: Rig, a: Peer, b: Peer, m: MatchEv): Promise<boolean> {
  const junk = ['not base64 !!', encodeText(Uint8Array.of(0xff, 1, 2)), encodeText(Uint8Array.of(0x40, 0, 0, 0, 9)), encodeText(new Uint8Array(0))];
  let sentJunk = 0;
  // The live relay answers a bad frame with an error and a close, so the next send may find no socket: that is a finding, not a tool failure.
  for (const text of junk) {
    if (count(a, 'error') > 0 || count(a, 'reconnecting') > 0) break;
    try { await sendCounted(rig, a, () => { rig.raw(a, text); }); sentJunk++; } catch (e) { rig.step(`malformed: send refused after ${String(sentJunk)} bad frames (${e instanceof Error ? e.message : 'error'})`); break; }
  }
  rig.step(`malformed: relay reacted after ${String(sentJunk)} bad frames: A errors=${String(count(a, 'error'))} reconnecting=${String(count(a, 'reconnecting'))}`);
  if (count(a, 'error') === 0) await sendCounted(rig, a, () => { a.c.transport.send(encodePacket({ match: (m.matchId + 1) & 0xff, flags: 0, ack: 0, firstTick: 0, inputs: [], hashes: [] })); });
  const got = await exchange(rig, a, b, m, 0, 5);
  const alive = !a.events.some((e) => e.t === 'closed') && !b.events.some((e) => e.t === 'closed');
  rig.step(`malformed: ${String(junk.length + 1)} bad frames sent; then A got ${String(got.A)}, B got ${String(got.B)}; alive=${String(alive)} errors A=${String(count(a, 'error'))} B=${String(count(b, 'error'))} B.malformed=${String(b.c.transport.malformed)} B.staleMatch=${String(b.c.transport.staleMatch)}`);
  return alive && got.B > 0;
}

interface Line { readonly seq: number; readonly text: string; readonly phase: 'paced' | 'after' | 'burst' }
interface ChatSide { readonly p: Peer; readonly lines: Line[]; readonly got: ChatIn[]; readonly refused: ChatRefused[] }
const chatSide = (p: Peer): ChatSide => {
  const s: ChatSide = { p, lines: [], got: [], refused: [] };
  p.c.onChat = (m) => { s.got.push(m); };
  p.c.onChatError = (e) => { s.refused.push(e); };
  return s;
};
/** One chat line through `sendCounted` (so it counts toward the budget and the rate). The text is never logged. */
async function sendLine(rig: Rig, s: ChatSide, phase: Line['phase'], gapMs: number): Promise<void> {
  const text = `${s.p.name} ${phase} ${String(s.lines.length)}`;
  let seq: number | undefined;
  await sendCounted(rig, s.p, () => { seq = s.p.c.sendChat(text); }, gapMs);
  if (seq === undefined) throw new Error(`chat line not sent on ${s.p.name}`);
  s.lines.push({ seq, text, phase });
}
interface Outcome { delivered: number; refused: number; bad: number }
/** Outcomes of `from`'s lines of one phase: arrived at the peer with equal bytes, tagged at the sender with retryAfterSec >= 1, or a defect (neither, both, other bytes). */
function outcomes(from: ChatSide, to: ChatSide, phase: Line['phase']): Outcome {
  const r: Outcome = { delivered: 0, refused: 0, bad: 0 };
  for (const l of from.lines.filter((x) => x.phase === phase)) {
    const arrived = to.got.filter((g) => g.seq === l.seq);
    const tagged = from.refused.filter((e) => e.seq === l.seq);
    if (arrived.length + tagged.length !== 1 || (arrived[0] !== undefined && arrived[0].text !== l.text) || (tagged[0] !== undefined && tagged[0].retryAfterSec < 1 && phase === 'burst')) r.bad++;
    else if (arrived.length === 1) r.delivered++;
    else r.refused++;
  }
  return r;
}
const resolved = (f: ChatSide, t: ChatSide): boolean => f.lines.every((l) => t.got.some((g) => g.seq === l.seq) || f.refused.some((e) => e.seq === l.seq));

/** Reports counts only: never a line's text, never the address. */
async function chat(rig: Rig, a: Peer, b: Peer, m: MatchEv): Promise<boolean> {
  if (!a.c.chatSupported() || !b.c.chatSupported()) { rig.step('chat: SKIPPED, chat is off on this relay (WELCOME caps bit0 is 0)'); return true; }
  const [sa, sb] = [chatSide(a), chatSide(b)];
  for (let i = 0; i < CHAT_PACED_PER_SIDE; i++) { await sendLine(rig, sa, 'paced', CHAT_GAP_MS); await sendLine(rig, sb, 'paced', CHAT_GAP_MS); }
  for (const p of [a, b]) await sendCounted(rig, p, () => { p.c.transport.sendResult(m.matchId, 0, 0, 100, 0xabcd); });
  const acked = await until(rig, 'result-ack on both', STEP_TIMEOUT_MS, () => count(a, 'result-ack') > 0 && count(b, 'result-ack') > 0);
  await sendLine(rig, sa, 'after', CHAT_GAP_MS); await sendLine(rig, sb, 'after', CHAT_GAP_MS);
  await rig.sleep(CHAT_IDLE_BEFORE_BURST_MS);
  for (const s of [sa, sb]) for (let i = 0; i < CHAT_BURST_SIZE; i++) await sendLine(rig, s, 'burst', CHAT_BURST_GAP_MS);
  await until(rig, 'every chat line resolved', DRAIN_MAX_MS, () => resolved(sa, sb) && resolved(sb, sa));
  const agreed = [a, b].every((p) => p.events.some((e) => e.t === 'result-ack' && e.status === 0));
  let ok = acked && agreed;
  for (const [f, t] of [[sa, sb], [sb, sa]] as const) {
    const paced = outcomes(f, t, 'paced');
    const after = outcomes(f, t, 'after');
    const burst = outcomes(f, t, 'burst');
    const paceOk = paced.delivered === CHAT_PACED_PER_SIDE && after.delivered === 1 && paced.refused + after.refused + paced.bad + after.bad === 0;
    const burstOk = burst.bad === 0 && burst.delivered + burst.refused === CHAT_BURST_SIZE && burst.delivered >= CHAT_BURST && burst.refused >= 1;
    rig.step(`chat: ${f.p.name}->${t.p.name} paced ${String(paced.delivered)}/${String(CHAT_PACED_PER_SIDE)} after-result ${String(after.delivered)}/1 ok=${String(paceOk)}`);
    rig.step(`chat: burst ${f.p.name} delivered ${String(burst.delivered)} refused ${String(burst.refused)} defects ${String(burst.bad)} ok=${String(burstOk)}`);
    ok = ok && paceOk && burstOk && f.got.length === t.lines.length - t.refused.length;
  }
  const closed = [a, b].some((p) => p.events.some((e) => e.t === 'closed' || e.t === 'error'));
  const rate = rateOf(rig).summary();
  rig.step(`chat: peak ${String(rate.peakPerSec)} frames/s of ${String(GRANT_FRAMES_PER_SEC)} (measurement, client-sent incl. chat), ${String(rate.total)} frames; closed-or-error=${String(closed)} result-agreed=${String(agreed)}`);
  return ok && !closed && rate.peakPerSec <= GRANT_FRAMES_PER_SEC;
}

/** --bad-version needs no pair: one peer announces a sim version the relay cannot know. The relay's reaction is reported; only an odd failure kind fails. */
export async function badVersion(rig: Rig, simVersion: number): Promise<boolean> {
  const c = rig.spawn('C', simVersion + BAD_SIM_VERSION_OFFSET);
  try {
    const r = await c.c.connect();
    if (!r.ok) {
      rig.step(`bad-version: connect refused kind=${r.failure.kind}`);
      return r.failure.kind === 'update-needed';
    }
    c.c.joinQueue();
    await until(rig, 'reaction to the bad sim version', REACTION_WAIT_MS, () => c.events.some((e) => e.t === 'error' || e.t === 'closed' || e.t === 'match'));
    rig.step(`bad-version: connected; events=${c.events.map((e) => e.t).join(',')}`);
    return !c.events.some((e) => e.t === 'match');
  } finally { c.c.close(); }
}

const RUN: Readonly<Record<Exclude<Scenario, 'bad-version'>, (rig: Rig, a: Peer, b: Peer, m: MatchEv) => Promise<boolean>>> = { resume, gone, rematch, disagree, malformed, chat };
export const runPaired = (s: Exclude<Scenario, 'bad-version'>, rig: Rig, a: Peer, b: Peer, m: MatchEv): Promise<boolean> => RUN[s](rig, a, b, m);

export const HELP = [
  'pnpm online:live-match [scenario] [--trace] [--inputs]   (address from env TTE_RELAY_URL, never printed; plain run = queue, match, batches, RESULT)',
  '  --resume       drop A\'s socket mid-match: A must reconnect and resume the same match, B must see disconnected then back',
  '  --gone         A leaves; B must see the peer gone within the grace (10 s) plus a margin',
  '  --rematch      RESULT both, queue again on the same sockets: a new matchId, batches flow again',
  '  --disagree     differing HASH, DESYNC and RESULT hashes: reports the relay\'s reaction (observation, fails only if the link dies)',
  '  --chat         both clients: paced chat lines, one over-rate burst (refused in part, socket stays open), RESULT agreed; skipped if the relay has chat off',
  '  --bad-version  one client announces an unknown sim version: reports how the relay reacts',
  '  --malformed    non-frame text, unknown type, truncated BATCH, wrong matchId: the link must survive and carry later batches',
  `Each scenario sends at most ${String(SCENARIO_FRAMES_PER_SIDE)} frames per side, paced at one per ${String(BATCH_GAP_MS)} ms (live grant: 150 client-sent frames/s total, GRANT_FRAMES_PER_SEC). Constants: tools/live-match-constants.ts.`,
  'Exit: 0 ok, 1 step or scenario failed, 2 bad config or flags.',
].join('\n');
