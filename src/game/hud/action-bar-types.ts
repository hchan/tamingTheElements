import type { Command } from '@core/index';

/** Sprite key of the Snag rope throw (Entangling Vines): the hero slot that holds it is labelled Snag. */
export const SNAG_SPRITE = 'entanglingVines';

/** Every kind of box on the bar: the one shape, told apart by its icon, key and words. */
export type SlotKind = 'ability' | 'capture' | 'swap' | 'trap' | 'elemental' | 'super' | 'guard' | 'dash' | 'weather' | 'charge' | 'cleanse' | 'run';

/** The touch button (id `arcade<touch>`) that sits over a box as a transparent overlay; '' for a box with none. */
export type TouchName = '' | 'Super' | 'Guard' | 'Dash' | 'Weather' | 'Charge' | 'Tag' | 'Tag2' | 'Trap' | 'Element' | 'Cleanse' | 'Run';

export interface ActionSlot {
  readonly kind: SlotKind;
  /** Elemental slot only: the element kind (1 fire, 2 water, 3 earth, 4 air), else 0 (tints the ready edge). */
  readonly element?: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  /** The Command bit this slot emits when clicked (same bit as its key); 0 for a box whose transparent touch overlay does the input. */
  readonly cmd: Command;
  readonly label: string;
  readonly sprite: string;
  /** Cell on the `hud:actions` sheet, drawn when there is no character sprite; -1 for none. */
  readonly icon: number;
  /** The DOM touch button laid over this box, '' for none. */
  readonly touch: TouchName;
  /** Cooldown elapsed 0..1; 1 means ready (no sweep). */
  readonly progress: number;
  /** Capture only: highlighted when the enemy is capturable and the slot is ready. */
  readonly highlight: boolean;
  /** Greyed out: capture while not capturable, or a dead teammate. */
  readonly disabled: boolean;
  /** Second line under the key: the box's name and state in words ("Trap 7s", "Super 40%", "Dash"), else ''. */
  readonly note: string;
  /** Run slot only: true for Run Away (a ranged hero), false for Run Towards (names the box and its tip). */
  readonly runAway?: boolean;
}
