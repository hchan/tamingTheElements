/** The documented tester-mode cheat code (docs/TESTER-MODE.md): a key sequence on the main menu (Settings has a checkbox). */

/** Konami-style sequence, as `KeyboardEvent.code` values: Up Up Down Down Left Right Left Right B A. */
export const KONAMI: readonly string[] = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyB',
  'KeyA',
];

/** Pure matcher step: the new progress (0..KONAMI.length) after `code`; a full match is returned as KONAMI.length. */
export function advanceKonami(progress: number, code: string): number {
  if (KONAMI[progress] === code) return progress + 1;
  // A wrong key restarts, but it may itself be the first key of the sequence.
  return KONAMI[0] === code ? 1 : 0;
}
