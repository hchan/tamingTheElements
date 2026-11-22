import type Phaser from 'phaser';
import type { Command, RenderActionBar, RenderArcade } from '@core/index';
import { Cmd, GUARD_MAX, SwapBlock, METER_BAR, RUN_AWAY_DESCRIPTION, RUN_AWAY_NAME, RUN_TICKS, RUN_TOWARDS_DESCRIPTION, RUN_TOWARDS_NAME, WEATHER_CHARGE_FULL } from '@core/index';
import { LOGICAL_WIDTH as LOGICAL_W } from '../boot/viewport';
import { ACTION_COMMAND } from '../input/key-map';
import { actionKeyLabel, DEFAULT_BINDINGS, GAME_ACTIONS, type Bindings } from '../platform/input/bindings';
import { gradeRgba, mute } from '../fx/grim-fx';
import { CLEANSE_COOLDOWN } from './cleanse-clock';
import { elementalShown } from '../platform/cleanse-info';
import { abilityNameOfSprite, abilityShortOfSprite, trapNameOfElement, trapShortOfElement, trapTextOfElement } from './kit-names';
import { COMMON_EFFECT, HERO_EFFECT, elementalEffect, elementalTitle } from '../platform/ability-text';
import { stunWord } from './stun-secs';

const ELEMENT_BY_KIND = ['void', 'fire', 'water', 'earth', 'air'] as const;

/**
 * Action bar (legacy `actionbar.js`): primary, secondary, capture (chapter 2+) and swap slots along the
 * bottom edge, with a clockwise cooldown sweep (legacy `HUDHelper.drawCooldown`). In Arcade the same bar also carries every other
 * action (Tag, Charge, Weather, Dash, Guard, Super, Trap, Element, Cleanse): one kind of box, all on the left, each with an icon, its key in the
 * corner and the one shared cooldown look (`cooldownLook`); the DOM touch buttons are transparent overlays on those boxes
 * (`touch-overlay.ts`), so there is nothing on the right. Everything except
 * `ActionBarView` is pure. View-only: a mouse click maps to the same Command bit as the matching key
 * and goes to the caller's sink; the bar never touches the sim.
 */
export const LOGICAL_HEIGHT = 720;
export const ACTION_BAR_HEIGHT = 80;
export const TOP_BORDER = 1;
const SLOT_BORDER = 2;
/** Legacy `Global.actionBarHeight - slotBorderWidth / 2 - topBorderWidth * 2`. */
export const SLOT_SIDE = ACTION_BAR_HEIGHT - SLOT_BORDER / 2 - TOP_BORDER * 2;
export const BAR_Y = LOGICAL_HEIGHT - ACTION_BAR_HEIGHT;
export const COOLDOWN_ALPHA = 0.52;
export const COOLDOWN_COLOR = 0x090909;
export const CAPTURE_READY_COLOR = 0xb39653;

/** Icon padding inside a slot frame (Classic dressing). */
export const ICON_PAD = 8;
export const ICON_FRAME = 'icon';

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
    const label = actionKeyLabel(bindings, action);
    // Trap shares Capture's command bit 6 and the elemental ability the fourth swap's bit 10, so theirs live apart.
    const at = action === 'trap' ? TRAP_LABEL : action === 'elemental' ? ELEMENTAL_LABEL : action === 'cleanse' ? CLEANSE_LABEL : ACTION_COMMAND[action];
    if (label !== undefined) out[at] = label;
  }
  return out;
}

/** Where the Trap key's label sits in a KeyLabels (its command bit is Capture's). */
export const TRAP_LABEL = 100;
/** Where the elemental ability key's label sits in a KeyLabels (its command bit is the fourth swap's). */
export const ELEMENTAL_LABEL = 101;
/** Where the common Cleanse key's label sits in a KeyLabels (its command bit is the third swap's). */
export const CLEANSE_LABEL = 102;

export const DEFAULT_KEY_LABELS: KeyLabels = labelsFromBindings(DEFAULT_BINDINGS);

const SWAP_CMDS = [Cmd.swap1, Cmd.swap2, Cmd.swap3, Cmd.swap4] as const;
/** Sprite key of the Snag rope throw (Entangling Vines): the hero slot that holds it is labelled Snag. */
const SNAG_SPRITE = 'entanglingVines';
const ABILITY_CMDS = [Cmd.primary, Cmd.secondary] as const;

