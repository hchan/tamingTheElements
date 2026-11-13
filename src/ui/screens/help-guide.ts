import { codeLabel, type Bindings, type GameAction } from '../../game/platform/input/bindings';

/** The short "how to fight" lessons, the numbered action bar and the hero picker steps, as words (Help page). */

export interface HelpLesson {
  readonly title: string;
  readonly text: string;
}

/** The core loop in the order a new fighter needs it; each lesson is one or two plain sentences. */
export const LESSONS: readonly HelpLesson[] = [
  { title: 'Move', text: 'Walk the arena in eight directions. Your hero turns to face the enemy by itself; hold a direction to aim by hand.' },
  { title: 'Attack', text: 'Strike with the first or second attack. Each has its own cooldown, so mix them rather than mash one.' },
  { title: 'Dash', text: 'A short burst away from danger or through a gap. It needs a moment to recover.' },
  { title: 'Guard', text: 'Hold to take less harm. The guard meter drains while you hold and breaks if it runs dry, so release in time.' },
  { title: 'Charge', text: 'Melee heroes lunge at the foe. Ranged heroes have no charge, so the button hides.' },
  { title: 'Weather', text: 'Fills as you fight. Spend it to turn the sky against your enemy.' },
  { title: 'Super', text: 'The meter fills as you land and take hits. At full, one blow turns the fight.' },
  { title: 'Tag', text: 'Swap a wounded hero for a fresh one from your team. The benched hero rests, but tagging has a cooldown.' },
  { title: 'Trap and Element', text: "Lay a trap and let the enemy walk into it. Element fires your hero's own elemental power." },
];

export interface BarKey {
  readonly key: string;
  readonly name: string;
}

/** The numbered row: each box wears its digit while that digit is bound to it, else the action's first key. */
const BAR: readonly (readonly [string, GameAction, string])[] = [
  ['Attack', 'slot1', 'Digit1'],
  ['Second attack', 'slot2', 'Digit2'],
  ['Tag', 'slot3', 'Digit3'],
  ['Tag 2', 'slot4', 'Digit4'],
  ['Charge', 'charge', 'Digit5'],
  ['Weather', 'weather', 'Digit6'],
  ['Dash', 'dash', 'Digit7'],
  ['Guard', 'guard', 'Digit8'],
  ['Super', 'super', 'Digit9'],
  ['Trap', 'trap', 'Digit0'],
  ['Element', 'elemental', 'Minus'],
];

/** The action bar, left to right, as the key that fires each box now (so rebinds show). */
export function actionBarKeys(b: Bindings): readonly BarKey[] {
  return BAR.map(([name, action, code]) => {
    const keys = b[action];
    const use = keys.includes(code) ? code : keys[0];
    return { name, key: use === undefined ? 'unbound' : codeLabel(use) };
  });
}

/** Building a team on the hero picker, step by step (text only). */
export const PICKER_STEPS: readonly string[] = [
  'Select a hero tile (click, tap or Enter) to put it in the next empty slot.',
  'Select the same tile again, or the x button on its slot, to take the hero back out. Delete does the same from the keyboard.',
  'Drag a slot off the team to remove it, or press B on a gamepad.',
  'Fight starts once every slot holds a hero; the page says how many more you need.',
];
