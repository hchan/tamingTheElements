// usage: tsx h2.mts RACE seeds [vs=OPP] [flags]  -- profile one race against all others (or one): dash reasons, first-hit time, casts
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
const { Cmd } = await import(R + 'src/core/sim/commands.ts');
const { ArcadeTactics } = await import(R + 'src/core/agents/scripted-ai/arcade.ts');
const ai = await import(R + 'src/core/agents/scripted-ai/arcade-ai.ts');
const [ME, seedsS, ...fl] = process.argv.slice(2);
const seeds = Number(seedsS);
const vs = fl.find((f) => f.startsWith('vs='))?.split('=')[1];
const level = Number(fl.find((f) => f.startsWith('level='))?.split('=')[1] ?? 3);
const forced = fl.find((f) => f.startsWith('p='))?.split('=')[1];
// classify dashes the tactics layer adds
const cat: Record<string, number> = {};
let curOwner = '';
const proto: any = ArcadeTactics.prototype;
const origDecide = proto.decide, origAvoid = proto.avoidTraps;
proto.decide = function (view: any, a: any, base: number, shot: number) {
  const out = origDecide.call(this, view, a, base, shot);
  if (this.__me && (out & Cmd.dash) && !(base & Cmd.dash)) {
    const th = view.self && ai.soonestShot(view.self, a.shots, 40);
    const far = Math.abs(view.opponent.x - view.self.x) + Math.abs(view.opponent.y - view.self.y);
    const k = th ? 'dodge' : (this.mem[6] === 0 || this.mem[6] === ai.RUSHDOWN) && far > 360 ? 'rush(style0)' : 'other';
    cat[k] = (cat[k] ?? 0) + 1;
  }
  return out;
};
proto.avoidTraps = function (view: any, a: any, cmd: number) {
  const out = origAvoid.call(this, view, a, cmd);
  if (this.__me && (out & Cmd.dash) && !(cmd & Cmd.dash)) cat['trapAvoid'] = (cat['trapAvoid'] ?? 0) + 1;
  return out;
};
const opps = (rm.RACES as string[]).filter((r) => r !== ME && (vs === undefined || r === vs));
let games = 0, wins = 0, rounds = 0, firstOwn = 0, ftSum = 0, ftN = 0, ftFoeSum = 0, ftFoeN = 0, dashes = 0, shots = [0, 0], firstShot: number[] = [], firstCast: number[] = [];
const perOpp: string[] = [];
for (const o of opps) {
  let w = 0, g = 0, rd = 0, fo = 0, ds = 0;
  for (let k = 0; k < seeds; k++) {
    const meT0 = k % 2 === 0; const xp = rm.xpForLevel(1);
    const rme = [{ character: characterId(ME), xp }], rmo = [{ character: characterId(o), xp }];
    const world = createMatch({ simVersion: SIM_VERSION, seed: rm.matchSeed(1, k), flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1, p1: meT0 ? rme : rmo, p2: meT0 ? rmo : rme });
    const s = world.state;
    const aMe = new rm.ScriptedAI(ME, 'a', o, level, forced === undefined ? undefined : Number(forced));
    const aOp = new rm.ScriptedAI(o, 'b', ME, level);
    (aMe as any).arcade.__me = true;
    const agents = (meT0 ? [aMe, aOp] : [aOp, aMe]) as any;
    const myTeam = meT0 ? 0 : 1;
    const myId = [...Array(64).keys()].find((id) => s.kind[id] === 0 && s.team[id] === myTeam)!;
    const last = [0, 0];
    let t = 0, winner = -2, fight = -1, first = false, hp = -1, lastCh = 0, fcast = -1, fshot = -1;
    while (t < 18000 && winner === -2) {
      const ev = step(world, collectCommands(world, agents)); t++;
      for (const e of ev) {
        if (e.kind === K.fight) { fight = t; first = false; rd++; fcast = -1; }
        else if (e.kind === K.hitConfirmed) {
          const vt = s.team[e['target'] ?? 0] ?? 0;
          if (!first && fight >= 0) { first = true; if (vt !== myTeam) { fo++; ftSum += (t - fight) / 50; ftN++; } else { ftFoeSum += (t - fight) / 50; ftFoeN++; } }
        } else if (e.kind === K.dashed && (s.team[e.sourceId] ?? 0) === myTeam) ds++;
        else if (e.kind === K.matchEnded) winner = e['winner'] ?? -1;
      }
      for (const sl of [0, 1]) {
        const c = s.abil[cooldownIdx(myId, sl)] ?? 0;
        if (c > (last[sl] ?? 0) && c > t) { shots[sl] = (shots[sl] ?? 0) + 1; if (fight >= 0 && fcast < 0) { fcast = t - fight; firstCast.push(fcast / 50); } }
        last[sl] = c;
      }
      let tot = 0; for (let id = 0; id < 64; id++) if (s.kind[id] === 0) tot += Math.max(0, s.hp[id] ?? 0);
      if (tot !== hp) { hp = tot; lastCh = t; } if (t - lastCh > 1500) winner = -3;
    }
    g++; if (winner === myTeam) w++;
  }
  games += g; wins += w; rounds += rd; firstOwn += fo; dashes += ds;
  perOpp.push(`${o}:${(100 * w / g).toFixed(0)}%/d${(ds / g).toFixed(1)}/fh${fo}of${rd}`);
}
const m = firstCast.length ? (firstCast.reduce((a, b) => a + b, 0) / firstCast.length).toFixed(2) : 'na';
console.log(`${ME} lvl${level} p=${forced ?? 'drawn'}: win ${(100 * wins / games).toFixed(1)}% first-hit ${firstOwn}/${rounds} (own ${(ftSum / Math.max(1, ftN)).toFixed(1)}s, foe ${(ftFoeSum / Math.max(1, ftFoeN)).toFixed(1)}s) dashes/match ${(dashes / games).toFixed(1)} casts/match slot0 ${(shots[0]! / games).toFixed(1)} slot1 ${(shots[1]! / games).toFixed(1)} firstCast ${m}s`);
console.log('  tactics dashes/match', Object.fromEntries(Object.entries(cat).map(([k, v]) => [k, +(v / games).toFixed(1)])));
console.log('  ' + perOpp.join(' '));
