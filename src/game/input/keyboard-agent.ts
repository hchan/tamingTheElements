import type { Agent, Command, ObservationView } from '@core/index';
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
}

export type KeyEventSource = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export class KeyboardAgent implements Agent {
  readonly id = 'keyboard';
  private state: KeyState = INITIAL_KEY_STATE;
  private bindings: Bindings;
  private readonly cheatsEnabled: boolean;

  constructor(private readonly opts: KeyboardAgentOptions) {
    this.bindings = opts.bindings ?? DEFAULT_BINDINGS;
    this.cheatsEnabled = opts.cheatsEnabled ?? import.meta.env.DEV;
  }

  setBindings(bindings: Bindings): void {
    this.bindings = bindings;
  }

  handle(input: KeyInput): void {
    const r = reduceKey(this.state, input, this.bindings, this.cheatsEnabled);
    this.state = r.state;
    if (r.effect !== undefined) this.opts.onEffect?.(r.effect);
  }

  observe(view: ObservationView): Command {
    return commandFromHeld(this.bindings, this.state.held, this.opts.capturable(view));
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
