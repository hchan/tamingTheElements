// Tick timeline of one Arcade 1v1 match (analysis only): hits, clashes, dashes, guards, stuns and the heroes' x distance.
// usage (repo root): tsx tools/sim/team-weakness/timeline.mts A B seed [fromTick] [toTick]   (A is team 0 when seed is even)
const R = process.cwd() + '/';
const rm = await import(R + 'tools/sim/run-match.ts');
const { collectCommands } = await import(R + 'src/core/agents/agent.ts');
const { characterId } = await import(R + 'src/core/data/ids.ts');
const { DEFAULT_SIM_FLAGS } = await import(R + 'src/core/flags.ts');
const { SIM_VERSION } = await import(R + 'src/core/index.ts');
const { createMatch } = await import(R + 'src/core/sim/match.ts');
const { step } = await import(R + 'src/core/sim/step.ts');
const { SimEventKind: K } = await import(R + 'src/core/sim/events.ts');
const { ABILITY_DEFS } = await import(R + 'src/core/sim/systems/projectile.ts');
const { isStunned } = await import(R + 'src/core/sim/systems/arcade/stun.ts');
const [A, B, seedS, fromS, toS] = process.argv.slice(2) as [string, string, string, string?, string?];
const k = Number(seedS), from = Number(fromS ?? 0), to = Number(toS ?? 600);
const aT0 = k % 2 === 0; const xp = rm.xpForLevel(1);
const ra = [{ character: characterId(A), xp }], rb = [{ character: characterId(B), xp }];
const world = createMatch({ simVersion: SIM_VERSION, seed: rm.matchSeed(1, k), flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1, p1: aT0 ? ra : rb, p2: aT0 ? rb : ra });
const s = world.state;
const agents = (aT0 ? [rm.makeTeamAgent('scripted', [A], B, 0, 3), rm.makeTeamAgent('scripted', [B], A, 1, 3)] : [rm.makeTeamAgent('scripted', [B], A, 0, 3), rm.makeTeamAgent('scripted', [A], B, 1, 3)]) as any;
const name = (team: number) => ((team === 0) === aT0 ? A : B);
const kn = Object.fromEntries(Object.entries(K).map(([n, v]) => [v as number, n]));
const hero: number[] = [];
let t = 0, winner = -2;
while (t < 18000 && winner === -2 && t < to) {
  const ev = step(world, collectCommands(world, agents)); t++;
  for (let id = 0; id < 64; id++) if (s.kind[id] === 0 && (s.team[id] === 0 || s.team[id] === 1) && ((s.flags[id] ?? 0) & 17) === 1) hero[s.team[id]!] = id;
  if (t < from) continue;
  const h0 = hero[0], h1 = hero[1];
  for (const e of ev) {
    const n = kn[e.kind]!;
    if (['moved', 'blocked', 'hitStop', 'meterLevel'].includes(n)) continue;
    let extra = '';
    if (e.kind === K.hitConfirmed) extra = `${name(1 - (s.team[e['target']!] ?? 0))}->${name(s.team[e['target']!] ?? 0)} ${ABILITY_DEFS[e['ability']!]?.id ?? 'x'} amt ${e['amount']} combo ${e['combo']}`;
    else if (e.kind === K.clash) extra = `winner ${e['winner'] === -1 ? 'both' : name(s.team[e['winner']!] ?? 0)} @${e['x']}`;
    else if (e.kind === K.dashed || e.kind === K.guarded) extra = name(s.team[(e['target'] ?? e.sourceId) as number] ?? 0);
    console.log(`t${t} ${n} ${extra} | hp ${h0 !== undefined ? s.hp[h0] : '-'}/${h1 !== undefined ? s.hp[h1] : '-'} x ${h0 !== undefined ? Math.round(s.x[h0] ?? 0) : '-'}/${h1 !== undefined ? Math.round(s.x[h1] ?? 0) : '-'} y ${h0 !== undefined ? Math.round(s.y[h0] ?? 0) : '-'}/${h1 !== undefined ? Math.round(s.y[h1] ?? 0) : '-'} stun ${h0 !== undefined && isStunned(s, h0) ? 'T0' : ''}${h1 !== undefined && isStunned(s, h1) ? 'T1' : ''}`);
    if (e.kind === K.matchEnded) winner = e['winner'] ?? -1;
  }
}
console.log(`team0=${name(0)} team1=${name(1)}`);
