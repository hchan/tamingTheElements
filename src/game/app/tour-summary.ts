import type { CharacterId } from '@core/index';
import { TOUR_CONTINUES, TOUR_STAGES, type TourRun } from './tour-model';

/** The numbers and words of the World Tour ending and Game Over cards (FUN-DESIGN 2.18, WP-tour-splash-ending). Pure. */
export interface RunSummary {
  /** Stages beaten: all nine once won, else the 0-based stage the run stopped at. */
  readonly cleared: number;
  readonly total: number;
  readonly continuesUsed: number;
  readonly team: readonly string[];
  readonly lines: readonly string[];
}

export function runSummary(run: TourRun, label: (id: CharacterId) => string): RunSummary {
  const cleared = run.status === 'won' ? TOUR_STAGES : run.stage;
  const continuesUsed = TOUR_CONTINUES - run.continues;
  const team = run.hero.map(label);
  const plural = (n: number, w: string): string => `${String(n)} ${w}${n === 1 ? '' : 's'}`;
  return {
    cleared,
    total: TOUR_STAGES,
    continuesUsed,
    team,
    lines: [
      `Stages cleared: ${String(cleared)} of ${String(TOUR_STAGES)}.`,
      `Continues used: ${String(continuesUsed)} of ${String(TOUR_CONTINUES)} (${plural(run.continues, 'continue')} left).`,
      `Hero team: ${team.join(', ')}.`,
    ],
  };
}
