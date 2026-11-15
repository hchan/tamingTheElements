import { afterEach, describe, expect, it } from 'vitest';
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import { SetupHandshake, type ControlPipe } from '../../src/core/net/control';
import { decodeHello, encodeHello, helloOf, type Hello } from '../../src/core/net/handshake';
import type { MatchSetup } from '../../src/core/sim/match';
import { SIM_VERSION } from '../../src/core/version';
import { hostRoom, joinRoom, type RelaySocketCtor } from '../../src/game/net/relay';
import { PERFECT_NET } from '../../src/testing/net/fake-transport';
import { botScripts, runNetMatch } from '../../src/testing/net/net-match';
import { startRelay, type RelayHandle } from '../../tools/signal-relay/server';

/**
 * Online peer link, headless: two peers meet by room code through the real local signalling relay (the HELLO travels as
 * the relay's offer and answer text), run the setup handshake over a loopback control pipe, then a lockstep and a
 * rollback match, and must agree on every state-hash checkpoint. A peer on another SIM_VERSION is refused at the handshake.
 */

const setupOf = (simVersion: number): MatchSetup => ({
  simVersion,
  seed: 0x0ffe,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('lavax'), xp: 20 }],
  p2: [{ character: characterId('pax'), xp: 20 }],
});

const toText = (h: Hello): string => Buffer.from(encodeHello(h)).toString('base64url');
const fromText = (t: string): Hello | undefined => decodeHello(new Uint8Array(Buffer.from(t, 'base64url')));

function controlPair(): [ControlPipe, ControlPipe] {
  const a: Uint8Array[] = [];
  const b: Uint8Array[] = [];
  return [
    { send: (m) => void b.push(m), receive: () => a.shift() },
    { send: (m) => void a.push(m), receive: () => b.shift() },
  ];
}

/** Polls both sides until neither changes (the pipe is reliable and in order, so a few rounds settle it). */
function settle(x: SetupHandshake, y: SetupHandshake): void {
  for (let i = 0; i < 6; i++) {
    x.poll();
    y.poll();
  }
}

describe('online peer link over the local relay', () => {
  let relay: RelayHandle | undefined;
  afterEach(async () => {
    await relay?.close();
    relay = undefined;
  });
  const Ctor = WebSocket as unknown as RelaySocketCtor;

  /** Host and guest swap HELLOs through a real relay room; returns what each side received. */
  async function meet(hostHello: Hello, guestHello: Hello): Promise<{ atGuest: Hello | undefined; atHost: Hello | undefined }> {
    relay = await startRelay();
    const url = `ws://127.0.0.1:${String(relay.port)}`;
    const host = await hostRoom(url, toText(hostHello), Ctor);
    const guest = await joinRoom(url, host.code, Ctor);
    guest.reply(toText(guestHello));
    const answer = await host.answer;
    host.close();
    guest.close();
    return { atGuest: fromText(guest.offer), atHost: fromText(answer) };
  }

  it('same SIM_VERSION: handshake goes, lockstep and rollback end with identical hash checkpoints', async () => {
    const setup = setupOf(SIM_VERSION);
    const { atGuest, atHost } = await meet(helloOf(setup), helloOf(setup));
    expect(atGuest).toEqual(helloOf(setup));
    expect(atHost).toEqual(helloOf(setup));

    const [pa, pb] = controlPair();
    const ha = new SetupHandshake(pa, helloOf(setup));
    const hb = new SetupHandshake(pb, helloOf(setup));
    settle(ha, hb);
    expect([ha.phase, hb.phase]).toEqual(['go', 'go']);

    const limit = 1200; // 24 checkpoints at the default 50-tick interval
    const script = botScripts(setup, limit + 200);
    for (const session of [{ adaptive: false }, { adaptive: false, rollbackWindow: 8 }]) {
      const r = runNetMatch({ setup, script, tickLimit: limit, conditions: { ...PERFECT_NET, latency: 2, jitter: 2, loss: 0.05 }, netSeed: 7, session });
      expect(r.sessions.map((s) => s.status)).toEqual(['ended', 'ended']);
      expect(r.sessions.map((s) => s.desync)).toEqual([undefined, undefined]);
      const a = r.sessions[0].checkpoints();
      expect(a.length).toBeGreaterThanOrEqual(20);
      expect(r.sessions[1].checkpoints()).toEqual(a);
      expect(r.hashes[0]).toBe(r.hashes[1]);
    }
  });

  it('a different SIM_VERSION is refused by both peers and no match starts', async () => {
    const mine = setupOf(SIM_VERSION);
    const theirs = setupOf(SIM_VERSION + 1);
    const { atGuest, atHost } = await meet(helloOf(mine), helloOf(theirs));
    expect(atGuest?.simVersion).toBe(SIM_VERSION);
    expect(atHost?.simVersion).toBe(SIM_VERSION + 1);

    const [pa, pb] = controlPair();
    const ha = new SetupHandshake(pa, helloOf(mine));
    const hb = new SetupHandshake(pb, helloOf(theirs));
    settle(ha, hb);
    expect([ha.phase, hb.phase]).toEqual(['rejected', 'rejected']);
    expect(ha.reason).toBe('simVersion');
    expect(hb.reason).toBe('simVersion');
  });
});
