// Analysis harness (ideas/brainstorm/snag-trap-and-team-modes-findings.md); read-only, no sim change.
// usage (repo root): tsx tools/sim/snag-trap-teams.mts snag <seeds> <out.json>
//                    tsx tools/sim/snag-trap-teams.mts teams <2|3> <seeds> <out.json>
//                    tsx tools/sim/snag-trap-teams.mts partners <2|3> <seeds> <out.json>
// snag: 1v1 Arcade round robin (Normal AI); measures Snag-then-trap and longest no-control streaks.
// partners: like teams, but both rosters are drawn per match from a seeded sfc32 stream (seedSfc32(matchSeed ^ pairing, 'partners')): the
//   leads are the pairing, the partners are distinct random races not on either roster. Reports per-race effect (team win rate over every
//   roster the race is on, as lead or partner), lead-only rate, and a same-team pair table. Deterministic: same args, same output.
// teams: 2v2 / 3v3 Arcade round robin via runMatch; win rate per race, endReason, tags, stalemates.
import { writeFileSync } from 'node:fs';
const R = process.cwd() + '/';
const rm = await import(R + 'tools/sim/run-match.ts');
const { collectCommands } = await import(R + 'src/core/agents/agent.ts');
const { characterId } = await import(R + 'src/core/data/ids.ts');
const { DEFAULT_SIM_FLAGS } = await import(R + 'src/core/flags.ts');
const { SIM_VERSION } = await import(R + 'src/core/index.ts');
const { createMatch } = await import(R + 'src/core/sim/match.ts');
const { step } = await import(R + 'src/core/sim/step.ts');
const { SimEventKind: K } = await import(R + 'src/core/sim/events.ts');
const { ARCADE_E, ArcadeE } = await import(R + 'src/core/sim/state.ts');
const { now } = await import(R + 'src/core/sim/clock.ts');
const hit = await import(R + 'src/core/sim/systems/arcade/hit.ts');
const { seedSfc32 } = await import(R + 'src/core/rng/seed.ts');
const mode = process.argv[2];
const RACES: string[] = rm.RACES;
const inc = (o: any, k: string, v = 1) => { o[k] = (o[k] ?? 0) + v; };

