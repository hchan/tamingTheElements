import { LockstepSession, type LockstepOptions } from '../../core/net/session';
import type { Command } from '../../core/sim/commands';
import { hash } from '../../core/sim/hash';
import { createMatch, type MatchSetup } from '../../core/sim/match';
import { hasEnded } from '../../core/sim/systems/end';
import { step } from '../../core/sim/step';
import type { SimWorld } from '../../core/sim/world';
import { rleDecode } from '../../core/replay/rle';
import { recordBotMatch } from '../../core/replay/record-bots';
import { createFakePair, type FakeNetwork, type NetConditions } from './fake-transport';

export type Script = readonly [readonly Command[], readonly Command[]];

/** Bot-vs-bot command scripts, indexed by tick. Network independent, so every run feeds the same commands. */
export function botScripts(setup: MatchSetup, ticks: number): Script {
  const r = recordBotMatch(setup, ticks);
  return [rleDecode(r.inputs[0]), rleDecode(r.inputs[1])];
}

export interface NetMatchOptions {
  readonly setup: MatchSetup;
  readonly script: Script;
  readonly tickLimit: number;
  readonly conditions: NetConditions;
  readonly netSeed: number;
  readonly session?: Partial<Omit<LockstepOptions, 'world' | 'side' | 'transport'>>;
  /** Called before each wall tick; may corrupt a world, cut the network, hide a tab, and so on. */
  readonly beforeTick?: (wall: number, h: NetMatch) => void;
  /** Wall tick budget (default 20x tickLimit). */
  readonly maxWallTicks?: number;
}

export interface NetMatch {
  readonly worlds: readonly [SimWorld, SimWorld];
  readonly sessions: readonly [LockstepSession, LockstepSession];
  readonly net: FakeNetwork;
  wall: number;
}

const DONE = new Set(['ended', 'desync', 'forfeit']);

/**
 * Plays one networked match in this process: two sessions over a FakeNetwork. Commands for stamp tick k are
 * `script[side][k]` (the first `inputDelay` ticks are prefilled with no command), whatever the network does.
 */
export function runNetMatch(o: NetMatchOptions): NetMatch & { hashes: readonly [number, number] } {
  const worlds = [createMatch(o.setup), createMatch(o.setup)] as const;
  const net = createFakePair(o.netSeed, o.conditions);
  const mk = (side: 0 | 1): LockstepSession =>
    new LockstepSession({
      world: worlds[side],
      side,
      transport: side === 0 ? net.a : net.b,
      tickLimit: o.tickLimit,
      ...o.session,
    });
  const m: NetMatch = { worlds, sessions: [mk(0), mk(1)], net, wall: 0 };
  const max = o.maxWallTicks ?? o.tickLimit * 20;
  while (m.wall < max && !m.sessions.every((s) => DONE.has(s.status))) {
    m.wall++;
    net.advance();
    o.beforeTick?.(m.wall, m);
    for (const s of m.sessions) {
      s.update(o.script[s.side][s.nextStampTick] ?? 0);
    }
  }
  return { ...m, hashes: [hash(worlds[0].state), hash(worlds[1].state)] };
}

/** The same match with no network: the command sequence the sessions should have produced (adaptive delay off). */
export function referenceHash(setup: MatchSetup, script: Script, tickLimit: number, inputDelay: number): number {
  const w = createMatch(setup);
  for (let t = 0; t < tickLimit; t++) {
    const c = (side: 0 | 1): Command => (t < inputDelay ? 0 : (script[side][t] ?? 0));
    step(w, [c(0), c(1)]);
    if (hasEnded(w.state)) break;
  }
  return hash(w.state);
}
