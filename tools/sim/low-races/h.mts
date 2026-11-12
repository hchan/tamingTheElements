// usage: tsx h.mts A B seeds [flags: void,flat,pA=0..2,pB=0..2,level=N]
const R = process.cwd() + '/';
const rm = await import(R + 'tools/sim/run-match.ts');
const { collectCommands } = await import(R + 'src/core/agents/agent.ts');
const { characterId } = await import(R + 'src/core/data/ids.ts');
const { CHARACTERS } = await import(R + 'src/core/data/characters.ts');
const { DEFAULT_SIM_FLAGS } = await import(R + 'src/core/flags.ts');
const { SIM_VERSION } = await import(R + 'src/core/index.ts');
const { createMatch } = await import(R + 'src/core/sim/match.ts');
const { step } = await import(R + 'src/core/sim/step.ts');
const { SimEventKind: K } = await import(R + 'src/core/sim/events.ts');
const { ARCADE_RACE_NUMBERS } = await import(R + 'src/core/sim/arcade-numbers.ts');
const hit = await import(R + 'src/core/sim/systems/arcade/hit.ts');
const { ABILITY_DEFS } = await import(R + 'src/core/sim/systems/projectile.ts');
const by: Record<string, number> = {};
const cnt: Record<string, number> = {};
const [A, B, seedsS, ...fl] = process.argv.slice(2);
const seeds = Number(seedsS);
const flag = (n: string) => fl.find((f) => f.startsWith(n + '='))?.split('=')[1];
const origEl = new Map<any, string>();
const level = Number(flag('level') ?? 3);
const pA = flag('pA') === undefined ? undefined : Number(flag('pA'));
const pB = flag('pB') === undefined ? undefined : Number(flag('pB'));
if (fl.includes('flat')) for (const k of Object.keys(ARCADE_RACE_NUMBERS)) (ARCADE_RACE_NUMBERS as any)[k] = [4000, 1000];
let w = 0, d = 0, ticks = 0, firstA = 0, firstN = 0, dealA = 0, dealB = 0, dashA = 0, dashB = 0, fhA = 0, fhB = 0;
for (let k = 0; k < seeds; k++) {
  const aT0 = k % 2 === 0; const xp = rm.xpForLevel(1);
  const ra = [{ character: characterId(A), xp }], rb = [{ character: characterId(B), xp }];
  const world = createMatch({ simVersion: SIM_VERSION, seed: rm.matchSeed(1, k), flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1, p1: aT0 ? ra : rb, p2: aT0 ? rb : ra });
  const s = world.state;
  const agA = new rm.ScriptedAI(A, 'a', B, level, pA), agB = new rm.ScriptedAI(B, 'b', A, level, pB);
  if (fl.includes('void')) for (const c of CHARACTERS as any[]) if (c.id === A || c.id === B) { origEl.set(c, c.element); c.element = 'void'; }
  const agents = (aT0 ? [agA, agB] : [agB, agA]) as any;
  const myTeam = aT0 ? 0 : 1;
  let t = 0, winner = -2, first = false, fight = -1, lastCh = 0, hp = -1;
  while (t < 18000 && winner === -2) {
    const ev = step(world, collectCommands(world, agents)); t++;
    for (const e of ev) {
      if (e.kind === K.fight) { fight = t; first = false; }
      else if (e.kind === K.hitConfirmed) {
        const vt = s.team[e['target'] ?? 0] ?? 0; const amt = e['amount'] ?? 0;
        if (vt === myTeam) dealB += amt; else dealA += amt;
        { const i = e['ability']!; const nm = i === hit.SUPER_DEF ? 'super' : i === hit.CHARGE_DEF ? 'charge' : i >= hit.TRAP_BOMB_DEF ? 'trap' : (ABILITY_DEFS[i]?.id ?? '?'); const key = (vt === myTeam ? B : A) + ':' + nm; by[key] = (by[key] ?? 0) + amt; cnt[key] = (cnt[key] ?? 0) + 1; }
        if (!first && fight >= 0) { first = true; firstN++; if (vt !== myTeam) { firstA++; fhA += (t - fight) / 50; } else fhB += (t - fight) / 50; }
      } else if (e.kind === K.dashed) { if ((s.team[e.sourceId] ?? 0) === myTeam) dashA++; else dashB++; }
      else if (e.kind === K.clash) { cnt['clash'] = (cnt['clash'] ?? 0) + 1; }
      else if (e.kind === K.guarded) { const k2 = 'guardedOn:' + ((s.team[e['target'] ?? 0] ?? 0) === myTeam ? A : B); cnt[k2] = (cnt[k2] ?? 0) + 1; }
      else if (e.kind === K.parried) { cnt['parried'] = (cnt['parried'] ?? 0) + 1; }
      else if (e.kind === K.matchEnded) winner = e['winner'] ?? -1;
    }
    let tot = 0; for (let id = 0; id < 64; id++) if (s.kind[id] === 0) tot += Math.max(0, s.hp[id] ?? 0);
    if (tot !== hp) { hp = tot; lastCh = t; } if (t - lastCh > 1500) winner = -3;
  }
  ticks += t; if (winner === myTeam) w++; else if (winner < 0) d++;
  for (const [c, o] of origEl) c.element = o; origEl.clear();
}
const f = (x: number, n = 1) => (x / n).toFixed(1);
console.log(`${A} vs ${B} [${fl.join(' ')}] win ${f(100 * w, seeds)}% draws ${d} firstHitA ${firstA}/${firstN} dealA ${f(dealA, seeds)} dealB ${f(dealB, seeds)} dashA ${f(dashA, seeds)} dashB ${f(dashB, seeds)} secs ${f(ticks, seeds * 50)}`);

if (fl.includes('detail')) console.log(JSON.stringify({ dmgPerMatch: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, +(v / seeds).toFixed(0)])), hitsPerMatch: Object.fromEntries(Object.entries(cnt).map(([k, v]) => [k, +(v / seeds).toFixed(1)])) }));
