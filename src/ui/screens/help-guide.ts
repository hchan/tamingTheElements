import { codeLabel, type Bindings, type GameAction } from '../../game/platform/input/bindings';

/** The short "how to fight" lessons, the numbered action bar and the hero picker steps, as words (Help page). */

export interface HelpLesson {
  readonly title: string;
  readonly text: string;
}

/** The core loop in the order a new fighter needs it; each lesson is one or two plain sentences. */
export const LESSONS: readonly HelpLesson[] = [
  { title: 'Move', text: 'Walk the arena in eight directions. Your hero turns to face the enemy by itself; hold a direction to aim by hand.' },
  { title: 'Attack', text: "Strike 1 and Strike 2 fire your hero's two attacks, and each circle on a phone names its ability (Fire Blast, Ice Shock and so on). Each has its own cooldown, so mix them rather than mash one." },
  { title: 'Dash', text: 'A short burst away from danger or through a gap. It needs a moment to recover.' },
  { title: 'Guard', text: 'Hold to take less harm. The guard meter drains while you hold and breaks if it runs dry, so release in time.' },
  { title: 'Charge', text: 'Melee heroes lunge at the foe. Ranged heroes have no charge, so the button is dimmed.' },
  { title: 'Weather', text: 'Fills as you fight. Spend it to turn the sky against your enemy.' },
  { title: 'Super', text: 'The meter fills as you land and take hits. At full, one blow turns the fight.' },
  { title: 'Tag', text: 'Swap a wounded hero for a fresh one from your team. The benched hero rests, but tagging has a cooldown.' },
  { title: 'Trap and Element', text: "Lay a trap and let the enemy walk into it. Element fires your hero's own elemental power." },
  { title: 'Cleanse', text: 'Shake off your own roots and slows. Every hero has it, it plays out in their element, and it takes about ten seconds to be ready again.' },
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
  ['Cleanse', 'cleanse', 'Equal'],
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

/** Symbol keys get a word next to their chip, so "-" never reads as a dash or a typo. */
export const KEY_WORDS: Readonly<Record<string, string>> = {
  '-': 'minus',
  '=': 'equals',
  ';': 'semicolon',
  "'": 'apostrophe',
  '.': 'full stop',
  ',': 'comma',
  '/': 'slash',
  '[': 'left bracket',
  ']': 'right bracket',
};

/** The "Ways to play" section: one short paragraph per menu entry (player-facing words only). */
export const MODES_COPY: readonly string[] = [
  'Play: the World Tour. Pick three heroes and fight through nine stages, each a best of three against a computer team: eight element arenas, then the Eternal Void. A lost fight can be replayed up to 3 times, and the run is saved in this browser.',
  "Versus: one fight set up your way: your hero, a partner for 2v2 or two for 3v3, the opponent, the computer's level and the arena.",
  'Online: play a friend on another device over the internet. One of you hosts and sends a code, the other joins and sends a code back; then each of you picks three heroes.',
  'Teams: in 2v2 and 3v3 one hero per side fights at a time. Tag swaps in a rested teammate; benched heroes show under the life bars.',
];

/** The "Reading the arena" section: shapes, floor patches, badges, weather and meters. */
export const ARENA_SHAPES =
  'Each element has a shape as well as a colour: fire is a triangle, water a circle, earth a square, air a diamond, and the Eternal Void a star. Hero names always say the element in words too.';
export const ARENA_PATCH_INTRO = 'Some floor tiles carry an element. They help only a hero of the same element:';
export const ARENA_PATCHES: readonly string[] = [
  'FIRE x2: double damage.',
  'WATER +HP: slow healing.',
  'ROCK: solid rock. Only an earth hero can cross it, and it stops shots.',
  'AIR x2: double speed (not on top of a Dash).',
];
export const ARENA_NOTES: readonly string[] = [
  "While you stand in your element's patch a badge shows its effect (FIRE x2, HEAL, ROCK PASS or AIR x2) next to the weather badge.",
  "Weather (SUN, RAIN, SAND, GALE or ECLIPSE) shows how long it lasts, and turns the floor to the caster's element.",
  'The SUPER meter fills as you fight; when it is full your Super is ready.',
  'Life totals differ by hero: read the number, not just the bar.',
];
