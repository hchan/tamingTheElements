// Fun metrics (docs/FUN-DESIGN.md section 4): a pure reducer over sim events. No sim access, so it measures bot matches,
// golden replays and playtest replays alike. Only metrics the shipped Arcade events can produce are computed.
import { SimEventKind } from '../../src/core/sim/events';
import type { SimEvent } from '../../src/core/sim/events';

/** Arcade event kinds the reducer reads beyond `SimEventKind` (docs/FUN-DESIGN.md 2.1 table). */
const K = { guarded: 43, parried: 44, dashed: 46, perfectDodge: 47, clash: 48, superStarted: 50, tagIn: 52, fight: 54 } as const;

export const TICKS_PER_SECOND = 50;

export interface FunMatchMeta {
  /** Ticks simulated. */
  readonly ticks: number;
  readonly endReason: 'ko' | 'timeout' | 'stalemate';
  /** Team (0 or 1) of an entity id; used to split hits by side. */
  readonly teamOf: (entityId: number) => number;
}

export interface FunMetrics {
  readonly seconds: number;
  readonly endReason: FunMatchMeta['endReason'];
  /** Seconds from the fight start (tick 0 until the Arcade `fight` event exists) to the first `hitConfirmed`; null if none. */
  readonly firstHitSeconds: number | null;
  readonly hits: number;
  readonly counterHits: number;
  /** `comboEnded.hits` of every combo. */
  readonly comboHits: readonly number[];
  readonly maxCombo: number;
  /** Damage by `hitConfirmed.ability` (an ABILITY_DEFS index), both sides pooled. */
  readonly damageByAbility: Readonly<Record<string, number>>;
  /** `1 / sum(p^2)` over the damage share by ability, 0 without damage. */
  readonly diversity: number;
  /** Largest damage share of one ability. */
  readonly topSourceShare: number;
  /** Sign changes of the cumulative damage difference between the sides. */
  readonly leadChanges: number;
  /** `recovered` by reason: stun ended, juggle cap, stun cap. */
  readonly recovered: readonly [number, number, number];
  /** Counts of the rest of the Arcade kinds (zero until their work packages land). */
  readonly dashes: number;
  readonly tags: number;
  readonly supers: number;
  readonly clashes: number;
  readonly defence: number;
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export function reduceFunMetrics(events: Iterable<SimEvent>, meta: FunMatchMeta): FunMetrics {
  let fightTick = 0;
  let firstHit: number | null = null;
  let hits = 0;
  let counters = 0;
  const combos: number[] = [];
  const dmg: Record<string, number> = {};
  const recovered: [number, number, number] = [0, 0, 0];
  const count = { dashes: 0, tags: 0, supers: 0, clashes: 0, defence: 0 };
  let diff = 0; // damage dealt by team 0 minus team 1
  let lead = 0;
  let leadChanges = 0;
  for (const e of events) {
    const kind: number = e.kind; // wider than SimEventKindValue: the Arcade kinds are not all in the enum yet
    switch (kind) {
      case K.fight:
        fightTick = e.tick;
        break;
      case SimEventKind.hitConfirmed: {
        hits++;
        if ((e['counter'] ?? 0) !== 0) counters++;
        firstHit ??= e.tick;
        const key = String(e['ability'] ?? -1);
        const amount = e['amount'] ?? 0;
        dmg[key] = (dmg[key] ?? 0) + amount;
        diff += meta.teamOf(e['attacker'] ?? 0) === 0 ? amount : -amount;
        const sign = Math.sign(diff);
        if (sign !== 0) {
          if (lead !== 0 && sign !== lead) leadChanges++;
          lead = sign;
        }
        break;
      }
      case SimEventKind.comboEnded:
        combos.push(e['hits'] ?? 0);
        break;
      case SimEventKind.recovered: {
        const reason = e['reason'] ?? 0;
        if (reason >= 0 && reason <= 2) recovered[reason as 0 | 1 | 2]++;
        break;
      }
      case K.dashed:
        count.dashes++;
        break;
      case K.tagIn:
        count.tags++;
        break;
      case K.superStarted:
        count.supers++;
        break;
      case K.clash:
        count.clashes++;
        break;
      case K.guarded:
      case K.parried:
      case K.perfectDodge:
        count.defence++;
        break;
      default:
    }
  }
  const total = Object.values(dmg).reduce((x, y) => x + y, 0);
  const shares = Object.values(dmg).map((v) => (total === 0 ? 0 : v / total));
  const sq = shares.reduce((x, p) => x + p * p, 0);
  return {
    seconds: r3(meta.ticks / TICKS_PER_SECOND),
    endReason: meta.endReason,
    firstHitSeconds: firstHit === null ? null : r3((firstHit - fightTick) / TICKS_PER_SECOND),
    hits,
    counterHits: counters,
    comboHits: combos,
    maxCombo: combos.reduce((m, h) => Math.max(m, h), 0),
    damageByAbility: Object.fromEntries(Object.entries(dmg).map(([k, v]) => [k, r3(v)])),
    diversity: sq === 0 ? 0 : r3(1 / sq),
    topSourceShare: r3(shares.reduce((m, p) => Math.max(m, p), 0)),
    leadChanges,
    recovered,
    ...count,
  };
}

export interface FunSummary {
  readonly matches: number;
  readonly stalemateRate: number;
  readonly timeoutRate: number;
  readonly medianSeconds: number;
  readonly p10Seconds: number;
  readonly p90Seconds: number;
  readonly medianFirstHitSeconds: number;
  readonly medianComboHits: number;
  readonly p90ComboHits: number;
  readonly maxComboHits: number;
  readonly medianDiversity: number;
  readonly maxTopSourceShare: number;
  readonly medianLeadChanges: number;
  readonly counterHitRate: number;
  readonly jugglecapRecoveries: number;
  readonly stuncapRecoveries: number;
  readonly dashes: number;
  readonly tags: number;
  readonly supers: number;
  readonly clashes: number;
  readonly defence: number;
}

/** Pools per-match metrics into the section 4 table values (medians and percentiles over matches or combos). */
export function summarizeFun(list: readonly FunMetrics[]): FunSummary {
  const n = list.length;
  const rate = (f: (m: FunMetrics) => boolean): number => (n === 0 ? 0 : r3(list.filter(f).length / n));
  const sum = (f: (m: FunMetrics) => number): number => list.reduce((x, m) => x + f(m), 0);
  const hits = sum((m) => m.hits);
  const combos = list.flatMap((m) => m.comboHits);
  return {
    matches: n,
    stalemateRate: rate((m) => m.endReason === 'stalemate'),
    timeoutRate: rate((m) => m.endReason === 'timeout'),
    medianSeconds: percentile(list.map((m) => m.seconds), 0.5),
    p10Seconds: percentile(list.map((m) => m.seconds), 0.1),
    p90Seconds: percentile(list.map((m) => m.seconds), 0.9),
    medianFirstHitSeconds: percentile(list.flatMap((m) => (m.firstHitSeconds === null ? [] : [m.firstHitSeconds])), 0.5),
    medianComboHits: percentile(combos, 0.5),
    p90ComboHits: percentile(combos, 0.9),
    maxComboHits: combos.reduce((m, h) => Math.max(m, h), 0),
    medianDiversity: percentile(list.map((m) => m.diversity), 0.5),
    maxTopSourceShare: list.reduce((m, x) => Math.max(m, x.topSourceShare), 0),
    medianLeadChanges: percentile(list.map((m) => m.leadChanges), 0.5),
    counterHitRate: hits === 0 ? 0 : r3(sum((m) => m.counterHits) / hits),
    jugglecapRecoveries: sum((m) => m.recovered[1]),
    stuncapRecoveries: sum((m) => m.recovered[2]),
    dashes: sum((m) => m.dashes),
    tags: sum((m) => m.tags),
    supers: sum((m) => m.supers),
    clashes: sum((m) => m.clashes),
    defence: sum((m) => m.defence),
  };
}
