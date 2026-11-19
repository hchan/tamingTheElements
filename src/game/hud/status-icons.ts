import type { Element, RenderView } from '@core/index';
import { SNAG_IMMUNE_TICKS, SNAG_ROOT_TICKS, StatusId, TRAP_PUDDLE_LINGER_TICKS, WEATHER_ELEMENTS, WEATHER_TICKS } from '@core/index';
import { buffColor, elapsedFraction } from './buffs';
import { mainBar } from './bars';

/**
 * Arcade status chips (ideas/brainstorm/health-bar-status-icons): every buff and debuff on a hero as one small chip under its
 * health bar. Pure (no Phaser) and read-only: it reads statuses, the Arcade read-outs, the weather and the elemental buff
 * from the RenderView and invents nothing the sim does not already expose. A chip is a shape (plus for a buff, cross for a
 * debuff), a short word and the seconds left, so it never relies on colour; the time bar under it drains as the effect runs out.
 */

/** Sim ticks per second (docs/DETERMINISM.md: a fixed 50 Hz step). */
export const TICKS_PER_SEC = 50;
export const CHIP_W = 96;
export const CHIP_H = 16;
export const CHIP_GAP = 3;
/** Under the HUD block (100 px tall), clear of the meter row (y 124) and left of the (touch/phone) combo counter slot; desktop counters sit over the foe and treat chips as a ceiling. */
export const CHIP_Y = 70;
/** Chips shown per side; the rest fold into one `+N` chip. */
export const CHIP_MAX = 6;

/**
 * Where and how big the chips are drawn. `scale` multiplies the chip box (the scene passes `16 * phoneBoost / 12`, so the word is
 * 16 px or larger on a phone, never the fixed 12 px); `top` is the y of the first row (below the hero's health words);
 * chips wrap to a new row at the bar's right end, so a scaled row never runs into the opposite side's block.
 */
export interface ChipLayout {
  readonly scale: number;
  readonly top: number;
  /** Chips shown per side instead of CHIP_MAX (portrait phone play: 2). When set, the chips are also sorted: stun and snag first. */
  readonly max?: number;
  /** Chips per row instead of as many as fit the bar (portrait phone play: 1, so a stack under the name never reaches the bench portrait). */
  readonly perRow?: number;
  /** Chips end at the bar's right end instead of starting at its left (the right-hand side in portrait phone play, under its name line and clear of the bench chip). */
  readonly alignRight?: boolean;
}
/** Chips per fighter in portrait play (one chip plus `+N more` when there are more than this). */
export const PORTRAIT_CHIP_MAX = 2;

/** Sort rank under a cap: stun and snag first, then hostile, then friendly, weather and the elemental buff last. */
function chipRank(r: { key: string; hostile: boolean }): number {
  if (r.key === 'stun' || r.key === 'root') return 0;
  if (r.key === 'weather' || r.key === 'elem') return 3;
  return r.hostile ? 1 : 2;
}
export const DEFAULT_CHIP_LAYOUT: ChipLayout = { scale: 1, top: CHIP_Y };
/** Font px of the chip word at layout scale 1 (the chip box is sized for it). */
export const CHIP_FONT = 12;

export type ChipGlyph = 'plus' | 'cross';

export interface StatusChip {
  /** Stable key: `s<StatusId>`, `root`, `stun`, `guard`, `safe`, `weather`, `elem` or `more`. */
  readonly key: string;
  /** The word on the chip (never colour alone), e.g. `ADREN`. */
  readonly label: string;
  readonly hostile: boolean;
  readonly glyph: ChipGlyph;
  /** Whole seconds left (rounded up), or null for a state with no timer (Snag root, stun, guard). */
  readonly secs: number | null;
  /** 0..1 of the effect still to run, or 1 when it has no timer; drives the draining bar. */
  readonly remaining: number;
  readonly x: number;
  readonly y: number;
  /** Box size after the layout scale. */
  readonly w: number;
  readonly h: number;
  readonly color: number;
  /** Text drawn on the chip: glyph, word and time, e.g. `▲ ADREN 12s`. */
  readonly text: string;
}

