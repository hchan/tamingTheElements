// Headless movement measurements for the Arcade ruleset (ideas/brainstorm/mvc-dash-roll-cancel.md): walk start/stop, dash, turn.
// Run: pnpm exec tsx tools/sim/move-probe.ts
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import { Cmd, type Command } from '../../src/core/sim/commands';
import { createMatch } from '../../src/core/sim/match';
import { step } from '../../src/core/sim/step';
import { skipIntro } from '../../src/core/sim/systems/arcade/round-testkit';
import { SIM_VERSION } from '../../src/core/version';

function duel(race: string) {
  const w = skipIntro(createMatch({
    simVersion: SIM_VERSION, seed: 9, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(race), xp: 1 }], p2: [{ character: characterId('pax'), xp: 1 }],
  }));
  w.state.x[0] = 300; w.state.y[0] = 300; w.state.x[1] = 1700; w.state.y[1] = 300;
  return w;
}

for (const race of ['fiara', 'rokcore', 'wispera']) {
  const w = duel(race);
  const xs: number[] = [];
  const run = (c: Command, n: number): void => {
    for (let i = 0; i < n; i++) { step(w, [c, 0]); xs.push(w.state.x[0] ?? 0); }
  };
  const x0 = w.state.x[0] ?? 0;
  run(Cmd.right, 10);
  const walk = xs.slice(0, 4).map((x, i) => x - (i ? xs[i - 1] ?? 0 : x0));
  run(0, 6);
  console.log(race, 'speed', w.state.speed[0], 'walk px/tick', walk, 'stop after release', xs[10] === xs[15] ? 'instant' : 'slides',
    'arena 1920 cross ticks', Math.round(1920 / (w.state.speed[0] ?? 1)));
  const xd = w.state.x[0] ?? 0;
  run(Cmd.dash | Cmd.right, 1);
  run(0, 30);
  console.log(race, 'dash distance', (w.state.x[0] ?? 0) - xd, 'px in 12 ticks; free again after 18');
  const xt = w.state.x[0] ?? 0;
  run(Cmd.left, 3);
  console.log(race, 'reversal first 3 ticks dx', (w.state.x[0] ?? 0) - xt);
}
