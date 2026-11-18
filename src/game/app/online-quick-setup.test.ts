import { describe, expect, it } from 'vitest';
import { characterId, SetupHandshake, helloOf } from '@core/index';
import { FakeRelay } from '../../testing/net/fake-relay';
import { WebSocketTransport } from '../net/ws/transport';
import { encodePick, onlineSetup } from './online-pick';
import { QuickSetup, type QuickSetupResult } from './online-quick-setup';

const SEED = 0xabcdef01;

function rig() {
  const clock = { ms: 0 };
  const relay = new FakeRelay(clock, 3);
  const a = new WebSocketTransport(relay.a, () => clock.ms);
  const b = new WebSocketTransport(relay.b, () => clock.ms);
  const qa = new QuickSetup(a.control, 0, SEED);
  const qb = new QuickSetup(b.control, 1, SEED);
  const step = (): [QuickSetupResult, QuickSetupResult] => {
    clock.ms += 50;
    relay.advance();
    a.tick();
    b.tick();
    return [qa.poll(), qb.poll()];
  };
  return { clock, relay, a, b, qa, qb, step };
}

const run = (r: ReturnType<typeof rig>, steps = 100): [QuickSetupResult, QuickSetupResult] => {
  let last = r.step();
  for (let i = 0; i < steps && !last.every((x) => x !== 'waiting'); i++) last = r.step();
  return last;
};

describe('QuickSetup', () => {
  it('both sides reach go with the same setup carrying the server seed', () => {
    const r = rig();
    r.qa.ready({ race: characterId('lavax'), bench: [characterId('pax'), characterId('treenoc')] });
    r.qb.ready({ race: characterId('pax'), bench: [characterId('lavax'), characterId('treenoc')] });
    const [x, y] = run(r);
    expect(x).not.toBe('waiting');
    if (x === 'waiting' || y === 'waiting' || x.t !== 'go' || y.t !== 'go') throw new Error('not go');
    expect(x.setup).toEqual(y.setup);
    expect(x.setup.seed >>> 0).toBe(SEED);
    expect(x.setup.p1[0]?.character).toBe('lavax');
    expect(x.setup.p2[0]?.character).toBe('pax');
  });

  it('goes even when the opponent pick arrives before ours is sent', () => {
    const r = rig();
    r.qa.ready({ race: characterId('lavax') });
    for (let i = 0; i < 10; i++) r.step();
    expect(r.qb.poll()).toBe('waiting');
    r.qb.ready({ race: characterId('pax') });
    const [x, y] = run(r);
    expect(x).toMatchObject({ t: 'go' });
    expect(y).toMatchObject({ t: 'go' });
  });

  it('rejects a different sim version', () => {
    const r = rig();
    r.qa.ready({ race: characterId('lavax') });
    // The opponent runs a build with another sim version: same pick, a HELLO that says so.
    r.b.control.send(encodePick({ race: characterId('pax'), seed: SEED }));
    const setup = onlineSetup({ race: characterId('lavax'), seed: SEED }, { race: characterId('pax'), seed: SEED });
    const hs = new SetupHandshake(r.b.control, helloOf({ ...setup, simVersion: setup.simVersion + 1 }));
    let last: QuickSetupResult = 'waiting';
    for (let i = 0; i < 100 && last === 'waiting'; i++) {
      r.clock.ms += 50;
      r.relay.advance();
      r.a.tick();
      r.b.tick();
      hs.poll();
      last = r.qa.poll();
    }
    expect(last).toEqual({ t: 'rejected', reason: 'simVersion' });
  });

  it('a lost SETUP is repaired by tick()', () => {
    const r = rig();
    r.qa.ready({ race: characterId('lavax') });
    r.qb.ready({ race: characterId('pax') });
    // Drop everything for a while: the control link must resend after the outage.
    let dropped = 0;
    const origA = r.relay.a.onSend;
    const origB = r.relay.b.onSend;
    r.relay.a.onSend = (m) => { if (dropped++ < 2) return; origA?.(m); };
    r.relay.b.onSend = (m) => { if (dropped++ < 2) return; origB?.(m); };
    const [x, y] = run(r, 400);
    expect(x).toMatchObject({ t: 'go' });
    expect(y).toMatchObject({ t: 'go' });
  });
});
