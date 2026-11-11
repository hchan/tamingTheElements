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
  createRenderView,
  decodeFlags,
  playReplay,
  step,
  type Agent,
  type ReplayFile,
} from '@core/index';
import { ARCADE_RACES, DEFAULT_PICK, parsePick, type ArcadePick } from './arcade-pick';
import { arcadeEnemy, arcadeLaunch, arcadeSetup, enemyPartner, enemyPartners, heroesOf, type ArcadeResult } from './arcade-setup';

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
    expect(parsePick({ player: 'echo', enemy: 'lavax', level: 'hard' })).toEqual({ player: 'echo', enemy: 'lavax', level: 'hard' });
    expect(parsePick({ player: 'eternal-void', enemy: '__proto__', level: 'wtf' })).toEqual(DEFAULT_PICK);
  });

  it('local two-player is a duel of two teams (WP-pvp-3heroes): both benches from the form, distinct within a team, the same size', () => {
    const f = { player: 'sindarosa', enemy: 'sindarosa', level: 'normal', mode: 'local' };
    const p = parsePick({ ...f, size: '3', partner: 'pax', partner2: 'echo', enemyPartner: 'lavax', enemyPartner2: 'curomo' });
    expect(p).toEqual({ player: 'sindarosa', enemy: 'sindarosa', level: 'normal', local: true, partner: 'pax', partner2: 'echo', enemyBench: ['lavax', 'curomo'] });
    const s = arcadeSetup(p, 9);
    expect(s.p1.map((m) => m.character)).toEqual(['sindarosa', 'pax', 'echo']);
    expect(s.p2.map((m) => m.character)).toEqual(['sindarosa', 'lavax', 'curomo']);
    // A repeat within a team is replaced; a mirror across the teams is kept.
    const dup = parsePick({ ...f, size: '3', partner: 'sindarosa', partner2: 'sindarosa', enemyPartner: 'sindarosa', enemyPartner2: 'sindarosa' });
    expect(new Set([dup.player, dup.partner, dup.partner2]).size).toBe(3);
    expect(new Set([dup.enemy, ...(dup.enemyBench ?? [])]).size).toBe(3);
    expect(parsePick({ ...f, size: '2' }).enemyBench).toHaveLength(1);
    expect(parsePick({ ...f, size: '1' })).toEqual({ player: 'sindarosa', enemy: 'sindarosa', level: 'normal', local: true, enemyBench: [] });
    expect(arcadeSetup(parsePick({ ...f, size: '1' }), 1).p2).toHaveLength(1);
    // Against the AI nothing changes: the AI's bench still comes from the seed.
    expect(parsePick({ ...f, mode: 'ai', size: '3', enemyPartner: 'pax' }).enemyBench).toBeUndefined();
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
  it('Normal and Hard super on a confirm with a full bar; Easy never presses super; the levels play differently', () => {
    // Sindarosa vs a Fiara AI, seed 7, the bar kept full.
    const fiara: ArcadePick = { ...pick, enemy: characterId('fiara') };
    const normal = enemyCommands(fiara, true, 3000);
    const hard = enemyCommands({ ...fiara, level: 'hard' }, true, 3000);
    const easy = enemyCommands({ ...fiara, level: 'easy' }, true, 3000);
    expect(normal.some((c) => (c & Cmd.super) !== 0)).toBe(true);
    expect(hard.some((c) => (c & Cmd.super) !== 0)).toBe(true);
    expect(easy.some((c) => (c & Cmd.super) !== 0)).toBe(false);
    expect(hard).not.toEqual(normal);
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
    const launch = arcadeLaunch(pick, 12, {
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
    let rounds: [number, number] = [0, 0];
    // Best of 3 (FUN-DESIGN 2.10): up to three rounds of at most 90 s each, plus the intros, KOs and round ends.
    for (let t = 0; t < 20_000; t++) {
      const c = collectCommands(world, agents);
      launch.recorder?.record(world, c);
      const over = step(world, c).find((e) => e.kind === SimEventKind.matchEnded);
      if (over) {
        winner = over['winner'] ?? -1;
        rounds = [over['won0'] ?? -1, over['won1'] ?? -1];
        break;
      }
    }
    launch.onEnd?.({ winner, activeSlot: 0, capturedIndices: [], rounds });
    return { result, added, winner };
  }

  it('reports win, lose or draw from the winner, with the pick', () => {
    const { result, winner } = run(false);
    expect(winner).not.toBe(-1);
    expect(result?.outcome).toBe(winner === 0 ? 'win' : 'lose');
    expect(result?.pick).toEqual(pick);
    expect(result?.replay).toBeUndefined();
    // Best of 3: the winner has 2 round wins, the loser fewer, and the result carries the score.
    expect(result?.rounds?.[winner]).toBe(2);
    expect(result?.rounds?.[1 - winner]).toBeLessThan(2);
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

describe('Arcade 2v2 tag team (WP-arcade-tag-view)', () => {
  const duo: ArcadePick = { ...pick, partner: characterId('fiara'), enemy: characterId('lavax') };

  it('parses the team size and a partner distinct from the lead (1v1 when the size is not 2)', () => {
    const base = { player: 'echo', enemy: 'lavax', level: 'easy' };
    expect(parsePick({ ...base, size: '2', partner: 'pax' })).toEqual({ ...base, partner: 'pax' });
    expect(parsePick({ ...base, size: '1', partner: 'pax' })).toEqual(base);
    expect(parsePick(base)).toEqual(base);
    // Unknown or equal to the lead: Pax, or the first other race when the lead is Pax.
    expect(parsePick({ ...base, size: '2', partner: 'nope' }).partner).toBe('pax');
    expect(parsePick({ ...base, size: '2', partner: 'echo' }).partner).toBe('pax');
    const pax = parsePick({ ...base, player: 'pax', size: '2', partner: 'pax' });
    expect(pax.partner).toBe(ARCADE_RACES.find((r) => r !== 'pax'));
  });

  it('builds two heroes a side; the AI partner comes from the seed and never repeats a picked race', () => {
    const s = arcadeSetup(duo, 7);
    expect(s.p1).toEqual([{ character: 'sindarosa', xp: 0 }, { character: 'fiara', xp: 0 }]);
    expect(s.p2[0]).toEqual({ character: 'lavax', xp: 0 });
    expect(s.p2[1]).toEqual({ character: enemyPartner(duo, 7), xp: 0 });
    const partners = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      const p = enemyPartner(duo, seed);
      expect(['sindarosa', 'fiara', 'lavax']).not.toContain(p);
      expect(ARCADE_RACES).toContain(p);
      expect(enemyPartner(duo, seed)).toBe(p);
      partners.add(p);
    }
    expect(partners.size).toBe(ARCADE_RACES.length - 3);
    expect(arcadeSetup(pick, 7).p2).toHaveLength(1);
  });

  it('the AI plays whichever of its heroes is in: a 2v2 match runs to its end, with tags or KO entrances on the way', () => {
    const setup = arcadeSetup(duo, 11);
    const world = createMatch(setup);
    const agents: [Agent, Agent] = [new RandomBot('p1'), arcadeEnemy(duo, setup)];
    const tagIns: number[] = [];
    let after = 0;
    let ended = false;
    for (let t = 0; t < 40_000 && !ended; t++) {
      const c = collectCommands(world, agents);
      if (tagIns.includes(1) && c[1] !== 0) after++;
      for (const e of step(world, c)) {
        if (e.kind === SimEventKind.tagIn) tagIns.push(e['team'] ?? -1);
        if (e.kind === SimEventKind.matchEnded) ended = true;
      }
    }
    expect(ended).toBe(true);
    expect(tagIns.length).toBeGreaterThan(0);
    if (tagIns.includes(1)) expect(after).toBeGreaterThan(0);
  });

  it("saves and loads both heroes' AI memory (the team agent round-trips)", () => {
    const setup = arcadeSetup(duo, 3);
    const a = arcadeEnemy(duo, setup);
    const saved = a.save();
    expect(Array.isArray(saved)).toBe(true);
    const b = arcadeEnemy(duo, setup);
    b.load(saved);
    expect(b.save()).toEqual(saved);
  });

  it("reads every hero's HP per cent (0 when knocked out) off the render view, in roster order", () => {
    const setup = arcadeSetup(duo, 5);
    const world = createMatch(setup);
    const s = world.state;
    const max = s.maxHp[1] ?? 1;
    const hp = Math.round(max * 0.42);
    s.hp[1] = hp;
    s.hp[3] = 0;
    expect(heroesOf(createRenderView(world), setup)).toEqual([
      { team: 0, race: 'sindarosa', pct: 100 },
      { team: 0, race: 'fiara', pct: Math.ceil((hp * 100) / max) },
      { team: 1, race: 'lavax', pct: 100 },
      { team: 1, race: enemyPartner(duo, 5), pct: 0 },
    ]);
  });
});

describe('Arcade 3v3 tag team (WP-arcade-3v3)', () => {
  const trio: ArcadePick = { ...pick, partner: characterId('fiara'), partner2: characterId('curomo'), enemy: characterId('lavax') };

  it('parses size 3 into two partners, distinct from each other and from the lead', () => {
    const base = { player: 'echo', enemy: 'lavax', level: 'easy' };
    expect(parsePick({ ...base, size: '3', partner: 'pax', partner2: 'fiara' })).toEqual({ ...base, partner: 'pax', partner2: 'fiara' });
    expect(parsePick({ ...base, size: '2', partner: 'pax', partner2: 'fiara' })).toEqual({ ...base, partner: 'pax' });
    // Unknown, or already on the team: Curomo, or the first race not yet on it.
    expect(parsePick({ ...base, size: '3', partner: 'pax', partner2: 'nope' }).partner2).toBe('curomo');
    expect(parsePick({ ...base, size: '3', partner: 'pax', partner2: 'pax' }).partner2).toBe('curomo');
    const taken = parsePick({ ...base, player: 'curomo', size: '3', partner: 'pax', partner2: 'curomo' });
    expect(taken.partner2).toBe(ARCADE_RACES.find((r) => r !== 'curomo' && r !== 'pax'));
  });

  it('builds three heroes a side; the AI partners come from the seed, distinct, never a picked race; 2v2 is unchanged', () => {
    const s = arcadeSetup(trio, 7);
    expect(s.p1.map((m) => m.character)).toEqual(['sindarosa', 'fiara', 'curomo']);
    expect(s.p2.map((m) => m.character)).toEqual(['lavax', ...enemyPartners(trio, 7)]);
    const seen = new Set<string>();
    for (let seed = 0; seed < 4000; seed += 37) {
      const [a, b] = enemyPartners(trio, seed);
      expect(a).not.toBe(b);
      for (const r of [a, b]) {
        expect(['sindarosa', 'fiara', 'curomo', 'lavax']).not.toContain(r);
        expect(ARCADE_RACES).toContain(r);
      }
      seen.add(`${String(a)}/${String(b)}`);
    }
    expect(seen.size).toBeGreaterThan(10);
    const duo: ArcadePick = { ...pick, partner: characterId('fiara') };
    expect(enemyPartners(duo, 9)).toEqual([enemyPartner(duo, 9)]);
    expect(enemyPartners(pick, 9)).toEqual([]);
  });

  it('a 3v3 match against the AI runs to its end', () => {
    const setup = arcadeSetup(trio, 11);
    const world = createMatch(setup);
    const agents: [Agent, Agent] = [new RandomBot('p1'), arcadeEnemy(trio, setup)];
    const tagIns: number[] = [];
    let ended = false;
    for (let t = 0; t < 60_000 && !ended; t++) {
      for (const e of step(world, collectCommands(world, agents))) {
        if (e.kind === SimEventKind.tagIn) tagIns.push(e['to'] ?? -1);
        if (e.kind === SimEventKind.matchEnded) ended = true;
      }
    }
    expect(ended).toBe(true);
    expect(tagIns.length).toBeGreaterThan(0);
  });
});
