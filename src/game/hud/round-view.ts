import type Phaser from 'phaser';
import { EntityFlag, ROUND_TIMER_TICKS, SimEventKind, type RenderView, type SimEvent } from '@core/index';
import { ELEMENT_COLORS } from '../fx/element-colors';
import { BANNER_BAND_COLOR, BANNER_BAND_ALPHA, BANNER_BAND_ALPHA_HC, bannerBandFor, bannerColorFor, bannerFrame, bannerSizeFor, cardColorFor, cardFrame, haloFor, isIntroBanner, type BandStrip, type CardFrame } from './round-cards';
import { heroName } from './tag-fx';
import type { Announcement } from '../a11y/announcer';
import { LOGICAL_WIDTH, phoneBoost, resolutionOf } from '../boot/viewport';
import { mountDefenceView, type Fighters } from '../fx/defence-view';
import { mountWeatherView } from '../fx/weather-view';
import {
  PIP_R, PIP_Y, RoundAnnouncer, pipPairCentre, TICK_MS, TIMER_COLOR, TIMER_PX, TIMER_X, TIMER_Y, bannerScale, pips, timerStyle,
} from './round-announcer';
import { bannerDraws, cutUp, fightYields, introClockStart } from './banner-lanes';
import { RESULT_TICKS } from './round-result';
import { mountResultView, type ResultState } from './round-result-view';

/**
 * Phaser side of the Arcade round announcer (WP-arcade-announcer-view): the round timer and the round-win pips at the
 * top centre of the HUD, and the big centred banner. The Arena imports this module only in an Arcade match (its own
 * lazy chunk, so Classic never downloads it) and draws into the Hud scene, so the Arena camera's shake and super punch-in
 * never move it. Per match: two banner texts, one timer text and one pip Graphics, made once and reused; one Hud
 * `update` listener; everything goes with the Arena or the Hud (shutdown or destroy).
 */

/** Over the HUD (100-102) and its damage numbers. */
/** Fight time the first-run card stays after FIGHT! ends: 2.5 s at 50 Hz (FIRST_RUN_MS). Fight time, not wall clock. */
export const FIGHT_SETTLED_TICKS = 125;
const DEPTH = 110;
/** Above the centre pad's label (y 330 to 345) and below the weather called line (y 268). */
const BANNER_Y = 304;
const MAIN_PX = 44;
const SUB_PX = 24;
const SUB_GAP = 42;
/** Name cards: big engraved names at each screen edge, above the fighters. */
const CARD_PX = 54;
const CARD_Y = 200;
const CARD_MARGIN = 64;
const WON_COLOR = 0xb8964a;
/** The word under each side's round pips, so they are not read as super charge. */
const PIP_LABEL_PX = 13;

/** Least gap (logical px) the two WINS captions keep between them (30 is about 13 screen px at 568x320, QA r79); wider captions (phones) hug the timer side so they never run together. */
const PIP_LABEL_GAP = 30;
/** The WINS caption goes under its pair of pips; when two centred captions would be closer than PIP_LABEL_GAP, each one's inner edge sits PIP_LABEL_GAP / 2 off the timer's centre line instead. */
export function placePipLabel(t: Phaser.GameObjects.Text, team: 0 | 1): Phaser.GameObjects.Text {
  const y = PIP_Y + PIP_R + 3;
  const centre = pipPairCentre(team);
  if (2 * Math.abs(centre - TIMER_X) - t.width >= PIP_LABEL_GAP) return t.setOrigin(0.5, 0).setPosition(centre, y);
  return t.setOrigin(team === 0 ? 1 : 0, 0).setPosition(TIMER_X + (team === 0 ? -PIP_LABEL_GAP / 2 : PIP_LABEL_GAP / 2), y);
}

/** Banner fade: in over the first 8 ticks, out over the last 12 (none with reduced motion). */
const FADE_IN_TICKS = 8;
const FADE_OUT_TICKS = 12;

export interface RoundPrefs {
  readonly reduceMotion: boolean;
  readonly highContrast: boolean;
}

/** Read-out for the test probe. */
export interface RoundState {
  readonly main: string;
  readonly sub: string;
  readonly visible: boolean;
  readonly scale: number;
  readonly timer: string;
  readonly timerColor: string;
  /** The round-start name cards (left, right) while shown, else empty strings. */
  readonly cards: readonly [string, string];
  /** Core alpha of the dark band behind a small banner drawn now (0 when there is none). */
  readonly band: number;
  readonly won: readonly [number, number];
  /** The result card under the banner ("YOU WIN" and what happened). */
  readonly result: ResultState;
}

