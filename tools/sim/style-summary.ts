// Melee-vs-ranged style report (roster-24 plan section 2.5). Report-only until the end of roster batch B3, when the gates in
// tests/repo/balance-gate.test.ts become hard. Pure data in, plain numbers out: no sim imports, so run-match.ts can use it.
import { HERO_STYLE, type HeroStyle } from '../../src/core/data/hero-style';
import type { CharacterId } from '../../src/core/data/ids';

export const STYLES: readonly HeroStyle[] = ['melee', 'ranged'];

/** The style gates' target band for a style matchup, win rate in [0.45, 0.55]. */
export const STYLE_BAND = [0.45, 0.55] as const;
/** Maximum |mean melee - mean ranged| win rate, 1v1 and 2v2. */
export const MAX_STYLE_MEAN_GAP = 0.06;
/** Maximum gap between the melee trio and the ranged trio of one element. */
export const MAX_ELEMENT_STYLE_GAP = 0.1;

export interface StyleCell {
  readonly games: number;
  /** Score of the row style against the column style (draws count half). */
  readonly winRate: number;
}

export interface StyleSummary {
  readonly styles: readonly HeroStyle[];
  /** 2x2 win rates: `cells[row][col]` is the row style against the column style (M vs M, M vs R / R vs M, R vs R). */
  readonly cells: readonly (readonly StyleCell[])[];
  /** Melee against ranged (the cross-style head-to-head) with its standard error given the game count. */
  readonly crossMeleeVsRanged: { readonly games: number; readonly winRate: number; readonly stdErr: number };
  /** Mean per-hero tournament win rate by style, and the hero count of each style. */
  readonly meanWinRate: Readonly<Record<HeroStyle, number>>;
  readonly heroCount: Readonly<Record<HeroStyle, number>>;
  /** Per element: mean melee and mean ranged win rate of that element's heroes (absent when an element lacks a style). */
  readonly byElement: Readonly<Record<string, { readonly melee?: number; readonly ranged?: number; readonly gap?: number }>>;
  /** Style mix of the top 6 and bottom 6 heroes by win rate. */
  readonly top6: Readonly<Record<HeroStyle, number>>;
  readonly bottom6: Readonly<Record<HeroStyle, number>>;
  /** 2v2 only: win rate against the field of teams by composition (MM, MR, RR). */
  readonly compositions?: Readonly<Record<string, { readonly games: number; readonly winRate: number }>>;
}

export interface StylePairing {
  readonly a: string;
  readonly b: string;
  readonly matches: number;
  readonly winsA: number;
  readonly winsB: number;
  readonly draws: number;
}

