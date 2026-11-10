import {
  CHARACTERS,
  Cmd,
  DEFAULT_SIM_FLAGS,
  SIM_VERSION,
  getCharacter,
  type Agent,
  type AgentState,
  type CharacterId,
  type Command,
  type MatchSetup,
  type ObservationView,
  type ReplayFile,
} from '@core/index';
import { ScriptedAI, scriptedProfileFor } from '@core/lazy-index';
import type { ReplayStore } from '../platform/storage/replay-store';
import { PlaytestRecorder } from '../replay/playtest-recorder';
import type { ArenaLaunch } from '../scenes/launch';

/**
 * Arcade Versus (FUN-DESIGN WP 11), the Phaser-free part: the fighter pick, the sim setup, the Arcade AI and the launch.
 * It is a separate flow from the story (`flow.ts`): no save is read or written here, so no XP, capture, objective or
 * garrison change can come out of an Arcade match. The only thing it may store is the playtest replay (when recording).
 */

/** The 12 playable races (the two void characters are story-only). */
export const ARCADE_RACES: readonly CharacterId[] = CHARACTERS.filter((c) => c.element !== 'void').map((c) => c.id);

/**
 * AI levels offered, capped at Normal (FUN-DESIGN 2.11 and WP 10). Only the Normal layer exists today; Easy is the same AI
 * that never supers (2.11's Easy super usage), and its other knobs arrive with WP-arcade-ai-personalities.
 */
export const ARCADE_AI_LEVELS = ['easy', 'normal'] as const;
export type ArcadeAiLevel = (typeof ARCADE_AI_LEVELS)[number];

export interface ArcadePick {
  readonly player: CharacterId;
  readonly enemy: CharacterId;
  readonly level: ArcadeAiLevel;
}

const race = (raw: string, fallback: CharacterId): CharacterId => ARCADE_RACES.find((r) => r === raw) ?? fallback;

/** Default: the owner playtest's Sindarosa (FUN-DESIGN section 7) against a ranged opponent, AI Normal. */
export const DEFAULT_PICK: ArcadePick = { player: 'sindarosa' as CharacterId, enemy: 'fiara' as CharacterId, level: 'normal' };

/** Form values to a pick; anything unknown falls back to the default. */
export function parsePick(raw: { readonly player: string; readonly enemy: string; readonly level: string }): ArcadePick {
  return {
    player: race(raw.player, DEFAULT_PICK.player),
    enemy: race(raw.enemy, DEFAULT_PICK.enemy),
    level: ARCADE_AI_LEVELS.find((l) => l === raw.level) ?? DEFAULT_PICK.level,
  };
}

/** One race each, Arcade on, `difficulty: 1` (Arcade never scales stats by difficulty), chapter 1 (no Capture), 0 XP. */
export function arcadeSetup(pick: ArcadePick, seed: number): MatchSetup {
  return {
    simVersion: SIM_VERSION,
    seed: seed >>> 0,
    flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true },
    chapter: 1,
    difficulty: 1,
    p1: [{ character: pick.player, xp: 0 }],
    p2: [{ character: pick.enemy, xp: 0 }],
  };
}

/** Easy: the Normal AI with the super bit dropped; memory and randomness stay the inner agent's. */
class NoSuperAgent implements Agent {
  readonly id: string;
  constructor(private readonly inner: Agent) {
    this.id = inner.id;
  }
  observe(view: ObservationView, tick: number): Command {
    return this.inner.observe(view, tick) & ~Cmd.super;
  }
  save(): AgentState {
    return this.inner.save();
  }
  load(state: AgentState): void {
    this.inner.load(state);
  }
}

/** The Arcade AI for team 1 (never the random bot, FUN-DESIGN 2.11): the scripted AI with its Arcade layer. */
export function arcadeEnemy(pick: ArcadePick): Agent {
  const ai = new ScriptedAI(scriptedProfileFor(getCharacter(pick.enemy), getCharacter(pick.player)), { id: 'arcade-ai' });
  return pick.level === 'easy' ? new NoSuperAgent(ai) : ai;
}

export type ArcadeOutcome = 'win' | 'lose' | 'draw';

export interface ArcadeResult {
  readonly outcome: ArcadeOutcome;
  readonly pick: ArcadePick;
  /** The recorded replay (recording on and nothing invalidated it). */
  readonly replay?: ReplayFile;
}

export interface ArcadeLaunchOptions {
  readonly record: boolean;
  /** Only written to when recording; this is the replay store, never the save. */
  readonly replays: Pick<ReplayStore, 'add'>;
  readonly onResult: (r: ArcadeResult) => void;
}

/** Launch data for the Arena: keyboard (team 0) against the Arcade AI; the recorder keeps the Arcade flag in its header. */
export function arcadeLaunch(pick: ArcadePick, seed: number, o: ArcadeLaunchOptions): ArenaLaunch {
  const setup = arcadeSetup(pick, seed);
  const recorder = o.record ? new PlaytestRecorder(setup) : undefined;
  return {
    setup,
    enemy: arcadeEnemy(pick),
    ...(recorder ? { recorder } : {}),
    onEnd: (end) => {
      const replay = recorder?.finish();
      if (replay) void o.replays.add(replay).catch(() => undefined);
      const outcome: ArcadeOutcome = end.winner === 0 ? 'win' : end.winner === 1 ? 'lose' : 'draw';
      o.onResult({ outcome, pick, ...(replay ? { replay } : {}) });
    },
  };
}
