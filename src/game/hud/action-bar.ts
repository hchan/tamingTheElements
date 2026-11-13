import type Phaser from 'phaser';
import type { Command, RenderActionBar, RenderArcade, RenderView } from '@core/index';
import { Cmd, GUARD_MAX, METER_BAR, WEATHER_CHARGE_FULL } from '@core/index';
import { LOGICAL_WIDTH as LOGICAL_W, crisp, phoneBoost } from '../boot/viewport';
import { ACTION_COMMAND } from '../input/key-map';
import { codeLabel, DEFAULT_BINDINGS, GAME_ACTIONS, type Bindings } from '../platform/input/bindings';
import { HUD_WIDTH } from './bars';
import { lookup } from '../views/projectile-view';
import { gradeRgba, mute } from '../fx/grim-fx';
import { getPrefs } from '../platform/a11y/prefs';
import { syncTouchOverlays } from './touch-overlay';

/**
 * Action bar (legacy `actionbar.js`): primary, secondary, capture (chapter 2+) and swap slots along the
 * bottom edge, with a clockwise cooldown sweep (legacy `HUDHelper.drawCooldown`). In Arcade the same bar also carries every other
 * action (Tag, Charge, Weather, Dash, Guard, Super, Trap, Element): one kind of box, all on the left, each with an icon, its key in the
 * corner and the one shared cooldown look (`cooldownLook`); the DOM touch buttons are transparent overlays on those boxes
 * (`touch-overlay.ts`), so there is nothing on the right. Everything except
 * `ActionBarView` is pure. View-only: a mouse click maps to the same Command bit as the matching key
 * and goes to the caller's sink; the bar never touches the sim.
 */
export const LOGICAL_HEIGHT = 720;
export const ACTION_BAR_HEIGHT = 80;
const TOP_BORDER = 1;
const SLOT_BORDER = 2;
/** Legacy `Global.actionBarHeight - slotBorderWidth / 2 - topBorderWidth * 2`. */
export const SLOT_SIDE = ACTION_BAR_HEIGHT - SLOT_BORDER / 2 - TOP_BORDER * 2;
export const BAR_Y = LOGICAL_HEIGHT - ACTION_BAR_HEIGHT;
export const COOLDOWN_ALPHA = 0.33;
export const COOLDOWN_COLOR = 0x090909;
export const CAPTURE_READY_COLOR = 0xb39653;

/** Icon padding inside a slot frame (Classic dressing). */
export const ICON_PAD = 8;
const ICON_FRAME = 'icon';

/**
 * The grim-graded copy of an icon sheet (desaturated, darker, grained: the baked-sprite grade), made once per texture on a canvas and
 * cached in the texture manager. Falls back to the original key where there is no canvas (tests, odd sources), so icons always show.
 */
