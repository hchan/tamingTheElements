import type Phaser from 'phaser';
import { shouldCutin } from './cutin-gate';

/**
 * What a super freeze draws: the first-run card event, the super band (super-view, lazy) and, for a roster24 hero on
 * `?ff=roster24` in dev/test builds, the cut-in composite (cutin-view, lazy). Split out of event-fx.ts to keep it under its size cap.
 */
export function superCutFx(
  scene: Phaser.Scene, view: object | undefined, hero: string | undefined, casterX: number | undefined,
  fromTick: number, untilTick: number, reduced: boolean, viewTick: () => number, paused: () => boolean, superId: number | undefined,
): void {
  // The first-run card (app/first-run-hint.ts, SUPER_CUT_EVENT) leaves before the cut-in band; a literal keeps it out of this chunk.
  const host = globalThis as { dispatchEvent?: (e: unknown) => boolean; Event?: new (t: string) => unknown; location?: { search: string } };
  if (host.dispatchEvent && host.Event) host.dispatchEvent(new host.Event('tte:super-cut'));
  if (!view) return;
  void import('./super-view').then((m) => { m.superCut(scene, view as never, fromTick, untilTick, reduced, viewTick, paused, superId); });
  if (!shouldCutin(hero, host.location?.search ?? '', import.meta.env.DEV || import.meta.env.MODE === 'test')) return;
  const side = (casterX ?? 640) < 640 ? -1 : 1;
  void import('./cutin-view').then((m) => { m.showCutin(scene, hero as string, fromTick, reduced, side, viewTick, paused, import.meta.env.BASE_URL); });
}
