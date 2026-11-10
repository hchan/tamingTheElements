// Fun metrics (docs/FUN-DESIGN.md section 4): a pure reducer over sim events. No sim access, so it measures bot matches,
// golden replays and playtest replays alike. Only metrics the shipped Arcade events can produce are computed.
import { SimEventKind } from '../../src/core/sim/events';
import type { SimEvent } from '../../src/core/sim/events';

/** Arcade event kinds the reducer reads beyond `SimEventKind` (docs/FUN-DESIGN.md 2.1 table). */
const K = { guarded: 43, parried: 44, dashed: 46, perfectDodge: 47, clash: 48, tagIn: 52, weatherChanged: 59 } as const;

export const TICKS_PER_SECOND = 50;

export interface FunMatchMeta {
  /** Ticks simulated. */
  readonly ticks: number;
  readonly endReason: 'ko' | 'timeout' | 'stalemate';
  /** Team (0 or 1) of an entity id; used to split hits by side. */
  readonly teamOf: (entityId: number) => number;
  /** True when the character entity charges weather by casting (ranged primary), false when by walking (WP 35). */
  readonly rangedOf?: (entityId: number) => boolean;
}

export interface FunMetrics {
  readonly seconds: number;
  readonly endReason: FunMatchMeta['endReason'];
  /** Seconds from the first fight start (`fight`, else tick 0) to the first `hitConfirmed`; null if none. */
  readonly firstHitSeconds: number | null;
  /** Per round (FUN-DESIGN 2.10): seconds from `fight` to its first `hitConfirmed` (rounds without a hit are left out). */
  readonly roundFirstHitSeconds: readonly number[];
  /** Per finished round: seconds of `W.tick` from `fight` to `roundEnded`. */
  readonly roundSeconds: readonly number[];
  /** Rounds that ended in `timeOver`, and KOs with the winner at full HP. */
  readonly timeOvers: number;
  readonly perfects: number;
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
  /** The `defence` split: `guarded`, `parried` and `perfectDodge`; and `weatherChanged` (weather casts). */
  readonly guards: number;
  readonly parries: number;
  readonly dodges: number;
  readonly weathers: number;
  /** Seconds from `fight` to the first weather cast of each round, by the caster's kind (WP 35: ranged / melee). */
  readonly firstWeatherRanged: readonly number[];
  readonly firstWeatherMelee: readonly number[];
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

export function reduceFunMetrics(events: Iterable<SimEvent>, meta: FunMatchMeta): FunMetrics {
  let fightTick = 0;
  let firstFight: number | null = null;
  let firstHit: number | null = null;
  let roundHit = false;
  let roundWeather = false;
  const firstWeather: [number[], number[]] = [[], []];
  const roundFirstHits: number[] = [];
  const roundSeconds: number[] = [];
  let timeOvers = 0;
  let perfects = 0;
  let hits = 0;
  let counters = 0;
  const combos: number[] = [];
  const dmg: Record<string, number> = {};
  const recovered: [number, number, number] = [0, 0, 0];
  const count = { dashes: 0, tags: 0, supers: 0, clashes: 0, defence: 0, guards: 0, parries: 0, dodges: 0, weathers: 0 };
  let diff = 0; // damage dealt by team 0 minus team 1
  let lead = 0;
  let leadChanges = 0;
  for (const e of events) {
    const kind: number = e.kind; // wider than SimEventKindValue: the Arcade kinds are not all in the enum yet
    switch (kind) {
      case SimEventKind.fight:
        fightTick = e.tick;
        firstFight ??= e.tick;
        roundHit = false;
        roundWeather = false;
        break;
      case SimEventKind.roundEnded:
        roundSeconds.push(r3((e.tick - fightTick) / TICKS_PER_SECOND));
        break;
      case SimEventKind.timeOver:
        timeOvers++;
        break;
      case SimEventKind.ko:
        if ((e['perfect'] ?? 0) !== 0) perfects++;
        break;
      case SimEventKind.hitConfirmed: {
        hits++;
        if ((e['counter'] ?? 0) !== 0) counters++;
        firstHit ??= e.tick;
        if (!roundHit) roundFirstHits.push(r3((e.tick - fightTick) / TICKS_PER_SECOND));
        roundHit = true;
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
      case SimEventKind.superStarted:
        count.supers++;
        break;
      case K.clash:
        count.clashes++;
        break;
      case K.guarded:
        count.defence++;
        count.guards++;
        break;
      case K.parried:
        count.defence++;
        count.parries++;
        break;
      case K.perfectDodge:
        count.defence++;
        count.dodges++;
        break;
      case K.weatherChanged:
        count.weathers++;
        if (!roundWeather) firstWeather[meta.rangedOf?.(e.sourceId) === true ? 0 : 1].push(r3((e.tick - fightTick) / TICKS_PER_SECOND));
        roundWeather = true;
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
    firstHitSeconds: firstHit === null ? null : r3((firstHit - (firstFight ?? 0)) / TICKS_PER_SECOND),
    roundFirstHitSeconds: roundFirstHits,
    roundSeconds,
    timeOvers,
    perfects,
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
    firstWeatherRanged: firstWeather[0],
    firstWeatherMelee: firstWeather[1],
  };
}

export interface FunSummary {
  readonly matches: number;
  readonly stalemateRate: number;
  readonly timeoutRate: number;
  readonly medianSeconds: number;
  readonly p10Seconds: number;
  readonly p90Seconds: number;
  /** Over every round's first hit (FUN-DESIGN section 4 "first-hit time"). */
  readonly medianFirstHitSeconds: number;
  /** Rounds played to the end, their length (`fight` to `roundEnded`), and the share that ended in `timeOver`. */
  readonly rounds: number;
  readonly medianRoundSeconds: number;
  readonly p10RoundSeconds: number;
  readonly p90RoundSeconds: number;
  readonly timeOverRate: number;
  readonly perfects: number;
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
  readonly guards: number;
  readonly parries: number;
  readonly dodges: number;
  readonly weathers: number;
  /** Median seconds into a round of the first weather cast, by caster kind (0 with no cast). */
  readonly medianFirstWeatherRanged: number;
  readonly medianFirstWeatherMelee: number;
}

/** Pools per-match metrics into the section 4 table values (medians and percentiles over matches or combos). */
export function summarizeFun(list: readonly FunMetrics[]): FunSummary {
  const n = list.length;
  const rate = (f: (m: FunMetrics) => boolean): number => (n === 0 ? 0 : r3(list.filter(f).length / n));
  const sum = (f: (m: FunMetrics) => number): number => list.reduce((x, m) => x + f(m), 0);
  const hits = sum((m) => m.hits);
  const combos = list.flatMap((m) => m.comboHits);
  const roundTimes = list.flatMap((m) => m.roundSeconds);
  return {
    matches: n,
    stalemateRate: rate((m) => m.endReason === 'stalemate'),
    timeoutRate: rate((m) => m.endReason === 'timeout'),
    medianSeconds: percentile(list.map((m) => m.seconds), 0.5),
    p10Seconds: percentile(list.map((m) => m.seconds), 0.1),
    p90Seconds: percentile(list.map((m) => m.seconds), 0.9),
    medianFirstHitSeconds: percentile(list.flatMap((m) => m.roundFirstHitSeconds), 0.5),
    rounds: roundTimes.length,
    medianRoundSeconds: percentile(roundTimes, 0.5),
    p10RoundSeconds: percentile(roundTimes, 0.1),
    p90RoundSeconds: percentile(roundTimes, 0.9),
    timeOverRate: roundTimes.length === 0 ? 0 : r3(sum((m) => m.timeOvers) / roundTimes.length),
    perfects: sum((m) => m.perfects),
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
    guards: sum((m) => m.guards),
    parries: sum((m) => m.parries),
    dodges: sum((m) => m.dodges),
    weathers: sum((m) => m.weathers),
    medianFirstWeatherRanged: percentile(list.flatMap((m) => m.firstWeatherRanged), 0.5),
    medianFirstWeatherMelee: percentile(list.flatMap((m) => m.firstWeatherMelee), 0.5),
  };
}
