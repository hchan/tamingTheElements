/** "Record playtests" setting: local only, default off. Nothing is recorded or stored while it is off. */
const KEY = 'tte.recordPlaytests';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStore(): Store | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function getRecordSetting(store: Store | undefined = defaultStore()): boolean {
  try {
    return store?.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setRecordSetting(on: boolean, store: Store | undefined = defaultStore()): void {
  try {
    store?.setItem(KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable: the setting just does not persist */
  }
}
