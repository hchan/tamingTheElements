import { Cmd, type Agent, type AgentState, type Command, type ObservationView } from '@core/index';
import { ARCADE_PAD, commandFromPad, pauseEdge, type PadSnapshot } from './gamepad';
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
  /**
   * Arcade match: the super (X, pad RT), dash (E, RB), guard (Q, LT) weather (R, pad X) and charge (H, pad R3) send their Arcade bits;
   * Classic never sends them (RB, LT and RT stay the second, third and fourth swap; pad X does nothing).
   */
  readonly arcade?: boolean;
  /**
   * The game clock the sim runs on (the action bar's `tick`). A swap sent on a tick where it did not advance (an Arcade
   * hit-stop or KO slow-motion hold skips the swap system) is sent again on the next tick, for up to `SWAP_RETRY_TICKS`.
   */
  readonly clock?: () => number;
  /** Called once per swap press with its bits, on the observation that sends it (view-only refusal feedback hangs here). */
  readonly onSwap?: (swaps: Command) => void;
  /** Called with the Super, Weather, Charge (and in Arcade elemental) bits that went from up to down on this observation (view-only refusal feedback). */
  readonly onAction?: (bits: Command) => void;
}

/** The Super, Weather and Charge bits, whose press edge feeds `onAction`. */
const ACTION_MASK: Command = Cmd.super | Cmd.weather | Cmd.charge;

/** The four swap bits: sent once per press (a key, pad button or slot click), never while held. */
export const SWAP_MASK: Command = Cmd.swap1 | Cmd.swap2 | Cmd.swap3 | Cmd.swap4;
/** How many observations a swap press may wait for a tick on which the sim actually runs its swap system (0.5 s). */
export const SWAP_RETRY_TICKS = 25;

export type KeyEventSource = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export class KeyboardAgent implements Agent {
  readonly id = 'keyboard';
  private state: KeyState = INITIAL_KEY_STATE;
  private bindings: Bindings;
  private pressed: Command = 0;
  /** Keys pressed since the last observation, so a tap that is released before the next tick still counts once. */
  private tapped = new Set<string>();
  private startDown = false;
  /** Swap presses waiting for the next observation (a press shorter than a tick, or a retry after a held clock). */
  private swapLatched: Command = 0;
  private lastActions: Command = 0;
  /** Pad buttons held at the last poll, so only a fresh press latches a swap. */
  private padSwapDown: Command = 0;
  /** The swap bits sent last, the game clock they were sent on and how many times they were retried. */
  private sent: { bits: Command; clock: number; retries: number } | undefined;
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
    // OS key repeat is not a press: it must not re-latch a swap (or any tap) while the key is held.
    if (input.type === 'down' && r.effect === undefined && !input.repeat) this.tapped.add(input.code);
    if (input.type === 'blur') {
      this.tapped = new Set();
      this.swapLatched = 0;
      this.sent = undefined;
    }
    this.state = r.state;
    if (r.effect !== undefined) this.opts.onEffect?.(r.effect);
  }

  /** A pointer press on an action slot: its command bits are sent on the next observation only (one tick). */
  press(cmd: Command): void {
    this.pressed |= cmd;
  }

  /**
   * The swap bits of this game. In Arcade bit 10 is the elemental ability (the fourth swap does not exist there): a held
   * command like any other, whose press edge the sim finds itself.
   */
  private swapMask(): Command {
    return this.opts.arcade ? SWAP_MASK & ~Cmd.elemental : SWAP_MASK;
  }

  /** Latches a pad swap button's press edge, so a tap shorter than a frame is still sent on the next tick. */
  private latchPad(): Command {
    const arcade = this.opts.arcade;
    const down = commandFromPad(this.opts.gamepad?.() ?? null, true, arcade ? ARCADE_PAD : undefined) & this.swapMask();
    this.swapLatched |= down & ~this.padSwapDown;
    this.padSwapDown = down;
    return down;
  }

  /** Call once per rendered frame (also while paused): Start on the pad toggles pause on its press edge. */
  pollPad(): void {
    this.latchPad();
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
    const arcade = this.opts.arcade;
    this.latchPad();
    const pad = commandFromPad(this.opts.gamepad?.() ?? null, capturable, arcade ? ARCADE_PAD : undefined);
    // Movement and abilities follow the held keys; a swap is an edge: only keys pressed since the last tick (not repeats).
    const held = this.tapped.size === 0 ? this.state.held : new Set([...this.state.held, ...this.tapped]);
    const swapMask = this.swapMask();
    const taps = commandFromHeld(this.bindings, this.tapped, capturable, arcade) & swapMask;
    let swaps = this.swapLatched | taps | (this.pressed & swapMask);
    this.swapLatched = 0;
    const fresh = swaps;
    const clock = this.opts.clock?.();
    const was = this.sent;
    this.sent = undefined;
    if (was && clock !== undefined && clock === was.clock && was.retries < SWAP_RETRY_TICKS) {
      swaps |= was.bits; // the sim held its clock on that tick and never looked at the swap: send it again
    }
    this.tapped = new Set();
    const cmd = ((commandFromHeld(this.bindings, held, capturable, arcade) | pad | this.pressed) & ~swapMask) | swaps;
    this.pressed = 0;
    if (swaps !== 0 && clock !== undefined) this.sent = { bits: swaps, clock, retries: was && swaps === was.bits ? was.retries + 1 : 0 };
    if (fresh !== 0) this.opts.onSwap?.(fresh);
    const actions = arcade ? ACTION_MASK | Cmd.elemental : ACTION_MASK;
    const edge = cmd & actions & ~this.lastActions;
    this.lastActions = cmd & actions;
    if (edge !== 0) this.opts.onAction?.(edge);
    return cmd;
  }

  /**
   * A human input device has no replayable memory: what is held is the player's live input, which a rollback
   * must not rewind (the recorded commands already carry what was sent). So there is nothing to save.
   */
  save(): AgentState {
    return null;
  }

  load(): void {
    // Live input is never restored.
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
      this.releaseAll();
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
