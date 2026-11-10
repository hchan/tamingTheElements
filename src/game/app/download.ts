import type { ReplayFile } from '@core/menu-index';

/** Revoking right after click() can cancel the download in some browsers; give it time to start. */
const REVOKE_DELAY_MS = 10_000;

export function replayFilename(r: ReplayFile): string {
  return `tte-${String(r.header.seed)}-${String(r.header.tickCount)}.replay.json`;
}

/** Saves the replay as a JSON file through a temporary object URL (local only, nothing is uploaded). */
export async function downloadReplay(r: ReplayFile): Promise<void> {
  const { serializeReplay } = await import('@core/lazy-index');
  const url = URL.createObjectURL(new Blob([serializeReplay(r)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = replayFilename(r);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, REVOKE_DELAY_MS);
}
