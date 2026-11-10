import { now } from '../../clock';
import { SimEventKind, type EventSink } from '../../events';
import { ARCADE_E, ArcadeE, type SimState } from '../../state';

/** Ends `id`'s charge now with `reason` (a ChargeEnd) and emits `chargeEnded`. */
export function endCharge(s: SimState, sink: EventSink, id: number, reason: number): void {
  s.arcade[id * ARCADE_E + ArcadeE.chargeUntil] = now(s);
  sink.emit(id, SimEventKind.chargeEnded, { reason });
}
