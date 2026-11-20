import type { SlotKind } from '../hud/action-bar';

/**
 * The how-to-play lessons (slice 1: lessons 1 to 4) as data, with the pure rule that moves from one lesson to the next.
 * No Phaser, no DOM: the overlay (`ui/screens/tutorial-overlay.ts`) draws the current step and `tutorial.ts` feeds it the
 * sim events that `event-fx.ts` bridges to `tte:sim-event`.
 */

/** Which action-bar slot a lesson points at: an ability slot by its command, or a slot kind. */
export type TutorialTarget = { readonly kind: 'ability'; readonly which: 'primary' | 'secondary' } | { readonly kind: Exclude<SlotKind, 'ability'> };

export interface TutorialStep {
  readonly id: 'attack' | 'ability' | 'super' | 'element';
  readonly title: string;
  readonly prompt: string;
  /** The slot to ring, or null when the lesson is about the arena itself. */
  readonly target: TutorialTarget | null;
}

/** What the sim told us, as bridged by `simEventBridge` in `fx/event-fx.ts` (the lesson only needs these two). */
export type TutorialEvent = { readonly kind: 'hit'; readonly ability: number } | { readonly kind: 'super' };

export interface TutorialProgress {
  /** Index into `TUTORIAL_STEPS`; equal to its length once every lesson is done. */
  readonly index: number;
  /** The ability of the first landed hit, so lesson 2 can tell "a different ability" from "the same one again". */
  readonly firstAbility: number | null;
  /** Hits landed in the current lesson (lesson 4 wants two). */
  readonly hits: number;
}

/** Fire beats air, air beats earth, earth beats water, water beats fire; the stronger element deals x1.25. */
export const ELEMENT_LINE = 'Fire beats air, air beats earth, earth beats water, water beats fire. The stronger element deals 25% more.';

export const TUTORIAL_HERO = 'fiara';
export const TUTORIAL_FOE = 'wispera';
/** Lesson 4: how many hits on the weaker element show the bonus. */
export const ELEMENT_HITS = 2;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'attack', title: 'Lesson 1: Attack', prompt: 'Hit the training foe with the highlighted attack: face it and press the key or button.', target: { kind: 'ability', which: 'secondary' } },
  { id: 'ability', title: 'Lesson 2: Abilities', prompt: 'Use a different attack and land it too. Walk up close to the foe and use Melee (H).', target: null },
  { id: 'super', title: 'Lesson 3: Super', prompt: 'Landing hits fills the Super bar. When the Super slot lights up, press it.', target: { kind: 'super' } },
  { id: 'element', title: 'Lesson 4: Elements', prompt: `Your hero is fire and the foe is air. ${ELEMENT_LINE} Land two hits.`, target: null },
];

export const initialProgress = (): TutorialProgress => ({ index: 0, firstAbility: null, hits: 0 });
export const isFinished = (p: TutorialProgress): boolean => p.index >= TUTORIAL_STEPS.length;
export const currentStep = (p: TutorialProgress): TutorialStep | undefined => TUTORIAL_STEPS[p.index];

const next = (p: TutorialProgress, patch: Partial<TutorialProgress> = {}): TutorialProgress => ({ ...p, index: p.index + 1, hits: 0, ...patch });

/** The lesson after one more event; events that do not belong to the current lesson leave it as it was. */
export function advance(p: TutorialProgress, e: TutorialEvent): TutorialProgress {
  const step = currentStep(p);
  if (!step) return p;
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
  }
}
