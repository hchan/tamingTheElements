import type Phaser from 'phaser';
import { SimEventKind, type RenderView, type SimEvent } from '@core/index';
import { LOGICAL_WIDTH, phoneBoost, resolutionOf } from '../boot/viewport';
import {
  RESULT_TICKS, ResultTally, healthPct, resultCard, type ResultCard, type Tone,
} from './round-result';

/**
 * Phaser side of the round and match result card (round-result.ts holds the rules): a dark slab under the banner with
 * YOU WIN / YOU LOSE / DRAW in ash serif, how the round ended, the score and a few lines of what happened. Mounted by
 * `round-view.ts` (the same lazy chunk), drawn in the Hud scene so the Arena camera never moves it. Its five objects are
 * made on the first result and reused; it listens to the Hud `update` event only while it exists. Times are view ticks,
 * so the card holds while the sim is paused. Reduced motion: no slide, no fade (it appears and disappears).
 */

const DEPTH = 108;
/** Under the banner's "K.O." (y 304) and its "YOU WIN ROUND n" line (y 346), clear of the centre pad label above them. */
const SLAB_Y = 392;
const SLAB_W = 440;
const SLAB_H = 228;
/**
 * Phone card (qa-r27: the full slab covered both fighters at 844x390): a short slab in the free band between the weather label and the
 * banner's "K.O." line, with the kicker, the title and the headline only (the detail lines stay in the live region).
 */
const COMPACT_Y = 184;
const COMPACT_H = 124;
/** `phoneBoost(hud, 2, 1100)` at or above this is a phone (a drawn width under about 730 CSS px). */
const COMPACT_BOOST = 1.5;
const FADE_IN_TICKS = 10;
const FADE_OUT_TICKS = 12;
const SLIDE_PX = 14;
const HOLD = Number.MAX_SAFE_INTEGER;

/** Desaturated per tone: ash gold, dried blood, plain ash. */
const ACCENT: Readonly<Record<Tone, { hex: number; css: string }>> = {
  win: { hex: 0xb8964a, css: '#cdb87e' },
  lose: { hex: 0x7a3a32, css: '#b0675b' },
  draw: { hex: 0x8a8578, css: '#b3ab9a' },
};
const BONE = '#b3ab9a';

export interface ResultState {
  readonly visible: boolean;
  readonly tone: Tone | '';
  readonly kicker: string;
  readonly title: string;
  readonly headline: string;
  readonly lines: readonly string[];
  /** The short phone card is the one in use (the banner's duplicate K.O. is hidden under it). */
  readonly compact: boolean;
}

export interface ResultView {
  /** Feeds the tick's events; call it before the announcer so `detail` is ready when `roundEnded` reaches it. */
  consume(events: readonly SimEvent[]): void;
  /** The summary of the round just ended, for the live region ('' before the first). */
  detail(): string;
  state(): ResultState;
}