export function gradedTexture(scene: Phaser.Scene, key: string): string {
  const gk = `${key}~grim`;
  if (scene.textures.exists(gk)) return gk;
  try {
    const src = scene.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
    if (typeof document === 'undefined' || !(src.width > 0)) return key;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d');
    if (!ctx) return key;
    ctx.drawImage(src, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    gradeRgba(data.data);
    ctx.putImageData(data, 0, 0);
    scene.textures.addCanvas(gk, c);
    return gk;
  } catch {
    return key;
  }
}

/** Aspect-preserving fit of a `fw` x `fh` frame into a `size` square, centred: the same visual size for every icon. */
export function fitIcon(fw: number, fh: number, size: number): { w: number; h: number; dx: number; dy: number } {
  const k = Math.min(size / Math.max(1, fw), size / Math.max(1, fh));
  const w = fw * k;
  const h = fh * k;
  return { w, h, dx: (size - w) / 2, dy: (size - h) / 2 };
}

/** Key label per command bit, shown in the slot corner. */
export type KeyLabels = Readonly<Record<number, string>>;

/** Labels from the live key bindings: the first bound key of each slot's action (`Digit1` -> `1`, `KeyC` -> `C`). */
export function labelsFromBindings(bindings: Bindings): KeyLabels {
  const out: Record<number, string> = {};
  for (const action of GAME_ACTIONS) {
    const digit = ARCADE_DIGIT[action];
    const keys = bindings[action];
    // The numbered action row (3 Tag ... 9 Super, 0 Trap): a box wears its number while that number key is bound to it, else its first key.
    const numberKey = digit !== undefined ? `Digit${String(digit)}` : action === 'elemental' ? 'Minus' : undefined;
    const code = numberKey !== undefined && keys.includes(numberKey) ? numberKey : keys[0];
    // Trap shares Capture's command bit 6 and the elemental ability the fourth swap's bit 10, so theirs live apart.
    const at = action === 'trap' ? TRAP_LABEL : action === 'elemental' ? ELEMENTAL_LABEL : ACTION_COMMAND[action];
    if (code !== undefined) out[at] = codeLabel(code);
  }
  return out;
}

/** The number key each Arcade action wears on its box (FUN-DESIGN 2.17); Element wears the key after 0 (Minus, shown as -) while it is bound, else its first key. */
const ARCADE_DIGIT: Readonly<Partial<Record<(typeof GAME_ACTIONS)[number], number>>> = { super: 9, guard: 8, dash: 7, weather: 6, charge: 5, trap: 0 };

/** Where the Trap key's label sits in a KeyLabels (its command bit is Capture's). */
export const TRAP_LABEL = 100;
/** Where the elemental ability key's label sits in a KeyLabels (its command bit is the fourth swap's). */
export const ELEMENTAL_LABEL = 101;

export const DEFAULT_KEY_LABELS: KeyLabels = labelsFromBindings(DEFAULT_BINDINGS);

const SWAP_CMDS = [Cmd.swap1, Cmd.swap2, Cmd.swap3, Cmd.swap4] as const;
const ABILITY_CMDS = [Cmd.primary, Cmd.secondary] as const;

/** Every kind of box on the bar: the one shape, told apart by its icon, key and words. */
export type SlotKind = 'ability' | 'capture' | 'swap' | 'trap' | 'elemental' | 'super' | 'guard' | 'dash' | 'weather' | 'charge';

/** Cell of each icon on the `hud:actions` sheet (`tools/assets/hud-gen/actions.py` TILES order, 4 per row, 64 px cells). */
export const ACTION_ICON = { trap: 0, tag: 1, charge: 2, weather: 3, dash: 4, guard: 5, super: 6, fire: 7, water: 8, earth: 9, air: 10, element: 11 } as const;
export const ACTION_SHEET = 'hud:actions';
export const SHEET_CELL = 64;
export const SHEET_COLS = 4;

/** The touch button (id `arcade<touch>`) that sits over a box as a transparent overlay; '' for a box with none. */
export type TouchName = '' | 'Super' | 'Guard' | 'Dash' | 'Weather' | 'Charge' | 'Tag' | 'Tag2' | 'Trap' | 'Element';

/** The sheet cell an elemental box wears: its element's mark (1 fire, 2 water, 3 earth, 4 air), else the generic one. */
export function elementIcon(kind: number): number {
  return [ACTION_ICON.element, ACTION_ICON.fire, ACTION_ICON.water, ACTION_ICON.earth, ACTION_ICON.air][kind] ?? ACTION_ICON.element;
}

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
}

/** The Trap slot's words (never colour alone): whole seconds left while cooling, else the live count, or "full" at the cap. */
export function trapNote(tick: number, t: { readyTick: number; count: number; max: number }): string {
  if (tick < t.readyTick) return `Trap ${String(Math.ceil((t.readyTick - tick) / 50))}s`;
  return t.count >= t.max ? 'Trap full' : `Trap ${String(t.count)}/${String(t.max)}`;
}

/** The elemental slot's words (never colour alone): "<Name> on" while its buff runs, whole seconds left while cooling, else the name. */
export function elementalNote(tick: number, e: { name: string; readyTick: number; activeUntil: number }): string {
  if (tick < e.activeUntil) return `${e.name} on`;
  if (tick < e.readyTick) return `${e.name} ${String(Math.ceil((e.readyTick - tick) / 50))}s`;
  return e.name;
}

/** Line colour per element kind (a second cue only: the icon's shape and the slot's words say which). */
const ELEMENT_TINT: readonly number[] = [0xffffff, 0xff7a3d, 0x5cc8ff, 0xc9a26b, 0xe6f4ff];

/** A ready tile's edge: the tile's element colour dulled to ash, or bone when it has none (readiness is also the lit text and the missing cooldown shade). */
function readyEdge(element: number | undefined): number {
  return element ? mute(ELEMENT_TINT[element] ?? 0xffffff, 0.5, 0.75) : 0xa89f88;
}

/** Horizontal scale (at most 1) that keeps a text `width` wide inside a slot `size` wide, leaving `pad` px each side. */
export function fitTextScale(width: number, size: number, pad = 4): number {
  return width <= 0 ? 1 : Math.min(1, Math.max(0.1, (size - pad * 2) / width));
}

/** Elapsed fraction of a cooldown that ends (becomes usable) at `readyTick`; 1 once ready. */
export function cooldownProgress(tick: number, readyTick: number, cooldownTicks: number): number {
  if (tick >= readyTick || cooldownTicks <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - (readyTick - tick) / (cooldownTicks + 1)));
}

/** Left edge of slot `i` (legacy `slotBorderWidth / 2 + i * slotSideLength`). */
export function slotX(i: number): number {
  return SLOT_BORDER / 2 + i * SLOT_SIDE;
}

/** The most boxes the bar ever holds (primary, secondary, three swaps, charge, weather, dash, guard, super, trap, elemental): sizes the Player 2 lift. */
export const MAX_SLOTS = 13;
/** Smallest a box may be on screen in CSS px (a finger). */
export const MIN_TOUCH_PX = 48;

