import type Phaser from 'phaser';
import type { Command, RenderActionBar, RenderView } from '@core/index';
import { Cmd } from '@core/index';
import { crisp, phoneBoost } from '../boot/viewport';
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
    if (code !== undefined) out[ACTION_COMMAND[action]] = codeLabel(code);
  }
  return out;
}

export const DEFAULT_KEY_LABELS: KeyLabels = labelsFromBindings(DEFAULT_BINDINGS);

const SWAP_CMDS = [Cmd.swap1, Cmd.swap2, Cmd.swap3, Cmd.swap4] as const;
const ABILITY_CMDS = [Cmd.primary, Cmd.secondary] as const;

export interface ActionSlot {
  readonly kind: 'ability' | 'capture' | 'swap';
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
  const add = (s: Omit<ActionSlot, 'x' | 'y' | 'size' | 'label'>): void => {
    out.push({ ...s, x: slotX(out.length), y, size: SLOT_SIDE, label: labels[s.cmd] ?? '' });
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
    if (cmd === undefined) return;
    add({
      kind: 'swap', cmd, sprite: w.sprite, highlight: false, disabled: w.dead,
      progress: w.dead ? 1 : swapProgress,
    });
  });
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
  ) {
    this.back = scene.add.graphics().setDepth(98);
    this.gfx = scene.add.graphics().setDepth(100);
    scene.input.on('pointerdown', this.onPointer);
  }

  update(): void {
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

  /** Current slots (logical coordinates), for tests and the click probe. */
  get currentSlots(): readonly ActionSlot[] {
    return this.slots;
  }

  private readonly onPointer = (p: Phaser.Input.Pointer): void => {
    const cmd = commandAt(this.slots, p.worldX, p.worldY);
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
    this.hint.setVisible(true).setPosition(h.x, h.y);
    if (this.hint.text !== h.text) this.hint.setText(h.text);
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
    icon.setVisible(true).setPosition(s.x + pad + fit.dx, s.y + pad + fit.dy).setDisplaySize(fit.w, fit.h);
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
    t.setVisible(true).setPosition(s.x + (this.styled ? 5 : 2), s.y + (this.styled ? 2 : 0));
    if (t.text !== s.label) t.setText(s.label);
  }
}
