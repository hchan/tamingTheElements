// usage (from repo root): tsx tools/sim/low-races/lowraces.mts <seeds> <aiLevel> <out.json>
import { writeFileSync } from 'node:fs';
const R = process.cwd() + '/';
const rm = await import(R + 'tools/sim/run-match.ts');
const { collectCommands } = await import(R + 'src/core/agents/agent.ts');
const { characterId } = await import(R + 'src/core/data/ids.ts');
const { getCharacter } = await import(R + 'src/core/data/characters.ts');
const { DEFAULT_SIM_FLAGS } = await import(R + 'src/core/flags.ts');
const { SIM_VERSION } = await import(R + 'src/core/index.ts');
const { createMatch } = await import(R + 'src/core/sim/match.ts');
const { step } = await import(R + 'src/core/sim/step.ts');
const { SimEventKind: K } = await import(R + 'src/core/sim/events.ts');
const { cooldownIdx } = await import(R + 'src/core/sim/state.ts');
const hit = await import(R + 'src/core/sim/systems/arcade/hit.ts');
const seeds = Number(process.argv[2] ?? 24);
const aiLevel = Number(process.argv[3] ?? 3);
const RACES: string[] = rm.RACES;
const abilityDefs: any = (await import(R + 'src/core/sim/systems/projectile.ts')).ABILITY_DEFS ?? rm.ABILITY_DEFS;
const bump = (o: any, k: string, v = 1) => { o[k] = (o[k] ?? 0) + v; };
const mk = () => ({ games: 0, wins: 0, draws: 0, losses: 0, timeout: 0, stalemate: 0, ticks: 0, dealt: {} as any, taken: {} as any, use: {} as any, vs: {} as any,
  firstHit: [] as number[], firstHitOwn: 0, firstHitFoe: 0, rounds: 0, roundWon: 0, timeOvers: 0, roundTicks: 0, hits: 0 });