export interface StyleRanking {
  readonly race: string;
  readonly element: string;
  readonly winRate: number;
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const rate = (score: number, games: number): number => (games === 0 ? 0 : r3(score / games));
const mean = (xs: readonly number[]): number => (xs.length === 0 ? 0 : r3(xs.reduce((a, b) => a + b, 0) / xs.length));

/** Style of a playable race; throws on a race HERO_STYLE does not list (a missing row must not count as melee). */
export function styleOfRace(race: string): HeroStyle {
  const style = HERO_STYLE[race as CharacterId];
  if (style === undefined) throw new Error(`styleOfRace: no HERO_STYLE row for race "${race}"`);
  return style;
}

/** Composition key of a team of heroes: M and R sorted, e.g. `MR`. */
export function compositionOf(team: readonly string[]): string {
  return team.map((r) => (styleOfRace(r) === 'melee' ? 'M' : 'R')).sort().join('');
}

/** `teamOf(race)` gives the heroes on the race's side (the lead and its partners); omit for 1v1. */
export function styleSummary(
  pairs: readonly StylePairing[],
  ranking: readonly StyleRanking[],
  teamOf?: (race: string) => readonly string[],
): StyleSummary {
  const idx = (s: HeroStyle): number => STYLES.indexOf(s);
  const acc = STYLES.map(() => STYLES.map(() => ({ games: 0, score: 0 })));
  const comp = new Map<string, { games: number; score: number }>();
  for (const p of pairs) {
    const sa = p.winsA + p.draws / 2;
    const sb = p.winsB + p.draws / 2;
    const ia = idx(styleOfRace(p.a));
    const ib = idx(styleOfRace(p.b));
    const ab = acc[ia]?.[ib];
    const ba = acc[ib]?.[ia];
    if (ab) {
      ab.games += p.matches;
      ab.score += sa;
    }
    if (ba) {
      ba.games += p.matches;
      ba.score += sb;
    }
    if (teamOf) {
      for (const [race, sc] of [[p.a, sa], [p.b, sb]] as const) {
        const k = compositionOf(teamOf(race));
        const c = comp.get(k) ?? { games: 0, score: 0 };
        c.games += p.matches;
        c.score += sc;
        comp.set(k, c);
      }
    }
  }
  const cells = acc.map((row) => row.map((c) => ({ games: c.games, winRate: rate(c.score, c.games) })));
  const cross = cells[0]?.[1] ?? { games: 0, winRate: 0 };
  const p = cross.winRate;
  const stdErr = cross.games === 0 ? 0 : r3(Math.sqrt((p * (1 - p)) / cross.games));
  const ratesOf = (s: HeroStyle, element?: string): number[] =>
    ranking.filter((r) => styleOfRace(r.race) === s && (element === undefined || r.element === element)).map((r) => r.winRate);
  const meanWinRate = { melee: mean(ratesOf('melee')), ranged: mean(ratesOf('ranged')) };
  const heroCount = { melee: ratesOf('melee').length, ranged: ratesOf('ranged').length };
  const byElement: Record<string, { melee?: number; ranged?: number; gap?: number }> = {};
  for (const el of [...new Set(ranking.map((r) => r.element))].sort()) {
    const m = ratesOf('melee', el);
    const r = ratesOf('ranged', el);
    byElement[el] = {
      ...(m.length > 0 ? { melee: mean(m) } : {}),
      ...(r.length > 0 ? { ranged: mean(r) } : {}),
      ...(m.length > 0 && r.length > 0 ? { gap: r3(mean(m) - mean(r)) } : {}),
    };
  }
  const mix = (rows: readonly StyleRanking[]): Record<HeroStyle, number> => ({
    melee: rows.filter((r) => styleOfRace(r.race) === 'melee').length,
    ranged: rows.filter((r) => styleOfRace(r.race) === 'ranged').length,
  });
  const sorted = [...ranking].sort((x, y) => y.winRate - x.winRate || x.race.localeCompare(y.race));
  return {
    styles: STYLES,
    cells,
    crossMeleeVsRanged: { games: cross.games, winRate: cross.winRate, stdErr },
    meanWinRate,
    heroCount,
    byElement,
    top6: mix(sorted.slice(0, 6)),
    bottom6: mix(sorted.slice(-6)),
    ...(teamOf
      ? {
          compositions: Object.fromEntries(
            [...comp].sort(([x], [y]) => x.localeCompare(y)).map(([k, c]) => [k, { games: c.games, winRate: rate(c.score, c.games) }]),
          ),
        }
      : {}),
  };
}

const pct = (x: number): string => `${(x * 100).toFixed(1)}%`;

export function formatStyleSummary(s: StyleSummary): string {
  const w = 9;
  const lines = [
    'Style matrix (win rate of the row style):',
    ['row vs col'.padEnd(12), ...s.styles.map((x) => x.padStart(w))].join(''),
    ...s.styles.map((x, i) => [x.padEnd(12), ...(s.cells[i] ?? []).map((c) => pct(c.winRate).padStart(w))].join('')),
    `melee vs ranged ${pct(s.crossMeleeVsRanged.winRate)} (+-${pct(s.crossMeleeVsRanged.stdErr * 2)} at 2 standard errors, ${String(s.crossMeleeVsRanged.games)} games)`,
    `mean win rate: melee ${s.meanWinRate.melee.toFixed(3)} (${String(s.heroCount.melee)} heroes), ranged ${s.meanWinRate.ranged.toFixed(3)} (${String(s.heroCount.ranged)} heroes)`,
    `top 6: ${String(s.top6.melee)} melee, ${String(s.top6.ranged)} ranged; bottom 6: ${String(s.bottom6.melee)} melee, ${String(s.bottom6.ranged)} ranged`,
    ...Object.entries(s.byElement).map(
      ([el, v]) => `  ${el.padEnd(7)} melee ${v.melee === undefined ? 'n/a' : v.melee.toFixed(3)}, ranged ${v.ranged === undefined ? 'n/a' : v.ranged.toFixed(3)}`,
    ),
    ...(s.compositions ? Object.entries(s.compositions).map(([k, c]) => `  team ${k} vs field ${pct(c.winRate)} (${String(c.games)} games)`) : []),
  ];
  return lines.join('\n');
}

/** Delta lines of the style headline numbers, for `balance:compare` (a note when the baseline has no `styleSummary`). */
export function formatStyleDeltas(base: StyleSummary | undefined, cur: StyleSummary): string {
  if (!base) return 'style: no styleSummary in the baseline (record one with balance:record)';
  const d = (a: number, b: number): string => `${b - a >= 0 ? '+' : ''}${((b - a) * 100).toFixed(1)}pp`;
  return [
    `style melee mean ${base.meanWinRate.melee.toFixed(3)} -> ${cur.meanWinRate.melee.toFixed(3)} (${d(base.meanWinRate.melee, cur.meanWinRate.melee)}), ranged mean ${base.meanWinRate.ranged.toFixed(3)} -> ${cur.meanWinRate.ranged.toFixed(3)} (${d(base.meanWinRate.ranged, cur.meanWinRate.ranged)})`,
    `style melee vs ranged ${pct(base.crossMeleeVsRanged.winRate)} -> ${pct(cur.crossMeleeVsRanged.winRate)} (${d(base.crossMeleeVsRanged.winRate, cur.crossMeleeVsRanged.winRate)}) (report only)`,
  ].join('\n');
}

/** Report-only evaluation of the section 2.5 gates that need no per-hero cast data; each entry is a sentence for the log. */
export function styleGateFindings(s: StyleSummary): string[] {
  const out: string[] = [];
  const band = (x: number): boolean => x >= STYLE_BAND[0] && x <= STYLE_BAND[1];
  const c = s.crossMeleeVsRanged;
  if (c.winRate - 2 * c.stdErr > STYLE_BAND[1] || c.winRate + 2 * c.stdErr < STYLE_BAND[0]) {
    out.push(`melee vs ranged ${pct(c.winRate)} is outside 45-55% at 2 standard errors`);
  }
  const gap = Math.abs(s.meanWinRate.melee - s.meanWinRate.ranged);
  if (gap > MAX_STYLE_MEAN_GAP + 1e-9) out.push(`mean style gap ${gap.toFixed(3)} exceeds ${String(MAX_STYLE_MEAN_GAP)}`);
  for (const [el, v] of Object.entries(s.byElement)) {
    if (v.gap !== undefined && Math.abs(v.gap) > MAX_ELEMENT_STYLE_GAP + 1e-9) {
      out.push(`${el}: melee vs ranged trio gap ${v.gap.toFixed(3)} exceeds ${String(MAX_ELEMENT_STYLE_GAP)}`);
    }
  }
  for (const [k, v] of Object.entries(s.compositions ?? {})) if (!band(v.winRate)) out.push(`team ${k} vs field ${pct(v.winRate)} is outside 45-55%`);
  if (s.top6.melee === 0 || s.top6.ranged === 0) out.push('top 6 heroes are all one style');
  if (s.bottom6.melee === 0 || s.bottom6.ranged === 0) out.push('bottom 6 heroes are all one style');
  return out;
}
