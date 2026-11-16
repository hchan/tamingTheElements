import { describe, expect, it } from 'vitest';
import { arcadePlayfield } from '../../data/arcade';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd } from '../../sim/commands';
import { createMatch, type MatchSetup } from '../../sim/match';
import { skipIntro } from '../../sim/systems/arcade/round-testkit';
import { ARCADE_E, ArcadeE } from '../../sim/state';
import { step } from '../../sim/step';
import type { SimWorld } from '../../sim/world';
import { getCharacter } from '../../data/characters';
import { collectCommands } from '../agent';
import { AI_EASY, AI_HARD, AI_NORMAL, stepApart, type ArcadeAiLevel } from './arcade-ai';
import { ScriptedAI, scriptedProfileFor } from './index';

const makeAgent = (me: string, opp: string, level: ArcadeAiLevel): ScriptedAI =>
  new ScriptedAI(scriptedProfileFor(getCharacter(characterId(me)), getCharacter(characterId(opp))), { id: me, level });
const MOVE = Cmd.left | Cmd.right | Cmd.up | Cmd.down;

function duel(): SimWorld {
  const setup: MatchSetup = {
    simVersion: 84, seed: 11, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('sindarosa'), xp: 1 }],
    p2: [{ character: characterId('rokcore'), xp: 1 }],
  };
  return skipIntro(createMatch(setup));
}

/** The command team 1's scripted AI of `level` gives with the boxes overlapped (foe at x=0 against the wall). */
function overlapped(level: ArcadeAiLevel, stun = false): { cmd: number; apart: number } {
  const w = duel();
  const s = w.state;
  s.x[0] = 0; s.y[0] = 300; s.x[1] = 10; s.y[1] = 300;
  if (stun) s.arcade[0 * ARCADE_E + ArcadeE.stunUntil] = 1_000_000;
  const ai = makeAgent('rokcore', 'sindarosa', level);
  const idle = makeAgent('sindarosa', 'rokcore', AI_NORMAL);
  const cmds = collectCommands(w, [idle, ai] as never);
  const box = (id: number) => ({ x: s.x[id] ?? 0, y: s.y[id] ?? 0, w: s.w[id] ?? 0, h: s.h[id] ?? 0 });
  return { cmd: cmds[1], apart: stepApart(box(1), box(0), arcadePlayfield()) };
}

describe('Hard AI never stands inside its foe (WALL-2)', () => {
  it('Hard: overlapped boxes, foe free: the move bits equal stepApart', () => {
    const { cmd, apart } = overlapped(AI_HARD);
    expect(apart).not.toBe(0);
    expect(cmd & MOVE).toBe(apart);
  });
  it('Hard: a stunned foe is left alone (the step-apart rule does not fire)', () => {
    const { cmd, apart } = overlapped(AI_HARD, true);
    expect(apart).not.toBe(0);
    expect(cmd & MOVE).not.toBe(apart);
  });
  it('Easy and Normal keep their old behaviour (no step-apart outside a stale fight)', () => {
    for (const level of [AI_EASY, AI_NORMAL] as const) {
      const { cmd, apart } = overlapped(level);
      expect(cmd & MOVE).not.toBe(apart);
    }
  });
});

describe('match level: idle P1 against Hard', () => {
  it('after the first wall contact the boxes are overlapped under 5% of the time', () => {
    for (const seed of [1, 2]) {
      const setup: MatchSetup = {
        simVersion: 84, seed: 0x5eed + seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
        p1: [{ character: characterId('sindarosa'), xp: 1 }],
        p2: [{ character: characterId('rokcore'), xp: 1 }],
      };
      const w = createMatch(setup);
      const s = w.state;
      const ai = makeAgent('rokcore', 'sindarosa', AI_HARD);
      const idle = { id: 'idle', observe: () => 0, save: () => null, load: () => undefined };
      let walled = false, post = 0, over = 0;
      for (let t = 0; t < 50 * 40; t++) {
        step(w, collectCommands(w, [idle, ai] as never));
        if ((s.x[0] ?? 0) <= 2) walled = true;
        if (walled) {
          post++;
          const dx = Math.abs((s.x[0] ?? 0) + (s.w[0] ?? 0) / 2 - (s.x[1] ?? 0) - (s.w[1] ?? 0) / 2);
          const dy = Math.abs((s.y[0] ?? 0) + (s.h[0] ?? 0) / 2 - (s.y[1] ?? 0) - (s.h[1] ?? 0) / 2);
          if (dx < ((s.w[0] ?? 0) + (s.w[1] ?? 0)) / 2 && dy < ((s.h[0] ?? 0) + (s.h[1] ?? 0)) / 2) over++;
        }
      }
      if (post > 100) expect(over / post).toBeLessThan(0.05);
    }
  });
});
