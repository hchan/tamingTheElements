/**
 * Pure decision function of the PC-first e2e router: given the request, the latest PC probe, what already happened in this call,
 * the Mac load and the seconds waited so far, pick the next Step. No I/O, no host/address/user/key literals.
 * Invariants: never Mac after a PC exit 0 or 1; at most 2 PC attempts and 1 Mac attempt per call; the Mac only ever takes short runs
 * (<= testLimit tests incl. repeats; run/smoke/pages/itch; not --pc, not --pc-detach) unless TTE_ALLOW_MAC_E2E=1 (`allowMac`).
 * A `fail` step also carries finished runs (exit 0/1/...): `code` is then the final exit code of the call.
 */
import type { LaneName } from './pc-job';

export type { LaneName };

export type PcView =
  | { state: 'up' | 'busy'; why?: 'load' | 'ram'; lanes: Record<LaneName, 'idle' | 'busy'>; gpuJobs: number; young: boolean }
  | { state: 'down'; why: 'unreachable' | 'timeout' | 'wsl' }
  | { state: 'broken'; why: 'frames' | 'disk' | 'clone' };

export type Policy = 'mac' | 'wait' | 'fail';

export interface Ask {
  kind: 'run' | 'smoke' | 'pages' | 'itch' | 'flake';
  /** Tests selected, repeats included; undefined = unknown (not short). */
  tests: number | undefined;
  /** Lane the router would pick without a probe. */
  lane: LaneName;
  /** --pc-lane or --full was given: no spill, and a full lane is not a short-only run. */
  laneForced: boolean;
  /** --pc */
  pc: boolean;
  /** --pc-detach */
  detach: boolean;
  policy: Policy;
  /** TTE_ALLOW_MAC_E2E=1: lifts the short-only limit. */
  allowMac: boolean;
}

export interface LastRun {
  where: 'pc' | 'mac';
  exit: number;
  /** Where in the PC pipeline a 3 or 93 happened. */
  stage?: 'upload' | 'fetch' | 'memory';
  /** Seconds since the last frame stall (exit 96). */
  stallSec?: number;
}
export interface History {
  pcAttempts: number;
  macAttempts: number;
  /** The one allowed re-attach after exit 255 was already used. */
  reattached?: boolean;
  last?: LastRun;
}
export interface Limits {
  testLimit: number;
  macLoadMax: number;
  macLoadWaitSec: number;
  pcBusyWaitSec: number;
  pcWaitMaxSec: number;
  /** Poll step while waiting for the Mac load or a down PC. */
  pollSec: number;
}
export const DEFAULT_LIMITS: Limits = { testLimit: 150, macLoadMax: 14, macLoadWaitSec: 900, pcBusyWaitSec: 600, pcWaitMaxSec: 1800, pollSec: 120 };
export const EXIT_NO_RUNNER = 89;
export const EXIT_MAC_RETRY = 75;
export const STALL_WINDOW_SEC = 600;

export type Step =
  | { do: 'pc'; lane: LaneName; attach?: true }
  | { do: 'mac'; reason: string }
  | { do: 'wait'; sec: number; why: string }
  | { do: 'fail'; code: number; reason: string };

const PC_ATTEMPTS_MAX = 2;
const BUSY_POLL_SEC = 30;
const SHORT_KINDS: readonly Ask['kind'][] = ['run', 'smoke', 'pages', 'itch'];
const failStep = (code: number, reason: string): Step => ({ do: 'fail', code, reason });
type Live = Extract<PcView, { lanes: unknown }>;
const isLive = (v: PcView): v is Live => v.state === 'up' || v.state === 'busy';

/** May this call ever run on the Mac? */
export function macEligible(ask: Ask, limits: Limits): boolean {
  if (ask.allowMac) return true;
  if (ask.pc || ask.detach || !SHORT_KINDS.includes(ask.kind)) return false;
  if (ask.laneForced && ask.lane === 'full') return false;
  return ask.tests !== undefined && ask.tests <= limits.testLimit;
}

/** Lane for a PC run: spill a busy short lane to an idle full lane when no GPU job runs. */
export function pcLane(ask: Ask, view: Live): LaneName {
  if (!ask.laneForced && ask.lane === 'short' && view.lanes.short === 'busy' && view.lanes.full === 'idle' && view.gpuJobs === 0) return 'full';
  return ask.lane;
}