/** Line-segment icons (x0, y0, x1, y1, ... in -1..1) for the crowd-control chips, drawn like `ROOT_ICON` in status-fx.ts. */
/** Stun: a broken ring (two arcs with a gap, as four chords). */
export const STUN_ICON: readonly number[] = [-0.9, 0.2, -0.6, -0.6, -0.6, -0.6, 0.1, -0.9, 0.9, -0.2, 0.6, 0.6, 0.6, 0.6, -0.1, 0.9];
/** Mire: three blobs (short ticks) over a line. */
export const MIRE_ICON: readonly number[] = [-0.8, 0.5, 0.8, 0.5, -0.7, -0.1, -0.5, -0.1, -0.1, -0.5, 0.1, -0.5, 0.5, -0.1, 0.7, -0.1];
/** Snag-safe: an open root cross (the Snag cross with its middle missing). */
export const SNAG_SAFE_ICON: readonly number[] = [-0.9, -0.5, -0.3, -0.15, 0.3, 0.15, 0.9, 0.5, 0.9, -0.5, 0.3, -0.15, -0.3, 0.15, -0.9, 0.5];
/** Dazed: a spiral of three turning chords. */
export const DAZE_ICON: readonly number[] = [0, 0, 0.5, 0, 0.5, 0, 0.5, -0.5, 0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.8, -0.5, 0.8, 0.9, 0.8];
/** Iced: a snowflake (three crossing lines). */
export const ICED_ICON: readonly number[] = [0, -0.9, 0, 0.9, -0.8, -0.45, 0.8, 0.45, -0.8, 0.45, 0.8, -0.45];
/** Downed: a figure lying down (a long body line and a head tick) over the ground. */
export const DOWN_ICON: readonly number[] = [-0.9, 0.3, 0.5, 0.3, 0.5, 0.3, 0.8, -0.2, -0.9, 0.7, 0.9, 0.7];
/** Silenced: a bar struck through a speaker's mouth (a box with a slash). */
export const SILENCE_ICON: readonly number[] = [-0.7, -0.3, -0.7, 0.3, -0.7, 0.3, -0.2, 0.3, -0.2, 0.3, 0.3, 0.7, 0.3, 0.7, 0.3, -0.7, 0.3, -0.7, -0.2, -0.3, -0.2, -0.3, -0.7, -0.3, -0.9, 0.9, 0.9, -0.9];
/** Icon per chip key for the states above (`s<StatusId>` for the crowd-control statuses). */
export const CC_ICONS: Readonly<Record<string, readonly number[]>> = {
  stun: STUN_ICON, mire: MIRE_ICON, nosnag: SNAG_SAFE_ICON,
  [`s${String(StatusId.dazed)}`]: DAZE_ICON, [`s${String(StatusId.iced)}`]: ICED_ICON,
  [`s${String(StatusId.downed)}`]: DOWN_ICON, [`s${String(StatusId.silenced)}`]: SILENCE_ICON,
};

/** Short word per timed status; the debuffs (Tornado, Ice Blast, tidal slow) match `isHostile` in buffs.ts. */
const STATUS_WORD: Readonly<Record<number, string>> = {
  [StatusId.adrenaline]: 'ADREN',
  [StatusId.fireDance]: 'DANCE',
  [StatusId.rockArmour]: 'STONE',
  [StatusId.translucent]: 'FADE',
  [StatusId.tornado]: 'FREEZE',
  [StatusId.iceBlast]: 'SLOW',
  [StatusId.superSpeed]: 'SPEED',
  [StatusId.superArmour]: 'ARMOR',
  [StatusId.superSlow]: 'TIDE',
  // Crowd control (flag withCrowdControl; these statuses never exist with it off).
  [StatusId.dazed]: 'DAZED',
  [StatusId.iced]: 'ICED',
  [StatusId.downed]: 'DOWN',
  [StatusId.silenced]: 'SILENCED',
};
const HOSTILE_STATUS: ReadonlySet<number> = new Set([StatusId.tornado, StatusId.iceBlast, StatusId.superSlow, StatusId.dazed, StatusId.iced, StatusId.downed, StatusId.silenced]);

/** By `Weather` kind - 1: the word on the chip. */
const WEATHER_WORD: readonly string[] = ['SUN', 'RAIN', 'SAND', 'GALE', 'ECLIPSE'];

/** Seconds left for `ticks` game ticks, rounded up so a running effect never shows 0s. */
export function secsLeft(ticks: number): number {
  return Math.max(0, Math.ceil(ticks / TICKS_PER_SEC));
}

/** The chip text: `▲ ADREN 12s` for a buff, `▼ SLOW 3s` for a debuff, no time for a state without one. */
export function chipText(label: string, hostile: boolean, secs: number | null): string {
  return `${hostile ? '▼' : '▲'} ${label}${secs === null ? '' : ` ${String(secs)}s`}`;
}

/**
 * The weather's effect on a hero of `element` (FUN-DESIGN 2.14): +20% damage dealt for the favoured element (a buff),
 * -17% for the counter element (a debuff), nothing for the rest. Eclipse favours void only.
 */
export function weatherEffect(kind: number, element: Element): 'favoured' | 'countered' | undefined {
  const row = WEATHER_ELEMENTS[kind - 1];
  if (!row) return undefined;
  if (row[0] === element) return 'favoured';
  return row[1] === element ? 'countered' : undefined;
}

interface Raw {
  readonly key: string;
  readonly label: string;
  readonly hostile: boolean;
  readonly ticksLeft: number | null;
  readonly remaining: number;
}

/**
 * The chips for the active hero `id` of `team` whose element is `element`, left to right from its bar's start, at most
 * CHIP_MAX (the overflow is one `+N` chip). `stunTotal` is the game ticks the current hit-stun started with (the Hud latches it; 0: unknown, the stun bar then stays full). Timed statuses use the game clock (the Arcade clock stops during hit-stop).
 */