/** A box's side in logical px: the legacy side, or larger when the window is so small that it would drop under MIN_TOUCH_PX on screen (`k` = CSS px per logical px). */
export function slotSide(k?: number): number {
  return k === undefined || !(k > 0) ? SLOT_SIDE : Math.max(SLOT_SIDE, Math.ceil(MIN_TOUCH_PX / k));
}

/**
 * Where box `i` goes: left to right from the left edge, wrapping to a further row ABOVE the first when a row is full (never to the
 * right). Row 0 sits in the legacy bar position, pushed up only when a big box would run off the bottom.
 */
export function slotLayout(i: number, k?: number): { x: number; y: number; size: number; row: number } {
  const size = slotSide(k);
  const perRow = Math.max(1, Math.floor(LOGICAL_W / size));
  const row = Math.floor(i / perRow);
  const y0 = Math.min(BAR_Y + SLOT_BORDER / 2, LOGICAL_HEIGHT - size - 1);
  return { x: SLOT_BORDER / 2 + (i % perRow) * size, y: y0 - row * size, size, row };
}

/** Top edge (logical px) of the bar's panel when it holds `n` boxes. */
export function barTop(n: number, k?: number): number {
  const size = slotSide(k);
  const rows = Math.max(1, Math.ceil((Math.max(1, n) * size) / LOGICAL_W));
  return Math.min(BAR_Y, LOGICAL_HEIGHT - size - 1) - (rows - 1) * size;
}

const PUNCTUATION: Readonly<Record<string, string>> = { Semicolon: ';', Period: '.', Comma: ',', Slash: '/', Quote: "'", Minus: '-', Equal: '=' };

/** The key labels of a binding set for the small mirror slots: punctuation keys as their symbol (a word would not fit). */
export function shortLabels(labels: KeyLabels): KeyLabels {
  return Object.fromEntries(Object.entries(labels).map(([k, v]) => [k, PUNCTUATION[v] ?? v]));
}

/** Mirror readout (Player 2 in local Versus): small slots, left-aligned in a row just above the main bar. */
export const MIRROR_SIDE = 52;
const MIRROR_GAP = 3;
const MIRROR_MARGIN = 6;
export const MIRROR_Y = BAR_Y - MIRROR_SIDE - 6;

/**
 * Re-lay the slots of a bar as the small mirrored readout, left-aligned from the margin along `y` (default: just above the main bar;
 * read-only: its cooldown sweeps, key labels and notes stay; clicks and touch overlays do not apply). Pure, for tests.
 */
export function mirrorSlots(slots: readonly ActionSlot[], y = MIRROR_Y): ActionSlot[] {
  return slots.map((s, i) => ({ ...s, x: MIRROR_MARGIN + i * (MIRROR_SIDE + MIRROR_GAP), y, size: MIRROR_SIDE, touch: '' as const, cmd: 0 }));
}

/** Grouped-bar prototype (`bar-groups.ts`): the group a box belongs to, a group's title strip and the re-laid bar. */
export type BarGroup = 'hero' | 'common' | 'team';
export interface GroupHeader {
  readonly group: BarGroup;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  /** Width of the group's boxes in this row. */
  readonly w: number;
}
export interface GroupedBar {
  readonly slots: ActionSlot[];
  readonly headers: GroupHeader[];
  /** Top edge of the panel. */
  readonly top: number;
}

/** Arcade read-outs of one team's bar. */
export interface ArcadeBar {
  /** Hyper meter 0..METER_BAR, weather charge 0..WEATHER_CHARGE_FULL, guard meter 0..GUARD_MAX and whether the guard is up. */
  readonly meter: number;
  readonly weatherCharge: number;
  readonly guard: number;
  readonly guarding: boolean;
  /** Game ticks until Dash / Charge are ready (0: now); chargeIn -1 for a ranged hero, which has none. */
  readonly dashIn: number;
  readonly chargeIn: number;
  /** Keep the Charge box for a ranged active hero (the team has a melee hero, so its touch button exists): shown disabled. */
  readonly keepCharge: boolean;
}

/** Reads one team's `ArcadeBar` off the render view's Arcade read-outs (a team with no active hero reads as full and idle). */
export function arcadeBarOf(ar: RenderArcade, team: 0 | 1, keepCharge: boolean): ArcadeBar {
  const id = ar.active(team);
  return {
    meter: ar.meter[team],
    weatherCharge: ar.weatherCharge[team],
    guard: id < 0 ? GUARD_MAX : ar.guard(id),
    guarding: id >= 0 && ar.guarding(id),
    dashIn: id < 0 ? 0 : ar.dashIn(id),
    chargeIn: id < 0 ? -1 : ar.chargeIn(id),
    keepCharge,
  };
}