/** The Mac guard: run when load is fine, else wait, then give up with exit 89. */
function macStep(reason: string, macLoad: number | undefined, waitedSec: number, limits: Limits): Step {
  if (macLoad !== undefined && macLoad > limits.macLoadMax) {
    const left = limits.macLoadWaitSec - waitedSec;
    const load = `Mac load ${macLoad.toFixed(1)}/${String(limits.macLoadMax)}`;
    if (left <= 0) return failStep(EXIT_NO_RUNNER, `no runner: ${load} after ${String(waitedSec)} s (${reason})`);
    return { do: 'wait', sec: Math.min(limits.pollSec, left), why: `${load}, PC unavailable (${reason})` };
  }
  return { do: 'mac', reason };
}

const policyOf = (ask: Ask): Policy => (ask.pc || ask.detach ? 'fail' : ask.policy);
const viewWhy = (v: PcView): string => `PC ${v.state}${v.why ? ` (${v.why})` : ''}`;
const viewCode = (v: PcView): number => (v.state === 'broken' ? (v.why === 'frames' ? 96 : 97) : v.state === 'busy' ? 95 : 94);

/** The probe-state table: the PC is the first choice; the Mac takes eligible runs only. */
function byProbe(ask: Ask, view: PcView, h: History, macLoad: number | undefined, waitedSec: number, limits: Limits): Step {
  if (view.state === 'up') return { do: 'pc', lane: pcLane(ask, view) };
  const policy = policyOf(ask);
  const why = viewWhy(view);
  const code = viewCode(view);
  const canMac = h.macAttempts < 1 && policy === 'mac' && macEligible(ask, limits);
  if (view.state === 'busy') {
    if (policy === 'fail') return failStep(code, why);
    const cap = canMac ? limits.pcBusyWaitSec : limits.pcWaitMaxSec;
    if (waitedSec < cap) return { do: 'wait', sec: Math.min(BUSY_POLL_SEC, cap - waitedSec), why };
    return canMac ? macStep(why, macLoad, waitedSec - cap, limits) : failStep(code, `${why} for ${String(waitedSec)} s`);
  }
  if (canMac) return macStep(why, macLoad, waitedSec, limits);
  if (policy === 'wait' && view.state === 'down' && waitedSec < limits.pcWaitMaxSec) {
    return { do: 'wait', sec: Math.min(limits.pollSec, limits.pcWaitMaxSec - waitedSec), why };
  }
  return failStep(code, view.state === 'broken' && view.why !== 'frames' ? `${why}: PC needs setup` : why);
}

/** The after-PC-exit table. */
function afterPc(ask: Ask, view: PcView, h: History, last: LastRun, macLoad: number | undefined, waitedSec: number, limits: Limits): Step {
  const x = last.exit;
  const toMac = (reason: string): Step => {
    if (h.macAttempts >= 1 || policyOf(ask) !== 'mac' || !macEligible(ask, limits)) return failStep(x, `${reason}; no Mac fallback`);
    return macStep(reason, macLoad, waitedSec, limits);
  };
  const again = (): Step => (h.pcAttempts < PC_ATTEMPTS_MAX && isLive(view) ? { do: 'pc', lane: pcLane(ask, view) } : toMac(`PC exit ${String(x)}`));
  if (x === 0 || x === 1 || x === 2 || x === 124 || x === 130) return failStep(x, 'final');
  switch (x) {
    case 93:
      return last.stage === 'memory' ? failStep(93, 'PC memory guard (final)') : again();
    case 255:
      return h.reattached ? toMac('ssh given up') : { do: 'pc', lane: ask.lane, attach: true };
    case 94:
    case 95:
      return toMac(`PC exit ${String(x)}`);
    case 96:
      return (last.stallSec ?? 0) < STALL_WINDOW_SEC ? toMac('PC frames stall') : again();
    case 92:
      return again();
    case 3:
      return last.stage === 'fetch' ? failStep(3, 'result fetch failed (final)') : again();
    case 97:
    case 98:
    case 99:
      return toMac(`PC needs setup (exit ${String(x)})`);
    default:
      return failStep(x, 'PC exit, no fallback');
  }
}

/** Decide the next step. `view` is a fresh probe taken just before the call. */
export function decide(ask: Ask, view: PcView, h: History, macLoad: number | undefined, waitedSec: number, limits: Limits = DEFAULT_LIMITS): Step {
  const last = h.last;
  if (!last) return byProbe(ask, view, h, macLoad, waitedSec, limits);
  if (last.where === 'pc') return afterPc(ask, view, h, last, macLoad, waitedSec, limits);
  // after a Mac attempt: only exit 75 (no slot) goes back to the PC
  if (last.exit === EXIT_MAC_RETRY && isLive(view) && h.pcAttempts < PC_ATTEMPTS_MAX) return { do: 'pc', lane: pcLane(ask, view) };
  return failStep(last.exit, 'Mac run finished');
}
