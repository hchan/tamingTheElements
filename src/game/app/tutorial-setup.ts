import { Cmd, type Agent } from '@core/index';
import type { ArenaLaunch } from '../scenes/launch';
import { DEFAULT_PICK, parsePick, type ArcadePick } from './arcade-pick';
import { arcadeLaunch, type ArcadeLaunchOptions, type ArcadeResult } from './arcade-setup';
import { seedForStage } from './tour-match';
import { TUTORIAL_SCENES, type TutorialSceneKey } from './tutorial-steps';

/** The practice foe: stands still and never presses anything (no core change; any `Agent` can drive side 1). */
export const IDLE_AGENT: Agent = {
  id: 'tutorial-idle',
  observe: () => 0,
  save: () => null,
  load: () => undefined,
};

/** The pick of a lesson scene, easy level (the AI it replaces is never used). Lessons 1 to 7 are the fire scene. */
export const tutorialPick = (scene: TutorialSceneKey): ArcadePick => {
  const s = TUTORIAL_SCENES[scene];
  return parsePick({ ...DEFAULT_PICK, player: s.hero, enemy: s.foe, level: 'easy', stage: s.stage });
};
export const TUTORIAL_PICK: ArcadePick = tutorialPick('fire');

/** Command bits the ring can name, so the overlay and the action bar agree on which slot is "attack" and "ability". */
export const ABILITY_CMD = { primary: Cmd.primary, secondary: Cmd.secondary } as const;

export interface TutorialLaunchOptions extends Pick<ArcadeLaunchOptions, 'onView' | 'onRestart'> {
  readonly onResult: (r: ArcadeResult) => void;
}

/** The Versus launch with the foe swapped for the idle agent; nothing is recorded and no store is reachable. The seed is steered to the scene's stage. */
export function tutorialLaunch(seed: number, scene: TutorialSceneKey, o: TutorialLaunchOptions): ArenaLaunch {
  const base = arcadeLaunch(tutorialPick(scene), seedForStage(seed, scene), { ...o, record: false, replays: { add: () => Promise.resolve() } });
  return { ...base, enemy: IDLE_AGENT };
}
