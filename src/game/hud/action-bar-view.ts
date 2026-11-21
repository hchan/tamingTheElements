import type Phaser from 'phaser';
import type { Command, RenderView } from '@core/index';
import { LOGICAL_WIDTH as LOGICAL_W, coreDisplayWidth, crisp, phoneBoost, resolutionOf, viewHeight, viewWidth } from '../boot/viewport';
import { HUD_WIDTH } from './bars';
import { PANEL_W, PANEL_X } from './hud-chrome';
import { readyGlow } from './arcade-hud';
import { lookup } from '../views/projectile-view';
import { mute } from '../fx/grim-fx';
import { getPrefs } from '../platform/a11y/prefs';
import { syncTouchOverlays } from './touch-overlay';
import { isPortraitPlay, setPanelTop } from '../boot/portrait-play';
import { cleanseClockOf } from './cleanse-clock';
import { tagSlot } from './tag-slot';
import { wearAiIcon } from './ability-icon-art';
import { ACTION_SHEET, BAR_Y, CAPTURE_READY_COLOR, COOLDOWN_COLOR, DEFAULT_KEY_LABELS, ELEMENT_TINT, ICON_FRAME, ICON_PAD, KIND_TINT, LOGICAL_HEIGHT, MAX_SLOTS, MIRROR_SIDE, READY_FLASH_COLOR, SHEET_CELL, SHEET_COLS, SLOT_SIDE, TIP_LONG_PRESS_MS, TIP_SUPER_QUIET_MS, TOP_BORDER, arcadeBarOf, barTop, buildSlots, captureHint, commandAt, cooldownLook, fitIcon, fitTextScale, gradedTexture, mirrorSlots, portraitBarSlots, readyEdge, showStrikeCues, slotParts, slotTip, slotWord, strikeCues, tipExpired, tipPlacement, withoutStrikeTiles, type ActionSlot, type CooldownLook, type GroupHeader, type GroupedBar, type KeyLabels } from './action-bar';
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
  /** Dressed bar only: the label under each icon (the key stays in `texts`). */
  private readonly notes: Phaser.GameObjects.Text[] = [];
  private readonly noteColor = new Map<Phaser.GameObjects.Text, string>();
  private readonly icons: Phaser.GameObjects.Image[] = [];
  private readonly headerTexts: Phaser.GameObjects.Text[] = [];
  private slots: ActionSlot[] = [];
  private hint: Phaser.GameObjects.Text | undefined;
  /** Last progress and ready-flash start (ms) per box, so any kind that comes back ready flashes the same way. */
  private readonly lastProgress = new Map<string, number>();
  private readonly flashStart = new Map<string, number>();
  private reduced = false;
  private frame = 0;
  /** Tooltip: the Text and what the player points at now (mouse, focus or long press). */
  private tipText: Phaser.GameObjects.Text | undefined;
  private manual: { touch: string } | { idx: number } | null = null;
  /** Tips stay hidden until this time (a super cut-in just started). */
  private superQuietUntil = 0;
  /** When the current tip target first showed, and its identity, so a tip that is never moved away from still expires. */
  private tipSince = 0;
  private tipId = '';
  private pressTimer: ReturnType<typeof setTimeout> | undefined;

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
    if (!mirror) {
      scene.input.on('pointerdown', this.onPointer);
      scene.input.on('pointermove', this.onMove);
      if (typeof document !== 'undefined') {
        for (const ev of ['pointermove', 'pointerout', 'pointerdown', 'pointerup', 'pointercancel', 'focusin', 'focusout']) document.addEventListener(ev, this.onDom, true);
      }
    }
  }

  /** Mouse over a box without a DOM overlay (the hero's attacks, Snag): the canvas pointer says which box. */
  private readonly onMove = (p: Phaser.Input.Pointer): void => {
    if (p.wasTouch || (this.manual !== null && 'touch' in this.manual)) return;
    const { x, y } = this.boxPoint(p);
    const idx = this.slots.findIndex((s) => x >= s.x && x < s.x + s.size && y >= s.y && y < s.y + s.size);
    this.manual = idx >= 0 ? { idx } : null;
  };

  /** Touch overlays (`#arcade<Name>`) cover their box: hover, keyboard focus and a long press on them show the tip. */
  private readonly onDom = (e: Event): void => {
    const el = e.target instanceof Element ? e.target.closest('[id^="arcade"]') : null;
    const touch = el && el.id.length > 6 ? el.id.slice(6) : '';
    const clearPress = (): void => {
      if (this.pressTimer !== undefined) clearTimeout(this.pressTimer);
      this.pressTimer = undefined;
    };
    const holdTip = (): void => {
      if (this.manual !== null && 'touch' in this.manual && this.manual.touch === touch) return;
      this.manual = { touch };
    };
    switch (e.type) {
      // A mouse that merely rests over a box (it clicked Fight! there, or the box appeared under it) is not a request for the tip: only real movement is.
      case 'pointermove':
        if (touch !== '' && (e as PointerEvent).pointerType === 'mouse') holdTip();
        break;
      case 'pointerout':
        if (touch !== '' && (e as PointerEvent).pointerType === 'mouse') this.manual = null;
        break;
      case 'focusin':
        if (touch !== '' && el?.matches(':focus-visible')) holdTip();
        break;
      case 'focusout':
        if (touch !== '') this.manual = null;
        break;
      case 'pointerdown':
        if (touch !== '' && (e as PointerEvent).pointerType !== 'mouse') {
          clearPress();
          this.pressTimer = setTimeout(holdTip, TIP_LONG_PRESS_MS);
        }
        break;
      default:
        clearPress();
        if ((e as PointerEvent).pointerType === 'touch' && this.manual !== null && 'touch' in this.manual) this.manual = null;
    }
  };

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

  /** Top edge of the bar's panel in the bar's own 1280x720 box (last update); the camera frames the floor above it. */
  panelTop = BAR_Y;

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
    const k = coreDisplayWidth(this.scene) / LOGICAL_W;
    const clock = cleanseClockOf(this.view);
    if (bar && ar) clock.sync(ar.round, bar.tick);
    const extras = bar && ar ? arcadeBarOf(ar, this.team === 1 ? 1 : 0, this.hasChargeButton(), (id) => clock.leftIn(id, bar.tick)) : undefined;
    const built = bar ? buildSlots(bar, this.labels(), extras, k) : [];
    const grouped = !this.mirror && extras && this.arrange ? this.arrange(built, k) : undefined;
    // Portrait phones: one row of narrow boxes (touch buttons grow 44 px below the canvas), so the bar never covers the arena.
    const one = !this.mirror && extras && !grouped && isPortraitPlay(this.scene.game) ? portraitBarSlots(withoutStrikeTiles(built), k) : undefined;
    this.slots = this.mirror ? mirrorSlots(built, barTop(MAX_SLOTS, extras ? k : undefined) - MIRROR_SIDE - 6) : grouped ? grouped.slots : one ? one.slots : built;
    const top = grouped ? grouped.top : one ? one.top : barTop(built.length, extras ? k : undefined);
    this.panelTop = top;
    // QA r105 P3: landscape phones name the ability on the Strike circles too (CSS shows the third line only on coarse pointers).
    if (!this.mirror && extras && bar && this.frame % 10 === 1) showStrikeCues(strikeCues(bar.abilities));
    if (!this.mirror) setPanelTop(this.scene, top);
    const g = this.gfx;
    g.clear();
    this.back.clear();
    if (this.mirror) {
      // No panel: each slot keeps its own plate.
    } else if (this.slots.length > 0 && this.styled) {
      if (one) {
        // Portrait: the panel fades in from the floor edge (QA r96/r97 "dark band under the floor") instead of starting as a hard black strip.
        const FADE_BANDS = 8;
        const BAND_H = 6;
        const BASE = 0.62;
        for (let i = 0; i < FADE_BANDS; i++) {
          this.back.fillStyle(0x0b0a09, (BASE * (i + 1)) / (FADE_BANDS + 1));
          this.back.fillRect(PANEL_X, top + i * BAND_H, PANEL_W, BAND_H);
        }
        this.back.fillStyle(0x0b0a09, BASE);
        this.back.fillRect(PANEL_X, top + FADE_BANDS * BAND_H, PANEL_W, LOGICAL_HEIGHT - top - FADE_BANDS * BAND_H);
      } else {
        this.back.fillStyle(0x0b0a09, 0.86);
        this.back.fillRect(PANEL_X, top, PANEL_W, LOGICAL_HEIGHT - top);
      }
      this.back.fillStyle(0xd8cdb8, 0.05);
      this.back.fillRect(PANEL_X, top, PANEL_W, 3);
      g.lineStyle(1, 0x6b6558, 0.8);
      g.lineBetween(PANEL_X, top + 1, PANEL_X + PANEL_W, top + 1);
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
      if (this.dressed()) {
        // Label strip: a darker band under the icon so the words never sit on art.
        const p = slotParts(s.x, s.y, s.size, s.label.length);
        this.back.fillStyle(0x090807, 0.92);
        this.back.fillRect(p.strip.x, p.strip.y, p.strip.w, p.strip.h);
      }
      if (s.sprite !== '' && !this.mirror) {
        // A hero's own attack art is dark: a lit stone plate with a soft pale core keeps it from vanishing (same lift as the sheet's tiles).
        this.back.fillStyle(0x3a352c, 1);
        this.back.fillRect(s.x + 1, s.y + 1, s.size - 2, s.size - 2);
        this.back.fillStyle(0x6b6254, 0.55);
        this.back.fillRect(s.x + s.size * 0.15, s.y + s.size * 0.25, s.size * 0.7, s.size * 0.6);
      }
      this.drawIcon(i, s);
      const key = `${s.kind}:${String(s.cmd)}:${String(i)}`;
      const prev = this.lastProgress.get(key);
      if (prev !== undefined && prev < 1 && s.progress >= 1 && !s.disabled) this.flashStart.set(key, now);
      if (!this.mirror && prev !== undefined && prev >= 1 && s.progress < 1 && !s.disabled && s.kind === 'super') this.superQuietUntil = now + TIP_SUPER_QUIET_MS;
      this.lastProgress.set(key, s.progress);
      const started = this.flashStart.get(key);
      const look = cooldownLook(s.progress, s.disabled, s.x, s.y, s.size, started === undefined ? -1 : now - started, this.reduced);
      if (this.styled) {
        const ready = s.progress >= 1 && !s.disabled;
        const edge = this.dressed() ? mute(s.element ? (ELEMENT_TINT[s.element] ?? 0xffffff) : KIND_TINT[s.kind], 0.5, 0.75) : readyEdge(s.element);
        g.lineStyle(s.highlight ? 3 : this.dressed() ? 2 : 1, s.highlight ? CAPTURE_READY_COLOR : ready ? edge : 0x2e2c29, 1);
        g.strokeRoundedRect(s.x + 1, s.y + 1, s.size - 2, s.size - 2, 2);
      } else {
        g.lineStyle(s.highlight ? 3 : 1, s.highlight ? CAPTURE_READY_COLOR : 0x000000, 1);
        g.strokeRect(s.x, s.y, s.size, s.size);
      }
      this.drawCooldown(look, s);
      // r31: a full Super breathes a gold glow round its box (steady with reduced motion), so ready reads next to Dash and Guard.
      if (s.kind === 'super' && s.progress >= 1 && !s.disabled) {
        const br = readyGlow(now, this.reduced);
        // qa-r32: a steady, solid gold rim (always on, so it reads in any still) under the breathing halo, plus a stronger wash.
        for (const [grow, a] of [[8, 0.14], [5, 0.26], [3, 0.4]] as const) {
          g.lineStyle(2, 0xffe28a, a * br).strokeRect(s.x - grow, s.y - grow, s.size + grow * 2, s.size + grow * 2);
        }
        g.lineStyle(3, 0xffd966, 0.95).strokeRect(s.x - 1, s.y - 1, s.size + 2, s.size + 2);
        g.fillStyle(0xffe28a, 0.2 * br).fillRect(s.x, s.y, s.size, s.size);
      }
      if (this.dressed() && s.label !== '') {
        const b = slotParts(s.x, s.y, s.size, s.label.length).badge;
        g.fillStyle(0x0a0806, 0.9);
        g.fillRoundedRect(b.x, b.y, b.w, b.h, 3);
        g.lineStyle(1, 0x6b6558, 0.9);
        g.strokeRoundedRect(b.x, b.y, b.w, b.h, 3);
      } else if (!this.mirror && s.label !== '') {
        // A dark badge under the key so the number reads on any icon.
        g.fillStyle(0x0a0806, 0.82);
        g.fillRect(s.x + 2, s.y + 2, Math.max(18, s.label.length * 11 + 8), 20);
      }
      this.text(i, s);
    });
    if (!this.mirror && this.team === 0) {
      const tag = this.slots.find((s) => s.kind === 'swap');
      if (tag) {
        tagSlot.x = tag.x + tag.size / 2;
        tagSlot.y = tag.y;
      }
    }
    this.drawHeaders(g, grouped?.headers ?? []);
    if (!this.mirror) {
      this.drawHint(bar?.tick ?? 0);
      this.drawTip(now);
      if (extras && this.frame % 5 === 1) syncTouchOverlays(this.screenSlots().map((r, i) => ({ ...r, touch: this.slots[i]?.touch ?? '' })), this.scene.game.canvas, undefined, one?.ext);
    }
    for (let i = this.slots.length; i < this.icons.length; i++) {
      this.icons[i]?.setVisible(false);
      this.texts[i]?.setVisible(false);
      this.notes[i]?.setVisible(false);
    }
  }

  /** The dressed layout (Arcade main bar): key badge, centred icon, label strip. Mirrors and the plain legacy bar keep their own look. */
  private dressed(): boolean {
    return this.styled && !this.mirror;
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
      // The sweep's leading edge: a bone line from the centre to where the shade ends, so progress reads at a glance.
      if (pts.length >= 6 && !this.reduced) {
        g.lineStyle(2, READY_FLASH_COLOR, 0.8);
        g.lineBetween(pts[2] ?? 0, pts[3] ?? 0, pts[4] ?? 0, pts[5] ?? 0);
      }
    }
    if (look.flashAlpha > 0) {
      g.fillStyle(READY_FLASH_COLOR, look.flashAlpha);
      g.fillRect(s.x, s.y, s.size, s.size);
      g.lineStyle(1 + Math.round(2 * look.pulse), READY_FLASH_COLOR, look.pulse);
      g.strokeRect(s.x, s.y, s.size, s.size);
    }
  }

  destroy(): void {
    if (!this.mirror) {
      this.scene.input.off('pointerdown', this.onPointer);
      this.scene.input.off('pointermove', this.onMove);
      if (typeof document !== 'undefined') {
        for (const ev of ['pointermove', 'pointerout', 'pointerdown', 'pointerup', 'pointercancel', 'focusin', 'focusout']) document.removeEventListener(ev, this.onDom, true);
      }
      if (this.pressTimer !== undefined) clearTimeout(this.pressTimer);
      this.tipText?.destroy();
    }
    this.gfx.destroy();
    this.back.destroy();
    this.hint?.destroy();
    this.icons.forEach((o) => { o.destroy(); });
    this.texts.forEach((o) => { o.destroy(); });
    this.notes.forEach((o) => { o.destroy(); });
    this.headerTexts.forEach((o) => { o.destroy(); });
  }

  /** Slot rects as the player sees them, in logical screen px (world transform of the bar's graphics through the live camera), for tests. */
  screenSlots(): { x: number; y: number; size: number }[] {
    const cam = this.scene.cameras.main;
    const res = resolutionOf(this.scene);
    const k = this.gfx.scaleX * cam.zoom / res;
    // Relative to the central 1280 box: the wide view adds (viewWidth - 1280) / 2 logical px left of it.
    const sx = (this.gfx.x - (cam.scrollX + cam.width / 2 - cam.width / 2 / cam.zoom)) * cam.zoom / res - (viewWidth(this.scene) - LOGICAL_W) / 2;
    // Relative to the bottom-anchored 720 box: the tall view (portrait play) adds (viewHeight - 720) logical px above it.
    const sy = (this.gfx.y - (cam.scrollY + cam.height / 2 - cam.height / 2 / cam.zoom)) * cam.zoom / res - (viewHeight(this.scene) - LOGICAL_HEIGHT);
    return this.slots.map((s) => ({ x: sx + s.x * k, y: sy + s.y * k, size: s.size * k }));
  }

  /** Current slots (logical coordinates), for tests and the click probe. */
  get currentSlots(): readonly ActionSlot[] {
    return this.slots;
  }

  /** The pointer in the bar's logical px: world px on the fixed camera; on the panned one, its screen position in the central 1280 box. */
  private boxPoint(p: Phaser.Input.Pointer): { x: number; y: number } {
    if (!this.place) return { x: p.worldX, y: p.worldY };
    const res = resolutionOf(this.scene);
    // The bar's box sits at the bottom of the view: the tall view (portrait play) adds (viewHeight - 720) logical px above it.
    return { x: p.x / res - (viewWidth(this.scene) - LOGICAL_W) / 2, y: p.y / res - (viewHeight(this.scene) - LOGICAL_HEIGHT) };
  }

  private readonly onPointer = (p: Phaser.Input.Pointer): void => {
    // Fixed camera: world == logical. Panned camera: the bar is screen-fixed, so use the pointer's screen position in logical px.
    const at = this.boxPoint(p);
    const cmd = commandAt(this.slots, at.x, at.y);
    if (cmd !== 0) this.emit(cmd);
  };

  /** Tooltips show only for what the player points at or focuses (mouse, keyboard focus, long press), never on their own. */
  private tipTarget(now: number): ActionSlot | undefined {
    if (now < this.superQuietUntil) return undefined;
    const m = this.manual;
    if (m === null) {
      this.tipId = '';
      return undefined;
    }
    const id = 'touch' in m ? `t:${m.touch}` : `i:${String(m.idx)}`;
    if (id !== this.tipId) {
      this.tipId = id;
      this.tipSince = now;
    }
    if (tipExpired(this.tipSince, now)) return undefined;
    return 'touch' in m ? this.slots.find((s) => s.touch === m.touch) : this.slots[m.idx];
  }

  /** The tooltip: title and one line of effect in a dark panel above the box, shrunk to fit the screen on a phone. */
  private drawTip(now: number): void {
    const s = this.tipTarget(now);
    if (!s) {
      this.tipText?.setVisible(false);
      return;
    }
    const tip = slotTip(s);
    this.tipText ??= this.scene.add.text(
      0, 0, '',
      crisp(this.scene, {
        fontFamily: 'Georgia, "Times New Roman", serif', fontSize: `${String(Math.round(16 * Math.min(1.8, phoneBoost(this.scene))))}px`, color: '#e8dfc8',
        backgroundColor: '#0b0a09f0', padding: { x: 10, y: 6 }, wordWrap: { width: 420 }, lineSpacing: 3,
      }),
    ).setDepth(103);
    const line = `${tip.title}\n${tip.text}`;
    if (this.tipText.text !== line) this.tipText.setText(line);
    const sc = this.box.scale;
    const w = this.tipText.width;
    const at = tipPlacement(s, w, this.tipText.height);
    this.tipText.setVisible(true).setPosition(this.wx(at.x), this.wy(at.y)).setScale(sc);
  }

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
    const icon = (this.icons[i] ??= this.scene.add.image(0, 0, '__DEFAULT').setOrigin(0, 0).setDepth(99));
    if (s.kind === 'ability' && wearAiIcon(icon, s.sprite, this.scene.textures, this.dressed() ? slotParts(s.x, s.y, s.size, s.label.length).icon : undefined, s, this.box.scale, (x) => this.wx(x), (y) => this.wy(y))) return;
    const found = lookup(s.sprite);
    if (found && this.scene.textures.exists(found.key)) {
      const key = this.styled ? gradedTexture(this.scene, found.key) : found.key;
      const tex = this.scene.textures.get(key);
      const [fx = 0, fy = 0, fw = 80, fh = 80] = found.entry.coords;
      if (!tex.has(ICON_FRAME)) tex.add(ICON_FRAME, 0, fx, fy, fw, fh);
      if (icon.texture.key !== key || icon.frame.name !== ICON_FRAME) icon.setTexture(key, ICON_FRAME);
      if (this.dressed()) {
        const a = slotParts(s.x, s.y, s.size, s.label.length).icon;
        const fit = fitIcon(fw, fh, Math.min(a.w, a.h));
        icon.setVisible(true).setPosition(this.wx(a.x + fit.dx), this.wy(a.y + (a.h - Math.min(a.w, a.h)) / 2 + fit.dy)).setDisplaySize(fit.w * this.box.scale, fit.h * this.box.scale);
        return;
      }
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
    if (this.dressed()) {
      const a = slotParts(s.x, s.y, s.size, s.label.length).icon;
      const side = Math.min(a.w, a.h);
      icon.setVisible(true).setPosition(this.wx(a.x + (a.w - side) / 2), this.wy(a.y)).setDisplaySize(side * this.box.scale, side * this.box.scale);
      return;
    }
    icon.setVisible(true).setPosition(this.wx(s.x + 1), this.wy(s.y + 1)).setDisplaySize((s.size - 2) * this.box.scale, (s.size - 2) * this.box.scale);
  }

  /** Dressed bar: the key centred in its corner badge and the label centred in the strip, each shrunk (never past 1) to fit its own box. */
  private dressedText(i: number, s: ActionSlot): void {
    const style = (px: number, color: string): Phaser.Types.GameObjects.Text.TextStyle => crisp(this.scene, {
      fontFamily: 'Georgia, "Times New Roman", serif', fontSize: `${String(Math.round(px * Math.min(1.8, phoneBoost(this.scene))))}px`, fontStyle: 'bold', color, stroke: '#0a0806', strokeThickness: 2,
    });
    let key = this.texts[i];
    if (!key) {
      key = this.scene.add.text(0, 0, '', style(13, '#f0e8d4')).setOrigin(0.5, 0.5).setDepth(101);
      this.texts[i] = key;
    }
    let note = this.notes[i];
    if (!note) {
      note = this.scene.add.text(0, 0, '', style(12, '#e0d8c6')).setOrigin(0.5, 0.5).setDepth(101);
      this.notes[i] = note;
    }
    const p = slotParts(s.x, s.y, s.size, s.label.length);
    const fit = (t: Phaser.GameObjects.Text, w: number, h: number): number => Math.min(1, (w - 2) / Math.max(1, t.width), (h - 1) / Math.max(1, t.height));
    if (key.text !== s.label) key.setText(s.label);
    key.setVisible(s.label !== '').setPosition(this.wx(p.badge.x + p.badge.w / 2), this.wy(p.badge.y + p.badge.h / 2)).setScale(this.box.scale * fit(key, p.badge.w, p.badge.h));
    const word = slotWord(s);
    if (note.text !== word) note.setText(word);
    const lit = s.progress >= 1 && !s.disabled;
    const color = lit ? '#e8dfc8' : '#8d867a';
    if (this.noteColor.get(note) !== color) {
      note.setColor(color);
      this.noteColor.set(note, color);
    }
    note.setVisible(true).setPosition(this.wx(p.strip.x + p.strip.w / 2), this.wy(p.strip.y + p.strip.h / 2)).setScale(this.box.scale * fit(note, p.strip.w, p.strip.h));
  }

  private text(i: number, s: ActionSlot): void {
    if (this.dressed()) {
      this.dressedText(i, s);
      return;
    }
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
