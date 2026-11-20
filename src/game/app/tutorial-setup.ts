import { Cmd, type Agent } from '@core/index';
import type { ArenaLaunch } from '../scenes/launch';
import { DEFAULT_PICK, parsePick, type ArcadePick } from './arcade-pick';
import { arcadeLaunch, type ArcadeLaunchOptions, type ArcadeResult } from './arcade-setup';
import { TUTORIAL_FOE, TUTORIAL_HERO } from './tutorial-steps';

/** The practice foe: stands still and never presses anything (no core change; any `Agent` can drive side 1). */
export const IDLE_AGENT: Agent = {
  id: 'tutorial-idle',
  observe: () => 0,
  save: () => null,
  load: () => undefined,
};

/** Fire hero against an air foe on the fire stage, easy level (the AI it replaces is never used). */
export const TUTORIAL_PICK: ArcadePick = parsePick({ ...DEFAULT_PICK, player: TUTORIAL_HERO, enemy: TUTORIAL_FOE, level: 'easy', stage: 'fire' });

/** Command bits the ring can name, so the overlay and the action bar agree on which slot is "attack" and "ability". */
export const ABILITY_CMD = { primary: Cmd.primary, secondary: Cmd.secondary } as const;

export interface TutorialLaunchOptions extends Pick<ArcadeLaunchOptions, 'onView' | 'onRestart'> {
  readonly onResult: (r: ArcadeResult) => void;
}

/** The Versus launch with the foe swapped for the idle agent; nothing is recorded and no store is reachable. */
export function tutorialLaunch(seed: number, o: TutorialLaunchOptions): ArenaLaunch {
  const base = arcadeLaunch(TUTORIAL_PICK, seed, { ...o, record: false, replays: { add: () => Promise.resolve() } });
  return { ...base, enemy: IDLE_AGENT };
}
