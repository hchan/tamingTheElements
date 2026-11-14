import type Phaser from 'phaser';
import type { Agent, LockstepSession, MatchSetup, RenderView, ReplayFile, SessionStatus, Transport } from '@core/index';
import type { TesterSession } from '../platform/tester/session';
import type { PlaytestRecorder } from '../replay/playtest-recorder';
import type { ArenaAudio } from '../audio/arena-audio';

/** Game event emitted when Preload has finished (Phaser-free so DOM code can listen for it). */
export const PRELOAD_READY = 'preload-ready';

/** Texture keys and URLs (relative to `<base>assets/`) of the Arcade stage art, here so Preload can load them without the lazy terrain-view chunk. */
export const STAGE_TEXTURE = 'stagebg';
export const STAGE_URL = 'img/stagebg.png';
export const PAINT_TEXTURE = 'arenafloor';
export const PAINT_URL = 'img/arenafloor.png';
export const TILE_TEXTURE = 'tilefloor';
export const TILE_URL = 'img/tilefloor.png';

/** What Arena reports when the sim emits MatchEnded; the app flow turns it into a save update. */
export interface MatchEnd {
  /** 0 = player team, 1 = enemy team, -1 = nobody. */
  readonly winner: number;
  /** Roster index (within team 0) of the active character at the end. */
  readonly activeSlot: number;
  /** Roster indices (within team 1) of captured opponents. */
  readonly capturedIndices: readonly number[];
  /** Arcade only: round wins of team 0 and team 1 (best of 3, FUN-DESIGN 2.10), from `matchEnded`. */
  readonly rounds?: readonly [number, number];
}

/** Replay playback rate: 0.5 advances one tick every other frame (slow motion). */
export type PlaybackSpeed = 0.5 | 1 | 2;

/** Live state of a replay playing in the Arena, for the viewer's status line. */
export interface PlaybackStatus {
  readonly tick: number;
  readonly total: number;
  readonly state: 'playing' | 'ok' | 'diverged';
  readonly paused: boolean;
  readonly speed: PlaybackSpeed;
  /** Checkpoint tick of the first hash mismatch. */
  readonly divergentTick?: number;
}

/** Controls the Arena hands to the viewer once it is running. */
export interface PlaybackControls {
  setSpeed(speed: PlaybackSpeed): void;
  setPaused(paused: boolean): void;
  /** Pauses and advances one tick. */
  step(): void;
}

/** A replay to play back (no keyboard, no enemy agent), verifying its hashes as it goes. */
export interface ArenaPlayback {
  readonly replay: ReplayFile;
  readonly onStatus: (s: PlaybackStatus) => void;
  readonly attach: (c: PlaybackControls) => void;
}

/** Data handed to the Arena scene (Phaser-free so the app flow can build it without loading Phaser). */
export interface ArenaLaunch {
  readonly setup: MatchSetup;
  /** Agent for the enemy side; the player side is always the keyboard. Absent when `playback` is set. */
  readonly enemy?: Agent;
  /** Local two-player (Arcade Versus): a second KeyboardAgent (Player 2's keys, the second gamepad) drives side 1; no `enemy`. */
  readonly local2?: boolean;
  readonly onEnd?: (end: MatchEnd) => void;
  /** Records the final command pair of every tick (only present when recording is enabled). */
  readonly recorder?: PlaytestRecorder;
  readonly playback?: ArenaPlayback;
  /** Online match (docs/NETCODE.md): the keyboard drives `side`, a LockstepSession over `input` steps the shared sim. */
  readonly net?: {
    readonly side: 0 | 1;
    readonly input: Transport;
    /** Dev/test builds only (`?ff=netbot`): drives the local side instead of the keyboard. It only makes this peer's own commands, which go over the wire, so it cannot desync. */
    readonly agent?: Agent;
    /** Match number on the link (a rematch bumps it); default 0. */
    readonly match?: number;
    /** Dev/test builds only (`?matchticks=N`): the match ends as a draw at this tick, so a rematch can be tested quickly. */
    readonly tickLimit?: number;
    readonly onStatus?: (status: SessionStatus, session: LockstepSession) => void;
  };
  /** Present only in tester mode (docs/TESTER-MODE.md): the session the Arena registers its cheat bridge with. */
  readonly tester?: { readonly session: TesterSession; readonly openPanel: () => void };
  /**
   * Arcade-only view extras from a lazy chunk (the 8-way aim indicator and the Arcade audio layers), mounted once in the
   * Arena's `create` (after its audio) with the render view and the frame's interpolation alpha; they clean up on the
   * scene's shutdown.
   */
  readonly arcadeView?: (scene: Phaser.Scene & { readonly audio?: ArenaAudio }, view: RenderView, alpha: () => number) => void;
}
