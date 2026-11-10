import { createIdbSaveStore, idbAvailable } from './idb-save-store';
import { browserStorage, createLocalSaveStore } from './local-save-store';
import { createMemoryStorage, type SaveStore } from './save-store';

/** Best available store: IndexedDB (mirrored to localStorage) when present, else localStorage, else memory. */
export function createSaveStore(now: () => number): SaveStore {
  const ls = browserStorage();
  if (idbAvailable()) return createIdbSaveStore(ls, now);
  return createLocalSaveStore(ls ?? createMemoryStorage(), now);
}
