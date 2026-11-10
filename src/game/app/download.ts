import { serializeReplay, type ReplayFile } from '@core/index';

export function replayFilename(r: ReplayFile): string {
  return `tte-${String(r.header.seed)}-${String(r.header.tickCount)}.replay.json`;
}

/** Saves the replay as a JSON file through a temporary object URL (local only, nothing is uploaded). */
export function downloadReplay(r: ReplayFile): void {
  const url = URL.createObjectURL(new Blob([serializeReplay(r)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = replayFilename(r);
  a.click();
  URL.revokeObjectURL(url);
}
