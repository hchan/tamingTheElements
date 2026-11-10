import type Phaser from 'phaser';
import type { Command, RenderActionBar, RenderView } from '@core/index';
import { Cmd } from '@core/index';
import { crisp } from '../boot/viewport';
import { ACTION_COMMAND } from '../input/key-map';
import { codeLabel, DEFAULT_BINDINGS, GAME_ACTIONS, type Bindings } from '../platform/input/bindings';
import { HUD_WIDTH } from './bars';

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
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private readonly icons: Phaser.GameObjects.Image[] = [];
  private slots: ActionSlot[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly view: RenderView,
    private readonly emit: (cmd: Command) => void,
    private readonly team = 0,
    private readonly labels: () => KeyLabels = () => DEFAULT_KEY_LABELS,
  ) {
    this.gfx = scene.add.graphics().setDepth(100);
    scene.input.on('pointerdown', this.onPointer);
  }

  update(): void {
    const bar = this.view.actionBar(this.team);
    this.slots = bar ? buildSlots(bar, this.labels()) : [];
    const g = this.gfx;
    g.clear();
    if (this.slots.length > 0) {
      g.lineStyle(TOP_BORDER, 0x111111, 1);
      g.lineBetween(0, BAR_Y + TOP_BORDER, HUD_WIDTH, BAR_Y + TOP_BORDER);
    }
    this.slots.forEach((s, i) => {
      this.drawIcon(i, s);
      g.lineStyle(s.highlight ? 3 : 1, s.highlight ? CAPTURE_READY_COLOR : 0x000000, 1);
      g.strokeRect(s.x, s.y, s.size, s.size);
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
    for (let i = this.slots.length; i < this.icons.length; i++) {
      this.icons[i]?.setVisible(false);
      this.texts[i]?.setVisible(false);
    }
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointer);
    this.gfx.destroy();
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

  private drawIcon(i: number, s: ActionSlot): void {
    const key = `sprite:${s.sprite}`;
    let icon = this.icons[i];
    if (!icon) {
      icon = this.scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(99);
      this.icons[i] = icon;
    }
    const has = this.scene.textures.exists(key);
    icon.setVisible(has);
    if (has) {
      if (icon.texture.key !== key) icon.setTexture(key);
      icon.setPosition(s.x, s.y).setDisplaySize(s.size, s.size);
    }
  }

  private text(i: number, s: ActionSlot): void {
    let t = this.texts[i];
    if (!t) {
      t = this.scene.add.text(0, 0, '', crisp(this.scene, { fontFamily: 'Arial', fontSize: '16px', fontStyle: 'bold', color: '#000' }));
      t.setDepth(101);
      this.texts[i] = t;
    }
    t.setVisible(true).setPosition(s.x + 2, s.y);
    if (t.text !== s.label) t.setText(s.label);
  }
}
