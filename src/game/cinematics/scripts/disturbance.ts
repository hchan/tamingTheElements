import type { CineScript } from '../../cine/types';

/** Legacy scene "The Disturbance" (tag legacy-crafty-1.0: war/WEB-INF/private/src/scenes.js). */
export const DISTURBANCE_SCRIPT: CineScript = {
  id: 'the-disturbance',
  title: 'The Disturbance',
  background: 'stars',
  sprites: [
    {
      id: 'pria',
      texture: 'priaUnbalanced',
      reelMs: 5000,
      size: 0.5,
      startAlpha: 0.5,
      step: { stepMs: 200, rotateDeg: 0.3, alphaMul: 1.05 },
    },
    {
      id: 'chaoticFire',
      texture: 'chaoticFire',
      size: 0.5,
      startAlpha: 0,
      step: {
        stepMs: 200,
        alphaAdd: 0.05,
        alphaMax: 0.5,
        grow: 4,
        growUntilScale: 1.5,
        sizeRefId: 'pria',
      },
    },
  ],
  header: { text: 'The Disturbance', fadePerStep: 0.03, stepMs: 150, removeAtAlpha: 0.5 },
  caption: {
    text: 'And then one day the planet fractured from within.  A disturbance has unfolded throughout the land',
    startAlpha: 0.5,
    fadeInPerStep: 0.1,
    fadeInSteps: 10,
    stepMs: 150,
    prompt: '[Press any key to continue]',
  },
  next: 'call-of-the-tamer',
};
