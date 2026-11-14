import type Phaser from 'phaser';
import { SimEventKind, type RenderView, type SimEvent } from '@core/index';
import { LOGICAL_WIDTH } from '../boot/viewport';
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

  const text = (size: number, style: string, color: string, spacing = 0): Phaser.GameObjects.Text =>
    hud.add
      .text(LOGICAL_WIDTH / 2, SLAB_Y, '', {
        fontFamily: 'Georgia, "Times New Roman", serif', fontSize: `${String(size)}px`, fontStyle: style, color, stroke: '#0a0806',
        strokeThickness: size > 30 ? 4 : 2, align: 'center', lineSpacing: spacing, resolution: hud.scale.width / LOGICAL_WIDTH,
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
    parts.bg.clear().fillStyle(0x0c0a08, 0.76).fillRect(x - SLAB_W / 2, 0, SLAB_W, SLAB_H)
      .lineStyle(2, 0x3a352c, 1).strokeRect(x - SLAB_W / 2, 0, SLAB_W, SLAB_H)
      .fillStyle(a.hex, 1).fillRect(x - SLAB_W / 2, 0, SLAB_W, 5);
    parts.kicker.setText(c.kicker).setColor(BONE).setY(SLAB_Y + 16);
    parts.title.setText(c.title).setColor(a.css).setY(SLAB_Y + 38);
    parts.head.setText(c.headline).setColor(BONE).setY(SLAB_Y + 98);
    parts.body.setText(c.lines.join('\n')).setColor(BONE).setY(SLAB_Y + 130);
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
    parts.bg.setY(SLAB_Y + slide);
    parts.kicker.setY(SLAB_Y + 16 + slide);
    parts.title.setY(SLAB_Y + 38 + slide);
    parts.head.setY(SLAB_Y + 98 + slide);
    parts.body.setY(SLAB_Y + 130 + slide);
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
      return { visible: on, tone: card?.tone ?? '', kicker: card?.kicker ?? '', title: card?.title ?? '', headline: card?.headline ?? '', lines: card?.lines ?? [] };
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
