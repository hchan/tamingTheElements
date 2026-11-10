/** Classic kinds are 1..30; Arcade-only kinds are 40..69 (docs/FUN-DESIGN.md section 2.1), never emitted in Classic. */
export const SimEventKind = {
  moved: 1, blocked: 2, damage: 22, died: 20, swapped: 21, captured: 23, captureFailed: 24, matchEnded: 30,
  hitStop: 40, hitConfirmed: 41, comboEnded: 42, recovered: 58,
} as const;
export type SimEventKindValue = (typeof SimEventKind)[keyof typeof SimEventKind];

/** Stable id of an event is (tick, sourceId, kind, seq); seq is unique within a tick. */
export type SimEvent = {
  readonly tick: number;
  readonly sourceId: number;
  readonly kind: SimEventKindValue;
  readonly seq: number;
} & Readonly<Record<string, number>>;

/** Collects the events of one step and numbers them with a per-tick counter. */
export class EventSink {
  private seq = 0;
  readonly events: SimEvent[] = [];

  constructor(readonly tick: number) {}

  emit(sourceId: number, kind: SimEventKindValue, payload: Readonly<Record<string, number>> = {}): void {
    this.events.push({ ...payload, tick: this.tick, sourceId, kind, seq: this.seq++ });
  }
}
