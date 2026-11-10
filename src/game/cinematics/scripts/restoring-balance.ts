import type { CineScript } from '../../cine/types';

/** Chain end: legacy `GamePersist.saveStart(); Main.currentObjectives("chapter1")`. */
export const CHAPTER_1_OBJECTIVES = 'chapter1-objectives';

/** Legacy scene "Restoring Balance" (tag legacy-crafty-1.0: war/WEB-INF/private/src/scenes.js). */
export const RESTORING_BALANCE_SCRIPT: CineScript = {
  id: 'restoring-balance',
  title: 'Restoring Balance',
  background: 'stars',
  sprites: [
    {
      id: 'pria',
      texture: 'priaUnbalanced',
      reelMs: 5000,
      size: 0.5,
      startAlpha: 0.5,
      step: { stepMs: 1, alphaMul: 1.05, grow: 1.5 },
    },
    {
      id: 'chaoticFire',
      texture: 'chaoticFire',
      size: 0.5,
      startAlpha: 0,
      step: { stepMs: 1, alphaAdd: 0.05, alphaMax: 0.5, grow: 3 },
    },
  ],
  finale: {
    flashMs: 500,
    eyes: {
      texture: 'evilEyes',
      startAlpha: 0.1,
      growMul: 1.01,
      regrowMul: 1.005,
      peakAlpha: 1,
      fallMul: 0.995,
      regrowAtAlpha: 0.75,
      stepMs: 10,
    },
    voice: '[A Dark Voice: Come Tamer.  Come and face me if you do not value your life...]',
  },
  header: { text: 'Restoring Balance', fadePerStep: 0.03, stepMs: 150, removeAtAlpha: 0.5 },
  caption: {
    text:
      'And only then ... will you have the power to journey to the center of Pria and ' +
      'chance to unravel the mystery of this disturbance and ' +
      'restore the balance.<br/>  The fate of Pria lies in your hands ...',
    startAlpha: 0.5,
    fadeInPerStep: 0.1,
    fadeInSteps: 10,
    stepMs: 150,
    prompt: '[Press any key to continue]',
  },
  next: CHAPTER_1_OBJECTIVES,
};