/** Every kind of box on the bar: the one shape, told apart by its icon, key and words. */
export type SlotKind = 'ability' | 'capture' | 'swap' | 'trap' | 'elemental' | 'super' | 'guard' | 'dash' | 'weather' | 'charge' | 'cleanse' | 'run';

/** Cell of each icon on the `hud:actions` sheet (`tools/assets/hud-gen/actions.py` TILES order, 4 per row, 64 px cells). */
export const ACTION_ICON = { trap: 0, tag: 1, charge: 2, weather: 3, dash: 4, guard: 5, super: 6, fire: 7, water: 8, earth: 9, air: 10, element: 11, cleanse: 12 } as const;
export const ACTION_SHEET = 'hud:actions';
export const SHEET_CELL = 64;
export const SHEET_COLS = 4;

/** The touch button (id `arcade<touch>`) that sits over a box as a transparent overlay; '' for a box with none. */
export type TouchName = '' | 'Super' | 'Guard' | 'Dash' | 'Weather' | 'Charge' | 'Tag' | 'Tag2' | 'Trap' | 'Element' | 'Cleanse' | 'Run';

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
  /** Run slot only: true for Run Away (a ranged hero), false for Run Towards (names the box and its tip). */
  readonly runAway?: boolean;
}

/** The Trap slot's words (never colour alone): whole seconds left while cooling, else the live count, or "full" at the cap. */
export function trapNote(tick: number, t: { readyTick: number; count: number; max: number }, name = 'Trap'): string {
  if (tick < t.readyTick) return `${name} ${String(Math.ceil((t.readyTick - tick) / 50))}s`;
  return t.count >= t.max ? `${name} full` : `${name} ${String(t.count)}/${String(t.max)}`;
}

/** The elemental slot's words (never colour alone): "<Name> on" while its buff runs, whole seconds left while cooling, else the name. */
export function elementalNote(tick: number, e: { name: string; readyTick: number; activeUntil: number }): string {
  if (tick < e.activeUntil) return `${e.name} on`;
  if (tick < e.readyTick) return `${e.name} ${String(Math.ceil((e.readyTick - tick) / 50))}s`;
  return e.name;
}

/** The tooltip for a box: its plain name and a one-line effect (the Guide's own text, so the two never disagree). */
export function slotTip(s: Pick<ActionSlot, 'kind' | 'cmd' | 'element'> & { sprite?: string; runAway?: boolean }): { title: string; text: string } {
  switch (s.kind) {
    case 'ability':
      if (s.sprite === SNAG_SPRITE) return { title: 'Snag', text: COMMON_EFFECT.snag };
      {
        const own = abilityNameOfSprite(s.sprite ?? '');
        if (own !== undefined) return { title: own, text: s.cmd === Cmd.primary ? HERO_EFFECT.primary : HERO_EFFECT.secondary };
      }
      return s.cmd === Cmd.primary ? { title: 'Attack', text: HERO_EFFECT.primary } : { title: 'Special', text: HERO_EFFECT.secondary };
    case 'capture': return { title: 'Snag', text: COMMON_EFFECT.snag };
    case 'swap': return { title: 'Tag', text: COMMON_EFFECT.tag };
    case 'trap': return { title: trapNameOfElement(s.element), text: trapTextOfElement(s.element) ?? COMMON_EFFECT.trap };
    case 'elemental': return { title: elementalTitle(s.element ?? 0), text: elementalEffect(ELEMENT_BY_KIND[s.element ?? 0] ?? 'void') };
    case 'super': return { title: 'Super', text: COMMON_EFFECT.super };
    case 'guard': return { title: 'Guard', text: COMMON_EFFECT.guard };
    case 'dash': return { title: 'Dash', text: COMMON_EFFECT.dash };
    case 'weather': return { title: 'Weather', text: COMMON_EFFECT.weather };
    case 'charge': return { title: 'Charge', text: COMMON_EFFECT.charge };
    case 'cleanse': return { title: 'Cleanse', text: COMMON_EFFECT.cleanse };
    case 'run': return s.runAway === false ? { title: RUN_TOWARDS_NAME, text: RUN_TOWARDS_DESCRIPTION } : { title: RUN_AWAY_NAME, text: RUN_AWAY_DESCRIPTION };
  }
}

