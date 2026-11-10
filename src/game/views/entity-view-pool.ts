/**
 * Pure pool of per-entity views keyed by entity id. Per frame: `begin()`, `acquire(id)` for each
 * live entity, then `end()`, which parks views that were not acquired. Parked views are reused.
 */
export class EntityViewPool<V> {
  private readonly active = new Map<number, V>();
  private readonly seen = new Set<number>();
  private readonly free: V[] = [];

  constructor(
    private readonly create: () => V,
    private readonly onPark: (view: V) => void,
  ) {}

  begin(): void {
    this.seen.clear();
  }

  acquire(id: number): V {
    this.seen.add(id);
    let v = this.active.get(id);
    if (v === undefined) {
      v = this.free.pop() ?? this.create();
      this.active.set(id, v);
    }
    return v;
  }

  end(): void {
    for (const [id, v] of this.active) {
      if (this.seen.has(id)) continue;
      this.active.delete(id);
      this.onPark(v);
      this.free.push(v);
    }
  }

  /** The active view for an id, without acquiring one. */
  peek(id: number): V | undefined {
    return this.active.get(id);
  }

  /** Visits every view, active or parked (for destroy on shutdown). */
  forEachView(visit: (v: V) => void): void {
    this.active.forEach(visit);
    this.free.forEach(visit);
  }

  clear(): void {
    this.active.clear();
    this.free.length = 0;
  }
}
