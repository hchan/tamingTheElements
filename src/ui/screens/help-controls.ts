import { codeLabel, type Bindings, type GameAction } from '../../game/platform/input/bindings';

export interface ControlRow {
  readonly action: string;
  readonly keys: string;
  /** Single keys shown as chips in the table (the text in `keys` stays the plain-words form). */
  readonly chips?: readonly string[];
}
export interface ControlSection {
  readonly title: string;
  readonly rows: readonly ControlRow[];
}

/** Player 2's fixed keys (local two-player; not rebindable). Mirrors P2_BINDINGS in src/game/input/local-two.ts (a test pins it). */
export const P2_KEYS: readonly ControlRow[] = [
  { action: 'Move', keys: 'I J K L' },
  { action: 'Attack', keys: 'U', chips: ['U'] },
  { action: 'Second attack', keys: 'O', chips: ['O'] },
  { action: 'Dash', keys: 'Y', chips: ['Y'] },
  { action: 'Guard (hold)', keys: 'N', chips: ['N'] },
  { action: 'Weather', keys: 'T', chips: ['T'] },
  { action: 'Charge', keys: 'G', chips: ['G'] },
  { action: 'Super', keys: 'B', chips: ['B'] },
  { action: 'Trap', keys: 'M', chips: ['M'] },
  { action: 'Element', keys: ';', chips: [';'] },
  { action: 'Cleanse', keys: "'", chips: ["'"] },
  { action: 'Run Away / Run Towards', keys: '/', chips: ['/'] },
  { action: 'Tag', keys: '.', chips: ['.'] },
  { action: 'Tag 2', keys: ',', chips: [','] },
];

const P1_ROWS: readonly (readonly [string, GameAction])[] = [
  ['Attack', 'slot1'],
  ['Second attack', 'slot2'],
  ['Snag (some heroes)', 'capture'],
  ['Dash', 'dash'],
  ['Guard (hold)', 'guard'],
  ['Weather', 'weather'],
  ['Charge', 'charge'],
  ['Super', 'super'],
  ['Trap', 'trap'],
  ['Element', 'elemental'],
  ['Cleanse', 'cleanse'],
  ['Run Away / Run Towards', 'run'],
  ['Tag', 'slot3'],
  ['Tag 2', 'slot4'],
];

const keysOf = (b: Bindings, a: GameAction): string => b[a].map(codeLabel).join(' or ');

/** Player 1's keyboard controls, read from the live bindings so rebinds show. */
export function player1Rows(b: Bindings): readonly ControlRow[] {
  const move = (['up', 'left', 'down', 'right'] as const).map((a) => keysOf(b, a)).join(', ');
  const rows = P1_ROWS.map(([action, a]) => {
    // Tab also runs in a match (hard-wired, not a binding), so it is named beside the Run key.
    const keys = a === 'run' ? [...b[a].map(codeLabel), 'Tab'] : b[a].map(codeLabel);
    return { action, keys: keys.length > 0 ? keys.join(' or ') : 'unbound', chips: keys };
  });
  return [{ action: 'Move (up, left, down, right)', keys: move }, ...rows];
}

export const GAMEPAD_ROWS: readonly ControlRow[] = [
  { action: 'Move', keys: 'Left stick or d-pad' },
  { action: 'Attack', keys: 'A' },
  { action: 'Second attack', keys: 'B' },
  { action: 'Dash', keys: 'Right bumper' },
  { action: 'Guard (hold)', keys: 'Left trigger' },
  { action: 'Weather', keys: 'X' },
  { action: 'Charge', keys: 'Press the right stick' },
  { action: 'Super', keys: 'Right trigger' },
  { action: 'Trap', keys: 'Y' },
  { action: 'Element', keys: 'Press the left stick' },
  { action: 'Cleanse', keys: 'Back' },
  { action: 'Tag', keys: 'Left bumper' },
  { action: 'Pause', keys: 'Start' },
];

export const TOUCH_ROWS: readonly ControlRow[] = [
  { action: 'Move', keys: 'Drag the on-screen pad' },
  { action: 'Strike 1, Strike 2, Snag', keys: 'Tap the Strike circles or the boxes of the hero (the one marked Snag throws the rope that roots a foe)' },
  { action: 'Dash, Guard, Weather, Charge, Super, Trap, Element, Cleanse, Tag, Tag 2', keys: 'Tap the button of the same name; each shows its key and its state in words' },
];

export const SYSTEM_ROWS: readonly ControlRow[] = [
  { action: 'Pause', keys: 'Shift-P' },
  { action: 'Mute', keys: 'Ctrl-M' },
  { action: 'Fullscreen', keys: 'F' },
  { action: 'Back (menus)', keys: 'Escape' },
];

export function controlSections(b: Bindings): readonly ControlSection[] {
  return [
    { title: 'Keyboard, Player 1', rows: player1Rows(b) },
    { title: 'Keyboard, Player 2 (two players on one keyboard)', rows: P2_KEYS },
    { title: 'Gamepad', rows: GAMEPAD_ROWS },
    { title: 'Touch', rows: TOUCH_ROWS },
    { title: 'Anywhere', rows: SYSTEM_ROWS },
  ];
}
