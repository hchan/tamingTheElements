/** The documented tester-mode cheat code (docs/TESTER-MODE.md): a key sequence on the main menu, or text typed into Settings. */

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

/** The text to type into the Settings "Tester code" field (case and surrounding spaces do not matter). */
export const TYPED_CODE = 'taming-tester';

/** Pure matcher step: the new progress (0..KONAMI.length) after `code`; a full match is returned as KONAMI.length. */
export function advanceKonami(progress: number, code: string): number {
  if (KONAMI[progress] === code) return progress + 1;
  // A wrong key restarts, but it may itself be the first key of the sequence.
  return KONAMI[0] === code ? 1 : 0;
}

export function isTesterCode(text: string): boolean {
  return text.trim().toLowerCase() === TYPED_CODE;
}
