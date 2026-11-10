import type { Agent, Command, ObservationView } from '@core/index';
import { commandFromPad, pauseEdge, type PadSnapshot } from './gamepad';
import {
  type Bindings,
  commandFromHeld,
  DEFAULT_BINDINGS,
  INITIAL_KEY_STATE,
  type KeyEffect,
  type KeyInput,
  type KeyState,
  reduceKey,
} from './key-map';

export interface KeyboardAgentOptions {
  /** Whether a capture may be sent this tick (as legacy: capture only when the target is capturable). */
  readonly capturable: (view: ObservationView) => boolean;
  readonly bindings?: Bindings;
  /** Cheat keys (Shift-Q/X/C); defaults to dev builds only. */
  readonly cheatsEnabled?: boolean;
  /** Receives pause/mute and cheat effects; these are app-level and never sim commands. */
  readonly onEffect?: (effect: KeyEffect) => void;
  /** Current gamepad (e.g. `() => firstPad(navigator.getGamepads())`); mapped to the same Commands as the keys. */
  readonly gamepad?: () => PadSnapshot | null;
}

export type KeyEventSource = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export class KeyboardAgent implements Agent {
  readonly id = 'keyboard';
  private state: KeyState = INITIAL_KEY_STATE;
  private bindings: Bindings;
  private pressed: Command = 0;
  private startDown = false;
  private readonly cheatsEnabled: boolean;

  constructor(private readonly opts: KeyboardAgentOptions) {
    this.bindings = opts.bindings ?? DEFAULT_BINDINGS;
    this.cheatsEnabled = opts.cheatsEnabled ?? import.meta.env.DEV;
  }

  currentBindings(): Bindings {
    return this.bindings;
  }

  setBindings(bindings: Bindings): void {
    this.bindings = bindings;
  }

  handle(input: KeyInput): void {
    const r = reduceKey(this.state, input, this.bindings, this.cheatsEnabled);
    this.state = r.state;
    if (r.effect !== undefined) this.opts.onEffect?.(r.effect);
  }

  /** A pointer press on an action slot: its command bits are sent on the next observation only (one tick). */
  press(cmd: Command): void {
    this.pressed |= cmd;
  }

  /** Call once per rendered frame (also while paused): Start on the pad toggles pause on its press edge. */
  pollPad(): void {
    const e = pauseEdge(this.startDown, this.opts.gamepad?.() ?? null);
    this.startDown = e.down;
    if (e.pressed) this.opts.onEffect?.('pause');
  }

  /** Drops held keys, e.g. when a dialog takes focus so a key held across it is not replayed. */
  releaseAll(): void {
    this.handle({ type: 'blur', code: '', shiftKey: false, ctrlKey: false, repeat: false });
  }

  observe(view: ObservationView): Command {
    const capturable = this.opts.capturable(view);
    const pad = commandFromPad(this.opts.gamepad?.() ?? null, capturable);
    const cmd = commandFromHeld(this.bindings, this.state.held, capturable) | pad | this.pressed;
    this.pressed = 0;
    return cmd;
  }

  /** Listens on a window-like source; returns a detach function. */
  attach(source: KeyEventSource): () => void {
    const onKey = (type: 'down' | 'up') => (e: Event) => {
      const k = e as KeyboardEvent;
      this.handle({ type, code: k.code, shiftKey: k.shiftKey, ctrlKey: k.ctrlKey, repeat: k.repeat });
    };
    const down = onKey('down');
    const up = onKey('up');
    const blur = () => {
      this.handle({ type: 'blur', code: '', shiftKey: false, ctrlKey: false, repeat: false });
    };
    source.addEventListener('keydown', down);
    source.addEventListener('keyup', up);
    source.addEventListener('blur', blur);
    return () => {
      source.removeEventListener('keydown', down);
      source.removeEventListener('keyup', up);
      source.removeEventListener('blur', blur);
    };
  }
}
