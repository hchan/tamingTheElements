import type Phaser from 'phaser';
import { coreDisplayWidth, viewHeight } from '../boot/viewport';
import type { ComboProbe } from '../platform/test-hook';
import { CHIP_RECTS_KEY, COMBO_RECTS_KEY, comboAlpha, comboLabel, comboScale, projectToHud, type ArcadeHudModel, type HudRect } from './arcade-hud';
import { HUD_WIDTH } from './bars';
import { styleCombatText } from './combat-text';
import { COMBO_GAP, COMBO_STUCK_ALPHA, comboMode, newPlaceOut, newPlaceState, numberLane, placeCombo, resetPlaceState, type NumberLane, type PlaceInput } from './combo-anchor';
import type { PlaceOut, PlaceState } from './combo-anchor';
import { hudText, type HudFlags } from './hud-ctx';
import { hudOnPage, hudToDom, comboKey, comboRightX } from './hud-math';
import type { HudNumbers } from './hud-numbers';
import { chipBar, chipRect, chipSize, isPhoneHud, tagPill } from './slim-hud';

/** Combo counter anchor under each side's bars (logical px). */
const COMBO_Y = 110;
const COMBO_MARGIN = 24;
const TEAMS = [0, 1] as const;

interface ComboTrace { headX: number; headY: number; ax: number; ay: number; s: number; baseX: number; baseY: number; fresh: boolean }
const newTrace = (): ComboTrace => ({ headX: 0, headY: 0, ax: 0, ay: 0, s: 1, baseX: 0, baseY: 0, fresh: false });

/** What the combo counters read from the scene (all shared by reference; the module never imports the scene). */
export interface HudComboDeps {
  readonly numbers: HudNumbers;
  /** The HUD camera's frame this frame (filled by the scene before the counters are placed). */
  readonly viewFrame: { x: number; y: number; w: number; h: number };
  /** Bench size per team (set by the scene's update loop). */
  readonly benchCount: readonly number[];
  /** Calls `fn` with each name/life label and SUPER label (the ceiling's text furniture). */
  readonly eachCeilText: (fn: (t: Phaser.GameObjects.Text | undefined) => void) => void;
  /** The Arena camera's world view, when it is wired. */
  readonly arenaView: () => HudRect | undefined;
}

