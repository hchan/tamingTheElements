import type { CineScript } from '../../cine/types';

/** Legacy scene "Homeworld: Pria" (tag legacy-crafty-1.0: war/WEB-INF/private/src/scenes.js). */
export const PRIA_SCRIPT: CineScript = {
  id: 'homeworld-pria',
  title: 'Homeworld: Pria',
  background: 'stars',
  sprites: [
    {
      id: 'pria',
      texture: 'pria',
      size: 0.5,
      startAlpha: 0.5,
      step: { stepMs: 200, rotateDeg: 0.3, alphaMul: 1.05 },
    },
  ],
  header: { text: 'Homeworld: Pria', fadePerStep: 0.03, stepMs: 150, removeAtAlpha: 0.5 },
  caption: {
    text:
      'For many millennia, Pria has been at peace, but in recent years, ' +
      'there were signs of a lingering shadow over this planet, an omen of a darker time to come ...',
    startAlpha: 0.5,
    fadeInPerStep: 0.1,
    fadeInSteps: 10,
    stepMs: 150,
    prompt: '[Press any key to continue]',
  },
  next: 'the-disturbance',
};
