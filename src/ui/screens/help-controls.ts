import { codeLabel, type Bindings, type GameAction } from '../../game/platform/input/bindings';

export interface ControlRow {
  readonly action: string;
  readonly keys: string;
}
export interface ControlSection {
  readonly title: string;
  readonly rows: readonly ControlRow[];
}

/** Player 2's fixed keys (local two-player; not rebindable). Mirrors P2_BINDINGS in src/game/input/local-two.ts (a test pins it). */
export const P2_KEYS: readonly ControlRow[] = [
  { action: 'Move', keys: 'I J K L' },
  { action: 'Attack', keys: 'U' },
  { action: 'Second attack', keys: 'O' },
  { action: 'Dash', keys: 'Y' },
  { action: 'Guard (hold)', keys: 'N' },
  { action: 'Weather', keys: 'T' },
  { action: 'Charge', keys: 'G' },
  { action: 'Super', keys: 'B' },
  { action: 'Trap', keys: 'M' },
  { action: 'Element', keys: ';' },
  { action: 'Cleanse', keys: "'" },
  { action: 'Tag', keys: '.' },
  { action: 'Tag 2', keys: ',' },
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
  ['Tag', 'slot3'],
  ['Tag 2', 'slot4'],
];

const keysOf = (b: Bindings, a: GameAction): string => b[a].map(codeLabel).join(' or ');

/** Player 1's keyboard controls, read from the live bindings so rebinds show. */
export function player1Rows(b: Bindings): readonly ControlRow[] {
  const move = (['up', 'left', 'down', 'right'] as const).map((a) => keysOf(b, a)).join(', ');
  return [{ action: 'Move (up, left, down, right)', keys: move }, ...P1_ROWS.map(([action, a]) => ({ action, keys: keysOf(b, a) || 'unbound' }))];
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
  { action: 'Attack, second attack, Snag', keys: 'Tap the boxes of the hero (the one marked Snag throws the rope that roots a foe)' },
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