/** A tip sits this far above the box's top, clearing the TAG caption that floats over the swap slot (tag-view CAPTION_LIFT 26 + its height). */
const TIP_LIFT = 44;
/** Where a tooltip `w` x `h` goes for a box: centred above it (clear of the TAG caption), kept inside the 1280-wide screen, below the top edge. Pure, for tests. */
export function tipPlacement(s: Pick<ActionSlot, 'x' | 'y' | 'size'>, w: number, h: number): { x: number; y: number } {
  const x = Math.min(LOGICAL_W - w - 4, Math.max(4, s.x + s.size / 2 - w / 2));
  return { x, y: Math.max(4, s.y - h - TIP_LIFT) };
}

/** How long a held finger waits before a touch tip shows, and how long tips stay hidden after a super starts (its banner owns the screen). */
export const TIP_LONG_PRESS_MS = 450;
export const TIP_SUPER_QUIET_MS = 2800;
/** A tip never stays pinned: it hides this long after it first showed for the current target (a resting mouse or focus is not a request to read it all fight). */
export const TIP_MAX_MS = 3500;

/** Pure: has a tip that began at `since` (ms) run out at `now`? */
export function tipExpired(since: number, now: number): boolean {
  return now - since >= TIP_MAX_MS;
}

/** Line colour per element kind (index 0 is Void, a violet, so a Void box is not left bone; a second cue only: the icon's shape and the slot's words say which). */
export const ELEMENT_TINT: readonly number[] = [0xb48cff, 0xff7a3d, 0x5cc8ff, 0xc9a26b, 0xe6f4ff];

/** A ready tile's edge: the tile's element colour dulled to ash, or bone when it has none (readiness is also the lit text and the missing cooldown shade). */
export function readyEdge(element: number | undefined): number {
  return element !== undefined ? mute(ELEMENT_TINT[element] ?? 0xffffff, 0.5, 0.75) : 0xa89f88;
}

/** Horizontal scale (at most 1) that keeps a text `width` wide inside a slot `size` wide, leaving `pad` px each side. */
export function fitTextScale(width: number, size: number, pad = 4): number {
  return width <= 0 ? 1 : Math.min(1, Math.max(0.1, (size - pad * 2) / width));
}

/** A plain-word name for a box that has no state words of its own, so every box of the dressed bar carries a readable label. */
export function slotWord(s: Pick<ActionSlot, 'kind' | 'cmd' | 'note'>): string {
  if (s.note !== '') return s.note;
  switch (s.kind) {
    case 'ability': return s.cmd === Cmd.primary ? 'Attack' : 'Special';
    case 'capture': return 'Snag';
    case 'swap': return 'Tag';
    case 'trap': return 'Trap';
    case 'elemental': return 'Element';
    case 'super': return 'Super';
    case 'guard': return 'Guard';
    case 'dash': return 'Dash';
    case 'weather': return 'Weather';
    case 'charge': return 'Charge';
    case 'cleanse': return 'Cleanse';
    case 'run': return 'Run';
  }
}

/** Frame colour per kind of box in the dressed bar (the element's own colour for an Element box): ash-dulled, never the only cue. */
export const KIND_TINT: Readonly<Record<SlotKind, number>> = {
  ability: 0xffffff, capture: 0xc9a26b, swap: 0xffffff, trap: 0xc9a26b, elemental: 0xffffff, super: 0xffd15c,
  guard: 0xe6f4ff, dash: 0xe6f4ff, weather: 0x5cc8ff, charge: 0xff7a3d, cleanse: 0x9fdc8a, run: 0xe6f4ff,
};

/**
 * The dressed bar's parts of one box, in logical px, so nothing overlaps: a corner badge for the key (top-left), the icon centred in the
 * area above, and a label strip along the bottom. `keyLen` is the key label's length (a longer key widens the badge).
 */
