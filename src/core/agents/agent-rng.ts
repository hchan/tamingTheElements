import { seedSfc32 } from '../rng/seed';
import { Sfc32 } from '../rng/sfc32';
import { AGENT_STREAM_NAMES } from '../rng/streams';
import { stateNumber, stateRecord, type AgentState, type ObservationView } from './agent';

/** Plain-data copy of an AgentRng: null before the first draw, else the bound (seed, side) and the four sfc32 words. */
export type AgentRngState = { readonly seed: number; readonly side: 0 | 1; readonly words: readonly number[] } | null;

/**
 * An agent's private random stream: `seedSfc32(matchSeed, AGENT_STREAM_NAMES[side])`, bound on the first draw to
 * the match seed and side of the view it is given (and re-bound if either changes). It lives in the agent, never
 * in SimState, so asking an agent for a command cannot change the sim state or its hash; the agent's `save()`
 * includes it so a restore rewinds it too.
 */
export class AgentRng {
  private rng: Sfc32 | undefined;
  private seed = 0;
  private side: 0 | 1 = 0;

  /** Uniform integer in [0, n) from the stream of (view.matchSeed, view.side). */
  int(view: Pick<ObservationView, 'matchSeed' | 'side'>, n: number): number {
    if (this.rng === undefined || view.matchSeed !== this.seed || view.side !== this.side) {
      this.seed = view.matchSeed;
      this.side = view.side;
      this.rng = seedSfc32(view.matchSeed, AGENT_STREAM_NAMES[view.side]);
    }
    return this.rng.int(n);
  }

  save(): AgentRngState {
    return this.rng === undefined ? null : { seed: this.seed, side: this.side, words: Array.from(this.rng.saveState()) };
  }

  /** Exact inverse of save(); accepts the saved value back as plain agent state (for example after JSON). */
  load(state: AgentState): void {
    if (state === null) {
      this.rng = undefined;
      return;
    }
    const rec = stateRecord(state, 'AgentRng');
    const words = rec['words'];
    if (!Array.isArray(words) || !words.every((w) => typeof w === 'number')) throw new TypeError('AgentRng: bad words');
    this.seed = stateNumber(rec, 'seed');
    this.side = stateNumber(rec, 'side') === 1 ? 1 : 0;
    this.rng = new Sfc32(words);
  }
}
