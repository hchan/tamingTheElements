import type Phaser from 'phaser';
import { ROUND_TIMER_TICKS, type RenderView, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';
import { LOGICAL_WIDTH } from '../boot/viewport';
import { mountDefenceView, type Fighters } from '../fx/defence-view';
import {
  PIP_R, PIP_Y, RoundAnnouncer, TICK_MS, TIMER_LOW_TICKS, TIMER_PX, TIMER_X, TIMER_Y, bannerScale, pips, timerLabel,
} from './round-announcer';

/**
 * Phaser side of the Arcade round announcer (WP-arcade-announcer-view): the round timer and the round-win pips at the
 * top centre of the HUD, and the big centred banner. The Arena imports this module only in an Arcade match (its own
 * lazy chunk, so Classic never downloads it) and draws into the Hud scene, so the Arena camera's shake and super punch-in
 * never move it. Per match: two banner texts, one timer text and one pip Graphics, made once and reused; one Hud
 * `update` listener; everything goes with the Arena or the Hud (shutdown or destroy).
 */

/** Over the HUD (100-102) and its damage numbers. */
const DEPTH = 110;
const BANNER_Y = 320;
const MAIN_PX = 96;
const SUB_PX = 48;
const SUB_GAP = 64;
const WON_COLOR = 0xffd23f;

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
  readonly won: readonly [number, number];
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
  // The defence view (WP-arcade-defence-view) comes with the round HUD, in its own chunk (vite.config.ts), so the Arena
  // pays only for one more argument.
  const defence = fighters && mountDefenceView(arena, view, say, prefs, fighters);
  const banner = { main: '', sub: '', from: 0, until: 0, reduced: false };
  const announcer = new RoundAnnouncer({
    banner(main, sub, from, until): void {
      Object.assign(banner, { main, sub, from, until, reduced: prefs().reduceMotion });
    },
    say,
  });
  const a = view.arcade();
  if (a) announcer.sync(a, view.tick);

  let parts: { main: Phaser.GameObjects.Text; sub: Phaser.GameObjects.Text; timer: Phaser.GameObjects.Text; pips: Phaser.GameObjects.Graphics } | undefined;
  let shownTimer = '';
  const shownWon: [number, number] = [-1, -1];
  let shownLow = false;
  let scale = 1;

  const text = (size: number, y: number, stroke: number): Phaser.GameObjects.Text =>
    hud.add
      .text(TIMER_X, y, '', {
        fontSize: `${String(size)}px`, fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: stroke,
        resolution: hud.scale.width / LOGICAL_WIDTH,
      })
      .setDepth(DEPTH);

  function draw(): void {
    const ar = view.arcade();
    if (!parts || !ar) return;
    const tick = view.tick;
    const on = banner.main !== '' && tick < banner.until;
    scale = bannerScale((tick - banner.from) * TICK_MS, banner.reduced);
    if (parts.main.text !== banner.main) parts.main.setText(banner.main);
    if (parts.sub.text !== banner.sub) parts.sub.setText(banner.sub);
    parts.main.setVisible(on).setScale(scale);
    parts.sub.setVisible(on && banner.sub !== '');
    // Before its first tick (round 0) the world has no timer yet: show the full one round 1 starts with.
    const left = ar.round === 0 ? ROUND_TIMER_TICKS : ar.timer;
    const label = timerLabel(left);
    const low = left <= TIMER_LOW_TICKS;
    if (label !== shownTimer || low !== shownLow) {
      shownTimer = label;
      shownLow = low;
      // The number is the cue; the warning colour only adds to it.
      parts.timer.setText(label).setColor(low ? '#ff8080' : '#ffffff');
    }
    if (ar.roundsWon[0] !== shownWon[0] || ar.roundsWon[1] !== shownWon[1]) {
      shownWon[0] = ar.roundsWon[0];
      shownWon[1] = ar.roundsWon[1];
      drawPips(parts.pips, shownWon, prefs().highContrast);
    }
  }

  const build = (): void => {
    parts = {
      main: text(MAIN_PX, BANNER_Y, 10).setOrigin(0.5),
      sub: text(SUB_PX, BANNER_Y + SUB_GAP, 8).setOrigin(0.5, 0),
      timer: text(TIMER_PX, TIMER_Y, 6).setOrigin(0.5, 0),
      pips: hud.add.graphics().setDepth(DEPTH),
    };
    hud.events.on('update', draw);
    // The probe draws first, so it reads the current tick even between two rendered frames.
    states.set(hud, () => {
      draw();
      return { main: banner.main, sub: banner.sub, visible: parts?.main.visible ?? false, scale, timer: shownTimer, won: [shownWon[0], shownWon[1]] };
    });
    draw();
  };

  const off = (): void => {
    hud.events.off('create', build).off('update', draw).off('shutdown', off).off('destroy', off);
    arena.events.off('shutdown', off).off('destroy', off);
    states.delete(hud);
    if (parts) for (const o of Object.values(parts)) o.destroy();
    parts = undefined;
  };
  if (hud.sys.isActive()) build();
  else hud.events.once('create', build);
  for (const s of [arena, hud]) s.events.once('shutdown', off).once('destroy', off);
  return (events) => {
    announcer.consume(events);
    defence?.(events);
  };
}

/** Filled pips are won rounds, hollow ones are still to win: a shape cue, not only colour. */
function drawPips(g: Phaser.GameObjects.Graphics, won: readonly [number, number], highContrast: boolean): void {
  g.clear();
  for (const p of pips(won)) {
    g.fillStyle(p.won ? (highContrast ? 0xffffff : WON_COLOR) : 0x000000, p.won ? 1 : 0.5);
    g.fillCircle(p.x, PIP_Y, PIP_R);
    g.lineStyle(3, 0x000000, 1).strokeCircle(p.x, PIP_Y, PIP_R);
    g.lineStyle(highContrast ? 2 : 1.5, 0xffffff, 1).strokeCircle(p.x, PIP_Y, PIP_R - 1);
  }
}