const rows: Record<string, any> = Object.fromEntries(RACES.map((r) => [r, mk()]));
for (let i = 0; i < RACES.length; i++) for (let j = i + 1; j < RACES.length; j++) for (let k = 0; k < seeds; k++) {
  const a = RACES[i]!, b = RACES[j]!;
  const aIsTeam0 = k % 2 === 0;
  const xp = rm.xpForLevel(1);
  const ra = [{ character: characterId(a), xp }], rb = [{ character: characterId(b), xp }];
  const world = createMatch({ simVersion: SIM_VERSION, seed: rm.matchSeed(1, k), flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1, p1: aIsTeam0 ? ra : rb, p2: aIsTeam0 ? rb : ra });
  const s = world.state;
  const agentA = rm.makeTeamAgent('scripted', [a], b, aIsTeam0 ? 0 : 1, aiLevel);
  const agentB = rm.makeTeamAgent('scripted', [b], a, aIsTeam0 ? 1 : 0, aiLevel);
  const agents = (aIsTeam0 ? [agentA, agentB] : [agentB, agentA]) as any;
  const raceOfTeam = aIsTeam0 ? [a, b] : [b, a];
  const raceOfEnt = (id: number) => raceOfTeam[s.team[id] ?? 0]!;
  const chars: number[] = [];
  for (let id = 0; id < 64; id++) if (s.kind[id] === 0 && (s.team[id] === 0 || s.team[id] === 1)) chars[s.team[id]] = chars[s.team[id]] ?? id;
  const abil = raceOfTeam.map((r) => getCharacter(characterId(r)).abilities.map(String));
  const defName = (idx: number) => idx === hit.SUPER_DEF ? 'super' : idx === hit.CHARGE_DEF ? 'charge' : idx === hit.TRAP_BOMB_DEF ? 'trap' : idx === hit.TRAP_SPIKE_DEF ? 'trap' : (abilityDefs?.[idx]?.id ?? 'unknown');
  const lastCd = [[0, 0], [0, 0]];
  let t = 0, winner = -2, lastChange = 0, hp = [-1, -1], fightTick = -1, roundFirst = false, end = 'timeout';
  while (t < 18000 && winner === -2) {
    const events = step(world, collectCommands(world, agents)); t++;
    for (const e of events) {
      if (e.kind === K.fight) { fightTick = t; roundFirst = false; for (const tm of [0, 1]) rows[raceOfTeam[tm]!].rounds++; }
      else if (e.kind === K.hitConfirmed) {
        const att = e['attacker'] ?? e.sourceId; const victimTm = s.team[e["target"] ?? 0] ?? 0; const tm = 1 - victimTm;
        const nm = defName(e['ability']!); const amt = e['amount'] ?? 0;
        const slot = abil[tm]!.indexOf(nm);
        const cls = nm === 'super' || nm === 'charge' || nm === 'trap' ? nm : slot === 0 ? 'slot0' : slot === 1 ? 'slot1' : 'other:' + nm;
        const rr = rows[raceOfTeam[tm]!]; bump(rr.dealt, cls, amt); bump(rr.dealt, 'total', amt); rr.hits++;
        bump(rows[raceOfTeam[victimTm]!].taken, cls, amt); bump(rows[raceOfTeam[victimTm]!].taken, 'total', amt);
        if (fightTick >= 0 && !roundFirst) { roundFirst = true; rr.firstHit.push((t - fightTick) / 50); rr.firstHitOwn++; rows[raceOfTeam[victimTm]!].firstHitFoe++; }
      }
      else if (e.kind === K.superStarted) bump(rows[raceOfEnt(e['caster'] ?? e.sourceId)].use, 'super');
      else if (e.kind === K.chargeStarted) bump(rows[raceOfEnt(e.sourceId)].use, 'charge');
      else if (e.kind === K.dashed) bump(rows[raceOfEnt(e.sourceId)].use, 'dash');
      else if (e.kind === K.guarded) bump(rows[raceOfEnt(e['target'] ?? e.sourceId)].use, 'guardedHitsTaken');
      else if (e.kind === K.weatherChanged) bump(rows[raceOfTeam[e['team'] ?? 0]!].use, 'weather');
      else if (e.kind === K.snag) bump(rows[raceOfEnt(e.sourceId)].use, 'snag' + (e['reason'] ?? ''));
      else if (e.kind === K.trapPlaced) bump(rows[raceOfEnt(e.sourceId)].use, 'trap');
      else if (e.kind === K.timeOver) { for (const tm of [0, 1]) rows[raceOfTeam[tm]!].timeOvers++; }
      else if (e.kind === K.matchEnded) winner = e['winner'] ?? -1;
    }
    for (const tm of [0, 1]) for (const sl of [0, 1]) {
      const c = s.abil[cooldownIdx(chars[tm] ?? 0, sl)] ?? 0;
      if (c > (lastCd[tm]?.[sl] ?? 0) && c > t) bump(rows[raceOfTeam[tm] ?? ''].use, 'cast' + sl + ':' + abil[tm]?.[sl]);
      (lastCd[tm] ?? [])[sl] = c;
    }
    const now = [0, 1].map((tm) => { let x = 0; for (let id = 0; id < 64; id++) if (s.kind[id] === 0 && s.team[id] === tm) x += Math.max(0, s.hp[id] ?? 0); return x; });
    if (now[0] !== hp[0] || now[1] !== hp[1]) lastChange = t;
    hp = now;
    if (lastChange + 1500 <= t) end = 'stall';
    if (end === 'stall') winner = -3;
  }
  if (winner !== -2 && end !== 'stall') end = 'ko';
  for (const [r, tm, o] of [[a, aIsTeam0 ? 0 : 1, b], [b, aIsTeam0 ? 1 : 0, a]] as const) {
    const x = rows[r]; x.games++; x.ticks += t;
    const v = (x.vs[o] ??= { g: 0, w: 0, d: 0 }); v.g++;
    if (winner === tm) { x.wins++; v.w++; } else if (winner === 1 - tm) x.losses++; else { x.draws++; v.d++; }
    if (end === 'timeout') x.timeout++;
    if (end === 'stall') x.stalemate++;
  }
}
writeFileSync(process.argv[4] ?? 'out.json', JSON.stringify(rows, null, 1));
console.log('done');
