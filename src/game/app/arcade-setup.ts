import {
  Cmd,
  DEFAULT_SIM_FLAGS,
  EntityFlag,
  RoundPhase,
  SIM_VERSION,
  getCharacter,
  type Agent,
  type AgentState,
  type CharacterId,
  type MatchSetup,
  type RenderView,
  type ReplayFile,
} from '@core/index';
import { ScriptedAI, scriptedProfileFor } from '@core/lazy-index';
import type { ReplayStore } from '../platform/storage/replay-store';
import { mountAimIndicator } from '../fx/aim-view';
import { mountArenaPan } from '../fx/arena-pan';
import { getPrefs } from '../platform/a11y/prefs';
import { PlaytestRecorder } from '../replay/playtest-recorder';
import type { ArenaLaunch } from '../scenes/launch';
import { ARCADE_AI_LEVELS, ARCADE_RACES, DEFAULT_PICK, type ArcadePick } from './arcade-pick';

/**
 * Arcade Versus (FUN-DESIGN WP 11, 2v2 in WP 20), the Phaser-free match builder: the sim setup, the Arcade AI and the
 * launch. Its own lazy chunk (`arcade-setup`), loaded with the battle, so the picker chunk stays small. It is a separate
 * flow from the story (`flow.ts`): no save is read or written here, so no XP, capture, objective or garrison change can
 * come out of an Arcade match. The only thing it may store is the playtest replay (when recording).
 */

/**
 * The AI's second race in 2v2: drawn from the match seed among the races neither side picked (the sim allows mirrors,
 * but two identical bots on one spot trade cancelling shots, see tools/sim/run-match.ts), so a seed replays the same team.
 */
export function enemyPartner(pick: ArcadePick, seed: number): CharacterId {
  const free = ARCADE_RACES.filter((r) => r !== pick.player && r !== pick.partner && r !== pick.partner2 && r !== pick.enemy);
  return free[(seed >>> 0) % free.length] ?? pick.enemy;
}

/**
 * The AI's partners: none in 1v1, `enemyPartner` in 2v2, and in 3v3 (WP-arcade-3v3) a third race drawn from the seed's
 * higher bits among the races still free.
 */
export function enemyPartners(pick: ArcadePick, seed: number): CharacterId[] {
  if (!pick.partner) return [];
  const first = enemyPartner(pick, seed);
  if (!pick.partner2) return [first];
  const free = ARCADE_RACES.filter((r) => r !== pick.player && r !== pick.partner && r !== pick.partner2 && r !== pick.enemy && r !== first);
  return [first, free[((seed >>> 0) >>> 8) % free.length] ?? pick.enemy];
}

/** Arcade on, `difficulty: 1` (Arcade never scales stats by difficulty), chapter 1 (no Capture), 0 XP; 1, 2 or 3 heroes a side. */
export function arcadeSetup(pick: ArcadePick, seed: number): MatchSetup {
  const hero = (character: CharacterId): { character: CharacterId; xp: number } => ({ character, xp: 0 });
  return {
    simVersion: SIM_VERSION,
    seed: seed >>> 0,
    flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true },
    chapter: 1,
    difficulty: 1,
    p1: [pick.player, ...(pick.partner ? [pick.partner] : []), ...(pick.partner && pick.partner2 ? [pick.partner2] : [])].map(hero),
    p2: [pick.enemy, ...(pick.enemyBench ?? enemyPartners(pick, seed))].map(hero),
  };
}

/**
 * The Arcade AI for team 1 (never the random bot, FUN-DESIGN 2.11): the scripted AI with its Arcade layer at the picked
 * level; it plays Turtle when its element is at a disadvantage, else a personality drawn from the match seed. In 2v2/3v3 each
 * hero has its own scripted AI (its own kit) and the one in play answers; it tags when low (WP-arcade-tag). Like the tools'
 * team bot (`makeTeamAgent`), an idle hero steps onto the opponent's row, since a tag can drop it off every firing line.
 */
export function arcadeEnemy(pick: ArcadePick, setup: MatchSetup = arcadeSetup(pick, 0)): Agent {
  const level = ARCADE_AI_LEVELS.indexOf(pick.level) as 0 | 1 | 2;
  return teamAgent(setup.p2.map((m) => m.character), pick.player, setup.p1.length, level);
}

/**
 * The same scripted team AI for either side of a finished setup (the online two-context proof, `?ff=netbot`): `side`'s heroes
 * play against the other side's lead. It only produces that side's commands, so on a peer's own copy it never changes a hash.
 */
export function arcadeBot(setup: MatchSetup, side: 0 | 1, level: 0 | 1 | 2 = 1): Agent {
  const mine = side === 0 ? setup.p1 : setup.p2;
  const theirs = side === 0 ? setup.p2 : setup.p1;
  const foe = theirs[0]?.character ?? mine[0]?.character ?? DEFAULT_PICK.player;
  return teamAgent(mine.map((m) => m.character), foe, side === 0 ? 0 : setup.p1.length, level);
}