/** Arcade combo counters: placement (anchored over the victim, or the fixed slot under the bars), the ceiling, the probe and the published rects. */
export class HudCombo {
  texts: (Phaser.GameObjects.Text | undefined)[] = [];
  private keys: number[] = [];
  /** A coarse (touch) pointer: the combo counters keep their fixed top slot there (set in the scene's `create`). */
  coarse = false;
  /** Per team: the counter's placement memory, last result and scratch rects (anchored mode; all reused every frame). */
  private readonly placeStates: [PlaceState, PlaceState] = [newPlaceState(), newPlaceState()];
  private readonly placeOuts: [PlaceOut, PlaceOut] = [newPlaceOut(), newPlaceOut()];
  private readonly lanes: [NumberLane, NumberLane] = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }];
  private readonly spots: [NumberLane, NumberLane] = [{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }];
  private readonly avoid: [HudRect[], HudRect[]] = [[], []];
  private readonly modes: ['anchored' | 'band', 'anchored' | 'band'] = ['band', 'band'];
  private readonly serials: [number, number] = [-1, -1];
  private readonly wasAnchored: [boolean, boolean] = [false, false];
  private readonly trace: [ComboTrace, ComboTrace] = [newTrace(), newTrace()];
  private readonly ceilRects: { x: number; y: number; w: number; h: number }[] = [];
  private ceilCount = 0;
  private readonly placeIn: PlaceInput;
  private readonly projected = { x: 0, y: 0 };

  constructor(private readonly scene: Phaser.Scene, private readonly flags: HudFlags, private readonly deps: HudComboDeps) {
    this.placeIn = { headX: 0, b0: 0, w: 0, h: 0, frame: deps.viewFrame, ceilRects: this.ceilRects, ceilCount: 0, obstacles: [], count: 0, fresh: false, reduced: false, dtMs: 0 };
  }

  /** Place both sides' counters for this frame. */
  placeAll(model: ArcadeHudModel, from: HudRect | undefined, frame: HudRect, hudAvoid: HudRect[][] | undefined, dim: number, reduced: boolean): void {
    for (const team of TEAMS) this.placeComboText(model, team, from, frame, hudAvoid, dim, reduced);
  }

  /**
   * One side's combo counter. Desktop with an anchor: over the victim's head, solved by `placeCombo` (clear of pops, call-outs, the number
   * lane, the other counter, the terrain badge and under the HUD furniture). Otherwise (touch, phone HUD, no anchor yet) the fixed slot under the bars.
   */
  private placeComboText(model: ArcadeHudModel, team: 0 | 1, from: HudRect | undefined, frame: HudRect, hudAvoid: HudRect[][] | undefined, dim: number, reduced: boolean): void {
    const { numbers } = this.deps;
    const c = model.combos[team];
    let t = this.texts[team];
    if (c.hits === 0) {
      t?.setVisible(false);
      resetPlaceState(this.placeStates[team]);
      this.wasAnchored[team] = false;
      this.modes[team] = 'band';
      return;
    }
    t ??= this.texts[team] = styleCombatText(hudText(this.scene, 28), 'combo')
      .setOrigin(team === 0 ? 0 : 1, 0)
      .setAlign(team === 0 ? 'left' : 'right')
      .setPosition(team === 0 ? COMBO_MARGIN : HUD_WIDTH - COMBO_MARGIN, COMBO_Y);
    const key = comboKey(c.hits, c.damage);
    if (this.keys[team] !== key) {
      this.keys[team] = key;
      t.setText(comboLabel(c.hits, c.damage));
    }
    const mode = comboMode(isPhoneHud(), this.coarse, c.anchored && !!from);
    if (mode !== this.modes[team]) {
      this.modes[team] = mode;
      if (mode === 'anchored') t.setOrigin(0.5, 1).setAlign('center').setDepth(101);
      else t.setOrigin(team === 0 ? 0 : 1, 0).setAlign(team === 0 ? 'left' : 'right').setDepth(102);
    }
    if (mode === 'band' || !from) {
      this.wasAnchored[team] = false;
      t.setPosition(team === 0 ? COMBO_MARGIN : comboRightX(HUD_WIDTH, COMBO_MARGIN, this.pauseLeft()), COMBO_Y);
      t.setScale(comboScale(c, reduced)).setAlpha(comboAlpha(c)).setVisible(true);
      return;
    }
    const s = frame.w / from.w;
    const head = projectToHud(c.ax, c.ay, from, frame, this.projected);
    const headX = head.x;
    const headY = head.y;
    const lane = numberLane(frame.x + ((c.laneX - from.x) / from.w) * frame.w, headY, s, numbers.numberH, this.lanes[team]);
    const b0 = lane.y - COMBO_GAP;
    const obs = this.avoid[team];
    obs.length = 0;
    for (let i = 0; i < numbers.popCount; i++) obs.push(numbers.obstacles[i] as HudRect);
    obs.push(lane);
    if (team === 1 && this.modes[0] === 'anchored' && model.combos[0].hits > 0) {
      const o = this.placeOuts[0];
      const w0 = this.texts[0]?.width ?? 0;
      const h0 = this.texts[0]?.height ?? 0;
      const sp = this.spots[0];
      sp.x = o.targetX - w0 / 2;
      sp.y = o.targetY - h0;
      sp.w = w0;
      sp.h = h0;
      obs.push(sp);
    }
    if (hudAvoid) for (const list of hudAvoid) for (const r of list) obs.push(r);
    const fresh = this.serials[team] !== c.serial || !this.wasAnchored[team];
    const inp = this.placeIn;
    inp.headX = headX;
    inp.b0 = b0;
    inp.w = t.width;
    inp.h = t.height;
    inp.frame = frame;
    inp.ceilCount = this.ceilCount;
    inp.obstacles = obs;
    inp.count = obs.length;
    inp.fresh = fresh;
    inp.reduced = reduced;
    inp.dtMs = this.flags.frameMs;
    const out = placeCombo(this.placeStates[team], inp, lane, this.placeOuts[team]);
    this.serials[team] = c.serial;
    this.wasAnchored[team] = true;
    const tr = this.trace[team];
    {
      tr.headX = headX;
      tr.headY = headY;
      tr.ax = c.ax;
      tr.ay = c.ay;
      tr.s = s;
      tr.baseX = headX;
      tr.baseY = b0;
      tr.fresh = fresh;
    }
    const alpha = comboAlpha(c) * dim;
    t.setPosition(out.x, out.y)
      .setScale(Math.min(comboScale(c, reduced), out.popMax))
      .setAlpha(out.stuck ? Math.min(alpha, COMBO_STUCK_ALPHA) : alpha)
      .setVisible(true);
  }

  /** The HUD furniture an anchored counter stays under, in `ceilRects`: status chips, name/life labels, SUPER labels, bench chips and the tag pill. */
  buildCeil(): void {
    let n = 0;
    const add = (x: number, y: number, w: number, h: number): void => {
      const r = (this.ceilRects[n] ??= { x: 0, y: 0, w: 0, h: 0 });
      r.x = x;
      r.y = y;
      r.w = w;
      r.h = h;
      n++;
    };
    const chips = this.scene.registry.get(CHIP_RECTS_KEY) as HudRect[][] | undefined;
    if (chips) for (const list of chips) for (const r of list) add(r.x, r.y, r.w, r.h);
    const addText = (t: Phaser.GameObjects.Text | undefined): void => {
      if (t?.visible && t.alpha > 0 && t.text !== '') add(t.x - t.originX * t.displayWidth, t.y - t.originY * t.displayHeight, t.displayWidth, t.displayHeight);
    };
    this.deps.eachCeilText(addText);
    for (const team of TEAMS) {
      const bench = this.deps.benchCount[team] ?? 0;
      for (let i = 0; i < bench; i++) {
        const r = chipRect(team, i);
        const bar = chipBar(team, i);
        add(r.x - 2, r.y - 2, r.size + 4, bar.y + bar.lineMax / 2 + 2 - (r.y - 2));
      }
      if (bench > 0) {
        const pill = tagPill(team);
        add(pill.x, pill.wordY - 6, pill.w, chipSize());
      }
    }
    this.ceilCount = n;
  }

  /** Test probe: one entry per visible combo counter with its placement, the lane, ceiling and obstacles, in Hud px (and `css` in page px). */
  boxes(arcade: ArcadeHudModel | undefined): ComboProbe[] {
    const page = hudOnPage(this.scene.game.canvas.getBoundingClientRect(), coreDisplayWidth(this.scene), viewHeight(this.scene));
    const rect = (r: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } => ({ x: r.x, y: r.y, w: r.w, h: r.h });
    const out: ComboProbe[] = [];
    for (const team of TEAMS) {
      const t = this.texts[team];
      const c = arcade?.combos[team];
      if (!t?.visible || !c) continue;
      const tr = this.trace[team];
      const o = this.placeOuts[team];
      const st = this.placeStates[team];
      const box = { x: t.x - t.originX * t.displayWidth, y: t.y - t.originY * t.displayHeight, w: t.displayWidth, h: t.displayHeight };
      const lane = this.lanes[team];
      const mode = this.modes[team];
      out.push({
        team,
        hits: c.hits,
        live: c.live,
        anchored: c.anchored,
        mode,
        stuck: mode === 'anchored' && o.stuck,
        settled: mode !== 'anchored' || o.settled,
        ...box,
        base: { x: tr.baseX, y: tr.baseY },
        target: { x: o.targetX, y: o.targetY },
        scale: t.scaleX,
        popMax: o.popMax,
        alpha: t.alpha,
        dx: st.dx,
        dy: st.dy,
        ax: tr.ax,
        ay: tr.ay,
        headX: tr.headX,
        headY: tr.headY,
        lane: rect(lane),
        laneTop: lane.y,
        ceil: o.ceil,
        numberH: this.deps.numbers.numberH,
        maxSlide: o.maxSlide,
        avoid: this.avoid[team].map(rect),
        frame: rect(this.deps.viewFrame),
        view: rect(this.deps.arenaView() ?? { x: 0, y: 0, w: 0, h: 0 }),
        s: tr.s,
        css: hudToDom(box, page),
      });
    }
    return out;
  }

  /** The visible combo readouts' rects, for the TAG! call to slide clear of (one reused array under COMBO_RECTS_KEY). */
  publishRects(): void {
    let rects = this.scene.registry.get(COMBO_RECTS_KEY) as HudRect[] | undefined;
    if (!rects) this.scene.registry.set(COMBO_RECTS_KEY, (rects = []));
    let n = 0;
    for (const c of this.texts) {
      if (!c?.visible) continue;
      const r = (rects[n] ??= { x: 0, y: 0, w: 0, h: 0 }) as { x: number; y: number; w: number; h: number };
      r.x = c.x - c.originX * c.displayWidth;
      r.y = c.y - c.originY * c.displayHeight;
      r.w = c.displayWidth;
      r.h = c.displayHeight;
      n++;
    }
    rects.length = n;
  }

  /**
   * Left edge in HUD logical px of the DOM chrome that can sit over the right combo counter, so the counter stays clear of it (undefined
   * when none does): the touch Pause button, and the fullscreen toggle when it reaches down to the counter's row (phones move it under
   * the HUD band, QA r79).
   */
  private pauseLeft(): number | undefined {
    const { hudLeft, hudTop, k } = hudOnPage(this.scene.game.canvas.getBoundingClientRect(), coreDisplayWidth(this.scene), viewHeight(this.scene));
    let left: number | undefined;
    for (const id of ['pauseButton', 'fullscreenToggle']) {
      const b = document.getElementById(id);
      if (!b || getComputedStyle(b).display === 'none') continue;
      const r = b.getBoundingClientRect();
      if (r.bottom <= hudTop + 0.5) continue; // in the strip above the canvas (portrait play)
      if (id === 'fullscreenToggle' && (r.bottom - hudTop) / k <= COMBO_Y) continue;
      const l = (r.left - hudLeft) / k;
      left = left === undefined ? l : Math.min(left, l);
    }
    return left;
  }

  /** Scene shutdown: drop the texts and per-match memory. */
  destroy(): void {
    for (const t of this.texts) t?.destroy();
    this.texts = [];
    this.keys = [];
    this.scene.registry.remove(COMBO_RECTS_KEY);
    for (const t of TEAMS) {
      resetPlaceState(this.placeStates[t]);
      this.modes[t] = 'band';
      this.serials[t] = -1;
      this.wasAnchored[t] = false;
    }
  }
}
