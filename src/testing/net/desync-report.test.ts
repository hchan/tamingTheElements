import { describe, expect, it } from 'vitest';
import { characterId, DEFAULT_SIM_FLAGS, parseReplay, playReplay, rleDecode, serializeReplay, SIM_VERSION, type MatchSetup } from '@core/index';
import { botScripts, runNetMatch } from './net-match';
import { buildDesyncReport } from '../../game/net/desync-report';

const SETUP: MatchSetup = {
  simVersion: SIM_VERSION,
  seed: 0x5eed,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('lavax'), xp: 20 }],
  p2: [{ character: characterId('pax'), xp: 20 }],
};
const LIMIT = 400;
const base = { setup: SETUP, script: botScripts(SETUP, LIMIT + 200), tickLimit: LIMIT, netSeed: 3 } as const;
const NET = { latency: 3, jitter: 2, loss: 0.05, duplicate: 0, reorder: 0.05, reorderDelay: 4 } as const;

describe('desync report', () => {
  it('a healthy rollback match gives a report whose replay member verifies', () => {
    const m = runNetMatch({ ...base, conditions: NET, session: { adaptive: false, rollbackWindow: 8 } });
    const report = buildDesyncReport(SETUP, m.sessions[0]);
    expect(report.kind).toBe('tte-desync-report');
    expect(report.side).toBe(0);
    expect(report.desync).toBeUndefined();
    expect(report.localCheckpoints.length).toBeGreaterThan(3);
    expect(report.replay.header.tickCount).toBeGreaterThanOrEqual(LIMIT - 50);
    expect(rleDecode(report.replay.inputs[0])).toHaveLength(report.replay.header.tickCount);
    expect(playReplay(parseReplay(serializeReplay(report.replay)), SIM_VERSION).ok).toBe(true);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it('plain lockstep logs the same commands for both sides', () => {
    const m = runNetMatch({ ...base, conditions: NET, session: { adaptive: false } });
    const a = buildDesyncReport(SETUP, m.sessions[0]);
    const b = buildDesyncReport(SETUP, m.sessions[1]);
    expect(a.replay.inputs).toEqual(b.replay.inputs);
    expect(playReplay(a.replay, SIM_VERSION).ok).toBe(true);
  });

  it('a corrupted side reports the desync and its replay diverges at the checkpoint that saw the edit', () => {
    const m = runNetMatch({
      ...base,
      conditions: NET,
      session: { adaptive: false },
      beforeTick: (_w, h) => {
        if (h.sessions[1].simTick === 120 && h.worlds[1].state.hp[0] !== 1) h.worlds[1].state.hp[0] = 1;
      },
    });
    const report = buildDesyncReport(SETUP, m.sessions[1]);
    expect(report.desync?.tick).toBe(150);
    expect(report.desync?.local).not.toBe(report.desync?.remote);
    const v = playReplay(report.replay, SIM_VERSION);
    expect(v.ok).toBe(false);
    expect(v.firstDivergentTick).toBe(150);
  });
});
