// Projectile-economy trace of one Arcade 1v1 pairing (analysis only, no sim change).
// usage (repo root): tsx tools/sim/team-weakness/trace.mts A B seeds [level=3]   (A is "us"; sides alternate per seed)
//   TTE_MODS=... tsx --import ./tools/sim/team-weakness/mods.mts tools/sim/team-weakness/trace.mts A B seeds   for what-ifs
// Per side, per match: shots fired, shots lost in clashes (by outcome: winner / loser / both), shots that hit, damage dealt,
// mean distance between the heroes at fire time and the vertical offset (|dy|) at fire time, plus the hero-hero distance
// at the moment a hit lands. Shots neither hit nor clashed left the arena or were guarded/parried.
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
const { canAct, isStunned } = await import(R + 'src/core/sim/systems/arcade/stun.ts');
const { cooldownIdx, countIdx } = await import(R + 'src/core/sim/state.ts');
const { now } = await import(R + 'src/core/sim/clock.ts');
const { ELEMENTS } = await import(R + 'src/core/data/elements.ts');
const [A, B, seedsS, lvl] = process.argv.slice(2) as [string, string, string, string | undefined];
const seeds = Number(seedsS), level = Number(lvl ?? 3);
const side = () => ({ fired: {} as Record<string, number>, clashWin: 0, clashLose: 0, clashBoth: 0, hits: {} as Record<string, number>, dmg: 0, dist: 0, dy: 0, nShot: 0, hitDist: 0, nHit: 0, guarded: 0, fightTicks: 0, ready: 0, readyAligned: 0, cantAct: 0, stunned: 0, capped: 0 });
const S = { a: side(), b: side() };
const inc = (o: Record<string, number>, k: string, v = 1) => { o[k] = (o[k] ?? 0) + v; };
let wins = 0, ticks = 0, rounds = 0;
for (let k = 0; k < seeds; k++) {
  const aT0 = k % 2 === 0; const xp = rm.xpForLevel(1);
  const ra = [{ character: characterId(A), xp }], rb = [{ character: characterId(B), xp }];
  const world = createMatch({ simVersion: SIM_VERSION, seed: rm.matchSeed(1, k), flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1, p1: aT0 ? ra : rb, p2: aT0 ? rb : ra });
  const s = world.state;
  const agents = (aT0 ? [rm.makeTeamAgent('scripted', [A], B, 0, level), rm.makeTeamAgent('scripted', [B], A, 1, level)] : [rm.makeTeamAgent('scripted', [B], A, 0, level), rm.makeTeamAgent('scripted', [A], B, 1, level)]) as any;
  const myTeam = aT0 ? 0 : 1;
  const sideOf = (team: number) => (team === myTeam ? S.a : S.b);
  const seen = new Set<number>();
  const heroOf: number[] = [];
  let t = 0, winner = -2, inFight = false;
  while (t < 18000 && winner === -2) {
    const ev = step(world, collectCommands(world, agents)); t++;
    for (let id = 0; id < 64; id++) if (s.kind[id] === 0 && (s.team[id] === 0 || s.team[id] === 1) && ((s.flags[id] ?? 0) & 1) !== 0) heroOf[s.team[id]!] = id;
    for (const e of ev) {
      if (e.kind === K.clash) {
        const ea = ELEMENTS[e['ea']!], eb = ELEMENTS[e['eb']!]; void ea; void eb;
        const w = e['winner'] as number;
        const ta = s.team[e['a'] as number] ?? 0, tb = s.team[e['b'] as number] ?? 0;
        if (w === -1) { sideOf(ta).clashBoth++; sideOf(tb).clashBoth++; }
        else { const wt = s.team[w] ?? 0; sideOf(wt).clashWin++; sideOf(1 - wt).clashLose++; }
      } else if (e.kind === K.hitConfirmed) {
        const vt = s.team[e['target'] ?? 0] ?? 0; const att = sideOf(1 - vt); const nm = ABILITY_DEFS[e['ability']!]?.id ?? 'x';
        inc(att.hits, nm); att.dmg += e['amount'] ?? 0;
        const h0 = heroOf[0], h1 = heroOf[1];
        if (h0 !== undefined && h1 !== undefined) { att.hitDist += Math.abs((s.x[h0] ?? 0) - (s.x[h1] ?? 0)); att.nHit++; }
      } else if (e.kind === K.guarded) sideOf(1 - (s.team[e['target'] ?? 0] ?? 0)).guarded++;
      else if (e.kind === K.fight) { rounds++; inFight = true; }
      else if (e.kind === K.ko || e.kind === K.timeOver || e.kind === K.roundEnded) inFight = false;
      else if (e.kind === K.matchEnded) winner = e['winner'] ?? -1;
    }
    if (inFight) for (const tm of [0, 1]) {
      const me = heroOf[tm], op = heroOf[1 - tm];
      if (me === undefined || op === undefined) continue;
      const sd = sideOf(tm); sd.fightTicks++;
      if (isStunned(s, me)) sd.stunned++;
      if (!canAct(world, me)) { sd.cantAct++; continue; }
      const cd = (s.abil[cooldownIdx(me, 0)] ?? 0) <= now(s);
      const def = ABILITY_DEFS.find((d: any) => d.id === (rm.slot0Ability ? rm.slot0Ability(s, me) : ''));
      void def;
      const cnt = s.abil[countIdx(me, 0)] ?? 0;
      const dx = Math.abs((s.x[me] ?? 0) - (s.x[op] ?? 0)), dy = Math.abs((s.y[me] ?? 0) - (s.y[op] ?? 0));
      const aligned = dx <= (s.h[op] ?? 80) / 2 || dy <= (s.w[op] ?? 80) / 2;
      if (cd && cnt >= 2) sd.capped++;
      if (cd) { sd.ready++; if (aligned) sd.readyAligned++; }
    }
    // new projectile entities this tick = shots fired
    for (let id = 0; id < 64; id++) {
      const isP = s.kind[id] === 1 && ((s.flags[id] ?? 0) & 1) !== 0;
      if (isP && !seen.has(id)) {
        seen.add(id);
        const sd = sideOf(s.team[id] ?? 0); inc(sd.fired, ABILITY_DEFS[s.defId[id] ?? 0]?.id ?? 'super');
        const h0 = heroOf[0], h1 = heroOf[1];
        if (h0 !== undefined && h1 !== undefined) { sd.dist += Math.abs((s.x[h0] ?? 0) - (s.x[h1] ?? 0)); sd.dy += Math.abs((s.y[h0] ?? 0) - (s.y[h1] ?? 0)); sd.nShot++; }
      } else if (!isP) seen.delete(id);
    }
  }
  ticks += t; if (winner === myTeam) wins++;
}
const f = (x: number, d = seeds) => +(x / d).toFixed(1);
const show = (n: string, o: ReturnType<typeof side>) => console.log(n, JSON.stringify({
  firedPerMatch: Object.fromEntries(Object.entries(o.fired).map(([k, v]) => [k, f(v)])), hitsPerMatch: Object.fromEntries(Object.entries(o.hits).map(([k, v]) => [k, f(v)])),
  clashWon: f(o.clashWin), clashLost: f(o.clashLose), clashBoth: f(o.clashBoth), guardedHits: f(o.guarded), dmg: f(o.dmg), meanDistAtFire: f(o.dist, o.nShot || 1), meanDyAtFire: f(o.dy, o.nShot || 1), meanDistAtHit: f(o.hitDist, o.nHit || 1), secInFight: f(o.fightTicks, 50 * seeds), stunnedSec: f(o.stunned, 50 * seeds), cantActSec: f(o.cantAct, 50 * seeds), cdReadySec: f(o.ready, 50 * seeds), readyAndAlignedSec: f(o.readyAligned, 50 * seeds), cdReadyButCapped2Sec: f(o.capped, 50 * seeds) }));
console.log(`${A} vs ${B} seeds ${seeds} lvl ${level} simV ${SIM_VERSION}: ${A} wins ${f(100 * wins)}% , secs/match ${f(ticks, seeds * 50)}, rounds/match ${f(rounds)}`);
show(A, S.a); show(B, S.b);
