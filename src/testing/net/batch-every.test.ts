import { describe, expect, it } from 'vitest';
import { characterId, createMatch, DEFAULT_SIM_FLAGS, LockstepSession, type MatchSetup, type Transport } from '@core/index';

const SETUP: MatchSetup = {
  simVersion: 1,
  seed: 1,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('lavax'), xp: 20 }],
  p2: [{ character: characterId('pax'), xp: 20 }],
};

const make = (batchEvery?: number) => {
  const sent: Uint8Array[] = [];
  const transport: Transport = { send: (p) => { sent.push(p); }, receive: () => undefined };
  const s = new LockstepSession({ world: createMatch(SETUP), side: 0, transport, ...(batchEvery === undefined ? {} : { batchEvery }) });
  return { s, sent };
};

describe('LockstepSession batchEvery', () => {
  it('defaults to a packet per update', () => {
    const { s, sent } = make();
    for (let i = 0; i < 9; i++) s.update(0);
    expect(sent).toHaveLength(9);
    expect(s.stats.packetsSent).toBe(9);
  });

  it('sends every Nth update, and hidden or forfeit at once', () => {
    const { s, sent } = make(3);
    for (let i = 0; i < 9; i++) s.update(0);
    expect(sent).toHaveLength(3);
    s.update(0);
    s.setHidden(true);
    expect(sent).toHaveLength(4);
    s.forfeit();
    expect(sent).toHaveLength(5);
  });

  it('rejects a value below 1 or a fraction', () => {
    expect(() => make(0)).toThrow(RangeError);
    expect(() => make(1.5)).toThrow(RangeError);
  });
});
