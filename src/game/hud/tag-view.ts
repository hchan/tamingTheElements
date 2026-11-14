import type Phaser from 'phaser';
import { EntityFlag, SimEventKind, type RenderView, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';
import {
  CALL_TICKS, FLASH_TICKS, RED_COLOR, RED_COLOR_HC, RED_DASH, activeLabel, benchBarOf, benchLabel, callPose,
  callText, dashes, flashPose, mainBarOf, redSpan, tagLayout, tagLine, tagReadout, teamX, type Bar, type TagHero,
} from './tag-fx';
import { tagSlot } from './tag-slot';
import { PILL_BAR_H, PILL_W, pillWord, tagPill } from './slim-hud';

/**
 * Phaser side of the Arcade tag-team view (WP-arcade-tag-view, FUN-DESIGN 2.6 and section 3). The weather view mounts it
 * (so it comes with the round view in every Arcade match, replays included) and hands it each tick's events; it is its
 * own chunk `tag-view` (vite.config.ts), so Classic never downloads it, and it builds nothing unless a side has two
 * heroes. In the Hud scene: the red life (rest cap above the health) as red dashes on every hero bar, a gold frame on the
 * active hero's bar, "IN Sindarosa" and "BENCH Pax 40% +20% red" lines (one per bench hero; 3v3 has two, `tagLayout`) and
 * a tag-cooldown bar with its word ("TAG 2.4s", "TAG READY") under each side's bars, and the announcer-style "TAG!" ("PAX
 * IN!" after a KO) on the tagging side. In the
 * Arena: the entrance flash at the entrance spot (a white core, a growing ring, gold after a KO, and speed lines sliding
 * in from the team's side) and a "TAG" caption over the player's swap slot. Live-region lines go through `say`. Reduced
 * motion keeps every word, ring and bar and drops the slide, the ring's growth and the scale-in. Per match: one Hud
 * Graphics and up to nine Hud Texts, one Arena Graphics and one Arena Text, made once; one Arena `postupdate` listener;
 * everything goes with the Arena or the Hud (shutdown or destroy).
 */

const HUD_DEPTH = 103;
/**
 * Top centre of the player's swap slot, the third on the action bar (primary, secondary, then the partner; chapter 1 has
 * no Capture): `slotX(2) + SLOT_SIDE / 2` and `BAR_Y` of `action-bar.ts`, kept here (pinned by a test) because importing
 * that module would split the shared viewport code out of the phaser-config chunk.
 */
export const TAG_SLOT_X = 1 + 2 * 77 + 77 / 2;
export const TAG_SLOT_Y = 640;
/** Over the fighters (0) and the aim arrow (4), under the super dim (5). */
const FLASH_DEPTH = 4.5;
/** The TAG caption floats this far over the slot top, clear of the slot own cooldown words (qa-r3-label-clutter). */
const CAPTION_LIFT = 26;
/** Muted ochre (was bright 0xffd23f): the active-bar frame, the ready bar and the KO ring. */
const GOLD = 0xb39653;
const ASH = 0xcfc4a8;
const CALL_Y = 210;
const CALL_PX = 60;
const LINE_PX = 16;

export interface TagPrefs {
  readonly reduceMotion: boolean;
  readonly highContrast: boolean;
}

/** Read-out for the test probe. */
export interface TagState {
  /** Per team: the active line, a line per bench hero and the tag word (three '' for a one-hero side). */
  readonly lines: readonly (readonly string[])[];
  /** The call while it shows ('' otherwise) and its scale; the live entrance flashes; the swap-slot caption. */
  readonly call: string;
  readonly callScale: number;
  readonly flashes: number;
  readonly ko: boolean;
  readonly caption: string;
}

const states = new WeakMap<Phaser.Scene, () => TagState>();

/** The tag view's last frame in `arena` (test probe), or undefined in 1v1, before it mounts or after teardown. */
export function tagState(arena: Phaser.Scene): TagState | undefined {
  return states.get(arena)?.();
}

interface Hero extends TagHero {
  readonly id: number;
  readonly active: boolean;
}

/**
 * Mounts the tag view (Arena `arena`, HUD `hud`) for `view` when a side has two heroes, and returns the event consumer
 * that passes the events on to `then`; with one hero a side it builds nothing and returns `then`.
 */
export function mountTagView(
  arena: Phaser.Scene,
  hud: Phaser.Scene,
  view: RenderView,
  say: (line: Announcement) => void,
  prefs: () => TagPrefs,
  then?: (events: readonly SimEvent[]) => void,
): ((events: readonly SimEvent[]) => void) | undefined {
  const teams: [Hero[], Hero[]] = [[], []];
  const read = (): void => {
    teams[0] = [];
    teams[1] = [];
    view.forEachCharacter((c) => {
      const dead = (c.flags & EntityFlag.dead) !== 0;
      teams[c.team]?.push({
        id: c.id, sprite: c.sprite, hp: c.hp, maxHp: c.maxHp, restCap: c.restCap, dead, element: c.element,
        active: !dead && (c.flags & EntityFlag.benched) === 0,
      });
    });
  };
  read();
  if (teams[0].length < 2 && teams[1].length < 2) return then;

  // Up to 1.3x on a phone, so the longest bench line still ends left of the round pips.
  const boost = Math.min(1.3, Math.max(1, 900 / (hud.scale.displaySize.width || 900)));
  const rowH = Math.round(LINE_PX * boost) + 5;
  const layouts = teams.map((t) => tagLayout(t.length, rowH, boost));
  const text = (scene: Phaser.Scene, px: number, stroke: number): Phaser.GameObjects.Text =>
    scene.add
      .text(0, 0, '', {
        fontSize: `${String(Math.round(px))}px`, fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: stroke,
        resolution: scene.scale.width / 1280,
      })
      .setDepth(HUD_DEPTH);
  const fx = arena.add.graphics().setDepth(FLASH_DEPTH);
  const caption = teams[0].length < 2 ? undefined : text(arena, 18 * boost, 4).setText('TAG').setOrigin(0.5, 1).setPosition(tagSlot.x, tagSlot.y - CAPTION_LIFT).setScrollFactor(0);
  /** The Hud objects, made once the Hud scene runs (as the round view): its Graphics, per team [lines, tag word], the call. */
  let parts: { g: Phaser.GameObjects.Graphics; texts: Phaser.GameObjects.Text[][]; call: Phaser.GameObjects.Text } | undefined;
  const build = (): void => {
    parts = {
      g: hud.add.graphics().setDepth(HUD_DEPTH),
      texts: teams.map((t, team) =>
        t.length < 2
          ? []
          : (layouts[team]?.rows ?? []).map((_, i, all) => {
              // The slim HUD shows only the tag word (as a compact pill); the IN and BENCH lines stay as hidden texts for the probe.
              const o = text(hud, LINE_PX * boost, 4);
              if (i < all.length - 1) return o.setVisible(false);
              const pill = tagPill(team, t.length - 1);
              return o.setFontSize(Math.round(12 * boost)).setPosition(pill.x, pill.wordY).setVisible(true);
            }),
      ),
      call: text(hud, CALL_PX, 8).setOrigin(0.5).setVisible(false),
    };
    shownTick = -1;
  };

  let reduced = prefs().reduceMotion;
  let highContrast = prefs().highContrast;
  let callFrom = -CALL_TICKS;
  let callReduced = false;
  let shownTick = -1;
  const lines: string[][] = [['', '', ''], ['', '', '']];
  /** Live entrance flashes: centre, height, team, start tick, KO. */
  const flashes: { x: number; y: number; h: number; team: number; from: number; ko: boolean }[] = [];

  const red = (g: Phaser.GameObjects.Graphics, b: Bar, h: Hero): void => {
    if (h.dead || h.restCap <= h.hp) return;
    const [x0, x1] = redSpan(b, h);
    g.lineStyle(b.line - 2, highContrast ? RED_COLOR_HC : RED_COLOR, 1);
    for (const [a, z] of dashes(x0, x1, RED_DASH)) g.lineBetween(a, b.y, z, b.y);
  };

  /** The HUD, redrawn when the view tick moves (at most 50 times a second). */
  const drawHud = (g: Phaser.GameObjects.Graphics, texts: readonly Phaser.GameObjects.Text[][]): void => {
    read();
    g.clear();
    teams.forEach((t, team) => {
      if (t.length < 2) return;
      const main = mainBarOf(team);
      const active = t.find((h) => h.active);
      const bench = t.filter((h) => h !== active);
      if (active) {
        red(g, main, active);
        const frame = [main.minX - 2, main.y - 11, main.maxX - main.minX + 4, 22] as const;
        if (highContrast) g.lineStyle(3, 0xffffff, 1).strokeRect(...frame);
        else {
          // A dark rim under a thin ochre line, so the frame reads as an inlaid edge rather than a yellow outline.
          g.lineStyle(3, 0x0a0806, 0.85).strokeRect(...frame);
          g.lineStyle(1, GOLD, 0.9).strokeRect(...frame);
        }
      }
      bench.forEach((h, i) => { red(g, benchBarOf(team, i), h); });
      const bar = view.actionBar(team);
      const tag = tagReadout(bar ? bar.swapReadyTick - bar.tick : 0, !active || bench.every((h) => h.dead));
      if (team === 0) caption?.setVisible(tag.label !== 'NO TAG').setPosition(tagSlot.x, tagSlot.y - CAPTION_LIFT);
      // One line per bench row (an empty one if a hero is missing), so the texts keep their rows.
      const benchLines = Array.from({ length: t.length - 1 }, (_, i) => {
        const h = bench[i];
        return h ? benchLabel(h) : '';
      });
      const line = [active ? activeLabel(active.sprite) : '', ...benchLines, tag.label];
      const pill = tagPill(team, t.length - 1);
      const bx = pill.x;
      const tagY = pill.barY;
      // The cooldown bar fills as the tag comes back: dashed while it does, solid gold (white in high contrast) when ready.
      g.fillStyle(0x0a0806, 0.75).fillRect(bx, tagY, PILL_W, PILL_BAR_H);
      if (tag.fill >= 1) g.fillStyle(highContrast ? 0xffffff : GOLD, 0.85).fillRect(bx, tagY, PILL_W, PILL_BAR_H);
      else {
        g.lineStyle(PILL_BAR_H, highContrast ? 0xffffff : ASH, highContrast ? 0.9 : 0.6);
        for (const [x0, x1] of dashes(bx, bx + tag.fill * PILL_W, [5, 3])) g.lineBetween(x0, tagY + PILL_BAR_H / 2, x1, tagY + PILL_BAR_H / 2);
      }
      g.lineStyle(highContrast ? 2 : 1, highContrast ? 0xffffff : 0x6b6558, 1).strokeRect(bx, tagY, PILL_W, PILL_BAR_H);
      const prev = lines[team] ?? line;
      line.forEach((l, i) => {
        if (prev[i] !== l) texts[team]?.[i]?.setText(i === line.length - 1 ? pillWord(l) : l).setColor(i === line.length - 1 && tag.fill >= 1 ? '#c9b27a' : i ? '#e0e0e0' : '#ffffff');
      });
      lines[team] = line;
    });
  };

  function draw(): void {
    const now = view.tick;
    const call = parts?.call;
    if (parts && now !== shownTick) {
      shownTick = now;
      drawHud(parts.g, parts.texts);
    }
    const age = now - callFrom;
    if (call?.visible) {
      const pose = callPose(age, callReduced);
      if (age >= CALL_TICKS) call.setVisible(false);
      else call.setScale(pose.scale).setAlpha(pose.alpha);
    }
    fx.clear();
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      if (!f) continue;
      const t = now - f.from;
      if (t >= FLASH_TICKS) {
        flashes.splice(i, 1);
        continue;
      }
      const p = flashPose(t, f.h, reduced);
      const color = f.ko ? GOLD : 0xffffff;
      fx.fillStyle(0xffffff, p.core).fillCircle(f.x, f.y, f.h * 0.45);
      fx.lineStyle(7, 0x000000, p.alpha * 0.5).strokeCircle(f.x, f.y, p.ring);
      fx.lineStyle(f.ko ? 5 : 4, color, p.alpha).strokeCircle(f.x, f.y, p.ring);
      if (f.ko) fx.lineStyle(2, 0xffffff, p.alpha).strokeCircle(f.x, f.y, p.ring * 0.75);
      // The slide: speed lines from the team's own side closing in on the spot.
      const dir = f.team === 0 ? -1 : 1;
      for (let k = -1; k <= 1 && p.slide > 0; k++) {
        const x0 = f.x + dir * (p.slide + f.h * 0.3);
        fx.lineStyle(4, color, 0.8).lineBetween(x0, f.y + k * f.h * 0.25, x0 + dir * f.h * 0.6, f.y + k * f.h * 0.25);
      }
    }
  }

  const consume = (events: readonly SimEvent[]): void => {
    if (view.tick % 50 === 0) {
      const p = prefs();
      reduced = p.reduceMotion;
      highContrast = p.highContrast;
    }
    for (const e of events) {
      if (e.kind !== SimEventKind.tagIn) continue;
      const team = e['team'] ?? 0;
      let from = '';
      let to = '';
      let ko = false as boolean;
      const flash = { x: 0, y: 0, h: 0, team, from: view.tick, ko };
      view.forEachCharacter((c) => {
        if (c.id === e['from']) {
          from = c.sprite;
          // The outgoing hero is down: the death auto-swap's KO entrance.
          ko = (c.flags & EntityFlag.dead) !== 0;
        }
        if (c.id === e['to']) {
          to = c.sprite;
          Object.assign(flash, { x: c.x + c.w / 2, y: c.y + c.h / 2, h: c.h });
        }
      });
      flash.ko = ko;
      flashes.push(flash);
      flashes.splice(0, flashes.length - 4);
      callFrom = view.tick;
      callReduced = reduced;
      parts?.call.setText(callText(to, ko)).setColor(ko ? '#c9b27a' : '#ffffff').setPosition(teamX(team) + 320, CALL_Y).setVisible(true);
      say(tagLine(team, from, to, ko));
    }
    then?.(events);
  };

  const off = (): void => {
    arena.events.off('postupdate', draw).off('shutdown', off).off('destroy', off);
    hud.events.off('create', build).off('shutdown', off).off('destroy', off);
    states.delete(arena);
    for (const o of [fx, caption, parts?.g, parts?.call, ...(parts?.texts.flat() ?? [])]) o?.destroy();
    parts = undefined;
  };
  if (hud.sys.isActive()) build();
  else hud.events.once('create', build);
  arena.events.on('postupdate', draw);
  for (const s of [arena, hud]) s.events.once('shutdown', off).once('destroy', off);
  states.set(arena, () => {
    draw();
    return {
      lines: lines.map((l) => [...l]), call: parts?.call.visible ? parts.call.text : '', callScale: parts?.call.scaleX ?? 1,
      flashes: flashes.length, ko: flashes.some((f) => f.ko), caption: caption?.visible ? caption.text : '',
    };
  });
  return consume;
}