if (mode === 'snag') {
  const seeds = Number(process.argv[3] ?? 24);
  const out: any = { matches: 0, ticks: 0, snagRooted: 0, snagGuarded: 0, snagFreed: 0, snagExpired: 0, snagsByRace: {}, rootedThenTrapHit: 0, trapHitWithin2s: 0,
    trapHitsTotal: 0, trapPlaced: 0, trapOverlapEvents: 0, dmgTotal: 0, dmgInRoot: 0, dmgTrapInRoot: 0, dmgTrapTotal: 0, matchesWithSnag: 0, matchesWithSnagTrap: 0,
    snagTeamWon: 0, snagTeamsTotal: 0, snagTrapTeamWon: 0, snagTrapTeams: 0, maxControlStreak: 0, controlStreaks: [] as number[], controlTicks: 0, fighterTicks: 0,
    streakOver120: 0, streakOver180: 0, stalemates: 0 };
  for (let i = 0; i < RACES.length; i++) for (let j = i + 1; j < RACES.length; j++) for (let k = 0; k < seeds; k++) {
    const a = RACES[i]!, b = RACES[j]!, aIs0 = k % 2 === 0;
    const xp = rm.xpForLevel(1);
    const ra = [{ character: characterId(a), xp }], rb = [{ character: characterId(b), xp }];
    const world = createMatch({ simVersion: SIM_VERSION, seed: rm.matchSeed(1, k), flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1, p1: aIs0 ? ra : rb, p2: aIs0 ? rb : ra });
    const s = world.state;
    const agA = rm.makeTeamAgent('scripted', [a], b, aIs0 ? 0 : 1, 3), agB = rm.makeTeamAgent('scripted', [b], a, aIs0 ? 1 : 0, 3);
    const agents = (aIs0 ? [agA, agB] : [agB, agA]) as any;
    const raceOfTeam = aIs0 ? [a, b] : [b, a];
    const roots = new Map<number, { until: number; by: number; start: number; trap: boolean }>();
    const streak = new Map<number, number>();
    const snagTeams = new Set<number>(), trapTeams = new Set<number>();
    let winner = -2, t = 0, hp = [-1, -1], lastChange = 0, stalled = false;
    out.matches++;
    while (t < 18000 && winner === -2) {
      const events = step(world, collectCommands(world, agents)); t++;
      const g = now(s);
      for (const e of events) {
        if (e.kind === K.snag) {
          const r = e['reason'], victim = e['id'];
          if (r === 0) { out.snagRooted++; const tm = 1 - (s.team[victim] ?? 0); inc(out.snagsByRace, raceOfTeam[tm]!); roots.set(victim, { until: g + 60, by: tm, start: g, trap: false }); snagTeams.add(tm); }
          else if (r === 1) out.snagGuarded++; else if (r === 2) out.snagFreed++; else if (r === 3) out.snagExpired++;
        } else if (e.kind === K.trapPlaced) out.trapPlaced++;
        else if (e.kind === K.trapTriggered && e['reason'] === 0) out.trapOverlapEvents++;
        else if (e.kind === K.hitConfirmed) {
          const amt = e['amount'] ?? 0, victim = e['target'] as number, ab = e['ability'];
          const isTrap = ab === hit.TRAP_BOMB_DEF || ab === hit.TRAP_SPIKE_DEF;
          out.dmgTotal += amt; if (isTrap) { out.dmgTrapTotal += amt; out.trapHitsTotal++; }
          const rt = roots.get(victim);
          if (rt !== undefined && g <= rt.until + 5) {
            out.dmgInRoot += amt;
            if (isTrap) { out.dmgTrapInRoot += amt; if (!rt.trap) { rt.trap = true; out.rootedThenTrapHit++; trapTeams.add(rt.by); } }
          } else if (rt !== undefined && isTrap && g <= rt.start + 100) out.trapHitWithin2s++;
        } else if (e.kind === K.matchEnded) winner = e['winner'] ?? -1;
      }
      for (let id = 0; id < 64; id++) {
        if (s.kind[id] !== 0 || (s.team[id] !== 0 && s.team[id] !== 1)) continue;
        if ((s.hp[id] ?? 0) <= 0) { streak.set(id, 0); continue; }
        const ctl = (s.arcade[id * ARCADE_E + ArcadeE.rootUntil] ?? 0) > g || (s.arcade[id * ARCADE_E + ArcadeE.stunUntil] ?? 0) > g;
        out.fighterTicks++;
        if (ctl) { out.controlTicks++; const c = (streak.get(id) ?? 0) + 1; streak.set(id, c); if (c > out.maxControlStreak) out.maxControlStreak = c; }
        else { const c = streak.get(id) ?? 0; if (c >= 60) out.controlStreaks.push(c); if (c > 120) out.streakOver120++; if (c > 180) out.streakOver180++; streak.set(id, 0); }
      }
      const cur = [0, 1].map((tm) => { let x = 0; for (let id = 0; id < 64; id++) if (s.kind[id] === 0 && s.team[id] === tm) x += Math.max(0, s.hp[id] ?? 0); return x; });
      if (cur[0] !== hp[0] || cur[1] !== hp[1]) lastChange = t; hp = cur;
      if (t - lastChange >= 1500) { stalled = true; break; }
    }
    out.ticks += t; if (stalled) out.stalemates++;
    if (snagTeams.size > 0) { out.matchesWithSnag++; out.snagTeamsTotal += snagTeams.size; for (const tm of snagTeams) if (winner === tm) out.snagTeamWon++; }
    if (trapTeams.size > 0) { out.matchesWithSnagTrap++; for (const tm of trapTeams) { out.snagTrapTeams++; if (winner === tm) out.snagTrapTeamWon++; } }
  }
  const cs: number[] = out.controlStreaks.sort((x: number, y: number) => x - y);
  out.controlStreakCount = cs.length; out.controlStreakP50 = cs[Math.floor(cs.length / 2)]; out.controlStreakP99 = cs[Math.floor(cs.length * 0.99)]; delete out.controlStreaks;
  writeFileSync(process.argv[4] ?? 'snag.json', JSON.stringify(out, null, 1));
} else if (mode === 'teams') {
  const size = Number(process.argv[3]) as 2 | 3, seeds = Number(process.argv[4] ?? 24);
  const rows: Record<string, any> = Object.fromEntries(RACES.map((r) => [r, { g: 0, w: 0, d: 0 }]));
  const tot: any = { n: 0, ko: 0, timeout: 0, stalemate: 0, draws: 0, ticks: 0, tags: 0, noTag: 0, maxTicks: 0, timeOvers: 0, hits: 0, secs: [] as number[] };
  for (let i = 0; i < RACES.length; i++) for (let j = i + 1; j < RACES.length; j++) for (let k = 0; k < seeds; k++) {
    const a = RACES[i]!, b = RACES[j]!;
    const r = rm.runMatch({ raceA: a, raceB: b, agentA: 'scripted', agentB: 'scripted', seed: rm.matchSeed(1, k), aIsTeam0: k % 2 === 0, level: 1, difficulty: 1, ruleset: 'arcade', teamSize: size, aiLevel: 3 });
    tot.n++; tot[r.endReason]++; tot.ticks += r.ticks; if (r.ticks > tot.maxTicks) tot.maxTicks = r.ticks; tot.secs.push(r.ticks / 50);
    const f = r.fun; if (f) { tot.tags += f.tags; if (f.tags === 0) tot.noTag++; tot.timeOvers += f.timeOvers; tot.hits += f.hits; }
    rows[a]!.g++; rows[b]!.g++;
    if (r.winner === 'a') rows[a]!.w++; else if (r.winner === 'b') rows[b]!.w++; else { rows[a]!.d++; rows[b]!.d++; tot.draws++; }
  }
  tot.secs.sort((x: number, y: number) => x - y); tot.secsP50 = tot.secs[tot.secs.length >> 1]; tot.secsP90 = tot.secs[Math.floor(tot.secs.length * 0.9)]; delete tot.secs;
  writeFileSync(process.argv[5] ?? 'teams.json', JSON.stringify({ size, rows, tot }, null, 1));
}
else if (mode === 'partners') {
  const size = Number(process.argv[3]) as 2 | 3, seeds = Number(process.argv[4] ?? 24);
  const rows: Record<string, any> = Object.fromEntries(RACES.map((r) => [r, { lead: 0, leadW: 0, any: 0, anyW: 0, draws: 0 }]));
  const pairs: Record<string, { g: number; w: number }> = {};
  const tot: any = { n: 0, ko: 0, timeout: 0, stalemate: 0, draws: 0, tags: 0, timeOvers: 0, secs: [] as number[], seeds, size };
  for (let i = 0; i < RACES.length; i++) for (let j = i + 1; j < RACES.length; j++) for (let k = 0; k < seeds; k++) {
    const a = RACES[i]!, b = RACES[j]!, seed = rm.matchSeed(1, k), rng = seedSfc32(seed ^ (i * 64 + j), 'partners');
    const pool = RACES.filter((r) => r !== a && r !== b);
    const draw = (): string => pool.splice(rng.nextU32() % pool.length, 1)[0]!; // no repeats across the two rosters
    const rosterA = [a], rosterB = [b];
    for (let p = 1; p < size; p++) { rosterA.push(draw()); rosterB.push(draw()); }
    const r = rm.runMatch({ raceA: a, raceB: b, rosterA, rosterB, agentA: 'scripted', agentB: 'scripted', seed, aIsTeam0: k % 2 === 0, level: 1, difficulty: 1, ruleset: 'arcade', teamSize: size, aiLevel: 3 });
    tot.n++; tot[r.endReason]++; tot.secs.push(r.ticks / 50);
    const f = r.fun; if (f) { tot.tags += f.tags; tot.timeOvers += f.timeOvers; }
    const res = r.winner === 'a' ? 1 : r.winner === 'b' ? -1 : 0; if (res === 0) tot.draws++;
    for (const [roster, sign] of [[rosterA, 1], [rosterB, -1]] as const) {
      const won = res === sign;
      rows[roster[0]!].lead++; if (won) rows[roster[0]!].leadW++; if (res === 0) rows[roster[0]!].draws++;
      for (const m of roster) { rows[m].any++; if (won) rows[m].anyW++; }
      for (let x = 0; x < roster.length; x++) for (let y = x + 1; y < roster.length; y++) {
        const key = [roster[x]!, roster[y]!].sort().join('+'); const pr = (pairs[key] ??= { g: 0, w: 0 }); pr.g++; if (won) pr.w++;
      }
    }
  }
  tot.secs.sort((x: number, y: number) => x - y); tot.secsP50 = tot.secs[tot.secs.length >> 1]; tot.secsP90 = tot.secs[Math.floor(tot.secs.length * 0.9)]; delete tot.secs;
  writeFileSync(process.argv[5] ?? 'partners.json', JSON.stringify({ size, rows, pairs, tot }, null, 1));
}
console.log('done');