/** Ticks a Dash and a melee Charge take to come back (`DASH_COOLDOWN_TICKS`, `CHARGE_COOLDOWN_TICKS` in core data; pinned by a test). */
export const DASH_COOLDOWN = 30;
export const CHARGE_COOLDOWN = 300;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/** Words for a filling meter: the name when full, else the name and its percent. */
function fillNote(name: string, v: number, full: number): string {
  return v >= full ? name : `${name} ${String(Math.floor((Math.max(0, v) * 100) / full))}%`;
}
/** Words for a cooldown in game ticks: the name when ready, else the name and whole seconds left. */
function leftNote(name: string, left: number): string {
  return left > 0 ? `${name} ${String(Math.ceil(left / 50))}s` : name;
}

type SlotInit = Omit<ActionSlot, 'x' | 'y' | 'size' | 'label' | 'note' | 'icon' | 'touch'> & { note?: string; icon?: number; touch?: TouchName };

/**
 * Every box of a bar, left to right: primary, secondary, Snag, the other heroes (Tag), then in Arcade (`arcade` given) Charge, Weather,
 * Dash, Guard and Super, then Trap and Element. `k` (CSS px per logical px) lets small windows grow the boxes to a finger's size.
 */
export function buildSlots(bar: RenderActionBar, labels: KeyLabels = DEFAULT_KEY_LABELS, arcade?: ArcadeBar, k?: number): ActionSlot[] {
  const out: ActionSlot[] = [];
  const kk = arcade ? k : undefined;
  const add = (s: SlotInit, at: number = s.cmd): void => {
    const lay = slotLayout(out.length, kk);
    out.push({ note: '', icon: -1, touch: '', ...s, x: lay.x, y: lay.y, size: lay.size, label: labels[at] ?? '' });
  };
  bar.abilities.forEach((a, i) => {
    const cmd = ABILITY_CMDS[i];
    if (cmd === undefined) return;
    add({
      kind: 'ability', cmd, sprite: a.sprite, highlight: false, disabled: false,
      progress: cooldownProgress(bar.tick, a.readyTick, a.cooldownTicks),
    });
  });
  if (bar.capture) {
    const c = bar.capture;
    const progress = cooldownProgress(bar.tick, c.readyTick, c.cooldownTicks);
    add({
      kind: 'capture', cmd: Cmd.capture, sprite: c.sprite, progress,
      highlight: c.capturable && progress >= 1, disabled: !c.capturable,
    });
  }
  const swapProgress = cooldownProgress(bar.tick, bar.swapReadyTick, bar.swapCooldownTicks);
  bar.swaps.forEach((w, i) => {
    const cmd = SWAP_CMDS[i];
    // Arcade (it has the Trap slot) has no fourth swap: bit 10 is the elemental ability there.
    if (cmd === undefined || (bar.trap !== undefined && cmd === Cmd.swap4)) return;
    add({
      kind: 'swap', cmd, sprite: w.sprite, highlight: false, disabled: w.dead,
      progress: w.dead ? 1 : swapProgress, icon: ACTION_ICON.tag, touch: arcade ? (i === 0 ? 'Tag' : i === 1 ? 'Tag2' : '') : '',
      note: arcade && !w.dead ? leftNote('Tag', Math.max(0, bar.swapReadyTick - bar.tick)) : '',
    });
  });
  if (arcade) {
    // Cmd 0: the transparent touch overlay holds the key, so a canvas click does nothing on these boxes.
    if (arcade.chargeIn >= 0 || arcade.keepCharge) {
      const none = arcade.chargeIn < 0;
      add({
        kind: 'charge', cmd: 0, sprite: '', icon: ACTION_ICON.charge, touch: 'Charge', highlight: false, disabled: none,
        progress: none || arcade.chargeIn === 0 ? 1 : clamp01(1 - arcade.chargeIn / CHARGE_COOLDOWN),
        note: none ? '' : leftNote('Charge', arcade.chargeIn),
      }, ACTION_COMMAND.charge);
    }
    add({
      kind: 'weather', cmd: 0, sprite: '', icon: ACTION_ICON.weather, touch: 'Weather', highlight: false, disabled: false,
      progress: clamp01(arcade.weatherCharge / WEATHER_CHARGE_FULL), note: fillNote('Weather', arcade.weatherCharge, WEATHER_CHARGE_FULL),
    }, ACTION_COMMAND.weather);
    add({
      kind: 'dash', cmd: 0, sprite: '', icon: ACTION_ICON.dash, touch: 'Dash', highlight: false, disabled: false,
      progress: arcade.dashIn <= 0 ? 1 : clamp01(1 - arcade.dashIn / DASH_COOLDOWN), note: leftNote('Dash', arcade.dashIn),
    }, ACTION_COMMAND.dash);
    add({
      kind: 'guard', cmd: 0, sprite: '', icon: ACTION_ICON.guard, touch: 'Guard', highlight: arcade.guarding, disabled: false,
      progress: clamp01(arcade.guard / GUARD_MAX), note: arcade.guarding ? 'Guard on' : fillNote('Guard', arcade.guard, GUARD_MAX),
    }, ACTION_COMMAND.guard);
    add({
      kind: 'super', cmd: 0, sprite: '', icon: ACTION_ICON.super, touch: 'Super', highlight: false, disabled: false,
      progress: clamp01(arcade.meter / METER_BAR), note: fillNote('Super', arcade.meter, METER_BAR),
    }, ACTION_COMMAND.super);
  }
  if (bar.trap) {
    const t = bar.trap;
    add({
      kind: 'trap', cmd: Cmd.trap, sprite: '', icon: ACTION_ICON.trap, touch: arcade ? 'Trap' : '', highlight: false, disabled: false,
      progress: cooldownProgress(bar.tick, t.readyTick, t.cooldownTicks), note: trapNote(bar.tick, t),
    }, TRAP_LABEL);
  }
  if (bar.elemental) {
    const e = bar.elemental;
    add({
      kind: 'elemental', cmd: Cmd.elemental, sprite: '', icon: elementIcon(e.kind), touch: arcade ? 'Element' : '', highlight: bar.tick < e.activeUntil,
      disabled: false, element: e.kind, progress: cooldownProgress(bar.tick, e.readyTick, e.cooldownTicks), note: elementalNote(bar.tick, e),
    }, ELEMENTAL_LABEL);
  }
  return out;
}

