import type { CineScript } from '../../cine/types';

/** Legacy scene "Call of the Tamer" (war/WEB-INF/private/src/scenes.js). */
export const CALL_OF_THE_TAMER_SCRIPT: CineScript = {
  id: 'call-of-the-tamer',
  title: 'Call of the Tamer',
  background: 'risingSun',
  sprites: [
    {
      id: 'elementalSigns',
      texture: 'elementalSigns',
      size: 0.5,
      startAlpha: 0.25,
      // The spin: alpha grows 10% per 50 ms; once opaque it rotates 5 degrees and shrinks 4 px per side.
      step: {
        stepMs: 50,
        alphaMul: 1.1,
        opaqueAt: 1,
        opaque: { rotateDeg: 5, shrink: 4 },
        removeBelowSize: 0.125,
      },
    },
  ],
  avatars: {
    elements: ['fire', 'earth', 'water', 'air'],
    size: 0.25,
    stepMs: 200,
    startAlpha: 0.25,
    rotateDeg: 1,
    peakAlpha: 1,
    fallMul: 0.9,
    removeBelowAlpha: 0.25,
    spawnEveryMs: 500,
  },
  header: { text: 'Call of the Tamer', fadePerStep: 0.03, stepMs: 150, removeAtAlpha: 0.5 },
  caption: {
    text:
      'As  Pria cries out for a hero, you have risen to this challenge as the Tamer.' +
      '  You must wield the power the of elements: fire, earth, water and air, by taming and training Elementals.' +
      '  And only then...',
    startAlpha: 0.5,
    fadeInPerStep: 0.1,
    fadeInSteps: 10,
    stepMs: 150,
    prompt: '[Press any key to continue]',
  },
  next: 'restoring-balance',
};