export function collectStatusChips(view: RenderView, team: number, id: number, element: Element, xOffset: number, highContrast = false, layout: ChipLayout = DEFAULT_CHIP_LAYOUT, stunTotal = 0): StatusChip[] {
  const raw: Raw[] = [];
  const bar = view.actionBar(team);
  const clock = bar?.tick ?? view.tick;
  view.forEachStatus(id, (st) => {
    const word = STATUS_WORD[st.id];
    if (word === undefined) return;
    raw.push({ key: `s${String(st.id)}`, label: word, hostile: HOSTILE_STATUS.has(st.id), ticksLeft: Math.max(0, st.expireTick - clock), remaining: 1 - elapsedFraction(clock, st.startTick, st.expireTick) });
  });
  const ar = view.arcade();
  if (ar) {
    const unit = (left: number, total: number): number => Math.min(1, Math.max(0, left / total));
    if (ar.rooted(id)) {
      const left = ar.rootLeft(id);
      raw.push({ key: 'root', label: 'SNAGGED', hostile: true, ticksLeft: left, remaining: unit(left, SNAG_ROOT_TICKS) });
    } else if (ar.rootImmuneLeft(id) > 0) {
      const left = ar.rootImmuneLeft(id);
      raw.push({ key: 'nosnag', label: 'NO SNAG', hostile: false, ticksLeft: left, remaining: unit(left, SNAG_IMMUNE_TICKS) });
    }
    if (ar.stunned(id)) raw.push({ key: 'stun', label: 'STUN', hostile: true, ticksLeft: null, remaining: stunTotal > 0 ? unit(ar.stunLeft(id), stunTotal) : 1 });
    if (ar.mireLeft(id) > 0) raw.push({ key: 'mire', label: 'MIRED', hostile: true, ticksLeft: ar.mireLeft(id), remaining: unit(ar.mireLeft(id), TRAP_PUDDLE_LINGER_TICKS) });
    if (ar.guarding(id)) raw.push({ key: 'guard', label: 'GUARD', hostile: false, ticksLeft: null, remaining: 1 });
    if (ar.invulnerable(id) && !ar.stunned(id)) raw.push({ key: 'safe', label: 'SAFE', hostile: false, ticksLeft: null, remaining: 1 });
    const effect = ar.weather > 0 ? weatherEffect(ar.weather, element) : undefined;
    if (effect !== undefined && ar.weatherLeft > 0) {
      // The centre badge already counts the seconds, so this chip says only what the weather does to this hero (qa-r30 duplication).
      const word = ar.weather === 5 ? 'ECLIP' : (WEATHER_WORD[ar.weather - 1] ?? 'WEATHER');
      raw.push({ key: 'weather', label: `${word} ${effect === 'countered' ? '-17%' : '+20%'}`, hostile: effect === 'countered', ticksLeft: null, remaining: Math.min(1, ar.weatherLeft / WEATHER_TICKS) });
    }
  }
  const elem = bar?.elemental;
  if (elem && elem.activeUntil > clock) {
    raw.push({ key: 'elem', label: elem.name.toUpperCase(), hostile: false, ticksLeft: elem.activeUntil - clock, remaining: 1 });
  }
  const { minX, maxX } = mainBar(xOffset);
  const w = Math.round(CHIP_W * layout.scale);
  const h = Math.round(CHIP_H * layout.scale);
  const gap = Math.round(CHIP_GAP * layout.scale);
  const perRow = layout.perRow ?? Math.max(1, Math.floor((maxX - minX + gap) / (w + gap)));
  const place = (i: number): { x: number; y: number } => ({ x: layout.alignRight ? maxX - w - (i % perRow) * (w + gap) : minX + (i % perRow) * (w + gap), y: layout.top + Math.floor(i / perRow) * (h + gap) });
  const cap = layout.max ?? CHIP_MAX;
  if (layout.max !== undefined) {
    const ranked = raw.map((r, i) => ({ r, i })).sort((a, b) => chipRank(a.r) - chipRank(b.r) || a.i - b.i);
    raw.splice(0, raw.length, ...ranked.map((e) => e.r));
  }
  const shown = raw.length > cap ? raw.slice(0, cap - 1) : raw;
  const out: StatusChip[] = shown.map((r, i) => {
    const secs = r.ticksLeft === null ? null : secsLeft(r.ticksLeft);
    return {
      key: r.key,
      label: r.label,
      hostile: r.hostile,
      glyph: r.hostile ? 'cross' : 'plus',
      secs,
      remaining: r.remaining,
      ...place(i),
      w,
      h,
      color: buffColor(r.hostile, highContrast),
      text: chipText(r.label, r.hostile, secs),
    };
  });
  if (raw.length > cap) {
    out.push({ key: 'more', label: 'MORE', hostile: false, glyph: 'plus', secs: null, remaining: 1, ...place(out.length), w, h, color: buffColor(false, highContrast), text: `+${String(raw.length - shown.length)} more` });
  }
  return out;
}