const states = new WeakMap<Phaser.Scene, () => RoundState>();

/** The round HUD drawn in `hud` (test probe), or undefined before it is built or after teardown. */
export function roundState(hud: Phaser.Scene): RoundState | undefined {
  return states.get(hud)?.();
}

/**
 * Mounts the round HUD for `view` in the `hud` scene (built once the Hud has run its `create`) and returns the event
 * consumer the Arena feeds every tick. `say` is the Arena's throttled live region; `prefs` the accessibility prefs,
 * read when a banner starts and when the pips change.
 */
export function mountRoundView(
  arena: Phaser.Scene,
  hud: Phaser.Scene,
  view: RenderView,
  say: (line: Announcement) => void,
  prefs: () => RoundPrefs,
  fighters?: Fighters,
): (events: readonly SimEvent[]) => void {
  // The defence and weather views (WP-arcade-defence-view, WP-arcade-weather-view) come with the round HUD, each in its
  // own chunk (vite.config.ts), so the Arena pays only for one more argument.
  const views = mountWeatherView(arena, hud, view, say, prefs, fighters && mountDefenceView(arena, view, say, prefs, fighters));
  const results = mountResultView(hud, view, prefs);
  const banner = { main: '', sub: '', from: 0, until: 0, reduced: false, hc: false };
  const announcer = new RoundAnnouncer({
    banner(main, sub, from, until): void {
      Object.assign(banner, { main, sub, from, until, reduced: prefs().reduceMotion, hc: prefs().highContrast });
    },
    say,
  }, () => view.arcade()?.sudden === true, () => results.result.detail());
  const a = view.arcade();
  if (a) announcer.sync(a, view.tick);

  /** The view tick the last round result card ends: an intro banner's clock (fade, scale-in, name cards) starts then, not under the card. */
  let cardEnd = -1;
  let fightOverSent = false;
  let settleAt = -1;
  let settledSent = false;
  /** The start tick of the FIGHT! banner a super cut in on (qa-r43): it is dropped for good, not redrawn over the burst that outlives the cut-in. */
  let fightDropped = -1;
  /** When the banner's clock starts: its own start, or for an intro banner the end of the result card. */
  const clockFrom = (): number => (isIntroBanner(banner.main) ? introClockStart(banner.from, cardEnd) : banner.from);

  let parts: {
    main: Phaser.GameObjects.Text; sub: Phaser.GameObjects.Text; timer: Phaser.GameObjects.Text; pips: Phaser.GameObjects.Graphics; pipLabels: Phaser.GameObjects.Text[];
    halo: Phaser.GameObjects.Graphics; cardBands: [Phaser.GameObjects.Graphics, Phaser.GameObjects.Graphics]; band: Phaser.GameObjects.Graphics; cards: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  } | undefined;
  const cardStrips: BandStrip[] = [];
  const cardBandKeys: [string, string] = ['', ''];
  const cardState: CardFrame = { alpha: 0, offset: 0 };
  const cardNames: [string, string] = ['', ''];
  const cardColors: [string, string] = ['#e8dcc0', '#e8dcc0'];
  let shownHalo = -1;
  const strips: BandStrip[] = [];
  let shownBand = '';
  let bandCore = 0;
  let shownSize = 1;
  let cardsFor = -1;
  let shownTimer = '';
  const shownWon: [number, number] = [-1, -1];
  let shownColor = '';
  let scale = 1;

  /** The words: bone serif under a thin dark stroke, regular weight (the banner is `grim`, the timer keeps a heavier stroke for contrast). */
  const text = (size: number, y: number, stroke: number, grim = false): Phaser.GameObjects.Text =>
    hud.add
      .text(TIMER_X, y, '', {
        fontFamily: 'Georgia, "Times New Roman", serif', fontSize: `${String(size)}px`, fontStyle: grim ? 'normal' : 'bold', color: grim ? '#b3ab9a' : TIMER_COLOR, stroke: '#0a0806', strokeThickness: grim ? Math.round(stroke / 2) : stroke,
        resolution: resolutionOf(hud),
      })
      .setDepth(DEPTH);

  /** A soft warm glow behind a KO or FIGHT! call (stacked additive ellipses); redrawn only when its strength changes. */
  function drawHalo(k: number): void {
    if (!parts) return;
    const q = Math.round(k * 50);
    if (q === shownHalo) return;
    shownHalo = q;
    parts.halo.clear().setVisible(q > 0);
    for (let i = 0; i < 6 && q > 0; i++) {
      parts.halo.fillStyle(0xffd88a, (q / 50) * 0.1).fillEllipse(TIMER_X, BANNER_Y, 760 - i * 90, 190 - i * 22);
    }
  }

  /** The feathered dark band behind a small banner, redrawn only when its quantised alpha or bounds change. */
  function drawBand(on: boolean, fade: number): void {
    if (!parts) return;
    const m = parts.main;
    const s = parts.sub;
    const subOn = s.visible && banner.sub !== '';
    const halfW = Math.max((m.displayWidth) / 2, subOn ? s.displayWidth / 2 : 0);
    const top = m.y - m.displayHeight / 2;
    const bottom = subOn ? s.y + s.displayHeight : m.y + m.displayHeight / 2;
    const n = on ? bannerBandFor(banner.main, fade, banner.hc, TIMER_X, top, bottom, halfW, strips) : 0;
    bandCore = n > 0 ? (banner.hc ? BANNER_BAND_ALPHA_HC : BANNER_BAND_ALPHA) * fade : 0;
    const key = n === 0 ? '' : `${String(Math.round(fade * 50))}|${String(Math.round(top))}|${String(Math.round(bottom))}|${String(Math.round(halfW))}|${banner.hc ? "h" : "n"}`;
    if (key === shownBand) return;
    shownBand = key;
    parts.band.clear().setVisible(n > 0);
    for (let i = 0; i < n; i++) {
      const r = strips[i];
      if (r) parts.band.fillStyle(BANNER_BAND_COLOR, r.a).fillRect(r.x, r.y, r.w, r.h);
    }
  }

  /** The active hero of each side, read once per intro. */
  function readCards(): void {
    cardNames[0] = '';
    cardNames[1] = '';
    view.forEachCharacter((c) => {
      if ((c.flags & (EntityFlag.dead | EntityFlag.benched)) !== 0 || c.team > 1 || cardNames[c.team] !== '') return;
      cardNames[c.team] = heroName(c.sprite).toUpperCase();
      cardColors[c.team] = cardColorFor(ELEMENT_COLORS[c.element]);
    });
  }

  function drawCards(on: boolean, tick: number): void {
    if (!parts) return;
    if (!on || !isIntroBanner(banner.main)) {
      cardsFor = -1;
      for (const t of parts.cards) t.setVisible(false);
      for (const team of [0, 1] as const) if (cardBandKeys[team] !== '') { cardBandKeys[team] = ''; parts.cardBands[team].clear().setVisible(false); }
      return;
    }
    if (cardsFor !== banner.from) {
      cardsFor = banner.from;
      readCards();
    }
    cardFrame(tick - clockFrom(), banner.until - clockFrom(), banner.reduced, cardState);
    for (const team of [0, 1] as const) {
      const t = parts.cards[team];
      if (t.text !== cardNames[team]) t.setText(cardNames[team]);
      // The slide runs inward from the resting place (qa-r15, HF2-4: never nearer the edge than CARD_MARGIN).
      const edge = team === 0 ? CARD_MARGIN + cardState.offset : LOGICAL_WIDTH - CARD_MARGIN - cardState.offset;
      const shown = cardState.alpha > 0 && cardNames[team] !== '';
      t.setColor(cardColors[team]).setPosition(edge, CARD_Y).setAlpha(cardState.alpha).setVisible(shown);
      if (shown) {
        // A feathered dark strip behind the name (the banner band's maths), redrawn only when its quantised alpha or place changes.
        const w = t.displayWidth;
        const cx = team === 0 ? edge + w / 2 : edge - w / 2;
        const n = bannerBandFor('ROUND', cardState.alpha, banner.hc, cx, CARD_Y - t.displayHeight / 2, CARD_Y + t.displayHeight / 2, w / 2, cardStrips);
        const key = `${String(Math.round(cardState.alpha * 50))}|${String(Math.round(cx))}|${String(Math.round(w))}|${banner.hc ? 'h' : 'n'}`;
        if (key !== cardBandKeys[team]) {
          cardBandKeys[team] = key;
          const g = parts.cardBands[team];
          g.clear().setVisible(true);
          for (let i = 0; i < n; i++) {
            const r = cardStrips[i];
            if (r) g.fillStyle(BANNER_BAND_COLOR, r.a).fillRect(r.x, r.y, r.w, r.h);
          }
        }
      } else if (cardBandKeys[team] !== '') {
        cardBandKeys[team] = '';
        parts.cardBands[team].clear().setVisible(false);
      }
    }
  }

  function draw(): void {
    const ar = view.arcade();
    if (!parts || !ar) return;
    const tick = view.tick;
    // The FIGHT! banner has run out (tick based): the first-run card (app/first-run-hint.ts, FIGHT_OVER_EVENT) may now appear; a literal keeps that card out of this lazy chunk.
    if (banner.main === 'FIGHT!' && tick >= banner.until && !fightOverSent && typeof window !== 'undefined') {
      fightOverSent = true;
      settleAt = tick + FIGHT_SETTLED_TICKS;
      window.dispatchEvent(new Event('tte:fight-over'));
    }
    // Fight time, not wall clock: the first-run card (FIGHT_SETTLED_EVENT in app/first-run-hint.ts) fades once, FIGHT_SETTLED_TICKS after FIGHT! ends.
    if (settleAt >= 0 && !settledSent && tick >= settleAt && typeof window !== 'undefined') {
      settledSent = true;
      window.dispatchEvent(new Event('tte:fight-settled'));
    }
    // Lanes (banner-lanes.ts): the super cut-in outranks the banner; an intro banner waits out the round result card.
    if (banner.main === 'FIGHT!' && cutUp(hud.registry)) fightDropped = banner.from;
    const on = banner.main !== '' && tick < banner.until && !fightYields(banner.main, banner.from, fightDropped) && bannerDraws(cutUp(hud.registry), results.result.state().visible, isIntroBanner(banner.main), results.result.state().compact);
    const slow = bannerScale((tick - clockFrom()) * TICK_MS, banner.reduced);
    // The damage numbers (Hud.drawArcade) thin out under a banner, so the stacked KO numbers never bury its caption.
    if (hud.registry.get('tte.banner') !== on) hud.registry.set('tte.banner', on);
    if (parts.main.text !== banner.main) parts.main.setText(banner.main);
    if (parts.sub.text !== banner.sub) parts.sub.setText(banner.sub);
    const frame = bannerFrame(banner.main, tick - clockFrom(), banner.until - tick, banner.reduced, slow, FADE_IN_TICKS, FADE_OUT_TICKS);
    const fade = frame.alpha;
    scale = frame.scale;
    const size = bannerSizeFor(banner.main);
    if (on && size !== shownSize) {
      shownSize = size;
      // Big calls get a hard, thick outline so they stay solid over floor detail and damage numbers.
      parts.main.setFontSize(MAIN_PX * size).setStroke('#0a0806', size > 1 ? 10 : 7);
    }
    if (on) {
      parts.main.setColor(bannerColorFor(banner.main, banner.hc));
      parts.sub.setColor(banner.hc ? '#ffffff' : '#ece2c8');
    }
    parts.main.setVisible(on).setScale(scale).setAlpha(fade);
    parts.sub.setY(BANNER_Y + SUB_GAP + (size > 1 ? Math.round(MAIN_PX * (size - 1) * 0.55) : 0));
    drawHalo(on ? haloFor(banner.main, tick - clockFrom(), banner.reduced) : 0);
    drawCards(on, tick);
    // the result card says who won the round, so its duplicate under the banner is hidden while the card is up
    parts.sub.setVisible(on && banner.sub !== '' && !results.result.state().visible).setAlpha(Math.max(0, fade));
    drawBand(on, Math.max(0, fade));
    // Before its first tick (round 0) the world has no timer yet: show the full one round 1 starts with.
    const left = ar.round === 0 ? ROUND_TIMER_TICKS : ar.timer;
    const style = timerStyle(left, ar.sudden);
    if (style.text !== shownTimer || style.color !== shownColor) {
      shownTimer = style.text;
      shownColor = style.color;
      // The number is the cue; the warning colour (and the word in sudden death) only adds to it.
      parts.timer.setText(style.text).setColor(style.color).setFontSize(style.px);
    }
    if (ar.roundsWon[0] !== shownWon[0] || ar.roundsWon[1] !== shownWon[1]) {
      shownWon[0] = ar.roundsWon[0];
      shownWon[1] = ar.roundsWon[1];
      drawPips(parts.pips, shownWon, prefs().highContrast);
    }
  }

  const build = (): void => {
    parts = {
      main: text(MAIN_PX, BANNER_Y, 14, true).setOrigin(0.5),
      sub: text(SUB_PX, BANNER_Y + SUB_GAP, 6, true).setOrigin(0.5, 0),
      timer: text(TIMER_PX, TIMER_Y, 5).setOrigin(0.5, 0),
      pips: hud.add.graphics().setDepth(DEPTH),
      // One caption centred under both pip groups (it was one per group: the same word twice, qa-hud-clutter).
      // One WINS caption centred under each side's pair, so a count is never read as super charge.
      pipLabels: ([0, 1] as const).map(() => text(PIP_LABEL_PX, PIP_Y + PIP_R + 3, 3, true).setFontSize(Math.round(PIP_LABEL_PX * phoneBoost(hud, 1.7, 1100))).setText('WINS')).map((t, team) => placePipLabel(t, team === 0 ? 0 : 1)),
      halo: hud.add.graphics().setDepth(DEPTH - 1).setBlendMode('ADD').setVisible(false),
      band: hud.add.graphics().setDepth(DEPTH - 2).setVisible(false),
      cardBands: [hud.add.graphics().setDepth(DEPTH - 2).setVisible(false), hud.add.graphics().setDepth(DEPTH - 2).setVisible(false)],
      cards: [
        text(CARD_PX, CARD_Y, 12, true).setOrigin(0, 0.5).setVisible(false),
        text(CARD_PX, CARD_Y, 12, true).setOrigin(1, 0.5).setVisible(false),
      ],
    };
    hud.events.on('update', draw);
    // The probe draws first, so it reads the current tick even between two rendered frames.
    states.set(hud, () => {
      draw();
      return { main: banner.main, sub: banner.sub, visible: parts?.main.visible ?? false, scale, timer: shownTimer, timerColor: shownColor, cards: [parts?.cards[0].visible ? cardNames[0] : '', parts?.cards[1].visible ? cardNames[1] : ''], band: bandCore, won: [shownWon[0], shownWon[1]], result: results.result.state() };
    });
    draw();
  };

  const off = (): void => {
    hud.events.off('create', build).off('update', draw).off('shutdown', off).off('destroy', off);
    arena.events.off('shutdown', off).off('destroy', off);
    states.delete(hud);
    hud.registry.set('tte.banner', false);
    results.destroy();
    if (parts) for (const o of [parts.main, parts.sub, parts.timer, parts.pips, ...parts.pipLabels, parts.halo, parts.band, ...parts.cardBands, ...parts.cards]) o.destroy();
    parts = undefined;
  };
  if (hud.sys.isActive()) build();
  else hud.events.once('create', build);
  for (const s of [arena, hud]) s.events.once('shutdown', off).once('destroy', off);
  return (events) => {
    // The round-end sequence starts at the K.O. or the time call: DOM overlays (the first-run card, ROUND_OVER_EVENT in app/first-run-hint.ts) get out of its way; a literal here keeps that card out of this lazy chunk.
    if (typeof window !== 'undefined' && events.some((e) => e.kind === SimEventKind.ko || e.kind === SimEventKind.timeOver)) window.dispatchEvent(new Event('tte:round-over'));
    for (const e of events) if (e.kind === SimEventKind.roundEnded) cardEnd = e.tick + RESULT_TICKS;
    results.result.consume(events);
    announcer.consume(events);
    views(events);
  };
}

/** Filled pips are won rounds, hollow ones are still to win: a shape cue, not only colour. */
function drawPips(g: Phaser.GameObjects.Graphics, won: readonly [number, number], highContrast: boolean): void {
  g.clear();
  for (const p of pips(won)) {
    g.fillStyle(p.won ? (highContrast ? 0xffffff : WON_COLOR) : 0x000000, p.won ? 1 : 0.5);
    g.fillCircle(p.x, PIP_Y, PIP_R);
    g.lineStyle(4, 0x000000, 1).strokeCircle(p.x, PIP_Y, PIP_R);
    g.lineStyle(highContrast ? 3 : 2, highContrast ? 0xffffff : 0xcfc6b0, 1).strokeCircle(p.x, PIP_Y, PIP_R - 1);
    // A won pip carries a dark check as well as its fill, so it never reads on colour alone.
    if (p.won) g.lineStyle(3, 0x000000, 1).lineBetween(p.x - 6, PIP_Y, p.x - 2, PIP_Y + 5).lineBetween(p.x - 2, PIP_Y + 5, p.x + 6, PIP_Y - 5);
  }
}
