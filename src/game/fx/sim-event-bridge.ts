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