/** One scripted AI per hero (its own kit); `first` is the entity id of the team's first hero. */
function teamAgent(team: readonly CharacterId[], opponentLead: CharacterId, first: number, level: 0 | 1 | 2): Agent {
  const heroes = team.map((c) => new ScriptedAI(scriptedProfileFor(getCharacter(c), getCharacter(opponentLead)), { id: 'arcade-ai', level }));
  const lead = heroes[0] as Agent;
  if (heroes.length < 2) return lead;
  return {
    id: lead.id,
    observe: (view, tick) => {
      const cmd = (heroes[(view.self?.id ?? first) - first] ?? lead).observe(view, tick);
      const dy = (view.opponent?.y ?? 0) - (view.self?.y ?? 0);
      if (cmd !== 0 || Math.abs(dy) <= (view.opponent?.h ?? 0) / 2) return cmd;
      return dy > 0 ? Cmd.down : Cmd.up;
    },
    save: () => heroes.map((h) => h.save()),
    load: (state) => {
      heroes.forEach((h, i) => {
        h.load(Array.isArray(state) ? ((state as readonly AgentState[])[i] ?? null) : null);
      });
    },
  };
}

export type ArcadeOutcome = 'win' | 'lose' | 'draw';

/** One hero at the end of the match (the last round): its team, race, and HP per cent (0 when K.O.). */
export interface ArcadeHero {
  readonly team: number;
  readonly race: CharacterId;
  readonly pct: number;
}

export interface ArcadeResult {
  readonly outcome: ArcadeOutcome;
  readonly pick: ArcadePick;
  /** Round wins of the player and the AI (best of 3); absent if the sim did not report them. */
  readonly rounds?: readonly [number, number];
  /** The recorded replay (recording on and nothing invalidated it). */
  readonly replay?: ReplayFile;
  /** 2v2 and 3v3: every hero's state at the end, in roster order (team 0 first); absent in 1v1. */
  readonly heroes?: readonly ArcadeHero[];
}

export interface ArcadeLaunchOptions {
  readonly record: boolean;
  /** Only written to when recording; this is the replay store, never the save. */
  readonly replays: Pick<ReplayStore, 'add'>;
  readonly onResult: (r: ArcadeResult) => void;
  /** Tester mode is on: the recorded replay is flagged `cheats` (verifiers refuse it). */
  readonly cheats?: boolean;
  /** Called once with the battle's render view (the touch buttons read their ready state from it). */
  readonly onView?: (view: RenderView) => void;
}

/** Every hero's HP per cent off the render view, in roster (entity id) order. */
export function heroesOf(view: RenderView, setup: MatchSetup): ArcadeHero[] {
  const races = [...setup.p1, ...setup.p2].map((m) => m.character);
  const out: ArcadeHero[] = [];
  view.forEachCharacter((c) => {
    const race = races[c.id];
    const ko = (c.flags & EntityFlag.dead) !== 0 || c.hp <= 0;
    if (race) out.push({ team: c.team, race, pct: ko ? 0 : Math.max(1, Math.ceil((c.hp * 100) / Math.max(1, c.maxHp))) });
  });
  return out;
}

/** Launch data for the Arena: keyboard (team 0) against the Arcade AI; the recorder keeps the Arcade flag in its header. */
/** The player's active hero's HP fraction during a fight (1 otherwise), for the low-life heartbeat. View-only read. */
function activeLife(v: RenderView): number {
  const ar = v.arcade();
  if (!ar || ar.phase !== RoundPhase.fight) return 1;
  const id = ar.active(0);
  let life = 1;
  v.forEachCharacter((c) => {
    if (c.id === id && c.maxHp > 0) life = c.hp / c.maxHp;
  });
  return life;
}

export function arcadeLaunch(pick: ArcadePick, seed: number, o: ArcadeLaunchOptions): ArenaLaunch {
  const setup = arcadeSetup(pick, seed);
  const local = pick.local === true;
  const recorder = o.record ? new PlaytestRecorder(setup, o.cheats === true) : undefined;
  let view: RenderView | undefined;
  return {
    setup,
    ...(local ? { local2: true } : { enemy: arcadeEnemy(pick, setup) }),
    ...(recorder ? { recorder } : {}),
    // Arcade Versus only: the 8-way aim arrow and the Arcade audio layers (WP-arcade-audio-layers, their own chunk, on
    // the battle's sound as it is now); the view is kept for the 2v2 results.
    arcadeView: (arena, v, alpha) => {
      view = v;
      o.onView?.(v);
      mountAimIndicator(arena, v, alpha);
      mountArenaPan(arena, v, alpha, () => getPrefs().reduceMotion);
      const held = arena.audio;
      void import('../audio/arcade-audio').then((m) => { m.mountArcadeAudio(arena, held, () => v.arcade()?.sudden === true, () => activeLife(v)); });
    },
    onEnd: (end) => {
      const replay = recorder?.finish();
      if (replay) void o.replays.add(replay).catch(() => undefined);
      const outcome: ArcadeOutcome = end.winner === 0 ? 'win' : end.winner === 1 ? 'lose' : 'draw';
      const heroes = pick.partner && view ? heroesOf(view, setup) : undefined;
      o.onResult({ outcome, pick, ...(end.rounds ? { rounds: end.rounds } : {}), ...(replay ? { replay } : {}), ...(heroes ? { heroes } : {}) });
    },
  };
}
