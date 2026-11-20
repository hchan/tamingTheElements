import type { SlotKind } from '../hud/action-bar';

/**
 * The how-to-play lessons (lessons 1 to 11: basics, then weather, Cleanse, Guard and the four terrain patches) as data, with the pure rule that moves from one lesson to the next.
 * No Phaser, no DOM: the overlay (`ui/screens/tutorial-overlay.ts`) draws the current step and `tutorial.ts` feeds it the
 * sim events that `event-fx.ts` bridges to `tte:sim-event`.
 */

/** Which action-bar slot a lesson points at: an ability slot by its command, or a slot kind. */
export type TutorialTarget = { readonly kind: 'ability'; readonly which: 'primary' | 'secondary' } | { readonly kind: Exclude<SlotKind, 'ability'> };

export interface TutorialStep {
  readonly id: 'attack' | 'ability' | 'super' | 'element' | 'weather' | 'cleanse' | 'guard' | 'patchFire' | 'patchWater' | 'patchAir' | 'patchEarth';
  /** The hero, foe and stage the lesson is fought on; the fight restarts when the next lesson needs another one. */
  readonly scene: TutorialSceneKey;
  readonly title: string;
  readonly prompt: string;
  /** The slot to ring, or null when the lesson is about the arena itself. */
  readonly target: TutorialTarget | null;
}

export type TutorialSceneKey = 'fire' | 'water' | 'air' | 'earth';
export interface TutorialScene {
  readonly hero: string;
  readonly foe: string;
  /** The arena element (`seedForStage` steers the seed to it). */
  readonly stage: TutorialSceneKey;
}

/** One scene per patch lesson: the patch only works for a hero of the stage's element (rock blocks the shots of every other one). */
export const TUTORIAL_SCENES: Readonly<Record<TutorialSceneKey, TutorialScene>> = {
  fire: { hero: 'fiara', foe: 'wispera', stage: 'fire' },
  water: { hero: 'curomo', foe: 'fiara', stage: 'water' },
  air: { hero: 'wispera', foe: 'rokcore', stage: 'air' },
  earth: { hero: 'fiara', foe: 'wispera', stage: 'earth' },
};

/**
 * What the sim told us, as bridged by `simEventBridge` and `lessonBridge` in `fx/sim-event-bridge.ts`, plus `guard` (the Guard
 * slot lit up, seen by `tutorial.ts` from the action bar: a practice foe never hits, so there is no `guarded` event to wait for).
 */
export type TutorialEvent =
  | { readonly kind: 'hit'; readonly ability: number }
  | { readonly kind: 'super' | 'weather' | 'cleanse' | 'guard' | 'patch' | 'patchLeft' | 'heal' | 'blocked' };

export interface TutorialProgress {
  /** Index into `TUTORIAL_STEPS`; equal to its length once every lesson is done. */
  readonly index: number;
  /** The ability of the first landed hit, so lesson 2 can tell "a different ability" from "the same one again". */
  readonly firstAbility: number | null;
  /** Hits landed in the current lesson (lesson 4 wants two). */
  readonly hits: number;
  /** The hero stands on a patch of its element (patch lessons). */
  readonly onPatch: boolean;
}

/** Fire beats air, air beats earth, earth beats water, water beats fire; the stronger element deals x1.25. */
export const ELEMENT_LINE = 'Fire beats air, air beats earth, earth beats water, water beats fire. The stronger element deals 25% more.';

