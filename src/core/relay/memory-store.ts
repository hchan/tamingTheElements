import type { Json, PutOptions, Store, StoreItem } from './store';

interface Entry {
  value: string;
  version: number;
  expiresAtMs: number | undefined;
}

/** Test and single-process store. Values are copied as JSON so callers cannot alias stored state. `now` is injected for TTLs. */
export class InMemoryStore implements Store {
  private readonly items = new Map<string, Entry>();

  constructor(private readonly now: () => number) {}

  private live(key: string): Entry | undefined {
    const e = this.items.get(key);
    if (e === undefined) return undefined;
    if (e.expiresAtMs !== undefined && e.expiresAtMs <= this.now()) {
      this.items.delete(key);
      return undefined;
    }
    return e;
  }

  get(key: string): Promise<StoreItem | undefined> {
    const e = this.live(key);
    return Promise.resolve(
      e === undefined ? undefined : { value: JSON.parse(e.value) as Json, version: e.version },
    );
  }

  put(key: string, value: Json, options: PutOptions = {}): Promise<boolean> {
    const cur = this.live(key);
    const cond = options.ifVersion;
    if (cond === 'absent' && cur !== undefined) return Promise.resolve(false);
    if (typeof cond === 'number' && (cur === undefined || cur.version !== cond))
      return Promise.resolve(false);
    this.items.set(key, {
      value: JSON.stringify(value),
      version: (cur?.version ?? 0) + 1,
      expiresAtMs: options.expiresAtMs,
    });
    return Promise.resolve(true);
  }

  delete(key: string): Promise<void> {
    this.items.delete(key);
    return Promise.resolve();
  }

  keys(prefix: string): Promise<readonly string[]> {
    const out: string[] = [];
    for (const k of [...this.items.keys()])
      if (k.startsWith(prefix) && this.live(k) !== undefined) out.push(k);
    return Promise.resolve(out);
  }

  /** Test helper: number of live items. */
  get size(): number {
    return [...this.items.keys()].filter((k) => this.live(k) !== undefined).length;
  }
}