/** Ticks (10 s at 50 Hz) after the match starts during which the Capture slot is announced as a new ability. */
export const CAPTURE_NOTICE_TICKS = 500;

/** "Snag unlocked!" line above the Capture slot, labelled with its live key; null when there is no Capture slot or the notice has timed out. */
export function captureHint(slots: readonly ActionSlot[], tick: number): { x: number; y: number; text: string } | null {
  const c = slots.find((s) => s.kind === 'capture');
  if (c === undefined || tick >= CAPTURE_NOTICE_TICKS) return null;
  const key = c.label === '' ? 'its key' : c.label;
  return { x: c.x, y: c.y - 28, text: `Snag unlocked! Press ${key} when the enemy is at 25% health` };
}

/** The Command a click at (px, py) emits: the slot's key bit, or 0 (no command) if it hits no usable slot. */
export function commandAt(slots: readonly ActionSlot[], px: number, py: number): Command {
  for (const s of slots) {
    if (px >= s.x && px < s.x + s.size && py >= s.y && py < s.y + s.size) return s.disabled ? 0 : s.cmd;
  }
  return 0;
}

/**
 * Legacy `drawCooldown` polygon as flat x,y pairs: the not-yet-elapsed region, starting at top-centre
 * and sweeping clockwise as `progress` grows 0..1.
 */
export function cooldownSweep(progress: number, x: number, y: number, size: number): number[] {
  const p = Math.min(1, Math.max(0, progress));
  const half = size / 2;
  const pts = [x + half, y, x + half, y + half];
  const right = x + size;
  const bottom = y + size;
  if (p < 0.125) {
    pts.push(x + half + (p / 0.125) * half, y, right, y, right, bottom, x, bottom, x, y);
  } else if (p < 0.375) {
    pts.push(right, y + ((p - 0.125) / 0.25) * size, right, bottom, x, bottom, x, y);
  } else if (p < 0.625) {
    pts.push(right - ((p - 0.375) / 0.25) * size, bottom, x, bottom, x, y);
  } else if (p < 0.875) {
    pts.push(x, bottom - ((p - 0.625) / 0.25) * size, x, y);
  } else {
    pts.push(x + ((p - 0.875) / 0.125) * half, y);
  }
  return pts;
}

/** How long the ready flash lasts (ms), the colour and the strongest alpha of it: one look for every box. */
export const READY_FLASH_MS = 350;
export const READY_FLASH_COLOR = 0xe0d8c6;
export const READY_FLASH_ALPHA = 0.45;

/** What the one shared cooldown renderer draws for a box. */
export interface CooldownLook {
  /** The shaded not-yet-ready region as flat x,y pairs; undefined when the box is ready. */
  readonly fill: number[] | undefined;
  readonly fillAlpha: number;
  /** Ready flash: alpha of the bone wash over the box (0: none), and how strong its frame pulse is (0..1). */
  readonly flashAlpha: number;
  readonly pulse: number;
}

/**
 * THE cooldown look, the same for every kind of box (abilities, Snag, Tag, Charge, Weather, Dash, Guard, Super, Trap, Element): a clockwise
 * sweep over the part not yet ready (one fixed shade), then an eased-out bone flash for READY_FLASH_MS when it comes back
 * (`flashAgeMs` since it did, -1 for none). A disabled box is shaded whole. Reduced motion: a static whole-box shade while cooling and no flash.
 * Pure; `ActionBarView.drawCooldown` is its only drawer.
 */
export function cooldownLook(progress: number, disabled: boolean, x: number, y: number, size: number, flashAgeMs: number, reduced: boolean): CooldownLook {
  const whole = [x, y, x + size, y, x + size, y + size, x, y + size];
  const shaded = disabled || progress < 1;
  const fill = !shaded ? undefined : disabled || reduced ? whole : cooldownSweep(progress, x, y, size);
  const t = flashAgeMs < 0 ? 1 : flashAgeMs / READY_FLASH_MS;
  const ease = reduced || disabled || t >= 1 ? 0 : (1 - t) ** 3;
  return { fill, fillAlpha: COOLDOWN_ALPHA, flashAlpha: READY_FLASH_ALPHA * ease, pulse: ease };
}