export const TUTORIAL_HERO = TUTORIAL_SCENES.fire.hero;
export const TUTORIAL_FOE = TUTORIAL_SCENES.fire.foe;
/** Lesson 4: how many hits on the weaker element show the bonus. */
export const ELEMENT_HITS = 2;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'attack', scene: 'fire', title: 'Lesson 1: Attack', prompt: 'Hit the training foe with the highlighted attack: face it and press the key or button.', target: { kind: 'ability', which: 'secondary' } },
  { id: 'ability', scene: 'fire', title: 'Lesson 2: Abilities', prompt: 'Use a different attack and land it too. Walk up close to the foe and use Melee (H).', target: null },
  { id: 'super', scene: 'fire', title: 'Lesson 3: Super', prompt: 'Landing hits fills the Super bar. When the Super slot lights up, press it.', target: { kind: 'super' } },
  { id: 'element', scene: 'fire', title: 'Lesson 4: Elements', prompt: `Your hero is fire and the foe is air. ${ELEMENT_LINE} Land two hits.`, target: null },
  { id: 'weather', scene: 'fire', title: 'Lesson 5: Weather', prompt: 'Casting attacks fills the Weather bar. When the Weather slot lights up, press it: the sky changes for a while and favours one element.', target: { kind: 'weather' } },
  { id: 'cleanse', scene: 'fire', title: 'Lesson 6: Cleanse', prompt: 'Cleanse removes slows, roots and other debuffs from you, and it has its own cooldown. Press the highlighted Cleanse slot.', target: { kind: 'cleanse' } },
  { id: 'guard', scene: 'fire', title: 'Lesson 7: Guard', prompt: 'Guard cuts the damage you take while it is held, and the bar drains as it takes hits. Hold the highlighted Guard slot.', target: { kind: 'guard' } },
  { id: 'patchFire', scene: 'fire', title: 'Lesson 8: Fire patch', prompt: 'On a fire stage, a fire hero standing on a glowing patch burns hotter: attacks deal double damage. Walk onto a patch and land a hit.', target: null },
  { id: 'patchWater', scene: 'water', title: 'Lesson 9: Water patch', prompt: 'On a water stage, a water hero standing on a patch heals a little every second. Walk onto a patch.', target: null },
  { id: 'patchAir', scene: 'air', title: 'Lesson 10: Air patch', prompt: 'On an air stage, an air hero standing on a patch moves faster. Walk onto a patch and feel the speed.', target: null },
  { id: 'patchEarth', scene: 'earth', title: 'Lesson 11: Rock patch', prompt: 'On an earth stage, the rocks block everyone but earth heroes: they stop walkers and shots. Fire an attack into a rock.', target: null },
];

export const initialProgress = (): TutorialProgress => ({ index: 0, firstAbility: null, hits: 0, onPatch: false });
export const isFinished = (p: TutorialProgress): boolean => p.index >= TUTORIAL_STEPS.length;
export const currentStep = (p: TutorialProgress): TutorialStep | undefined => TUTORIAL_STEPS[p.index];

const next = (p: TutorialProgress, patch: Partial<TutorialProgress> = {}): TutorialProgress => ({ ...p, index: p.index + 1, hits: 0, onPatch: false, ...patch });

/** The lesson after one more event; events that do not belong to the current lesson leave it as it was. */
export function advance(p: TutorialProgress, e: TutorialEvent): TutorialProgress {
  const step = currentStep(p);
  if (!step) return p;
  // Where the hero stands is tracked in every lesson, so a patch it already stands on counts for the fire lesson.
  if (e.kind === 'patch' && step.id !== 'patchWater' && step.id !== 'patchAir') p = { ...p, onPatch: true };
  else if (e.kind === 'patchLeft') p = { ...p, onPatch: false };
  switch (step.id) {
    case 'attack':
      return e.kind === 'hit' ? next(p, { firstAbility: e.ability }) : p;
    case 'ability':
      return e.kind === 'hit' && e.ability !== p.firstAbility ? next(p) : p;
    case 'super':
      return e.kind === 'super' ? next(p) : p;
    case 'element': {
      if (e.kind !== 'hit') return p;
      const hits = p.hits + 1;
      return hits >= ELEMENT_HITS ? next(p) : { ...p, hits };
    }
    case 'weather':
      return e.kind === 'weather' ? next(p) : p;
    case 'cleanse':
      return e.kind === 'cleanse' ? next(p) : p;
    case 'guard':
      return e.kind === 'guard' ? next(p) : p;
    case 'patchFire':
      return e.kind === 'hit' && p.onPatch ? next(p, { onPatch: false }) : p;
    case 'patchWater':
    case 'patchAir':
      return e.kind === 'patch' ? next(p, { onPatch: false }) : p;
    case 'patchEarth':
      return e.kind === 'blocked' ? next(p) : p;
  }
}
