// Analysis harness (ideas/brainstorm/control-streak-8s-investigation.md); read-only, no sim change.
// usage (repo root): tsx tools/sim/control-streaks.mts <seeds=4> <minWallTicks=180> <topN=6>
// 1v1 Arcade round robin (Normal AI, as snag-trap-teams.mts): logs the event sequence of every per-fighter streak of root or hit-stun
// (rootUntil / stunUntil beyond the game tick) at least minWallTicks long, in wall ticks (hit-stop included) and game ticks (frozen clock
// excluded), then splits them by whether a Snag root is part of the streak.
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
const seeds = Number(process.argv[2] ?? 4), minT = Number(process.argv[3] ?? 180), topN = Number(process.argv[4] ?? 6);
const RACES: string[] = rm.RACES;
const kn: Record<number, string> = {};
for (const [k, v] of Object.entries(K)) kn[v as number] = k;
const all: any[] = [];
let overall = 0;
for (let i = 0; i < RACES.length; i++) for (let j = i + 1; j < RACES.length; j++) for (let k = 0; k < seeds; k++) {
  const a = RACES[i]!, b = RACES[j]!, aIs0 = k % 2 === 0, xp = rm.xpForLevel(1);
  const ra = [{ character: characterId(a), xp }], rb = [{ character: characterId(b), xp }];
  const world = createMatch({ simVersion: SIM_VERSION, seed: rm.matchSeed(1, k), flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1, p1: aIs0 ? ra : rb, p2: aIs0 ? rb : ra });
  const s = world.state;
  const agA = rm.makeTeamAgent('scripted', [a], b, aIs0 ? 0 : 1, 3), agB = rm.makeTeamAgent('scripted', [b], a, aIs0 ? 1 : 0, 3);
  const agents = (aIs0 ? [agA, agB] : [agB, agA]) as any;
  const streak = new Map<number, { w: number; g0: number; log: string[]; hs: number }>();
  let winner = -2, t = 0, hp = [-1, -1], lastChange = 0;
  const pend = new Map<number, string[]>();
  while (t < 18000 && winner === -2) {
    const events = step(world, collectCommands(world, agents)); t++;
    const g = now(s);
    let frozen = false;
    for (const e of events) {
      const nm = kn[e.kind] ?? String(e.kind);
      let who = -1; let desc = '';
      if (e.kind === K.hitConfirmed) { who = e['target']; desc = `hit ab=${e['ability']} dmg=${e['amount']}`; }
      else if (e.kind === K.snag) { who = e['id']; desc = `snag reason=${e['reason']}`; }
      else if (e.kind === K.recovered) { who = e['id']; desc = `recovered reason=${e['reason']}`; }
      else if (e.kind === K.ccStarted || e.kind === K.ccEnded || e.kind === K.ccResisted) { who = e['id'] ?? e['target']; desc = `${nm} ${JSON.stringify(e)}`; }
      else if (e.kind === K.hitStop) { frozen = true; continue; }
      else if (e.kind === K.matchEnded) winner = e['winner'] ?? -1;
      if (who >= 0) { const L = pend.get(who) ?? []; L.push(`w${t} g${g} ${desc}`); pend.set(who, L); }
    }
    for (let id = 0; id < 64; id++) {
      if (s.kind[id] !== 0 || (s.team[id] !== 0 && s.team[id] !== 1)) continue;
      const alive = (s.hp[id] ?? 0) > 0;
      const rootL = (s.arcade[id * ARCADE_E + ArcadeE.rootUntil] ?? 0) - g, stunL = (s.arcade[id * ARCADE_E + ArcadeE.stunUntil] ?? 0) - g;
      const ctl = alive && (rootL > 0 || stunL > 0);
      const cur = streak.get(id);
      const evs = pend.get(id);
      if (ctl) {
        const c = cur ?? { w: 0, g0: g, log: [] as string[], hs: 0 };
        c.w++;
        if (frozen) c.hs++;
        if (evs) for (const x of evs) c.log.push(x + ` [root${rootL} stun${stunL}]`);
        streak.set(id, c);
      } else if (cur) {
        overall++;
        if (cur.w >= minT) all.push({ match: `${a}-${b}#${k}`, id, race: s.team[id] === 0 ? (aIs0 ? a : b) : (aIs0 ? b : a), w: cur.w, g: g - cur.g0, hs: cur.hs, log: cur.log });
        streak.delete(id);
      }
    }
    pend.clear();
    const cur = [0, 1].map((tm) => { let x = 0; for (let id = 0; id < 64; id++) if (s.kind[id] === 0 && s.team[id] === tm) x += Math.max(0, s.hp[id] ?? 0); return x; });
    if (cur[0] !== hp[0] || cur[1] !== hp[1]) lastChange = t; hp = cur;
    if (t - lastChange >= 1500) break;
  }
}
all.sort((x, y) => y.w - x.w);
console.log('streaks>=', minT, all.length, 'of', overall);
for (const [name, f] of [['with snag root', (x: any) => x.log.some((l: string) => l.includes('snag reason=0'))], ['no snag root', (x: any) => !x.log.some((l: string) => l.includes('snag reason=0'))]] as const) {
  const sub = all.filter(f); const n = Math.max(1, sub.length);
  console.log(name, sub.length, 'mean wall', (sub.reduce((o, x) => o + x.w, 0) / n).toFixed(1), 'mean game', (sub.reduce((o, x) => o + x.g, 0) / n).toFixed(1), 'max wall', Math.max(0, ...sub.map((x) => x.w)), 'max game', Math.max(0, ...sub.map((x) => x.g)));
}
console.log('streaks with a recovered (cap) event', all.filter((x) => x.log.some((l: string) => /recovered reason=[12]/.test(l))).length);
const sum = all.reduce((o, x) => { o.w += x.w; o.hs += x.hs; o.g += x.g; return o; }, { w: 0, hs: 0, g: 0 });
console.log('mean wall', sum.w / all.length, 'mean game', sum.g / all.length, 'mean hitstop', sum.hs / all.length);
const kinds: Record<string, number> = {};
for (const x of all) for (const l of x.log) { const m = /(hit ab=\S+|snag reason=\d|recovered reason=\d|ccStarted|ccEnded|ccResisted)/.exec(l); if (m) kinds[m[1]!] = (kinds[m[1]!] ?? 0) + 1; }
console.log(JSON.stringify(kinds));
for (const x of all.slice(0, topN)) { console.log(`\n== ${x.match} id${x.id} ${x.race} wall=${x.w} game=${x.g} hitstop=${x.hs}`); for (const l of x.log.slice(0, 70)) console.log('  ' + l); }
