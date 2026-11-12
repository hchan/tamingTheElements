import { GAME_ACTIONS, codeLabel, type Bindings, type GameAction } from '../platform/input/bindings';

/**
 * Local two-player Arcade Versus (two humans, one keyboard): Player 2's fixed key set, on the right-hand block so it never
 * meets Player 1's defaults (arrows/WASD, Space/Enter, 1-5, X, E, Q, R, H, C) or the shell keys (F fullscreen, Shift-P
 * pause, Ctrl-M mute, Escape). Not rebindable (Player 1's are, on the Key Bindings screen); listed in the README and shown
 * on the battle screen. Capture and the fifth swap do not exist in Arcade, so they stay unbound.
 */
export const P2_BINDINGS: Bindings = {
  up: ['KeyI'],
  down: ['KeyK'],
  left: ['KeyJ'],
  right: ['KeyL'],
  slot1: ['KeyU'],
  slot2: ['KeyO'],
  slot3: ['KeyV'], // Tag (2v2 and 3v3)
  slot4: ['Comma'], // Tag 2 (3v3); Comma, because M is Trap
  slot5: [],
  capture: [],
  trap: ['KeyM'], // Trap (bit 6); plain M, Ctrl-M stays the mute key (reduceKey checks ctrl first)
  super: ['KeyB'],
  dash: ['KeyY'],
  guard: ['KeyN'],
  weather: ['KeyT'],
  charge: ['KeyG'],
};

const HINT: readonly (readonly [GameAction, string])[] = [
  ['slot1', 'attack'], ['slot2', 'second attack'], ['dash', 'dash'], ['guard', 'guard (hold)'], ['super', 'super'], ['weather', 'weather'], ['charge', 'charge'], ['trap', 'trap'], ['slot3', 'tag'], ['slot4', 'tag 2'],
];

/** "Player 2: I J K L move, U attack, ...": the keys of one binding set, in words (never colour). */
export function controlsHint(who: string, b: Bindings): string {
  const keys = (a: GameAction): string => b[a].map(codeLabel).join('/');
  const move = (['up', 'left', 'down', 'right'] as const).map((a) => (b[a][b[a].length - 1] ? codeLabel(b[a][b[a].length - 1] as string) : '')).join(' ');
  return `${who}: ${move} move, ${HINT.filter(([a]) => b[a].length > 0).map(([a, w]) => `${keys(a)} ${w}`).join(', ')}`;
}

/** Every key bound in a set, for the conflict checks. */
export const boundCodes = (b: Bindings): string[] => GAME_ACTIONS.flatMap((a) => [...b[a]]);
