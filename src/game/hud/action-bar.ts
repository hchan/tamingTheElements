import type Phaser from 'phaser';
import type { Command, RenderActionBar, RenderView } from '@core/index';
import { Cmd } from '@core/index';
import { LOGICAL_WIDTH as LOGICAL_W, crisp, phoneBoost } from '../boot/viewport';
import { ACTION_COMMAND } from '../input/key-map';
import { codeLabel, DEFAULT_BINDINGS, GAME_ACTIONS, type Bindings } from '../platform/input/bindings';
import { HUD_WIDTH } from './bars';
import { lookup } from '../views/projectile-view';

/**
 * Action bar (legacy `actionbar.js`): primary, secondary, capture (chapter 2+) and swap slots along the
 * bottom edge, with a clockwise cooldown sweep (legacy `HUDHelper.drawCooldown`). Everything except
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
export const CAPTURE_READY_COLOR = 0xffd700;

/** Icon padding inside a slot frame (Classic dressing). */
export const ICON_PAD = 8;
const ICON_FRAME = 'icon';

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
    const code = bindings[action][0];
    // Trap shares Capture's command bit 6 and the elemental ability the fourth swap's bit 10, so theirs live apart.
    const at = action === 'trap' ? TRAP_LABEL : action === 'elemental' ? ELEMENTAL_LABEL : ACTION_COMMAND[action];
    if (code !== undefined) out[at] = codeLabel(code);
  }
  return out;
}

/** Where the Trap key's label sits in a KeyLabels (its command bit is Capture's). */
export const TRAP_LABEL = 100;
/** Where the elemental ability key's label sits in a KeyLabels (its command bit is the fourth swap's). */
export const ELEMENTAL_LABEL = 101;

export const DEFAULT_KEY_LABELS: KeyLabels = labelsFromBindings(DEFAULT_BINDINGS);

const SWAP_CMDS = [Cmd.swap1, Cmd.swap2, Cmd.swap3, Cmd.swap4] as const;
const ABILITY_CMDS = [Cmd.primary, Cmd.secondary] as const;

export interface ActionSlot {
  readonly kind: 'ability' | 'capture' | 'swap' | 'trap' | 'elemental';
  /** Elemental slot only: the element kind (1 fire, 2 water, 3 earth, 4 air) whose symbol is drawn as its icon, else 0. */
  readonly element?: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  /** The Command bit this slot emits when clicked (same bit as its key). */
  readonly cmd: Command;
  readonly label: string;
  readonly sprite: string;
  /** Cooldown elapsed 0..1; 1 means ready (no sweep). */
  readonly progress: number;
  /** Capture only: highlighted when the enemy is capturable and the slot is ready. */
  readonly highlight: boolean;
  /** Greyed out: capture while not capturable, or a dead teammate. */
  readonly disabled: boolean;
  /** Second line under the key: the Trap slot's words ("Trap 7s" cooling, "Trap 1/2" ready, "Trap full"), else ''. */
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

/** Line colour per element kind (a second cue only: the symbol's shape and the slot's words say which). */
const ELEMENT_TINT: readonly number[] = [0xffffff, 0xff7a3d, 0x5cc8ff, 0xc9a26b, 0xe6f4ff];

/**
 * The alchemical element symbol centred on (cx, cy) with half-size r: a triangle pointing up (fire, air) or down (water,
 * earth), crossed by a bar for air and earth. Pure, for tests.
 */
export function elementSymbol(kind: number, cx: number, cy: number, r: number): {
  tri: [number, number, number, number, number, number]; bar: [number, number, number, number] | undefined;
} {
  const up = kind === 1 || kind === 4;
  const apex = up ? cy - r : cy + r;
  const base = up ? cy + r : cy - r;
  const barY = up ? cy - r / 3 : cy + r / 3; // through the apex half, as in the alchemical air and earth signs
  return {
    tri: [cx, apex, cx + r, base, cx - r, base],
    bar: kind === 3 || kind === 4 ? [cx - r, barY, cx + r, barY] : undefined,
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

export function buildSlots(bar: RenderActionBar, labels: KeyLabels = DEFAULT_KEY_LABELS): ActionSlot[] {
  const out: ActionSlot[] = [];
  const y = BAR_Y + SLOT_BORDER / 2;
  const add = (s: Omit<ActionSlot, 'x' | 'y' | 'size' | 'label' | 'note'> & { note?: string }): void => {
    const at = s.kind === 'trap' ? TRAP_LABEL : s.kind === 'elemental' ? ELEMENTAL_LABEL : s.cmd;
    out.push({ note: '', ...s, x: slotX(out.length), y, size: SLOT_SIDE, label: labels[at] ?? '' });
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
      progress: w.dead ? 1 : swapProgress,
    });
  });
  if (bar.trap) {
    const t = bar.trap;
    add({
      kind: 'trap', cmd: Cmd.trap, sprite: '', highlight: false, disabled: false,
      progress: cooldownProgress(bar.tick, t.readyTick, t.cooldownTicks), note: trapNote(bar.tick, t),
    });
  }
  if (bar.elemental) {
    const e = bar.elemental;
    add({
      kind: 'elemental', cmd: Cmd.elemental, sprite: '', highlight: bar.tick < e.activeUntil, disabled: false, element: e.kind,
      progress: cooldownProgress(bar.tick, e.readyTick, e.cooldownTicks), note: elementalNote(bar.tick, e),
    });
  }
  return out;
}