export interface SlotParts {
  readonly badge: { x: number; y: number; w: number; h: number };
  readonly icon: { x: number; y: number; w: number; h: number };
  readonly strip: { x: number; y: number; w: number; h: number };
}
export function slotParts(x: number, y: number, size: number, keyLen: number): SlotParts {
  const stripH = Math.round(size * 0.24);
  const pad = Math.max(2, Math.round(size * 0.04));
  const badgeH = Math.round(size * 0.2);
  const iconH = size - stripH - pad * 2 - 1;
  const iconW = Math.min(size - pad * 2, iconH);
  return {
    badge: { x: x + 2, y: y + 2, w: Math.max(badgeH, Math.round(badgeH * 0.55) * Math.max(1, keyLen) + 4), h: badgeH },
    icon: { x: x + (size - iconW) / 2, y: y + pad, w: iconW, h: iconH },
    strip: { x: x + 1, y: y + size - 1 - stripH, w: size - 2, h: stripH },
  };
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

/** The most boxes the bar ever holds (primary, secondary, three swaps, charge, weather, dash, guard, super, trap, elemental, cleanse, run): sizes the Player 2 lift. */
export const MAX_SLOTS = 15;
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

/** Smallest a one-row bar box may be on screen in CSS px; under it the bar keeps its wrapped rows. */
export const ONE_ROW_MIN_CSS = 24;

/** Box side (logical px) when `n` boxes share ONE row across the 1280 box, or undefined when that would be under ONE_ROW_MIN_CSS on screen. */
export function oneRowSide(n: number, k: number): number | undefined {
  if (!(k > 0) || n < 1) return undefined;
  const side = Math.min(slotSide(k), Math.floor((LOGICAL_W - SLOT_BORDER / 2) / n));
  return side * k < ONE_ROW_MIN_CSS ? undefined : side;
}

/** The boxes re-laid in a single row at the bottom of the canvas (portrait phones), or undefined when they would be too small. */
export function oneRowSlots<T extends { x: number; y: number; size: number }>(slots: readonly T[], k: number): { slots: T[]; top: number } | undefined {
  const side = oneRowSide(slots.length, k);
  if (side === undefined) return undefined;
  const y = LOGICAL_HEIGHT - side - 1;
  return { slots: slots.map((s, i) => ({ ...s, x: SLOT_BORDER / 2 + i * side, y, size: side })), top: y };
}

/** Smallest a touch box may be on screen in CSS px in the portrait bar, both ways (WCAG 2.5.8 target size; the one-row bar's 28-39 px boxes were under it). */
export const PORTRAIT_MIN_TOUCH_CSS = 44;
/** Tight-fit rung (QA r105/r106 P2): a box a hair under 44 wide (the 2v2 bar's nine boxes are 43 at 390, 39.4 at 360; the touch skirt keeps each 44 tall) still beats a second row. Never below this. */
export const PORTRAIT_TIGHT_TOUCH_CSS = 39;
/** Largest a tile of the wrapped (two-row) portrait bar grows on screen, CSS px: 64 px rows covered the floor at 360 wide (QA r101 P2); 48 keeps a comfortable tap and frees about 32 px. */
export const PORTRAIT_ROW_TILE_MAX_CSS = 48;

/**
 * The portrait phone bar: ONE row when its boxes are at least PORTRAIT_MIN_TOUCH_CSS wide on screen (`ext` 44: the touch overlays reach 44 CSS px
 * up over the floor), else tiles of at least that size wrapped into rows (the bottom row full, the rest above it, `ext` 0: every box is already
 * a 44 px square, so no skirt). Undefined when not even one tile fits across (a tiny window): the caller keeps the plain bar. Pure, for tests.
 */
export function portraitBarSlots<T extends { x: number; y: number; size: number }>(slots: readonly T[], k: number): { slots: T[]; top: number; ext: number } | undefined {
  const row = oneRowSlots(slots, k);
  if (row !== undefined && (row.slots[0]?.size ?? 0) * k >= PORTRAIT_TIGHT_TOUCH_CSS - 1e-9) return { ...row, ext: 44 };
  if (!(k > 0) || slots.length === 0) return undefined;
  const min = Math.ceil(PORTRAIT_MIN_TOUCH_CSS / k);
  const perRow = Math.floor((LOGICAL_W - SLOT_BORDER / 2) / min);
  if (perRow < 1) return undefined;
  const rows = Math.ceil(slots.length / perRow);
  // Balanced rows (9 -> 5+4, 10 -> 5+5, never one orphan tile above a full row), tiles capped at 64 CSS px, each row centred.
  const per = Math.ceil(slots.length / rows);
  const side = Math.max(min, Math.min(Math.floor((LOGICAL_W - SLOT_BORDER / 2) / per), Math.floor(PORTRAIT_ROW_TILE_MAX_CSS / k)));
  const y0 = LOGICAL_HEIGHT - side - 1;
  const left = (r: number): number => Math.floor((LOGICAL_W - Math.min(per, slots.length - r * per) * side) / 2);
  return { slots: slots.map((s, i) => { const r = Math.floor(i / per); return { ...s, x: left(r) + (i % per) * side, y: y0 - (rows - 1 - r) * side, size: side }; }), top: y0 - (rows - 1) * side, ext: 0 };
}

/**
 * Portrait phones draw Strike 1 and Strike 2 as circles on the deck, so the bar's Blast and Flame tiles (the same two commands) are dropped:
 * one way to fire each, and the remaining eight tiles fit one row. A Snag rope slot stays (a tile with that note is not a plain strike). Pure, for tests.
 */
export function withoutStrikeTiles<T extends Pick<ActionSlot, 'kind' | 'sprite'>>(slots: readonly T[]): T[] {
  return slots.filter((s) => !(s.kind === 'ability' && s.sprite !== SNAG_SPRITE));
}

/** The two Strike circles' own ability names for a bar's abilities (index 0 = Strike 1): [short word on the circle, full name for screen readers]. Pure, for tests. */
export function strikeCues(abilities: readonly { sprite: string }[]): [string, string][] {
  return [0, 1].map((i): [string, string] => {
    const sprite = abilities[i]?.sprite ?? '';
    // The rope-throw ability is "Snag" on the bar box (buildSlots, slotTip), so the circle says the same (QA r107 P2).
    if (sprite === SNAG_SPRITE) return ['Snag', 'Snag'];
    const short = abilityShortOfSprite(sprite) ?? '';
    return [short, abilityNameOfSprite(sprite) ?? short];
  });
}

/** Portrait phones: name what each Strike circle fires (the bar's Blast / Flame / Ice Shock tiles are dropped), as a small third line on the circle. Idempotent. */
export function showStrikeCues(cues: readonly (readonly [string, string])[]): void {
  if (typeof document === 'undefined') return;
  ['touchStrike1', 'touchStrike2'].forEach((id, i) => {
    const b = document.getElementById(id);
    const cue = cues[i];
    if (!b || !cue) return;
    let n = b.querySelector<HTMLElement>('.touchStrikeAbility');
    if (!n) {
      n = document.createElement('span');
      n.className = 'touchStrikeAbility';
      b.append(n);
    }
    if (n.textContent !== cue[0]) n.textContent = cue[0];
    // Long names (Adrenaline, Rock Armr) get a smaller face so the whole word fits the circle (QA r101 P2).
    const len = cue[0].length >= 10 ? 'xl' : cue[0].length >= 8 ? 'long' : '';
    if ((n.dataset['len'] ?? '') !== len) {
      if (len) n.dataset['len'] = len;
      else delete n.dataset['len'];
    }
    const key = b.querySelector('.touchStrikeKey')?.textContent ?? String(i + 1);
    const label = cue[1] === '' ? `${key} Strike` : `${key} Strike: ${cue[1]}`;
    if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
  });
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
  /** Game ticks until the common Cleanse is ready (0: now), counted by the view from `cleanse` events (`cleanse-clock.ts`). */
  readonly cleanseIn: number;
  /** Keep the Charge box for a ranged active hero (the team has a melee hero, so its touch button exists): shown disabled. */
  readonly keepCharge: boolean;
  /** Why the Tag slots cannot be used right now ('WAIT', 'STUN'), when the view can tell (WP-HC1); absent when they can. */
  readonly swapBlock?: string;
  /** Why Run is refused right now ('rooted', 'stunned'), when the view can tell (QA r110); absent when nothing blocks it. */
  readonly runBlock?: RunBlock;
}

/** Why a Run press does nothing besides its cooldown: a Snag root or a stun. */
export type RunBlock = 'rooted' | 'stunned';
/** The short word the Run tile shows while a block holds (never colour alone: the tile is also shaded). */
export const RUN_BLOCK_NOTE: Readonly<Record<RunBlock, string>> = { rooted: "Can't run: rooted", stunned: "Can't run: stunned" };

/** Reads one team's `ArcadeBar` off the render view's Arcade read-outs (a team with no active hero reads as full and idle). */
export function arcadeBarOf(ar: RenderArcade, team: 0 | 1, keepCharge: boolean, cleanseIn: (id: number) => number = () => 0): ArcadeBar {
  const id = ar.active(team);
  // The sim's `swapAllowed`: WAIT outside the fight, `STUN 0.6s` while hit-stunned; frozen and busy show no word (swap-notice.ts).
  const bits = ar.swapBlock(team);
  const swapBlock = (bits & SwapBlock.wait) !== 0 ? 'WAIT' : (bits & SwapBlock.stun) !== 0 ? stunWord('STUN', id >= 0 ? ar.stunLeft(id) : 0) : undefined;
  return {
    ...(swapBlock !== undefined ? { swapBlock } : {}),
    ...(id >= 0 && ar.stunned(id) ? { runBlock: 'stunned' as const } : id >= 0 && ar.rooted(id) ? { runBlock: 'rooted' as const } : {}),
    meter: ar.meter[team],
    weatherCharge: ar.weatherCharge[team],
    guard: id < 0 ? GUARD_MAX : ar.guard(id),
    guarding: id >= 0 && ar.guarding(id),
    dashIn: id < 0 ? 0 : ar.dashIn(id),
    chargeIn: id < 0 ? -1 : ar.chargeIn(id),
    cleanseIn: id < 0 ? 0 : cleanseIn(id),
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

/** An ability box's words: its short own name, with whole seconds left while cooling (never colour alone); {} when the sprite is unknown. */
export function abilityNote(sprite: string, tick: number, readyTick: number): { note?: string } {
  const n = abilityShortOfSprite(sprite);
  return n === undefined ? {} : { note: leftNote(n, readyTick - tick) };
}

type SlotInit = Omit<ActionSlot, 'x' | 'y' | 'size' | 'label' | 'note' | 'icon' | 'touch'> & { note?: string; icon?: number; touch?: TouchName };

/**
 * Every box of a bar, left to right: primary, secondary, Snag, the other heroes (Tag), then in Arcade (`arcade` given) Charge, Weather,
 * Dash, Guard and Super, then Trap and Element. `k` (CSS px per logical px) lets small windows grow the boxes to a finger's size.
 */
export function buildSlots(bar: RenderActionBar, labels: KeyLabels = DEFAULT_KEY_LABELS, arcade?: ArcadeBar, k?: number): ActionSlot[] {
  const out: ActionSlot[] = [];
  const kk = arcade ? k : undefined;
  const add = (s: SlotInit, at: number = s.cmd, also?: string): void => {
    const lay = slotLayout(out.length, kk);
    const own = labels[at] ?? '';
    out.push({ note: '', icon: -1, touch: '', ...s, x: lay.x, y: lay.y, size: lay.size, label: also !== undefined && also !== '' && also !== own ? `${own} ${also}`.trim() : own });
  };
  bar.abilities.forEach((a, i) => {
    const cmd = ABILITY_CMDS[i];
    if (cmd === undefined) return;
    // In Arcade the Snag box also answers to C: its keycap reads "1 C" (own key, then C), so the rope has a visible home on the bar.
    const snagC = arcade && a.sprite === SNAG_SPRITE ? labels[Cmd.capture] : undefined;
    add({
      kind: 'ability', cmd, sprite: a.sprite, highlight: false, disabled: false,
      // The rope-throw slot (Treenoc, Wispera, Curomo, Echo) is named in words, never just "Special".
      ...(a.sprite === SNAG_SPRITE ? { note: 'Snag' } : arcade ? abilityNote(a.sprite, bar.tick, a.readyTick) : {}),
      progress: cooldownProgress(bar.tick, a.readyTick, a.cooldownTicks),
    }, cmd, snagC);
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
    const block = arcade && !w.dead ? arcade.swapBlock : undefined;
    add({
      kind: 'swap', cmd, sprite: w.sprite, highlight: false, disabled: w.dead || block !== undefined,
      progress: w.dead ? 1 : swapProgress, icon: ACTION_ICON.tag, touch: arcade ? (i === 0 ? 'Tag' : i === 1 ? 'Tag2' : '') : '',
      note: block ?? (arcade && !w.dead ? leftNote('Tag', Math.max(0, bar.swapReadyTick - bar.tick)) : ''),
    });
  });
  if (arcade) {
    // Cmd 0: the transparent touch overlay holds the key, so a canvas click does nothing on these boxes.
    // Always present, dimmed when this hero has no Charge (ranged), so the other slots never shift between heroes or after a Tag.
    {
      const none = arcade.chargeIn < 0;
      add({
        kind: 'charge', cmd: 0, sprite: '', icon: ACTION_ICON.charge, touch: 'Charge', highlight: false, disabled: none,
        progress: none || arcade.chargeIn === 0 ? 1 : clamp01(1 - arcade.chargeIn / CHARGE_COOLDOWN),
        note: none ? 'Melee' : leftNote('Charge', arcade.chargeIn),
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
    // On the Arcade bar the trap wears its own name (Fire Bomb, Puddle, Spike, Gust: the hero's element) and that element's edge colour.
    const el = arcade ? bar.elemental?.kind : undefined;
    add({
      kind: 'trap', cmd: Cmd.trap, sprite: '', icon: ACTION_ICON.trap, touch: arcade ? 'Trap' : '', highlight: false, disabled: false,
      ...(el !== undefined ? { element: el } : {}),
      progress: cooldownProgress(bar.tick, t.readyTick, t.cooldownTicks), note: trapNote(bar.tick, t, trapShortOfElement(el)),
    }, TRAP_LABEL);
  }
  if (bar.elemental) {
    const e = bar.elemental;
    add({
      kind: 'elemental', cmd: Cmd.elemental, sprite: '', icon: elementIcon(e.kind), touch: arcade ? 'Element' : '', highlight: bar.tick < e.activeUntil,
      disabled: false, element: e.kind, progress: cooldownProgress(bar.tick, e.readyTick, e.cooldownTicks), note: elementalNote(bar.tick, { ...e, name: elementalShown(e.name) }),
    }, ELEMENTAL_LABEL);
  }
  if (arcade) {
    // The common Cleanse (every hero; cmd 0: the key and the touch overlay do the input, like the other Arcade boxes).
    add({
      kind: 'cleanse', cmd: 0, sprite: '', icon: ACTION_ICON.cleanse, touch: 'Cleanse', highlight: false, disabled: false,
      progress: arcade.cleanseIn <= 0 ? 1 : clamp01(1 - arcade.cleanseIn / CLEANSE_COOLDOWN), note: leftNote('Cleanse', arcade.cleanseIn),
    }, CLEANSE_LABEL);
    // Run Away (ranged hero) or Run Towards (melee): drains while the run lasts, then fills over its cooldown. Last, so no other box shifts.
    if (bar.run) {
      const r = bar.run;
      const running = bar.tick < r.activeUntil;
      const name = r.away ? RUN_AWAY_NAME : RUN_TOWARDS_NAME;
      const block = running ? undefined : arcade.runBlock;
      add({
        kind: 'run', cmd: 0, sprite: '', icon: ACTION_ICON.dash, touch: 'Run', highlight: running, disabled: block !== undefined, runAway: r.away,
        progress: running ? clamp01((r.activeUntil - bar.tick) / RUN_TICKS) : cooldownProgress(bar.tick, r.readyTick, r.cooldownTicks),
        note: running ? 'Running' : block !== undefined ? RUN_BLOCK_NOTE[block] : leftNote(name, r.readyTick - bar.tick),
      }, ACTION_COMMAND.run);
    }
  }
  return arcade ? centreRows(out) : out;
}

/** Arcade bar: each row of boxes is centred on the 1280 px screen (the bar is as wide as its boxes, not stuck left). */
export function centreRows(slots: ActionSlot[]): ActionSlot[] {
  const rows = new Map<number, ActionSlot[]>();
  for (const s of slots) rows.set(s.y, [...(rows.get(s.y) ?? []), s]);
  const shifted = new Map<ActionSlot, number>();
  for (const row of rows.values()) {
    const left = Math.min(...row.map((s) => s.x));
    const right = Math.max(...row.map((s) => s.x + s.size));
    const dx = Math.floor((LOGICAL_W - (right - left)) / 2) - left;
    for (const s of row) shifted.set(s, dx);
  }
  return slots.map((s) => ({ ...s, x: s.x + (shifted.get(s) ?? 0) }));
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
