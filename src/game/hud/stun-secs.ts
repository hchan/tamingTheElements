/** Game ticks per second (the 50 Hz sim; same value as `TICKS_PER_SEC` in status-icons.ts, kept local so the two files do not import each other). */
const TICKS_PER_SEC = 50;

/** Remaining stun as seconds with one decimal, rounded up so a running stun never reads 0.0s ("0.6s"). */
export function stunSecs(ticks: number): string {
  return `${(Math.ceil((Math.max(0, ticks) * 10) / TICKS_PER_SEC) / 10).toFixed(1)}s`;
}

/** `STUN 0.6s` for a stun still running; the bare word when the time is unknown or spent (render only, no sim input). */
export function stunWord(word: string, ticks: number): string {
  return ticks > 0 ? `${word} ${stunSecs(ticks)}` : word;
}
