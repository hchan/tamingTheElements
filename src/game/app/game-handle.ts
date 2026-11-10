import { teardown } from '../platform/test-hook';

export type GameHandle = {
  destroy(removeCanvas: boolean): void;
  events: { once(event: string, fn: () => void): unknown };
};

/** Phaser destroys on its next frame; keep the DOM until then so the canvas is removed by Phaser itself. */
export function destroyGame(doomed: GameHandle | undefined, doomedNode: HTMLElement | undefined): void {
  if (!doomed) {
    doomedNode?.remove();
    return;
  }
  const done = new Promise<void>((resolve) => {
    doomed.events.once('destroy', () => {
      doomedNode?.remove();
      resolve();
    });
  });
  teardown.settled = Promise.all([teardown.settled, done]).then(() => undefined);
  doomed.destroy(true);
}