/** Where the 1280x720 screen sits in world px: top-left `x`,`y` and world px per logical px (`scale`). Identity for a fixed camera. */
export interface ScreenBox {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}
const IDENTITY: ScreenBox = { x: 0, y: 0, scale: 1 };

/** Phaser renderer for the bar. Call `update()` each frame; clicks go to `emit` as Commands. */
export class ActionBarView {
  private readonly gfx: Phaser.GameObjects.Graphics;
  /** Slot backgrounds, under the icons (the main graphics sit over them for frames and cooldown shading). */
  private readonly back: Phaser.GameObjects.Graphics;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private readonly icons: Phaser.GameObjects.Image[] = [];
  private readonly headerTexts: Phaser.GameObjects.Text[] = [];
  private slots: ActionSlot[] = [];
  private hint: Phaser.GameObjects.Text | undefined;
  /** Last progress and ready-flash start (ms) per box, so any kind that comes back ready flashes the same way. */
  private readonly lastProgress = new Map<string, number>();
  private readonly flashStart = new Map<string, number>();
  private reduced = false;
  private frame = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly view: RenderView,
    private readonly emit: (cmd: Command) => void,
    private readonly team = 0,
    private readonly labels: () => KeyLabels = () => DEFAULT_KEY_LABELS,
    /** Classic dressing: a dark panel, rounded slot frames and outlined key labels (Arcade keeps the plain legacy look). */
    private readonly styled = false,
    /** Arcade pan/zoom camera: keeps the bar fixed on screen by mapping its logical layout onto the visible window every frame. */
    private readonly place?: () => ScreenBox,
    /** Player 2's mirrored readout: small slots left-aligned above the main bar, no background panel, no overlays and no clicks (the keyboard drives it). */
    private readonly mirror = false,
    /** Grouped-bar prototype (`?ff=barGroups`, dev/test builds): re-lays the Arcade boxes into labelled groups; the cooldown renderer is unchanged. */
    private readonly arrange?: (slots: readonly ActionSlot[], k?: number) => GroupedBar,
  ) {
    this.back = scene.add.graphics().setDepth(98);
    this.gfx = scene.add.graphics().setDepth(100);
    if (!mirror) scene.input.on('pointerdown', this.onPointer);
  }

  /** Logical (screen) x/y to world, through the current screen box. */
  private box: ScreenBox = IDENTITY;
  private wx(x: number): number {
    return this.box.x + x * this.box.scale;
  }
  private wy(y: number): number {
    return this.box.y + y * this.box.scale;
  }

  /** The Charge touch button exists (a melee hero is on the team): keep its box even while a ranged hero is active. */
  private hasChargeButton(): boolean {
    return !this.mirror && typeof document !== 'undefined' && document.getElementById('arcadeCharge') !== null;
  }

  update(): void {
    this.box = this.place?.() ?? IDENTITY;
    this.gfx.setPosition(this.box.x, this.box.y).setScale(this.box.scale);
    this.back.setPosition(this.box.x, this.box.y).setScale(this.box.scale);
    if (this.frame++ % 30 === 0) {
      try {
        this.reduced = getPrefs().reduceMotion;
      } catch {
        this.reduced = false;
      }
    }
    const bar = this.view.actionBar(this.team);
    const ar = this.view.arcade();
    const k = this.scene.scale.displaySize.width / LOGICAL_W;
    const extras = bar && ar ? arcadeBarOf(ar, this.team === 1 ? 1 : 0, this.hasChargeButton()) : undefined;
    const built = bar ? buildSlots(bar, this.labels(), extras, k) : [];
    const grouped = !this.mirror && extras && this.arrange ? this.arrange(built, k) : undefined;
    this.slots = this.mirror ? mirrorSlots(built, barTop(MAX_SLOTS, extras ? k : undefined) - MIRROR_SIDE - 6) : grouped ? grouped.slots : built;
    const top = grouped ? grouped.top : barTop(built.length, extras ? k : undefined);
    const g = this.gfx;
    g.clear();
    this.back.clear();
    if (this.mirror) {
      // No panel: each slot keeps its own plate.
    } else if (this.slots.length > 0 && this.styled) {
      this.back.fillStyle(0x0b0a09, 0.86);
      this.back.fillRect(0, top, HUD_WIDTH, LOGICAL_HEIGHT - top);
      this.back.fillStyle(0xd8cdb8, 0.05);
      this.back.fillRect(0, top, HUD_WIDTH, 3);
      g.lineStyle(1, 0x6b6558, 0.8);
      g.lineBetween(0, top + 1, HUD_WIDTH, top + 1);
    } else if (this.slots.length > 0) {
      g.lineStyle(TOP_BORDER, 0x111111, 1);
      g.lineBetween(0, top + TOP_BORDER, HUD_WIDTH, top + TOP_BORDER);
    }
    const now = performance.now();
    this.slots.forEach((s, i) => {
      if (this.styled) {
        this.back.fillStyle(s.sprite === '' ? 0x070605 : 0x1d1e1f, 0.95);
        this.back.fillRoundedRect(s.x + 1, s.y + 1, s.size - 2, s.size - 2, 2);
      }
      this.drawIcon(i, s);
      const key = `${s.kind}:${String(s.cmd)}:${String(i)}`;
      const prev = this.lastProgress.get(key);
      if (prev !== undefined && prev < 1 && s.progress >= 1 && !s.disabled) this.flashStart.set(key, now);
      this.lastProgress.set(key, s.progress);
      const started = this.flashStart.get(key);
      const look = cooldownLook(s.progress, s.disabled, s.x, s.y, s.size, started === undefined ? -1 : now - started, this.reduced);
      if (this.styled) {
        const ready = s.progress >= 1 && !s.disabled;
        g.lineStyle(s.highlight ? 3 : 1, s.highlight ? CAPTURE_READY_COLOR : ready ? readyEdge(s.element) : 0x2e2c29, 1);
        g.strokeRoundedRect(s.x + 1, s.y + 1, s.size - 2, s.size - 2, 2);
      } else {
        g.lineStyle(s.highlight ? 3 : 1, s.highlight ? CAPTURE_READY_COLOR : 0x000000, 1);
        g.strokeRect(s.x, s.y, s.size, s.size);
      }
      this.drawCooldown(look, s);
      this.text(i, s);
    });
    this.drawHeaders(g, grouped?.headers ?? []);
    if (!this.mirror) {
      this.drawHint(bar?.tick ?? 0);
      if (extras && this.frame % 5 === 1) syncTouchOverlays(this.screenSlots().map((r, i) => ({ ...r, touch: this.slots[i]?.touch ?? '' })), this.scene.game.canvas);
    }
    for (let i = this.slots.length; i < this.icons.length; i++) {
      this.icons[i]?.setVisible(false);
      this.texts[i]?.setVisible(false);
    }
  }

  /** Group titles and the rule under each (prototype only; nothing is drawn for the flat bar). */
  private drawHeaders(g: Phaser.GameObjects.Graphics, headers: readonly GroupHeader[]): void {
    headers.forEach((h, i) => {
      g.lineStyle(1, 0x6b6558, 0.9);
      g.lineBetween(h.x, h.y + 14, h.x + h.w, h.y + 14);
      let t = this.headerTexts[i];
      if (!t) {
        t = this.scene.add.text(0, 0, '', crisp(this.scene, { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '13px', fontStyle: 'bold', color: '#a89f88' })).setDepth(101);
        this.headerTexts[i] = t;
      }
      if (t.text !== h.text) t.setText(h.text);
      t.setVisible(true).setPosition(this.wx(h.x + 2), this.wy(h.y)).setScale(this.box.scale);
    });
    for (let i = headers.length; i < this.headerTexts.length; i++) this.headerTexts[i]?.setVisible(false);
  }

  /** The ONE cooldown drawer: every box, whatever its kind, is shaded and flashed through here from `cooldownLook`. */
  private drawCooldown(look: CooldownLook, s: ActionSlot): void {
    const g = this.gfx;
    const pts = look.fill;
    if (pts) {
      g.fillStyle(COOLDOWN_COLOR, look.fillAlpha);
      g.beginPath();
      g.moveTo(pts[0] ?? 0, pts[1] ?? 0);
      for (let n = 2; n + 1 < pts.length; n += 2) g.lineTo(pts[n] ?? 0, pts[n + 1] ?? 0);
      g.closePath();
      g.fillPath();
    }
    if (look.flashAlpha > 0) {
      g.fillStyle(READY_FLASH_COLOR, look.flashAlpha);
      g.fillRect(s.x, s.y, s.size, s.size);
      g.lineStyle(1 + Math.round(2 * look.pulse), READY_FLASH_COLOR, look.pulse);
      g.strokeRect(s.x, s.y, s.size, s.size);
    }
  }

  destroy(): void {
    if (!this.mirror) this.scene.input.off('pointerdown', this.onPointer);
    this.gfx.destroy();
    this.back.destroy();
    this.hint?.destroy();
    this.icons.forEach((o) => { o.destroy(); });
    this.texts.forEach((o) => { o.destroy(); });
    this.headerTexts.forEach((o) => { o.destroy(); });
  }

  /** Slot rects as the player sees them, in logical screen px (world transform of the bar's graphics through the live camera), for tests. */
  screenSlots(): { x: number; y: number; size: number }[] {
    const cam = this.scene.cameras.main;
    const res = this.scene.scale.width / LOGICAL_W;
    const k = this.gfx.scaleX * cam.zoom / res;
    const sx = (this.gfx.x - (cam.scrollX + cam.width / 2 - cam.width / 2 / cam.zoom)) * cam.zoom / res;
    const sy = (this.gfx.y - (cam.scrollY + cam.height / 2 - cam.height / 2 / cam.zoom)) * cam.zoom / res;
    return this.slots.map((s) => ({ x: sx + s.x * k, y: sy + s.y * k, size: s.size * k }));
  }

  /** Current slots (logical coordinates), for tests and the click probe. */
  get currentSlots(): readonly ActionSlot[] {
    return this.slots;
  }

  private readonly onPointer = (p: Phaser.Input.Pointer): void => {
    // Fixed camera: world == logical. Panned camera: the bar is screen-fixed, so use the pointer's screen position in logical px.
    const res = this.scene.scale.width / LOGICAL_W;
    const cmd = this.place ? commandAt(this.slots, p.x / res, p.y / res) : commandAt(this.slots, p.worldX, p.worldY);
    if (cmd !== 0) this.emit(cmd);
  };

  private drawHint(tick: number): void {
    const h = captureHint(this.slots, tick);
    if (h === null) {
      this.hint?.setVisible(false);
      return;
    }
    this.hint ??= this.scene.add.text(
      0, 0, '',
      crisp(this.scene, { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: `${String(Math.round(17 * phoneBoost(this.scene, 1.4)))}px`, fontStyle: 'bold', color: '#d8c89a', backgroundColor: '#0b0a09e0', padding: { x: 8, y: 3 } }),
    ).setDepth(102);
    this.hint.setVisible(true).setPosition(this.wx(h.x), this.wy(h.y)).setScale(this.box.scale);
    if (this.hint.text !== h.text) this.hint.setText(h.text);
  }

  /** The slot's icon: the character's sprite where it has one, else its cell on the generated `hud:actions` sheet (never graded: it is already grim). */
  private drawIcon(i: number, s: ActionSlot): void {
    let icon = this.icons[i];
    if (!icon) {
      icon = this.scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(99);
      this.icons[i] = icon;
    }
    const found = lookup(s.sprite);
    if (found && this.scene.textures.exists(found.key)) {
      const key = this.styled ? gradedTexture(this.scene, found.key) : found.key;
      const tex = this.scene.textures.get(key);
      const [fx = 0, fy = 0, fw = 80, fh = 80] = found.entry.coords;
      if (!tex.has(ICON_FRAME)) tex.add(ICON_FRAME, 0, fx, fy, fw, fh);
      if (icon.texture.key !== key || icon.frame.name !== ICON_FRAME) icon.setTexture(key, ICON_FRAME);
      const pad = this.styled ? ICON_PAD * (s.size / SLOT_SIDE) : 0;
      const fit = fitIcon(fw, fh, s.size - pad * 2);
      icon.setVisible(true).setPosition(this.wx(s.x + pad + fit.dx), this.wy(s.y + pad + fit.dy)).setDisplaySize(fit.w * this.box.scale, fit.h * this.box.scale);
      return;
    }
    if (s.icon < 0 || !this.scene.textures.exists(ACTION_SHEET)) {
      icon.setVisible(false);
      return;
    }
    const frame = `a${String(s.icon)}`;
    const tex = this.scene.textures.get(ACTION_SHEET);
    if (!tex.has(frame)) tex.add(frame, 0, (s.icon % SHEET_COLS) * SHEET_CELL, Math.floor(s.icon / SHEET_COLS) * SHEET_CELL, SHEET_CELL, SHEET_CELL);
    if (icon.texture.key !== ACTION_SHEET || icon.frame.name !== frame) icon.setTexture(ACTION_SHEET, frame);
    icon.setVisible(true).setPosition(this.wx(s.x + 1), this.wy(s.y + 1)).setDisplaySize((s.size - 2) * this.box.scale, (s.size - 2) * this.box.scale);
  }

  private text(i: number, s: ActionSlot): void {
    let t = this.texts[i];
    if (!t) {
      const size = `${String(Math.round((this.mirror ? 14 : 16) * Math.min(1.8, phoneBoost(this.scene))))}px`;
      t = this.scene.add.text(
        0, 0, '',
        crisp(this.scene, this.styled
          ? { fontFamily: 'Georgia, "Times New Roman", serif', fontSize: size, fontStyle: 'bold', color: '#e0d8c6', stroke: '#0a0806', strokeThickness: 3 }
          : { fontFamily: 'Arial', fontSize: size, fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 4 }),
      );
      t.setDepth(101);
      this.texts[i] = t;
    }
    const line = s.note === '' ? s.label : `${s.label}\n${s.note}`;
    if (t.text !== line) t.setText(line);
    // A note wider than its slot ("Trap 0/2", "Ember 12s") is squeezed to fit, so it never runs into the next slot's key or note.
    const fit = fitTextScale(t.width, s.size);
    t.setVisible(true).setPosition(this.wx(s.x + (this.styled ? 5 : 2)), this.wy(s.y + (this.styled ? 2 : 0))).setScale(this.box.scale * fit);
  }
}
