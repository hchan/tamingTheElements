import { describe, expect, it } from 'vitest';
import { getCharacter } from '../../data/characters';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd } from '../../sim/commands';
import { createMatch } from '../../sim/match';
import { hash } from '../../sim/hash';
import { TEAM_ACTIVE_COUNTS, TEAM_STRIDE } from '../../sim/state';
import { hasEnded, matchWinner } from '../../sim/systems/end';
import { ABILITY_DEFS } from '../../sim/systems/projectile';
import { step } from '../../sim/step';
import { collectCommands, createObservationView, type FighterView, type ObservationView } from '../agent';
import { RandomBot } from '../random-bot';
import { ScriptedAI, scriptedProfileFor } from './index';

/**
 * Sanity, not parity: a ScriptedAI of each listed element must beat a RandomBot in >= 70% of 200 seeded
 * matches; the random-bot's element cycles through every element (40 matches each), so each element
 * pairing is covered.
 *
 * KNOWN-GAP:scripted-ai-air-earth: air and earth are not listed. The sim's ability slot 0 for every
 * air/earth character is a buff, a 0-damage ability (tornado) or an entangle (vines), so the legacy
 * "primary" the AI schedules its movement around never damages; the legacy order differs from
 * CHARACTERS[].abilities. Measured with the same harness: 0-38% wins. Fixing the data order belongs to a
 * sim/data WP. Other sim limits seen here: melee casts have no cooldown (melee.ts keys `s.team` instead
 * of `s.teams`), omni casts never cool down (KNOWN-BUG:omni-no-cooldown) and the y bound never restores
 * (KNOWN-BUG:bounds-y-typo), so the random-bot's element reps avoid ishimi and melee characters.
 */
const AI_BY_ELEMENT = { fire: 'sindarosa', water: 'curomo', void: 'eternal-void' } as const;
const BOT_BY_ELEMENT = ['sindarosa', 'wispera', 'rokcore', 'morblass', 'dummy'] as const;

const MAX_TICKS = 50 * 60;
const MATCHES = 200;

function play(scripted: string, other: string, seed: number): { winner: number | null; hash: number } {
  const world = createMatch({
    simVersion: 1,
    seed,
    flags: DEFAULT_SIM_FLAGS,
    chapter: 1,
    difficulty: 1,
    p1: [{ character: characterId(other), xp: 20 }],
    p2: [{ character: characterId(scripted), xp: 20 }],
  });
  const def = getCharacter(characterId(scripted));
  const defIndex = (slot: number): number => ABILITY_DEFS.findIndex((d) => d.id === def.abilities[slot]);
  const ai = new ScriptedAI(scriptedProfileFor(def, getCharacter(characterId(other))), {
    activeCount: (slot) => world.state.teams[TEAM_STRIDE + TEAM_ACTIVE_COUNTS + defIndex(slot)] ?? 0,
  });
  const bot = new RandomBot();
  for (let t = 0; t < MAX_TICKS && !hasEnded(world.state); t++) step(world, collectCommands(world, [bot, ai]));
  return { winner: matchWinner(world.state), hash: hash(world.state) };
}

describe('ScriptedAI vs random-bot (sanity, not parity)', () => {
  for (const [element, id] of Object.entries(AI_BY_ELEMENT)) {
    it(`${element} (${id}) beats the random-bot in >= 70% of ${String(MATCHES)} matches`, () => {
      let wins = 0;
      for (let seed = 1; seed <= MATCHES; seed++) {
        const bot = BOT_BY_ELEMENT[seed % BOT_BY_ELEMENT.length] ?? 'sindarosa';
        if (play(id, bot, seed).winner === 1) wins++;
      }
      expect(wins / MATCHES).toBeGreaterThanOrEqual(0.7);
    }, 120_000);
  }

  it('is deterministic per seed', () => {
    expect(play('sindarosa', 'wispera', 7)).toEqual(play('sindarosa', 'wispera', 7));
  });
});

