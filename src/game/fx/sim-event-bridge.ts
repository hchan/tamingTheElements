import type { SimEvent } from '@core/index';
import { SimEventKind } from '@core/index';

/**
 * Window event for the how-to-play lesson (app/tutorial.ts): `detail` is `{kind: 'hit', ability, strength, amount, attacker, target}`
 * or `{kind: 'super', caster}`. The same literal-and-host pattern as `tte:super-cut`, so DOM code needs no import from this chunk.
 */
export function simEventBridge(e: SimEvent): void {
  const host = globalThis as { dispatchEvent?: (e: unknown) => boolean; CustomEvent?: new (t: string, i: { detail: unknown }) => unknown };
  if (!host.dispatchEvent || !host.CustomEvent) return;
  const detail =
    e.kind === SimEventKind.superStarted
      ? { kind: 'super', caster: e['caster'] ?? -1 }
      : { kind: 'hit', ability: e['ability'] ?? -1, strength: e['strength'] ?? 0, amount: e['amount'] ?? 0, attacker: e['attacker'] ?? -1, target: e['target'] ?? -1 };
  host.dispatchEvent(new host.CustomEvent('tte:sim-event', { detail }));
}

/** The lesson-only kinds (slice 2) and the `tte:sim-event` name each one is bridged under. */
const LESSON_KINDS: Readonly<Record<number, string>> = {
  [SimEventKind.weatherChanged]: 'weather',
  [SimEventKind.cleanse]: 'cleanse',
  [SimEventKind.patchEntered]: 'patch',
  [SimEventKind.patchLeft]: 'patchLeft',
  [SimEventKind.patchHeal]: 'heal',
  [SimEventKind.projectileBlocked]: 'blocked',
};
const seen = new Set<string>();
let maxTick = 0;

/**
 * Bridges the weather, cleanse and terrain events the same way (`{kind, stage}`; Player 1's own weather, cleanse and patch only).
 * It keeps its own small seen set (the shared deduper only runs for hits), cleared when the tick runs backwards (a new match).
 */
export function lessonBridge(e: SimEvent): void {
  const kind = LESSON_KINDS[e.kind];
  if (kind === undefined) return;
  const team = e['team'];
  if (team !== undefined && team !== 0) return;
  if (e.tick < maxTick - 50) seen.clear();
  maxTick = e.tick;
  const key = `${String(e.tick)}:${String(e.sourceId)}:${String(e.kind)}:${String(e.seq)}`;
  if (seen.has(key)) return;
  if (seen.size > 256) seen.clear();
  seen.add(key);
  const host = globalThis as { dispatchEvent?: (e: unknown) => boolean; CustomEvent?: new (t: string, i: { detail: unknown }) => unknown };
  if (!host.dispatchEvent || !host.CustomEvent) return;
  host.dispatchEvent(new host.CustomEvent('tte:sim-event', { detail: { kind, stage: e['stage'] ?? 0 } }));
}
