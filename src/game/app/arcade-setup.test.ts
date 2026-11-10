import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ARCADE_T,
  ARCADE_TEAM_BASE,
  ArcadeT,
  CHARACTERS,
  Cmd,
  DEFAULT_SIM_FLAGS,
  METER_BAR,
  RandomBot,
  SIM_VERSION,
  SimEventKind,
  characterId,
  collectCommands,
  createMatch,
  decodeFlags,
  playReplay,
  step,
  type Agent,
  type ReplayFile,
} from '@core/index';
import { ARCADE_RACES, DEFAULT_PICK, arcadeEnemy, arcadeLaunch, arcadeSetup, parsePick, type ArcadePick, type ArcadeResult } from './arcade-setup';

const pick: ArcadePick = { player: characterId('sindarosa'), enemy: characterId('pax'), level: 'normal' };

describe('Arcade Versus setup', () => {
  it('offers the 12 playable races (no void characters) and defaults to Sindarosa vs Fiara, AI Normal', () => {
    expect(ARCADE_RACES).toHaveLength(12);
    for (const r of ARCADE_RACES) expect(CHARACTERS.find((c) => c.id === r)?.element).not.toBe('void');
    expect(DEFAULT_PICK).toEqual({ player: 'sindarosa', enemy: 'fiara', level: 'normal' });
  });

  it('builds one race each, Arcade on and every other flag default, difficulty 1, chapter 1 (no Capture), 0 XP', () => {
    const s = arcadeSetup(pick, -1);
    expect(s).toEqual({
      simVersion: SIM_VERSION,
      seed: 0xffffffff,
      flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true },
      chapter: 1,
      difficulty: 1,
      p1: [{ character: 'sindarosa', xp: 0 }],
      p2: [{ character: 'pax', xp: 0 }],
    });
    // The sim world carries the flag (Arcade state allocated), and Capture is not granted.
    const world = createMatch(s);
    expect(world.state.arcade.length).toBeGreaterThan(0);
  });

  it('parses form values, falling back to the default for anything unknown (never a void or made-up race)', () => {
    expect(parsePick({ player: 'echo', enemy: 'lavax', level: 'easy' })).toEqual({ player: 'echo', enemy: 'lavax', level: 'easy' });
    expect(parsePick({ player: 'eternal-void', enemy: '__proto__', level: 'hard' })).toEqual(DEFAULT_PICK);
  });
});

/** Team 1's commands, against a random-bot player, until the match ends; `meterFull` keeps team 1's bar full every tick. */
function enemyCommands(p: ArcadePick, meterFull: boolean, maxTicks: number): number[] {
  const world = createMatch(arcadeSetup(p, 7));
  const agents: [Agent, Agent] = [new RandomBot('p1'), arcadeEnemy(p)];
  const cmds: number[] = [];
  for (let t = 0; t < maxTicks; t++) {
    if (meterFull) world.state.arcade[ARCADE_TEAM_BASE + ARCADE_T + ArcadeT.meter] = METER_BAR;
    const c = collectCommands(world, agents);
    cmds.push(c[1]);
    if (step(world, c).some((e) => e.kind === SimEventKind.matchEnded)) break;
  }
  return cmds;
}

describe('Arcade AI', () => {
  it('Normal supers on a confirm with a full bar; Easy is the same AI that never presses super', () => {
    // Sindarosa vs a Fiara AI, seed 7: the Normal AI's first super comes about two seconds in.
    const fiara: ArcadePick = { ...pick, enemy: characterId('fiara') };
    const normal = enemyCommands(fiara, true, 3000);
    const first = normal.findIndex((c) => (c & Cmd.super) !== 0);
    expect(first).toBeGreaterThan(0);
    const easy = enemyCommands({ ...fiara, level: 'easy' }, true, 3000);
    expect(easy.some((c) => (c & Cmd.super) !== 0)).toBe(false);
    // Up to the tick Normal pressed super, Easy chose exactly the same commands.
    expect(easy.slice(0, first)).toEqual(normal.slice(0, first));
  });
});

describe('Arcade launch: the result and the only thing it may store', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Plays the launch like the Arena does (record, step, onEnd) and returns what reached the result and the replay store. */
  function run(record: boolean): { result: ArcadeResult | undefined; added: ReplayFile[]; winner: number } {
    const added: ReplayFile[] = [];
    let result: ArcadeResult | undefined;
    const launch = arcadeLaunch(pick, 11, {
      record,
      replays: {
        add: (r) => {
          added.push(r);
          return Promise.resolve();
        },
      },
      onResult: (r) => {
        result = r;
      },
    });
    const world = createMatch(launch.setup);
    const agents: [Agent, Agent] = [new RandomBot('p1'), launch.enemy ?? new RandomBot('p2')];
    let winner = -1;
    for (let t = 0; t < 9000; t++) {
      const c = collectCommands(world, agents);
      launch.recorder?.record(world, c);
      const over = step(world, c).find((e) => e.kind === SimEventKind.matchEnded);
      if (over) {
        winner = over['winner'] ?? -1;
        break;
      }
    }
    launch.onEnd?.({ winner, activeSlot: 0, capturedIndices: [] });
    return { result, added, winner };
  }

  it('reports win, lose or draw from the winner, with the pick', () => {
    const { result, winner } = run(false);
    expect(winner).not.toBe(-1);
    expect(result?.outcome).toBe(winner === 0 ? 'win' : 'lose');
    expect(result?.pick).toEqual(pick);
    expect(result?.replay).toBeUndefined();
  });

  it('records a verifiable replay whose header carries the Arcade flag, and stores it in the replay store only', () => {
    const { result, added } = run(true);
    expect(added).toHaveLength(1);
    const replay = added[0] as ReplayFile;
    expect(result?.replay).toBe(replay);
    expect(decodeFlags(replay.header.flags).rulesetArcade).toBe(true);
    expect(replay.header.cheats).toBeUndefined();
    expect(replay.header.setup.difficulty).toBe(1);
    expect(playReplay(replay, SIM_VERSION).ok).toBe(true);
  });

  it('never touches localStorage or IndexedDB (the save lives there), even while recording', () => {
    const touched: string[] = [];
    const trap = new Proxy(
      {},
      {
        get: (_t, key) => {
          touched.push(String(key));
          return undefined;
        },
      },
    );
    vi.stubGlobal('localStorage', trap);
    vi.stubGlobal('indexedDB', trap);
    run(true);
    run(false);
    expect(touched).toEqual([]);
  });
});