/** Ticks (10 s at 50 Hz) after the match starts during which the Capture slot is announced as a new ability. */
export const CAPTURE_NOTICE_TICKS = 500;

/** "Capture unlocked!" line above the Capture slot, labelled with its live key; null when there is no Capture slot or the notice has timed out. */
export function captureHint(slots: readonly ActionSlot[], tick: number): { x: number; y: number; text: string } | null {
  const c = slots.find((s) => s.kind === 'capture');
  if (c === undefined || tick >= CAPTURE_NOTICE_TICKS) return null;
  const key = c.label === '' ? 'its key' : c.label;
  return { x: c.x, y: c.y - 28, text: `Capture unlocked! Press ${key} when the enemy is at 25% health` };
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
  private slots: ActionSlot[] = [];
  private hint: Phaser.GameObjects.Text | undefined;

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
  ) {
    this.back = scene.add.graphics().setDepth(98);
    this.gfx = scene.add.graphics().setDepth(100);
    scene.input.on('pointerdown', this.onPointer);
  }

  /** Logical (screen) x/y to world, through the current screen box. */
  private box: ScreenBox = IDENTITY;
  private wx(x: number): number {
    return this.box.x + x * this.box.scale;
  }
  private wy(y: number): number {
    return this.box.y + y * this.box.scale;
  }

  update(): void {
    this.box = this.place?.() ?? IDENTITY;
    this.gfx.setPosition(this.box.x, this.box.y).setScale(this.box.scale);
    this.back.setPosition(this.box.x, this.box.y).setScale(this.box.scale);
    const bar = this.view.actionBar(this.team);
    this.slots = bar ? buildSlots(bar, this.labels()) : [];
    const g = this.gfx;
    g.clear();
    this.back.clear();
    if (this.slots.length > 0 && this.styled) {
      this.back.fillStyle(0x070a12, 0.82);
      this.back.fillRect(0, BAR_Y, HUD_WIDTH, ACTION_BAR_HEIGHT);
      this.back.fillStyle(0xffffff, 0.06);
      this.back.fillRect(0, BAR_Y, HUD_WIDTH, 3);
      g.lineStyle(2, 0x8fa4c8, 0.9);
      g.lineBetween(0, BAR_Y + 1, HUD_WIDTH, BAR_Y + 1);
    } else if (this.slots.length > 0) {
      g.lineStyle(TOP_BORDER, 0x111111, 1);
      g.lineBetween(0, BAR_Y + TOP_BORDER, HUD_WIDTH, BAR_Y + TOP_BORDER);
    }
    this.slots.forEach((s, i) => {
      if (this.styled) {
        this.back.fillStyle(s.sprite === '' ? 0x05070c : 0x2c3d63, 0.95);
        this.back.fillRoundedRect(s.x + 1, s.y + 1, s.size - 2, s.size - 2, 5);
      }
      this.drawIcon(i, s);
      if (s.kind === 'trap') this.back.fillStyle(0xffd23f, 1).fillTriangle(s.x + s.size / 2, s.y + 44, s.x + s.size / 2 + 13, s.y + s.size - 8, s.x + s.size / 2 - 13, s.y + s.size - 8);
      if (s.kind === 'elemental') this.drawElementSymbol(s);
      if (this.styled) {
        const ready = s.progress >= 1 && !s.disabled;
        g.lineStyle(s.highlight ? 4 : 2, s.highlight ? CAPTURE_READY_COLOR : ready ? 0xdfe8ff : 0x3b4660, 1);
        g.strokeRoundedRect(s.x + 1, s.y + 1, s.size - 2, s.size - 2, 5);
      } else {
        g.lineStyle(s.highlight ? 3 : 1, s.highlight ? CAPTURE_READY_COLOR : 0x000000, 1);
        g.strokeRect(s.x, s.y, s.size, s.size);
      }
      if (s.disabled || s.progress < 1) {
        g.fillStyle(COOLDOWN_COLOR, COOLDOWN_ALPHA);
        const pts = s.disabled ? [s.x, s.y, s.x + s.size, s.y, s.x + s.size, s.y + s.size, s.x, s.y + s.size]
          : cooldownSweep(s.progress, s.x, s.y, s.size);
        g.beginPath();
        g.moveTo(pts[0] ?? 0, pts[1] ?? 0);
        for (let k = 2; k + 1 < pts.length; k += 2) g.lineTo(pts[k] ?? 0, pts[k + 1] ?? 0);
        g.closePath();
        g.fillPath();
      }
      this.text(i, s);
    });
    this.drawHint(bar?.tick ?? 0);
    for (let i = this.slots.length; i < this.icons.length; i++) {
      this.icons[i]?.setVisible(false);
      this.texts[i]?.setVisible(false);
    }
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointer);
    this.gfx.destroy();
    this.back.destroy();
    this.hint?.destroy();
    this.icons.forEach((o) => { o.destroy(); });
    this.texts.forEach((o) => { o.destroy(); });
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
      crisp(this.scene, { fontFamily: 'Arial', fontSize: `${String(Math.round(18 * phoneBoost(this.scene, 1.4)))}px`, fontStyle: 'bold', color: '#ffd700', backgroundColor: '#000000', padding: { x: 6, y: 2 } }),
    ).setDepth(102);
    this.hint.setVisible(true).setPosition(this.wx(h.x), this.wy(h.y)).setScale(this.box.scale);
    if (this.hint.text !== h.text) this.hint.setText(h.text);
  }

  /** The slot's icon: the element's alchemical triangle (fire up, water down, air up and earth down with a bar), by shape not colour. */
  private drawElementSymbol(s: ActionSlot): void {
    const sym = elementSymbol(s.element ?? 0, s.x + s.size / 2, s.y + s.size - 22, 13);
    this.back.lineStyle(3, ELEMENT_TINT[s.element ?? 0] ?? 0xffffff, 1).strokeTriangle(...sym.tri);
    if (sym.bar) this.back.lineBetween(...sym.bar);
  }

  private drawIcon(i: number, s: ActionSlot): void {
    let icon = this.icons[i];
    if (!icon) {
      icon = this.scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(99);
      this.icons[i] = icon;
    }
    const found = lookup(s.sprite);
    if (!found || !this.scene.textures.exists(found.key)) {
      icon.setVisible(false);
      return;
    }
    const tex = this.scene.textures.get(found.key);
    const [fx = 0, fy = 0, fw = 80, fh = 80] = found.entry.coords;
    if (!tex.has(ICON_FRAME)) tex.add(ICON_FRAME, 0, fx, fy, fw, fh);
    if (icon.texture.key !== found.key || icon.frame.name !== ICON_FRAME) icon.setTexture(found.key, ICON_FRAME);
    const pad = this.styled ? ICON_PAD : 0;
    const fit = fitIcon(fw, fh, s.size - pad * 2);
    icon.setVisible(true).setPosition(this.wx(s.x + pad + fit.dx), this.wy(s.y + pad + fit.dy)).setDisplaySize(fit.w * this.box.scale, fit.h * this.box.scale);
  }

  private text(i: number, s: ActionSlot): void {
    let t = this.texts[i];
    if (!t) {
      const size = `${String(Math.round(16 * Math.min(1.8, phoneBoost(this.scene))))}px`;
      t = this.scene.add.text(
        0, 0, '',
        crisp(this.scene, this.styled
          ? { fontFamily: '"Trebuchet MS", Verdana, sans-serif', fontSize: size, fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 4 }
          : { fontFamily: 'Arial', fontSize: size, fontStyle: 'bold', color: '#000' }),
      );
      t.setDepth(101);
      this.texts[i] = t;
    }
    t.setVisible(true).setPosition(this.wx(s.x + (this.styled ? 5 : 2)), this.wy(s.y + (this.styled ? 2 : 0))).setScale(this.box.scale);
    const line = s.note === '' ? s.label : `${s.label}\n${s.note}`;
    if (t.text !== line) t.setText(line);
  }
}