export function mountResultView(
  hud: Phaser.Scene,
  view: RenderView,
  prefs: () => { readonly reduceMotion: boolean },
): { result: ResultView; destroy: () => void } {
  const tally = new ResultTally();
  const team: number[] = [];
  const teamOf = (id: number): number => team[id] ?? -1;
  let card: ResultCard | undefined;
  let from = 0;
  let until = 0;
  let reduced = false;
  let lastDetail = '';
  let parts: { bg: Phaser.GameObjects.Graphics; kicker: Phaser.GameObjects.Text; title: Phaser.GameObjects.Text; head: Phaser.GameObjects.Text; body: Phaser.GameObjects.Text } | undefined;
  let shown: ResultCard | undefined;
  let compact = false;
  /** Slab top and the y offsets of the four texts, for the layout in use. */
  const place = (): { y: number; h: number; kicker: number; title: number; head: number; body: number } =>
    compact
      ? { y: COMPACT_Y, h: COMPACT_H, kicker: 4, title: 20, head: 68, body: 96 }
      : { y: SLAB_Y, h: SLAB_H, kicker: 16, title: 38, head: 98, body: 130 };

  const text = (size: number, style: string, color: string, spacing = 0): Phaser.GameObjects.Text =>
    hud.add
      .text(LOGICAL_WIDTH / 2, SLAB_Y, '', {
        fontFamily: 'Georgia, "Times New Roman", serif', fontSize: `${String(size)}px`, fontStyle: style, color, stroke: '#0a0806',
        strokeThickness: size > 30 ? 4 : 2, align: 'center', lineSpacing: spacing, resolution: resolutionOf(hud),
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH);

  function create(): void {
    parts = {
      bg: hud.add.graphics().setDepth(DEPTH),
      kicker: text(18, 'normal', BONE),
      title: text(46, 'normal', BONE),
      head: text(18, 'normal', BONE),
      body: text(17, 'normal', BONE, 6),
    };
  }

  /** Lays the card out in the objects (once per new card). */
  function layout(c: ResultCard): void {
    if (!parts) return;
    const a = ACCENT[c.tone];
    const x = LOGICAL_WIDTH / 2;
    compact = phoneBoost(hud, 2, 1100) >= COMPACT_BOOST;
    const p = place();
    parts.bg.clear().fillStyle(0x0c0a08, 0.76).fillRect(x - SLAB_W / 2, 0, SLAB_W, p.h)
      .lineStyle(2, 0x3a352c, 1).strokeRect(x - SLAB_W / 2, 0, SLAB_W, p.h)
      .fillStyle(a.hex, 1).fillRect(x - SLAB_W / 2, 0, SLAB_W, 5);
    parts.kicker.setText(c.kicker).setColor(BONE);
    parts.title.setText(c.title).setColor(a.css);
    parts.head.setText(c.headline).setColor(BONE);
    // Phone: the two headline stats on one small line (health left, damage), the rest stays in the live region.
    parts.body.setFontSize(compact ? 14 : 17).setText(compact ? c.lines.slice(0, 2).join('    '): c.lines.join('\n')).setColor(BONE);
  }

  function draw(): void {
    if (!parts) return;
    const tick = view.tick;
    const on = card !== undefined && tick >= from && tick < until;
    if (card && card !== shown) {
      shown = card;
      layout(card);
    }
    for (const o of Object.values(parts)) o.setVisible(on);
    if (!on) return;
    const k = reduced ? 1 : Math.max(0, Math.min(1, (tick - from + 1) / FADE_IN_TICKS, (until - tick) / FADE_OUT_TICKS));
    const slide = reduced ? 0 : Math.round((1 - Math.min(1, (tick - from + 1) / FADE_IN_TICKS)) * SLIDE_PX);
    for (const o of Object.values(parts)) o.setAlpha(k);
    const p = place();
    parts.bg.setY(p.y + slide);
    parts.kicker.setY(p.y + p.kicker + slide);
    parts.title.setY(p.y + p.title + slide);
    parts.head.setY(p.y + p.head + slide);
    parts.body.setY(p.y + p.body + slide);
  }

  function start(c: ResultCard, tick: number, ticks: number): void {
    if (!parts) create();
    card = c;
    from = tick;
    until = ticks === HOLD ? HOLD : tick + ticks;
    reduced = prefs().reduceMotion;
  }

  const roster = (): { hp: number; maxHp: number }[] => {
    const mine: { hp: number; maxHp: number }[] = [];
    view.forEachCharacter((c) => {
      if (c.team === 0) mine.push({ hp: c.hp, maxHp: c.maxHp });
    });
    return mine;
  };

  const result: ResultView = {
    consume(events): void {
      if (events.length === 0) return;
      team.length = 0;
      view.forEachCharacter((c) => {
        team[c.id] = c.team;
      });
      for (const e of events) {
        tally.consume(e, teamOf);
        if (e.kind === SimEventKind.roundEnded) {
          const c = resultCard({
            round: view.arcade()?.round ?? 0, winner: e['winner'] ?? -1, won: [e['won0'] ?? 0, e['won1'] ?? 0],
            how: tally.how, perfect: tally.perfect, healthPct: healthPct(roster()), tally: tally.round,
          });
          lastDetail = c.detail;
          start(c, e.tick, RESULT_TICKS);
        } else if (e.kind === SimEventKind.matchEnded) {
          start(resultCard({
            round: 0, winner: e['winner'] ?? -1, won: [e['won0'] ?? 0, e['won1'] ?? 0], how: tally.how,
            perfect: tally.perfect, healthPct: healthPct(roster()), tally: tally.match,
          }), e.tick, HOLD);
        } else if (e.kind === SimEventKind.roundStarted && card && until === HOLD) {
          // a new match on the same scene: drop the old match card
          card = undefined;
        }
      }
    },
    detail: () => lastDetail,
    state(): ResultState {
      draw();
      const on = card !== undefined && view.tick >= from && view.tick < until;
      return { visible: on, tone: card?.tone ?? '', kicker: card?.kicker ?? '', title: card?.title ?? '', headline: card?.headline ?? '', lines: card?.lines ?? [], compact: on && compact };
    },
  };

  hud.events.on('update', draw);
  const destroy = (): void => {
    hud.events.off('update', draw);
    if (parts) for (const o of Object.values(parts)) o.destroy();
    parts = undefined;
    card = undefined;
    shown = undefined;
  };
  return { result, destroy };
}