function fighter(x: number, y: number, flags = 1): FighterView {
  return { id: 0, x, y, w: 80, h: 80, hp: 100, maxHp: 100, flags, alive: true };
}

function view(self: FighterView, opponent: FighterView, cooldowns = [0, 0, 0, 0], tick = 0): ObservationView {
  return { side: 1, tick, self, opponent, cooldowns, aiInt: () => 1 };
}

describe('ScriptedAI composition', () => {
  const blast = scriptedProfileFor(getCharacter(characterId('sindarosa')), getCharacter(characterId('treenoc')));

  it('builds profiles from data', () => {
    expect(blast.primary).toEqual({ type: 'range', maxActive: 2 });
    expect(blast.selfMelee).toBe(false);
    expect(blast.targetMelee).toBe(false);
    const pax = scriptedProfileFor(getCharacter(characterId('pax')), getCharacter(characterId('pax')));
    expect(pax.selfMelee && pax.targetMelee).toBe(true);
    const shock = scriptedProfileFor(getCharacter(characterId('curomo')), getCharacter(characterId('pax')));
    expect(shock.primary).toMatchObject({ type: 'melee', w: 240, h: 40, reach: 'directional' });
    expect(shock.targetMelee).toBe(true);
  });

  it('shooter closes in when ready and backs off on cooldown', () => {
    const self = fighter(500, 300);
    const target = fighter(900, 500);
    const ready = new ScriptedAI(blast).observe(view(self, target));
    expect(ready & Cmd.right).not.toBe(0);
    expect(ready & Cmd.down).not.toBe(0);
    const cooling = new ScriptedAI(blast).observe(view(self, target, [10, 0, 0, 0]));
    expect(cooling & Cmd.left).not.toBe(0);
    expect(cooling & Cmd.up).not.toBe(0);
  });

  it('a shot forces its facing axis onto the movement', () => {
    const cmd = new ScriptedAI(blast).observe(view(fighter(500, 300), fighter(300, 300)));
    expect(cmd & Cmd.primary).not.toBe(0);
    expect(cmd & Cmd.left).not.toBe(0);
    expect(cmd & Cmd.right).toBe(0);
    // Same column: faces south, x movement is dropped so the sim fires south.
    const south = new ScriptedAI(blast).observe(view(fighter(500, 300), fighter(500, 700)));
    expect(south & Cmd.primary).not.toBe(0);
    expect(south & Cmd.down).not.toBe(0);
    expect(south & (Cmd.left | Cmd.right)).toBe(0);
  });

  it('retreat stops at the arena wall and the blocked axis then triggers the edge override', () => {
    const ai = new ScriptedAI(blast);
    // Cooling down, pressed against the top wall (arena y = 100) with the target below and close.
    const self = fighter(500, 100);
    const target = fighter(520, 200);
    const first = ai.observe(view(self, target, [50, 0, 0, 0], 0));
    expect(first & (Cmd.up | Cmd.down)).toBe(0);
    ai.observe(view(self, target, [49, 0, 0, 0], 1));
    expect(ai.state.moveAwayY).toBe('s');
  });

  it('frozen enemies do nothing, and a missing opponent is idle', () => {
    expect(new ScriptedAI(blast).observe(view(fighter(500, 300, 1 | 4), fighter(300, 300)))).toBe(0);
    const none = { ...view(fighter(0, 0), fighter(0, 0)), opponent: undefined };
    expect(new ScriptedAI(blast).observe(none)).toBe(0);
  });

  it('draws nothing from any stream when no step lands on the target axis', () => {
    const world = createMatch({
      simVersion: 1,
      seed: 3,
      flags: DEFAULT_SIM_FLAGS,
      chapter: 1,
      difficulty: 1,
      p1: [{ character: characterId('treenoc'), xp: 20 }],
      p2: [{ character: characterId('sindarosa'), xp: 20 }],
    });
    const before = world.state.rng.slice();
    new ScriptedAI(blast).observe(createObservationView(world, 1));
    expect(world.state.rng).toEqual(before);
  });
});
